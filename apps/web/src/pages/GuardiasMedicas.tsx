import { FormEvent, useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  addDaysIso,
  computeStats,
  crossesMidnight,
  dayCoverage,
  describeGaps,
  downloadCsv,
  formatDateAR,
  hoursInRange,
  hoursOfGuardia,
  hoursOnDay,
  intervalOnDay,
  isActiveAt,
  isoOf,
  monthRange,
  normalizeGuardia,
  personKey,
  profKey,
  requiredIntervals,
  type DayCoverage,
  type Franja,
  type Guardia,
  type Sector,
  type SectorConfig,
} from "./guardias/logic";

const API = "/api";
const MODALITIES = [
  { value: "activa", label: "Activa" },
  { value: "pasiva", label: "Pasiva" },
];
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DOW_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const TAG_PRESETS = [
  { label: "GUARDIA EXTRA", color: "#c2410c" },
  { label: "COBERTURA", color: "#1d4ed8" },
  { label: "REEMPLAZO", color: "#7c3aed" },
  { label: "URGENTE", color: "#b91c1c" },
];
const TAG_COLORS = ["#0d9488", "#c2410c", "#1d4ed8", "#7c3aed", "#b91c1c", "#ca8a04", "#334155", "#be185d"];

// Estilos de estado en línea: el CSS del build fija background/border de .gm-cell con !important.
const COVERAGE_STYLE: Record<string, CSSProperties> = {
  sin: { boxShadow: "inset 0 0 0 2px rgba(185,28,28,.6), inset 0 0 0 999px rgba(254,226,226,.55)" },
  baja: { boxShadow: "inset 0 0 0 2px rgba(202,138,4,.6), inset 0 0 0 999px rgba(254,243,199,.55)" },
};
/** Colores por sector (fijos según el orden de los sectores, no cambian al filtrar). */
const SECTOR_PALETTE = [
  { solid: "#0d9488", bg: "#ccfbf1", fg: "#115e59" },
  { solid: "#2563eb", bg: "#dbeafe", fg: "#1e3a8a" },
  { solid: "#7c3aed", bg: "#ede9fe", fg: "#4c1d95" },
  { solid: "#ea580c", bg: "#ffedd5", fg: "#9a3412" },
  { solid: "#db2777", bg: "#fce7f3", fg: "#9d174d" },
  { solid: "#16a34a", bg: "#dcfce7", fg: "#14532d" },
  { solid: "#ca8a04", bg: "#fef9c3", fg: "#713f12" },
  { solid: "#0891b2", bg: "#cffafe", fg: "#155e75" },
  { solid: "#b45309", bg: "#fde68a", fg: "#78350f" },
  { solid: "#475569", bg: "#e2e8f0", fg: "#1e293b" },
];
type SectorColor = (typeof SECTOR_PALETTE)[number];
/** Filtro de etiqueta: "" = todas, NO_TAG = guardias sin etiqueta, otro = etiqueta (sin tildes ni mayúsculas). */
const NO_TAG = "__sin_etiqueta__";

const PANEL: CSSProperties = { padding: 16, borderRadius: 14 };
/** Encabezado de tabla fijo al hacer scroll dentro del contenedor. */
const STICKY_TH: CSSProperties = { position: "sticky", top: 0, zIndex: 1, background: "hsl(var(--card))" };
const KPI: CSSProperties = { padding: 14, borderRadius: 12, background: "hsl(var(--muted) / .45)" };
const KPI_LABEL: CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "hsl(var(--muted-foreground))" };
const KPI_VALUE: CSSProperties = { fontSize: 24, fontWeight: 800, marginTop: 4 };
const DOT = (bg: string): CSSProperties => ({ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: bg, marginRight: 6, verticalAlign: "middle" });
const DETAIL_CARD: CSSProperties = { padding: "10px 12px", borderRadius: 10, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", marginTop: 8 };

type Profesional = { id: number; name: string; matricula: string; especialidad: string; active: boolean; guardias: number };
type AuditEntry = {
  id: number;
  guardiaId: number | null;
  action: string;
  userName: string;
  before: Partial<Guardia> | null;
  after: Partial<Guardia> | null;
  createdAt: string;
};

/** Nivel del usuario en un módulo según /auth/me: 0 sin acceso, 1 ver, 2 cargar y editar, 3 control total. */
function levelRank(me: { role?: string; permissions?: Record<string, string> }, moduleKey: string): number {
  if (me.role === "superadmin") return 3;
  return ["ver", "editar", "total"].indexOf(me.permissions?.[moduleKey] ?? "") + 1;
}

function labelMod(v: string) {
  return MODALITIES.find((s) => s.value === v)?.label ?? v;
}

function modalityClass(m: string) {
  return m === "pasiva" ? "gm-chip gm-chip-pasiva" : "gm-chip gm-chip-activa";
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...(init?.headers || {}) } : init?.headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message || `Error ${res.status}`);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

function useIsNarrow(maxWidth = 720) {
  const query = `(max-width: ${maxWidth}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return narrow;
}

function TagBadge({ label, color }: { label?: string | null; color?: string | null }) {
  if (!label) return null;
  return (
    <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.02em", padding: "2px 8px", borderRadius: 999, background: color || "#0d9488", color: "#fff", lineHeight: 1.4, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

type FormState = {
  sectorId: string;
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  modality: string;
  professionalName: string;
  observations: string;
  tagEnabled: boolean;
  tagLabel: string;
  tagColor: string;
};

function emptyForm(today: string): FormState {
  return { sectorId: "", date: today, endDate: today, startTime: "08:00", endTime: "16:00", modality: "activa", professionalName: "", observations: "", tagEnabled: false, tagLabel: "", tagColor: "#c2410c" };
}

function TagFields({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  return (
    <div style={{ border: "1px dashed hsl(var(--border))", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={form.tagEnabled}
          onChange={(e) => setForm({ ...form, tagEnabled: e.target.checked, tagLabel: e.target.checked ? form.tagLabel || "GUARDIA EXTRA" : form.tagLabel, tagColor: form.tagColor || "#c2410c" })}
        />
        Agregar etiqueta (opcional)
      </label>
      {form.tagEnabled && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {TAG_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setForm({ ...form, tagLabel: p.label, tagColor: p.color, tagEnabled: true })}
                style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, border: form.tagLabel === p.label ? "2px solid #0f172a" : "1px solid transparent", background: p.color, color: "#fff", cursor: "pointer" }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <label className="field" style={{ margin: 0 }}>
            <span className="field-label">Texto de la etiqueta</span>
            <input className="input" maxLength={40} placeholder="Ej: GUARDIA EXTRA" value={form.tagLabel} onChange={(e) => setForm({ ...form, tagLabel: e.target.value })} />
          </label>
          <div>
            <div className="field-label" style={{ marginBottom: 6 }}>Color</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onClick={() => setForm({ ...form, tagColor: c })}
                  style={{ width: 28, height: 28, borderRadius: 8, background: c, border: form.tagColor === c ? "3px solid #0f172a" : "2px solid #fff", boxShadow: "0 0 0 1px hsl(var(--border))", cursor: "pointer" }}
                />
              ))}
              <input type="color" value={form.tagColor || "#c2410c"} onChange={(e) => setForm({ ...form, tagColor: e.target.value })} style={{ width: 36, height: 28, border: "none", padding: 0, cursor: "pointer" }} />
            </div>
          </div>
          {form.tagLabel && (
            <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
              Vista previa: <TagBadge label={form.tagLabel} color={form.tagColor} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Editor del horario de cobertura requerido de un sector. */
function CoberturaEditor({ value, onChange, disabled }: { value: Franja[]; onChange: (v: Franja[]) => void; disabled?: boolean }) {
  const preset = (dows: number[], start: string, end: string) => onChange(dows.map((dow) => ({ dow, start, end })));
  const update = (i: number, patch: Partial<Franja>) => onChange(value.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} disabled={disabled} onClick={() => preset([0, 1, 2, 3, 4, 5, 6], "00:00", "24:00")}>24 h todos los días</button>
        <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} disabled={disabled} onClick={() => preset([1, 2, 3, 4, 5], "08:00", "20:00")}>Lun a Vie 08–20</button>
        <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} disabled={disabled} onClick={() => preset([0, 1, 2, 3, 4, 5, 6], "08:00", "20:00")}>Todos los días 08–20</button>
        <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} disabled={disabled} onClick={() => onChange([])}>Sin horario fijo</button>
      </div>
      {value.length === 0 ? (
        <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>Sin horario fijo: se marca solo si un día no hay nadie.</div>
      ) : (
        value.map((f, i) => (
          <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <select className="select" style={{ width: 130 }} value={f.dow} disabled={disabled} onChange={(e) => update(i, { dow: Number(e.target.value) })}>
              {DOW_LABELS.map((l, d) => <option key={d} value={d}>{l}</option>)}
            </select>
            <input className="input" type="time" style={{ width: 110 }} value={f.start} disabled={disabled} onChange={(e) => update(i, { start: e.target.value })} />
            <span style={{ fontSize: 12 }}>a</span>
            {/* 00:00 como hora de fin = hasta el final del día (se guarda como 24:00). */}
            <input className="input" type="time" style={{ width: 110 }} value={f.end === "24:00" ? "00:00" : f.end} disabled={disabled} onChange={(e) => update(i, { end: e.target.value === "00:00" ? "24:00" : e.target.value })} />
            <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} disabled={disabled} onClick={() => onChange(value.filter((_, j) => j !== i))}>Quitar</button>
          </div>
        ))
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} disabled={disabled} onClick={() => onChange([...value, { dow: 1, start: "08:00", end: "20:00" }])}>+ Agregar franja</button>
        <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>Fin 00:00 = hasta medianoche. Una noche (20 a 08) se carga como 20:00–00:00 y, el día siguiente, 00:00–08:00.</span>
      </div>
    </div>
  );
}

function franjasResumen(c: Franja[]): string {
  if (c.length === 0) return "Sin horario fijo";
  const full = c.filter((f) => f.start === "00:00" && f.end === "24:00").map((f) => f.dow);
  if (full.length === 7 && c.length === 7) return "24 h todos los días";
  const byRange = new Map<string, number[]>();
  for (const f of c) byRange.set(`${f.start}–${f.end}`, [...(byRange.get(`${f.start}–${f.end}`) || []), f.dow]);
  return Array.from(byRange.entries())
    .map(([r, dows]) => `${dows.sort().map((d) => DOW_LABELS[d].slice(0, 3)).join(", ")} ${r}`)
    .join(" · ");
}

export default function GuardiasMedicas() {
  const [tab, setTab] = useState<"calendario" | "carga" | "registro" | "stats" | "config">("calendario");
  const [statsFilterSector, setStatsFilterSector] = useState("");
  const [statsFilterPerson, setStatsFilterPerson] = useState("");
  const [historialSearch, setHistorialSearch] = useState("");
  const [cursor, setCursor] = useState(() => new Date());
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [configs, setConfigs] = useState<SectorConfig[]>([]);
  const [items, setItems] = useState<Guardia[]>([]);
  const [nowItems, setNowItems] = useState<Guardia[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filterSector, setFilterSector] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [selectedDay, setSelectedDay] = useState<string | null>(() => isoOf(new Date()));
  const [saving, setSaving] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Guardia | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  /** Control total: eliminar guardias y configurar sectores / profesionales. */
  const [canTotal, setCanTotal] = useState(false);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  /** null = puede escribir en todos los sectores; lista = solo en esos (responsable con sectores asignados). */
  const [writableSectorIds, setWritableSectorIds] = useState<number[] | null>(null);
  const [profesionales, setProfesionales] = useState<string[]>([]);
  const [profList, setProfList] = useState<Profesional[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [allowOverlap, setAllowOverlap] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyForm, setCopyForm] = useState({ fromStart: "", fromEnd: "", toStart: "", sectorId: "" });
  const [cfgDrafts, setCfgDrafts] = useState<Record<number, { active: boolean; cobertura: Franja[] }>>({});
  const [profDrafts, setProfDrafts] = useState<Record<number, Partial<Profesional>>>({});
  const isNarrow = useIsNarrow();
  /** Por debajo de 980 px el calendario y la columna derecha van uno debajo del otro (CSS del build). */
  const isStacked = useIsNarrow(980);

  const todayIso = isoOf(now);
  const [form, setForm] = useState<FormState>(() => emptyForm(isoOf(new Date())));
  const [editForm, setEditForm] = useState<FormState>(() => emptyForm(isoOf(new Date())));
  const range = useMemo(() => monthRange(cursor), [cursor]);

  // ---------- carga de datos ----------

  const loadMeta = useCallback(async () => {
    try {
      const [me, secs, cfg, profs] = await Promise.all([
        apiJson<{ role?: string; sectorIds?: number[]; permissions?: Record<string, string> }>("/auth/me"),
        apiJson<Sector[]>("/sectors"),
        apiJson<SectorConfig[]>("/guardias/config"),
        apiJson<string[]>("/guardias/profesionales"),
      ]);
      const role = String(me.role || "");
      setCanWrite(levelRank(me, "guardias") >= 2);
      setCanTotal(levelRank(me, "guardias") >= 3);
      setIsSuperadmin(role === "superadmin");
      const mine = Array.isArray(me.sectorIds) ? me.sectorIds : [];
      setWritableSectorIds(role === "superadmin" || mine.length === 0 ? null : mine);
      setSectors(Array.isArray(secs) ? secs : []);
      setConfigs(Array.isArray(cfg) ? cfg : []);
      setProfesionales(Array.isArray(profs) ? profs : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar datos del módulo");
    }
  }, []);

  const loadMonth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Siempre el mes completo: los filtros de sector / persona son en cliente.
      const data = await apiJson<Guardia[]>(`/guardias?${new URLSearchParams({ from: range.from, to: range.to })}`);
      setItems(Array.isArray(data) ? data.map(normalizeGuardia) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las guardias");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  const loadNow = useCallback(async () => {
    try {
      const t = isoOf(new Date());
      const data = await apiJson<Guardia[]>(`/guardias?${new URLSearchParams({ from: addDaysIso(t, -1), to: t })}`);
      setNowItems(Array.isArray(data) ? data.map(normalizeGuardia) : []);
    } catch {
      /* el panel "ahora" es informativo */
    }
  }, []);

  const loadAudit = useCallback(async () => {
    try {
      setAudit(await apiJson<AuditEntry[]>("/guardias/auditoria?limit=40"));
    } catch {
      setAudit([]);
    }
  }, []);

  const loadProfList = useCallback(async () => {
    try {
      setProfList(await apiJson<Profesional[]>("/guardias/profesionales/lista"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar profesionales");
    }
  }, []);

  const reloadAll = useCallback(async () => {
    await Promise.all([loadMonth(), loadNow(), loadMeta()]);
    if (canWrite) void loadAudit();
  }, [loadMonth, loadNow, loadMeta, loadAudit, canWrite]);

  useEffect(() => {
    void loadMeta();
    void loadNow();
  }, [loadMeta, loadNow]);

  useEffect(() => {
    void loadMonth();
  }, [loadMonth]);

  useEffect(() => {
    if (canWrite && tab === "registro") void loadAudit();
    if (tab === "config") void loadProfList();
  }, [canWrite, tab, loadAudit, loadProfList]);

  // Guardias ya cargadas el día que se está cargando (panel lateral de "Carga nueva").
  const [cargaDia, setCargaDia] = useState<Guardia[]>([]);
  useEffect(() => {
    if (tab !== "carga" || !form.date) return;
    let alive = true;
    apiJson<Guardia[]>(`/guardias?${new URLSearchParams({ from: form.date, to: form.date })}`)
      .then((d) => alive && setCargaDia(Array.isArray(d) ? d.map(normalizeGuardia).filter((g) => intervalOnDay(g, form.date)) : []))
      .catch(() => alive && setCargaDia([]));
    return () => {
      alive = false;
    };
  }, [tab, form.date, items]);

  // Reloj del panel "De guardia ahora": refresca cada minuto y recarga datos cada 5.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    const r = setInterval(() => void loadNow(), 5 * 60_000);
    return () => {
      clearInterval(t);
      clearInterval(r);
    };
  }, [loadNow]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(t);
  }, [notice]);

  // ---------- derivados ----------

  const activeConfigs = useMemo(() => configs.filter((c) => c.active), [configs]);
  const guardiaSectors: Sector[] = useMemo(
    () => (activeConfigs.length ? activeConfigs.map((c) => ({ id: c.sectorId, name: c.name, shortName: c.shortName })) : sectors),
    [activeConfigs, sectors],
  );
  const formSectors = useMemo(
    () => (writableSectorIds ? guardiaSectors.filter((s) => writableSectorIds.includes(s.id)) : guardiaSectors),
    [guardiaSectors, writableSectorIds],
  );
  const canEditSector = useCallback((sectorId: number) => canWrite && (!writableSectorIds || writableSectorIds.includes(sectorId)), [canWrite, writableSectorIds]);
  const canEdit = (g: Guardia) => canEditSector(g.sectorId);
  const canDelete = (g: Guardia) => canTotal && canEditSector(g.sectorId);

  const sectorColor = useMemo(() => {
    const ids = [...new Set([...configs.map((c) => c.sectorId), ...sectors.map((s) => s.id)])].sort((a, b) => a - b);
    const map = new Map<number, SectorColor>();
    ids.forEach((id, i) => map.set(id, SECTOR_PALETTE[i % SECTOR_PALETTE.length]));
    return map;
  }, [configs, sectors]);
  const colorOf = useCallback((sectorId: number): SectorColor => sectorColor.get(sectorId) ?? SECTOR_PALETTE[SECTOR_PALETTE.length - 1], [sectorColor]);

  /** Abreviatura del sector (la configurada, o iniciales del nombre). */
  const shortOf = useCallback(
    (sectorId: number, name?: string | null) => {
      const short = configs.find((c) => c.sectorId === sectorId)?.shortName || sectors.find((x) => x.id === sectorId)?.shortName;
      if (short) return short;
      const words = (name || "").split(/\s+/).filter((w) => w.length > 2);
      return (words.map((w) => w[0]).join("") || (name || "?").slice(0, 3)).toUpperCase().slice(0, 4);
    },
    [configs, sectors],
  );

  /** Etiquetas usadas en el mes (agrupadas sin tildes ni mayúsculas), con su color y cantidad. */
  const tagOptions = useMemo(() => {
    const map = new Map<string, { key: string; label: string; color: string; count: number }>();
    for (const g of items) {
      const label = (g.tagLabel || "").trim();
      if (!label) continue;
      const key = personKey(label);
      const cur = map.get(key) || { key, label, color: g.tagColor || "#0d9488", count: 0 };
      cur.count++;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [items]);
  const untaggedCount = useMemo(() => items.filter((g) => !(g.tagLabel || "").trim()).length, [items]);

  /** Configs según el filtro de sector del calendario. Con filtro de etiqueta no se evalúa cobertura. */
  const expectedConfigs = useMemo(() => {
    if (filterTag) return [];
    return filterSector ? activeConfigs.filter((c) => c.sectorId === Number(filterSector)) : activeConfigs;
  }, [activeConfigs, filterSector, filterTag]);

  /** Hasta dónde está planificado: no se marca en rojo lo que todavía no se cargó. */
  const horizon = useMemo(() => {
    let max = todayIso;
    for (const g of items) if ((g.endDate || g.date) > max) max = g.endDate || g.date;
    return max;
  }, [items, todayIso]);

  const calendarItems = useMemo(
    () =>
      items.filter((g) => {
        if (filterSector && g.sectorId !== Number(filterSector)) return false;
        if (!filterTag) return true;
        const key = personKey(g.tagLabel || "");
        return filterTag === NO_TAG ? !key : key === filterTag;
      }),
    [items, filterSector, filterTag],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, Guardia[]>();
    for (const g of calendarItems) {
      for (let day = g.date, n = 0; day <= (g.endDate || g.date) && n < 62; day = addDaysIso(day, 1), n++) {
        if (hoursOnDay(g, day) <= 0) continue;
        map.set(day, [...(map.get(day) || []), g]);
      }
    }
    return map;
  }, [calendarItems]);

  const coverageByDay = useMemo(() => {
    const map = new Map<string, DayCoverage>();
    for (let day = range.from; day <= range.to; day = addDaysIso(day, 1)) {
      map.set(day, dayCoverage(byDate.get(day) || [], day, expectedConfigs, horizon));
    }
    return map;
  }, [byDate, expectedConfigs, horizon, range.from, range.to]);

  const historialItems = useMemo(() => {
    const q = personKey(historialSearch);
    if (!q) return calendarItems;
    return calendarItems.filter((g) => personKey(`${g.professionalName} ${g.sectorName || ""} ${g.tagLabel || ""}`).includes(q));
  }, [calendarItems, historialSearch]);

  const calendarCells = useMemo(() => {
    const first = new Date(range.year, range.month, 1);
    let startPad = first.getDay() - 1;
    if (startPad < 0) startPad = 6;
    const daysInMonth = new Date(range.year, range.month + 1, 0).getDate();
    const cells: Array<{ day: number | null; iso: string | null }> = [];
    for (let i = 0; i < startPad; i++) cells.push({ day: null, iso: null });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, iso: isoOf(new Date(range.year, range.month, d)) });
    while (cells.length % 7 !== 0) cells.push({ day: null, iso: null });
    return cells;
  }, [range]);

  const monthLabel = cursor.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  const dayDetail = selectedDay ? byDate.get(selectedDay) || [] : [];

  const stats = useMemo(() => {
    let list = items;
    if (statsFilterSector) list = list.filter((g) => g.sectorId === Number(statsFilterSector));
    const q = personKey(statsFilterPerson);
    if (q) list = list.filter((g) => personKey(g.professionalName).includes(q));
    const cfgs = statsFilterSector ? activeConfigs.filter((c) => c.sectorId === Number(statsFilterSector)) : activeConfigs;
    return computeStats(list, range.from, range.to, q ? [] : cfgs, horizon, items);
  }, [items, statsFilterSector, statsFilterPerson, range.from, range.to, activeConfigs, horizon]);

  /** Quién está de guardia en este momento y qué sectores deberían tener a alguien y no tienen. */
  const ahora = useMemo(() => {
    const minute = now.getHours() * 60 + now.getMinutes();
    const active = nowItems.filter((g) => isActiveAt(g, now));
    return activeConfigs.map((cfg) => {
      const list = active.filter((g) => g.sectorId === cfg.sectorId);
      const required = requiredIntervals(cfg, isoOf(now)).some(([s, e]) => minute >= s && minute < e);
      return { cfg, list, uncovered: required && list.length === 0 };
    });
  }, [nowItems, now, activeConfigs]);

  // ---------- acciones ----------

  function payloadFrom(f: FormState) {
    return {
      sectorId: Number(f.sectorId),
      date: f.date,
      endDate: crossesMidnight(f) ? addDaysIso(f.date, 1) : f.endDate || f.date,
      startTime: f.startTime,
      endTime: f.endTime,
      modality: f.modality,
      professionalName: f.professionalName.trim(),
      observations: f.observations.trim(),
      tagLabel: f.tagEnabled ? f.tagLabel.trim() : "",
      tagColor: f.tagEnabled && f.tagLabel.trim() ? f.tagColor : "",
      allowOverlap,
    };
  }

  function exportGuardiasCsv() {
    const rows: (string | number)[][] = [["Desde", "Hasta", "Sector", "Hora inicio", "Hora fin", "Profesional", "Modalidad", "Etiqueta", "Observaciones", "Horas totales", `Horas en ${monthLabel}`]];
    for (const g of historialItems) {
      rows.push([formatDateAR(g.date), formatDateAR(g.endDate || g.date), g.sectorName || "", g.startTime, g.endTime, g.professionalName, labelMod(g.modality), g.tagLabel || "", g.observations || "", hoursOfGuardia(g), hoursInRange(g, range.from, range.to)]);
    }
    downloadCsv(`guardias-${range.from}_${range.to}.csv`, rows);
  }

  function exportStatsCsv() {
    const rows: (string | number)[][] = [["Profesional", "Días", "Guardias", "Horas activas", "Horas pasivas", "Horas totales", "Promedio h/guardia", "Nocturnas", "Extras", "Reemplazos", "Sectores"]];
    for (const p of stats.people) rows.push([p.name, p.days, p.guardias, p.horasActivas, p.horasPasivas, p.horas, p.promedio, p.nocturnas, p.extras, p.reemplazos, p.sectores.join(" / ")]);
    rows.push([]);
    rows.push(["Sector", "Guardias", "Personas", "Horas activas", "Horas pasivas", "Horas totales", "Horas requeridas", "Horas cubiertas", "% cobertura"]);
    for (const s of stats.sectors) rows.push([s.name, s.guardias, s.people, s.horasActivas, s.horasPasivas, s.horas, s.requeridas || "", s.cubiertas || "", s.cobertura ?? ""]);
    downloadCsv(`productividad-guardias-${range.from}_${range.to}.csv`, rows);
  }

  function openEdit(g: Guardia) {
    setEditing(g);
    setEditError(null);
    setAllowOverlap(false);
    setEditForm({
      sectorId: String(g.sectorId),
      date: g.date,
      endDate: g.endDate || g.date,
      startTime: (g.startTime || "08:00").slice(0, 5),
      endTime: (g.endTime || "16:00").slice(0, 5),
      modality: g.modality === "pasiva" ? "pasiva" : "activa",
      professionalName: g.professionalName || "",
      observations: g.observations || "",
      tagEnabled: Boolean(g.tagLabel),
      tagLabel: g.tagLabel || "",
      tagColor: g.tagColor || "#c2410c",
    });
  }

  function closeEdit() {
    setEditing(null);
    setEditError(null);
    setAllowOverlap(false);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiJson("/guardias", { method: "POST", body: JSON.stringify(payloadFrom(form)) });
      // Mantiene sector, fecha y horario para cargar rápido la siguiente.
      setForm({ ...emptyForm(form.date), sectorId: form.sectorId, startTime: form.startTime, endTime: form.endTime, modality: form.modality });
      setAllowOverlap(false);
      setNotice("Guardia guardada. Podés cargar la siguiente.");
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setEditSaving(true);
    setEditError(null);
    try {
      await apiJson(`/guardias/${editing.id}`, { method: "PATCH", body: JSON.stringify(payloadFrom(editForm)) });
      closeEdit();
      setNotice("Cambios guardados.");
      await reloadAll();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Error al modificar");
    } finally {
      setEditSaving(false);
    }
  }

  async function onDelete(id: number) {
    if (!confirm("¿Eliminar esta guardia? Queda registrado en el historial de cambios.")) return;
    try {
      await apiJson(`/guardias/${id}`, { method: "DELETE" });
      if (editing?.id === id) closeEdit();
      setNotice("Guardia eliminada.");
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
    }
  }

  function openCopy(kind: "semana" | "mes") {
    const t = new Date();
    if (kind === "semana") {
      const dow = (t.getDay() + 6) % 7; // 0 = lunes
      const thisMonday = isoOf(new Date(t.getFullYear(), t.getMonth(), t.getDate() - dow));
      setCopyForm({ fromStart: addDaysIso(thisMonday, -7), fromEnd: addDaysIso(thisMonday, -1), toStart: thisMonday, sectorId: filterSector });
    } else {
      // Mes del calendario ← mes anterior, sin pasarse del último día del mes destino.
      const prev = monthRange(new Date(range.year, range.month - 1, 1));
      const destLen = new Date(range.year, range.month + 1, 0).getDate();
      const prevEnd = addDaysIso(prev.from, destLen - 1) < prev.to ? addDaysIso(prev.from, destLen - 1) : prev.to;
      setCopyForm({ fromStart: prev.from, fromEnd: prevEnd, toStart: range.from, sectorId: filterSector });
    }
    setCopyOpen(true);
  }

  async function onCopy(e: FormEvent) {
    e.preventDefault();
    setCopyBusy(true);
    setError(null);
    try {
      const r = await apiJson<{ created: number; skipped: { professionalName: string; date: string; reason: string }[] }>("/guardias/copiar", {
        method: "POST",
        body: JSON.stringify({ ...copyForm, sectorId: copyForm.sectorId ? Number(copyForm.sectorId) : null }),
      });
      setCopyOpen(false);
      const omit = r.skipped.length ? ` · ${r.skipped.length} omitidas (ya tenían guardia en ese horario o sector sin permiso)` : "";
      setNotice(`Copiadas ${r.created} guardias${omit}.`);
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al copiar");
    } finally {
      setCopyBusy(false);
    }
  }

  async function saveConfig(sectorId: number) {
    const draft = cfgDrafts[sectorId];
    if (!draft) return;
    try {
      await apiJson(`/guardias/config/${sectorId}`, { method: "PUT", body: JSON.stringify(draft) });
      setCfgDrafts(({ [sectorId]: _, ...rest }) => rest);
      setNotice("Configuración del sector guardada.");
      await loadMeta();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar la configuración");
    }
  }

  async function saveProf(id: number) {
    const draft = profDrafts[id];
    if (!draft) return;
    try {
      await apiJson(`/guardias/profesionales/${id}`, { method: "PATCH", body: JSON.stringify(draft) });
      setProfDrafts(({ [id]: _, ...rest }) => rest);
      setNotice("Profesional actualizado.");
      await Promise.all([loadProfList(), loadMeta(), loadMonth()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar el profesional");
    }
  }

  const prevMonth = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
  const nextMonth = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));

  // ---------- render ----------

  function renderFormFields(f: FormState, setF: (x: FormState) => void) {
    return (
      <>
        <label className="field">
          <span className="field-label">Sector</span>
          <select className="select" required value={f.sectorId} onChange={(e) => setF({ ...f, sectorId: e.target.value })}>
            <option value="">Seleccionar…</option>
            {formSectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Fecha inicio</span>
            <input className="input" type="date" required value={f.date} onChange={(e) => {
              const date = e.target.value;
              setF({ ...f, date, endDate: f.endDate < date ? date : f.endDate || date });
            }} />
          </label>
          <label className="field">
            <span className="field-label">Fecha fin</span>
            <input className="input" type="date" required value={f.endDate || f.date} min={f.date} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
          </label>
        </div>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Hora inicio</span>
            <input className="input" type="time" required value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">Hora fin</span>
            <input className="input" type="time" required value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} />
          </label>
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "hsl(var(--muted-foreground))" }}>
          {crossesMidnight(f)
            ? `Termina el día siguiente (${formatDateAR(addDaysIso(f.date, 1))} a las ${f.endTime}) · ${hoursOfGuardia({ ...f, endDate: addDaysIso(f.date, 1) })} h`
            : `Duración: ${hoursOfGuardia(f)} h`}
        </div>
        <label className="field">
          <span className="field-label">Modalidad</span>
          <select className="select" value={f.modality} onChange={(e) => setF({ ...f, modality: e.target.value })}>
            {MODALITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Profesional</span>
          <input className="input" required list="gm-profesionales" placeholder="Apellido y nombre" value={f.professionalName} onChange={(e) => setF({ ...f, professionalName: e.target.value })} autoComplete="off" />
          <datalist id="gm-profesionales">
            {profesionales.map((n) => <option key={n} value={n} />)}
          </datalist>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
          <input type="checkbox" checked={allowOverlap} onChange={(e) => setAllowOverlap(e.target.checked)} />
          Permitir solape de horario (mismo profesional)
        </label>
        <label className="field">
          <span className="field-label">Observaciones</span>
          <textarea className="textarea" rows={3} placeholder="Opcional" value={f.observations} onChange={(e) => setF({ ...f, observations: e.target.value })} />
        </label>
        <TagFields form={f} setForm={setF} />
      </>
    );
  }

  function renderDayChips(day: string, cov: DayCoverage | undefined) {
    const list = byDate.get(day) || [];
    const bySector = new Map<number, { name: string; people: Set<string>; hours: number }>();
    for (const g of list) {
      const cur = bySector.get(g.sectorId) || { name: g.sectorName || `Sector ${g.sectorId}`, people: new Set<string>(), hours: 0 };
      cur.people.add(profKey(g));
      cur.hours += hoursOnDay(g, day);
      bySector.set(g.sectorId, cur);
    }
    const aggs = Array.from(bySector.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name, "es"));
    const missing = (cov?.sectors || []).filter((s) => s.gaps.length > 0);
    return (
      <div className="gm-day-chips" style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 3 }}>
        {aggs.map(([id, a]) => (
          <span key={id} className="gm-chip" style={{ background: colorOf(id).bg, color: colorOf(id).fg, borderLeft: `3px solid ${colorOf(id).solid}`, maxWidth: "none" }} title={`${a.name}: ${a.people.size} persona(s) · ${Math.round(a.hours * 10) / 10} h`}>
            {shortOf(id, a.name)} {a.people.size}
          </span>
        ))}
        {cov && (cov.status === "baja" || cov.status === "sin") && missing.length > 0 && (
          <span className="gm-chip" style={{ background: "rgba(185,28,28,.12)", color: "#991b1b", maxWidth: "none" }} title={missing.map((m) => `${m.name}: ${describeGaps(m)}`).join("\n")}>⚠ {missing.length}</span>
        )}
      </div>
    );
  }

  function coverageTitle(cov: DayCoverage | undefined) {
    if (!cov || (cov.status !== "baja" && cov.status !== "sin")) return undefined;
    return cov.sectors.filter((s) => s.gaps.length).map((s) => `${s.name}: ${describeGaps(s)}`).join("\n");
  }

  function auditText(a: AuditEntry) {
    const g = a.after || a.before || {};
    const when = g.date ? `${formatDateAR(g.date)} ${g.startTime || ""}–${g.endTime || ""}` : "";
    return `${g.professionalName || "—"} · ${g.sectorName || ""} ${when}`.trim();
  }

  const AUDIT_LABEL: Record<string, string> = { alta: "Alta", modificacion: "Modificación", baja: "Baja", copia: "Copia" };

  return (
    <div className="gm-page">
      <div className="gm-header" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 12, marginBottom: 12 }}>
        <div>
          <div className="eyebrow">Operación / Cobertura</div>
          <h1 className="page-title">Guardias Médicas</h1>
          <p className="page-subtitle">Cobertura por sector, carga y productividad.</p>
        </div>
        <div className="gm-tabs" role="tablist" style={{ flexWrap: "wrap" }}>
          {([
            ["calendario", "Calendario"],
            ["carga", "Carga nueva"],
            ["registro", "Registro"],
            ["stats", "Estadísticas"],
            ...(canTotal ? [["config", "Configuración"]] : []),
          ] as [typeof tab, string][]).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={`gm-tab${tab === id ? " is-active" : ""}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
      </div>

      {error && (
        <div className="form-error" role="alert" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
          <span>{error}</span>
          <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => setError(null)}>Cerrar</button>
        </div>
      )}
      {notice && (
        <div role="status" style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid hsl(150 45% 75%)", background: "hsl(150 60% 95%)", color: "hsl(150 60% 22%)", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
          {notice}
        </div>
      )}

      {tab === "calendario" && (
        <>
          <div className="gm-calendar-layout" style={{ alignItems: "start" }}>
            <div className="card gm-calendar-panel">
              <div className="gm-cal-toolbar">
                <div className="gm-cal-nav">
                  <button type="button" className="btn btn-quiet" onClick={prevMonth}>←</button>
                  <span className="gm-cal-month">{monthLabel}</span>
                  <button type="button" className="btn btn-quiet" onClick={nextMonth}>→</button>
                  <button type="button" className="btn btn-quiet" onClick={() => { setCursor(new Date()); setSelectedDay(todayIso); }}>Hoy</button>
                </div>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600 }}>
                  <span>Sector</span>
                  <select className="select" value={filterSector} onChange={(e) => setFilterSector(e.target.value)} style={{ minWidth: 180 }}>
                    <option value="">Todos</option>
                    {guardiaSectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600 }}>
                  <span>Etiqueta</span>
                  <select className="select" value={filterTag} onChange={(e) => setFilterTag(e.target.value)} style={{ minWidth: 170 }}>
                    <option value="">Todas</option>
                    {tagOptions.map((t) => <option key={t.key} value={t.key}>{t.label} ({t.count})</option>)}
                    <option value={NO_TAG}>Sin etiqueta ({untaggedCount})</option>
                  </select>
                </label>
              </div>
              {filterTag && (
                <div style={{ fontSize: 12, marginBottom: 10, color: "hsl(var(--muted-foreground))" }}>
                  Mostrando solo guardias {filterTag === NO_TAG ? "sin etiqueta" : <>con la etiqueta <TagBadge label={tagOptions.find((t) => t.key === filterTag)?.label} color={tagOptions.find((t) => t.key === filterTag)?.color} /></>}. La cobertura no se marca mientras filtrás por etiqueta.{" "}
                  <button type="button" className="btn btn-quiet" style={{ fontSize: 11, padding: "2px 8px" }} onClick={() => setFilterTag("")}>Quitar filtro</button>
                </div>
              )}
              {loading ? (
                <div className="skeleton" style={{ height: 320 }} />
              ) : isNarrow ? (
                // Celular: lista de días en vez de grilla de 7 columnas.
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {calendarCells.filter((c) => c.iso).map((c) => {
                    const cov = coverageByDay.get(c.iso!);
                    const n = (byDate.get(c.iso!) || []).length;
                    if (!n && cov?.status !== "sin" && cov?.status !== "baja") return null;
                    return (
                      <button key={c.iso} type="button" onClick={() => setSelectedDay(c.iso)} style={{ textAlign: "left", padding: "8px 10px", borderRadius: 10, border: `1px solid ${c.iso === selectedDay ? "hsl(var(--primary))" : "hsl(var(--border))"}`, background: "hsl(var(--card))", font: "inherit", color: "inherit", cursor: "pointer", ...(cov ? COVERAGE_STYLE[cov.status] : {}) }}>
                        <div style={{ fontWeight: 800, fontSize: 13, textTransform: "capitalize" }}>
                          {new Date(c.iso! + "T12:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "numeric" })}
                          <span style={{ fontWeight: 600, color: "hsl(var(--muted-foreground))" }}> · {n} guardia{n === 1 ? "" : "s"}</span>
                        </div>
                        {renderDayChips(c.iso!, cov)}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <>
                  <div className="gm-weekdays" style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6 }}>
                    {WEEKDAYS.map((d) => <div key={d} className="gm-weekday">{d}</div>)}
                  </div>
                  <div className="gm-grid" style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6 }}>
                    {calendarCells.map((cell, i) => {
                      if (!cell.day || !cell.iso) return <div key={`e-${i}`} className="gm-cell is-empty" />;
                      const cov = coverageByDay.get(cell.iso);
                      const isSel = cell.iso === selectedDay;
                      return (
                        <button
                          type="button"
                          key={cell.iso}
                          className={`gm-cell${cell.iso === todayIso ? " is-today" : ""}${isSel ? " is-selected" : ""}`}
                          onClick={() => setSelectedDay(cell.iso)}
                          title={coverageTitle(cov)}
                          style={{ ...(cov ? COVERAGE_STYLE[cov.status] : {}), opacity: cov?.status === "futuro" && !(byDate.get(cell.iso) || []).length ? 0.6 : 1 }}
                        >
                          <span className="gm-day-num">{cell.day}</span>
                          {renderDayChips(cell.iso, cov)}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              <div className="gm-legend" style={{ flexWrap: "wrap", gap: 10 }}>
                {guardiaSectors.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setFilterSector(filterSector === String(s.id) ? "" : String(s.id))}
                    title={filterSector === String(s.id) ? "Ver todos los sectores" : `Ver solo ${s.name}`}
                    style={{ display: "inline-flex", alignItems: "center", fontSize: 12, padding: "2px 8px", borderRadius: 999, cursor: "pointer", border: `1px solid ${filterSector === String(s.id) ? colorOf(s.id).solid : "transparent"}`, background: colorOf(s.id).bg, color: colorOf(s.id).fg, font: "inherit" }}
                  >
                    <i style={DOT(colorOf(s.id).solid)} />{s.name}
                  </button>
                ))}
              </div>
              <div className="gm-legend" style={{ flexWrap: "wrap", marginTop: 6 }}>
                <span>Chip = sector · cantidad de personas</span>
                <span><i style={DOT("rgba(202,138,4,.55)")} />Falta cubrir parte del horario</span>
                <span><i style={DOT("rgba(185,28,28,.6)")} />Sin nadie de guardia</span>
              </div>
            </div>

            <aside style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, ...(isStacked ? { order: -1 } : { position: "sticky", top: 12, maxHeight: "calc(100vh - 24px)", overflowY: "auto" }) }}>
              <div className="card" style={{ padding: 12, borderRadius: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <div className="section-kicker">De guardia ahora</div>
                  <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>{now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                  {ahora.length === 0 && <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>No hay sectores de guardia configurados.</div>}
                  {ahora.map(({ cfg, list, uncovered }) => (
                    <div key={cfg.sectorId} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "4px 8px", borderRadius: 8, fontSize: 12, background: uncovered ? "rgba(254,226,226,.6)" : "transparent" }}>
                      <span style={{ minWidth: 0, flex: "0 0 auto", fontWeight: 800, color: colorOf(cfg.sectorId).fg }} title={cfg.name}><i style={DOT(colorOf(cfg.sectorId).solid)} />{shortOf(cfg.sectorId, cfg.name)}</span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        {list.length === 0 ? (
                          <span style={{ color: uncovered ? "#991b1b" : "hsl(var(--muted-foreground))", fontWeight: uncovered ? 700 : 400 }}>{uncovered ? "Nadie de guardia" : "—"}</span>
                        ) : (
                          list.map((g, k) => (
                            <span key={g.id}>
                              {k > 0 && " · "}
                              <strong>{g.professionalName}</strong>{" "}
                              <span style={{ color: "hsl(var(--muted-foreground))" }}>({g.modality === "pasiva" ? "P" : "A"}, hasta {g.endTime}{(g.endDate || g.date) > todayIso ? " mañ." : ""})</span>
                            </span>
                          ))
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card gm-day-panel">
              <div className="section-kicker">Detalle del día</div>
              <h2 className="section-title" style={{ marginTop: 6, textTransform: "capitalize" }}>
                {selectedDay ? new Date(selectedDay + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" }) : "Seleccioná un día"}
              </h2>
              {!selectedDay && <p className="page-subtitle" style={{ marginTop: 12 }}>Tocá un día del calendario para ver quién está de guardia.</p>}
              {selectedDay && (() => {
                const cov = coverageByDay.get(selectedDay) || dayCoverage(dayDetail, selectedDay, expectedConfigs, horizon);
                const faltan = cov.sectors.filter((s) => s.gaps.length > 0);
                if (cov.status === "futuro" || faltan.length === 0) return null;
                return (
                  <div style={{ marginTop: 12, padding: "8px 10px", borderRadius: 10, background: "rgba(254,226,226,.55)", color: "#991b1b", fontSize: 12, fontWeight: 700 }}>
                    {faltan.map((s) => <div key={s.sectorId}>{s.name}: {describeGaps(s)}</div>)}
                  </div>
                );
              })()}
              {selectedDay && dayDetail.length === 0 && (
                <div className="empty-state" style={{ padding: "24px 8px" }}>
                  <p>Sin guardias cargadas para este día.</p>
                </div>
              )}
              {selectedDay && canWrite && (
                <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => { setForm((f) => ({ ...f, date: selectedDay, endDate: selectedDay })); setTab("carga"); }}>Cargar guardia este día</button>
              )}
              {[...dayDetail].sort((a, b) => (a.sectorName || "").localeCompare(b.sectorName || "", "es") || a.startTime.localeCompare(b.startTime)).map((g) => (
                <div key={g.id} style={{ ...DETAIL_CARD, borderLeft: `4px solid ${colorOf(g.sectorId).solid}` }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span className={modalityClass(g.modality)} style={{ display: "inline-block" }}>{labelMod(g.modality)}</span>
                    <span className="badge">{g.startTime} – {g.endTime}</span>
                    <TagBadge label={g.tagLabel} color={g.tagColor} />
                  </div>
                  <div style={{ fontWeight: 800, marginTop: 8 }}>{g.professionalName}</div>
                  <div className="page-subtitle" style={{ marginTop: 4 }}>
                    {g.sectorName || "Sector"} · {formatDateAR(g.date)}
                    {g.endDate && g.endDate !== g.date ? ` → ${formatDateAR(g.endDate)}` : ""}
                  </div>
                  {g.observations && <div style={{ marginTop: 6, fontSize: 13 }}>{g.observations}</div>}
                  {canEdit(g) && (
                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      <button type="button" className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => openEdit(g)}>Editar</button>
                      {canDelete(g) && <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => void onDelete(g.id)}>Eliminar</button>}
                    </div>
                  )}
                </div>
              ))}
              </div>
            </aside>
          </div>
        </>
      )}

      {tab === "carga" && (
        <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "minmax(320px, 480px) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
          {!canWrite ? (
            <div className="card" style={{ padding: 20 }}>
              <div className="section-kicker">Carga nueva</div>
              <h2 className="section-title" style={{ marginTop: 6 }}>Sin permiso de escritura</h2>
              <p className="page-subtitle" style={{ marginTop: 8 }}>Solo responsables o administradores pueden cargar guardias. Podés consultar el calendario y las estadísticas.</p>
            </div>
          ) : (
            <form className="card gm-form" onSubmit={onCreate}>
              <div className="section-kicker">Nueva guardia</div>
              <h2 className="section-title" style={{ marginTop: 6, marginBottom: 16 }}>Registrar cobertura</h2>
              {renderFormFields(form, setForm)}
              <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: "100%", marginTop: 4 }}>
                {saving ? "Guardando…" : "Guardar guardia"}
              </button>
            </form>
          )}
          {canWrite && (() => {
            const sid = Number(form.sectorId) || null;
            const cfg = sid ? configs.find((c) => c.sectorId === sid) : undefined;
            const delSector = sid ? cargaDia.filter((g) => g.sectorId === sid) : [];
            const cov = cfg ? dayCoverage(delSector, form.date, [cfg], "9999-12-31").sectors[0] : undefined;
            const yo = personKey(form.professionalName);
            const propio = normalizeGuardia({ id: 0, sectorId: sid || 0, date: form.date, endDate: crossesMidnight(form) ? addDaysIso(form.date, 1) : form.endDate || form.date, startTime: form.startTime, endTime: form.endTime, modality: form.modality, professionalName: form.professionalName, observations: "" });
            const mio = intervalOnDay(propio, form.date);
            const choque = yo
              ? cargaDia.filter((g) => {
                  if (personKey(g.professionalName) !== yo) return false;
                  const iv = intervalOnDay(g, form.date);
                  return !!(iv && mio && iv[0] < mio[1] && mio[0] < iv[1]);
                })
              : [];
            const ordenadas = [...cargaDia].sort((a, b) => (a.sectorId === sid ? -1 : 0) - (b.sectorId === sid ? -1 : 0) || (a.sectorName || "").localeCompare(b.sectorName || "", "es") || a.startTime.localeCompare(b.startTime));
            return (
              <div className="card" style={{ ...PANEL, position: isNarrow ? "static" : "sticky", top: 12 }}>
                <div className="section-kicker">Ese día</div>
                <h3 className="section-title" style={{ marginTop: 4, fontSize: 16, textTransform: "capitalize" }}>
                  {form.date ? new Date(form.date + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" }) : "Elegí una fecha"}
                </h3>
                {cfg && (
                  <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 10, fontSize: 13, fontWeight: 700, background: cov && cov.gaps.length ? "rgba(254,226,226,.6)" : "rgba(220,252,231,.7)", color: cov && cov.gaps.length ? "#991b1b" : "#14532d", borderLeft: `4px solid ${colorOf(cfg.sectorId).solid}` }}>
                    {cfg.name}: {!cov ? "no requiere cobertura este día" : cov.gaps.length ? `falta cubrir ${describeGaps(cov)}` : cov.simpleRule ? "ya tiene guardia" : "horario requerido cubierto"}
                  </div>
                )}
                {!sid && <p className="page-subtitle" style={{ marginTop: 8 }}>Elegí un sector para ver qué horas faltan cubrir.</p>}
                {choque.length > 0 && (
                  <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 10, fontSize: 12, fontWeight: 700, background: "rgba(254,243,199,.8)", color: "#713f12" }}>
                    ⚠ {form.professionalName} ya tiene guardia en ese horario: {choque.map((g) => `${g.sectorName} ${g.startTime}–${g.endTime}`).join(", ")}
                  </div>
                )}
                <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, color: "hsl(var(--muted-foreground))" }}>Guardias cargadas ({cargaDia.length})</div>
                {cargaDia.length === 0 ? (
                  <p className="page-subtitle" style={{ marginTop: 6 }}>Todavía no hay guardias cargadas este día.</p>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 6, marginTop: 6 }}>
                    {ordenadas.map((g) => (
                      <div key={g.id} style={{ padding: "6px 10px", borderRadius: 8, fontSize: 12, border: "1px solid hsl(var(--border))", borderLeft: `4px solid ${colorOf(g.sectorId).solid}`, opacity: sid && g.sectorId !== sid ? 0.65 : 1 }}>
                        <div style={{ fontWeight: 800 }}>{g.professionalName}</div>
                        <div style={{ color: "hsl(var(--muted-foreground))" }}>
                          {shortOf(g.sectorId, g.sectorName)} · {g.startTime}–{g.endTime}{(g.endDate || g.date) > g.date ? " (+1)" : ""} · {labelMod(g.modality)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {tab === "registro" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card gm-table-wrap">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
              <div>
                <div className="section-kicker">Registro</div>
                <h2 className="section-title" style={{ marginTop: 4, textTransform: "capitalize" }}>{monthLabel}</h2>
                <p className="page-subtitle" style={{ marginTop: 4 }}>{historialItems.length} guardias{filterSector || filterTag ? " (con los filtros del calendario)" : ""}.</p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input className="input" placeholder="Buscar profesional, sector…" value={historialSearch} onChange={(e) => setHistorialSearch(e.target.value)} style={{ minWidth: 180 }} />
                <select className="select" value={filterSector} onChange={(e) => setFilterSector(e.target.value)} style={{ minWidth: 150 }} aria-label="Filtrar por sector">
                  <option value="">Todos los sectores</option>
                  {guardiaSectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select className="select" value={filterTag} onChange={(e) => setFilterTag(e.target.value)} style={{ minWidth: 150 }} aria-label="Filtrar por etiqueta">
                  <option value="">Todas las etiquetas</option>
                  {tagOptions.map((t) => <option key={t.key} value={t.key}>{t.label} ({t.count})</option>)}
                  <option value={NO_TAG}>Sin etiqueta ({untaggedCount})</option>
                </select>
                <button type="button" className="btn btn-quiet" onClick={prevMonth}>← Mes</button>
                <button type="button" className="btn btn-quiet" onClick={nextMonth}>Mes →</button>
                <button type="button" className="btn btn-quiet" onClick={exportGuardiasCsv}>Exportar CSV</button>
                {canWrite && (
                  <>
                    <button type="button" className="btn btn-quiet" onClick={() => openCopy("semana")}>Copiar semana anterior</button>
                    <button type="button" className="btn btn-quiet" onClick={() => openCopy("mes")}>Copiar mes anterior</button>
                    <button type="button" className="btn btn-primary" onClick={() => setTab("carga")}>+ Carga nueva</button>
                  </>
                )}
              </div>
            </div>
            <div className="agenda-table-wrap" style={{ maxHeight: "calc(100vh - 260px)", minHeight: 240, overflowY: "auto" }}>
              <table className="agenda-table">
                <thead>
                  <tr>
                    {["Desde", "Hasta", "Sector", "Horario", "Horas", "Profesional", "Modalidad", "Etiqueta", ""].map((h, n) => <th key={n} style={STICKY_TH}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {historialItems.length === 0 ? (
                    <tr><td colSpan={9} style={{ textAlign: "center", padding: 28, color: "hsl(var(--muted-foreground))" }}>No hay guardias en este mes.</td></tr>
                  ) : (
                    historialItems.map((g) => (
                      <tr key={g.id}>
                        <td>{formatDateAR(g.date)}</td>
                        <td>{formatDateAR(g.endDate || g.date)}</td>
                        <td style={{ whiteSpace: "nowrap" }}><i style={DOT(colorOf(g.sectorId).solid)} />{g.sectorName ?? g.sectorId}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{g.startTime}–{g.endTime}</td>
                        <td>{hoursOfGuardia(g)}</td>
                        <td className="agenda-title">{g.professionalName}</td>
                        <td><span className={modalityClass(g.modality)} style={{ display: "inline-block" }}>{labelMod(g.modality)}</span></td>
                        <td><TagBadge label={g.tagLabel} color={g.tagColor} /></td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          {canEdit(g) && (
                            <>
                              <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => openEdit(g)}>Editar</button>
                              {canDelete(g) && <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => void onDelete(g.id)}>Eliminar</button>}
                            </>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {canWrite && (
            <div className="card gm-table-wrap">
              <div className="section-kicker">Historial de cambios</div>
              <h3 className="section-title" style={{ marginTop: 4, marginBottom: 12, fontSize: 16 }}>Últimos movimientos</h3>
              <div className="agenda-table-wrap">
                <table className="agenda-table">
                  <thead><tr><th>Cuándo</th><th>Usuario</th><th>Acción</th><th>Guardia</th></tr></thead>
                  <tbody>
                    {audit.length === 0 ? (
                      <tr><td colSpan={4} style={{ textAlign: "center", padding: 20, color: "hsl(var(--muted-foreground))" }}>Todavía no hay cambios registrados.</td></tr>
                    ) : (
                      audit.map((a) => (
                        <tr key={a.id}>
                          <td style={{ whiteSpace: "nowrap" }}>{new Date(a.createdAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</td>
                          <td>{a.userName || "—"}</td>
                          <td><strong style={{ color: a.action === "baja" ? "#b91c1c" : undefined }}>{AUDIT_LABEL[a.action] || a.action}</strong></td>
                          <td>{auditText(a)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "stats" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card" style={PANEL}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", justifyContent: "space-between" }}>
              <div>
                <div className="section-kicker">Productividad</div>
                <h2 className="section-title" style={{ marginTop: 4, textTransform: "capitalize" }}>{monthLabel}</h2>
                <p className="page-subtitle" style={{ marginTop: 4 }}>Horas activas y pasivas por profesional y por sector. Solo cuentan las horas dentro del mes.</p>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
                <button type="button" className="btn btn-quiet" onClick={prevMonth}>← Mes</button>
                <button type="button" className="btn btn-quiet" onClick={nextMonth}>Mes →</button>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600 }}>
                  Sector
                  <select className="select" value={statsFilterSector} onChange={(e) => setStatsFilterSector(e.target.value)} style={{ minWidth: 160 }}>
                    <option value="">Todos</option>
                    {guardiaSectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600 }}>
                  Profesional
                  <input className="input" placeholder="Buscar nombre…" value={statsFilterPerson} onChange={(e) => setStatsFilterPerson(e.target.value)} style={{ minWidth: 160 }} />
                </label>
                <button type="button" className="btn btn-quiet" onClick={exportStatsCsv}>Exportar productividad CSV</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginTop: 16 }}>
              <div style={KPI}><div style={KPI_LABEL}>Guardias</div><div style={KPI_VALUE}>{stats.totalGuardias}</div></div>
              <div style={KPI}><div style={KPI_LABEL}>Horas totales</div><div style={KPI_VALUE}>{stats.totalHoras} h</div></div>
              <div style={KPI}><div style={KPI_LABEL}>Horas activas</div><div style={KPI_VALUE}>{stats.totalActivas} h</div></div>
              <div style={KPI}><div style={KPI_LABEL}>Horas pasivas</div><div style={KPI_VALUE}>{stats.totalPasivas} h</div></div>
              <div style={KPI}><div style={KPI_LABEL}>Profesionales</div><div style={KPI_VALUE}>{stats.people.length}</div></div>
              <div style={KPI}>
                <div style={KPI_LABEL}>Cobertura requerida</div>
                <div style={KPI_VALUE}>{stats.coberturaGlobal == null ? "—" : `${stats.coberturaGlobal}%`}</div>
              </div>
            </div>
          </div>

          <div className="card gm-table-wrap">
            <div className="section-kicker">Por sector</div>
            <h3 className="section-title" style={{ marginTop: 4, marginBottom: 12, fontSize: 16 }}>Horas y cobertura del horario requerido</h3>
            <div className="agenda-table-wrap">
              <table className="agenda-table">
                <thead><tr><th>Sector</th><th>Guardias</th><th>Personas</th><th>Activas</th><th>Pasivas</th><th>Total</th><th>Requeridas</th><th>% cubierto</th></tr></thead>
                <tbody>
                  {stats.sectors.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: "center", padding: 20, color: "hsl(var(--muted-foreground))" }}>Sin datos en este mes.</td></tr>
                  ) : (
                    stats.sectors.map((s) => (
                      <tr key={s.sectorId}>
                        <td className="agenda-title">{s.name}</td>
                        <td>{s.guardias}</td>
                        <td>{s.people}</td>
                        <td>{s.horasActivas} h</td>
                        <td>{s.horasPasivas} h</td>
                        <td><strong>{s.horas} h</strong></td>
                        <td>{s.requeridas ? `${s.requeridas} h` : "—"}</td>
                        <td style={{ minWidth: 120 }}>
                          {s.cobertura == null ? "—" : (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{ flex: 1, height: 8, borderRadius: 4, background: "hsl(var(--muted))", overflow: "hidden" }}>
                                <div style={{ width: `${Math.min(100, s.cobertura)}%`, height: "100%", background: s.cobertura >= 95 ? "hsl(160 55% 38%)" : s.cobertura >= 75 ? "hsl(40 85% 45%)" : "hsl(0 70% 48%)" }} />
                              </div>
                              <strong style={{ fontSize: 12 }}>{s.cobertura}%</strong>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card gm-table-wrap">
            <div className="section-kicker">Por profesional</div>
            <h3 className="section-title" style={{ marginTop: 4, marginBottom: 12, fontSize: 16 }}>Productividad individual</h3>
            <div className="agenda-table-wrap">
              <table className="agenda-table">
                <thead><tr><th>Profesional</th><th>Días</th><th>Guardias</th><th>Activas</th><th>Pasivas</th><th>Total</th><th>Prom. h/guardia</th><th>Nocturnas</th><th>Extras</th><th>Reemplazos</th><th>Sectores</th></tr></thead>
                <tbody>
                  {stats.people.length === 0 ? (
                    <tr><td colSpan={11} style={{ textAlign: "center", padding: 20, color: "hsl(var(--muted-foreground))" }}>Sin datos en este mes.</td></tr>
                  ) : (
                    stats.people.map((p) => (
                      <tr key={p.key}>
                        <td className="agenda-title">{p.name}</td>
                        <td>{p.days}</td>
                        <td>{p.guardias}</td>
                        <td>{p.horasActivas} h</td>
                        <td>{p.horasPasivas} h</td>
                        <td><strong>{p.horas} h</strong></td>
                        <td>{p.promedio} h</td>
                        <td>{p.nocturnas}</td>
                        <td>{p.extras}</td>
                        <td>{p.reemplazos}</td>
                        <td style={{ fontSize: 12 }}>{p.sectores.join(", ")}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "config" && canTotal && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card" style={PANEL}>
            <div className="section-kicker">Sectores de guardia</div>
            <h3 className="section-title" style={{ marginTop: 4, fontSize: 16 }}>Horario que cada sector necesita cubierto</h3>
            <p className="page-subtitle" style={{ marginTop: 4 }}>El calendario marca en amarillo o rojo solo los huecos de este horario. Sin horario fijo, se marca cuando un día no hay nadie.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: 12, marginTop: 14, alignItems: "start" }}>
              {configs.map((c) => {
                const draft = cfgDrafts[c.sectorId];
                const val = draft || { active: c.active, cobertura: c.cobertura };
                const editable = canEditSector(c.sectorId);
                const set = (patch: Partial<typeof val>) => setCfgDrafts((d) => ({ ...d, [c.sectorId]: { ...val, ...patch } }));
                return (
                  <div key={c.sectorId} style={{ border: "1px solid hsl(var(--border))", borderRadius: 12, padding: 12, opacity: val.active ? 1 : 0.75 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800 }}>
                        <input type="checkbox" checked={val.active} disabled={!editable} onChange={(e) => set({ active: e.target.checked })} />
                        {c.name}
                      </label>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                        {val.active ? franjasResumen(val.cobertura) : "No participa de Guardias"}
                        {val.active && editable && !draft && (
                          <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => set({})}>Editar horario</button>
                        )}
                      </span>
                    </div>
                    {val.active && editable && draft && <div style={{ marginTop: 10 }}><CoberturaEditor value={val.cobertura} onChange={(cobertura) => set({ cobertura })} /></div>}
                    {draft && (
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button type="button" className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => void saveConfig(c.sectorId)}>Guardar</button>
                        <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => setCfgDrafts(({ [c.sectorId]: _, ...rest }) => rest)}>Descartar</button>
                      </div>
                    )}
                  </div>
                );
              })}
              {!isSuperadmin && writableSectorIds && <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>Solo podés modificar los sectores que tenés asignados.</div>}
            </div>
          </div>

          <div className="card gm-table-wrap">
            <div className="section-kicker">Profesionales</div>
            <h3 className="section-title" style={{ marginTop: 4, fontSize: 16 }}>Datos de los profesionales de guardia</h3>
            <p className="page-subtitle" style={{ marginTop: 4, marginBottom: 12 }}>Se crean solos al cargar un nombre nuevo. Renombrar corrige también sus guardias. Inactivo = no aparece en el autocompletado.</p>
            <div className="agenda-table-wrap">
              <table className="agenda-table">
                <thead><tr><th>Nombre</th><th>Matrícula</th><th>Especialidad</th><th>Activo</th><th>Guardias</th><th /></tr></thead>
                <tbody>
                  {profList.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: "center", padding: 20, color: "hsl(var(--muted-foreground))" }}>Todavía no hay profesionales.</td></tr>
                  ) : (
                    profList.map((p) => {
                      const d = profDrafts[p.id] || {};
                      const v = { ...p, ...d };
                      const set = (patch: Partial<Profesional>) => setProfDrafts((all) => ({ ...all, [p.id]: { ...d, ...patch } }));
                      return (
                        <tr key={p.id}>
                          <td><input className="input" value={v.name} onChange={(e) => set({ name: e.target.value })} style={{ minWidth: 180 }} /></td>
                          <td><input className="input" value={v.matricula} placeholder="MP / MN" onChange={(e) => set({ matricula: e.target.value })} style={{ width: 110 }} /></td>
                          <td><input className="input" value={v.especialidad} onChange={(e) => set({ especialidad: e.target.value })} style={{ minWidth: 140 }} /></td>
                          <td><input type="checkbox" checked={v.active} onChange={(e) => set({ active: e.target.checked })} /></td>
                          <td>{p.guardias}</td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            {profDrafts[p.id] && (
                              <>
                                <button type="button" className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => void saveProf(p.id)}>Guardar</button>
                                <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => setProfDrafts(({ [p.id]: _, ...rest }) => rest)}>Descartar</button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {copyOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 90, padding: 16 }} onClick={() => setCopyOpen(false)}>
          <form className="card" style={{ width: "min(460px, 100%)", padding: 22, display: "flex", flexDirection: "column", gap: 12 }} onClick={(e) => e.stopPropagation()} onSubmit={onCopy}>
            <div>
              <div style={KPI_LABEL}>Copiar guardias</div>
              <h2 style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 800 }}>Repetir un período</h2>
              <p className="page-subtitle" style={{ marginTop: 6 }}>Copia las guardias que empiezan entre las fechas de origen, corridas a la fecha de destino. Las que se solapan con algo ya cargado se omiten.</p>
            </div>
            <div className="form-grid">
              <label className="field"><span className="field-label">Origen desde</span><input className="input" type="date" required value={copyForm.fromStart} onChange={(e) => setCopyForm({ ...copyForm, fromStart: e.target.value })} /></label>
              <label className="field"><span className="field-label">Origen hasta</span><input className="input" type="date" required value={copyForm.fromEnd} min={copyForm.fromStart} onChange={(e) => setCopyForm({ ...copyForm, fromEnd: e.target.value })} /></label>
            </div>
            <label className="field"><span className="field-label">Destino desde</span><input className="input" type="date" required value={copyForm.toStart} onChange={(e) => setCopyForm({ ...copyForm, toStart: e.target.value })} /></label>
            <label className="field">
              <span className="field-label">Sector</span>
              <select className="select" value={copyForm.sectorId} onChange={(e) => setCopyForm({ ...copyForm, sectorId: e.target.value })}>
                <option value="">Todos los que puedo editar</option>
                {formSectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-quiet" onClick={() => setCopyOpen(false)} disabled={copyBusy}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={copyBusy}>{copyBusy ? "Copiando…" : "Copiar"}</button>
            </div>
          </form>
        </div>
      )}

      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 90, padding: 16 }} onClick={closeEdit}>
          <form className="card" style={{ width: "min(460px, 100%)", maxHeight: "92vh", overflowY: "auto", padding: 22, display: "flex", flexDirection: "column", gap: 12 }} onClick={(e) => e.stopPropagation()} onSubmit={onSaveEdit}>
            <div>
              <div style={KPI_LABEL}>Modificar guardia</div>
              <h2 style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 800 }}>{editing.professionalName}</h2>
            </div>
            {editError && <div style={{ padding: 12, borderRadius: 10, background: "hsl(0 70% 95%)", color: "hsl(0 55% 32%)", fontSize: 13, fontWeight: 600 }}>{editError}</div>}
            {renderFormFields(editForm, setEditForm)}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, paddingTop: 8, borderTop: "1px solid hsl(var(--border))" }}>
              {canDelete(editing) ? <button type="button" className="btn btn-quiet" onClick={() => void onDelete(editing.id)} disabled={editSaving}>Eliminar</button> : <span />}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn btn-quiet" onClick={closeEdit} disabled={editSaving}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={editSaving}>{editSaving ? "Guardando…" : "Guardar cambios"}</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
