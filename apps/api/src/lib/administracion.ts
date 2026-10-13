/**
 * Administración: fechas hábiles, estimación de vencimientos fiscales y generación automática
 * (obligaciones del mes + vencimientos recurrentes). Sin conexión a ARCA: la fecha exacta sale del
 * calendario oficial cargado en adm_calendario; si falta, se estima y queda marcada como "estimada".
 */
import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import {
  admCalendarioTable,
  admFeriadosTable,
  admHistorialTable,
  admItemsTable,
  admObligacionesTable,
  admRecurrentesTable,
  db,
} from "@salvador/db";
import { logger } from "./logger";

export const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 2026-10-22 → 22/10/2026 (para los textos del historial). */
export function ar(iso: string | null | undefined): string {
  if (!iso || iso.length < 10) return iso ?? "";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export function hoyIso(): string {
  return isoLocal(new Date());
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return isoLocal(new Date(y, m - 1, d + days, 12));
}

/** Fecha del día `day` del mes (si el mes es más corto, el último día). */
export function isoDate(y: number, m1: number, day: number): string {
  const last = new Date(y, m1, 0).getDate();
  const d = Math.min(Math.max(1, day), last);
  return `${y}-${String(m1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function periodoKey(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

/** Suma meses a (año, mes 1-12). */
export function shiftMes(anio: number, mes: number, delta: number): { anio: number; mes: number } {
  const idx = anio * 12 + (mes - 1) + delta;
  return { anio: Math.floor(idx / 12), mes: (idx % 12) + 1 };
}

// ----- Feriados -----

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

/** Feriados calculados por ley (Ley 27.399) para años que no tienen feriados cargados. Sin puentes. */
export function feriadosCalculados(year: number): Set<string> {
  const out = new Set<string>();
  for (const md of ["01-01", "03-24", "04-02", "05-01", "05-25", "06-20", "07-09", "12-08", "12-25"]) out.add(`${year}-${md}`);
  const easter = easterSunday(year);
  const fromEaster = (days: number) => {
    const d = new Date(easter);
    d.setDate(d.getDate() + days);
    return isoLocal(d);
  };
  out.add(fromEaster(-48));
  out.add(fromEaster(-47));
  out.add(fromEaster(-2));
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

/** Feriados de un año: los cargados en la base; si el año no tiene ninguno, los calculados por ley. */
export class Feriados {
  private cache = new Map<number, { set: Set<string>; cargados: boolean }>();

  async year(y: number): Promise<{ set: Set<string>; cargados: boolean }> {
    const hit = this.cache.get(y);
    if (hit) return hit;
    const rows = await db
      .select({ fecha: admFeriadosTable.fecha })
      .from(admFeriadosTable)
      .where(and(gte(admFeriadosTable.fecha, `${y}-01-01`), lte(admFeriadosTable.fecha, `${y}-12-31`)));
    const val = rows.length
      ? { set: new Set(rows.map((r) => r.fecha)), cargados: true }
      : { set: feriadosCalculados(y), cargados: false };
    this.cache.set(y, val);
    return val;
  }

  async esHabil(iso: string): Promise<boolean> {
    const [y, m, d] = iso.split("-").map(Number);
    const dow = new Date(y, m - 1, d, 12).getDay();
    if (dow === 0 || dow === 6) return false;
    return !(await this.year(y)).set.has(iso);
  }

  /** Si la fecha cae en fin de semana o feriado, el siguiente día hábil. */
  async siguienteHabil(iso: string): Promise<string> {
    let cur = iso;
    for (let i = 0; i < 20; i++) {
      if (await this.esHabil(cur)) return cur;
      cur = addDaysIso(cur, 1);
    }
    return cur;
  }
}

// ----- Obligaciones fiscales -----

type Obligacion = typeof admObligacionesTable.$inferSelect;

/** ¿La obligación vence en ese mes? */
export function aplicaEnMes(o: Obligacion, mes: number): boolean {
  if (o.periodicidad === "anual") return o.mesAnual === mes;
  return true;
}

/** Texto del período al que corresponde la obligación que vence en (anio, mes). */
export function periodoLabel(o: Pick<Obligacion, "periodicidad" | "desfasePeriodo">, anio: number, mes: number): string {
  if (o.periodicidad === "anual") {
    return o.desfasePeriodo <= -12 ? `Año ${anio - 1}` : o.desfasePeriodo < 0 ? `Ejercicio ${anio - 1}` : `Año ${anio}`;
  }
  const p = shiftMes(anio, mes, o.desfasePeriodo);
  return `${MESES[p.mes - 1]} ${p.anio}`;
}

export function tituloFiscal(o: Pick<Obligacion, "nombre" | "periodicidad" | "desfasePeriodo">, anio: number, mes: number): string {
  return `${o.nombre} · ${periodoLabel(o, anio, mes)}`;
}

export async function fechaEstimada(o: Pick<Obligacion, "diaEstimado">, anio: number, mes: number, fer: Feriados): Promise<string> {
  return fer.siguienteHabil(isoDate(anio, mes, o.diaEstimado));
}

export type FechaResuelta = { fecha: string; origen: "oficial" | "prorroga" | "estimada"; norma: string; verificado: boolean };

/** Fecha que corresponde a una obligación en un mes: la del calendario oficial o, si no hay, la estimada. */
export async function resolverFecha(
  o: Obligacion,
  anio: number,
  mes: number,
  fer: Feriados,
  calendario?: Map<string, typeof admCalendarioTable.$inferSelect>,
): Promise<FechaResuelta> {
  let row = calendario?.get(`${o.id}:${anio}:${mes}`);
  if (!calendario) {
    [row] = await db
      .select()
      .from(admCalendarioTable)
      .where(and(eq(admCalendarioTable.obligacionId, o.id), eq(admCalendarioTable.anio, anio), eq(admCalendarioTable.mes, mes)))
      .limit(1);
  }
  if (row) return { fecha: row.fecha, origen: row.origen === "prorroga" ? "prorroga" : "oficial", norma: row.norma, verificado: !!row.verificadoAt };
  return { fecha: await fechaEstimada(o, anio, mes, fer), origen: "estimada", norma: "", verificado: false };
}

export async function calendarioDelAnio(anio: number) {
  const rows = await db.select().from(admCalendarioTable).where(eq(admCalendarioTable.anio, anio));
  return new Map(rows.map((r) => [`${r.obligacionId}:${r.anio}:${r.mes}`, r]));
}

export async function registrar(entidad: string, entidadId: number | null, accion: string, detalle: string, user?: { id: number; name: string } | null) {
  await db.insert(admHistorialTable).values({ entidad, entidadId, accion, detalle, userId: user?.id ?? null, userName: user?.name ?? "Sistema" });
}

/**
 * Crea los vencimientos fiscales del mes que falten y actualiza la fecha de los pendientes
 * cuando cambió el calendario (salvo que alguien la haya editado a mano: origen "manual").
 */
export async function asegurarFiscalMes(anio: number, mes: number, user?: { id: number; name: string } | null) {
  const fer = new Feriados();
  const periodo = periodoKey(anio, mes);
  const obligaciones = (await db.select().from(admObligacionesTable).where(eq(admObligacionesTable.activo, true))).filter((o) => aplicaEnMes(o, mes));
  const calendario = await calendarioDelAnio(anio);
  const existentes = await db
    .select()
    .from(admItemsTable)
    .where(and(eq(admItemsTable.periodo, periodo), isNotNull(admItemsTable.obligacionId)));
  const porOblig = new Map(existentes.map((e) => [e.obligacionId!, e]));
  let creados = 0;
  let actualizados = 0;
  for (const o of obligaciones) {
    const f = await resolverFecha(o, anio, mes, fer, calendario);
    const actual = porOblig.get(o.id);
    if (!actual) {
      const ins = await db
        .insert(admItemsTable)
        .values({
          tipo: "fiscal",
          titulo: tituloFiscal(o, anio, mes),
          descripcion: o.referencia,
          fecha: f.fecha,
          responsable: o.responsable,
          alertDays: o.alertDays,
          obligacionId: o.id,
          periodo,
          fechaOrigen: f.origen,
          createdByUserId: user?.id ?? null,
        })
        .onConflictDoNothing()
        .returning({ id: admItemsTable.id });
      if (ins.length) {
        creados++;
        await registrar("item", ins[0].id, "generado", `${tituloFiscal(o, anio, mes)} · vence ${ar(f.fecha)} (${f.origen})`, user);
      }
    } else if (actual.estado === "pendiente" && actual.fechaOrigen !== "manual" && (actual.fecha !== f.fecha || actual.fechaOrigen !== f.origen)) {
      await db.update(admItemsTable).set({ fecha: f.fecha, fechaOrigen: f.origen, updatedAt: new Date() }).where(eq(admItemsTable.id, actual.id));
      if (actual.fecha !== f.fecha) {
        await registrar("item", actual.id, "fecha", `Fecha ${ar(actual.fecha)} → ${ar(f.fecha)} (${f.origen}${f.norma ? ` · ${f.norma}` : ""})`, user);
      }
      actualizados++;
    }
  }
  return { periodo, creados, actualizados, obligaciones: obligaciones.length };
}

// ----- Recurrentes -----

export const FRECUENCIAS: Record<string, number> = { semanal: 0, mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };

/** Fechas (sin ajustar a día hábil) en que toca un recurrente dentro de [desde, hasta]. */
export function ocurrencias(r: { frecuencia: string; dia: number; desde: string; hasta: string | null }, desde: string, hasta: string): string[] {
  const fin = r.hasta && r.hasta < hasta ? r.hasta : hasta;
  const out: string[] = [];
  if (r.frecuencia === "semanal") {
    let cur = r.desde;
    while (cur < desde) cur = addDaysIso(cur, 7);
    for (; cur <= fin; cur = addDaysIso(cur, 7)) out.push(cur);
    return out;
  }
  const paso = FRECUENCIAS[r.frecuencia] || 1;
  const [y0, m0] = r.desde.split("-").map(Number);
  for (let k = 0; k < 600; k++) {
    const p = shiftMes(y0, m0, k * paso);
    const f = isoDate(p.anio, p.mes, r.dia);
    if (f > fin) break;
    if (f >= desde && f >= r.desde) out.push(f);
  }
  return out;
}

/** Genera los ítems de los recurrentes activos desde el mes en curso hasta `dias` adelante. */
export async function generarRecurrentes(dias = 62, soloId?: number) {
  const fer = new Feriados();
  const hoy = hoyIso();
  const desde = `${hoy.slice(0, 7)}-01`;
  const hasta = addDaysIso(hoy, dias);
  const conds = [eq(admRecurrentesTable.activo, true)];
  if (soloId) conds.push(eq(admRecurrentesTable.id, soloId));
  const recs = await db.select().from(admRecurrentesTable).where(and(...conds));
  let creados = 0;
  for (const r of recs) {
    const omitidas = new Set(Array.isArray(r.omitidas) ? (r.omitidas as string[]) : []);
    // Nunca fechas anteriores a la carga del recurrente (no aparecen "vencidos" recién creados).
    const creado = isoLocal(r.createdAt);
    const inicio = creado > desde ? creado : desde;
    for (const base of ocurrencias(r, inicio, hasta)) {
      if (omitidas.has(base)) continue;
      const fecha = r.habiles ? await fer.siguienteHabil(base) : base;
      const ins = await db
        .insert(admItemsTable)
        .values({
          tipo: r.tipo,
          titulo: r.titulo,
          descripcion: r.descripcion,
          fecha,
          responsable: r.responsable,
          monto: r.monto,
          alertDays: r.alertDays,
          recurrenteId: r.id,
          datos: { base },
          createdByUserId: r.createdByUserId,
        })
        .onConflictDoNothing()
        .returning({ id: admItemsTable.id });
      creados += ins.length;
    }
  }
  return { creados };
}

/** Ítems pendientes de un recurrente desde hoy (para actualizarlos al editar el recurrente). */
export async function pendientesFuturosDeRecurrente(id: number) {
  return db
    .select({ id: admItemsTable.id })
    .from(admItemsTable)
    .where(and(eq(admItemsTable.recurrenteId, id), eq(admItemsTable.estado, "pendiente"), gte(admItemsTable.fecha, hoyIso())));
}

export async function borrarItems(ids: number[]) {
  if (ids.length) await db.delete(admItemsTable).where(inArray(admItemsTable.id, ids));
}

// ----- Automatización -----

/** Mes en curso y el siguiente: fiscales + recurrentes. Corre al arrancar y cada hora. */
export async function automatizarAdministracion() {
  const now = new Date();
  const actual = { anio: now.getFullYear(), mes: now.getMonth() + 1 };
  const sig = shiftMes(actual.anio, actual.mes, 1);
  const a = await asegurarFiscalMes(actual.anio, actual.mes);
  const b = await asegurarFiscalMes(sig.anio, sig.mes);
  const r = await generarRecurrentes();
  const t = await asegurarTareasDelSistema(actual.anio, actual.mes);
  return { fiscales: a.creados + b.creados, actualizados: a.actualizados + b.actualizados, recurrentes: r.creados, recordatorios: t };
}

// ----- Recordatorios del sistema (tareas que se crean y se cierran solas) -----

/** Clave guardada en datos.sistema para no duplicar y poder cerrarlas. */
export const claveVerificar = (anio: number, mes: number) => `verificar:${periodoKey(anio, mes)}`;
export const claveCalendario = (anio: number) => `calendario:${anio}`;

async function existeTareaSistema(clave: string): Promise<boolean> {
  const [row] = await db
    .select({ id: admItemsTable.id })
    .from(admItemsTable)
    .where(sql`${admItemsTable.datos}->>'sistema' = ${clave}`)
    .limit(1);
  return !!row;
}

async function crearTareaSistema(clave: string, titulo: string, descripcion: string, fecha: string) {
  if (await existeTareaSistema(clave)) return 0;
  const ins = await db
    .insert(admItemsTable)
    .values({ tipo: "tarea", titulo, descripcion, fecha, prioridad: "alta", alertDays: 0, datos: { sistema: clave } })
    .returning({ id: admItemsTable.id });
  await registrar("item", ins[0].id, "generado", `Recordatorio automático · ${titulo}`, null);
  return 1;
}

/**
 * Recordatorios fijos del área:
 *  - cada mes: verificar las fechas fiscales con el calendario oficial (se cierra al tocar «Verificar fechas del mes»);
 *  - en diciembre (y en enero si quedó pendiente): cargar el calendario oficial del año (se cierra al cargarlo).
 */
export async function asegurarTareasDelSistema(anio: number, mes: number): Promise<number> {
  const fer = new Feriados();
  let creadas = 0;
  const obligs = (await db.select().from(admObligacionesTable).where(eq(admObligacionesTable.activo, true))).filter((o) => aplicaEnMes(o, mes));
  const cal = await calendarioDelAnio(anio);
  const verificadas = obligs.filter((o) => cal.get(`${o.id}:${anio}:${mes}`)?.verificadoAt).length;
  if (obligs.length && verificadas < obligs.length) {
    creadas += await crearTareaSistema(
      claveVerificar(anio, mes),
      `Verificar fechas fiscales de ${MESES[mes - 1].toLowerCase()} ${anio}`,
      "Abrir Administración → Fiscal → Control del mes. Comparar cada fecha con la agenda de ARCA (terminación de CUIT 6) y el calendario de Rentas Córdoba. Si alguna cambió, corregirla con el lápiz del Calendario oficial. Después tocar «Verificar fechas del mes»: esta tarea se cierra sola.",
      await fer.siguienteHabil(isoDate(anio, mes, 1)),
    );
  }
  const objetivo = mes === 12 ? anio + 1 : mes <= 2 ? anio : null;
  if (objetivo) {
    const calObj = objetivo === anio ? cal : await calendarioDelAnio(objetivo);
    if (calObj.size === 0) {
      creadas += await crearTareaSistema(
        claveCalendario(objetivo),
        `Cargar el calendario fiscal oficial ${objetivo}`,
        `Cuando ARCA y Rentas Córdoba publiquen el calendario ${objetivo}: Administración → Fiscal → Calendario oficial → «Pegar agenda completa». Ver la Guía del módulo. La tarea se cierra sola al cargar las fechas.`,
        mes === 12 ? await fer.siguienteHabil(isoDate(anio, 12, 1)) : await fer.siguienteHabil(isoDate(anio, mes, 1)),
      );
    }
  }
  return creadas;
}

/** Cierra un recordatorio del sistema cuando se hizo lo que pedía. */
export async function cerrarTareaSistema(clave: string, nota: string, user?: { id: number; name: string } | null) {
  const rows = await db
    .update(admItemsTable)
    .set({ estado: "cumplido", cumplidoFecha: hoyIso(), cumplidoPor: user?.id ?? null, cumplimientoNota: nota, presentado: true, pagado: true, updatedAt: new Date() })
    .where(and(eq(admItemsTable.estado, "pendiente"), sql`${admItemsTable.datos}->>'sistema' = ${clave}`))
    .returning({ id: admItemsTable.id });
  for (const r of rows) await registrar("item", r.id, "cumplido", nota, user);
}

let timer: NodeJS.Timeout | null = null;
export function iniciarAutomatizacionAdministracion() {
  const run = () =>
    automatizarAdministracion()
      .then((r) => {
        if (r.fiscales || r.actualizados || r.recurrentes) logger.info(r, "Administración: vencimientos generados");
      })
      .catch((err) => logger.error({ err }, "Administración: no se pudieron generar los vencimientos"));
  void run();
  if (!timer) timer = setInterval(run, 60 * 60 * 1000);
}
