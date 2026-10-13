import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, sectorsTable, usersTable } from "@salvador/db";
import { ChangePasswordBody, LoginBody } from "@salvador/api-zod";
import {
  clearSession,
  createSession,
  getUserWithPermissions,
  hashPassword,
  purgeExpiredSessions,
  requireAuth,
  revokeUserSessions,
  verifyPassword,
} from "../lib/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Límite de intentos fallidos de login (en memoria; alcanza para una sola instancia de API).
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const failedLogins = new Map<string, { count: number; firstAt: number }>();

function attemptKey(ip: string | undefined, username: string) {
  return `${ip ?? "?"}|${username}`;
}

function isLocked(key: string): boolean {
  const entry = failedLogins.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > LOCK_WINDOW_MS) {
    failedLogins.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILED_ATTEMPTS;
}

function registerFailure(key: string) {
  if (failedLogins.size > 5000) failedLogins.clear();
  const entry = failedLogins.get(key);
  if (!entry || Date.now() - entry.firstAt > LOCK_WINDOW_MS) {
    failedLogins.set(key, { count: 1, firstAt: Date.now() });
  } else {
    entry.count += 1;
  }
}

const publicUser = (user: NonNullable<Express.Request["authUser"]>) => ({
  id: user.id,
  username: user.username,
  name: user.name,
  email: user.email,
  role: user.role,
  active: user.active,
  mustChangePassword: user.mustChangePassword,
  modules: user.modules,
  permissions: user.permissions,
  sectorIds: user.sectorIds,
});

router.post("/auth/login", async (request, response): Promise<void> => {
  try {
    const parsed = LoginBody.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Ingresá usuario y contraseña." });
      return;
    }
    const username = parsed.data.username.trim().toLowerCase();
    const key = attemptKey(request.ip, username);
    if (isLocked(key)) {
      response.status(429).json({ message: "Demasiados intentos fallidos. Esperá 15 minutos e intentá de nuevo." });
      return;
    }
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, username))
      .limit(1);
    if (!user || !user.active || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      registerFailure(key);
      response.status(401).json({ message: "Usuario o contraseña incorrectos." });
      return;
    }
    failedLogins.delete(key);
    await purgeExpiredSessions();
    await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
    await createSession(user.id, response);

    const authUser = await getUserWithPermissions(user.id);
    const sectors = await db.select().from(sectorsTable);
    const allowedSectors = sectors
      .filter((sector) => user.role === "superadmin" || authUser!.sectorIds.includes(sector.id))
      .map((s) => ({ id: s.id, name: s.name, shortName: s.shortName }));

    response.json({ user: { ...publicUser(authUser!), sectors: allowedSectors } });
  } catch (err) {
    logger.error({ err }, "login failed");
    response.status(500).json({ message: "Error interno al iniciar sesión." });
  }
});

router.post("/auth/logout", requireAuth, async (request, response): Promise<void> => {
  await clearSession(request, response);
  response.sendStatus(204);
});

router.get("/auth/me", requireAuth, async (request, response): Promise<void> => {
  response.json(publicUser(request.authUser!));
});

/** Mi perfil: cada persona corrige su nombre y email (usuario, rol y permisos los define el superadmin). */
router.patch("/auth/me", requireAuth, async (request, response): Promise<void> => {
  const body = (request.body ?? {}) as { name?: unknown; email?: unknown };
  const patch: { name?: string; email?: string | null } = {};
  if (body.name !== undefined) {
    const name = String(body.name).replace(/\s+/g, " ").trim().slice(0, 80);
    if (name.length < 2) {
      response.status(400).json({ message: "El nombre es obligatorio." });
      return;
    }
    patch.name = name;
  }
  if (body.email !== undefined) {
    const email = String(body.email ?? "").trim().toLowerCase().slice(0, 120);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      response.status(400).json({ message: "El email no es válido." });
      return;
    }
    patch.email = email || null;
  }
  try {
    if (Object.keys(patch).length) await db.update(usersTable).set(patch).where(eq(usersTable.id, request.authUser!.id));
    const user = await getUserWithPermissions(request.authUser!.id);
    response.json(publicUser(user!));
  } catch (err) {
    if (/unique|duplicate/i.test(String((err as Error)?.message ?? err))) {
      response.status(409).json({ message: "Ese email ya lo usa otro usuario." });
      return;
    }
    logger.error({ err }, "update profile failed");
    response.status(500).json({ message: "No se pudo guardar el perfil." });
  }
});

router.post("/auth/continue-password", requireAuth, async (request, response): Promise<void> => {
  await db
    .update(usersTable)
    .set({ mustChangePassword: false })
    .where(eq(usersTable.id, request.authUser!.id));
  response.json({ ok: true });
});

router.post("/auth/change-password", requireAuth, async (request, response): Promise<void> => {
  const parsed = ChangePasswordBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "La nueva contraseña debe tener al menos 6 caracteres." });
    return;
  }
  const user = request.authUser!;
  // Fuera del primer acceso se exige la contraseña actual.
  if (!user.mustChangePassword) {
    const currentPassword = String((request.body as { currentPassword?: unknown })?.currentPassword ?? "");
    const [row] = await db
      .select({ passwordHash: usersTable.passwordHash })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);
    if (!row || !currentPassword || !(await verifyPassword(currentPassword, row.passwordHash))) {
      response.status(400).json({ message: "La contraseña actual no es correcta." });
      return;
    }
  }
  const passwordHash = await hashPassword(parsed.data.newPassword);
  await db
    .update(usersTable)
    .set({ passwordHash, mustChangePassword: false })
    .where(eq(usersTable.id, user.id));
  await revokeUserSessions(user.id, request);
  response.json({ ok: true });
});

export default router;
