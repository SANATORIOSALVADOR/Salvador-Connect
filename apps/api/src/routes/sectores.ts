import { Router, type IRouter } from "express";
import { asc, eq, sql } from "drizzle-orm";
import { db, sectorsTable, userModulesTable } from "@salvador/db";
import { requireAuth, requireSuperadmin } from "../lib/auth";

const router: IRouter = Router();
router.use("/sectores", requireAuth);

/** Nombre comparable: sin tildes, mayúsculas ni espacios de más ("Clínica  Médica" = "clinica medica"). */
function clave(v: string): string {
  return (v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const NO_CUENTAN = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "en", "para", "con"]);

/**
 * Abreviatura automática: iniciales de las palabras (UTI Neo → UN; Piso Clínica Médica → PCM) o, si es una sola
 * palabra, sus 3 primeras letras (Farmacia → FAR). Si ya está usada, se le suma un número.
 */
export function abreviar(nombre: string, usadas: Set<string>): string {
  const palabras = nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const utiles = palabras.filter((p) => !NO_CUENTAN.has(p.toLowerCase()));
  const base0 = (utiles.length > 1 ? utiles.map((p) => (/^[A-Z0-9]{2,4}$/.test(p) ? p : p[0])).join("") : (utiles[0] ?? nombre).slice(0, 3)).toUpperCase().slice(0, 6) || "SEC";
  let abrev = base0;
  for (let n = 2; usadas.has(abrev.toLowerCase()); n++) abrev = `${base0.slice(0, 5)}${n}`;
  usadas.add(abrev.toLowerCase());
  return abrev;
}

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
    const [dup] = await db.select({ id: sectorsTable.id }).from(sectorsTable).where(sql`lower(${sectorsTable.name}) = lower(${name})`).limit(1);
    if (dup) {
      res.status(409).json({ message: `Ya existe el sector «${name}».` });
      return;
    }
    const usadas = new Set((await db.select({ s: sectorsTable.shortName }).from(sectorsTable)).map((r) => (r.s || "").toLowerCase()));
    const shortName = String(body.shortName || "").trim().slice(0, 8) || abreviar(name, usadas);
    const active = body.active !== false;
    const [row] = await db.insert(sectorsTable).values({ name, shortName, active }).returning();
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al crear sector." });
  }
});

/**
 * Importación masiva desde Excel: filas { nombre, abreviatura? }. Se crean activos; los que ya existen
 * (sin distinguir tildes ni mayúsculas) o repetidos en el archivo se omiten. simular = solo vista previa.
 */
router.post("/sectores/importar", requireSuperadmin, async (req, res): Promise<void> => {
  try {
    const filas = (Array.isArray(req.body?.filas) ? req.body.filas : []) as { nombre?: unknown; abreviatura?: unknown; fila?: unknown }[];
    if (!filas.length) {
      res.status(400).json({ message: "El archivo no tiene sectores para importar." });
      return;
    }
    if (filas.length > 1000) {
      res.status(400).json({ message: "Máximo 1000 sectores por importación." });
      return;
    }
    const simular = req.body?.simular !== false;
    const existentes = await db.select().from(sectorsTable);
    const porClave = new Map(existentes.map((s) => [clave(s.name), s]));
    const usadas = new Set(existentes.map((s) => (s.shortName || "").toLowerCase()));
    const enArchivo = new Map<string, number>();
    const out: { fila: number; nombre: string; abreviatura: string; estado: "nuevo" | "existe" | "repetido" | "error"; mensaje: string }[] = [];
    const nuevos: { name: string; shortName: string; active: boolean }[] = [];
    filas.forEach((f, i) => {
      const n = Number.isInteger(Number(f.fila)) && Number(f.fila) > 0 ? Number(f.fila) : i + 2;
      const nombre = String(f.nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
      const pedida = String(f.abreviatura ?? "").replace(/\s+/g, "").trim().slice(0, 8);
      if (!nombre) {
        out.push({ fila: n, nombre: "", abreviatura: pedida, estado: "error", mensaje: "Falta el nombre del sector." });
        return;
      }
      const k = clave(nombre);
      const ya = porClave.get(k);
      if (ya) {
        out.push({ fila: n, nombre, abreviatura: ya.shortName, estado: "existe", mensaje: `Ya existe como «${ya.name}»${ya.active ? "" : " (inactivo)"}: se omite.` });
        return;
      }
      if (enArchivo.has(k)) {
        out.push({ fila: n, nombre, abreviatura: pedida, estado: "repetido", mensaje: `Repetido en el archivo (fila ${enArchivo.get(k)}): se omite.` });
        return;
      }
      enArchivo.set(k, n);
      let abreviatura: string;
      let mensaje = "";
      if (pedida && !usadas.has(pedida.toLowerCase())) {
        abreviatura = pedida.toUpperCase();
        usadas.add(abreviatura.toLowerCase());
      } else {
        abreviatura = abreviar(nombre, usadas);
        mensaje = pedida ? `La abreviatura «${pedida}» ya está usada: se usa ${abreviatura}.` : "Abreviatura automática.";
      }
      nuevos.push({ name: nombre, shortName: abreviatura, active: true });
      out.push({ fila: n, nombre, abreviatura, estado: "nuevo", mensaje });
    });
    if (!simular && nuevos.length) await db.insert(sectorsTable).values(nuevos);
    const cuenta = (e: string) => out.filter((o) => o.estado === e).length;
    res.json({
      simulado: simular,
      resumen: { total: filas.length, nuevos: cuenta("nuevo"), existentes: cuenta("existe"), repetidos: cuenta("repetido"), errores: cuenta("error") },
      filas: out,
    });
  } catch (err) {
    console.error("[sectores.importar]", err);
    res.status(500).json({ message: "Error al importar sectores." });
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
    if (body.shortName !== undefined) {
      patch.shortName = String(body.shortName).trim().slice(0, 8);
      if (!patch.shortName) {
        const usadas = new Set((await db.select({ s: sectorsTable.shortName }).from(sectorsTable).where(sql`${sectorsTable.id} <> ${id}`)).map((r) => (r.s || "").toLowerCase()));
        patch.shortName = abreviar(String(body.name ?? patch.name ?? ""), usadas);
      }
    }
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
    // Si está a cargo de alguien, no se borra: al quitarlo, esa persona podría pasar a ver todos los sectores.
    const [asignado] = await db
      .select({ n: sql<number>`count(distinct ${userModulesTable.userId})::int` })
      .from(userModulesTable)
      .where(sql`${id} = any(${userModulesTable.sectorIds})`);
    if (Number(asignado?.n ?? 0) > 0) {
      res.status(409).json({ message: `El sector está a cargo de ${asignado.n} usuario(s): quitáselo en sus permisos o desactivá el sector.` });
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
