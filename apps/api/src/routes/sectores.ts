import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, sectorsTable } from "@salvador/db";
import { requireAuth, requireSuperadmin } from "../lib/auth";

const router: IRouter = Router();
router.use(requireAuth);

router.get("/sectores", async (_req, res): Promise<void> => {
  try {
    const rows = await db.select().from(sectorsTable).orderBy(asc(sectorsTable.name));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al listar sectores." });
  }
});

router.post("/sectores", requireSuperadmin, async (req, res): Promise<void> => {
  try {
    const body = req.body ?? {};
    const name = String(body.name || "").trim();
    if (!name) {
      res.status(400).json({ message: "El nombre es obligatorio." });
      return;
    }
    const shortName = String(body.shortName || name.slice(0, 8)).trim();
    const active = body.active !== false;
    const [row] = await db.insert(sectorsTable).values({ name, shortName, active }).returning();
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al crear sector." });
  }
});

router.patch("/sectores/:id", requireSuperadmin, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ message: "ID inválido." });
      return;
    }
    const body = req.body ?? {};
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = String(body.name).trim();
    if (body.shortName !== undefined) patch.shortName = String(body.shortName).trim();
    if (body.active !== undefined) patch.active = Boolean(body.active);
    const [row] = await db.update(sectorsTable).set(patch).where(eq(sectorsTable.id, id)).returning();
    if (!row) {
      res.status(404).json({ message: "No encontrado." });
      return;
    }
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al actualizar sector." });
  }
});

router.delete("/sectores/:id", requireSuperadmin, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ message: "ID inválido." });
      return;
    }
    await db.delete(sectorsTable).where(eq(sectorsTable.id, id));
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al eliminar sector. Puede estar en uso." });
  }
});

export default router;
