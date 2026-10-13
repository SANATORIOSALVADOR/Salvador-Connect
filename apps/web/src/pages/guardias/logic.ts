// Lógica pura de Guardias Médicas (fechas, horas, cobertura y estadísticas). Sin React.

export type Sector = { id: number; name: string; shortName?: string | null };

export type Guardia = {
  id: number;
  sectorId: number;
  sectorName?: string | null;
  sectorShortName?: string | null;
  date: string;
  endDate?: string | null;
  startTime: string;
  endTime: string;
  modality: string;
  professionalId?: number | null;
  professionalName: string;
  observations: string;
  tagLabel?: string | null;
  tagColor?: string | null;
};

/** Franja de cobertura requerida. dow: 0 = domingo … 6 = sábado. end puede ser "24:00". */
export type Franja = { dow: number; start: string; end: string };

export type SectorConfig = {
  sectorId: number;
  name: string;
  shortName?: string | null;
  configured: boolean;
  active: boolean;
  cobertura: Franja[];
};

const DAY_MIN = 24 * 60;

// ---------- fechas y horas ----------

export function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return isoOf(d);
}

export function dowOf(iso: string): number {
  return new Date(iso + "T12:00:00").getDay();
}

export function parseHM(t: string): number {
  const [h, m] = (t || "00:00").slice(0, 5).split(":").map((x) => Number(x) || 0);
  return h * 60 + m;
}

export function fmtHM(min: number): string {
  const m = Math.max(0, Math.min(DAY_MIN, Math.round(min)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function formatDateAR(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function monthRange(d: Date) {
  const y = d.getFullYear();
  const m = d.getMonth();
  return { from: isoOf(new Date(y, m, 1)), to: isoOf(new Date(y, m + 1, 0)), year: y, month: m };
}

/** Si termina a la misma hora o antes de empezar en el mismo día, termina al día siguiente (nocturna / 24 h). */
export function crossesMidnight(f: { date: string; endDate?: string | null; startTime: string; endTime: string }): boolean {
  const end = f.endDate || f.date;
  return end === f.date && parseHM(f.endTime) <= parseHM(f.startTime);
}

/** Corrige guardias viejas cargadas como 20:00–08:00 con la misma fecha de inicio y fin. */
export function normalizeGuardia(g: Guardia): Guardia {
  return crossesMidnight(g) ? { ...g, endDate: addDaysIso(g.date, 1) } : { ...g, endDate: g.endDate || g.date };
}

/** Nombre comparable: sin tildes, minúsculas, espacios simples. */
export function personKey(name: string): string {
  return (name || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Clave estable del profesional para agrupar estadísticas. */
export function profKey(g: Guardia): string {
  return g.professionalId ? `id:${g.professionalId}` : `n:${personKey(g.professionalName)}`;
}

/** Tramo [desde, hasta) en minutos que la guardia ocupa dentro del día dado, o null. */
export function intervalOnDay(g: Guardia, dayIso: string): [number, number] | null {
  const start = g.date;
  const end = g.endDate || g.date;
  if (dayIso < start || dayIso > end) return null;
  const s = dayIso === start ? parseHM(g.startTime) : 0;
  const e = dayIso === end ? parseHM(g.endTime) : DAY_MIN;
  if (start === end && e <= s) return [s, DAY_MIN]; // dato viejo sin normalizar
  return e > s ? [s, e] : null;
}

export function hoursOnDay(g: Guardia, dayIso: string): number {
  const iv = intervalOnDay(g, dayIso);
  return iv ? (iv[1] - iv[0]) / 60 : 0;
}

export function hoursOfGuardia(g: { date: string; endDate?: string | null; startTime: string; endTime: string }): number {
  const ng = normalizeGuardia({ ...(g as Guardia) });
  let total = 0;
  for (let day = ng.date, n = 0; day <= (ng.endDate || ng.date) && n < 62; day = addDaysIso(day, 1), n++) total += hoursOnDay(ng, day);
  return round1(total);
}

/** Horas de la guardia que caen dentro de [from, to] (el cambio de mes no duplica horas). */
export function hoursInRange(g: Guardia, from: string, to: string): number {
  const start = g.date < from ? from : g.date;
  const endDate = g.endDate || g.date;
  const end = endDate > to ? to : endDate;
  let total = 0;
  for (let day = start, n = 0; day <= end && n < 62; day = addDaysIso(day, 1), n++) total += hoursOnDay(g, day);
  return round1(total);
}

/** Días calendario que toca la guardia. */
export function daysOf(g: Guardia): string[] {
  const out: string[] = [];
  const end = g.endDate || g.date;
  for (let day = g.date, n = 0; day <= end && n < 62; day = addDaysIso(day, 1), n++) {
    if (hoursOnDay(g, day) > 0) out.push(day);
  }
  return out;
}

/** Guardia en curso en el momento dado. */
export function isActiveAt(g: Guardia, now: Date): boolean {
  const iv = intervalOnDay(g, isoOf(now));
  if (!iv) return false;
  const m = now.getHours() * 60 + now.getMinutes();
  return m >= iv[0] && m < iv[1];
}

// ---------- intervalos y cobertura ----------

type Iv = [number, number];

export function mergeIntervals(list: Iv[]): Iv[] {
  const sorted = list.filter((x) => x[1] > x[0]).sort((a, b) => a[0] - b[0]);
  const out: Iv[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else out.push([iv[0], iv[1]]);
  }
  return out;
}

/** Partes de `required` que no cubre `covered`. */
export function subtractIntervals(required: Iv[], covered: Iv[]): Iv[] {
  const cov = mergeIntervals(covered);
  const gaps: Iv[] = [];
  for (const [rs, re] of mergeIntervals(required)) {
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

export function requiredIntervals(cfg: SectorConfig, dayIso: string): Iv[] {
  const dow = dowOf(dayIso);
  return mergeIntervals(cfg.cobertura.filter((f) => f.dow === dow).map((f) => [parseHM(f.start), f.end === "24:00" ? DAY_MIN : parseHM(f.end)] as Iv));
}

export type SectorDayCoverage = {
  sectorId: number;
  name: string;
  requiredMin: number;
  coveredMin: number;
  gaps: Iv[];
  people: number;
  /** Sin horario configurado: alcanza con que haya alguien en el día. */
  simpleRule: boolean;
};

export type DayCoverage = { status: "ok" | "baja" | "sin" | "vacio" | "futuro"; sectors: SectorDayCoverage[] };

/** Cobertura de un día por sector. Solo evalúa hasta `horizon` (lo que ya está planificado). */
export function dayCoverage(dayItems: Guardia[], dayIso: string, configs: SectorConfig[], horizon: string): DayCoverage {
  const sectors: SectorDayCoverage[] = [];
  for (const cfg of configs) {
    const items = dayItems.filter((g) => g.sectorId === cfg.sectorId);
    const covered = items.map((g) => intervalOnDay(g, dayIso)).filter((x): x is Iv => !!x);
    const people = new Set(items.filter((g) => hoursOnDay(g, dayIso) > 0).map(profKey)).size;
    const simpleRule = cfg.cobertura.length === 0;
    const required = simpleRule ? [] : requiredIntervals(cfg, dayIso);
    if (!simpleRule && required.length === 0) continue; // ese día el sector no requiere cobertura
    const gaps = simpleRule ? (people > 0 ? [] : ([[0, DAY_MIN]] as Iv[])) : subtractIntervals(required, covered);
    const requiredMin = simpleRule ? 0 : required.reduce((a, [s, e]) => a + e - s, 0);
    const gapMin = gaps.reduce((a, [s, e]) => a + e - s, 0);
    sectors.push({
      sectorId: cfg.sectorId,
      name: cfg.name,
      requiredMin,
      coveredMin: simpleRule ? 0 : requiredMin - gapMin,
      gaps,
      people,
      simpleRule,
    });
  }
  if (dayIso > horizon) return { status: "futuro", sectors };
  if (sectors.length === 0) return { status: "vacio", sectors };
  const withGaps = sectors.filter((s) => s.gaps.length > 0);
  if (withGaps.length === 0) return { status: "ok", sectors };
  const fullyEmpty = sectors.every((s) => s.people === 0);
  return { status: fullyEmpty ? "sin" : "baja", sectors };
}

export function describeGaps(s: SectorDayCoverage): string {
  if (s.simpleRule) return "sin guardia";
  return s.gaps.map(([a, b]) => `${fmtHM(a)}–${fmtHM(b)}`).join(", ");
}

// ---------- estadísticas de productividad ----------

export type ProfStats = {
  key: string;
  name: string;
  guardias: number;
  days: number;
  horasActivas: number;
  horasPasivas: number;
  horas: number;
  nocturnas: number;
  extras: number;
  reemplazos: number;
  promedio: number;
  sectores: string[];
};

export type SectorStats = {
  sectorId: number;
  name: string;
  guardias: number;
  people: number;
  horasActivas: number;
  horasPasivas: number;
  horas: number;
  requeridas: number;
  cubiertas: number;
  /** % del horario requerido cubierto (null si el sector no tiene horario configurado). */
  cobertura: number | null;
};

function tagIs(g: Guardia, word: string) {
  return personKey(g.tagLabel || "").includes(word);
}

export function computeStats(list: Guardia[], from: string, to: string, configs: SectorConfig[], horizon: string, all: Guardia[]) {
  const byProf = new Map<string, ProfStats & { daySet: Set<string>; sectorSet: Set<string> }>();
  const bySector = new Map<number, SectorStats & { peopleSet: Set<string> }>();

  for (const g of list) {
    const h = hoursInRange(g, from, to);
    if (h <= 0) continue;
    const act = g.modality === "pasiva" ? 0 : h;
    const pas = g.modality === "pasiva" ? h : 0;
    const k = profKey(g);
    const p =
      byProf.get(k) ||
      { key: k, name: g.professionalName || "Sin nombre", guardias: 0, days: 0, horasActivas: 0, horasPasivas: 0, horas: 0, nocturnas: 0, extras: 0, reemplazos: 0, promedio: 0, sectores: [], daySet: new Set<string>(), sectorSet: new Set<string>() };
    p.guardias++;
    p.horasActivas += act;
    p.horasPasivas += pas;
    p.horas += h;
    if ((g.endDate || g.date) > g.date) p.nocturnas++;
    if (tagIs(g, "extra")) p.extras++;
    if (tagIs(g, "reemplazo")) p.reemplazos++;
    for (const d of daysOf(g)) if (d >= from && d <= to) p.daySet.add(d);
    p.sectorSet.add(g.sectorName || `Sector ${g.sectorId}`);
    byProf.set(k, p);

    const s =
      bySector.get(g.sectorId) ||
      { sectorId: g.sectorId, name: g.sectorName || `Sector ${g.sectorId}`, guardias: 0, people: 0, horasActivas: 0, horasPasivas: 0, horas: 0, requeridas: 0, cubiertas: 0, cobertura: null, peopleSet: new Set<string>() };
    s.guardias++;
    s.horasActivas += act;
    s.horasPasivas += pas;
    s.horas += h;
    s.peopleSet.add(k);
    bySector.set(g.sectorId, s);
  }

  // Cobertura del horario requerido (hasta el horizonte planificado), con todas las guardias del sector.
  const lastDay = to < horizon ? to : horizon;
  for (const cfg of configs) {
    if (cfg.cobertura.length === 0) continue;
    let req = 0;
    let cov = 0;
    for (let day = from; day <= lastDay; day = addDaysIso(day, 1)) {
      const items = all.filter((g) => g.sectorId === cfg.sectorId && intervalOnDay(g, day));
      const dc = dayCoverage(items, day, [cfg], "9999-12-31").sectors[0];
      if (!dc) continue;
      req += dc.requiredMin;
      cov += dc.coveredMin;
    }
    if (req === 0) continue;
    const s =
      bySector.get(cfg.sectorId) ||
      { sectorId: cfg.sectorId, name: cfg.name, guardias: 0, people: 0, horasActivas: 0, horasPasivas: 0, horas: 0, requeridas: 0, cubiertas: 0, cobertura: null, peopleSet: new Set<string>() };
    s.requeridas = req / 60;
    s.cubiertas = cov / 60;
    s.cobertura = Math.round((cov / req) * 1000) / 10;
    bySector.set(cfg.sectorId, s);
  }

  const people: ProfStats[] = Array.from(byProf.values())
    .map(({ daySet, sectorSet, ...p }) => ({
      ...p,
      days: daySet.size,
      sectores: Array.from(sectorSet).sort(),
      horasActivas: round1(p.horasActivas),
      horasPasivas: round1(p.horasPasivas),
      horas: round1(p.horas),
      promedio: p.guardias ? round1(p.horas / p.guardias) : 0,
    }))
    .sort((a, b) => b.horas - a.horas);

  const sectors: SectorStats[] = Array.from(bySector.values())
    .map(({ peopleSet, ...s }) => ({
      ...s,
      people: peopleSet.size,
      horasActivas: round1(s.horasActivas),
      horasPasivas: round1(s.horasPasivas),
      horas: round1(s.horas),
      requeridas: round1(s.requeridas),
      cubiertas: round1(s.cubiertas),
    }))
    .sort((a, b) => b.horas - a.horas);

  const req = sectors.reduce((a, s) => a + s.requeridas, 0);
  const cub = sectors.reduce((a, s) => a + s.cubiertas, 0);
  return {
    people,
    sectors,
    totalGuardias: people.reduce((a, p) => a + p.guardias, 0),
    totalHoras: round1(people.reduce((a, p) => a + p.horas, 0)),
    totalActivas: round1(people.reduce((a, p) => a + p.horasActivas, 0)),
    totalPasivas: round1(people.reduce((a, p) => a + p.horasPasivas, 0)),
    coberturaGlobal: req > 0 ? Math.round((cub / req) * 1000) / 10 : null,
  };
}

// ---------- CSV ----------

/** CSV para Excel (separador ;). Con `titulo`, las primeras filas identifican el archivo (sanatorio, qué y cuándo). */
export function downloadCsv(filename: string, rows: (string | number)[][], titulo?: string) {
  const esc = (v: string | number) => String(v ?? "").replace(/;/g, ",").replace(/\r?\n/g, " ");
  const encabezado = titulo ? [[titulo], [`Exportado el ${new Date().toLocaleString("es-AR")}`], []] : [];
  const text = [...encabezado, ...rows].map((r) => r.map(esc).join(";")).join("\n");
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
