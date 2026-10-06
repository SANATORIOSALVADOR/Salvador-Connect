import { Router, type IRouter } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, inventoryItemsTable, inventoryMovementsTable, sectorsTable } from "@salvador/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();
router.use(requireAuth);

const STATUSES = ["activo", "en_reparacion", "baja", "reservado"] as const;
const CATEGORIES = ["equipo_medico", "informatico", "mobiliario", "infraestructura", "otro"] as const;

function canWrite(role?: string) {
  return role === "superadmin" || role === "responsable";
}

function mapItem(row: typeof inventoryItemsTable.$inferSelect, sectorName?: string | null) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    serialNumber: row.serialNumber,
    status: row.status,
    sectorId: row.sectorId,
    sectorName: sectorName ?? null,
    locationNote: row.locationNote,
    acquiredAt: row.acquiredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

router.get("/inventario", async (req, res): Promise<void> => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const sectorId = req.query.sectorId ? Number(req.query.sectorId) : undefined;
    const conditions = [];
    if (status && status !== "todos") conditions.push(eq(inventoryItemsTable.status, status));
    if (sectorId && !Number.isNaN(sectorId)) conditions.push(eq(inventoryItemsTable.sectorId, sectorId));
    const rows = await db
      .select({ item: inventoryItemsTable, sectorName: sectorsTable.name })
      .from(inventoryItemsTable)
      .leftJoin(sectorsTable, eq(inventoryItemsTable.sectorId, sectorsTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(inventoryItemsTable.name));
    res.json(rows.map((r) => mapItem(r.item, r.sectorName)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al listar inventario." });
  }
});

router.get("/inventario/:id/movimientos", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) { res.status(400).json({ message: "ID inválido." }); return; }
    const rows = await db.select().from(inventoryMovementsTable).where(eq(inventoryMovementsTable.itemId, id)).orderBy(desc(inventoryMovementsTable.movedAt));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al listar movimientos." });
  }
});

router.post("/inventario", async (req, res): Promise<void> => {
  try {
    if (!canWrite(req.authUser?.role)) { res.status(403).json({ message: "Sin permiso para crear activos." }); return; }
    const body = req.body ?? {};
    const name = String(body.name || "").trim();
    if (!name) { res.status(400).json({ message: "El nombre es obligatorio." }); return; }
    const category = String(body.category || "otro").toLowerCase();
    const status = String(body.status || "activo").toLowerCase();
    if (!STATUSES.includes(status as (typeof STATUSES)[number])) { res.status(400).json({ message: "Estado inválido." }); return; }
    const sectorId = body.sectorId != null && body.sectorId !== "" ? Number(body.sectorId) : null;
    const acquiredAt = body.acquiredAt && /^\d{4}-\d{2}-\d{2}$/.test(String(body.acquiredAt).slice(0, 10)) ? String(body.acquiredAt).slice(0, 10) : null;
    const [row] = await db.insert(inventoryItemsTable).values({
      name,
      category: CATEGORIES.includes(category as (typeof CATEGORIES)[number]) ? category : "otro",
      serialNumber: body.serialNumber ? String(body.serialNumber).trim() : null,
      status,
      sectorId: sectorId && !Number.isNaN(sectorId) ? sectorId : null,
      locationNote: String(body.locationNote || "").trim(),
      acquiredAt,
    }).returning();
    if (row?.sectorId) {
      await db.insert(inventoryMovementsTable).values({
        itemId: row.id, fromSectorId: null, toSectorId: row.sectorId, note: "Alta inicial", movedByUserId: req.authUser?.id ?? null,
      });
    }
    res.status(201).json(mapItem(row));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al crear activo." });
  }
});

router.patch("/inventario/:id", async (req, res): Promise<void> => {
  try {
    if (!canWrite(req.authUser?.role)) { res.status(403).json({ message: "Sin permiso para editar activos." }); return; }
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) { res.status(400).json({ message: "ID inválido." }); return; }
    const body = req.body ?? {};
    const [current] = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.id, id)).limit(1);
    if (!current) { res.status(404).json({ message: "No encontrado." }); return; }
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) patch.name = String(body.name).trim();
    if (body.category !== undefined) patch.category = String(body.category).trim().toLowerCase();
    if (body.serialNumber !== undefined) patch.serialNumber = body.serialNumber ? String(body.serialNumber).trim() : null;
    if (body.status !== undefined) {
      const s = String(body.status).toLowerCase();
      if (!STATUSES.includes(s as (typeof STATUSES)[number])) { res.status(400).json({ message: "Estado inválido." }); return; }
      patch.status = s;
    }
    if (body.locationNote !== undefined) patch.locationNote = String(body.locationNote).trim();
    if (body.acquiredAt !== undefined) {
      const d = body.acquiredAt ? String(body.acquiredAt).slice(0, 10) : null;
      patch.acquiredAt = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
    }
    let newSectorId = current.sectorId;
    if (body.sectorId !== undefined) {
      newSectorId = body.sectorId === null || body.sectorId === "" ? null : Number(body.sectorId);
      if (newSectorId !== null && Number.isNaN(newSectorId)) { res.status(400).json({ message: "Sector inválido." }); return; }
      patch.sectorId = newSectorId;
    }
    const [row] = await db.update(inventoryItemsTable).set(patch).where(eq(inventoryItemsTable.id, id)).returning();
    if (newSectorId !== current.sectorId) {
      await db.insert(inventoryMovementsTable).values({
        itemId: id, fromSectorId: current.sectorId, toSectorId: newSectorId,
        note: String(body.moveNote || "Reasignación de sector").trim(), movedByUserId: req.authUser?.id ?? null,
      });
    }
    res.json(mapItem(row));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al actualizar activo." });
  }
});

router.delete("/inventario/:id", async (req, res): Promise<void> => {
  try {
    if (!canWrite(req.authUser?.role)) { res.status(403).json({ message: "Sin permiso para eliminar activos." }); return; }
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) { res.status(400).json({ message: "ID inválido." }); return; }
    await db.delete(inventoryItemsTable).where(eq(inventoryItemsTable.id, id));
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al eliminar activo." });
  }
});

export default router;
