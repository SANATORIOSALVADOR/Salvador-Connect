// Cobertura de guardias del lado del servidor (notificaciones y gráficos del resumen).
// Misma lógica que apps/web/src/pages/guardias/logic.ts (dayCoverage / subtractIntervals).
import { and, lte, sql } from "drizzle-orm";
import { db, guardiaSectoresTable, guardiasTable, sectorsTable, type CoberturaFranja } from "@salvador/db";

const DAY_MIN = 24 * 60;
type Iv = [number, number];

export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function dow(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function parseHM(t: string): number {
  const [h, m] = (t || "00:00").slice(0, 5).split(":").map((x) => Number(x) || 0);
  return h * 60 + m;
}

export function fmtHM(min: number): string {
  const m = Math.max(0, Math.min(DAY_MIN, Math.round(min)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

type GuardiaMin = { sectorId: number; date: string; endDate: string | null; startTime: string; endTime: string; modality: string };

function endOf(g: GuardiaMin): string {
  const end = g.endDate || g.date;
  return end === g.date && parseHM(g.endTime) <= parseHM(g.startTime) ? addDaysIso(g.date, 1) : end;
}

function intervalOnDay(g: GuardiaMin, day: string): Iv | null {
  const end = endOf(g);
  if (day < g.date || day > end) return null;
  const s = day === g.date ? parseHM(g.startTime) : 0;
  const e = day === end ? parseHM(g.endTime) : DAY_MIN;
  return e > s ? [s, e] : null;
}

function merge(list: Iv[]): Iv[] {
  const out: Iv[] = [];
  for (const iv of [...list].filter((x) => x[1] > x[0]).sort((a, b) => a[0] - b[0])) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else out.push([iv[0], iv[1]]);
  }
  return out;
}

function subtract(required: Iv[], covered: Iv[]): Iv[] {
  const cov = merge(covered);
  const gaps: Iv[] = [];
  for (const [rs, re] of merge(required)) {
    let cur = rs;
    for (const [cs, ce] of cov) {
      if (ce <= cur || cs >= re) continue;
      if (cs > cur) gaps.push([cur, Math.min(cs, re)]);
      cur = Math.max(cur, ce);
      if (cur >= re) break;
    }
    if (cur < re) gaps.push([cur, re]);
  }
  return gaps;
}

export type SectorConf = { sectorId: number; name: string; cobertura: CoberturaFranja[] };

/** Sectores activos de guardia (configurados o, si no hay configuración, los conocidos por nombre). */
export async function sectoresDeGuardia(): Promise<SectorConf[]> {
  const [sectors, configs] = await Promise.all([db.select().from(sectorsTable), db.select().from(guardiaSectoresTable)]);
  const byId = new Map(configs.map((c) => [c.sectorId, c]));
  const nombres = ["guardia central", "uti neo", "uti uco", "piso gineco", "piso clinica medica", "residentes"];
  const key = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return sectors
    .filter((s) => s.active)
    .filter((s) => (configs.length ? byId.get(s.id)?.active : nombres.some((n) => key(s.name).includes(n))))
    .map((s) => ({ sectorId: s.id, name: s.name, cobertura: byId.get(s.id)?.cobertura ?? [] }));
}

export async function guardiasEntre(from: string, to: string): Promise<GuardiaMin[]> {
  return db
    .select({
      sectorId: guardiasTable.sectorId,
      date: guardiasTable.date,
      endDate: guardiasTable.endDate,
      startTime: guardiasTable.startTime,
      endTime: guardiasTable.endTime,
      modality: guardiasTable.modality,
    })
    .from(guardiasTable)
    .where(and(lte(guardiasTable.date, to), sql`coalesce(${guardiasTable.endDate}, ${guardiasTable.date}) >= ${addDaysIso(from, -1)}`));
}

/** Última fecha con guardias cargadas: más allá no se evalúa cobertura (todavía no se planificó). */
export async function horizonte(): Promise<string | null> {
  const [row] = await db.select({ max: sql<string | null>`max(coalesce(${guardiasTable.endDate}, ${guardiasTable.date}))` }).from(guardiasTable);
  return row?.max ?? null;
}

export type CoberturaDia = { sectorId: number; name: string; requeridoMin: number; cubiertoMin: number; huecos: Iv[]; sinGuardia: boolean };

/** Cobertura de un día para cada sector que la requiere ese día. */
export function coberturaDia(guardias: GuardiaMin[], day: string, sectores: SectorConf[]): CoberturaDia[] {
  const out: CoberturaDia[] = [];
  for (const s of sectores) {
    const del = guardias.filter((g) => g.sectorId === s.sectorId);
    const cubierto = del.map((g) => intervalOnDay(g, day)).filter((x): x is Iv => !!x);
    if (s.cobertura.length === 0) {
      // Sin horario fijo: alcanza con que haya alguien en el día.
      out.push({ sectorId: s.sectorId, name: s.name, requeridoMin: 0, cubiertoMin: 0, huecos: cubierto.length ? [] : [[0, DAY_MIN]], sinGuardia: cubierto.length === 0 });
      continue;
    }
    const d = dow(day);
    const req = merge(s.cobertura.filter((f) => f.dow === d).map((f) => [parseHM(f.start), f.end === "24:00" ? DAY_MIN : parseHM(f.end)] as Iv));
    if (!req.length) continue;
    const huecos = subtract(req, cubierto);
    const requeridoMin = req.reduce((a, [x, y]) => a + y - x, 0);
    const faltan = huecos.reduce((a, [x, y]) => a + y - x, 0);
    out.push({ sectorId: s.sectorId, name: s.name, requeridoMin, cubiertoMin: requeridoMin - faltan, huecos, sinGuardia: cubierto.length === 0 });
  }
  return out;
}

/** Horas de la guardia dentro de [from, to]. */
export function horasEnRango(g: GuardiaMin, from: string, to: string): number {
  let total = 0;
  for (let day = g.date < from ? from : g.date, n = 0; day <= (endOf(g) > to ? to : endOf(g)) && n < 62; day = addDaysIso(day, 1), n++) {
    const iv = intervalOnDay(g, day);
    if (iv) total += (iv[1] - iv[0]) / 60;
  }
  return total;
}

