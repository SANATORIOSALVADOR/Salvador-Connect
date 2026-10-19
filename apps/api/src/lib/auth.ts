import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { and, eq, gt, lt, ne } from "drizzle-orm";
import { db, perfilesTable, sessionsTable, userModulesTable, usersTable } from "@salvador/db";
import { logger } from "./logger";

const scrypt = (password: string, salt: string, keyLength: number, options: { cost: number; blockSize: number; parallelization: number }) =>
  new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(password, salt, keyLength, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived as Buffer);
    });
  });
export const SESSION_COOKIE = "sanatorio_session";
/** "Ver como": el superadmin navega como otra persona, en solo lectura (cookie con el id de esa persona). */
export const VER_COMO_COOKIE = "sanatorio_ver_como";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export const ALL_MODULES = ["dashboard", "administracion", "liquidacion", "guardias", "inventario", "instructivos", "configuracion", "usuarios"] as const;

const BOOTSTRAP_USERNAME = "sistemas";

function cookieSecure(): boolean {
  return process.env.COOKIE_SECURE === "true";
}

/**
 * Crea el superadmin inicial SOLO si no existe ningún superadmin activo.
 * La contraseña sale de BOOTSTRAP_ADMIN_PASSWORD (.env); nunca se pisa un usuario existente.
 * Para recuperar el acceso usar scripts/reset-admin.sh.
 */
export async function ensureBootstrapSuperadmin(): Promise<void> {
  const [admin] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.role, "superadmin"), eq(usersTable.active, true)))
    .limit(1);
  if (admin) return;

  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "";
  if (password.length < 10) {
    logger.warn(
      "No hay superadmin activo y BOOTSTRAP_ADMIN_PASSWORD no está definida (mín. 10 caracteres). Usá scripts/reset-admin.sh.",
    );
    return;
  }

  const passwordHash = await hashPassword(password);
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, BOOTSTRAP_USERNAME))
    .limit(1);

  const userId = existing
    ? (
        await db
          .update(usersTable)
          .set({ passwordHash, role: "superadmin", active: true, mustChangePassword: true })
          .where(eq(usersTable.id, existing.id))
          .returning({ id: usersTable.id })
      )[0].id
    : (
        await db
          .insert(usersTable)
          .values({
            username: BOOTSTRAP_USERNAME,
            name: "Sistemas",
            email: null,
            passwordHash,
            role: "superadmin",
            active: true,
            mustChangePassword: true,
          })
          .returning({ id: usersTable.id })
      )[0].id;

  const mods = await db
    .select({ moduleKey: userModulesTable.moduleKey })
    .from(userModulesTable)
    .where(eq(userModulesTable.userId, userId));
  const have = new Set(mods.map((m) => m.moduleKey));
  const missing = ALL_MODULES.filter((m) => !have.has(m));
  if (missing.length) {
    await db.insert(userModulesTable).values(missing.map((moduleKey) => ({ userId, moduleKey })));
  }
  logger.info({ username: BOOTSTRAP_USERNAME }, "Superadmin inicial creado desde BOOTSTRAP_ADMIN_PASSWORD");
}

// ---------- permisos por módulo ----------

/** Niveles de permiso dentro de un módulo, de menor a mayor. Sin fila = sin acceso. */
export const LEVELS = ["ver", "editar", "total"] as const;
export type Level = (typeof LEVELS)[number];

/**
 * Módulos que se asignan por usuario y los niveles que admite cada uno.
 * Configuración (usuarios y sectores) es exclusiva del superadmin y no se asigna.
 */
export const PERMISSION_MODULES: Record<string, readonly Level[]> = {
  dashboard: ["ver"],
  administracion: LEVELS,
  guardias: LEVELS,
  inventario: LEVELS,
  instructivos: LEVELS,
  liquidacion: ["ver"],
};

/** Módulos cuya información se separa por sector (en ellos cada permiso define su alcance). */
export const SECTOR_MODULES = ["guardias", "inventario", "instructivos"] as const;

/**
 * Alcance de un permiso en un módulo con sectores:
 *  - todos:  ve y trabaja en todos los sectores
 *  - carga:  ve todo, pero carga / modifica / elimina solo en sus sectores
 *  - sector: ve y trabaja solo en sus sectores
 */
export const ALCANCES = ["todos", "carga", "sector"] as const;
export type Alcance = (typeof ALCANCES)[number];
export type ModuleScope = { alcance: Alcance; sectorIds: number[] };

export function isSectorModule(moduleKey: string): boolean {
  return (SECTOR_MODULES as readonly string[]).includes(moduleKey);
}

/** Alcance válido: sin sectores elegidos (o en un módulo sin sectores) es siempre "todos". */
export function normalizeScope(moduleKey: string, alcance: unknown, sectorIds: unknown): ModuleScope {
  const ids = Array.isArray(sectorIds) ? [...new Set(sectorIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b) : [];
  const a = String(alcance ?? "") as Alcance;
  if (!isSectorModule(moduleKey) || !ids.length || !(ALCANCES as readonly string[]).includes(a) || a === "todos") return { alcance: "todos", sectorIds: [] };
  return { alcance: a, sectorIds: ids };
}

export function levelRank(level: Level | null | undefined): number {
  return level ? LEVELS.indexOf(level) + 1 : 0;
}

/** Filas viejas sin nivel: se respeta lo que permitía el rol anterior. */
function legacyLevel(role: string): Level {
  return role === "responsable" || role === "nivel2" || role === "nivel3" ? "total" : "ver";
}

/** Normaliza un nivel pedido para un módulo (lo recorta al máximo que admite). */
export function normalizeLevel(moduleKey: string, value: unknown): Level | null {
  const allowed = PERMISSION_MODULES[moduleKey];
  if (!allowed) return null;
  const v = String(value ?? "").toLowerCase();
  if (!(LEVELS as readonly string[]).includes(v)) return null;
  return allowed.includes(v as Level) ? (v as Level) : allowed[allowed.length - 1];
}

export type AuthUser = {
  id: number;
  username: string;
  name: string;
  email: string | null;
  role: string;
  active: boolean;
  mustChangePassword: boolean;
  /** Módulos con algún acceso (para el menú). */
  modules: string[];
  /** Nivel por módulo. */
  permissions: Record<string, Level>;
  /** Alcance por módulo con sectores (los que no figuran = todos los sectores). */
  scopes: Record<string, ModuleScope>;
  /** Todos los sectores a cargo, sumando módulos (compatibilidad con pantallas viejas). */
  sectorIds: number[];
  /** Perfil vinculado (null = permisos a medida) y módulos donde la persona tiene una excepción. */
  perfil: { id: number; nombre: string } | null;
  excepciones: string[];
};

function digestToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64, { cost: 16_384, blockSize: 8, parallelization: 1 })) as Buffer;
  return `scrypt$16384$8$1$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, n, r, p, salt, encoded] = stored.split("$");
  if (algorithm !== "scrypt" || !n || !r || !p || !salt || !encoded) return false;
  const derived = (await scrypt(password, salt, encoded.length / 2, {
    cost: Number(n),
    blockSize: Number(r),
    parallelization: Number(p),
  })) as Buffer;
  const expected = Buffer.from(encoded, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** Alcance por módulo a partir de las filas de user_modules (solo los que limitan algo). */
export function buildScopes(rows: { moduleKey: string; alcance?: string | null; sectorIds?: number[] | null }[]): Record<string, ModuleScope> {
  const out: Record<string, ModuleScope> = {};
  for (const r of rows) {
    const sc = normalizeScope(r.moduleKey, r.alcance, r.sectorIds);
    if (sc.alcance !== "todos") out[r.moduleKey] = sc;
  }
  return out;
}

export type PerfilDef = { id: number; nombre: string; permisos: Record<string, string>; alcances: Record<string, string> };
type FilaModulo = { moduleKey: string; level: string; alcance?: string | null; sectorIds?: number[] | null };

/**
 * Permisos efectivos de una persona: su perfil (si tiene) + sus filas propias.
 * Con perfil, cada fila es "perfil" (hereda; guarda sus sectores), "ninguno" (excepción sin acceso)
 * o un nivel (excepción con ese nivel y su propio alcance).
 * Un alcance por sector sin sectores elegidos no da acceso a ningún sector (nunca a todos).
 */
export function efectivos(role: string, perfil: PerfilDef | null, rows: FilaModulo[]): { permissions: Record<string, Level>; scopes: Record<string, ModuleScope>; excepciones: string[] } {
  if (role === "superadmin") return { permissions: allPermissions(), scopes: {}, excepciones: [] };
  if (!perfil) {
    const propias = rows.filter((r) => r.level !== "perfil" && r.level !== "ninguno");
    const permissions = buildPermissions(role, propias);
    return { permissions, scopes: buildScopes(propias.filter((r) => permissions[r.moduleKey])), excepciones: [] };
  }
  const permissions: Record<string, Level> = {};
  const alcance: Record<string, string> = {};
  for (const [mod, lvl] of Object.entries(perfil.permisos ?? {})) {
    const l = normalizeLevel(mod, lvl);
    if (!l) continue;
    permissions[mod] = l;
    alcance[mod] = String(perfil.alcances?.[mod] ?? "todos");
  }
  const sectores: Record<string, number[]> = {};
  const excepciones: string[] = [];
  for (const r of rows) {
    if (!PERMISSION_MODULES[r.moduleKey]) continue;
    sectores[r.moduleKey] = r.sectorIds ?? [];
    if (r.level === "perfil") continue;
    excepciones.push(r.moduleKey);
    if (r.level === "ninguno") {
      delete permissions[r.moduleKey];
      continue;
    }
    const l = normalizeLevel(r.moduleKey, r.level || legacyLevel(role));
    if (l) {
      permissions[r.moduleKey] = l;
      alcance[r.moduleKey] = r.alcance || "todos";
    }
  }
  const scopes: Record<string, ModuleScope> = {};
  for (const mod of Object.keys(permissions)) {
    const a = alcance[mod] as Alcance;
    if (!isSectorModule(mod) || !(ALCANCES as readonly string[]).includes(a) || a === "todos") continue;
    scopes[mod] = { alcance: a, sectorIds: [...new Set(sectores[mod] ?? [])].sort((x, y) => x - y) };
  }
  return { permissions, scopes, excepciones };
}

export async function leerPerfil(id: number | null | undefined): Promise<PerfilDef | null> {
  if (!id) return null;
  const [p] = await db.select().from(perfilesTable).where(eq(perfilesTable.id, id)).limit(1);
  return p ? { id: p.id, nombre: p.nombre, permisos: p.permisos ?? {}, alcances: p.alcances ?? {} } : null;
}

/** Arma el mapa módulo → nivel a partir de las filas de user_modules. */
export function buildPermissions(role: string, rows: { moduleKey: string; level: string }[]): Record<string, Level> {
  const out: Record<string, Level> = {};
  for (const r of rows) {
    if (!PERMISSION_MODULES[r.moduleKey]) continue; // p. ej. "usuarios" / "configuracion" viejos
    const level = normalizeLevel(r.moduleKey, r.level || legacyLevel(role));
    if (level && levelRank(level) > levelRank(out[r.moduleKey])) out[r.moduleKey] = level;
  }
  return out;
}

export async function getUserWithPermissions(userId: number): Promise<AuthUser | null> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user || !user.active) return null;
  const modules = await db
    .select({ moduleKey: userModulesTable.moduleKey, level: userModulesTable.level, alcance: userModulesTable.alcance, sectorIds: userModulesTable.sectorIds })
    .from(userModulesTable)
    .where(eq(userModulesTable.userId, userId));
  const perfil = user.role === "superadmin" ? null : await leerPerfil(user.perfilId);
  const { permissions, scopes, excepciones } = efectivos(user.role, perfil, modules);
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    mustChangePassword: user.mustChangePassword,
    modules: Object.keys(permissions),
    permissions,
    scopes,
    sectorIds: [...new Set(Object.values(scopes).flatMap((sc) => sc.sectorIds))].sort((a, b) => a - b),
    perfil: perfil ? { id: perfil.id, nombre: perfil.nombre } : null,
    excepciones,
  };
}

/** El superadmin tiene el nivel máximo en todos los módulos. */
export function allPermissions(): Record<string, Level> {
  return Object.fromEntries(Object.entries(PERMISSION_MODULES).map(([k, levels]) => [k, levels[levels.length - 1]]));
}

export async function createSession(userId: number, response: Response): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessionsTable).values({
    tokenHash: digestToken(token),
    userId,
    expiresAt,
  });
  response.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    expires: expiresAt,
    path: "/",
  });
}

/** Borra sesiones vencidas (se llama en cada login). */
export async function purgeExpiredSessions(): Promise<void> {
  await db.delete(sessionsTable).where(lt(sessionsTable.expiresAt, new Date()));
}

/** Cierra todas las sesiones del usuario salvo la actual (cambio / reseteo de contraseña). */
export async function revokeUserSessions(userId: number, keepRequest?: Request): Promise<void> {
  const token = keepRequest?.cookies?.[SESSION_COOKIE] as string | undefined;
  await db
    .delete(sessionsTable)
    .where(
      token
        ? and(eq(sessionsTable.userId, userId), ne(sessionsTable.tokenHash, digestToken(token)))
        : eq(sessionsTable.userId, userId),
    );
}

export async function clearSession(request: Request, response: Response): Promise<void> {
  const token = request.cookies?.[SESSION_COOKIE] as string | undefined;
  if (token) await db.delete(sessionsTable).where(eq(sessionsTable.tokenHash, digestToken(token)));
  response.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
  });
}

export async function getAuthenticatedUser(request: Request): Promise<AuthUser | null> {
  const token = request.cookies?.[SESSION_COOKIE] as string | undefined;
  if (!token) return null;
  const [session] = await db
    .select({ userId: sessionsTable.userId })
    .from(sessionsTable)
    .where(and(eq(sessionsTable.tokenHash, digestToken(token)), gt(sessionsTable.expiresAt, new Date())))
    .limit(1);
  return session ? getUserWithPermissions(session.userId) : null;
}

/** Pedidos que se permiten en "Ver como" además de consultar: salir del modo y cerrar sesión. */
function libreEnVerComo(request: Request): boolean {
  const m = request.method;
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return true;
  const path = (request.originalUrl || request.url || "").split("?")[0];
  return path.endsWith("/auth/ver-como") || path.endsWith("/auth/logout");
}

export const requireAuth: RequestHandler = async (request, response, next) => {
  // Puede correr más de una vez en el mismo pedido (router.use + ruta): se resuelve una sola vez.
  if (request.authUser) {
    next();
    return;
  }
  const user = await getAuthenticatedUser(request);
  if (!user) {
    response.status(401).json({ message: "Sesión no válida o vencida." });
    return;
  }
  // "Ver como": solo el superadmin, y en solo lectura.
  const verComo = Number(request.cookies?.[VER_COMO_COOKIE]);
  if (user.role === "superadmin" && Number.isInteger(verComo) && verComo > 0 && verComo !== user.id) {
    const otro = await getUserWithPermissions(verComo);
    if (otro) {
      if (!libreEnVerComo(request)) {
        response.status(403).json({ message: `Estás viendo el sistema como ${otro.name}: es solo lectura. Volvé a tu usuario para hacer cambios.`, codigo: "ver_como" });
        return;
      }
      request.verComoDe = user;
      request.authUser = otro;
      next();
      return;
    }
  }
  request.authUser = user;
  next();
};

export const requireSuperadmin: RequestHandler = (request, response, next) => {
  if (request.authUser?.role !== "superadmin") {
    response.status(403).json({ message: "Solo el superadmin puede realizar esta acción." });
    return;
  }
  next();
};

export function levelOf(user: AuthUser | null | undefined, moduleKey: string): Level | null {
  if (!user) return null;
  if (user.role === "superadmin") return allPermissions()[moduleKey] ?? "total";
  return user.permissions[moduleKey] ?? null;
}

/** ¿Tiene al menos ese nivel en el módulo? */
export function hasLevel(user: AuthUser | null | undefined, moduleKey: string, min: Level): boolean {
  return levelRank(levelOf(user, moduleKey)) >= levelRank(min);
}

export function hasModule(user: AuthUser | null | undefined, moduleKey: string): boolean {
  return hasLevel(user, moduleKey, "ver");
}

// ---------- alcance por sector ----------

export function scopeOf(user: AuthUser | null | undefined, moduleKey: string): ModuleScope {
  if (!user || user.role === "superadmin") return { alcance: "todos", sectorIds: [] };
  return user.scopes?.[moduleKey] ?? { alcance: "todos", sectorIds: [] };
}

/** Sectores que la persona puede VER en el módulo; null = todos. */
export function visibleSectorIds(user: AuthUser | null | undefined, moduleKey: string): number[] | null {
  const sc = scopeOf(user, moduleKey);
  return sc.alcance === "sector" ? sc.sectorIds : null;
}

/** Sectores a cargo (para cargar / modificar y para lo que se le muestra como "lo suyo"); null = todos. */
export function ownSectorIds(user: AuthUser | null | undefined, moduleKey: string): number[] | null {
  const sc = scopeOf(user, moduleKey);
  return sc.alcance === "todos" ? null : sc.sectorIds;
}

export function canSeeSector(user: AuthUser | null | undefined, moduleKey: string, sectorId: number): boolean {
  const ids = visibleSectorIds(user, moduleKey);
  return !ids || ids.includes(sectorId);
}

export function canWriteSector(user: AuthUser | null | undefined, moduleKey: string, sectorId: number): boolean {
  if (!user) return false;
  const ids = ownSectorIds(user, moduleKey);
  return !ids || ids.includes(sectorId);
}

const LEVEL_MESSAGE: Record<Level, string> = {
  ver: "No tenés acceso a este módulo.",
  editar: "Tu permiso en este módulo es de solo lectura.",
  total: "Esta acción requiere Control total en el módulo.",
};

/** Exige un nivel mínimo en el módulo (superadmin siempre pasa). */
export const requireLevel = (moduleKey: string, min: Level): RequestHandler => (request, response, next) => {
  const user = request.authUser;
  if (!user) {
    response.status(401).json({ message: "Sesión no válida o vencida." });
    return;
  }
  if (!hasLevel(user, moduleKey, min)) {
    response.status(403).json({ message: LEVEL_MESSAGE[min] });
    return;
  }
  next();
};

/** Acceso al módulo (nivel Ver). */
export const requireModule = (moduleKey: string): RequestHandler => requireLevel(moduleKey, "ver");

/**
 * Nivel según el método: consultar = Ver, crear / modificar = Cargar y editar, eliminar = Control total.
 * Las acciones de configuración piden "total" explícitamente en cada ruta.
 */
export const requireModuleAccess = (moduleKey: string): RequestHandler => (request, response, next) => {
  const m = request.method;
  const min: Level = m === "GET" || m === "HEAD" || m === "OPTIONS" ? "ver" : m === "DELETE" ? "total" : "editar";
  requireLevel(moduleKey, min)(request, response, next);
};

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      /** Superadmin real cuando está en "Ver como" (authUser es la persona que mira). */
      verComoDe?: AuthUser;
    }
  }
}
