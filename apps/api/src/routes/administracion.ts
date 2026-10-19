import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
  admCalendarioTable,
  admContactosTable,
  admFeriadosTable,
  admHistorialTable,
  admItemsTable,
  admObligacionesTable,
  admRecurrentesTable,
  db,
  userModulesTable,
  usersTable,
} from "@salvador/db";
import { requireAccion, requireAuth, requireModuleAccess } from "../lib/auth";
import {
  Feriados,
  FRECUENCIAS,
  addDaysIso,
  aplicaEnMes,
  ar,
  asegurarFiscalMes,
  borrarItems,
  calendarioDelAnio,
  cerrarTareaSistema,
  claveCalendario,
  claveVerificar,
  generarRecurrentes,
  hoyIso,
  isoDate,
  pendientesFuturosDeRecurrente,
  periodoKey,
  registrar,
  resolverFecha,
  shiftMes,
} from "../lib/administracion";

const router: IRouter = Router();
// Cada ruta de escritura exige su acción concreta (lib/acciones.ts); acá solo el acceso al módulo.
router.use("/administracion", requireAuth, requireModuleAccess("administracion", { porRuta: true }));
/** Catálogo de obligaciones, calendario oficial y feriados. */
const calendario = requireAccion("administracion", "calendario");

export const TIPOS = ["fiscal", "vencimiento", "pago", "cheque", "documento", "tarea", "recordatorio"] as const;
const ESTADOS = ["pendiente", "cumplido", "cancelado"] as const;
const PRIORIDADES = ["baja", "normal", "alta"] as const;
const ORGANISMOS = ["arca", "rentas_cba", "municipalidad", "sindicato", "otro"] as const;
const TIPOS_FERIADO = ["inamovible", "trasladable", "puente", "no_laborable", "local"] as const;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

// ----- helpers -----

class BadRequest extends Error {}
const fail = (msg: string): never => {
  throw new BadRequest(msg);
};

function str(v: unknown, max = 2000): string {
  return String(v ?? "").trim().slice(0, max);
}
function int(v: unknown, min: number, max: number, def: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
}
function isoOk(v: unknown): string | null {
  const s = String(v ?? "").slice(0, 10);
  if (!ISO_RE.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12);
  return dt.getMonth() === m - 1 && dt.getDate() === d ? s : null;
}
/** Acepta AAAA-MM-DD o DD/MM/AAAA (para pegar fechas copiadas de un calendario). */
function parseFechaFlexible(v: string): string | null {
  const s = v.trim();
  const iso = isoOk(s);
  if (iso) return iso;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  return m ? isoOk(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`) : null;
}
function idParam(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) fail("ID inválido.");
  return id;
}
function quien(req: Request) {
  return req.authUser ? { id: req.authUser.id, name: req.authUser.name } : null;
}

/** Envuelve un handler: errores de validación → 400, el resto → 500 con log. */
function h(fn: (req: Request, res: Response) => Promise<void>, errMsg: string) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof BadRequest) {
        res.status(400).json({ message: err.message });
        return;
      }
      console.error(err);
      res.status(500).json({ message: errMsg });
    }
  };
}

/** Datos propios de cada tipo (cheque, documento, subtareas). Solo valores simples, tamaño acotado. */
function sanitizeDatos(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>).slice(0, 30)) {
    if (!/^[a-zA-Z_]{1,30}$/.test(k)) continue;
    if (typeof val === "string") out[k] = val.slice(0, 500);
    else if (typeof val === "boolean" || (typeof val === "number" && Number.isFinite(val))) out[k] = val;
    else if (k === "subtareas" && Array.isArray(val)) {
      out[k] = val.slice(0, 50).map((s) => ({ texto: str((s as { texto?: unknown })?.texto, 200), hecho: !!(s as { hecho?: unknown })?.hecho })).filter((s) => s.texto);
    }
  }
  if (JSON.stringify(out).length > 10_000) fail("Datos demasiado largos.");
  return out;
}

const itemSelect = {
  item: admItemsTable,
  obligacionNombre: admObligacionesTable.nombre,
  organismo: admObligacionesTable.organismo,
  requierePresentacion: admObligacionesTable.presentacion,
  requierePago: admObligacionesTable.pago,
};
type ItemRow = { item: typeof admItemsTable.$inferSelect; obligacionNombre: string | null; organismo: string | null; requierePresentacion: boolean | null; requierePago: boolean | null };

function mapItem(r: ItemRow) {
  const it = r.item;
  const fiscalConObligacion = it.obligacionId != null && r.requierePresentacion != null;
  return {
    ...it,
    obligacionNombre: r.obligacionNombre,
    organismo: r.organismo,
    // Qué hace falta para darlo por cumplido.
    requierePresentacion: fiscalConObligacion ? !!r.requierePresentacion : false,
    requierePago: fiscalConObligacion ? !!r.requierePago : false,
  };
}

async function getItem(id: number) {
  const [r] = await db
    .select(itemSelect)
    .from(admItemsTable)
    .leftJoin(admObligacionesTable, eq(admItemsTable.obligacionId, admObligacionesTable.id))
    .where(eq(admItemsTable.id, id))
    .limit(1);
  return r ? mapItem(r) : null;
}

function parseItemBody(body: Record<string, unknown>, partial: boolean) {
  const out: Partial<typeof admItemsTable.$inferInsert> = {};
  if (!partial || body.titulo !== undefined) {
    const t = str(body.titulo, 300);
    if (!t) fail("El título es obligatorio.");
    out.titulo = t;
  }
  if (!partial || body.tipo !== undefined) {
    const t = str(body.tipo || "recordatorio").toLowerCase();
    if (!(TIPOS as readonly string[]).includes(t)) fail("Tipo inválido.");
    out.tipo = t;
  }
  if (!partial || body.fecha !== undefined) {
    const f = isoOk(body.fecha);
    if (!f) fail("Fecha inválida.");
    out.fecha = f!;
  }
  if (body.hora !== undefined) {
    const hr = str(body.hora, 5);
    if (hr && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hr)) fail("Hora inválida.");
    out.hora = hr;
  }
  if (body.prioridad !== undefined) {
    const p = str(body.prioridad).toLowerCase();
    if (!(PRIORIDADES as readonly string[]).includes(p)) fail("Prioridad inválida.");
    out.prioridad = p;
  }
  if (body.estado !== undefined) {
    const e = str(body.estado).toLowerCase();
    if (!(ESTADOS as readonly string[]).includes(e)) fail("Estado inválido.");
    out.estado = e;
  }
  if (body.descripcion !== undefined) out.descripcion = str(body.descripcion, 5000);
  if (body.responsable !== undefined) out.responsable = str(body.responsable, 120);
  if (body.monto !== undefined) out.monto = str(body.monto, 40);
  if (body.alertDays !== undefined) out.alertDays = int(body.alertDays, 0, 120, 3);
  if (body.datos !== undefined) out.datos = sanitizeDatos(body.datos);
  return out;
}

// ===== Resumen =====

router.get(
  "/administracion/resumen",
  h(async (_req, res) => {
    const hoy = hoyIso();
    const now = new Date();
    const anio = now.getFullYear();
    const mes = now.getMonth() + 1;
    const periodo = periodoKey(anio, mes);
    const pendientes = await db
      .select(itemSelect)
      .from(admItemsTable)
      .leftJoin(admObligacionesTable, eq(admItemsTable.obligacionId, admObligacionesTable.id))
      .where(and(eq(admItemsTable.estado, "pendiente"), lte(admItemsTable.fecha, addDaysIso(hoy, 45))))
      .orderBy(asc(admItemsTable.fecha), asc(admItemsTable.hora));
    const chequesAbiertos = await db
      .select(itemSelect)
      .from(admItemsTable)
      .leftJoin(admObligacionesTable, eq(admItemsTable.obligacionId, admObligacionesTable.id))
      .where(and(eq(admItemsTable.estado, "pendiente"), eq(admItemsTable.tipo, "cheque")))
      .orderBy(asc(admItemsTable.fecha));
    const tareas = await db
      .select(itemSelect)
      .from(admItemsTable)
      .leftJoin(admObligacionesTable, eq(admItemsTable.obligacionId, admObligacionesTable.id))
      .where(and(eq(admItemsTable.estado, "pendiente"), eq(admItemsTable.tipo, "tarea")))
      .orderBy(asc(admItemsTable.fecha));
    const fiscalMes = await db
      .select()
      .from(admItemsTable)
      .where(and(eq(admItemsTable.tipo, "fiscal"), gte(admItemsTable.fecha, `${periodo}-01`), lte(admItemsTable.fecha, isoDate(anio, mes, 31))));

    // Calendario oficial del mes: cuántas obligaciones activas tienen la fecha cargada y verificada.
    const obligs = (await db.select().from(admObligacionesTable).where(eq(admObligacionesTable.activo, true))).filter((o) => aplicaEnMes(o, mes));
    const cal = await calendarioDelAnio(anio);
    let oficiales = 0;
    let verificadas = 0;
    for (const o of obligs) {
      const r = cal.get(`${o.id}:${anio}:${mes}`);
      if (r) oficiales++;
      if (r?.verificadoAt) verificadas++;
    }
    const sig = shiftMes(anio, mes, 1);
    const fer = new Feriados();
    const avisos: { nivel: "alta" | "media"; texto: string; tab?: string }[] = [];
    if (obligs.length && verificadas < obligs.length) {
      avisos.push({ nivel: "media", texto: `Fechas fiscales de ${periodo.slice(5)}/${anio}: ${verificadas} de ${obligs.length} verificadas con el calendario oficial.`, tab: "fiscal" });
    }
    if (mes >= 11 && !(await fer.year(anio + 1)).cargados) {
      avisos.push({ nivel: "media", texto: `Todavía no hay feriados cargados para ${anio + 1}.`, tab: "ajustes" });
    }
    if (!(await fer.year(anio)).cargados) {
      avisos.push({ nivel: "media", texto: `No hay feriados cargados para ${anio}: se usan los calculados por ley (sin puentes).`, tab: "ajustes" });
    }
    if (mes === 12 || mes === 1) {
      const proxCal = await calendarioDelAnio(mes === 12 ? sig.anio : anio);
      if (mes === 12 && proxCal.size === 0) avisos.push({ nivel: "media", texto: `Cargá el calendario oficial ${sig.anio} cuando ARCA y Rentas lo publiquen.`, tab: "fiscal" });
    }

    res.json({
      hoy,
      periodo,
      pendientes: pendientes.map(mapItem),
      cheques: chequesAbiertos.map(mapItem),
      tareas: tareas.map(mapItem),
      fiscal: {
        total: fiscalMes.length,
        cumplidos: fiscalMes.filter((i) => i.estado === "cumplido").length,
        cancelados: fiscalMes.filter((i) => i.estado === "cancelado").length,
        vencidos: fiscalMes.filter((i) => i.estado === "pendiente" && i.fecha < hoy).length,
        estimadas: fiscalMes.filter((i) => i.estado === "pendiente" && i.fechaOrigen === "estimada").length,
        obligaciones: obligs.length,
        oficiales,
        verificadas,
      },
      avisos,
    });
  }, "Error al armar el resumen."),
);

// ===== Ítems =====

router.get(
  "/administracion/items",
  h(async (req, res) => {
    const q = req.query;
    const conds = [];
    const desde = isoOk(q.desde);
    const hasta = isoOk(q.hasta);
    if (desde) conds.push(gte(admItemsTable.fecha, desde));
    if (hasta) conds.push(lte(admItemsTable.fecha, hasta));
    if (typeof q.tipo === "string" && q.tipo && q.tipo !== "todos") {
      const tipos = q.tipo.split(",").filter((t) => (TIPOS as readonly string[]).includes(t));
      if (tipos.length) conds.push(inArray(admItemsTable.tipo, tipos));
    }
    if (typeof q.estado === "string" && q.estado && q.estado !== "todos") {
      if (q.estado === "vencido") conds.push(and(eq(admItemsTable.estado, "pendiente"), lt(admItemsTable.fecha, hoyIso())));
      else if ((ESTADOS as readonly string[]).includes(q.estado)) conds.push(eq(admItemsTable.estado, q.estado));
      else fail("Estado inválido.");
    }
    if (typeof q.responsable === "string" && q.responsable) conds.push(eq(admItemsTable.responsable, q.responsable));
    if (typeof q.q === "string" && q.q.trim()) {
      const like = `%${q.q.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      conds.push(or(ilike(admItemsTable.titulo, like), ilike(admItemsTable.descripcion, like), ilike(admItemsTable.responsable, like), ilike(admItemsTable.comprobante, like), sql`${admItemsTable.datos}::text ILIKE ${like}`));
    }
    const limit = int(q.limit, 1, 5000, 3000);
    const rows = await db
      .select(itemSelect)
      .from(admItemsTable)
      .leftJoin(admObligacionesTable, eq(admItemsTable.obligacionId, admObligacionesTable.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(q.orden === "desc" ? desc(admItemsTable.fecha) : asc(admItemsTable.fecha), asc(admItemsTable.hora), asc(admItemsTable.id))
      .limit(limit);
    res.json(rows.map(mapItem));
  }, "Error al listar."),
);

router.get(
  "/administracion/items/:id",
  h(async (req, res) => {
    const it = await getItem(idParam(req));
    if (!it) {
      res.status(404).json({ message: "No encontrado." });
      return;
    }
    const historial = await db
      .select()
      .from(admHistorialTable)
      .where(and(eq(admHistorialTable.entidad, "item"), eq(admHistorialTable.entidadId, it.id)))
      .orderBy(desc(admHistorialTable.createdAt))
      .limit(100);
    res.json({ ...it, historial });
  }, "Error al leer."),
);

router.post(
  "/administracion/items",
  requireAccion("administracion", "cargar"),
  h(async (req, res) => {
    const data = parseItemBody(req.body ?? {}, false);
    const [row] = await db
      .insert(admItemsTable)
      .values({ ...(data as typeof admItemsTable.$inferInsert), estado: "pendiente", createdByUserId: req.authUser?.id ?? null })
      .returning();
    await registrar("item", row.id, "creado", `${row.titulo} · ${ar(row.fecha)}`, quien(req));
    res.status(201).json(await getItem(row.id));
  }, "Error al crear."),
);

router.patch(
  "/administracion/items/:id",
  requireAccion("administracion", "cargar"),
  h(async (req, res) => {
    const id = idParam(req);
    const [cur] = await db.select().from(admItemsTable).where(eq(admItemsTable.id, id)).limit(1);
    if (!cur) {
      res.status(404).json({ message: "No encontrado." });
      return;
    }
    const data = parseItemBody(req.body ?? {}, true);
    delete data.estado; // el estado cambia con /cumplir, /reabrir o /cancelar
    if (cur.obligacionId != null) delete data.tipo; // un fiscal generado sigue siendo fiscal
    // Fecha editada a mano en un fiscal: la automatización ya no la pisa.
    const patch: Partial<typeof admItemsTable.$inferInsert> = { ...data, updatedAt: new Date() };
    if (data.fecha && data.fecha !== cur.fecha && cur.obligacionId != null) patch.fechaOrigen = "manual";
    const [row] = await db.update(admItemsTable).set(patch).where(eq(admItemsTable.id, id)).returning();
    const cambios = Object.keys(data)
      .filter((k) => JSON.stringify((cur as Record<string, unknown>)[k]) !== JSON.stringify((data as Record<string, unknown>)[k]))
      .map((k) => (k === "fecha" ? `fecha ${ar(cur.fecha)} → ${ar(data.fecha)}` : k));
    if (cambios.length) await registrar("item", id, "editado", cambios.join(", "), quien(req));
    res.json(await getItem(row.id));
  }, "Error al actualizar."),
);

router.post(
  "/administracion/items/:id/cumplir",
  requireAccion("administracion", "cumplir"),
  h(async (req, res) => {
    const id = idParam(req);
    const it = await getItem(id);
    if (!it) {
      res.status(404).json({ message: "No encontrado." });
      return;
    }
    const b = req.body ?? {};
    const fecha = b.fecha ? isoOk(b.fecha) : hoyIso();
    if (!fecha) fail("Fecha de cumplimiento inválida.");
    let presentado = b.presentado !== undefined ? !!b.presentado : it.presentado;
    let pagado = b.pagado !== undefined ? !!b.pagado : it.pagado;
    const necesitaPres = it.requierePresentacion;
    const necesitaPago = it.requierePago;
    if (!necesitaPres && !necesitaPago) {
      presentado = true;
      pagado = true;
    }
    const completo = (!necesitaPres || presentado) && (!necesitaPago || pagado);
    const patch: Partial<typeof admItemsTable.$inferInsert> = {
      presentado,
      pagado,
      estado: completo ? "cumplido" : "pendiente",
      cumplidoFecha: fecha,
      cumplidoPor: req.authUser?.id ?? null,
      updatedAt: new Date(),
    };
    if (b.comprobante !== undefined) patch.comprobante = str(b.comprobante, 120);
    if (b.montoPagado !== undefined) patch.montoPagado = str(b.montoPagado, 40);
    if (b.nota !== undefined) patch.cumplimientoNota = str(b.nota, 2000);
    await db.update(admItemsTable).set(patch).where(eq(admItemsTable.id, id));
    const partes = [
      completo ? "Cumplido" : "Avance",
      necesitaPres ? (presentado ? "presentado" : "sin presentar") : "",
      necesitaPago ? (pagado ? "pagado" : "sin pagar") : "",
      patch.comprobante ? `comprobante ${patch.comprobante}` : "",
      patch.montoPagado ? `monto ${patch.montoPagado}` : "",
    ].filter(Boolean);
    await registrar("item", id, completo ? "cumplido" : "avance", `${partes.join(" · ")} (${ar(fecha)})`, quien(req));

    // Renovación (documentos, seguros, contratos): crea el próximo vencimiento.
    let renovado = null;
    const nueva = b.renovarFecha ? isoOk(b.renovarFecha) : null;
    if (b.renovarFecha && !nueva) fail("Fecha de renovación inválida.");
    if (nueva && completo) {
      const [row] = await db
        .insert(admItemsTable)
        .values({
          tipo: it.tipo === "fiscal" ? "vencimiento" : it.tipo,
          titulo: it.titulo,
          descripcion: it.descripcion,
          fecha: nueva,
          hora: it.hora,
          prioridad: it.prioridad,
          responsable: it.responsable,
          monto: it.monto,
          alertDays: it.alertDays,
          datos: it.datos as Record<string, unknown>,
          createdByUserId: req.authUser?.id ?? null,
        })
        .returning();
      await registrar("item", row.id, "creado", `Renovación de «${it.titulo}» · vence ${ar(nueva)}`, quien(req));
      renovado = await getItem(row.id);
    }
    res.json({ item: await getItem(id), renovado });
  }, "Error al registrar el cumplimiento."),
);

router.post(
  "/administracion/items/:id/reabrir",
  requireAccion("administracion", "cumplir"),
  h(async (req, res) => {
    const id = idParam(req);
    const [row] = await db
      .update(admItemsTable)
      .set({ estado: "pendiente", presentado: false, pagado: false, cumplidoFecha: null, cumplidoPor: null, updatedAt: new Date() })
      .where(eq(admItemsTable.id, id))
      .returning({ id: admItemsTable.id });
    if (!row) {
      res.status(404).json({ message: "No encontrado." });
      return;
    }
    await registrar("item", id, "reabierto", "Vuelve a pendiente", quien(req));
    res.json(await getItem(id));
  }, "Error al reabrir."),
);

router.post(
  "/administracion/items/:id/cancelar",
  requireAccion("administracion", "cumplir"),
  h(async (req, res) => {
    const id = idParam(req);
    const motivo = str(req.body?.motivo, 500);
    const [row] = await db.update(admItemsTable).set({ estado: "cancelado", updatedAt: new Date() }).where(eq(admItemsTable.id, id)).returning({ id: admItemsTable.id });
    if (!row) {
      res.status(404).json({ message: "No encontrado." });
      return;
    }
    await registrar("item", id, "cancelado", motivo || "Sin motivo", quien(req));
    res.json(await getItem(id));
  }, "Error al cancelar."),
);

router.delete(
  "/administracion/items/:id",
  requireAccion("administracion", "eliminar"),
  h(async (req, res) => {
    const id = idParam(req);
    const [cur] = await db.select().from(admItemsTable).where(eq(admItemsTable.id, id)).limit(1);
    if (!cur) {
      res.status(404).json({ message: "No encontrado." });
      return;
    }
    if (cur.obligacionId != null) {
      res.status(409).json({ message: "Los vencimientos fiscales se vuelven a generar solos. Si no corresponde este mes, usá «Cancelar»." });
      return;
    }
    if (cur.recurrenteId != null) {
      // Que la automatización no lo vuelva a crear.
      const base = (cur.datos as { base?: string })?.base || cur.fecha;
      await db
        .update(admRecurrentesTable)
        .set({ omitidas: sql`COALESCE(${admRecurrentesTable.omitidas}, '[]'::jsonb) || ${JSON.stringify([base])}::jsonb` })
        .where(eq(admRecurrentesTable.id, cur.recurrenteId));
    }
    await db.delete(admItemsTable).where(eq(admItemsTable.id, id));
    await registrar("item", id, "eliminado", `${cur.titulo} · ${ar(cur.fecha)}`, quien(req));
    res.status(204).end();
  }, "Error al eliminar."),
);

router.get(
  "/administracion/responsables",
  h(async (_req, res) => {
    const usados = await db.execute<{ r: string }>(sql`
      SELECT DISTINCT responsable AS r FROM adm_items WHERE responsable <> ''
      UNION SELECT DISTINCT responsable FROM adm_obligaciones WHERE responsable <> ''
      UNION SELECT DISTINCT responsable FROM adm_recurrentes WHERE responsable <> ''`);
    const users = await db
      .selectDistinct({ name: usersTable.name })
      .from(usersTable)
      .leftJoin(userModulesTable, eq(userModulesTable.userId, usersTable.id))
      .where(and(eq(usersTable.active, true), or(eq(usersTable.role, "superadmin"), eq(userModulesTable.moduleKey, "administracion"))));
    const set = new Set<string>([...users.map((u) => u.name), ...((usados as unknown as { rows?: { r: string }[] }).rows ?? (usados as unknown as { r: string }[])).map((r) => r.r)]);
    res.json([...set].filter(Boolean).sort((a, b) => a.localeCompare(b, "es")));
  }, "Error al listar responsables."),
);

// ===== Fiscal =====

function anioMes(q: Record<string, unknown>) {
  const now = new Date();
  const anio = int(q.anio, 2020, 2100, now.getFullYear());
  const mes = int(q.mes, 1, 12, now.getMonth() + 1);
  return { anio, mes };
}

router.get(
  "/administracion/fiscal",
  h(async (req, res) => {
    const { anio, mes } = anioMes(req.query as Record<string, unknown>);
    const periodo = periodoKey(anio, mes);
    const fer = new Feriados();
    const cal = await calendarioDelAnio(anio);
    const obligs = await db.select().from(admObligacionesTable).orderBy(asc(admObligacionesTable.orden), asc(admObligacionesTable.id));
    const items = await db
      .select(itemSelect)
      .from(admItemsTable)
      .leftJoin(admObligacionesTable, eq(admItemsTable.obligacionId, admObligacionesTable.id))
      .where(and(eq(admItemsTable.tipo, "fiscal"), or(eq(admItemsTable.periodo, periodo), and(isNull(admItemsTable.obligacionId), gte(admItemsTable.fecha, `${periodo}-01`), lte(admItemsTable.fecha, isoDate(anio, mes, 31))))))
      .orderBy(asc(admItemsTable.fecha));
    const porOblig = new Map(items.filter((i) => i.item.obligacionId != null).map((i) => [i.item.obligacionId!, mapItem(i)]));
    const filas = [];
    for (const o of obligs) {
      if (!aplicaEnMes(o, mes)) continue;
      const item = porOblig.get(o.id) ?? null;
      if (!o.activo && !item) continue;
      const f = await resolverFecha(o, anio, mes, fer, cal);
      filas.push({ obligacion: o, item, ...f });
    }
    const sueltos = items.filter((i) => i.item.obligacionId == null).map(mapItem);
    res.json({ anio, mes, periodo, filas, sueltos, feriadosCargados: (await fer.year(anio)).cargados });
  }, "Error al leer el mes fiscal."),
);

router.post(
  "/administracion/fiscal/generar",
  requireAccion("administracion", "verificar"),
  h(async (req, res) => {
    const { anio, mes } = anioMes(req.body ?? {});
    const r = await asegurarFiscalMes(anio, mes, quien(req));
    res.json(r);
  }, "Error al generar los vencimientos."),
);

// Catálogo de obligaciones
function parseObligacion(b: Record<string, unknown>, partial: boolean) {
  const out: Partial<typeof admObligacionesTable.$inferInsert> = {};
  if (!partial || b.nombre !== undefined) {
    const n = str(b.nombre, 160);
    if (!n) fail("El nombre es obligatorio.");
    out.nombre = n;
  }
  if (b.organismo !== undefined) {
    const o = str(b.organismo);
    if (!(ORGANISMOS as readonly string[]).includes(o)) fail("Organismo inválido.");
    out.organismo = o;
  }
  if (b.periodicidad !== undefined) {
    const p = str(b.periodicidad);
    if (p !== "mensual" && p !== "anual") fail("Periodicidad inválida.");
    out.periodicidad = p;
  }
  if (b.mesAnual !== undefined) out.mesAnual = b.mesAnual === null || b.mesAnual === "" ? null : int(b.mesAnual, 1, 12, 5);
  if (b.diaEstimado !== undefined) out.diaEstimado = int(b.diaEstimado, 1, 31, 20);
  if (b.desfasePeriodo !== undefined) out.desfasePeriodo = int(b.desfasePeriodo, -12, 0, -1);
  if (b.presentacion !== undefined) out.presentacion = !!b.presentacion;
  if (b.pago !== undefined) out.pago = !!b.pago;
  if (b.responsable !== undefined) out.responsable = str(b.responsable, 120);
  if (b.alertDays !== undefined) out.alertDays = int(b.alertDays, 0, 120, 7);
  if (b.referencia !== undefined) out.referencia = str(b.referencia, 300);
  if (b.notas !== undefined) out.notas = str(b.notas, 3000);
  if (b.claves !== undefined) out.claves = normalizarClaves(String(b.claves ?? ""));
  if (b.activo !== undefined) out.activo = !!b.activo;
  if (b.orden !== undefined) out.orden = int(b.orden, 0, 10_000, 0);
  if (out.periodicidad === "anual" && out.mesAnual == null && !partial) fail("Indicá el mes de vencimiento de la obligación anual.");
  return out;
}

/** "IVA | Valor Agregado||" → "iva|valor agregado" (sin tildes, sin repetidas). */
function normalizarClaves(txt: string): string {
  const set = new Set(
    txt
      .split("|")
      .map((c) => c.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120))
      .filter((c) => c.length >= 2),
  );
  return [...set].slice(0, 40).join("|");
}

async function resincronizarProximos(user: { id: number; name: string } | null) {
  const now = new Date();
  const a = { anio: now.getFullYear(), mes: now.getMonth() + 1 };
  const b = shiftMes(a.anio, a.mes, 1);
  await asegurarFiscalMes(a.anio, a.mes, user);
  await asegurarFiscalMes(b.anio, b.mes, user);
}

router.get(
  "/administracion/obligaciones",
  h(async (_req, res) => {
    const rows = await db.select().from(admObligacionesTable).orderBy(asc(admObligacionesTable.orden), asc(admObligacionesTable.id));
    res.json(rows);
  }, "Error al listar obligaciones."),
);

router.post(
  "/administracion/obligaciones",
  calendario,
  h(async (req, res) => {
    const data = parseObligacion(req.body ?? {}, false);
    const base = str(req.body?.codigo || data.nombre, 60)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "OBLIGACION";
    let codigo = base;
    for (let i = 2; (await db.select({ id: admObligacionesTable.id }).from(admObligacionesTable).where(eq(admObligacionesTable.codigo, codigo)).limit(1)).length; i++) codigo = `${base}_${i}`;
    const [row] = await db.insert(admObligacionesTable).values({ ...(data as typeof admObligacionesTable.$inferInsert), codigo }).returning();
    await registrar("obligacion", row.id, "creada", row.nombre, quien(req));
    await resincronizarProximos(quien(req));
    res.status(201).json(row);
  }, "Error al crear la obligación."),
);

router.patch(
  "/administracion/obligaciones/:id",
  calendario,
  h(async (req, res) => {
    const id = idParam(req);
    const data = parseObligacion(req.body ?? {}, true);
    const [row] = await db.update(admObligacionesTable).set({ ...data, updatedAt: new Date() }).where(eq(admObligacionesTable.id, id)).returning();
    if (!row) {
      res.status(404).json({ message: "No encontrada." });
      return;
    }
    if (row.periodicidad === "anual" && row.mesAnual == null) fail("Indicá el mes de vencimiento de la obligación anual.");
    await registrar("obligacion", id, "editada", Object.keys(data).join(", "), quien(req));
    await resincronizarProximos(quien(req));
    res.json(row);
  }, "Error al actualizar la obligación."),
);

router.delete(
  "/administracion/obligaciones/:id",
  calendario,
  h(async (req, res) => {
    const id = idParam(req);
    const [usada] = await db.select({ id: admItemsTable.id }).from(admItemsTable).where(eq(admItemsTable.obligacionId, id)).limit(1);
    if (usada) {
      res.status(409).json({ message: "Tiene vencimientos registrados: desactivala en lugar de eliminarla para conservar el historial." });
      return;
    }
    const [row] = await db.delete(admObligacionesTable).where(eq(admObligacionesTable.id, id)).returning();
    if (!row) {
      res.status(404).json({ message: "No encontrada." });
      return;
    }
    await registrar("obligacion", id, "eliminada", row.nombre, quien(req));
    res.status(204).end();
  }, "Error al eliminar la obligación."),
);

// Calendario oficial
router.get(
  "/administracion/calendario",
  h(async (req, res) => {
    const { anio } = anioMes(req.query as Record<string, unknown>);
    const fer = new Feriados();
    const cal = await calendarioDelAnio(anio);
    const obligs = await db.select().from(admObligacionesTable).orderBy(asc(admObligacionesTable.orden), asc(admObligacionesTable.id));
    const celdas: Record<number, Record<number, { fecha: string; origen: string; norma: string; verificado: boolean }>> = {};
    for (const o of obligs) {
      celdas[o.id] = {};
      for (let mes = 1; mes <= 12; mes++) {
        if (!aplicaEnMes(o, mes)) continue;
        celdas[o.id][mes] = await resolverFecha(o, anio, mes, fer, cal);
      }
    }
    res.json({ anio, obligaciones: obligs, celdas, feriadosCargados: (await fer.year(anio)).cargados });
  }, "Error al leer el calendario."),
);

async function guardarFecha(obligacionId: number, anio: number, mes: number, fecha: string | null, origen: string, norma: string, user: { id: number; name: string } | null, motivo = "") {
  const [o] = await db.select().from(admObligacionesTable).where(eq(admObligacionesTable.id, obligacionId)).limit(1);
  if (!o) fail("Obligación inexistente.");
  const [prev] = await db
    .select()
    .from(admCalendarioTable)
    .where(and(eq(admCalendarioTable.obligacionId, obligacionId), eq(admCalendarioTable.anio, anio), eq(admCalendarioTable.mes, mes)))
    .limit(1);
  if (!fecha) {
    if (prev) await db.delete(admCalendarioTable).where(eq(admCalendarioTable.id, prev.id));
    await registrar("calendario", obligacionId, "quitada", `${o.nombre} ${mes}/${anio}: vuelve a fecha estimada`, user);
  } else {
    await db
      .insert(admCalendarioTable)
      .values({ obligacionId, anio, mes, fecha, origen, norma, verificadoPor: user?.id ?? null, verificadoAt: new Date() })
      .onConflictDoUpdate({
        target: [admCalendarioTable.obligacionId, admCalendarioTable.anio, admCalendarioTable.mes],
        set: { fecha, origen, norma, verificadoPor: user?.id ?? null, verificadoAt: new Date(), updatedAt: new Date() },
      });
    if (!prev || prev.fecha !== fecha || prev.origen !== origen) {
      const txt = `${o.nombre} ${mes}/${anio}: ${prev ? `${ar(prev.fecha)} → ` : ""}${ar(fecha)}${origen === "prorroga" ? " (prórroga)" : ""}${norma ? ` · ${norma}` : ""}${motivo ? ` · ${motivo}` : ""}`;
      await registrar("calendario", obligacionId, origen === "prorroga" ? "prorroga" : "fecha", txt, user);
    }
  }
}

/** Después de tocar el calendario: actualiza los ítems del mes (crea si es el mes en curso o el siguiente). */
async function aplicarCalendario(anio: number, mes: number, user: { id: number; name: string } | null) {
  const now = new Date();
  const actual = now.getFullYear() * 12 + now.getMonth();
  const idx = anio * 12 + (mes - 1);
  const [existe] = await db.select({ id: admItemsTable.id }).from(admItemsTable).where(eq(admItemsTable.periodo, periodoKey(anio, mes))).limit(1);
  if (idx <= actual + 1 || existe) await asegurarFiscalMes(anio, mes, user);
}

router.put(
  "/administracion/calendario",
  calendario,
  h(async (req, res) => {
    const b = req.body ?? {};
    const obligacionId = int(b.obligacionId, 1, 2_147_483_647, 0);
    const anio = int(b.anio, 2020, 2100, 0);
    const mes = int(b.mes, 1, 12, 0);
    if (!obligacionId || !anio || !mes) fail("Faltan obligación, año o mes.");
    const fecha = b.fecha ? isoOk(b.fecha) : null;
    if (b.fecha && !fecha) fail("Fecha inválida.");
    const origen = b.origen === "prorroga" ? "prorroga" : "oficial";
    await guardarFecha(obligacionId, anio, mes, fecha, origen, str(b.norma, 200), quien(req), str(b.motivo, 300));
    await aplicarCalendario(anio, mes, quien(req));
    res.json({ ok: true });
  }, "Error al guardar la fecha."),
);

router.post(
  "/administracion/calendario/lote",
  calendario,
  h(async (req, res) => {
    const b = req.body ?? {};
    const obligacionId = int(b.obligacionId, 1, 2_147_483_647, 0);
    const anio = int(b.anio, 2020, 2100, 0);
    if (!obligacionId || !anio) fail("Faltan obligación o año.");
    const texto = Array.isArray(b.fechas) ? b.fechas.join("\n") : str(b.texto ?? b.fechas, 20_000);
    const encontradas = texto.match(/\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{4}/g) ?? [];
    const porMes = new Map<number, string>();
    const ignoradas: string[] = [];
    for (const raw of encontradas) {
      const f = parseFechaFlexible(raw);
      if (!f || Number(f.slice(0, 4)) !== anio) {
        ignoradas.push(raw);
        continue;
      }
      porMes.set(Number(f.slice(5, 7)), f);
    }
    if (!porMes.size) fail(`No se encontraron fechas de ${anio} en el texto.`);
    const norma = str(b.norma, 200);
    for (const [mes, fecha] of porMes) await guardarFecha(obligacionId, anio, mes, fecha, "oficial", norma, quien(req));
    for (const mes of porMes.keys()) await aplicarCalendario(anio, mes, quien(req));
    await cerrarTareaSistema(claveCalendario(anio), `Calendario ${anio} cargado`, quien(req));
    res.json({ cargadas: porMes.size, meses: [...porMes.keys()].sort((a, c) => a - c), ignoradas });
  }, "Error al cargar las fechas."),
);

/**
 * Importa la agenda completa pegada (la web arma las filas y el usuario confirma a qué obligación va cada una).
 * Si dos fechas caen en el mismo mes de la misma obligación, queda la última. `claves`: correcciones para recordar.
 */
router.post(
  "/administracion/calendario/importar",
  calendario,
  h(async (req, res) => {
    const b = req.body ?? {};
    const anio = int(b.anio, 2020, 2100, 0);
    if (!anio) fail("Falta el año.");
    const filas = Array.isArray(b.filas) ? b.filas.slice(0, 2000) : [];
    const obligs = new Map((await db.select().from(admObligacionesTable)).map((o) => [o.id, o]));
    const porClave = new Map<string, { obligacionId: number; mes: number; fecha: string }>();
    for (const f of filas) {
      const obligacionId = Number(f?.obligacionId);
      const fecha = isoOk(f?.fecha);
      if (!obligs.has(obligacionId) || !fecha || Number(fecha.slice(0, 4)) !== anio) continue;
      const mes = Number(fecha.slice(5, 7));
      porClave.set(`${obligacionId}:${mes}`, { obligacionId, mes, fecha });
    }
    if (!porClave.size) fail(`No hay fechas de ${anio} asignadas a obligaciones.`);
    const norma = str(b.norma, 200);
    const user = quien(req);
    for (const x of porClave.values()) await guardarFecha(x.obligacionId, anio, x.mes, x.fecha, "oficial", norma, user);
    for (const mes of new Set([...porClave.values()].map((x) => x.mes))) await aplicarCalendario(anio, mes, user);

    // Aprender: el texto que el usuario asignó a mano pasa a ser palabra clave de esa obligación.
    let aprendidas = 0;
    for (const c of Array.isArray(b.claves) ? b.claves.slice(0, 200) : []) {
      const o = obligs.get(Number(c?.obligacionId));
      const nueva = normalizarClaves(String(c?.texto ?? ""));
      if (!o || !nueva) continue;
      const actual = new Set(o.claves.split("|").filter(Boolean));
      if (actual.has(nueva)) continue;
      o.claves = normalizarClaves([...actual, nueva].join("|"));
      await db.update(admObligacionesTable).set({ claves: o.claves, updatedAt: new Date() }).where(eq(admObligacionesTable.id, o.id));
      aprendidas++;
    }
    await registrar("calendario", null, "importado", `${porClave.size} fechas de ${anio} desde la agenda pegada${norma ? ` · ${norma}` : ""}`, user);
    await cerrarTareaSistema(claveCalendario(anio), `Calendario ${anio} cargado (${porClave.size} fechas)`, user);
    res.json({ cargadas: porClave.size, obligaciones: new Set([...porClave.values()].map((x) => x.obligacionId)).size, aprendidas });
  }, "Error al importar la agenda."),
);

/** "Verifiqué el mes contra el calendario oficial": las fechas estimadas que coinciden pasan a oficiales. */
router.post(
  "/administracion/calendario/verificar",
  requireAccion("administracion", "verificar"),
  h(async (req, res) => {
    const { anio, mes } = anioMes(req.body ?? {});
    const fer = new Feriados();
    const cal = await calendarioDelAnio(anio);
    const obligs = (await db.select().from(admObligacionesTable).where(eq(admObligacionesTable.activo, true))).filter((o) => aplicaEnMes(o, mes));
    const user = quien(req);
    for (const o of obligs) {
      const row = cal.get(`${o.id}:${anio}:${mes}`);
      if (row) {
        await db.update(admCalendarioTable).set({ verificadoPor: user?.id ?? null, verificadoAt: new Date() }).where(eq(admCalendarioTable.id, row.id));
      } else {
        const f = await resolverFecha(o, anio, mes, fer, cal);
        await db.insert(admCalendarioTable).values({ obligacionId: o.id, anio, mes, fecha: f.fecha, origen: "oficial", verificadoPor: user?.id ?? null, verificadoAt: new Date() }).onConflictDoNothing();
      }
    }
    await registrar("calendario", null, "verificado", `Fechas de ${mes}/${anio} verificadas con el calendario oficial (${obligs.length} obligaciones)`, user);
    await aplicarCalendario(anio, mes, user);
    await cerrarTareaSistema(claveVerificar(anio, mes), "Fechas del mes verificadas", user);
    res.json({ verificadas: obligs.length });
  }, "Error al verificar."),
);

router.get(
  "/administracion/historial",
  h(async (req, res) => {
    const entidad = typeof req.query.entidad === "string" ? req.query.entidad : undefined;
    const rows = await db
      .select({ h: admHistorialTable, titulo: admItemsTable.titulo })
      .from(admHistorialTable)
      .leftJoin(admItemsTable, and(eq(admHistorialTable.entidad, "item"), eq(admHistorialTable.entidadId, admItemsTable.id)))
      .where(entidad ? eq(admHistorialTable.entidad, entidad) : undefined)
      .orderBy(desc(admHistorialTable.createdAt))
      .limit(int(req.query.limit, 1, 500, 100));
    res.json(rows.map((r) => ({ ...r.h, titulo: r.titulo })));
  }, "Error al leer el historial."),
);

// ===== Feriados =====

router.get(
  "/administracion/feriados",
  h(async (req, res) => {
    const { anio } = anioMes(req.query as Record<string, unknown>);
    const rows = await db
      .select()
      .from(admFeriadosTable)
      .where(and(gte(admFeriadosTable.fecha, `${anio}-01-01`), lte(admFeriadosTable.fecha, `${anio}-12-31`)))
      .orderBy(asc(admFeriadosTable.fecha));
    res.json(rows);
  }, "Error al listar feriados."),
);

router.post(
  "/administracion/feriados",
  calendario,
  h(async (req, res) => {
    const fecha = isoOk(req.body?.fecha);
    if (!fecha) fail("Fecha inválida.");
    const nombre = str(req.body?.nombre, 160) || "Feriado";
    const tipo = (TIPOS_FERIADO as readonly string[]).includes(String(req.body?.tipo)) ? String(req.body.tipo) : "inamovible";
    await db.insert(admFeriadosTable).values({ fecha: fecha!, nombre, tipo }).onConflictDoUpdate({ target: admFeriadosTable.fecha, set: { nombre, tipo } });
    await registrar("feriado", null, "cargado", `${ar(fecha)} · ${nombre}`, quien(req));
    await resincronizarProximos(quien(req));
    res.status(201).json({ fecha, nombre, tipo });
  }, "Error al guardar el feriado."),
);

router.delete(
  "/administracion/feriados/:fecha",
  calendario,
  h(async (req, res) => {
    const fecha = isoOk(req.params.fecha);
    if (!fecha) fail("Fecha inválida.");
    await db.delete(admFeriadosTable).where(eq(admFeriadosTable.fecha, fecha!));
    await registrar("feriado", null, "eliminado", fecha!, quien(req));
    await resincronizarProximos(quien(req));
    res.status(204).end();
  }, "Error al eliminar el feriado."),
);

/** Trae los feriados nacionales del año desde ArgentinaDatos (dato público). Necesita salida a internet. */
router.post(
  "/administracion/feriados/importar",
  calendario,
  h(async (req, res) => {
    const anio = int(req.body?.anio, 2020, 2100, new Date().getFullYear());
    let lista: { fecha: string; nombre: string; tipo: string }[];
    try {
      const r = await fetch(`https://api.argentinadatos.com/v1/feriados/${anio}`, { signal: AbortSignal.timeout(10_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      lista = (await r.json()) as typeof lista;
    } catch (err) {
      console.error("[feriados.importar]", err);
      res.status(502).json({ message: "No se pudo consultar la lista pública de feriados (¿el servidor tiene internet?). Podés cargarlos a mano." });
      return;
    }
    let n = 0;
    for (const f of Array.isArray(lista) ? lista : []) {
      const fecha = isoOk(f?.fecha);
      if (!fecha || !fecha.startsWith(`${anio}-`)) continue;
      const tipo = (TIPOS_FERIADO as readonly string[]).includes(f.tipo) ? f.tipo : "inamovible";
      const nombre = str(f.nombre, 160) || "Feriado";
      await db.insert(admFeriadosTable).values({ fecha, nombre, tipo }).onConflictDoUpdate({ target: admFeriadosTable.fecha, set: { nombre, tipo } });
      n++;
    }
    if (!n) {
      res.status(404).json({ message: `Todavía no hay feriados publicados para ${anio}.` });
      return;
    }
    await registrar("feriado", null, "importado", `${n} feriados de ${anio} (ArgentinaDatos)`, quien(req));
    await resincronizarProximos(quien(req));
    res.json({ importados: n });
  }, "Error al importar feriados."),
);

// ===== Recurrentes =====

function parseRecurrente(b: Record<string, unknown>, partial: boolean) {
  const out: Partial<typeof admRecurrentesTable.$inferInsert> = {};
  if (!partial || b.titulo !== undefined) {
    const t = str(b.titulo, 300);
    if (!t) fail("El título es obligatorio.");
    out.titulo = t;
  }
  if (!partial || b.tipo !== undefined) {
    const t = str(b.tipo || "pago");
    if (!(TIPOS as readonly string[]).includes(t) || t === "fiscal") fail("Tipo inválido.");
    out.tipo = t;
  }
  if (!partial || b.frecuencia !== undefined) {
    const f = str(b.frecuencia || "mensual");
    if (!(f in FRECUENCIAS)) fail("Frecuencia inválida.");
    out.frecuencia = f;
  }
  if (!partial || b.desde !== undefined) {
    const d = isoOk(b.desde);
    if (!d) fail("Fecha de inicio inválida.");
    out.desde = d!;
  }
  if (b.hasta !== undefined) {
    if (b.hasta === null || b.hasta === "") out.hasta = null;
    else {
      const d = isoOk(b.hasta);
      if (!d) fail("Fecha de fin inválida.");
      out.hasta = d;
    }
  }
  if (b.dia !== undefined) out.dia = int(b.dia, 1, 31, 10);
  else if (!partial && out.desde) out.dia = Number(out.desde.slice(8, 10));
  if (b.habiles !== undefined) out.habiles = !!b.habiles;
  if (b.descripcion !== undefined) out.descripcion = str(b.descripcion, 3000);
  if (b.monto !== undefined) out.monto = str(b.monto, 40);
  if (b.responsable !== undefined) out.responsable = str(b.responsable, 120);
  if (b.alertDays !== undefined) out.alertDays = int(b.alertDays, 0, 120, 3);
  if (b.activo !== undefined) out.activo = !!b.activo;
  return out;
}

router.get(
  "/administracion/recurrentes",
  h(async (_req, res) => {
    const rows = await db.select().from(admRecurrentesTable).orderBy(desc(admRecurrentesTable.activo), asc(admRecurrentesTable.titulo));
    const prox = await db.execute<{ recurrente_id: number; fecha: string }>(sql`
      SELECT recurrente_id, min(fecha)::text AS fecha FROM adm_items
      WHERE recurrente_id IS NOT NULL AND estado = 'pendiente' AND fecha >= ${hoyIso()}
      GROUP BY recurrente_id`);
    const list = ((prox as unknown as { rows?: { recurrente_id: number; fecha: string }[] }).rows ?? (prox as unknown as { recurrente_id: number; fecha: string }[]));
    const map = new Map(list.map((p) => [Number(p.recurrente_id), String(p.fecha).slice(0, 10)]));
    res.json(rows.map((r) => ({ ...r, proxima: map.get(r.id) ?? null })));
  }, "Error al listar recurrentes."),
);

router.post(
  "/administracion/recurrentes",
  requireAccion("administracion", "recurrentes"),
  h(async (req, res) => {
    const data = parseRecurrente(req.body ?? {}, false);
    const [row] = await db.insert(admRecurrentesTable).values({ ...(data as typeof admRecurrentesTable.$inferInsert), createdByUserId: req.authUser?.id ?? null }).returning();
    await registrar("recurrente", row.id, "creado", `${row.titulo} · ${row.frecuencia}`, quien(req));
    const g = await generarRecurrentes(62, row.id);
    res.status(201).json({ ...row, generados: g.creados });
  }, "Error al crear el recurrente."),
);

router.patch(
  "/administracion/recurrentes/:id",
  requireAccion("administracion", "recurrentes"),
  h(async (req, res) => {
    const id = idParam(req);
    const data = parseRecurrente(req.body ?? {}, true);
    const [row] = await db.update(admRecurrentesTable).set({ ...data, updatedAt: new Date() }).where(eq(admRecurrentesTable.id, id)).returning();
    if (!row) {
      res.status(404).json({ message: "No encontrado." });
      return;
    }
    // Los pendientes futuros se rehacen con la configuración nueva; lo pasado queda como está.
    await borrarItems((await pendientesFuturosDeRecurrente(id)).map((r) => r.id));
    const g = await generarRecurrentes(62, id);
    await registrar("recurrente", id, "editado", Object.keys(data).join(", "), quien(req));
    res.json({ ...row, generados: g.creados });
  }, "Error al actualizar el recurrente."),
);

router.delete(
  "/administracion/recurrentes/:id",
  requireAccion("administracion", "eliminar"),
  h(async (req, res) => {
    const id = idParam(req);
    await borrarItems((await pendientesFuturosDeRecurrente(id)).map((r) => r.id));
    const [row] = await db.delete(admRecurrentesTable).where(eq(admRecurrentesTable.id, id)).returning();
    if (!row) {
      res.status(404).json({ message: "No encontrado." });
      return;
    }
    await registrar("recurrente", id, "eliminado", row.titulo, quien(req));
    res.status(204).end();
  }, "Error al eliminar el recurrente."),
);

// ===== Contactos =====

function parseContacto(b: Record<string, unknown>, partial: boolean) {
  const out: Partial<typeof admContactosTable.$inferInsert> = {};
  if (!partial || b.nombre !== undefined) {
    const n = str(b.nombre, 160);
    if (!n) fail("El nombre es obligatorio.");
    out.nombre = n;
  }
  for (const k of ["rubro", "persona", "telefono", "email", "cuit"] as const) if (b[k] !== undefined) out[k] = str(b[k], 160);
  if (b.notas !== undefined) out.notas = str(b.notas, 3000);
  return out;
}

router.get(
  "/administracion/contactos",
  h(async (_req, res) => {
    res.json(await db.select().from(admContactosTable).orderBy(asc(admContactosTable.nombre)));
  }, "Error al listar contactos."),
);

router.post(
  "/administracion/contactos",
  requireAccion("administracion", "contactos"),
  h(async (req, res) => {
    const [row] = await db.insert(admContactosTable).values(parseContacto(req.body ?? {}, false) as typeof admContactosTable.$inferInsert).returning();
    res.status(201).json(row);
  }, "Error al crear el contacto."),
);

router.patch(
  "/administracion/contactos/:id",
  requireAccion("administracion", "contactos"),
  h(async (req, res) => {
    const [row] = await db
      .update(admContactosTable)
      .set({ ...parseContacto(req.body ?? {}, true), updatedAt: new Date() })
      .where(eq(admContactosTable.id, idParam(req)))
      .returning();
    if (!row) {
      res.status(404).json({ message: "No encontrado." });
      return;
    }
    res.json(row);
  }, "Error al actualizar el contacto."),
);

router.delete(
  "/administracion/contactos/:id",
  requireAccion("administracion", "eliminar"),
  h(async (req, res) => {
    const [row] = await db.delete(admContactosTable).where(eq(admContactosTable.id, idParam(req))).returning({ id: admContactosTable.id });
    if (!row) {
      res.status(404).json({ message: "No encontrado." });
      return;
    }
    res.status(204).end();
  }, "Error al eliminar el contacto."),
);

export default router;
