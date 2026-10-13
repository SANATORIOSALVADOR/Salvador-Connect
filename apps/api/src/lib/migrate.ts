import fs from "node:fs";
import path from "node:path";
import { pool } from "@salvador/db";
import { logger } from "./logger";

// Migraciones versionadas: archivos NNNN_nombre.sql en packages/db/migrations (en Docker: /app/migrations).
// Se aplican al arrancar la API, en orden, una sola vez cada una (tabla schema_migrations),
// cada archivo en su propia transacción y con un candado para que no corran dos veces en paralelo.

const LOCK_ID = 7_270_301; // número fijo para pg_advisory_lock

function carpetaMigraciones(): string | null {
  const candidatas = [
    process.env.MIGRATIONS_DIR,
    path.resolve(process.cwd(), "migrations"),
    path.resolve(process.cwd(), "packages/db/migrations"),
    path.resolve(process.cwd(), "../../packages/db/migrations"),
  ].filter(Boolean) as string[];
  return candidatas.find((dir) => fs.existsSync(dir) && fs.statSync(dir).isDirectory()) ?? null;
}

export async function runMigrations(): Promise<{ aplicadas: string[]; total: number }> {
  const dir = carpetaMigraciones();
  if (!dir) {
    logger.warn("No se encontró la carpeta de migraciones (MIGRATIONS_DIR); se omiten.");
    return { aplicadas: [], total: 0 };
  }
  const archivos = fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}_[\w-]+\.sql$/.test(f))
    .sort();

  const client = await pool.connect();
  const aplicadas: string[] = [];
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY NOT NULL,
      applied_at timestamp with time zone DEFAULT now() NOT NULL
    )`);
    const { rows } = await client.query<{ id: string }>("SELECT id FROM schema_migrations");
    const hechas = new Set(rows.map((r) => r.id));

    for (const archivo of archivos) {
      const id = archivo.replace(/\.sql$/, "");
      if (hechas.has(id)) continue;
      const sql = fs.readFileSync(path.join(dir, archivo), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [id]);
        await client.query("COMMIT");
        aplicadas.push(id);
        logger.info({ migracion: id }, "Migración aplicada");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        // Se corta acá: las siguientes pueden depender de esta.
        throw new Error(`Falló la migración ${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return { aplicadas, total: archivos.length };
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]).catch(() => undefined);
    client.release();
  }
}
