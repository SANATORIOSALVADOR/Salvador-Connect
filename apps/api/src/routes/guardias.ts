import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import {
  db,
  guardiaEtiquetasTable,
  guardiaSectoresTable,
  guardiasAuditoriaTable,
  guardiasTable,
  profesionalesTable,
  sectorsTable,
  type CoberturaFranja,
} from "@salvador/db";
import {
  canSeeSector,
  canWriteSector as puedeEscribir,
  hasLevel,
  ownSectorIds,
  requireAuth,
  requireLevel,
  requireModuleAccess,
  requireSuperadmin,
  visibleSectorIds,
  type AuthUser,
} from "../lib/auth";

const router: IRouter = Router();
router.use("/guardias", requireAuth, requireModuleAccess("guardias"));

const MODALITIES = ["activa", "pasiva"] as const;
const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Sectores de guardia por nombre: solo se usan mientras no haya configuración guardada. */
const DEFAULT_GUARDIA_SECTORS = ["guardia central", "uti neo", "uti uco", "piso gineco", "piso clinica medica", "residentes"];

// ---------- utilidades ----------

/** Nombre comparable: sin tildes, minúsculas, espacios simples ("Pérez  Juan" = "perez juan"). */
function personKey(name: string): string {
  return (name || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);
}

function parseHM(t: string): number {
  const [h, m] = (t || "00:00").slice(0, 5).split(":").map((x) => Number(x) || 0);
  return h * 60 + m;
}

function rangeToMinutes(date: string, endDate: string, startTime: string, endTime: string): { start: number; end: number } {
  const dayMin = (iso: string) => {
    const [y, mo, d] = iso.split("-").map(Number);
    return Date.UTC(y, mo - 1, d) / 60000;
  };
  const start = dayMin(date) + parseHM(startTime);
  let end = dayMin(endDate || date) + parseHM(endTime);
  if (end <= start) end += 24 * 60;
  return { start, end };
}

function rangesOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Carga / modifica / elimina solo en sus sectores a cargo de Guardias (sin sectores a cargo: en todos). */
function canWriteSector(user: AuthUser | undefined, sectorId: number): boolean {
  return puedeEscribir(user, "guardias", sectorId);
}

/** Condición SQL para ver solo los sectores permitidos (undefined = todos). */
function soloVisibles(user: AuthUser | undefined) {
  const ids = visibleSectorIds(user, "guardias");
  if (!ids) return undefined;
  return ids.length ? inArray(guardiasTable.sectorId, ids) : sql`false`;
}

function mapRow(row: typeof guardiasTable.$inferSelect, sectorName?: string | null, sectorShort?: string | null) {
  // Guardias viejas cargadas como 20:00–08:00 con la misma fecha: terminan al día siguiente.
  let endDate = row.endDate || row.date;
  if (endDate === row.date && parseHM(row.endTime) <= parseHM(row.startTime)) endDate = addDaysIso(row.date, 1);
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
    professionalId: row.professionalId,
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
  const professionalName = String(body.professionalName ?? "").replace(/\s+/g, " ").trim();
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
  // Nocturna o de 24 h cargada con la misma fecha: termina al día siguiente.
  if (endDate === date && parseHM(endTime) <= parseHM(startTime)) endDate = addDaysIso(date, 1);
  if (!MODALITIES.includes(modality as (typeof MODALITIES)[number])) {
    return { ok: false, message: "Modalidad inválida (activa o pasiva)." };
  }
  if (!professionalName || professionalName.length < 2) {
    return { ok: false, message: "Nombre del profesional obligatorio." };
  }
  if (daysBetween(date, endDate) > 7) return { ok: false, message: "El rango no puede superar 7 días. Cargá turnos separados." };

  return {
    ok: true,
    data: { sectorId, date, endDate, startTime, endTime, modality, professionalName, observations, tagLabel, tagColor },
  };
}

/**
 * Etiqueta de una guardia: tiene que estar en el catálogo (Configuración → Etiquetas) y activa; se guarda
 * con el nombre y el color del catálogo. Al editar, se conserva la que ya tenía aunque hoy esté desactivada.
 */
async function resolverEtiqueta(
  label: string,
  previa?: { tagLabel: string; tagColor: string } | null,
): Promise<{ ok: true; tagLabel: string; tagColor: string } | { ok: false; message: string }> {
  const nombre = label.replace(/\s+/g, " ").trim();
  if (!nombre) return { ok: true, tagLabel: "", tagColor: "" };
  if (previa && personKey(previa.tagLabel) === personKey(nombre)) return { ok: true, tagLabel: previa.tagLabel, tagColor: previa.tagColor };
  const [et] = await db
    .select()
    .from(guardiaEtiquetasTable)
    .where(sql`lower(${guardiaEtiquetasTable.nombre}) = lower(${nombre})`)
    .limit(1);
  if (!et || !et.activa) {
    return { ok: false, message: `La etiqueta "${nombre}" no está en el catálogo. Las etiquetas las crea el área de Sistemas en Configuración → Etiquetas.` };
  }
  return { ok: true, tagLabel: et.nombre, tagColor: et.color };
}

async function findOverlap(
  professionalName: string,
  date: string,
  endDate: string,
  startTime: string,
  endTime: string,
  excludeId?: number,
): Promise<{ id: number; sectorId: number; date: string; startTime: string; endTime: string } | null> {
  const key = personKey(professionalName);
  // Un día antes por guardias viejas nocturnas guardadas con end_date = date.
  const rows = await db
    .select()
    .from(guardiasTable)
    .where(
      and(
        lte(guardiasTable.date, endDate),
        sql`coalesce(${guardiasTable.endDate}, ${guardiasTable.date}) >= ${addDaysIso(date, -1)}`,
        excludeId ? ne(guardiasTable.id, excludeId) : sql`true`,
      ),
    );
  const target = rangeToMinutes(date, endDate, startTime, endTime);
  for (const c of rows) {
    if (personKey(c.professionalName) !== key) continue;
    const other = rangeToMinutes(c.date, c.endDate || c.date, c.startTime, c.endTime);
    if (rangesOverlap(target, other)) {
      return { id: c.id, sectorId: c.sectorId, date: c.date, startTime: c.startTime, endTime: c.endTime };
    }
  }
  return null;
}

// ---------- profesionales ----------

/** Devuelve el profesional con ese nombre (sin tildes ni mayúsculas) y lo crea si no existe. */
async function ensureProfesional(name: string): Promise<{ id: number; name: string }> {
  const nameKey = personKey(name);
  const [found] = await db
    .select({ id: profesionalesTable.id, name: profesionalesTable.name })
    .from(profesionalesTable)
    .where(eq(profesionalesTable.nameKey, nameKey))
    .limit(1);
  if (found) return found;
  await db.insert(profesionalesTable).values({ name, nameKey }).onConflictDoNothing();
  const [created] = await db
    .select({ id: profesionalesTable.id, name: profesionalesTable.name })
    .from(profesionalesTable)
    .where(eq(profesionalesTable.nameKey, nameKey))
    .limit(1);
  return created;
}

/** Crea los profesionales que solo existen como texto en guardias viejas y vincula esas guardias. */
async function syncProfesionales(): Promise<void> {
  const pending = await db
    .selectDistinct({ name: guardiasTable.professionalName })
    .from(guardiasTable)
    .where(isNull(guardiasTable.professionalId));
  for (const { name } of pending) {
    if (!name?.trim()) continue;
    const prof = await ensureProfesional(name.trim());
    await db
      .update(guardiasTable)
      .set({ professionalId: prof.id })
      .where(and(eq(guardiasTable.professionalName, name), isNull(guardiasTable.professionalId)));
  }
}

// ---------- auditoría ----------

async function logAudit(
  action: "alta" | "modificacion" | "baja" | "copia",
  guardiaId: number | null,
  user: AuthUser | undefined,
  before: unknown,
  after: unknown,
): Promise<void> {
  try {
    await db.insert(guardiasAuditoriaTable).values({
      guardiaId,
      action,
      userId: user?.id ?? null,
      userName: user?.name ?? "",
      before: before ?? null,
      after: after ?? null,
    });
  } catch (err) {
    // La auditoría nunca debe impedir guardar la guardia.
    console.error("[guardias.audit]", err);
  }
}

// ---------- configuración de sectores ----------

function parseFranjas(value: unknown): CoberturaFranja[] | null {
  if (!Array.isArray(value)) return null;
  const out: CoberturaFranja[] = [];
  for (const raw of value) {
    const f = raw as Record<string, unknown>;
    const dow = Number(f.dow);
    const start = String(f.start ?? "").slice(0, 5);
    const end = String(f.end ?? "").slice(0, 5);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) return null;
    if (!TIME_RE.test(start) || !(TIME_RE.test(end) || end === "24:00")) return null;
    if (parseHM(end) <= parseHM(start)) return null;
    out.push({ dow, start, end });
  }
  return out.slice(0, 100);
}

router.get("/guardias/config", async (req, res): Promise<void> => {
  try {
    const [sectors, configs] = await Promise.all([
      db.select().from(sectorsTable).orderBy(asc(sectorsTable.name)),
      db.select().from(guardiaSectoresTable),
    ]);
    const byId = new Map(configs.map((c) => [c.sectorId, c]));
    const hasConfig = configs.length > 0;
    res.json(
      sectors
        .filter((s) => s.active && canSeeSector(req.authUser, "guardias", s.id))
        .map((s) => {
          const c = byId.get(s.id);
          const byName = DEFAULT_GUARDIA_SECTORS.some((n) => personKey(s.name).includes(n));
          return {
            sectorId: s.id,
            name: s.name,
            shortName: s.shortName,
            configured: Boolean(c),
            // Sin configuración guardada se usan los sectores de guardia conocidos por nombre.
            active: c ? c.active : !hasConfig && byName,
            cobertura: c?.cobertura ?? [],
          };
        }),
    );
  } catch (err) {
    console.error("[guardias.config]", err);
    res.status(500).json({ message: "Error al leer la configuración de sectores." });
  }
});

router.put("/guardias/config/:sectorId", requireLevel("guardias", "total"), async (req, res): Promise<void> => {
  try {
    const sectorId = Number(req.params.sectorId);
    if (!sectorId || Number.isNaN(sectorId)) {
      res.status(400).json({ message: "Sector inválido." });
      return;
    }
    if (!canWriteSector(req.authUser, sectorId)) {
      res.status(403).json({ message: "Solo podés configurar los sectores que tenés asignados." });
      return;
    }
    const cobertura = parseFranjas((req.body ?? {}).cobertura ?? []);
    if (!cobertura) {
      res.status(400).json({ message: "Horario de cobertura inválido (día 0–6, desde < hasta, HH:MM)." });
      return;
    }
    const active = (req.body ?? {}).active !== false;
    const [sector] = await db.select().from(sectorsTable).where(eq(sectorsTable.id, sectorId)).limit(1);
    if (!sector) {
      res.status(404).json({ message: "Sector no encontrado." });
      return;
    }
    // Primera vez que se guarda: fijar también los sectores que hoy se usan por nombre,
    // para que no desaparezcan del módulo al dejar de usar la regla por nombre.
    const [anyConfig] = await db.select({ id: guardiaSectoresTable.sectorId }).from(guardiaSectoresTable).limit(1);
    if (!anyConfig) {
      const sectors = await db.select().from(sectorsTable);
      const defaults = sectors.filter((s) => s.id !== sectorId && DEFAULT_GUARDIA_SECTORS.some((n) => personKey(s.name).includes(n)));
      if (defaults.length) {
        await db
          .insert(guardiaSectoresTable)
          .values(defaults.map((s) => ({ sectorId: s.id, active: true, cobertura: [] })))
          .onConflictDoNothing();
      }
    }
    await db
      .insert(guardiaSectoresTable)
      .values({ sectorId, active, cobertura })
      .onConflictDoUpdate({ target: guardiaSectoresTable.sectorId, set: { active, cobertura, updatedAt: new Date() } });
    res.json({ sectorId, name: sector.name, shortName: sector.shortName, configured: true, active, cobertura });
  } catch (err) {
    console.error("[guardias.config.put]", err);
    res.status(500).json({ message: "Error al guardar la configuración." });
  }
});

// ---------- etiquetas (catálogo; solo el superadmin lo modifica) ----------

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

router.get("/guardias/etiquetas", async (_req, res): Promise<void> => {
  try {
    const [rows, usos] = await Promise.all([
      db.select().from(guardiaEtiquetasTable).orderBy(asc(guardiaEtiquetasTable.nombre)),
      db
        .select({ clave: sql<string>`lower(trim(${guardiasTable.tagLabel}))`, n: sql<number>`count(*)::int` })
        .from(guardiasTable)
        .where(sql`trim(${guardiasTable.tagLabel}) <> ''`)
        .groupBy(sql`lower(trim(${guardiasTable.tagLabel}))`),
    ]);
    const porClave = new Map(usos.map((u) => [u.clave, Number(u.n)]));
    res.json(rows.map((r) => ({ id: r.id, nombre: r.nombre, color: r.color, activa: r.activa, usos: porClave.get(r.nombre.trim().toLowerCase()) ?? 0 })));
  } catch (err) {
    console.error("[guardias.etiquetas]", err);
    res.status(500).json({ message: "Error al leer las etiquetas." });
  }
});

type EtiquetaBody = { nombre?: string; color?: string; activa?: boolean };

function leerEtiqueta(body: Record<string, unknown>, parcial: boolean): { ok: true; v: EtiquetaBody } | { ok: false; message: string } {
  const v: EtiquetaBody = {};
  if (!parcial || body.nombre !== undefined) {
    const nombre = String(body.nombre ?? "").replace(/\s+/g, " ").trim().toUpperCase();
    if (nombre.length < 2 || nombre.length > 30) return { ok: false, message: "El nombre de la etiqueta tiene que tener entre 2 y 30 caracteres." };
    v.nombre = nombre;
  }
  if (!parcial || body.color !== undefined) {
    const color = String(body.color ?? "").trim();
    if (!COLOR_RE.test(color)) return { ok: false, message: "Color inválido (formato #RRGGBB)." };
    v.color = color.toLowerCase();
  }
  if (body.activa !== undefined) v.activa = body.activa !== false;
  return { ok: true, v };
}

async function nombreOcupado(nombre: string, exceptoId?: number): Promise<boolean> {
  const [row] = await db
    .select({ id: guardiaEtiquetasTable.id })
    .from(guardiaEtiquetasTable)
    .where(and(sql`lower(${guardiaEtiquetasTable.nombre}) = lower(${nombre})`, exceptoId ? ne(guardiaEtiquetasTable.id, exceptoId) : sql`true`))
    .limit(1);
  return Boolean(row);
}

async function usosDe(nombre: string): Promise<number> {
  const [uso] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(guardiasTable)
    .where(sql`lower(trim(${guardiasTable.tagLabel})) = lower(${nombre.trim()})`);
  return Number(uso?.n ?? 0);
}

router.post("/guardias/etiquetas", requireSuperadmin, async (req, res): Promise<void> => {
  try {
    const r = leerEtiqueta(req.body ?? {}, false);
    if (!r.ok) {
      res.status(400).json({ message: r.message });
      return;
    }
    const nombre = r.v.nombre!;
    if (await nombreOcupado(nombre)) {
      res.status(409).json({ message: `Ya existe la etiqueta "${nombre}".` });
      return;
    }
    const [row] = await db.insert(guardiaEtiquetasTable).values({ nombre, color: r.v.color!, activa: r.v.activa ?? true }).returning();
    res.status(201).json({ id: row.id, nombre: row.nombre, color: row.color, activa: row.activa, usos: await usosDe(row.nombre) });
  } catch (err) {
    console.error("[guardias.etiquetas.post]", err);
    res.status(500).json({ message: "Error al crear la etiqueta." });
  }
});

router.patch("/guardias/etiquetas/:id", requireSuperadmin, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [actual] = id ? await db.select().from(guardiaEtiquetasTable).where(eq(guardiaEtiquetasTable.id, id)).limit(1) : [];
    if (!actual) {
      res.status(404).json({ message: "Etiqueta no encontrada." });
      return;
    }
    const r = leerEtiqueta(req.body ?? {}, true);
    if (!r.ok) {
      res.status(400).json({ message: r.message });
      return;
    }
    if (r.v.nombre && (await nombreOcupado(r.v.nombre, id))) {
      res.status(409).json({ message: `Ya existe la etiqueta "${r.v.nombre}".` });
      return;
    }
    const nombre = r.v.nombre ?? actual.nombre;
    const color = r.v.color ?? actual.color;
    const [row] = await db
      .update(guardiaEtiquetasTable)
      .set({ nombre, color, activa: r.v.activa ?? actual.activa, updatedAt: new Date() })
      .where(eq(guardiaEtiquetasTable.id, id))
      .returning();
    // Renombrar o cambiar el color se refleja en todas las guardias que la usan.
    let guardiasActualizadas = 0;
    if (nombre !== actual.nombre || color !== actual.color) {
      const cambiadas = await db
        .update(guardiasTable)
        .set({ tagLabel: nombre, tagColor: color })
        .where(sql`lower(trim(${guardiasTable.tagLabel})) = lower(${actual.nombre.trim()})`)
        .returning({ id: guardiasTable.id });
      guardiasActualizadas = cambiadas.length;
    }
    res.json({ id: row.id, nombre: row.nombre, color: row.color, activa: row.activa, usos: await usosDe(row.nombre), guardiasActualizadas });
  } catch (err) {
    console.error("[guardias.etiquetas.patch]", err);
    res.status(500).json({ message: "Error al modificar la etiqueta." });
  }
});

router.delete("/guardias/etiquetas/:id", requireSuperadmin, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [actual] = id ? await db.select().from(guardiaEtiquetasTable).where(eq(guardiaEtiquetasTable.id, id)).limit(1) : [];
    if (!actual) {
      res.status(404).json({ message: "Etiqueta no encontrada." });
      return;
    }
    const n = await usosDe(actual.nombre);
    if (n > 0) {
      res.status(409).json({ message: `La etiqueta está en ${n} guardia${n === 1 ? "" : "s"}: desactivala para que no se use más (las guardias la conservan).` });
      return;
    }
    await db.delete(guardiaEtiquetasTable).where(eq(guardiaEtiquetasTable.id, id));
    res.status(204).end();
  } catch (err) {
    console.error("[guardias.etiquetas.delete]", err);
    res.status(500).json({ message: "Error al eliminar la etiqueta." });
  }
});

// ---------- profesionales ----------

router.get("/guardias/profesionales", async (_req, res): Promise<void> => {
  try {
    await syncProfesionales();
    const rows = await db
      .select({ name: profesionalesTable.name })
      .from(profesionalesTable)
      .where(eq(profesionalesTable.active, true))
      .orderBy(asc(profesionalesTable.name));
    res.json(rows.map((r) => r.name));
  } catch (err) {
    console.error("[guardias.profesionales]", err);
    res.status(500).json({ message: "Error al listar profesionales." });
  }
});

router.get("/guardias/profesionales/lista", async (req, res): Promise<void> => {
  try {
    await syncProfesionales();
    const vis = visibleSectorIds(req.authUser, "guardias");
    const filtro = vis ? (vis.length ? sql` and ${guardiasTable.sectorId} in (${sql.join(vis.map((v) => sql`${v}`), sql`, `)})` : sql` and false`) : sql``;
    const rows = await db
      .select({
        id: profesionalesTable.id,
        name: profesionalesTable.name,
        matricula: profesionalesTable.matricula,
        especialidad: profesionalesTable.especialidad,
        active: profesionalesTable.active,
        guardias: sql<number>`(select count(*)::int from ${guardiasTable} where ${guardiasTable.professionalId} = ${profesionalesTable.id}${filtro})`,
      })
      .from(profesionalesTable)
      .orderBy(asc(profesionalesTable.name));
    res.json(rows);
  } catch (err) {
    console.error("[guardias.profesionales.lista]", err);
    res.status(500).json({ message: "Error al listar profesionales." });
  }
});

router.patch("/guardias/profesionales/:id", requireLevel("guardias", "total"), async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ message: "ID inválido." });
      return;
    }
    const propios = ownSectorIds(req.authUser, "guardias");
    if (propios) {
      const [ajena] = await db
        .select({ id: guardiasTable.id })
        .from(guardiasTable)
        .where(and(eq(guardiasTable.professionalId, id), propios.length ? sql`${guardiasTable.sectorId} not in (${sql.join(propios.map((v) => sql`${v}`), sql`, `)})` : sql`true`))
        .limit(1);
      if (ajena) {
        res.status(403).json({ message: "Este profesional también hace guardias en otros sectores: los cambios en sus datos los hace el área de Sistemas o alguien a cargo de todos los sectores." });
        return;
      }
    }
    const body = req.body ?? {};
    const patch: Partial<typeof profesionalesTable.$inferInsert> = {};
    if (body.name !== undefined) {
      const name = String(body.name).replace(/\s+/g, " ").trim();
      if (name.length < 2) {
        res.status(400).json({ message: "El nombre es obligatorio." });
        return;
      }
      const nameKey = personKey(name);
      const [dup] = await db
        .select({ id: profesionalesTable.id })
        .from(profesionalesTable)
        .where(and(eq(profesionalesTable.nameKey, nameKey), ne(profesionalesTable.id, id)))
        .limit(1);
      if (dup) {
        res.status(409).json({ message: "Ya existe otro profesional con ese nombre." });
        return;
      }
      patch.name = name;
      patch.nameKey = nameKey;
    }
    if (body.matricula !== undefined) patch.matricula = String(body.matricula).trim().slice(0, 40);
    if (body.especialidad !== undefined) patch.especialidad = String(body.especialidad).trim().slice(0, 80);
    if (body.active !== undefined) patch.active = Boolean(body.active);
    const [row] = await db.update(profesionalesTable).set(patch).where(eq(profesionalesTable.id, id)).returning();
    if (!row) {
      res.status(404).json({ message: "Profesional no encontrado." });
      return;
    }
    // Mantener el nombre de las guardias igual al del profesional.
    if (patch.name) {
      await db.update(guardiasTable).set({ professionalName: patch.name }).where(eq(guardiasTable.professionalId, id));
    }
    res.json(row);
  } catch (err) {
    console.error("[guardias.profesionales.patch]", err);
    res.status(500).json({ message: "Error al guardar el profesional." });
  }
});

// ---------- auditoría ----------

router.get("/guardias/auditoria", async (req, res): Promise<void> => {
  try {
    if (!hasLevel(req.authUser, "guardias", "editar")) {
      res.status(403).json({ message: "No tenés acceso al registro de cambios." });
      return;
    }
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const vis = visibleSectorIds(req.authUser, "guardias");
    const rows = await db
      .select()
      .from(guardiasAuditoriaTable)
      .orderBy(desc(guardiasAuditoriaTable.createdAt))
      .limit(vis ? 1000 : limit);
    const visibles = vis
      ? rows.filter((r) => {
          const g = (r.after ?? r.before) as { sectorId?: number } | null;
          return Boolean(g?.sectorId && vis.includes(g.sectorId));
        })
      : rows;
    res.json(visibles.slice(0, limit));
  } catch (err) {
    console.error("[guardias.auditoria]", err);
    res.status(500).json({ message: "Error al leer el registro de cambios." });
  }
});

// ---------- guardias ----------

router.get("/guardias", async (req, res): Promise<void> => {
  try {
    const from = String(req.query.from ?? "").slice(0, 10);
    const to = String(req.query.to ?? "").slice(0, 10);
    const sectorId = req.query.sectorId ? Number(req.query.sectorId) : null;

    const conditions = [];
    if (from && DATE_RE.test(from) && to && DATE_RE.test(to)) {
      conditions.push(lte(guardiasTable.date, to));
      conditions.push(sql`coalesce(${guardiasTable.endDate}, ${guardiasTable.date}) >= ${addDaysIso(from, -1)}`);
    }
    if (sectorId && !Number.isNaN(sectorId)) {
      conditions.push(eq(guardiasTable.sectorId, sectorId));
    }
    const alcance = soloVisibles(req.authUser);
    if (alcance) conditions.push(alcance);

    const rows = await db
      .select({ g: guardiasTable, sectorName: sectorsTable.name, sectorShort: sectorsTable.shortName })
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

router.post("/guardias", async (req, res): Promise<void> => {
  try {
    const parsed = parseBody(req.body ?? {});
    if (!parsed.ok) {
      res.status(400).json({ message: parsed.message });
      return;
    }
    const data = parsed.data;
    const allowOverlap = Boolean((req.body as { allowOverlap?: boolean })?.allowOverlap);
    const etiqueta = await resolverEtiqueta(data.tagLabel);
    if (!etiqueta.ok) {
      res.status(400).json({ message: etiqueta.message });
      return;
    }
    data.tagLabel = etiqueta.tagLabel;
    data.tagColor = etiqueta.tagColor;

    const [sector] = await db.select().from(sectorsTable).where(eq(sectorsTable.id, data.sectorId)).limit(1);
    if (!sector) {
      res.status(400).json({ message: "Sector no encontrado." });
      return;
    }
    if (!canWriteSector(req.authUser, data.sectorId)) {
      res.status(403).json({ message: "Solo podés cargar guardias en los sectores que tenés asignados." });
      return;
    }

    if (!allowOverlap) {
      const overlap = await findOverlap(data.professionalName, data.date, data.endDate, data.startTime, data.endTime);
      if (overlap) {
        res.status(409).json({
          message: `El profesional ya tiene otra guardia que se solapa (${overlap.date} ${overlap.startTime}–${overlap.endTime}${canSeeSector(req.authUser, "guardias", overlap.sectorId) ? "" : ", en otro sector"}). Marcá "permitir solape" si es intencional.`,
          overlap: canSeeSector(req.authUser, "guardias", overlap.sectorId) ? overlap : { date: overlap.date, startTime: overlap.startTime, endTime: overlap.endTime },
        });
        return;
      }
    }

    const prof = await ensureProfesional(data.professionalName);
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
        professionalId: prof.id,
        professionalName: prof.name,
        observations: data.observations,
        tagLabel: data.tagLabel,
        tagColor: data.tagColor,
        createdByUserId: req.authUser?.id ?? null,
      })
      .returning();

    const out = mapRow(row, sector.name, sector.shortName);
    await logAudit("alta", row.id, req.authUser, null, out);
    res.status(201).json(out);
  } catch (err) {
    console.error("[guardias.create]", err);
    res.status(500).json({ message: "Error al crear guardia." });
  }
});

router.post("/guardias/copiar", async (req, res): Promise<void> => {
  try {
    const body = req.body ?? {};
    const fromStart = String(body.fromStart ?? "").slice(0, 10);
    const fromEnd = String(body.fromEnd ?? "").slice(0, 10);
    const toStart = String(body.toStart ?? "").slice(0, 10);
    const sectorId = body.sectorId ? Number(body.sectorId) : null;
    if (![fromStart, fromEnd, toStart].every((d) => DATE_RE.test(d))) {
      res.status(400).json({ message: "Fechas inválidas." });
      return;
    }
    const span = daysBetween(fromStart, fromEnd);
    if (span < 0 || span > 31) {
      res.status(400).json({ message: "El período a copiar debe ser de 1 a 32 días." });
      return;
    }
    const offset = daysBetween(fromStart, toStart);
    if (offset === 0) {
      res.status(400).json({ message: "El destino tiene que ser distinto del origen." });
      return;
    }
    if (offset > 0 && offset <= span) {
      res.status(400).json({ message: "El destino no puede pisar el período de origen." });
      return;
    }

    const conditions = [gte(guardiasTable.date, fromStart), lte(guardiasTable.date, fromEnd)];
    if (sectorId) conditions.push(eq(guardiasTable.sectorId, sectorId));
    const alcance = soloVisibles(req.authUser);
    if (alcance) conditions.push(alcance);
    const source = await db
      .select({ g: guardiasTable, sectorName: sectorsTable.name, sectorShort: sectorsTable.shortName })
      .from(guardiasTable)
      .leftJoin(sectorsTable, eq(guardiasTable.sectorId, sectorsTable.id))
      .where(and(...conditions))
      .orderBy(asc(guardiasTable.date), asc(guardiasTable.startTime));

    let created = 0;
    const skipped: { professionalName: string; date: string; reason: string }[] = [];
    for (const { g, sectorName, sectorShort } of source) {
      const orig = mapRow(g, sectorName, sectorShort);
      const date = addDaysIso(orig.date, offset);
      const endDate = addDaysIso(orig.endDate, offset);
      if (!canWriteSector(req.authUser, g.sectorId)) {
        skipped.push({ professionalName: g.professionalName, date, reason: "sector sin permiso" });
        continue;
      }
      const overlap = await findOverlap(g.professionalName, date, endDate, g.startTime, g.endTime);
      if (overlap) {
        skipped.push({ professionalName: g.professionalName, date, reason: "ya tiene guardia en ese horario" });
        continue;
      }
      const [row] = await db
        .insert(guardiasTable)
        .values({
          sectorId: g.sectorId,
          date,
          endDate,
          shift: `${g.startTime}-${g.endTime}`,
          startTime: g.startTime,
          endTime: g.endTime,
          modality: g.modality,
          type: "",
          professionalId: g.professionalId,
          professionalName: g.professionalName,
          observations: g.observations,
          tagLabel: g.tagLabel,
          tagColor: g.tagColor,
          createdByUserId: req.authUser?.id ?? null,
        })
        .returning();
      created++;
      await logAudit("copia", row.id, req.authUser, { origenId: g.id }, mapRow(row, sectorName, sectorShort));
    }
    res.json({ created, skipped });
  } catch (err) {
    console.error("[guardias.copiar]", err);
    res.status(500).json({ message: "Error al copiar guardias." });
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
    const allowOverlap = Boolean((req.body as { allowOverlap?: boolean })?.allowOverlap);

    const [sector] = await db.select().from(sectorsTable).where(eq(sectorsTable.id, data.sectorId)).limit(1);
    if (!sector) {
      res.status(400).json({ message: "Sector no encontrado." });
      return;
    }
    const [existing] = await db.select().from(guardiasTable).where(eq(guardiasTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ message: "Guardia no encontrada." });
      return;
    }
    if (!canWriteSector(req.authUser, existing.sectorId) || !canWriteSector(req.authUser, data.sectorId)) {
      res.status(403).json({ message: "Solo podés modificar guardias de los sectores que tenés asignados." });
      return;
    }
    const etiqueta = await resolverEtiqueta(data.tagLabel, existing);
    if (!etiqueta.ok) {
      res.status(400).json({ message: etiqueta.message });
      return;
    }
    data.tagLabel = etiqueta.tagLabel;
    data.tagColor = etiqueta.tagColor;

    if (!allowOverlap) {
      const overlap = await findOverlap(data.professionalName, data.date, data.endDate, data.startTime, data.endTime, id);
      if (overlap) {
        res.status(409).json({
          message: `El profesional ya tiene otra guardia que se solapa (${overlap.date} ${overlap.startTime}–${overlap.endTime}${canSeeSector(req.authUser, "guardias", overlap.sectorId) ? "" : ", en otro sector"}).`,
          overlap: canSeeSector(req.authUser, "guardias", overlap.sectorId) ? overlap : { date: overlap.date, startTime: overlap.startTime, endTime: overlap.endTime },
        });
        return;
      }
    }

    const prof = await ensureProfesional(data.professionalName);
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
        professionalId: prof.id,
        professionalName: prof.name,
        observations: data.observations,
        tagLabel: data.tagLabel,
        tagColor: data.tagColor,
      })
      .where(eq(guardiasTable.id, id))
      .returning();

    const out = mapRow(row, sector.name, sector.shortName);
    await logAudit("modificacion", id, req.authUser, mapRow(existing), out);
    res.json(out);
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
    const [existing] = await db.select().from(guardiasTable).where(eq(guardiasTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ message: "Guardia no encontrada." });
      return;
    }
    if (!canWriteSector(req.authUser, existing.sectorId)) {
      res.status(403).json({ message: "Solo podés eliminar guardias de los sectores que tenés asignados." });
      return;
    }
    await db.delete(guardiasTable).where(eq(guardiasTable.id, id));
    await logAudit("baja", id, req.authUser, mapRow(existing), null);
    res.status(204).end();
  } catch (err) {
    console.error("[guardias.delete]", err);
    res.status(500).json({ message: "Error al eliminar guardia." });
  }
});

export default router;
