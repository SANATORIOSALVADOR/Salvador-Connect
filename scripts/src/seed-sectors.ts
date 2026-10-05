import { eq } from "drizzle-orm";
import { db, sectorsTable } from "@salvador/db";

const SECTORS = [
  { name: "Guardia Central", shortName: "GCE" },
  { name: "UTI Neo", shortName: "UNE" },
  { name: "UTI UCO", shortName: "UCO" },
  { name: "Piso Gineco", shortName: "GIN" },
  { name: "Piso Clínica Médica", shortName: "PCM" },
  { name: "Residentes", shortName: "RES" },
  { name: "Sistemas", shortName: "SIS" },
  { name: "Enfermería", shortName: "ENF" },
  { name: "Administración", shortName: "ADM" },
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
