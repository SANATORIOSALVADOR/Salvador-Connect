import { Router, type IRouter } from "express";
import { and, asc, eq, lte, ne, sql } from "drizzle-orm";
import { db, guardiasTable, sectorsTable } from "@salvador/db";
import { requireAuth, requireGuardiasWrite, requireModule } from "../lib/auth";

const router: IRouter = Router();
router.use(requireAuth);
router.use(requireModule("guardias"));

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

function parseHM(t: string): number {
  const [h, m] = (t || "00:00").slice(0, 5).split(":").map((x) => Number(x) || 0);
  return h * 60 + m;
}

function rangeToMinutes(date: string, endDate: string, startTime: string, endTime: string): { start: number; end: number } {
  const dayMs = (iso: string) => {
    const [y, mo, d] = iso.split("-").map(Number);
    return Date.UTC(y, mo - 1, d) / 60000;
  };
  const start = dayMs(date) + parseHM(startTime);
  let end = dayMs(endDate || date) + parseHM(endTime);
  if (end <= start) end += 24 * 60;
  return { start, end };
}

function rangesOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

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
  if (endDate < date) return { ok: false, message: "La fecha de fin no puede ser anterior al inicio." };
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) return { ok: false, message: "Horario inválido." };
  if (!MODALITIES.includes(modality as (typeof MODALITIES)[number])) {
    return { ok: false, message: "Modalidad inválida (activa o pasiva)." };
  }
  if (!professionalName || professionalName.length < 2) {
    return { ok: false, message: "Nombre del profesional obligatorio." };
  }
  const days = (Date.parse(endDate + "T12:00:00") - Date.parse(date + "T12:00:00")) / 86400000;
  if (days > 7) return { ok: false, message: "El rango no puede superar 7 días. Cargá turnos separados." };

  return {
    ok: true,
    data: { sectorId, date, endDate, startTime, endTime, modality, professionalName, observations, tagLabel, tagColor },
  };
}

async function findOverlap(
  professionalName: string,
  date: string,
  endDate: string,
  startTime: string,
  endTime: string,
  excludeId?: number,
): Promise<{ id: number; sectorId: number; date: string; startTime: string; endTime: string } | null> {
  const name = professionalName.trim().toLowerCase();
  const candidates = await db
    .select()
    .from(guardiasTable)
    .where(
      and(
        sql`lower(${guardiasTable.professionalName}) = ${name}`,
        lte(guardiasTable.date, endDate),
        sql`coalesce(${guardiasTable.endDate}, ${guardiasTable.date}) >= ${date}`,
        excludeId ? ne(guardiasTable.id, excludeId) : sql`true`,
      ),
    );

  const target = rangeToMinutes(date, endDate, startTime, endTime);
  for (const c of candidates) {
    const other = rangeToMinutes(c.date, c.endDate || c.date, c.startTime, c.endTime);
    if (rangesOverlap(target, other)) {
      return { id: c.id, sectorId: c.sectorId, date: c.date, startTime: c.startTime, endTime: c.endTime };
    }
  }
  return null;
}

router.get("/guardias/profesionales", async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .selectDistinct({ name: guardiasTable.professionalName })
      .from(guardiasTable)
      .orderBy(asc(guardiasTable.professionalName));
    const names = rows
      .map((r) => (r.name || "").trim())
      .filter(Boolean)
      .filter((n, i, arr) => arr.findIndex((x) => x.toLowerCase() === n.toLowerCase()) === i);
    res.json(names);
  } catch (err) {
    console.error("[guardias.profesionales]", err);
    res.status(500).json({ message: "Error al listar profesionales." });
  }
});

router.get("/guardias", async (req, res): Promise<void> => {
  try {
    const from = String(req.query.from ?? "").slice(0, 10);
    const to = String(req.query.to ?? "").slice(0, 10);
    const sectorId = req.query.sectorId ? Number(req.query.sectorId) : null;

    const conditions = [];
    if (from && DATE_RE.test(from) && to && DATE_RE.test(to)) {
      conditions.push(lte(guardiasTable.date, to));
      conditions.push(sql`coalesce(${guardiasTable.endDate}, ${guardiasTable.date}) >= ${from}`);
    }
    if (sectorId && !Number.isNaN(sectorId)) {
      conditions.push(eq(guardiasTable.sectorId, sectorId));
    }

    const rows = await db
      .select({
        g: guardiasTable,
        sectorName: sectorsTable.name,
        sectorShort: sectorsTable.shortName,
      })
      .from(guardiasTable)
      .leftJoin(sectorsTable, eq(guardiasTable.sectorId, sectorsTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(guardiasTable.date), asc(guardiasTable.startTime), asc(guardiasTable.id));

    res.json(rows.map((r) => mapRow(r.g, r.sectorName, r.sectorShort)));
  } catch (err) {
    console.error("[guardias.list]", err);
    res.status(500).json({ message: "Error al listar guardias." });
  }
});

router.post("/guardias", requireGuardiasWrite, async (req, res): Promise<void> => {
  try {
    const parsed = parseBody(req.body ?? {});
    if (!parsed.ok) {
      res.status(400).json({ message: parsed.message });
      return;
    }
    const data = parsed.data;
    const allowOverlap = Boolean((req.body as { allowOverlap?: boolean })?.allowOverlap);

    const [sector] = await db.select().from(sectorsTable).where(eq(sectorsTable.id, data.sectorId)).limit(1);
    if (!sector) {
      res.status(400).json({ message: "Sector no encontrado." });
      return;
    }

    if (!allowOverlap) {
      const overlap = await findOverlap(data.professionalName, data.date, data.endDate, data.startTime, data.endTime);
      if (overlap) {
        res.status(409).json({
          message: `El profesional ya tiene otra guardia que se solapa (${overlap.date} ${overlap.startTime}\u2013${overlap.endTime}). Marc\u00e1 \"permitir solape\" si es intencional.`,
          overlap,
        });
        return;
      }
    }

    const userId = req.authUser?.id ?? null;
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
    console.error("[guardias.create]", err);
    res.status(500).json({ message: "Error al crear guardia." });
  }
});

router.patch("/guardias/:id", requireGuardiasWrite, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ message: "ID inv\u00e1lido." });
      return;
    }

    const parsed = parseBody(req.body ?? {});
    if (!parsed.ok) {
      res.status(400).json({ message: parsed.message });
      return;
    }
    const data = parsed.data;
    const allowOverlap = Boolean((req.body as { allowOverlap?: boolean })?.allowOverlap);

    const [sector] = await db.select().from(sectorsTable).where(eq(sectorsTable.id, data.sectorId)).limit(1);
    if (!sector) {
      res.status(400).json({ message: "Sector no encontrado." });
      return;
    }

    if (!allowOverlap) {
      const overlap = await findOverlap(data.professionalName, data.date, data.endDate, data.startTime, data.endTime, id);
      if (overlap) {
        res.status(409).json({
          message: `El profesional ya tiene otra guardia que se solapa (${overlap.date} ${overlap.startTime}\u2013${overlap.endTime}).`,
          overlap,
        });
        return;
      }
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

router.delete("/guardias/:id", requireGuardiasWrite, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ message: "ID inv\u00e1lido." });
      return;
    }
    const [existing] = await db.select().from(guardiasTable).where(eq(guardiasTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ message: "Guardia no encontrada." });
      return;
    }
    console.info("[guardias.delete]", {
      id,
      by: req.authUser?.id,
      username: req.authUser?.username,
      professional: existing.professionalName,
      date: existing.date,
      sectorId: existing.sectorId,
    });
    await db.delete(guardiasTable).where(eq(guardiasTable.id, id));
    res.status(204).end();
  } catch (err) {
    console.error("[guardias.delete]", err);
    res.status(500).json({ message: "Error al eliminar guardia." });
  }
});

export default router;
