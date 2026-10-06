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
};

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function dayF931(term: number): number {
  if (term <= 1) return 11;
  if (term <= 3) return 12;
  if (term <= 5) return 13;
  if (term <= 7) return 14;
  return 15;
}

function dayIva(term: number): number {
  if (term <= 1) return 18;
  if (term <= 3) return 19;
  if (term <= 5) return 20;
  if (term <= 7) return 21;
  return 22;
}

function dayIibbCba(_term: number): number {
  return 15;
}

function isoDate(y: number, m0: number, day: number): string {
  const last = new Date(y, m0 + 1, 0).getDate();
  const d = Math.min(day, last);
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

type FiscalRule = {
  code: string;
  title: (monthLabel: string, year: number) => string;
  day: (term: number) => number;
  notesExtra: string;
};

function fiscalRules(): FiscalRule[] {
  const rules: FiscalRule[] = [
    {
      code: "IVA_F2002",
      title: (ml, y) => `IVA F.2002 — ${ml} ${y}`,
      day: dayIva,
      notesExtra: "Declaración e ingreso IVA (Responsable Inscripto). Generado por calendario fiscal interno.",
    },
  ];
  if (FISCAL_CONFIG.empleador) {
    rules.unshift({
      code: "F931",
      title: (ml, y) => `F.931 — Cargas sociales — ${ml} ${y}`,
      day: dayF931,
      notesExtra: "DDJJ e ingreso de aportes y contribuciones (empleador). Generado por calendario fiscal interno.",
    });
  }
  if (FISCAL_CONFIG.iibb.toLowerCase().includes("córdoba") || FISCAL_CONFIG.iibb.toLowerCase().includes("cordoba")) {
    rules.push({
      code: "IIBB_CBA",
      title: (ml, y) => `IIBB Córdoba — ${ml} ${y}`,
      day: dayIibbCba,
      notesExtra: "Ingresos Brutos Córdoba. Día orientativo (15); confirmar con contador / calendario DGR. Generado por calendario fiscal interno.",
    });
  }
  return rules;
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
  res.json({
    ...FISCAL_CONFIG,
    obligaciones: fiscalRules().map((r) => ({
      code: r.code,
      label: r.title("Mes", 0).replace(" — Mes 0", ""),
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
    const m0 = month - 1;
    const period = `${year}-${String(month).padStart(2, "0")}`;
    const monthLabel = MONTH_NAMES[m0];
    const term = FISCAL_CONFIG.terminacion;
    const rules = fiscalRules();
    const created: ReturnType<typeof mapRow>[] = [];
    const skipped: string[] = [];

    for (const rule of rules) {
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
      const due = nextBusinessDay(isoDate(year, m0, rule.day(term)));
      const [row] = await db
        .insert(liquidacionItemsTable)
        .values({
          title: rule.title(monthLabel, year),
          itemType: "vencimiento",
          status: "pendiente",
          dueDate: due,
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
      terminacion: term,
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
