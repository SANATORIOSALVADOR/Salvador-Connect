import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { and, eq, gt } from "drizzle-orm";
import { db, sessionsTable, userModulesTable, userSectorsTable, usersTable } from "@salvador/db";

const scrypt = (password: string, salt: string, keyLength: number, options: { cost: number; blockSize: number; parallelization: number }) =>
  new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(password, salt, keyLength, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived as Buffer);
    });
  });
export const SESSION_COOKIE = "sanatorio_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const BOOTSTRAP_PASSWORD_HASH =
  "scrypt$16384$8$1$39f918f971d33869fab676ec50e46810$0c732afc551e60a40781324982847b0a21dacec8d47fc5c5fb2559cd007cb3830525a6a81ab48113d733eea5cf61521c2dfe30d4bceb1726d80d1cb231783e30";
export const ALL_MODULES = ["dashboard", "administracion", "liquidacion", "guardias", "inventario", "instructivos", "configuracion", "usuarios"] as const;

const BOOTSTRAP_USERNAME = "sistemas";

export async function ensureBootstrapSuperadmin(): Promise<void> {
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, BOOTSTRAP_USERNAME))
    .limit(1);
  if (existing) return;
  const [user] = await db
    .insert(usersTable)
    .values({
      username: BOOTSTRAP_USERNAME,
      name: "Sistemas",
      email: null,
      passwordHash: BOOTSTRAP_PASSWORD_HASH,
      role: "superadmin",
      active: true,
      mustChangePassword: true,
    })
    .returning({ id: usersTable.id });
  await db.insert(userModulesTable).values(ALL_MODULES.map((moduleKey) => ({ userId: user.id, moduleKey })));
}

export type AuthUser = {
  id: number;
  username: string;
  name: string;
  email: string | null;
  role: string;
  active: boolean;
  mustChangePassword: boolean;
  modules: string[];
  sectorIds: number[];
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

async function getUserWithPermissions(userId: number): Promise<AuthUser | null> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user || !user.active) return null;
  const [modules, sectors] = await Promise.all([
    db.select({ moduleKey: userModulesTable.moduleKey }).from(userModulesTable).where(eq(userModulesTable.userId, userId)),
    db.select({ sectorId: userSectorsTable.sectorId }).from(userSectorsTable).where(eq(userSectorsTable.userId, userId)),
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
    sectorIds: sectors.map((item) => item.sectorId),
  };
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
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export async function clearSession(request: Request, response: Response): Promise<void> {
  const token = request.cookies?.[SESSION_COOKIE] as string | undefined;
  if (token) await db.delete(sessionsTable).where(eq(sessionsTable.tokenHash, digestToken(token)));
  response.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
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

export const requireAuth: RequestHandler = async (request, response, next) => {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    response.status(401).json({ message: "Sesión no válida o vencida." });
    return;
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

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}
