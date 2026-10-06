import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db, instructivosTable, sectorsTable } from "@salvador/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();
router.use(requireAuth);

function canWrite(role?: string) {
  return role === "superadmin" || role === "responsable";
}

function mapRow(row: typeof instructivosTable.$inferSelect, sectorName?: string | null) {
  return {
    id: row.id,
    title: row.title,
    sectorId: row.sectorId,
    sectorName: sectorName ?? null,
    filePath: row.filePath,
    version: row.version,
    publishedAt: row.publishedAt,
    createdByUserId: row.createdByUserId,
  };
}

router.get("/instructivos", async (req, res): Promise<void> => {
  try {
    const sectorId = req.query.sectorId ? Number(req.query.sectorId) : undefined;
    const conditions = [];
    if (sectorId && !Number.isNaN(sectorId)) conditions.push(eq(instructivosTable.sectorId, sectorId));
    const rows = await db
      .select({ doc: instructivosTable, sectorName: sectorsTable.name })
      .from(instructivosTable)
      .leftJoin(sectorsTable, eq(instructivosTable.sectorId, sectorsTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(instructivosTable.title));
    res.json(rows.map((r) => mapRow(r.doc, r.sectorName)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al listar instructivos." });
  }
});

router.post("/instructivos", async (req, res): Promise<void> => {
  try {
    if (!canWrite(req.authUser?.role)) { res.status(403).json({ message: "Sin permiso para crear instructivos." }); return; }
    const body = req.body ?? {};
    const title = String(body.title || "").trim();
    const filePath = String(body.filePath || "").trim();
    if (!title || !filePath) { res.status(400).json({ message: "Título y ruta/enlace del PDF son obligatorios." }); return; }
    const sectorId = body.sectorId != null && body.sectorId !== "" ? Number(body.sectorId) : null;
    const version = String(body.version || "1.0").trim() || "1.0";
    const [row] = await db.insert(instructivosTable).values({
      title, filePath, version,
      sectorId: sectorId && !Number.isNaN(sectorId) ? sectorId : null,
      createdByUserId: req.authUser?.id ?? null,
    }).returning();
    res.status(201).json(mapRow(row));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al crear instructivo." });
  }
});

router.patch("/instructivos/:id", async (req, res): Promise<void> => {
  try {
    if (!canWrite(req.authUser?.role)) { res.status(403).json({ message: "Sin permiso para editar instructivos." }); return; }
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) { res.status(400).json({ message: "ID inválido." }); return; }
    const body = req.body ?? {};
    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) patch.title = String(body.title).trim();
    if (body.filePath !== undefined) patch.filePath = String(body.filePath).trim();
    if (body.version !== undefined) patch.version = String(body.version).trim() || "1.0";
    if (body.sectorId !== undefined) {
      patch.sectorId = body.sectorId === null || body.sectorId === "" ? null : Number(body.sectorId);
    }
    const [row] = await db.update(instructivosTable).set(patch).where(eq(instructivosTable.id, id)).returning();
    if (!row) { res.status(404).json({ message: "No encontrado." }); return; }
    res.json(mapRow(row));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al actualizar instructivo." });
  }
});

router.delete("/instructivos/:id", async (req, res): Promise<void> => {
  try {
    if (!canWrite(req.authUser?.role)) { res.status(403).json({ message: "Sin permiso para eliminar instructivos." }); return; }
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) { res.status(400).json({ message: "ID inválido." }); return; }
    await db.delete(instructivosTable).where(eq(instructivosTable.id, id));
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al eliminar instructivo." });
  }
});

export default router;
