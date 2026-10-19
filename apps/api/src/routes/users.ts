import { Router, type IRouter } from "express";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { appSettingsTable, db, sectorsTable, userModulesTable, userSectorsTable, usersTable } from "@salvador/db";
import { CreateUserBody, ResetUserPasswordBody, ResetUserPasswordResponse, UpdateUserBody } from "@salvador/api-zod";
import {
  PERMISSION_MODULES,
  buildPermissions,
  buildScopes,
  isSectorModule,
  normalizeScope,
  type ModuleScope,
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

async function savePermissions(tx: Tx, userId: number, permissions: Record<string, Level>, scopes: Record<string, ModuleScope>) {
  await tx.delete(userModulesTable).where(eq(userModulesTable.userId, userId));
  const rows = Object.entries(permissions).map(([moduleKey, level]) => {
    const sc = scopes[moduleKey] ?? { alcance: "todos", sectorIds: [] };
    return { userId, moduleKey, level, alcance: sc.alcance, sectorIds: sc.sectorIds };
  });
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
  const mods = await db.select().from(userModulesTable).where(inArray(userModulesTable.userId, userIds));
  return users.map((u) => {
    const propios = mods.filter((m) => m.userId === u.id);
    const permissions = u.role === "superadmin" ? allPermissions() : buildPermissions(u.role, propios);
    const scopes = u.role === "superadmin" ? {} : buildScopes(propios.filter((m) => permissions[m.moduleKey]));
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

// ---------- plantillas de permisos (ej. "Jefe de guardia") ----------
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
    const permissions = role === "superadmin" ? {} : (parsePermissions(req.body ?? {}) ?? { dashboard: "ver" as Level });
    const scopes = (await parseScopes(req.body ?? {}, permissions)) ?? {};
    const passwordHash = await hashPassword(data.password);

    const id = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(usersTable)
        .values({ username, name, email: data.email?.trim() || null, passwordHash, role, active: data.active ?? true, mustChangePassword: true })
        .returning({ id: usersTable.id });
      await savePermissions(tx, created.id, permissions, scopes);
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
    const pedidos = parsePermissions(req.body ?? {});
    const filas = await db.select().from(userModulesTable).where(eq(userModulesTable.userId, id));
    // Sin permisos en el pedido: se mantienen los actuales (y se fijan los de un "responsable" viejo que pasa a "usuario").
    const permissions =
      pedidos ?? (req.body?.scopes !== undefined || req.body?.sectorIds !== undefined || (current.role !== nextRole && nextRole === "usuario") ? buildPermissions(current.role, filas) : undefined);
    const scopes = permissions ? ((await parseScopes(req.body ?? {}, permissions)) ?? buildScopes(filas.filter((f) => permissions[f.moduleKey]))) : undefined;

    await db.transaction(async (tx) => {
      await tx
        .update(usersTable)
        .set({
          ...(username ? { username } : {}),
          ...(data.name ? { name: data.name.trim() } : {}),
          ...(data.email !== undefined ? { email: data.email?.trim() || null } : {}),
          role: nextRole,
          active: nextActive,
        })
        .where(eq(usersTable.id, id));
      if (permissions && scopes) await savePermissions(tx, id, nextRole === "superadmin" ? {} : permissions, nextRole === "superadmin" ? {} : scopes);
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
