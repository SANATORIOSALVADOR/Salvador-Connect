import { Router, type IRouter } from "express";
import { asc, eq, inArray } from "drizzle-orm";
import {
  db,
  sectorsTable,
  userModulesTable,
  userSectorsTable,
  usersTable,
} from "@salvador/db";
import {
  CreateUserBody,
  ListUsersResponse,
  ResetUserPasswordBody,
  ResetUserPasswordResponse,
  UpdateUserBody,
} from "@salvador/api-zod";
import { ALL_MODULES, hashPassword, requireAuth, requireSuperadmin } from "../lib/auth";

const router: IRouter = Router();

function validateModules(values: string[] | undefined): string[] {
  return [
    ...new Set(
      (values ?? []).filter((value): value is (typeof ALL_MODULES)[number] =>
        ALL_MODULES.includes(value as (typeof ALL_MODULES)[number]),
      ),
    ),
  ];
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
    sectors: sectors.filter(
      (sector) => user.role === "superadmin" || sectorAssignments.some((item) => item.sectorId === sector.id),
    ),
    createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt,
    lastLoginAt:
      user.lastLoginAt instanceof Date ? user.lastLoginAt.toISOString() : user.lastLoginAt,
  };
}

async function replaceAssignments(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: number,
  modules: string[],
  sectorIds: number[],
) {
  await tx.delete(userModulesTable).where(eq(userModulesTable.userId, userId));
  await tx.delete(userSectorsTable).where(eq(userSectorsTable.userId, userId));
  // De a uno: evita fallos de batch cuando la secuencia serial está desfasada
  for (const moduleKey of modules) {
    await tx.insert(userModulesTable).values({ userId, moduleKey });
  }
  for (const sectorId of sectorIds) {
    await tx.insert(userSectorsTable).values({ userId, sectorId });
  }
}

router.use(requireAuth, requireSuperadmin);

router.get("/users", async (_request, response): Promise<void> => {
  try {
    const users = await db.select().from(usersTable).orderBy(asc(usersTable.name));
    const serialized = await Promise.all(users.map((user) => serializeUser(user.id)));
    response.json(ListUsersResponse.parse(serialized.filter(Boolean)));
  } catch (err) {
    console.error("[users.list]", err);
    response.status(500).json({ message: "No se pudo listar usuarios." });
  }
});

router.post("/users", async (request, response): Promise<void> => {
  const parsed = CreateUserBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      message: "Revisá los datos (nombre, usuario y contraseña de al menos 6 caracteres).",
      details: parsed.error.flatten(),
    });
    return;
  }

  const data = parsed.data;
  const username = data.username.trim().toLowerCase().replace(/\s+/g, "");
  const name = data.name.trim();
  const password = data.password || "";

  if (!username || username.length < 2) {
    response.status(400).json({ message: "El usuario debe tener al menos 2 caracteres." });
    return;
  }
  if (!name) {
    response.status(400).json({ message: "El nombre es obligatorio." });
    return;
  }
  if (password.length < 6) {
    response.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres." });
    return;
  }

  try {
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, username))
      .limit(1);
    if (existing.length) {
      response.status(409).json({
        message: `El usuario "${username}" ya existe. Elegí otro nombre de usuario.`,
      });
      return;
    }

    let sectorIds = Array.isArray(data.sectorIds)
      ? [...new Set(data.sectorIds.filter((id) => Number.isInteger(id) && id > 0))]
      : [];
    if (sectorIds.length) {
      const found = await db
        .select({ id: sectorsTable.id })
        .from(sectorsTable)
        .where(inArray(sectorsTable.id, sectorIds));
      const ok = new Set(found.map((s) => s.id));
      sectorIds = sectorIds.filter((id) => ok.has(id));
    }

    const modules = validateModules(data.modules);
    if (!modules.includes("dashboard")) modules.unshift("dashboard");

    const passwordHash = await hashPassword(password);
    const role = data.role === "responsable" ? "responsable" : "usuario";

    const created = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(usersTable)
        .values({
          username,
          name,
          passwordHash,
          role,
          active: data.active ?? true,
          mustChangePassword: true,
        })
        .returning({ id: usersTable.id });
      const user = inserted[0];
      if (!user?.id) throw new Error("INSERT users no devolvió id");
      await replaceAssignments(tx, user.id, modules, sectorIds);
      return user;
    });

    const result = await serializeUser(created.id);
    if (!result) {
      response.status(500).json({ message: "Usuario creado pero no se pudo leer. Recargá la lista." });
      return;
    }
    response.status(201).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[users.create]", err);
    if (/unique|duplicate|users_username|users_email/i.test(msg)) {
      response.status(409).json({
        message: `El usuario "${username}" ya existe o hay un dato duplicado.`,
      });
      return;
    }
    response.status(500).json({
      message: `No se pudo crear el usuario: ${msg.slice(0, 240)}`,
      error: msg.slice(0, 300),
    });
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
      const [updated] = await tx
        .update(usersTable)
        .set({
          ...(data.username ? { username: data.username.trim().toLowerCase().replace(/\s+/g, "") } : {}),
          ...(data.name ? { name: data.name.trim() } : {}),
          ...(data.email !== undefined ? { email: data.email?.trim() || null } : {}),
          ...(data.role ? { role: data.role === "responsable" ? "responsable" : "usuario" } : {}),
          ...(data.active !== undefined ? { active: data.active } : {}),
        })
        .where(eq(usersTable.id, id))
        .returning({ id: usersTable.id });
      if (!updated) return null;
      if (data.modules || data.sectorIds) {
        const currentModules =
          data.modules ??
          (
            await tx
              .select({ moduleKey: userModulesTable.moduleKey })
              .from(userModulesTable)
              .where(eq(userModulesTable.userId, id))
          ).map((item) => item.moduleKey);
        let currentSectors =
          data.sectorIds ??
          (
            await tx
              .select({ sectorId: userSectorsTable.sectorId })
              .from(userSectorsTable)
              .where(eq(userSectorsTable.userId, id))
          ).map((item) => item.sectorId);
        if (data.sectorIds) {
          currentSectors = [...new Set(data.sectorIds.filter((sid) => Number.isInteger(sid) && sid > 0))];
        }
        await replaceAssignments(tx, id, validateModules(currentModules), currentSectors);
      }
      return updated;
    });
    if (!result) {
      response.status(404).json({ message: "Usuario no encontrado." });
      return;
    }
    const serialized = await serializeUser(result.id);
    response.json(serialized);
  } catch (err) {
    console.error("[users.update]", err);
    response.status(500).json({ message: "No se pudo guardar el usuario." });
  }
});

router.post("/users/:id/reset-password", async (request, response): Promise<void> => {
  const id = Number(request.params.id);
  const parsed = ResetUserPasswordBody.safeParse(request.body);
  if (!Number.isInteger(id) || !parsed.success) {
    response.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres." });
    return;
  }
  const [updated] = await db
    .update(usersTable)
    .set({
      passwordHash: await hashPassword(parsed.data.password),
      mustChangePassword: true,
    })
    .where(eq(usersTable.id, id))
    .returning({ id: usersTable.id });
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

export default router;
