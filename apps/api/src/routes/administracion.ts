import { Router, type IRouter } from "express";
import { and, asc, eq, gte, lte, like } from "drizzle-orm";
import { db, liquidacionItemsTable } from "@salvador/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();
router.use(requireAuth);

const TYPES = ["vencimiento", "liquidacion", "cheque", "seguro", "nota", "recordatorio"] as const;
const STATUSES = ["pendiente", "hecho", "anulado"] as const;

const FISCAL_CONFIG = {
  cuit: "30-68976794-6",
  terminacion: 6,
  razonSocial: "Sanatorio del Salvador",
  condicionIva: "Responsable Inscripto",
  empleador: true,
  iibb: "Córdoba",
  calendarioFuente: "Portal ARCA + IIBB Córdoba (datos reales del CUIT)",
};

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function isoDate(y: number, m0: number, day: number): string {
  const last = new Date(y, m0 + 1, 0).getDate();
  const d = Math.min(Math.max(1, day), last);
  return `${y}-${String(m0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function nextBusinessDay(iso: string): string {
  const [ys, ms, ds] = iso.split("-").map(Number);
  const dt = new Date(ys, ms - 1, ds, 12, 0, 0);
  const dow = dt.getDay();
  if (dow === 6) dt.setDate(dt.getDate() + 2);
  else if (dow === 0) dt.setDate(dt.getDate() + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function prevMonth(y: number, m1: number): { year: number; month: number } {
  if (m1 <= 1) return { year: y - 1, month: 12 };
  return { year: y, month: m1 - 1 };
}

type PlannedItem = {
  code: string;
  title: string;
  dueDate: string;
  notesExtra: string;
};

/** Vencimientos con fecha de vencimiento en el mes solicitado (calibrado portal real oct-2026). */
function planForMonth(year: number, month: number): PlannedItem[] {
  const m0 = month - 1;
  const prev = prevMonth(year, month);
  const prevLabel = `${MONTH_NAMES[prev.month - 1]} ${prev.year}`;
  const currLabel = `${MONTH_NAMES[m0]} ${year}`;
  const periodPrev = `${prev.year}${String(prev.month).padStart(2, "0")}00`;
  const periodCurr = `${year}${String(month).padStart(2, "0")}00`;

  return [
    {
      code: "SICORE_DJ",
      title: `SICORE — Declaración jurada — ${prevLabel}`,
      dueDate: nextBusinessDay(isoDate(year, m0, 13)),
      notesExtra: `Impuesto 220 · Concepto DJ · Período ${periodPrev}. Portal ARCA: vencimiento real del CUIT.`,
    },
    {
      code: "SUSS_DJ",
      title: `SUSS — Declaración jurada — ${prevLabel}`,
      dueDate: nextBusinessDay(isoDate(year, m0, 13)),
      notesExtra: `Impuesto 301 · Cargas sociales / SUSS · Período ${periodPrev}. Equivale a F.931 en el portal.`,
    },
    {
      code: "IVA_DJ",
      title: `IVA — Declaración jurada — ${prevLabel}`,
      dueDate: nextBusinessDay(isoDate(year, m0, 22)),
      notesExtra: `Impuesto 30 · IVA · Período ${periodPrev}. Día 22 según portal ARCA de este CUIT.`,
    },
    {
      code: "SICORE_GAN_PAGO",
      title: `SICORE Ganancias — Pago a cuenta — ${currLabel}`,
      dueDate: nextBusinessDay(isoDate(year, m0, 22)),
      notesExtra: `Impuesto 217 · Pago a cuenta · Período ${periodCurr}.`,
    },
    {
      code: "IIBB_DJ",
      title: `IIBB Córdoba — DJ — ${prevLabel}`,
      dueDate: nextBusinessDay(isoDate(year, m0, 19)),
      notesExtra: `Ingresos Brutos Córdoba · Período ${prev.year}/${String(prev.month).padStart(2, "0")}. Día 19 según portal DGR.`,
    },
    {
      code: "AGENTE_RET_Q1",
      title: `Agente de retención — Quincena 1 — ${currLabel}`,
      dueDate: nextBusinessDay(isoDate(year, m0, 23)),
      notesExtra: `Régimen retención · Período ${year}/${String(month).padStart(2, "0")}-1.`,
    },
    {
      code: "AGENTE_RET_Q2",
      title: `Agente de retención — Quincena 2 — ${prevLabel}`,
      dueDate: nextBusinessDay(isoDate(year, m0, 10)),
      notesExtra: `Régimen retención · Período ${prev.year}/${String(prev.month).padStart(2, "0")}-2.`,
    },
  ];
}

function mapRow(row: typeof liquidacionItemsTable.$inferSelect) {
  const notes = row.notes || "";
  const fiscal = /\[FISCAL:([A-Z0-9_]+):(\d{4}-\d{2})\]/.exec(notes);
  return {
    id: row.id,
    title: row.title,
    itemType: row.itemType,
    status: row.status,
    dueDate: row.dueDate,
    amount: row.amount,
    responsibleName: row.responsibleName,
    notes: row.notes,
    alertDays: row.alertDays,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    source: fiscal ? "fiscal" : "manual",
    fiscalCode: fiscal ? fiscal[1] : null,
    fiscalPeriod: fiscal ? fiscal[2] : null,
  };
}

router.get("/administracion/fiscal-config", (_req, res): void => {
  const sample = planForMonth(2026, 10);
  res.json({
    ...FISCAL_CONFIG,
    obligaciones: sample.map((r) => ({
      code: r.code,
      label: r.title.replace(/ — .*$/, ""),
    })),
  });
});

router.post("/administracion/generar-fiscal", async (req, res): Promise<void> => {
  try {
    const body = req.body ?? {};
    const now = new Date();
    let year = Number(body.year) || now.getFullYear();
    let month = Number(body.month);
    if (!month || month < 1 || month > 12) month = now.getMonth() + 1;
    const period = `${year}-${String(month).padStart(2, "0")}`;
    const planned = planForMonth(year, month);
    const created: ReturnType<typeof mapRow>[] = [];
    const skipped: string[] = [];

    for (const rule of planned) {
      const marker = `[FISCAL:${rule.code}:${period}]`;
      const existing = await db
        .select()
        .from(liquidacionItemsTable)
        .where(like(liquidacionItemsTable.notes, `%${marker}%`))
        .limit(1);
      if (existing.length) {
        skipped.push(rule.code);
        continue;
      }
      const [row] = await db
        .insert(liquidacionItemsTable)
        .values({
          title: rule.title,
          itemType: "vencimiento",
          status: "pendiente",
          dueDate: rule.dueDate,
          amount: "",
          responsibleName: "Administración",
          notes: `${marker}\nCUIT ${FISCAL_CONFIG.cuit}\n${rule.notesExtra}`,
          alertDays: 7,
          createdByUserId: req.authUser?.id ?? null,
        })
        .returning();
      if (row) created.push(mapRow(row));
    }

    res.json({
      period,
      cuit: FISCAL_CONFIG.cuit,
      terminacion: FISCAL_CONFIG.terminacion,
      fuente: FISCAL_CONFIG.calendarioFuente,
      created: created.length,
      skipped: skipped.length,
      skippedCodes: skipped,
      items: created,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al generar vencimientos fiscales." });
  }
});

router.get("/administracion", async (req, res): Promise<void> => {
  try {
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const itemType = typeof req.query.itemType === "string" ? req.query.itemType : undefined;
    const conditions = [];
    if (from) conditions.push(gte(liquidacionItemsTable.dueDate, from));
    if (to) conditions.push(lte(liquidacionItemsTable.dueDate, to));
    if (status && status !== "todos") conditions.push(eq(liquidacionItemsTable.status, status));
    if (itemType && itemType !== "todos") conditions.push(eq(liquidacionItemsTable.itemType, itemType));
    const rows = await db
      .select()
      .from(liquidacionItemsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(liquidacionItemsTable.dueDate));
    res.json(rows.map(mapRow));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al listar administración." });
  }
});

router.get("/administracion/upcoming", async (req, res): Promise<void> => {
  try {
    const days = Math.min(30, Math.max(1, Number(req.query.days) || 7));
    const today = new Date();
    const to = new Date(today);
    to.setDate(to.getDate() + days);
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const rows = await db
      .select()
      .from(liquidacionItemsTable)
      .where(
        and(
          eq(liquidacionItemsTable.status, "pendiente"),
          gte(liquidacionItemsTable.dueDate, iso(today)),
          lte(liquidacionItemsTable.dueDate, iso(to)),
        ),
      )
      .orderBy(asc(liquidacionItemsTable.dueDate));
    res.json(rows.map(mapRow));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al listar próximos vencimientos." });
  }
});

router.post("/administracion", async (req, res): Promise<void> => {
  try {
    const body = req.body ?? {};
    const title = String(body.title || "").trim();
    if (!title) {
      res.status(400).json({ message: "El título es obligatorio." });
      return;
    }
    const itemType = String(body.itemType || "vencimiento").toLowerCase();
    if (!TYPES.includes(itemType as (typeof TYPES)[number])) {
      res.status(400).json({ message: "Tipo inválido." });
      return;
    }
    const status = String(body.status || "pendiente").toLowerCase();
    if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
      res.status(400).json({ message: "Estado inválido." });
      return;
    }
    const dueDate = String(body.dueDate || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      res.status(400).json({ message: "Fecha inválida." });
      return;
    }
    const [row] = await db
      .insert(liquidacionItemsTable)
      .values({
        title,
        itemType,
        status,
        dueDate,
        amount: String(body.amount || "").trim(),
        responsibleName: String(body.responsibleName || "").trim(),
        notes: String(body.notes || "").trim(),
        alertDays: Number(body.alertDays) || 0,
        createdByUserId: req.authUser?.id ?? null,
      })
      .returning();
    res.status(201).json(mapRow(row));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al crear." });
  }
});

router.patch("/administracion/:id", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ message: "ID inválido." });
      return;
    }
    const body = req.body ?? {};
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title !== undefined) patch.title = String(body.title).trim();
    if (body.itemType !== undefined) {
      const t = String(body.itemType).toLowerCase();
      if (!TYPES.includes(t as (typeof TYPES)[number])) {
        res.status(400).json({ message: "Tipo inválido." });
        return;
      }
      patch.itemType = t;
    }
    if (body.status !== undefined) {
      const s = String(body.status).toLowerCase();
      if (!STATUSES.includes(s as (typeof STATUSES)[number])) {
        res.status(400).json({ message: "Estado inválido." });
        return;
      }
      patch.status = s;
    }
    if (body.dueDate !== undefined) {
      const d = String(body.dueDate).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        res.status(400).json({ message: "Fecha inválida." });
        return;
      }
      patch.dueDate = d;
    }
    if (body.amount !== undefined) patch.amount = String(body.amount).trim();
    if (body.responsibleName !== undefined) patch.responsibleName = String(body.responsibleName).trim();
    if (body.notes !== undefined) patch.notes = String(body.notes).trim();
    if (body.alertDays !== undefined) patch.alertDays = Number(body.alertDays) || 0;
    const [row] = await db.update(liquidacionItemsTable).set(patch).where(eq(liquidacionItemsTable.id, id)).returning();
    if (!row) {
      res.status(404).json({ message: "No encontrado." });
      return;
    }
    res.json(mapRow(row));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al actualizar." });
  }
});

router.delete("/administracion/:id", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ message: "ID inválido." });
      return;
    }
    await db.delete(liquidacionItemsTable).where(eq(liquidacionItemsTable.id, id));
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al eliminar." });
  }
});

export default router;
