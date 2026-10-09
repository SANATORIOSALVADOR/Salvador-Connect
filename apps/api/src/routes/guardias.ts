import { Router, type IRouter } from "express";
import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db, guardiasTable, sectorsTable } from "@salvador/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();
router.use(requireAuth);

const MODALITIES = ["activa", "pasiva"] as const;
const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function mapRow(
  row: typeof guardiasTable.$inferSelect,
  sectorName?: string | null,
  sectorShort?: string | null,
) {
  const endDate = row.endDate || row.date;
  return {
    id: row.id,
    sectorId: row.sectorId,
    sectorName: sectorName ?? null,
    sectorShortName: sectorShort ?? null,
    date: row.date,
    endDate,
    startTime: row.startTime,
    endTime: row.endTime,
    modality: row.modality,
    professionalName: row.professionalName,
    observations: row.observations,
    tagLabel: row.tagLabel || "",
    tagColor: row.tagColor || "",
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
  };
}

type ParsedGuardia = {
  sectorId: number;
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  modality: string;
  professionalName: string;
  observations: string;
  tagLabel: string;
  tagColor: string;
};

function parseBody(body: Record<string, unknown>): { ok: true; data: ParsedGuardia } | { ok: false; message: string } {
  const sectorId = Number(body.sectorId);
  const date = String(body.date ?? body.startDate ?? "").slice(0, 10);
  let endDate = String(body.endDate ?? "").slice(0, 10);
  if (!endDate || !DATE_RE.test(endDate)) endDate = date;
  const startTime = String(body.startTime ?? "").slice(0, 5);
  const endTime = String(body.endTime ?? "").slice(0, 5);
  const modality = String(body.modality ?? "activa").toLowerCase();
  const professionalName = String(body.professionalName ?? "").trim();
  const observations = String(body.observations ?? "").trim();
  const tagLabel = String(body.tagLabel ?? "").trim().slice(0, 40);
  let tagColor = String(body.tagColor ?? "").trim().slice(0, 20);
  if (tagLabel && !tagColor) tagColor = "#0d9488";
  if (!tagLabel) tagColor = "";

  if (!sectorId || Number.isNaN(sectorId)) return { ok: false, message: "Sector obligatorio." };
  if (!date || !DATE_RE.test(date)) return { ok: false, message: "Fecha de inicio inválida." };
  if (!DATE_RE.test(endDate)) return { ok: false, message: "Fecha de fin inválida." };
  if (endDate < date) return { ok: false, message: "La fecha de fin no puede ser anterior a la de inicio." };
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
    return { ok: false, message: "Hora inicio/fin inválida (HH:MM)." };
  }
  if (date === endDate && endTime < startTime) {
    return { ok: false, message: "En el mismo día, la hora de fin debe ser posterior a la de inicio." };
  }
  if (!MODALITIES.includes(modality as (typeof MODALITIES)[number])) {
    return { ok: false, message: "Modalidad inválida (activa, pasiva)." };
  }
  if (!professionalName) return { ok: false, message: "Profesional obligatorio." };

  return {
    ok: true,
    data: { sectorId, date, endDate, startTime, endTime, modality, professionalName, observations, tagLabel, tagColor },
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
    if (from && to) {
      conditions.push(lte(guardiasTable.date, to));
      conditions.push(sql`COALESCE(${guardiasTable.endDate}, ${guardiasTable.date}) >= ${from}`);
    } else if (from) {
      conditions.push(sql`COALESCE(${guardiasTable.endDate}, ${guardiasTable.date}) >= ${from}`);
    } else if (to) {
      conditions.push(lte(guardiasTable.date, to));
    }
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
    const parsed = parseBody(req.body ?? {});
    if (!parsed.ok) {
      res.status(400).json({ message: parsed.message });
      return;
    }
    const data = parsed.data;

    const [sector] = await db.select().from(sectorsTable).where(eq(sectorsTable.id, data.sectorId)).limit(1);
    if (!sector) {
      res.status(400).json({ message: "Sector no encontrado." });
      return;
    }

    const authUser = (req as { authUser?: { id: number } }).authUser;
    const userId = authUser?.id ?? null;

    const [row] = await db
      .insert(guardiasTable)
      .values({
        sectorId: data.sectorId,
        date: data.date,
        endDate: data.endDate,
        shift: `${data.startTime}-${data.endTime}`,
        startTime: data.startTime,
        endTime: data.endTime,
        modality: data.modality,
        type: "",
        professionalName: data.professionalName,
        observations: data.observations,
        tagLabel: data.tagLabel,
        tagColor: data.tagColor,
        createdByUserId: userId,
      })
      .returning();

    res.status(201).json(mapRow(row, sector.name, sector.shortName));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al crear guardia." });
  }
});

router.patch("/guardias/:id", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ message: "ID inválido." });
      return;
    }

    const parsed = parseBody(req.body ?? {});
    if (!parsed.ok) {
      res.status(400).json({ message: parsed.message });
      return;
    }
    const data = parsed.data;

    const [sector] = await db.select().from(sectorsTable).where(eq(sectorsTable.id, data.sectorId)).limit(1);
    if (!sector) {
      res.status(400).json({ message: "Sector no encontrado." });
      return;
    }

    const [row] = await db
      .update(guardiasTable)
      .set({
        sectorId: data.sectorId,
        date: data.date,
        endDate: data.endDate,
        shift: `${data.startTime}-${data.endTime}`,
        startTime: data.startTime,
        endTime: data.endTime,
        modality: data.modality,
        professionalName: data.professionalName,
        observations: data.observations,
        tagLabel: data.tagLabel,
        tagColor: data.tagColor,
      })
      .where(eq(guardiasTable.id, id))
      .returning();

    if (!row) {
      res.status(404).json({ message: "Guardia no encontrada." });
      return;
    }

    res.json(mapRow(row, sector.name, sector.shortName));
  } catch (err) {
    console.error("[guardias.patch]", err);
    res.status(500).json({ message: "Error al modificar la guardia." });
  }
});

router.delete("/guardias/:id", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ message: "ID inválido." });
      return;
    }
    const [deleted] = await db.delete(guardiasTable).where(eq(guardiasTable.id, id)).returning({ id: guardiasTable.id });
    if (!deleted) {
      res.status(404).json({ message: "Guardia no encontrada." });
      return;
    }
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al eliminar guardia." });
  }
});

export default router;
