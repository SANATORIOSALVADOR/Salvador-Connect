import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, sectorsTable, userModulesTable, userSectorsTable, usersTable } from "@salvador/db";
import { ChangePasswordBody, LoginBody, LoginResponse } from "@salvador/api-zod";
import { clearSession, createSession, hashPassword, requireAuth, verifyPassword } from "../lib/auth";

const router: IRouter = Router();

const publicUser = (user: NonNullable<Express.Request["authUser"]>) => ({
  id: user.id,
  username: user.username,
  name: user.name,
  email: user.email,
  role: user.role,
  active: user.active,
  mustChangePassword: user.mustChangePassword,
  modules: user.modules,
  sectorIds: user.sectorIds,
});

router.post("/auth/login", async (request, response): Promise<void> => {
  const parsed = LoginBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "Ingresá usuario y contraseña." });
    return;
  }
  const username = parsed.data.username.trim().toLowerCase();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username)).limit(1);
  if (!user || !user.active || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    response.status(401).json({ message: "Usuario o contraseña incorrectos." });
    return;
  }
  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
  await createSession(user.id, response);
  const [modules, sectorAssignments, sectors] = await Promise.all([
    db.select({ moduleKey: userModulesTable.moduleKey }).from(userModulesTable).where(eq(userModulesTable.userId, user.id)),
    db.select({ sectorId: userSectorsTable.sectorId }).from(userSectorsTable).where(eq(userSectorsTable.userId, user.id)),
    db.select().from(sectorsTable),
  ]);
  response.json(LoginResponse.parse({
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      mustChangePassword: user.mustChangePassword,
      modules: modules.map((item) => item.moduleKey),
      sectorIds: sectorAssignments.map((item) => item.sectorId),
      sectors: sectors.filter((sector) => user.role === "superadmin" || sectorAssignments.some((item) => item.sectorId === sector.id)),
    },
  }));
});

router.post("/auth/logout", requireAuth, async (request, response): Promise<void> => {
  await clearSession(request, response);
  response.sendStatus(204);
});

router.get("/auth/me", requireAuth, async (request, response): Promise<void> => {
  response.json(publicUser(request.authUser!));
});

router.post("/auth/continue-password", requireAuth, async (request, response): Promise<void> => {
  await db.update(usersTable).set({ mustChangePassword: false }).where(eq(usersTable.id, request.authUser!.id));
  response.json({ ok: true });
});

router.post("/auth/change-password", requireAuth, async (request, response): Promise<void> => {
  const parsed = ChangePasswordBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "La nueva contraseña debe tener al menos 6 caracteres." });
    return;
  }
  const passwordHash = await hashPassword(parsed.data.newPassword);
  await db.update(usersTable).set({ passwordHash, mustChangePassword: false }).where(eq(usersTable.id, request.authUser!.id));
  response.json({ ok: true });
});

export default router;
