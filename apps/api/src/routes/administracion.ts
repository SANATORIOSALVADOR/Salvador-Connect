import { Router, type IRouter } from "express";
import { and, asc, eq, gte, inArray, lte, like } from "drizzle-orm";
import { db, liquidacionItemsTable } from "@salvador/db";
import { requireAuth, requireLevel, requireModuleAccess } from "../lib/auth";

const router: IRouter = Router();
router.use("/administracion", requireAuth, requireModuleAccess("administracion"));

const TYPES = ["vencimiento", "pago", "cheque", "seguro", "recordatorio", "nota", "liquidacion"] as const;
const STATUSES = ["pendiente", "cumplido", "cancelado"] as const;
/** Valores viejos guardados por versiones anteriores de la API. */
const STATUS_ALIASES: Record<string, (typeof STATUSES)[number]> = { hecho: "cumplido", anulado: "cancelado" };
const FISCAL_MARKER_RE = /\[FISCAL:([A-Z0-9_]+):(\d{4}-\d{2})\]/;

function normalizeStatus(value: unknown): (typeof STATUSES)[number] | null {
  const s = String(value ?? "").trim().toLowerCase();
  const n = STATUS_ALIASES[s] ?? s;
  return (STATUSES as readonly string[]).includes(n) ? (n as (typeof STATUSES)[number]) : null;
}

/** Estados en DB que corresponden a un estado normalizado (incluye alias viejos). */
function statusDbValues(status: (typeof STATUSES)[number]): string[] {
  return [status, ...Object.entries(STATUS_ALIASES).filter(([, v]) => v === status).map(([k]) => k)];
}

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function clampAlertDays(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 7;
  return Math.min(90, Math.max(0, Math.round(n)));
}

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

/** Domingo de Pascua (algoritmo anónimo gregoriano). */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 12);
}

/**
 * Feriados de "puente turístico": se fijan por decreto cada año.
 * Agregarlos acá (YYYY-MM-DD) cuando se publique el decreto.
 */
const FERIADOS_PUENTE: string[] = [];

/** Feriados nacionales (Ley 27.399): inamovibles, Carnaval, Viernes Santo y trasladables. */
function argentineHolidays(year: number): Set<string> {
  const out = new Set<string>(FERIADOS_PUENTE.filter((d) => d.startsWith(`${year}-`)));
  for (const md of ["01-01", "03-24", "04-02", "05-01", "05-25", "06-20", "07-09", "12-08", "12-25"]) {
    out.add(`${year}-${md}`);
  }

  const easter = easterSunday(year);
  const fromEaster = (days: number) => {
    const d = new Date(easter);
    d.setDate(d.getDate() + days);
    return isoLocal(d);
  };
  out.add(fromEaster(-48)); // Carnaval lunes
  out.add(fromEaster(-47)); // Carnaval martes
  out.add(fromEaster(-2)); // Viernes Santo

  // Trasladables: mar/mié → lunes anterior; jue/vie → lunes siguiente.
  for (const [m, d] of [[6, 17], [8, 17], [10, 12], [11, 20]] as const) {
    const dt = new Date(year, m - 1, d, 12);
    const dow = dt.getDay();
    if (dow === 2) dt.setDate(dt.getDate() - 1);
    else if (dow === 3) dt.setDate(dt.getDate() - 2);
    else if (dow === 4) dt.setDate(dt.getDate() + 4);
    else if (dow === 5) dt.setDate(dt.getDate() + 3);
    out.add(isoLocal(dt));
  }
  return out;
}

/** Si el vencimiento cae en fin de semana o feriado, pasa al siguiente día hábil. */
function nextBusinessDay(iso: string): string {
  const [ys, ms, ds] = iso.split("-").map(Number);
  const dt = new Date(ys, ms - 1, ds, 12, 0, 0);
  let holidays = argentineHolidays(dt.getFullYear());
  for (let guard = 0; guard < 15; guard++) {
    const dow = dt.getDay();
    const cur = isoLocal(dt);
    if (dow !== 0 && dow !== 6 && !holidays.has(cur)) return cur;
    dt.setDate(dt.getDate() + 1);
    if (dt.getMonth() === 0 && dt.getDate() === 1) holidays = argentineHolidays(dt.getFullYear());
  }
  return isoLocal(dt);
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
  const fiscal = FISCAL_MARKER_RE.exec(notes);
  return {
    id: row.id,
    title: row.title,
    itemType: row.itemType,
    status: normalizeStatus(row.status) ?? row.status,
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
  const now = new Date();
  const sample = planForMonth(now.getFullYear(), now.getMonth() + 1);
  res.json({
    ...FISCAL_CONFIG,
    obligaciones: sample.map((r) => ({
      code: r.code,
      label: r.title.replace(/ — .*$/, ""),
    })),
  });
});

router.post("/administracion/generar-fiscal", requireLevel("administracion", "total"), async (req, res): Promise<void> => {
  try {
    const body = req.body ?? {};
    const now = new Date();
    const year = Number(body.year) || now.getFullYear();
    let month = Number(body.month);
    if (!month || month < 1 || month > 12) month = now.getMonth() + 1;
    if (year < 2020 || year > 2100) {
      res.status(400).json({ message: "Año inválido." });
      return;
    }
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
    const rawType = req.query.itemType ?? req.query.type;
    const itemType = typeof rawType === "string" ? rawType : undefined;
    const conditions = [];
    if (from) conditions.push(gte(liquidacionItemsTable.dueDate, from));
    if (to) conditions.push(lte(liquidacionItemsTable.dueDate, to));
    if (status && status !== "todos") {
      const st = normalizeStatus(status);
      if (!st) {
        res.status(400).json({ message: "Estado inválido." });
        return;
      }
      conditions.push(inArray(liquidacionItemsTable.status, statusDbValues(st)));
    }
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
    const to = new Date();
    to.setDate(to.getDate() + days);
    // Incluye los pendientes ya vencidos: son los más urgentes.
    const rows = await db
      .select()
      .from(liquidacionItemsTable)
      .where(and(eq(liquidacionItemsTable.status, "pendiente"), lte(liquidacionItemsTable.dueDate, isoLocal(to))))
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
    const status = normalizeStatus(body.status || "pendiente");
    if (!status) {
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
        alertDays: clampAlertDays(body.alertDays),
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
    const [current] = await db.select().from(liquidacionItemsTable).where(eq(liquidacionItemsTable.id, id)).limit(1);
    if (!current) {
      res.status(404).json({ message: "No encontrado." });
      return;
    }
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title) {
        res.status(400).json({ message: "El título es obligatorio." });
        return;
      }
      patch.title = title;
    }
    if (body.itemType !== undefined) {
      const t = String(body.itemType).toLowerCase();
      if (!TYPES.includes(t as (typeof TYPES)[number])) {
        res.status(400).json({ message: "Tipo inválido." });
        return;
      }
      patch.itemType = t;
    }
    if (body.status !== undefined) {
      const s = normalizeStatus(body.status);
      if (!s) {
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
    if (body.notes !== undefined) {
      // La marca [FISCAL:...] evita duplicar al regenerar el mes: se conserva aunque se editen las notas.
      let notes = String(body.notes).trim();
      const marker = FISCAL_MARKER_RE.exec(current.notes || "");
      if (marker && !notes.includes(marker[0])) notes = `${marker[0]}\n${notes}`.trim();
      patch.notes = notes;
    }
    if (body.alertDays !== undefined) patch.alertDays = clampAlertDays(body.alertDays);
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
    const [deleted] = await db
      .delete(liquidacionItemsTable)
      .where(eq(liquidacionItemsTable.id, id))
      .returning({ id: liquidacionItemsTable.id });
    if (!deleted) {
      res.status(404).json({ message: "No encontrado." });
      return;
    }
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al eliminar." });
  }
});

export default router;
