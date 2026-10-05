import { Router, type IRouter } from "express";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db, guardiasTable, sectorsTable } from "@salvador/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();
router.use(requireAuth);

const MODALITIES = ["activa", "pasiva"] as const;
const TIME_RE = /^\d{2}:\d{2}$/;

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
    startTime: row.startTime,
    endTime: row.endTime,
    modality: row.modality,
    professionalName: row.professionalName,
    observations: row.observations,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
  };
}

router.get("/guardias", async (req, res): Promise<void> => {
  try {
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
      .orderBy(asc(guardiasTable.date), asc(guardiasTable.startTime));

    res.json(rows.map((r) => mapRow(r.guardia, r.sectorName, r.sectorShortName)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al listar guardias." });
  }
});

router.post("/guardias", async (req, res): Promise<void> => {
  try {
    const body = req.body ?? {};
    const sectorId = Number(body.sectorId);
    const date = String(body.date ?? "").slice(0, 10);
    const startTime = String(body.startTime ?? "").slice(0, 5);
    const endTime = String(body.endTime ?? "").slice(0, 5);
    const modality = String(body.modality ?? "activa").toLowerCase();
    const professionalName = String(body.professionalName ?? "").trim();
    const observations = String(body.observations ?? "").trim();

    if (!sectorId || Number.isNaN(sectorId)) {
      res.status(400).json({ message: "Sector obligatorio." });
      return;
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ message: "Fecha inválida." });
      return;
    }
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
      res.status(400).json({ message: "Hora inicio/fin inválida (HH:MM)." });
      return;
    }
    if (!MODALITIES.includes(modality as (typeof MODALITIES)[number])) {
      res.status(400).json({ message: "Modalidad inválida (activa, pasiva)." });
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

    const userId = (req as { user?: { id: number } }).user?.id ?? null;

    const [row] = await db
      .insert(guardiasTable)
      .values({
        sectorId,
        date,
        shift: `${startTime}-${endTime}`,
        startTime,
        endTime,
        modality,
        type: "",
        professionalName,
        observations,
        createdByUserId: userId,
      })
      .returning();

    res.status(201).json(mapRow(row, sector.name, sector.shortName));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al crear guardia." });
  }
});

router.delete("/guardias/:id", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ message: "ID inválido." });
      return;
    }
    await db.delete(guardiasTable).where(eq(guardiasTable.id, id));
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al eliminar guardia." });
  }
});

export default router;
