import { Router, type IRouter } from "express";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db, liquidacionItemsTable } from "@salvador/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();
router.use(requireAuth);

const TYPES = ["vencimiento", "liquidacion", "cheque", "seguro", "nota", "recordatorio"] as const;
const STATUSES = ["pendiente", "hecho", "anulado"] as const;

function mapRow(row: typeof liquidacionItemsTable.$inferSelect) {
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
  };
}

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
    const rows = await db.select().from(liquidacionItemsTable).where(conditions.length ? and(...conditions) : undefined).orderBy(asc(liquidacionItemsTable.dueDate));
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
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const rows = await db.select().from(liquidacionItemsTable).where(and(eq(liquidacionItemsTable.status, "pendiente"), gte(liquidacionItemsTable.dueDate, iso(today)), lte(liquidacionItemsTable.dueDate, iso(to)))).orderBy(asc(liquidacionItemsTable.dueDate));
    res.json(rows.map(mapRow));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al listar próximos." });
  }
});

router.post("/administracion", async (req, res): Promise<void> => {
  try {
    const body = req.body ?? {};
    const title = String(body.title ?? "").trim();
    const itemType = String(body.itemType ?? "vencimiento").toLowerCase();
    const status = String(body.status ?? "pendiente").toLowerCase();
    const dueDate = String(body.dueDate ?? "").slice(0, 10);
    const amount = String(body.amount ?? "").trim();
    const responsibleName = String(body.responsibleName ?? "").trim();
    const notes = String(body.notes ?? "").trim();
    const alertDays = Number(body.alertDays ?? 7);
    if (!title) { res.status(400).json({ message: "Título obligatorio." }); return; }
    if (!TYPES.includes(itemType as (typeof TYPES)[number])) { res.status(400).json({ message: "Tipo inválido." }); return; }
    if (!STATUSES.includes(status as (typeof STATUSES)[number])) { res.status(400).json({ message: "Estado inválido." }); return; }
    if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) { res.status(400).json({ message: "Fecha inválida." }); return; }
    const userId = (req as { user?: { id: number } }).user?.id ?? null;
    const [row] = await db.insert(liquidacionItemsTable).values({ title, itemType, status, dueDate, amount, responsibleName, notes, alertDays: Number.isFinite(alertDays) ? alertDays : 7, createdByUserId: userId }).returning();
    res.status(201).json(mapRow(row));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al crear ítem." });
  }
});

router.patch("/administracion/:id", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) { res.status(400).json({ message: "ID inválido." }); return; }
    const body = req.body ?? {};
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title !== undefined) patch.title = String(body.title).trim();
    if (body.itemType !== undefined) {
      const t = String(body.itemType).toLowerCase();
      if (!TYPES.includes(t as (typeof TYPES)[number])) { res.status(400).json({ message: "Tipo inválido." }); return; }
      patch.itemType = t;
    }
    if (body.status !== undefined) {
      const s = String(body.status).toLowerCase();
      if (!STATUSES.includes(s as (typeof STATUSES)[number])) { res.status(400).json({ message: "Estado inválido." }); return; }
      patch.status = s;
    }
    if (body.dueDate !== undefined) {
      const d = String(body.dueDate).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { res.status(400).json({ message: "Fecha inválida." }); return; }
      patch.dueDate = d;
    }
    if (body.amount !== undefined) patch.amount = String(body.amount).trim();
    if (body.responsibleName !== undefined) patch.responsibleName = String(body.responsibleName).trim();
    if (body.notes !== undefined) patch.notes = String(body.notes).trim();
    if (body.alertDays !== undefined) patch.alertDays = Number(body.alertDays) || 0;
    const [row] = await db.update(liquidacionItemsTable).set(patch).where(eq(liquidacionItemsTable.id, id)).returning();
    if (!row) { res.status(404).json({ message: "No encontrado." }); return; }
    res.json(mapRow(row));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al actualizar." });
  }
});

router.delete("/administracion/:id", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) { res.status(400).json({ message: "ID inválido." }); return; }
    await db.delete(liquidacionItemsTable).where(eq(liquidacionItemsTable.id, id));
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al eliminar." });
  }
});

export default router;
