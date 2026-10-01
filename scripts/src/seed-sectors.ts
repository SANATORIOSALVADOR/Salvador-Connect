/**
 * Seed de sectores de ejemplo para desarrollo.
 * Uso:
 *   DATABASE_URL=... pnpm run db:seed-sectors
 */
import { eq } from "drizzle-orm";
import { db, sectorsTable } from "@workspace/db";

const SECTORS = [
  { name: "Sistemas", shortName: "SIS" },
  { name: "Enfermería", shortName: "ENF" },
  { name: "Médicos", shortName: "MED" },
  { name: "Administración", shortName: "ADM" },
  { name: "Mantenimiento", shortName: "MAN" },
  { name: "Diagnóstico por Imágenes", shortName: "IMG" },
  { name: "Laboratorio", shortName: "LAB" },
] as const;

async function main() {
  for (const sector of SECTORS) {
    const [existing] = await db
      .select({ id: sectorsTable.id })
      .from(sectorsTable)
      .where(eq(sectorsTable.shortName, sector.shortName))
      .limit(1);
    if (existing) {
      console.log(`Skip (ya existe): ${sector.name}`);
      continue;
    }
    await db.insert(sectorsTable).values({
      name: sector.name,
      shortName: sector.shortName,
      active: true,
    });
    console.log(`Creado: ${sector.name}`);
  }
  console.log("Seed de sectores finalizado.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
