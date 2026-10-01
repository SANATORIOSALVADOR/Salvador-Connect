import { Router, type IRouter } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  db,
  sectorsTable,
  userModulesTable,
  userSectorsTable,
  usersTable,
} from "@workspace/db";
import {
  CreateUserBody,
  CreateUserResponse,
  ListUsersResponse,
  ResetUserPasswordBody,
  ResetUserPasswordResponse,
  UpdateUserBody,
  UpdateUserResponse,
} from "@workspace/api-zod";
import { ALL_MODULES, hashPassword, requireAuth, requireSuperadmin } from "../lib/auth";

const router: IRouter = Router();

function validateModules(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).filter((value): value is typeof ALL_MODULES[number] => ALL_MODULES.includes(value as typeof ALL_MODULES[number])))];
}

async function serializeUser(userId: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) return null;
  const [modules, sectorAssignments, sectors] = await Promise.all([
    db.select({ moduleKey: userModulesTable.moduleKey }).from(userModulesTable).where(eq(userModulesTable.userId, userId)),
    db.select({ sectorId: userSectorsTable.sectorId }).from(userSectorsTable).where(eq(userSectorsTable.userId, userId)),
    db.select().from(sectorsTable).orderBy(asc(sectorsTable.name)),
  ]);
  return {
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
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

async function replaceAssignments(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], userId: number, modules: string[], sectorIds: number[]) {
  await tx.delete(userModulesTable).where(eq(userModulesTable.userId, userId));
  await tx.delete(userSectorsTable).where(eq(userSectorsTable.userId, userId));
  if (modules.length) await tx.insert(userModulesTable).values(modules.map((moduleKey) => ({ userId, moduleKey })));
  if (sectorIds.length) await tx.insert(userSectorsTable).values(sectorIds.map((sectorId) => ({ userId, sectorId })));
}

router.use(requireAuth, requireSuperadmin);

router.get("/users", async (_request, response): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(asc(usersTable.name));
  const serialized = await Promise.all(users.map((user) => serializeUser(user.id)));
  response.json(ListUsersResponse.parse(serialized.filter(Boolean)));
});

router.post("/users", async (request, response): Promise<void> => {
  const parsed = CreateUserBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "Revisá los datos del usuario." });
    return;
  }
  const data = parsed.data;
  const username = data.username.trim().toLowerCase();
  const passwordHash = await hashPassword(data.password);
  try {
    const created = await db.transaction(async (tx) => {
      const [user] = await tx.insert(usersTable).values({
        username,
        name: data.name.trim(),
        email: data.email?.trim() || null,
        passwordHash,
        role: data.role,
        active: data.active ?? true,
        mustChangePassword: true,
      }).returning({ id: usersTable.id });
      await replaceAssignments(tx, user.id, validateModules(data.modules), data.sectorIds ?? []);
      return user;
    });
    const result = await serializeUser(created.id);
    response.status(201).json(CreateUserResponse.parse(result));
  } catch {
    response.status(409).json({ message: "Ese nombre de usuario ya existe." });
  }
});

router.patch("/users/:id", async (request, response): Promise<void> => {
  const id = Number(request.params.id);
  const parsed = UpdateUserBody.safeParse(request.body);
  if (!Number.isInteger(id) || !parsed.success) {
    response.status(400).json({ message: "Revisá los datos del usuario." });
    return;
  }
  const data = parsed.data;
  if (id === request.authUser!.id && data.active === false) {
    response.status(400).json({ message: "No podés desactivar tu propio usuario." });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      const [updated] = await tx.update(usersTable).set({
        ...(data.username ? { username: data.username.trim().toLowerCase() } : {}),
        ...(data.name ? { name: data.name.trim() } : {}),
        ...(data.email !== undefined ? { email: data.email?.trim() || null } : {}),
        ...(data.role ? { role: data.role } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
      }).where(eq(usersTable.id, id)).returning({ id: usersTable.id });
      if (!updated) return null;
      if (data.modules || data.sectorIds) {
        const currentModules = data.modules ?? (await tx.select({ moduleKey: userModulesTable.moduleKey }).from(userModulesTable).where(eq(userModulesTable.userId, id))).map((item) => item.moduleKey);
        const currentSectors = data.sectorIds ?? (await tx.select({ sectorId: userSectorsTable.sectorId }).from(userSectorsTable).where(eq(userSectorsTable.userId, id))).map((item) => item.sectorId);
        await replaceAssignments(tx, id, validateModules(currentModules), currentSectors);
      }
      return updated;
    });
    if (!result) {
      response.status(404).json({ message: "Usuario no encontrado." });
      return;
    }
    response.json(UpdateUserResponse.parse(await serializeUser(result.id)));
  } catch {
    response.status(409).json({ message: "No se pudo guardar el usuario." });
  }
});

router.post("/users/:id/reset-password", async (request, response): Promise<void> => {
  const id = Number(request.params.id);
  const parsed = ResetUserPasswordBody.safeParse(request.body);
  if (!Number.isInteger(id) || !parsed.success) {
    response.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres." });
    return;
  }
  const [updated] = await db.update(usersTable).set({
    passwordHash: await hashPassword(parsed.data.password),
    mustChangePassword: true,
  }).where(eq(usersTable.id, id)).returning({ id: usersTable.id });
  if (!updated) {
    response.status(404).json({ message: "Usuario no encontrado." });
    return;
  }
  response.json(ResetUserPasswordResponse.parse({ ok: true }));
});

router.delete("/users/:id", async (request, response): Promise<void> => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id === request.authUser!.id) {
    response.status(400).json({ message: "No podés eliminar tu propio usuario." });
    return;
  }
  const [deleted] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning({ id: usersTable.id });
  if (!deleted) {
    response.status(404).json({ message: "Usuario no encontrado." });
    return;
  }
  response.sendStatus(204);
});

export { ALL_MODULES as moduleKeys };
export default router;