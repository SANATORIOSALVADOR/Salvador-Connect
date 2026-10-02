import { Router, type IRouter } from "express";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db, guardiasTable, sectorsTable } from "@salvador/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();
router.use(requireAuth);

const SHIFTS = ["mañana", "tarde", "noche", "24h"] as const;
const MODALITIES = ["presencial", "retencion"] as const;
const TYPES = ["fija", "rotativa", "pasiva"] as const;

function mapRow(
  row: typeof guardiasTable.$inferSelect,
  sectorName?: string | null,
  sectorShort?: string | null,
) {
  return {
    id: row.id,
    sectorId: row.sectorId,
    sectorName: sectorName ?? null,
    sectorShortName: sectorShort ?? null,
    date: row.date,
    shift: row.shift,
    modality: row.modality,
    type: row.type,
    professionalName: row.professionalName,
    observations: row.observations,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
  };
}

/** GET /api/guardias?from=YYYY-MM-DD&to=YYYY-MM-DD&sectorId= */
router.get("/guardias", async (req, res): Promise<void> => {
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  const sectorId =
    typeof req.query.sectorId === "string" && req.query.sectorId
      ? Number(req.query.sectorId)
      : undefined;

  const conditions = [];
  if (from) conditions.push(gte(guardiasTable.date, from));
  if (to) conditions.push(lte(guardiasTable.date, to));
  if (sectorId && !Number.isNaN(sectorId)) conditions.push(eq(guardiasTable.sectorId, sectorId));

  const rows = await db
    .select({
      guardia: guardiasTable,
      sectorName: sectorsTable.name,
      sectorShortName: sectorsTable.shortName,
    })
    .from(guardiasTable)
    .leftJoin(sectorsTable, eq(guardiasTable.sectorId, sectorsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(guardiasTable.date), asc(guardiasTable.shift));

  res.json(
    rows.map((r) => mapRow(r.guardia, r.sectorName, r.sectorShortName)),
  );
});

/** POST /api/guardias */
router.post("/guardias", async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const sectorId = Number(body.sectorId);
  const date = String(body.date ?? "").slice(0, 10);
  const shift = String(body.shift ?? "").toLowerCase();
  const modality = String(body.modality ?? "presencial").toLowerCase();
  const type = String(body.type ?? "fija").toLowerCase();
  const professionalName = String(body.professionalName ?? "").trim();
  const observations = String(body.observations ?? "").trim();

  if (!sectorId || Number.isNaN(sectorId)) {
    res.status(400).json({ message: "Sector obligatorio." });
    return;
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ message: "Fecha inválida (YYYY-MM-DD)." });
    return;
  }
  if (!SHIFTS.includes(shift as (typeof SHIFTS)[number])) {
    res.status(400).json({ message: "Turno inválido (mañana, tarde, noche, 24h)." });
    return;
  }
  if (!MODALITIES.includes(modality as (typeof MODALITIES)[number])) {
    res.status(400).json({ message: "Modalidad inválida (presencial, retencion)." });
    return;
  }
  if (!TYPES.includes(type as (typeof TYPES)[number])) {
    res.status(400).json({ message: "Tipo inválido (fija, rotativa, pasiva)." });
    return;
  }
  if (!professionalName) {
    res.status(400).json({ message: "Profesional obligatorio." });
    return;
  }

  const [sector] = await db.select().from(sectorsTable).where(eq(sectorsTable.id, sectorId)).limit(1);
  if (!sector) {
    res.status(400).json({ message: "Sector no encontrado." });
    return;
  }

  const [created] = await db
    .insert(guardiasTable)
    .values({
      sectorId,
      date,
      shift,
      modality,
      type,
      professionalName,
      observations,
      createdByUserId: req.authUser?.id ?? null,
    })
    .returning();

  res.status(201).json(mapRow(created, sector.name, sector.shortName));
});

/** PATCH /api/guardias/:id */
router.patch("/guardias/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id || Number.isNaN(id)) {
    res.status(400).json({ message: "ID inválido." });
    return;
  }
  const body = req.body ?? {};
  const patch: Partial<typeof guardiasTable.$inferInsert> = {};
  if (body.sectorId != null) patch.sectorId = Number(body.sectorId);
  if (body.date != null) patch.date = String(body.date).slice(0, 10);
  if (body.shift != null) patch.shift = String(body.shift).toLowerCase();
  if (body.modality != null) patch.modality = String(body.modality).toLowerCase();
  if (body.type != null) patch.type = String(body.type).toLowerCase();
  if (body.professionalName != null) patch.professionalName = String(body.professionalName).trim();
  if (body.observations != null) patch.observations = String(body.observations).trim();

  const [updated] = await db
    .update(guardiasTable)
    .set(patch)
    .where(eq(guardiasTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ message: "Guardia no encontrada." });
    return;
  }
  const [sector] = await db
    .select()
    .from(sectorsTable)
    .where(eq(sectorsTable.id, updated.sectorId))
    .limit(1);
  res.json(mapRow(updated, sector?.name, sector?.shortName));
});

/** DELETE /api/guardias/:id */
router.delete("/guardias/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id || Number.isNaN(id)) {
    res.status(400).json({ message: "ID inválido." });
    return;
  }
  const [deleted] = await db.delete(guardiasTable).where(eq(guardiasTable.id, id)).returning();
  if (!deleted) {
    res.status(404).json({ message: "Guardia no encontrada." });
    return;
  }
  res.status(204).send();
});

export default router;
