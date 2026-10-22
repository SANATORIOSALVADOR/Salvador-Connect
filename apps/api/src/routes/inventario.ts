import { Router, type IRouter, type Request } from "express";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db, invItemsTable, invPlanesTable, invRegistrosTable, sectorsTable } from "@salvador/db";
import {
  canSeeSector,
  canWriteSector,
  hoyIso,
  ownSectorIds,
  requireAccion,
  requireAuth,
  requireModuleAccess,
  visibleSectorIds,
  type AuthUser,
} from "../lib/auth";

// Inventario: equipos y bienes por planta / sector, con registro de controles, fallas y reparaciones.
// Cada ruta de escritura exige su acción (lib/acciones.ts) y respeta el alcance por sector.

const router: IRouter = Router();
router.use("/inventario", requireAuth, requireModuleAccess("inventario", { porRuta: true }));

export const ESTADOS = ["operativo", "con_falla", "en_reparacion", "fuera_servicio", "baja"] as const;
type Estado = (typeof ESTADOS)[number];
const ESTADO_LABEL: Record<Estado, string> = {
  operativo: "Operativo",
  con_falla: "Con falla",
  en_reparacion: "En reparación",
  fuera_servicio: "Fuera de servicio",
  baja: "Baja",
};
const TIPOS_REGISTRO = ["control", "falla", "reparacion"] as const;
const RESULTADOS = ["ok", "observacion", "falla"] as const;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_IMPORTAR = 5000;

// ---------- utilidades ----------

/** Texto limpio: sin espacios de más y con largo máximo. */
function limpio(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Clave comparable: sin tildes, minúsculas ("Electromedicina" = "ELECTROMEDICINA"). */
function clave(v: string): string {
  return (v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function sumarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

function fechaValida(v: unknown): string | null {
  const t = String(v ?? "").slice(0, 10);
  return FECHA_RE.test(t) && !Number.isNaN(Date.parse(t + "T12:00:00Z")) ? t : null;
}

function quien(req: Request) {
  return { userId: req.authUser?.id ?? null, userNombre: req.authUser?.name ?? "" };
}

/** Frecuencia en días: número o palabra (mensual, trimestral, semestral, anual…). */
function frecuencia(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) && v >= 1 && v <= 3650 ? Math.round(v) : null;
  const t = clave(String(v));
  if (!t) return null;
  const palabras: Record<string, number> = {
    diario: 1,
    semanal: 7,
    quincenal: 15,
    mensual: 30,
    bimestral: 60,
    trimestral: 90,
    cuatrimestral: 120,
    semestral: 180,
    anual: 365,
    bianual: 730,
  };
  for (const [p, d] of Object.entries(palabras)) if (t.startsWith(p)) return d;
  const n = Number(t.replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n >= 1 && n <= 3650 ? n : null;
}

/** Estado desde texto libre (importación): "funciona", "con falla", "reparación"… */
function estadoDe(v: unknown): Estado | null {
  const t = clave(String(v ?? ""));
  if (!t) return null;
  if ((ESTADOS as readonly string[]).includes(t)) return t as Estado;
  if (/^(operativo|ok|funciona|activo|bien|en uso)/.test(t)) return "operativo";
  if (/falla|roto|averia/.test(t)) return "con_falla";
  if (/repar|service|tecnico/.test(t)) return "en_reparacion";
  if (/fuera/.test(t)) return "fuera_servicio";
  if (/baja|descart/.test(t)) return "baja";
  return null;
}

/** Condición SQL: solo equipos de los sectores que la persona puede ver (undefined = todos). */
function soloVisibles(user: AuthUser | undefined) {
  const ids = visibleSectorIds(user, "inventario");
  if (!ids) return undefined;
  return ids.length ? inArray(invItemsTable.sectorId, ids) : sql`false`;
}

type ItemRow = typeof invItemsTable.$inferSelect;

function mapItem(r: ItemRow, sectorName?: string | null) {
  return {
    id: r.id,
    planta: r.planta,
    sectorId: r.sectorId,
    sectorName: sectorName ?? null,
    rubro: r.rubro,
    tipo: r.tipo,
    descripcion: r.descripcion,
    marca: r.marca,
    codigoSerie: r.codigoSerie,
    estado: r.estado,
    frecuenciaDias: r.frecuenciaDias,
    ultimoControl: r.ultimoControl,
    proximoControl: r.proximoControl,
    observaciones: r.observaciones,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Valores ya usados (planta / rubro / tipo) para reutilizar la misma grafía. */
async function catalogoExistente(): Promise<Record<"planta" | "rubro" | "tipo", Map<string, string>>> {
  const rows = await db.selectDistinct({ planta: invItemsTable.planta, rubro: invItemsTable.rubro, tipo: invItemsTable.tipo }).from(invItemsTable);
  const out = { planta: new Map<string, string>(), rubro: new Map<string, string>(), tipo: new Map<string, string>() };
  for (const r of rows) {
    for (const campo of ["planta", "rubro", "tipo"] as const) {
      const v = r[campo];
      if (v && !out[campo].has(clave(v))) out[campo].set(clave(v), v);
    }
  }
  return out;
}

async function planes(): Promise<Map<string, number>> {
  return new Map((await db.select().from(invPlanesTable)).map((p) => [clave(p.tipo), p.frecuenciaDias]));
}

async function sectoresPorId(): Promise<Map<number, { id: number; name: string; shortName: string; active: boolean }>> {
  return new Map((await db.select().from(sectorsTable)).map((s) => [s.id, s]));
}

function h(fn: (req: Request, res: import("express").Response) => Promise<void>, msg: string) {
  return async (req: Request, res: import("express").Response) => {
    try {
      await fn(req, res);
    } catch (err) {
      const e = err as { status?: number; message?: string; code?: string; cause?: { code?: string } };
      if (e.status) {
        res.status(e.status).json({ message: e.message });
        return;
      }
      const code = e.cause?.code ?? e.code;
      if (code === "23505") {
        res.status(409).json({ message: "Ya hay un equipo con ese código de serie." });
        return;
      }
      console.error("[inventario]", err);
      res.status(500).json({ message: msg });
    }
  };
}

function falla(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}

async function itemVisible(req: Request, id: number): Promise<ItemRow> {
  const [it] = id ? await db.select().from(invItemsTable).where(eq(invItemsTable.id, id)).limit(1) : [];
  if (!it || !canSeeSector(req.authUser, "inventario", it.sectorId)) falla(404, "Equipo no encontrado.");
  return it;
}

function exigirSector(req: Request, sectorId: number) {
  if (!canWriteSector(req.authUser, "inventario", sectorId)) falla(403, "Solo podés trabajar con equipos de los sectores que tenés a cargo.");
}

/** Datos de un equipo (alta / edición). parcial = solo lo que viene. */
function leerItem(body: Record<string, unknown>, parcial: boolean) {
  const out: Partial<{
    planta: string;
    sectorId: number;
    rubro: string;
    tipo: string;
    descripcion: string;
    marca: string;
    codigoSerie: string;
    estado: Estado;
    frecuenciaDias: number | null;
    observaciones: string;
    ultimoControl: string | null;
  }> = {};
  const req = (campo: "planta" | "rubro" | "tipo" | "descripcion", nombre: string, max: number) => {
    if (parcial && body[campo] === undefined) return;
    const v = limpio(body[campo], max);
    if (!v) falla(400, `${nombre} es obligatorio.`);
    out[campo] = v;
  };
  req("planta", "La planta", 80);
  req("rubro", "El rubro", 80);
  req("tipo", "El tipo", 80);
  req("descripcion", "La descripción", 300);
  if (!parcial || body.sectorId !== undefined) {
    const s = Number(body.sectorId);
    if (!Number.isInteger(s) || s <= 0) falla(400, "El sector es obligatorio.");
    out.sectorId = s;
  }
  if (body.marca !== undefined) out.marca = limpio(body.marca, 80);
  if (body.codigoSerie !== undefined) out.codigoSerie = limpio(body.codigoSerie, 80);
  if (body.observaciones !== undefined) out.observaciones = limpio(body.observaciones, 1000);
  if (body.estado !== undefined) {
    if (!(ESTADOS as readonly string[]).includes(String(body.estado))) falla(400, "Estado inválido.");
    out.estado = body.estado as Estado;
  }
  const f = frecuencia(body.frecuenciaDias);
  if (f !== undefined) out.frecuenciaDias = f;
  if (body.ultimoControl !== undefined) out.ultimoControl = body.ultimoControl ? fechaValida(body.ultimoControl) : null;
  return out;
}

async function registrar(itemId: number, tipo: string, detalle: string, req: Request, extra: Partial<typeof invRegistrosTable.$inferInsert> = {}) {
  await db.insert(invRegistrosTable).values({ itemId, tipo, fecha: extra.fecha ?? hoyIso(), detalle: detalle.slice(0, 2000), ...quien(req), ...extra });
}

// ---------- equipos ----------

router.get(
  "/inventario/items",
  h(async (req, res) => {
    const conBajas = req.query.bajas === "1";
    const cond = [soloVisibles(req.authUser), conBajas ? undefined : sql`${invItemsTable.estado} <> 'baja'`].filter(Boolean);
    const rows = await db
      .select({ it: invItemsTable, sector: sectorsTable.name })
      .from(invItemsTable)
      .leftJoin(sectorsTable, eq(invItemsTable.sectorId, sectorsTable.id))
      .where(cond.length ? and(...(cond as ReturnType<typeof sql>[])) : undefined)
      .orderBy(asc(invItemsTable.id));
    res.json(rows.map((r) => mapItem(r.it, r.sector)));
  }, "Error al listar el inventario."),
);

router.get(
  "/inventario/items/:id",
  h(async (req, res) => {
    const it = await itemVisible(req, Number(req.params.id));
    const [sector] = await db.select({ name: sectorsTable.name }).from(sectorsTable).where(eq(sectorsTable.id, it.sectorId)).limit(1);
    const registros = await db
      .select()
      .from(invRegistrosTable)
      .where(eq(invRegistrosTable.itemId, it.id))
      .orderBy(desc(invRegistrosTable.fecha), desc(invRegistrosTable.id))
      .limit(500);
    res.json({ ...mapItem(it, sector?.name), registros });
  }, "Error al leer el equipo."),
);

router.post(
  "/inventario/items",
  requireAccion("inventario", "cargar"),
  h(async (req, res) => {
    const d = leerItem(req.body ?? {}, false);
    const sectores = await sectoresPorId();
    if (!sectores.has(d.sectorId!)) falla(400, "Sector inexistente.");
    exigirSector(req, d.sectorId!);
    const cat = await catalogoExistente();
    const plan = await planes();
    const planta = cat.planta.get(clave(d.planta!)) ?? d.planta!;
    const rubro = cat.rubro.get(clave(d.rubro!)) ?? d.rubro!;
    const tipo = cat.tipo.get(clave(d.tipo!)) ?? d.tipo!;
    const freq = d.frecuenciaDias !== undefined ? d.frecuenciaDias : (plan.get(clave(tipo)) ?? null);
    const ultimo = d.ultimoControl ?? null;
    const [row] = await db
      .insert(invItemsTable)
      .values({
        planta,
        sectorId: d.sectorId!,
        rubro,
        tipo,
        descripcion: d.descripcion!,
        marca: d.marca ?? "",
        codigoSerie: d.codigoSerie ?? "",
        estado: d.estado ?? "operativo",
        frecuenciaDias: freq,
        ultimoControl: ultimo,
        proximoControl: freq ? sumarDias(ultimo ?? hoyIso(), freq) : null,
        observaciones: d.observaciones ?? "",
        createdByUserId: req.authUser?.id ?? null,
      })
      .returning();
    await registrar(row.id, "alta", `Alta en ${sectores.get(row.sectorId)?.name ?? "—"}${row.planta ? ` · ${row.planta}` : ""}`, req, { estadoNuevo: row.estado });
    res.status(201).json(mapItem(row, sectores.get(row.sectorId)?.name));
  }, "Error al dar de alta el equipo."),
);

/** Cambios de un equipo con registro (traslado de sector / cambios de datos). */
async function aplicarCambios(req: Request, it: ItemRow, d: ReturnType<typeof leerItem>, sectores: Map<number, { name: string }>) {
  const cat = await catalogoExistente();
  const patch: Partial<typeof invItemsTable.$inferInsert> = {};
  const cambios: string[] = [];
  const LBL: Record<string, string> = { planta: "Planta", rubro: "Rubro", tipo: "Tipo", descripcion: "Descripción", marca: "Marca", codigoSerie: "Código de serie", observaciones: "Observaciones" };
  for (const campo of ["planta", "rubro", "tipo", "descripcion", "marca", "codigoSerie", "observaciones"] as const) {
    let v = d[campo];
    if (v === undefined) continue;
    if (campo === "planta" || campo === "rubro" || campo === "tipo") v = cat[campo].get(clave(v)) ?? v;
    if (v !== it[campo]) {
      patch[campo] = v;
      cambios.push(campo === "observaciones" ? "Observaciones" : `${LBL[campo]}: ${it[campo] || "—"} → ${v || "—"}`);
    }
  }
  if (d.estado !== undefined && d.estado !== it.estado) {
    patch.estado = d.estado;
    cambios.push(`Estado: ${ESTADO_LABEL[it.estado as Estado] ?? it.estado} → ${ESTADO_LABEL[d.estado]}`);
  }
  if (d.frecuenciaDias !== undefined && d.frecuenciaDias !== it.frecuenciaDias) {
    patch.frecuenciaDias = d.frecuenciaDias;
    patch.proximoControl = d.frecuenciaDias ? sumarDias(it.ultimoControl ?? hoyIso(), d.frecuenciaDias) : null;
    cambios.push(`Control: ${it.frecuenciaDias ? `cada ${it.frecuenciaDias} días` : "sin control"} → ${d.frecuenciaDias ? `cada ${d.frecuenciaDias} días` : "sin control"}`);
  }
  if (d.ultimoControl !== undefined && d.ultimoControl !== it.ultimoControl) {
    patch.ultimoControl = d.ultimoControl;
    const freq = patch.frecuenciaDias !== undefined ? patch.frecuenciaDias : it.frecuenciaDias;
    patch.proximoControl = freq ? sumarDias(d.ultimoControl ?? hoyIso(), freq) : null;
    cambios.push(`Último control: ${it.ultimoControl ?? "—"} → ${d.ultimoControl ?? "—"}`);
  }
  let traslado = "";
  if (d.sectorId !== undefined && d.sectorId !== it.sectorId) {
    if (!sectores.has(d.sectorId)) falla(400, "Sector inexistente.");
    exigirSector(req, d.sectorId);
    patch.sectorId = d.sectorId;
    traslado = `De ${sectores.get(it.sectorId)?.name ?? "—"} a ${sectores.get(d.sectorId)?.name ?? "—"}`;
  }
  if (!cambios.length && !traslado) return it;
  const [row] = await db.update(invItemsTable).set({ ...patch, updatedAt: new Date() }).where(eq(invItemsTable.id, it.id)).returning();
  if (traslado) await registrar(it.id, "traslado", traslado, req);
  if (cambios.length) await registrar(it.id, "cambio", cambios.join(" · "), req, { estadoNuevo: patch.estado ?? "" });
  return row;
}

router.patch(
  "/inventario/items/:id",
  requireAccion("inventario", "cargar"),
  h(async (req, res) => {
    const it = await itemVisible(req, Number(req.params.id));
    exigirSector(req, it.sectorId);
    const d = leerItem(req.body ?? {}, true);
    if (d.estado === "baja") falla(400, "Para dar de baja usá «Dar de baja».");
    const sectores = await sectoresPorId();
    const row = await aplicarCambios(req, it, d, sectores);
    res.json(mapItem(row, sectores.get(row.sectorId)?.name));
  }, "Error al guardar el equipo."),
);

/** Cambios en varios equipos a la vez (frecuencia, planta, sector, rubro, tipo, estado). */
router.patch(
  "/inventario/lote",
  requireAccion("inventario", "cargar"),
  h(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? [...new Set((req.body.ids as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, MAX_IMPORTAR) : [];
    if (!ids.length) falla(400, "Elegí al menos un equipo.");
    const cambios = (req.body?.cambios ?? {}) as Record<string, unknown>;
    const permitidos = Object.fromEntries(Object.entries(cambios).filter(([k]) => ["planta", "rubro", "tipo", "sectorId", "frecuenciaDias", "estado"].includes(k)));
    const d = leerItem(permitidos, true);
    if (d.estado === "baja") falla(400, "Para dar de baja usá «Dar de baja».");
    const sectores = await sectoresPorId();
    const items = await db.select().from(invItemsTable).where(inArray(invItemsTable.id, ids));
    let actualizados = 0;
    const omitidos: number[] = [];
    for (const it of items) {
      if (!canSeeSector(req.authUser, "inventario", it.sectorId) || !canWriteSector(req.authUser, "inventario", it.sectorId)) {
        omitidos.push(it.id);
        continue;
      }
      try {
        const row = await aplicarCambios(req, it, d, sectores);
        if (row !== it) actualizados++;
      } catch {
        omitidos.push(it.id);
      }
    }
    res.json({ actualizados, omitidos });
  }, "Error al actualizar los equipos."),
);

router.post(
  "/inventario/items/:id/baja",
  requireAccion("inventario", "eliminar"),
  h(async (req, res) => {
    const it = await itemVisible(req, Number(req.params.id));
    exigirSector(req, it.sectorId);
    const motivo = limpio(req.body?.motivo, 500);
    const [row] = await db.update(invItemsTable).set({ estado: "baja", proximoControl: null, updatedAt: new Date() }).where(eq(invItemsTable.id, it.id)).returning();
    await registrar(it.id, "baja", motivo ? `Baja: ${motivo}` : "Dado de baja", req, { estadoNuevo: "baja" });
    res.json(mapItem(row));
  }, "Error al dar de baja."),
);

router.post(
  "/inventario/items/:id/reactivar",
  requireAccion("inventario", "eliminar"),
  h(async (req, res) => {
    const it = await itemVisible(req, Number(req.params.id));
    exigirSector(req, it.sectorId);
    const proximo = it.frecuenciaDias ? sumarDias(hoyIso(), it.frecuenciaDias) : null;
    const [row] = await db.update(invItemsTable).set({ estado: "operativo", proximoControl: proximo, updatedAt: new Date() }).where(eq(invItemsTable.id, it.id)).returning();
    await registrar(it.id, "cambio", "Vuelve al inventario (reactivado)", req, { estadoNuevo: "operativo" });
    res.json(mapItem(row));
  }, "Error al reactivar."),
);

router.delete(
  "/inventario/items/:id",
  requireAccion("inventario", "eliminar"),
  h(async (req, res) => {
    const it = await itemVisible(req, Number(req.params.id));
    exigirSector(req, it.sectorId);
    await db.delete(invItemsTable).where(eq(invItemsTable.id, it.id));
    res.status(204).end();
  }, "Error al eliminar."),
);

// ---------- registro de controles, fallas y reparaciones ----------

/** Aplica un control / falla / reparación a un equipo y lo deja en el registro. */
async function aplicarRegistro(req: Request, it: ItemRow, body: Record<string, unknown>) {
  const tipo = String(body.tipo ?? "control");
  if (!(TIPOS_REGISTRO as readonly string[]).includes(tipo)) falla(400, "Tipo de registro inválido.");
  const fecha = fechaValida(body.fecha) ?? hoyIso();
  if (fecha > sumarDias(hoyIso(), 1)) falla(400, "La fecha no puede ser futura.");
  const resultado = tipo === "control" ? String(body.resultado ?? "ok") : "";
  if (tipo === "control" && !(RESULTADOS as readonly string[]).includes(resultado)) falla(400, "Resultado inválido (ok, observación o falla).");
  const detalle = limpio(body.detalle, 2000);
  if ((tipo === "falla" || resultado === "falla") && !detalle) falla(400, "Contá cuál es la falla.");
  const responsable = limpio(body.responsable, 120);
  // Estado que queda: el elegido o el que corresponde al registro.
  let estado: Estado = it.estado as Estado;
  const pedido = body.estado !== undefined && body.estado !== "" ? String(body.estado) : null;
  if (pedido) {
    if (!(ESTADOS as readonly string[]).includes(pedido) || pedido === "baja") falla(400, "Estado inválido.");
    estado = pedido as Estado;
  } else if (tipo === "falla" || resultado === "falla") estado = "con_falla";
  else if (tipo === "reparacion") estado = "operativo";
  const patch: Partial<typeof invItemsTable.$inferInsert> = { estado, updatedAt: new Date() };
  if (tipo === "control" && (!it.ultimoControl || fecha >= it.ultimoControl)) {
    patch.ultimoControl = fecha;
    patch.proximoControl = it.frecuenciaDias ? sumarDias(fecha, it.frecuenciaDias) : null;
  }
  await db.update(invItemsTable).set(patch).where(eq(invItemsTable.id, it.id));
  await db.insert(invRegistrosTable).values({
    itemId: it.id,
    tipo,
    fecha,
    resultado,
    detalle,
    responsable,
    estadoNuevo: estado !== it.estado ? estado : "",
    ...quien(req),
  });
}

router.post(
  "/inventario/items/:id/registros",
  requireAccion("inventario", "controlar"),
  h(async (req, res) => {
    const it = await itemVisible(req, Number(req.params.id));
    exigirSector(req, it.sectorId);
    if (it.estado === "baja") falla(400, "El equipo está dado de baja.");
    await aplicarRegistro(req, it, req.body ?? {});
    const [row] = await db.select().from(invItemsTable).where(eq(invItemsTable.id, it.id)).limit(1);
    res.status(201).json(mapItem(row));
  }, "Error al registrar."),
);

/** El mismo control para varios equipos (ej. "controlé todos los matafuegos de la planta baja"). */
router.post(
  "/inventario/registros/lote",
  requireAccion("inventario", "controlar"),
  h(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? [...new Set((req.body.ids as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, MAX_IMPORTAR) : [];
    if (!ids.length) falla(400, "Elegí al menos un equipo.");
    const items = await db.select().from(invItemsTable).where(inArray(invItemsTable.id, ids));
    let registrados = 0;
    const omitidos: number[] = [];
    for (const it of items) {
      if (it.estado === "baja" || !canSeeSector(req.authUser, "inventario", it.sectorId) || !canWriteSector(req.authUser, "inventario", it.sectorId)) {
        omitidos.push(it.id);
        continue;
      }
      await aplicarRegistro(req, it, req.body ?? {});
      registrados++;
    }
    res.status(201).json({ registrados, omitidos });
  }, "Error al registrar."),
);

/** Registro de todos los equipos visibles (para el seguimiento y para exportar). */
router.get(
  "/inventario/registros",
  h(async (req, res) => {
    const desde = fechaValida(req.query.desde);
    const hasta = fechaValida(req.query.hasta);
    const tipo = typeof req.query.tipo === "string" && req.query.tipo ? req.query.tipo : null;
    const cond = [
      soloVisibles(req.authUser),
      desde ? gte(invRegistrosTable.fecha, desde) : undefined,
      hasta ? lte(invRegistrosTable.fecha, hasta) : undefined,
      tipo ? inArray(invRegistrosTable.tipo, tipo.split(",")) : undefined,
    ].filter(Boolean);
    const limit = Math.min(10000, Math.max(1, Number(req.query.limit) || 2000));
    const rows = await db
      .select({ r: invRegistrosTable, it: invItemsTable, sector: sectorsTable.name })
      .from(invRegistrosTable)
      .innerJoin(invItemsTable, eq(invRegistrosTable.itemId, invItemsTable.id))
      .leftJoin(sectorsTable, eq(invItemsTable.sectorId, sectorsTable.id))
      .where(cond.length ? and(...(cond as ReturnType<typeof sql>[])) : undefined)
      .orderBy(desc(invRegistrosTable.fecha), desc(invRegistrosTable.id))
      .limit(limit);
    res.json(
      rows.map(({ r, it, sector }) => ({
        ...r,
        item: { id: it.id, descripcion: it.descripcion, planta: it.planta, sectorName: sector, rubro: it.rubro, tipo: it.tipo, marca: it.marca, codigoSerie: it.codigoSerie },
      })),
    );
  }, "Error al leer el registro."),
);

// ---------- importación (carga masiva desde Excel) ----------

type FilaImportar = {
  /** Número de fila del Excel (lo manda la pantalla; si no, se supone encabezado en la fila 1). */
  fila?: unknown;
  planta?: unknown;
  sector?: unknown;
  rubro?: unknown;
  tipo?: unknown;
  descripcion?: unknown;
  marca?: unknown;
  codigoSerie?: unknown;
  estado?: unknown;
  frecuencia?: unknown;
  ultimoControl?: unknown;
  observaciones?: unknown;
};

router.post(
  "/inventario/importar",
  requireAccion("inventario", "importar"),
  h(async (req, res) => {
    const filas = (Array.isArray(req.body?.filas) ? req.body.filas : []) as FilaImportar[];
    if (!filas.length) falla(400, "El archivo no tiene filas para importar.");
    if (filas.length > MAX_IMPORTAR) falla(400, `Máximo ${MAX_IMPORTAR} filas por importación: dividí el archivo.`);
    const actualizar = req.body?.modo === "actualizar";
    const simular = req.body?.simular !== false;

    const sectores = [...(await sectoresPorId()).values()];
    const porNombre = new Map<string, (typeof sectores)[number]>();
    for (const s of sectores) {
      porNombre.set(clave(s.name), s);
      if (s.shortName) porNombre.set(clave(s.shortName), s);
    }
    const cat = await catalogoExistente();
    const plan = await planes();
    const existentes = await db.select().from(invItemsTable).where(sql`${invItemsTable.codigoSerie} <> ''`);
    const porSerie = new Map(existentes.map((e) => [e.codigoSerie.toLowerCase(), e]));
    const seriesArchivo = new Map<string, number>();

    type Resultado = { fila: number; estado: "nuevo" | "actualiza" | "igual" | "error"; mensajes: string[]; id?: number; descripcion: string };
    const out: Resultado[] = [];
    let nuevos = 0;
    let actualizados = 0;
    let iguales = 0;
    let errores = 0;
    const hoy = hoyIso();

    const tareas: (() => Promise<void>)[] = [];
    filas.forEach((f, i) => {
      const n = Number.isInteger(Number(f.fila)) && Number(f.fila) > 0 ? Number(f.fila) : i + 2;
      const mensajes: string[] = [];
      const planta = limpio(f.planta, 80);
      const rubro = limpio(f.rubro, 80);
      const tipo = limpio(f.tipo, 80);
      const descripcion = limpio(f.descripcion, 300);
      const marca = limpio(f.marca, 80);
      const codigoSerie = limpio(f.codigoSerie, 80);
      const sectorTxt = limpio(f.sector, 120);
      if (!planta) mensajes.push("Falta PLANTA.");
      if (!sectorTxt) mensajes.push("Falta SECTOR.");
      if (!rubro) mensajes.push("Falta RUBRO.");
      if (!tipo) mensajes.push("Falta TIPO.");
      if (!descripcion) mensajes.push("Falta DESCRIPCION.");
      const sector = sectorTxt ? porNombre.get(clave(sectorTxt)) : undefined;
      if (sectorTxt && !sector) mensajes.push(`El sector «${sectorTxt}» no existe en el sistema (lo crea Sistemas en Configuración → Sectores).`);
      else if (sector && !canWriteSector(req.authUser, "inventario", sector.id)) mensajes.push(`No tenés a cargo el sector «${sector.name}».`);
      const estado = f.estado !== undefined && f.estado !== "" ? estadoDe(f.estado) : null;
      if (f.estado !== undefined && f.estado !== "" && !estado) mensajes.push(`Estado «${limpio(f.estado, 40)}» no reconocido (operativo, con falla, en reparación, fuera de servicio, baja).`);
      const freqPedida = frecuencia(f.frecuencia);
      if (f.frecuencia !== undefined && f.frecuencia !== "" && freqPedida === null) mensajes.push(`Frecuencia «${limpio(f.frecuencia, 40)}» no reconocida (días o mensual, trimestral, semestral, anual…).`);
      const ultimo = f.ultimoControl !== undefined && f.ultimoControl !== "" ? fechaValida(f.ultimoControl) : null;
      if (f.ultimoControl !== undefined && f.ultimoControl !== "" && !ultimo) mensajes.push("ÚLTIMO CONTROL no es una fecha válida.");
      if (ultimo && ultimo > hoy) mensajes.push("ÚLTIMO CONTROL no puede ser una fecha futura.");
      const observaciones = limpio(f.observaciones, 1000);

      let existente: ItemRow | undefined;
      if (codigoSerie) {
        const k = codigoSerie.toLowerCase();
        if (seriesArchivo.has(k)) mensajes.push(`CÓDIGO DE SERIE repetido en el archivo (también en la fila ${seriesArchivo.get(k)}).`);
        else seriesArchivo.set(k, n);
        existente = porSerie.get(k);
        if (existente && !actualizar) mensajes.push(`Ya existe un equipo con ese código de serie (Nº ${existente.id}). Para actualizarlo, elegí «Actualizar los que ya existen».`);
        if (existente && actualizar && (!canSeeSector(req.authUser, "inventario", existente.sectorId) || !canWriteSector(req.authUser, "inventario", existente.sectorId))) {
          mensajes.push(`El equipo con ese código de serie (Nº ${existente.id}) es de un sector que no tenés a cargo.`);
        }
      }
      if (mensajes.length) {
        errores++;
        out.push({ fila: n, estado: "error", mensajes, descripcion });
        return;
      }
      const datos = {
        planta: cat.planta.get(clave(planta)) ?? planta,
        sectorId: sector!.id,
        rubro: cat.rubro.get(clave(rubro)) ?? rubro,
        tipo: cat.tipo.get(clave(tipo)) ?? tipo,
        descripcion,
        marca,
        codigoSerie,
      };
      // Los nuevos valores del archivo se reutilizan en las filas siguientes con la misma grafía.
      for (const c of ["planta", "rubro", "tipo"] as const) if (!cat[c].has(clave(datos[c]))) cat[c].set(clave(datos[c]), datos[c]);

      if (existente) {
        const cambios: Record<string, unknown> = {};
        for (const c of ["planta", "rubro", "tipo", "descripcion", "marca"] as const) if (datos[c] !== existente[c]) cambios[c] = datos[c];
        if (datos.sectorId !== existente.sectorId) cambios.sectorId = datos.sectorId;
        if (estado && estado !== existente.estado) cambios.estado = estado;
        if (freqPedida !== undefined && freqPedida !== null && freqPedida !== existente.frecuenciaDias) cambios.frecuenciaDias = freqPedida;
        if (ultimo && ultimo !== existente.ultimoControl) cambios.ultimoControl = ultimo;
        if (observaciones && observaciones !== existente.observaciones) cambios.observaciones = observaciones;
        if (!Object.keys(cambios).length) {
          iguales++;
          out.push({ fila: n, estado: "igual", mensajes: ["Sin cambios."], id: existente.id, descripcion });
          return;
        }
        actualizados++;
        out.push({ fila: n, estado: "actualiza", mensajes: Object.keys(cambios).map((k) => `Cambia ${k === "sectorId" ? "sector" : k}`), id: existente.id, descripcion });
        if (!simular) {
          const it = existente;
          tareas.push(async () => {
            const sMap = await sectoresPorId();
            await aplicarCambios(req, it, cambios as ReturnType<typeof leerItem>, sMap);
          });
        }
        return;
      }
      nuevos++;
      const freq = freqPedida ?? plan.get(clave(datos.tipo)) ?? null;
      out.push({ fila: n, estado: "nuevo", mensajes: codigoSerie ? [] : ["Sin código de serie: se carga como equipo nuevo."], descripcion });
      if (!simular) {
        tareas.push(async () => {
          const [row] = await db
            .insert(invItemsTable)
            .values({
              ...datos,
              estado: estado ?? "operativo",
              frecuenciaDias: freq,
              ultimoControl: ultimo,
              proximoControl: freq && estado !== "baja" ? sumarDias(ultimo ?? hoy, freq) : null,
              observaciones,
              createdByUserId: req.authUser?.id ?? null,
            })
            .returning({ id: invItemsTable.id });
          await registrar(row.id, "importacion", `Importado desde Excel (fila ${n})`, req, { estadoNuevo: estado ?? "operativo" });
        });
      }
    });

    for (const t of tareas) await t();
    res.json({ simulado: simular, resumen: { total: filas.length, nuevos, actualizados, iguales, errores }, filas: out });
  }, "Error al importar."),
);

// ---------- catálogos y plan de controles ----------

router.get(
  "/inventario/catalogos",
  h(async (req, res) => {
    const vis = soloVisibles(req.authUser);
    const agrupar = async (col: typeof invItemsTable.planta | typeof invItemsTable.rubro | typeof invItemsTable.tipo) =>
      (
        await db
          .select({ valor: col, n: sql<number>`count(*)::int` })
          .from(invItemsTable)
          .where(and(sql`${invItemsTable.estado} <> 'baja'`, vis))
          .groupBy(col)
          .orderBy(asc(col))
      ).filter((r) => r.valor);
    const [plantas, rubros, tipos, planesRows] = await Promise.all([agrupar(invItemsTable.planta), agrupar(invItemsTable.rubro), agrupar(invItemsTable.tipo), db.select().from(invPlanesTable)]);
    res.json({ plantas, rubros, tipos, planes: planesRows });
  }, "Error al leer los catálogos."),
);

/** Unifica un valor (ej. "PB" → "Planta baja") en los equipos de sus sectores. */
router.post(
  "/inventario/catalogos/renombrar",
  requireAccion("inventario", "configurar"),
  h(async (req, res) => {
    const campo = String(req.body?.campo ?? "");
    if (!["planta", "rubro", "tipo"].includes(campo)) falla(400, "Campo inválido.");
    const de = limpio(req.body?.de, 80);
    const a = limpio(req.body?.a, 80);
    if (!de || !a) falla(400, "Indicá el valor actual y el nuevo.");
    const col = invItemsTable[campo as "planta" | "rubro" | "tipo"];
    const propios = ownSectorIds(req.authUser, "inventario");
    const cond = and(sql`lower(${col}) = lower(${de})`, propios ? (propios.length ? inArray(invItemsTable.sectorId, propios) : sql`false`) : undefined);
    const cambiados = await db.update(invItemsTable).set({ [campo]: a, updatedAt: new Date() }).where(cond).returning({ id: invItemsTable.id });
    if (campo === "tipo" && cambiados.length) {
      const [p] = await db.select().from(invPlanesTable).where(sql`lower(${invPlanesTable.tipo}) = lower(${de})`).limit(1);
      if (p) {
        await db.delete(invPlanesTable).where(eq(invPlanesTable.tipo, p.tipo));
        await db.insert(invPlanesTable).values({ tipo: a, frecuenciaDias: p.frecuenciaDias }).onConflictDoNothing();
      }
    }
    for (const c of cambiados) await registrar(c.id, "cambio", `${campo === "planta" ? "Planta" : campo === "rubro" ? "Rubro" : "Tipo"}: ${de} → ${a} (unificado)`, req);
    res.json({ actualizados: cambiados.length });
  }, "Error al unificar."),
);

/** Cada cuánto se controla un tipo de equipo. aplicar: "todos" | "sin_frecuencia" | "ninguno". */
router.put(
  "/inventario/planes",
  requireAccion("inventario", "configurar"),
  h(async (req, res) => {
    const tipo = limpio(req.body?.tipo, 80);
    if (!tipo) falla(400, "Indicá el tipo de equipo.");
    const dias = frecuencia(req.body?.frecuenciaDias);
    const aplicar = String(req.body?.aplicar ?? "sin_frecuencia");
    await db.delete(invPlanesTable).where(sql`lower(${invPlanesTable.tipo}) = lower(${tipo})`);
    if (dias) await db.insert(invPlanesTable).values({ tipo, frecuenciaDias: dias });
    let actualizados = 0;
    if (aplicar !== "ninguno") {
      const propios = ownSectorIds(req.authUser, "inventario");
      const items = await db
        .select()
        .from(invItemsTable)
        .where(
          and(
            sql`lower(${invItemsTable.tipo}) = lower(${tipo})`,
            sql`${invItemsTable.estado} <> 'baja'`,
            aplicar === "sin_frecuencia" ? sql`${invItemsTable.frecuenciaDias} is null` : undefined,
            propios ? (propios.length ? inArray(invItemsTable.sectorId, propios) : sql`false`) : undefined,
          ),
        );
      for (const it of items) {
        if ((dias ?? null) === it.frecuenciaDias) continue;
        await db
          .update(invItemsTable)
          .set({ frecuenciaDias: dias ?? null, proximoControl: dias ? sumarDias(it.ultimoControl ?? hoyIso(), dias) : null, updatedAt: new Date() })
          .where(eq(invItemsTable.id, it.id));
        await registrar(it.id, "cambio", `Plan de controles: ${dias ? `cada ${dias} días` : "sin control periódico"}`, req);
        actualizados++;
      }
    }
    res.json({ tipo, frecuenciaDias: dias ?? null, actualizados });
  }, "Error al guardar el plan."),
);

export default router;
