import { Router, type IRouter } from "express";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { appSettingsTable, db, perfilesTable, sectorsTable, userModulesTable, userSectorsTable, usersTable } from "@salvador/db";
import { CreateUserBody, ResetUserPasswordBody, ResetUserPasswordResponse, UpdateUserBody } from "@salvador/api-zod";
import {
  ALCANCES,
  PERMISSION_MODULES,
  buildPermissions,
  buildScopes,
  efectivos,
  isSectorModule,
  leerPerfil,
  normalizeScope,
  type Alcance,
  type ModuleScope,
  type PerfilDef,
  allPermissions,
  hashPassword,
  normalizeLevel,
  requireAuth,
  requireSuperadmin,
  revokeUserSessions,
  type Level,
} from "../lib/auth";

const router: IRouter = Router();

// Acotado a /users: un router.use sin ruta afectaría a todos los módulos montados después.
router.use("/users", requireAuth, requireSuperadmin);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Rol guardado: "superadmin" o "usuario" (los niveles por módulo definen lo demás). */
function normalizeRole(value: unknown): "superadmin" | "usuario" {
  return value === "superadmin" ? "superadmin" : "usuario";
}

/**
 * Permisos pedidos → mapa válido. Acepta `permissions: { modulo: nivel }` o, por compatibilidad,
 * `modules: [..]` (nivel Ver). Módulos o niveles desconocidos se descartan.
 */
function parsePermissions(body: Record<string, unknown>): Record<string, Level> | undefined {
  const out: Record<string, Level> = {};
  if (body.permissions && typeof body.permissions === "object") {
    for (const [mod, lvl] of Object.entries(body.permissions as Record<string, unknown>)) {
      const level = normalizeLevel(mod, lvl);
      if (level) out[mod] = level;
    }
    return out;
  }
  if (Array.isArray(body.modules)) {
    for (const mod of body.modules) if (PERMISSION_MODULES[String(mod)]) out[String(mod)] = "ver";
    return out;
  }
  return undefined;
}

async function validSectorIds(ids: unknown): Promise<number[]> {
  if (!Array.isArray(ids)) return [];
  const clean = [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!clean.length) return [];
  const found = await db.select({ id: sectorsTable.id }).from(sectorsTable).where(inArray(sectorsTable.id, clean));
  const ok = new Set(found.map((s) => s.id));
  return clean.filter((id) => ok.has(id));
}

/**
 * Alcance por módulo pedido → mapa válido (solo módulos con sectores y sectores que existen).
 * Acepta `scopes: { modulo: { alcance, sectorIds } }` o, por compatibilidad, `sectorIds: [..]`
 * (lo de antes: ve todo y carga en esos sectores, en cada módulo con sectores).
 */
async function parseScopes(body: Record<string, unknown>, permissions: Record<string, Level>): Promise<Record<string, ModuleScope> | undefined> {
  const out: Record<string, ModuleScope> = {};
  if (body.scopes && typeof body.scopes === "object") {
    for (const [mod, raw] of Object.entries(body.scopes as Record<string, { alcance?: unknown; sectorIds?: unknown }>)) {
      if (!permissions[mod] || !isSectorModule(mod)) continue;
      const sc = normalizeScope(mod, raw?.alcance, await validSectorIds(raw?.sectorIds));
      if (sc.alcance !== "todos") out[mod] = sc;
    }
    return out;
  }
  if (Array.isArray(body.sectorIds)) {
    const ids = await validSectorIds(body.sectorIds);
    for (const mod of Object.keys(permissions)) {
      const sc = normalizeScope(mod, "carga", ids);
      if (sc.alcance !== "todos") out[mod] = sc;
    }
    return out;
  }
  return undefined;
}

/**
 * Filas de user_modules para los permisos pedidos. Sin perfil: una fila por módulo (permisos a medida).
 * Con perfil: solo lo propio de la persona — sus sectores ("perfil") y sus excepciones (otro nivel,
 * otro alcance o "ninguno"). Así, si el perfil cambia, la persona lo hereda.
 */
function filasDe(perfil: PerfilDef | null, permissions: Record<string, Level>, scopes: Record<string, ModuleScope>) {
  const filas: { moduleKey: string; level: string; alcance: string; sectorIds: number[] }[] = [];
  if (!perfil) {
    for (const [moduleKey, level] of Object.entries(permissions)) {
      const sc = scopes[moduleKey] ?? { alcance: "todos", sectorIds: [] };
      filas.push({ moduleKey, level, alcance: sc.alcance, sectorIds: sc.sectorIds });
    }
    return filas;
  }
  const base = efectivos("usuario", perfil, []);
  const mods = new Set([...Object.keys(base.permissions), ...Object.keys(permissions)]);
  for (const moduleKey of mods) {
    const quiere = permissions[moduleKey];
    const sc = scopes[moduleKey] ?? { alcance: "todos" as Alcance, sectorIds: [] };
    const alcPerfil = isSectorModule(moduleKey) ? ((perfil.alcances?.[moduleKey] as Alcance) ?? "todos") : "todos";
    if (!quiere) {
      filas.push({ moduleKey, level: "ninguno", alcance: "todos", sectorIds: [] });
    } else if (quiere !== base.permissions[moduleKey] || (isSectorModule(moduleKey) && sc.alcance !== alcPerfil)) {
      filas.push({ moduleKey, level: quiere, alcance: sc.alcance, sectorIds: sc.sectorIds });
    } else if (sc.sectorIds.length) {
      filas.push({ moduleKey, level: "perfil", alcance: sc.alcance, sectorIds: sc.sectorIds });
    }
  }
  return filas;
}

async function savePermissions(tx: Tx, userId: number, permissions: Record<string, Level>, scopes: Record<string, ModuleScope>, perfil: PerfilDef | null = null) {
  await tx.delete(userModulesTable).where(eq(userModulesTable.userId, userId));
  const rows = filasDe(perfil, permissions, scopes).map((f) => ({ userId, ...f }));
  if (rows.length) await tx.insert(userModulesTable).values(rows);
  // Tabla vieja: queda con todos los sectores a cargo (solo como referencia).
  const all = [...new Set(Object.values(scopes).flatMap((sc) => sc.sectorIds))];
  await tx.delete(userSectorsTable).where(eq(userSectorsTable.userId, userId));
  if (all.length) await tx.insert(userSectorsTable).values(all.map((sectorId) => ({ userId, sectorId })));
}

async function serializeUsers(ids?: number[]) {
  const users = await db
    .select()
    .from(usersTable)
    .where(ids ? inArray(usersTable.id, ids) : undefined)
    .orderBy(asc(usersTable.name));
  if (!users.length) return [];
  const userIds = users.map((u) => u.id);
  const [mods, perfiles] = await Promise.all([
    db.select().from(userModulesTable).where(inArray(userModulesTable.userId, userIds)),
    db.select().from(perfilesTable),
  ]);
  const perfilPorId = new Map(perfiles.map((p) => [p.id, { id: p.id, nombre: p.nombre, permisos: p.permisos ?? {}, alcances: p.alcances ?? {} } as PerfilDef]));
  return users.map((u) => {
    const propios = mods.filter((m) => m.userId === u.id);
    const perfil = u.role === "superadmin" ? null : (perfilPorId.get(u.perfilId ?? -1) ?? null);
    const { permissions, scopes, excepciones } = efectivos(u.role, perfil, propios);
    return {
      id: u.id,
      username: u.username,
      name: u.name,
      email: u.email,
      role: normalizeRole(u.role),
      legacyRole: u.role === "superadmin" || u.role === "usuario" ? null : u.role,
      active: u.active,
      mustChangePassword: u.mustChangePassword,
      permissions,
      modules: Object.keys(permissions),
      scopes,
      perfilId: perfil?.id ?? null,
      perfilNombre: perfil?.nombre ?? null,
      excepciones,
      sectorIds: [...new Set(Object.values(scopes).flatMap((sc) => sc.sectorIds))].sort((a, b) => a - b),
      createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt,
      lastLoginAt: u.lastLoginAt instanceof Date ? u.lastLoginAt.toISOString() : u.lastLoginAt,
    };
  });
}

/** ¿Quedaría el sistema sin ningún superadmin activo si este usuario deja de serlo? */
async function isLastSuperadmin(userId: number): Promise<boolean> {
  const others = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.role, "superadmin"), eq(usersTable.active, true), ne(usersTable.id, userId)))
    .limit(1);
  return others.length === 0;
}

function cleanUsername(v: string) {
  return v.trim().toLowerCase().replace(/\s+/g, "");
}

// ---------- catálogo de módulos y niveles (para la pantalla) ----------

router.get("/users/modulos", (_req, res): void => {
  res.json(Object.entries(PERMISSION_MODULES).map(([key, levels]) => ({ key, levels })));
});

// ---------- perfiles (ej. "Encargado de sector") ----------
// Definen módulos, nivel y tipo de alcance. Las personas vinculadas heredan los cambios; los sectores
// concretos y las excepciones se guardan en cada persona.

function leerDefPerfil(body: Record<string, unknown>): { ok: true; nombre: string; descripcion: string; permisos: Record<string, Level>; alcances: Record<string, Alcance> } | { ok: false; message: string } {
  const nombre = String(body.nombre ?? "").replace(/\s+/g, " ").trim();
  if (nombre.length < 2 || nombre.length > 60) return { ok: false, message: "El nombre del perfil tiene que tener entre 2 y 60 caracteres." };
  const descripcion = String(body.descripcion ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  const permisos = parsePermissions({ permissions: body.permisos ?? {} }) ?? {};
  const alcances: Record<string, Alcance> = {};
  for (const [mod, a] of Object.entries((body.alcances ?? {}) as Record<string, unknown>)) {
    if (permisos[mod] && isSectorModule(mod) && (ALCANCES as readonly string[]).includes(String(a)) && a !== "todos") alcances[mod] = a as Alcance;
  }
  return { ok: true, nombre, descripcion, permisos, alcances };
}

async function nombrePerfilOcupado(nombre: string, exceptoId?: number) {
  const [row] = await db
    .select({ id: perfilesTable.id })
    .from(perfilesTable)
    .where(and(sql`lower(${perfilesTable.nombre}) = lower(${nombre})`, exceptoId ? ne(perfilesTable.id, exceptoId) : sql`true`))
    .limit(1);
  return Boolean(row);
}

async function listarPerfiles() {
  const [rows, usos, sinSectores] = await Promise.all([
    db.select().from(perfilesTable).orderBy(asc(perfilesTable.nombre)),
    db.select({ perfilId: usersTable.perfilId, n: sql<number>`count(*)::int` }).from(usersTable).where(sql`${usersTable.perfilId} is not null`).groupBy(usersTable.perfilId),
    serializeUsers(),
  ]);
  const n = new Map(usos.map((u) => [u.perfilId, Number(u.n)]));
  return rows.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    permisos: p.permisos ?? {},
    alcances: p.alcances ?? {},
    usuarios: n.get(p.id) ?? 0,
    // Personas vinculadas que, por el alcance del perfil, necesitan sectores y no tienen ninguno elegido.
    sinSectores: sinSectores
      .filter((u) => u.perfilId === p.id && Object.values(u.scopes).some((sc) => sc.alcance !== "todos" && sc.sectorIds.length === 0))
      .map((u) => u.name),
  }));
}

router.get("/users/perfiles", async (_req, res): Promise<void> => {
  try {
    res.json(await listarPerfiles());
  } catch (err) {
    console.error("[users.perfiles]", err);
    res.status(500).json({ message: "No se pudieron leer los perfiles." });
  }
});

router.post("/users/perfiles", async (req, res): Promise<void> => {
  try {
    const v = leerDefPerfil(req.body ?? {});
    if (!v.ok) {
      res.status(400).json({ message: v.message });
      return;
    }
    if (await nombrePerfilOcupado(v.nombre)) {
      res.status(409).json({ message: `Ya existe el perfil "${v.nombre}".` });
      return;
    }
    const [row] = await db.insert(perfilesTable).values({ nombre: v.nombre, descripcion: v.descripcion, permisos: v.permisos, alcances: v.alcances }).returning();
    res.status(201).json((await listarPerfiles()).find((p) => p.id === row.id));
  } catch (err) {
    console.error("[users.perfiles.post]", err);
    res.status(500).json({ message: "No se pudo crear el perfil." });
  }
});

router.patch("/users/perfiles/:id", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const actual = await leerPerfil(id);
    if (!actual) {
      res.status(404).json({ message: "Perfil no encontrado." });
      return;
    }
    const v = leerDefPerfil({ nombre: actual.nombre, permisos: actual.permisos, alcances: actual.alcances, ...(req.body ?? {}) });
    if (!v.ok) {
      res.status(400).json({ message: v.message });
      return;
    }
    if (await nombrePerfilOcupado(v.nombre, id)) {
      res.status(409).json({ message: `Ya existe el perfil "${v.nombre}".` });
      return;
    }
    await db.update(perfilesTable).set({ nombre: v.nombre, descripcion: v.descripcion, permisos: v.permisos, alcances: v.alcances, updatedAt: new Date() }).where(eq(perfilesTable.id, id));
    res.json((await listarPerfiles()).find((p) => p.id === id));
  } catch (err) {
    console.error("[users.perfiles.patch]", err);
    res.status(500).json({ message: "No se pudo guardar el perfil." });
  }
});

/** Al borrar un perfil, cada persona vinculada conserva los permisos que tenía (pasan a ser a medida). */
router.delete("/users/perfiles/:id", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const perfil = await leerPerfil(id);
    if (!perfil) {
      res.status(404).json({ message: "Perfil no encontrado." });
      return;
    }
    const vinculados = (await serializeUsers()).filter((u) => u.perfilId === id);
    await db.transaction(async (tx) => {
      for (const u of vinculados) {
        await tx.update(usersTable).set({ perfilId: null }).where(eq(usersTable.id, u.id));
        await savePermissions(tx, u.id, u.permissions, u.scopes, null);
      }
      await tx.delete(perfilesTable).where(eq(perfilesTable.id, id));
    });
    res.json({ ok: true, usuarios: vinculados.length });
  } catch (err) {
    console.error("[users.perfiles.delete]", err);
    res.status(500).json({ message: "No se pudo eliminar el perfil." });
  }
});

/**
 * Permisos finales de un alta / cambio con perfil: lo pedido (o, si no se manda, lo del perfil),
 * con los sectores de cada módulo. Con perfil, un alcance por sector sin sectores es un error.
 */
async function resolverConPerfil(
  body: Record<string, unknown>,
  perfil: PerfilDef,
  sectoresActuales: Record<string, number[]>,
): Promise<{ ok: true; permissions: Record<string, Level>; scopes: Record<string, ModuleScope> } | { ok: false; message: string }> {
  const permissions = parsePermissions(body) ?? efectivos("usuario", perfil, []).permissions;
  const scopes: Record<string, ModuleScope> = {};
  const pedidos = (body.scopes && typeof body.scopes === "object" ? body.scopes : {}) as Record<string, { alcance?: unknown; sectorIds?: unknown }>;
  for (const mod of Object.keys(permissions)) {
    if (!isSectorModule(mod)) continue;
    const raw = pedidos[mod];
    const alcance = (raw && (ALCANCES as readonly string[]).includes(String(raw.alcance)) ? String(raw.alcance) : (perfil.alcances?.[mod] ?? "todos")) as Alcance;
    if (alcance === "todos") continue;
    const sectorIds = raw ? await validSectorIds(raw.sectorIds) : (sectoresActuales[mod] ?? []);
    if (!sectorIds.length) {
      const nombre = { guardias: "Guardias Médicas", inventario: "Inventario", instructivos: "Instructivos" }[mod] ?? mod;
      return { ok: false, message: `${nombre}: el perfil "${perfil.nombre}" trabaja por sector — elegí al menos un sector para esta persona.` };
    }
    scopes[mod] = { alcance, sectorIds };
  }
  return { ok: true, permissions, scopes };
}

async function perfilPedido(body: Record<string, unknown>): Promise<{ ok: true; perfil: PerfilDef | null | undefined } | { ok: false; message: string }> {
  if (body.perfilId === undefined) return { ok: true, perfil: undefined };
  if (body.perfilId === null || body.perfilId === "") return { ok: true, perfil: null };
  const perfil = await leerPerfil(Number(body.perfilId));
  return perfil ? { ok: true, perfil } : { ok: false, message: "El perfil elegido no existe." };
}

// ---------- plantillas de permisos (reemplazadas por los perfiles; se mantiene la lectura) ----------
// Se guardan en app_settings["plantillas_permisos"]: [{ nombre, permissions, scopes }].

type Plantilla = { nombre: string; permissions: Record<string, Level>; scopes: Record<string, ModuleScope>; sectorIds?: number[] };
const PLANTILLAS_KEY = "plantillas_permisos";

async function leerPlantillas(): Promise<Plantilla[]> {
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, PLANTILLAS_KEY)).limit(1);
  return Array.isArray(row?.value) ? (row!.value as Plantilla[]) : [];
}

router.get("/users/plantillas", async (_req, res): Promise<void> => {
  try {
    res.json(await leerPlantillas());
  } catch (err) {
    console.error("[users.plantillas]", err);
    res.json([]);
  }
});

/** Reemplaza la lista completa (alta, cambio y baja se hacen desde la pantalla). */
router.put("/users/plantillas", async (req, res): Promise<void> => {
  if (!Array.isArray(req.body)) {
    res.status(400).json({ message: "Formato inválido." });
    return;
  }
  const vistas = new Set<string>();
  const limpias: Plantilla[] = [];
  for (const raw of req.body.slice(0, 50) as Record<string, unknown>[]) {
    const nombre = String(raw?.nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (!nombre || vistas.has(nombre.toLowerCase())) continue;
    vistas.add(nombre.toLowerCase());
    const permissions = parsePermissions({ permissions: raw?.permissions ?? {} }) ?? {};
    limpias.push({ nombre, permissions, scopes: (await parseScopes(raw ?? {}, permissions)) ?? {} });
  }
  try {
    await db
      .insert(appSettingsTable)
      .values({ key: PLANTILLAS_KEY, value: limpias })
      .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: limpias, updatedAt: new Date() } });
    res.json(limpias);
  } catch (err) {
    console.error("[users.plantillas.put]", err);
    res.status(500).json({ message: "No se pudieron guardar las plantillas." });
  }
});

router.get("/users", async (_req, res): Promise<void> => {
  try {
    res.json(await serializeUsers());
  } catch (err) {
    console.error("[users.list]", err);
    res.status(500).json({ message: "No se pudo listar usuarios." });
  }
});

router.post("/users", async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse({ role: "usuario", ...(req.body ?? {}) });
  if (!parsed.success) {
    res.status(400).json({ message: "Revisá los datos (nombre, usuario y contraseña de al menos 6 caracteres)." });
    return;
  }
  const data = parsed.data;
  const username = cleanUsername(data.username);
  const name = data.name.trim();
  if (username.length < 2 || !/^[a-z0-9._-]+$/.test(username)) {
    res.status(400).json({ message: "El usuario debe tener al menos 2 caracteres (letras, números, punto, guion)." });
    return;
  }
  if (!name) {
    res.status(400).json({ message: "El nombre es obligatorio." });
    return;
  }
  try {
    const [dup] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, username)).limit(1);
    if (dup) {
      res.status(409).json({ message: `El usuario "${username}" ya existe. Elegí otro.` });
      return;
    }
    const role = normalizeRole(data.role);
    const pp = await perfilPedido(req.body ?? {});
    if (!pp.ok) {
      res.status(400).json({ message: pp.message });
      return;
    }
    const perfil = role === "superadmin" ? null : (pp.perfil ?? null);
    let permissions: Record<string, Level> = {};
    let scopes: Record<string, ModuleScope> = {};
    if (perfil) {
      const r = await resolverConPerfil(req.body ?? {}, perfil, {});
      if (!r.ok) {
        res.status(400).json({ message: r.message });
        return;
      }
      ({ permissions, scopes } = r);
    } else if (role !== "superadmin") {
      permissions = parsePermissions(req.body ?? {}) ?? { dashboard: "ver" as Level };
      scopes = (await parseScopes(req.body ?? {}, permissions)) ?? {};
    }
    const passwordHash = await hashPassword(data.password);

    const id = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(usersTable)
        .values({ username, name, email: data.email?.trim() || null, passwordHash, role, active: data.active ?? true, mustChangePassword: true, perfilId: perfil?.id ?? null })
        .returning({ id: usersTable.id });
      await savePermissions(tx, created.id, permissions, scopes, perfil);
      return created.id;
    });
    const [out] = await serializeUsers([id]);
    res.status(201).json(out);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[users.create]", err);
    if (/unique|duplicate/i.test(msg)) {
      res.status(409).json({ message: "El usuario o el email ya existen." });
      return;
    }
    res.status(500).json({ message: "No se pudo crear el usuario." });
  }
});

router.patch("/users/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = UpdateUserBody.safeParse(req.body ?? {});
  if (!Number.isInteger(id) || !parsed.success) {
    res.status(400).json({ message: "Revisá los datos del usuario." });
    return;
  }
  const data = parsed.data;
  const self = id === req.authUser!.id;
  try {
    const [current] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    if (!current) {
      res.status(404).json({ message: "Usuario no encontrado." });
      return;
    }
    const nextRole = data.role !== undefined ? normalizeRole(data.role) : current.role === "superadmin" ? "superadmin" : normalizeRole(current.role);
    const nextActive = data.active ?? current.active;
    if (self && data.active === false) {
      res.status(400).json({ message: "No podés desactivar tu propio usuario." });
      return;
    }
    if (self && current.role === "superadmin" && nextRole !== "superadmin") {
      res.status(400).json({ message: "No podés quitarte a vos mismo el rol de superadmin." });
      return;
    }
    if (current.role === "superadmin" && current.active && (nextRole !== "superadmin" || !nextActive) && (await isLastSuperadmin(id))) {
      res.status(400).json({ message: "Es el único superadmin activo: creá o activá otro antes de cambiarlo." });
      return;
    }
    let username: string | undefined;
    if (data.username) {
      username = cleanUsername(data.username);
      if (username.length < 2 || !/^[a-z0-9._-]+$/.test(username)) {
        res.status(400).json({ message: "Usuario inválido (letras, números, punto, guion)." });
        return;
      }
      const [dup] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(and(eq(usersTable.username, username), ne(usersTable.id, id)))
        .limit(1);
      if (dup) {
        res.status(409).json({ message: `El usuario "${username}" ya existe.` });
        return;
      }
    }
    const pp = await perfilPedido(req.body ?? {});
    if (!pp.ok) {
      res.status(400).json({ message: pp.message });
      return;
    }
    const filas = await db.select().from(userModulesTable).where(eq(userModulesTable.userId, id));
    const perfilActual = current.role === "superadmin" ? null : await leerPerfil(current.perfilId);
    const actuales = efectivos(current.role, perfilActual, filas);
    const perfil = nextRole === "superadmin" ? null : pp.perfil === undefined ? perfilActual : pp.perfil;
    const cambiaPerfil = (perfil?.id ?? null) !== (perfilActual?.id ?? null);
    const tocaPermisos = req.body?.permissions !== undefined || req.body?.modules !== undefined || req.body?.scopes !== undefined || req.body?.sectorIds !== undefined;
    let permissions: Record<string, Level> | undefined;
    let scopes: Record<string, ModuleScope> | undefined;
    if (nextRole === "superadmin") {
      if (current.role !== "superadmin") ({ permissions, scopes } = { permissions: {}, scopes: {} });
    } else if (perfil && (tocaPermisos || cambiaPerfil)) {
      const sectoresActuales = Object.fromEntries(filas.map((f) => [f.moduleKey, f.sectorIds ?? []]));
      const r = await resolverConPerfil(req.body ?? {}, perfil, sectoresActuales);
      if (!r.ok) {
        res.status(400).json({ message: r.message });
        return;
      }
      ({ permissions, scopes } = r);
    } else if (!perfil && (tocaPermisos || cambiaPerfil || (current.role !== nextRole && nextRole === "usuario"))) {
      // Sin perfil: lo pedido o, si no se manda, lo que ya tenía (un "responsable" viejo que pasa a "usuario" fija sus permisos).
      permissions = parsePermissions(req.body ?? {}) ?? actuales.permissions;
      scopes = (await parseScopes(req.body ?? {}, permissions)) ?? Object.fromEntries(Object.entries(actuales.scopes).filter(([k]) => permissions![k]));
    }

    await db.transaction(async (tx) => {
      await tx
        .update(usersTable)
        .set({
          ...(username ? { username } : {}),
          ...(data.name ? { name: data.name.trim() } : {}),
          ...(data.email !== undefined ? { email: data.email?.trim() || null } : {}),
          role: nextRole,
          active: nextActive,
          perfilId: perfil?.id ?? null,
        })
        .where(eq(usersTable.id, id));
      if (permissions && scopes) await savePermissions(tx, id, permissions, scopes, perfil ?? null);
    });
    // Cambios de permisos o desactivación: cerrar sus sesiones para que tomen efecto ya.
    if (!nextActive) await revokeUserSessions(id);
    const [out] = await serializeUsers([id]);
    res.json(out);
  } catch (err) {
    console.error("[users.update]", err);
    res.status(500).json({ message: "No se pudo guardar el usuario." });
  }
});

router.post("/users/:id/reset-password", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = ResetUserPasswordBody.safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success) {
    res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres." });
    return;
  }
  const [updated] = await db
    .update(usersTable)
    .set({ passwordHash: await hashPassword(parsed.data.password), mustChangePassword: true })
    .where(eq(usersTable.id, id))
    .returning({ id: usersTable.id });
  if (!updated) {
    res.status(404).json({ message: "Usuario no encontrado." });
    return;
  }
  await revokeUserSessions(id);
  res.json(ResetUserPasswordResponse.parse({ ok: true }));
});

router.delete("/users/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ message: "ID inválido." });
    return;
  }
  if (id === req.authUser!.id) {
    res.status(400).json({ message: "No podés eliminar tu propio usuario." });
    return;
  }
  try {
    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    if (!target) {
      res.status(404).json({ message: "Usuario no encontrado." });
      return;
    }
    if (target.role === "superadmin" && target.active && (await isLastSuperadmin(id))) {
      res.status(400).json({ message: "No se puede eliminar el único superadmin activo." });
      return;
    }
    await db.delete(usersTable).where(eq(usersTable.id, id));
    res.sendStatus(204);
  } catch (err) {
    // Tiene registros cargados (guardias, vencimientos…): conviene desactivarlo para conservar el historial.
    const code = (err as { code?: string; cause?: { code?: string } })?.cause?.code ?? (err as { code?: string })?.code;
    if (code === "23503") {
      res.status(409).json({ message: "El usuario tiene registros cargados. Desactivalo en lugar de eliminarlo." });
      return;
    }
    console.error("[users.delete]", err);
    res.status(500).json({ message: "No se pudo eliminar el usuario." });
  }
});

export default router;
