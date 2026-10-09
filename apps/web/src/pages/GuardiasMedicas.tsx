import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Sector = { id: number; name: string; shortName?: string | null };
type Guardia = {
  id: number;
  sectorId: number;
  sectorName?: string | null;
  sectorShortName?: string | null;
  date: string;
  endDate?: string | null;
  startTime: string;
  endTime: string;
  modality: string;
  professionalName: string;
  observations: string;
  tagLabel?: string | null;
  tagColor?: string | null;
};

const API = "/api";
const MODALITIES = [
  { value: "activa", label: "Activa" },
  { value: "pasiva", label: "Pasiva" },
];
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const GUARDIA_SECTOR_NAMES = [
  "Guardia Central",
  "UTI Neo",
  "UTI UCO",
  "Piso Gineco",
  "Piso Clínica Médica",
  "Residentes",
];
const TAG_PRESETS = [
  { label: "GUARDIA EXTRA", color: "#c2410c" },
  { label: "COBERTURA", color: "#1d4ed8" },
  { label: "REEMPLAZO", color: "#7c3aed" },
  { label: "URGENTE", color: "#b91c1c" },
];
const TAG_COLORS = ["#0d9488", "#c2410c", "#1d4ed8", "#7c3aed", "#b91c1c", "#ca8a04", "#334155", "#be185d"];

function monthRange(d: Date) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const iso = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return {
    from: iso(new Date(y, m, 1)),
    to: iso(new Date(y, m + 1, 0)),
    year: y,
    month: m,
  };
}

function formatDateAR(iso: string) {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function labelMod(v: string) {
  return MODALITIES.find((s) => s.value === v)?.label ?? v;
}

function modalityClass(m: string) {
  return m === "pasiva" ? "gm-chip gm-chip-pasiva" : "gm-chip gm-chip-activa";
}

function parseHM(t: string): number {
  const [h, m] = (t || "00:00").slice(0, 5).split(":").map((x) => Number(x) || 0);
  return h * 60 + m;
}

function hoursOfGuardia(g: { date: string; endDate?: string | null; startTime: string; endTime: string }): number {
  const start = g.date;
  const end = g.endDate || g.date;
  if (!start) return 0;
  if (end <= start) {
    let mins = parseHM(g.endTime) - parseHM(g.startTime);
    if (mins <= 0) mins += 24 * 60;
    return Math.round((mins / 60) * 10) / 10;
  }
  let mins = 0;
  const cur = new Date(start + "T12:00:00");
  const last = new Date(end + "T12:00:00");
  let day = 0;
  while (cur <= last) {
    const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    if (iso === start && iso === end) mins += parseHM(g.endTime) - parseHM(g.startTime);
    else if (iso === start) mins += 24 * 60 - parseHM(g.startTime);
    else if (iso === end) mins += parseHM(g.endTime);
    else mins += 24 * 60;
    cur.setDate(cur.getDate() + 1);
    day++;
    if (day > 60) break;
  }
  if (mins < 0) mins = 0;
  return Math.round((mins / 60) * 10) / 10;
}

function hoursOnDay(g: { date: string; endDate?: string | null; startTime: string; endTime: string }, dayIso: string): number {
  const start = g.date;
  const end = g.endDate || g.date;
  if (!start || dayIso < start || dayIso > end) return 0;
  if (start === end) {
    let mins = parseHM(g.endTime) - parseHM(g.startTime);
    if (mins <= 0) mins += 24 * 60;
    return Math.round((mins / 60) * 10) / 10;
  }
  let mins = 0;
  if (dayIso === start) mins = 24 * 60 - parseHM(g.startTime);
  else if (dayIso === end) mins = parseHM(g.endTime);
  else mins = 24 * 60;
  return Math.round((mins / 60) * 10) / 10;
}

function shortSector(name?: string | null): string {
  if (!name) return "Sector";
  if (name.length <= 14) return name;
  return name.slice(0, 12) + "…";
}

type SectorDayAgg = { sectorId: number; sectorName: string; people: number; hours: number };

function aggregateDayBySector(items: Guardia[], dayIso: string): SectorDayAgg[] {
  const map = new Map<number, SectorDayAgg>();
  for (const g of items) {
    const key = g.sectorId;
    const cur = map.get(key) || {
      sectorId: key,
      sectorName: g.sectorName || g.sectorShortName || `Sector ${key}`,
      people: 0,
      hours: 0,
    };
    cur.people += 1;
    cur.hours += hoursOnDay(g, dayIso);
    map.set(key, cur);
  }
  return Array.from(map.values()).sort((a, b) => a.sectorName.localeCompare(b.sectorName, "es"));
}

function TagBadge({ label, color }: { label?: string | null; color?: string | null }) {
  if (!label) return null;
  const bg = color || "#0d9488";
  return (
    <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.02em", padding: "2px 8px", borderRadius: 999, background: bg, color: "#fff", lineHeight: 1.4, whiteSpace: "nowrap" }}>
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
  return {
    sectorId: "",
    date: today,
    endDate: today,
    startTime: "08:00",
    endTime: "16:00",
    modality: "activa",
    professionalName: "",
    observations: "",
    tagEnabled: false,
    tagLabel: "",
    tagColor: "#c2410c",
  };
}

function TagFields({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  return (
    <div style={{ border: "1px dashed hsl(var(--border))", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={form.tagEnabled}
          onChange={(e) =>
            setForm({
              ...form,
              tagEnabled: e.target.checked,
              tagLabel: e.target.checked ? form.tagLabel || "GUARDIA EXTRA" : form.tagLabel,
              tagColor: form.tagColor || "#c2410c",
            })
          }
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
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: form.tagLabel === p.label ? "2px solid #0f172a" : "1px solid transparent",
                  background: p.color,
                  color: "#fff",
                  cursor: "pointer",
                }}
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
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: c,
                    border: form.tagColor === c ? "3px solid #0f172a" : "2px solid #fff",
                    boxShadow: "0 0 0 1px hsl(var(--border))",
                    cursor: "pointer",
                  }}
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

export default function GuardiasMedicas() {
  const [tab, setTab] = useState<"calendario" | "carga" | "registro" | "stats">("calendario");
  const [statsFilterSector, setStatsFilterSector] = useState("");
  const [statsFilterPerson, setStatsFilterPerson] = useState("");
  const [cursor, setCursor] = useState(() => new Date());
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [items, setItems] = useState<Guardia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterSector, setFilterSector] = useState("");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Guardia | null>(null);

  const todayIso = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  })();

  const [form, setForm] = useState<FormState>(() => emptyForm(todayIso));
  const [editForm, setEditForm] = useState<FormState>(() => emptyForm(todayIso));

  const range = useMemo(() => monthRange(cursor), [cursor]);

  const guardiaSectors = useMemo(() => {
    const filtered = sectors.filter((s) =>
      GUARDIA_SECTOR_NAMES.some(
        (n) =>
          s.name.toLowerCase() === n.toLowerCase() ||
          s.name.toLowerCase().includes(n.toLowerCase()) ||
          n.toLowerCase().includes(s.name.toLowerCase()),
      ),
    );
    return filtered.length ? filtered : sectors;
  }, [sectors]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ from: range.from, to: range.to });
      if (filterSector) q.set("sectorId", filterSector);
      const [gRes, sRes] = await Promise.all([
        fetch(`${API}/guardias?${q}`, { credentials: "include" }),
        fetch(`${API}/sectors`, { credentials: "include" }),
      ]);
      if (!gRes.ok) {
        const body = await gRes.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message || "No se pudieron cargar las guardias");
      }
      const gData = await gRes.json();
      setItems(Array.isArray(gData) ? gData : []);
      if (sRes.ok) {
        const sData = await sRes.json();
        setSectors(Array.isArray(sData) ? sData : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, filterSector]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDate = useMemo(() => {
    const map = new Map<string, Guardia[]>();
    const addDay = (iso: string, g: Guardia) => {
      const list = map.get(iso) || [];
      list.push(g);
      map.set(iso, list);
    };
    for (const g of items) {
      const start = g.date;
      const end = g.endDate || g.date;
      if (!start) continue;
      if (end <= start) {
        addDay(start, g);
        continue;
      }
      const cur = new Date(start + "T12:00:00");
      const last = new Date(end + "T12:00:00");
      while (cur <= last) {
        const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
        addDay(iso, g);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return map;
  }, [items]);

  const calendarCells = useMemo(() => {
    const first = new Date(range.year, range.month, 1);
    let startPad = first.getDay() - 1;
    if (startPad < 0) startPad = 6;
    const daysInMonth = new Date(range.year, range.month + 1, 0).getDate();
    const cells: Array<{ day: number | null; iso: string | null }> = [];
    for (let i = 0; i < startPad; i++) cells.push({ day: null, iso: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${range.year}-${String(range.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, iso });
    }
    while (cells.length % 7 !== 0) cells.push({ day: null, iso: null });
    return cells;
  }, [range]);

  const monthLabel = cursor.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  const dayDetail = selectedDay ? byDate.get(selectedDay) || [] : [];

  const stats = useMemo(() => {
    let list = items;
    if (statsFilterSector) {
      const sid = Number(statsFilterSector);
      list = list.filter((g) => g.sectorId === sid);
    }
    if (statsFilterPerson.trim()) {
      const q = statsFilterPerson.trim().toLowerCase();
      list = list.filter((g) => (g.professionalName || "").toLowerCase().includes(q));
    }
    const bySector = new Map<string, { name: string; guardias: number; people: Set<string>; hours: number }>();
    const byPerson = new Map<string, { name: string; days: Set<string>; guardias: number; hours: number }>();
    for (const g of list) {
      const sName = g.sectorName || `Sector ${g.sectorId}`;
      const s = bySector.get(sName) || { name: sName, guardias: 0, people: new Set<string>(), hours: 0 };
      s.guardias += 1;
      s.people.add(g.professionalName);
      s.hours += hoursOfGuardia(g);
      bySector.set(sName, s);
      const pName = g.professionalName || "Sin nombre";
      const p = byPerson.get(pName) || { name: pName, days: new Set<string>(), guardias: 0, hours: 0 };
      p.guardias += 1;
      p.hours += hoursOfGuardia(g);
      const start = g.date;
      const end = g.endDate || g.date;
      if (start) {
        const cur = new Date(start + "T12:00:00");
        const last = new Date((end || start) + "T12:00:00");
        let n = 0;
        while (cur <= last && n < 60) {
          const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
          p.days.add(iso);
          cur.setDate(cur.getDate() + 1);
          n++;
        }
      }
      byPerson.set(pName, p);
    }
    const sectorsStats = Array.from(bySector.values())
      .map((s) => ({ name: s.name, guardias: s.guardias, people: s.people.size, hours: Math.round(s.hours * 10) / 10 }))
      .sort((a, b) => b.hours - a.hours);
    const peopleStats = Array.from(byPerson.values())
      .map((p) => ({ name: p.name, days: p.days.size, guardias: p.guardias, hours: Math.round(p.hours * 10) / 10 }))
      .sort((a, b) => b.hours - a.hours);
    const totalHours = Math.round(list.reduce((acc, g) => acc + hoursOfGuardia(g), 0) * 10) / 10;
    return { sectors: sectorsStats, people: peopleStats, totalHours, totalGuardias: list.length };
  }, [items, statsFilterSector, statsFilterPerson]);

  function payloadFrom(f: FormState) {
    return {
      sectorId: Number(f.sectorId),
      date: f.date,
      endDate: f.endDate || f.date,
      startTime: f.startTime,
      endTime: f.endTime,
      modality: f.modality,
      professionalName: f.professionalName.trim(),
      observations: f.observations.trim(),
      tagLabel: f.tagEnabled ? f.tagLabel.trim() : "",
      tagColor: f.tagEnabled && f.tagLabel.trim() ? f.tagColor : "",
    };
  }

  function openEdit(g: Guardia) {
    setEditing(g);
    setEditError(null);
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
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API}/guardias`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadFrom(form)),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message || "No se pudo guardar");
      }
      setForm(emptyForm(form.date));
      await load();
      setTab("registro");
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
      const res = await fetch(`${API}/guardias/${editing.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadFrom(editForm)),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message || "No se pudo guardar");
      }
      closeEdit();
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Error al modificar");
    } finally {
      setEditSaving(false);
    }
  }

  async function onDelete(id: number) {
    if (!confirm("¿Eliminar esta guardia?")) return;
    try {
      const res = await fetch(`${API}/guardias/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("No se pudo eliminar");
      if (editing?.id === id) closeEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
    }
  }

  function renderFormFields(f: FormState, setF: (x: FormState) => void) {
    return (
      <>
        <label className="field">
          <span className="field-label">Sector</span>
          <select className="select" required value={f.sectorId} onChange={(e) => setF({ ...f, sectorId: e.target.value })}>
            <option value="">Seleccionar…</option>
            {guardiaSectors.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
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
        <label className="field">
          <span className="field-label">Modalidad</span>
          <select className="select" value={f.modality} onChange={(e) => setF({ ...f, modality: e.target.value })}>
            {MODALITIES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Profesional</span>
          <input className="input" required placeholder="Apellido y nombre" value={f.professionalName} onChange={(e) => setF({ ...f, professionalName: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">Observaciones</span>
          <textarea className="textarea" rows={3} placeholder="Opcional" value={f.observations} onChange={(e) => setF({ ...f, observations: e.target.value })} />
        </label>
        <TagFields form={f} setForm={setF} />
      </>
    );
  }

  return (
    <div className="gm-page">
      <div className="gm-header" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
        <div>
          <div className="eyebrow">Operación / Cobertura</div>
          <h1 className="page-title">Guardias Médicas</h1>
          <p className="page-subtitle">Quién está de guardia por sector, con horario de inicio y fin (activa o pasiva).</p>
        </div>
        <div className="gm-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "calendario"} className={`gm-tab${tab === "calendario" ? " is-active" : ""}`} onClick={() => setTab("calendario")}>Calendario</button>
          <button type="button" role="tab" aria-selected={tab === "carga"} className={`gm-tab${tab === "carga" ? " is-active" : ""}`} onClick={() => setTab("carga")}>Carga nueva</button>
          <button type="button" role="tab" aria-selected={tab === "registro"} className={`gm-tab${tab === "registro" ? " is-active" : ""}`} onClick={() => setTab("registro")}>Registro historial</button>
          <button type="button" role="tab" aria-selected={tab === "stats"} className={`gm-tab${tab === "stats" ? " is-active" : ""}`} onClick={() => setTab("stats")}>Estadísticas</button>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      {tab === "calendario" && (
        <div className="gm-calendar-layout">
          <div className="card gm-calendar-panel">
            <div className="gm-cal-toolbar">
              <div className="gm-cal-nav">
                <button type="button" className="btn btn-quiet" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>← Mes anterior</button>
                <span className="gm-cal-month">{monthLabel}</span>
                <button type="button" className="btn btn-quiet" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>Mes siguiente →</button>
              </div>
              <label className="gm-filter" style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600 }}>
                <span>Sector</span>
                <select className="select" value={filterSector} onChange={(e) => setFilterSector(e.target.value)} style={{ minWidth: 180 }}>
                  <option value="">Todos</option>
                  {guardiaSectors.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
            </div>
            {loading ? (
              <div className="skeleton" style={{ height: 320 }} />
            ) : (
              <>
                <div className="gm-weekdays">{WEEKDAYS.map((d) => <div key={d} className="gm-weekday">{d}</div>)}</div>
                <div className="gm-grid">
                  {calendarCells.map((cell, i) => {
                    if (!cell.day || !cell.iso) return <div key={`e-${i}`} className="gm-cell is-empty" />;
                    const dayItems = byDate.get(cell.iso) || [];
                    return (
                      <button type="button" key={cell.iso} className={`gm-cell${cell.iso === todayIso ? " is-today" : ""}${cell.iso === selectedDay ? " is-selected" : ""}${dayItems.length ? " has-items" : ""}`} onClick={() => setSelectedDay(cell.iso)}>
                        <span className="gm-day-num">{cell.day}</span>
                        <div className="gm-day-chips">
                          {(() => {
                            const aggs = aggregateDayBySector(dayItems, cell.iso!);
                            const totalH = Math.round(aggs.reduce((a, x) => a + x.hours, 0) * 10) / 10;
                            const totalP = dayItems.length;
                            return (
                              <>
                                {aggs.slice(0, 3).map((a) => (
                                  <span key={a.sectorId} className="gm-chip gm-chip-activa" title={`${a.sectorName}: ${a.people} persona${a.people === 1 ? "" : "s"} · ${a.hours}h`}>
                                    {shortSector(a.sectorName)} = {a.people}
                                  </span>
                                ))}
                                {aggs.length > 3 && <span className="gm-chip gm-chip-more">+{aggs.length - 3} sect.</span>}
                                {totalP > 0 && (
                                  <span className="gm-chip gm-chip-more" title={`${totalP} personas · ${totalH}h en el día`}>
                                    {totalP}p · {totalH}h
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="gm-legend">
                  <span><i className="gm-dot gm-chip-activa" /> Por sector (personas)</span>
                  <span><i className="gm-dot gm-chip-pasiva" /> Total del día (p · h)</span>
                </div>
              </>
            )}
          </div>
          <aside className="card gm-day-panel">
            <div className="section-kicker">Detalle del día</div>
            <h2 className="section-title" style={{ marginTop: 6 }}>
              {selectedDay ? new Date(selectedDay + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" }) : "Seleccioná un día"}
            </h2>
            {!selectedDay && <p className="page-subtitle" style={{ marginTop: 12 }}>Tocá un día del calendario para ver quién está de guardia.</p>}
            {selectedDay && dayDetail.length > 0 && (
              <div style={{ marginTop: 12, marginBottom: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {aggregateDayBySector(dayDetail, selectedDay).map((a) => (
                  <div key={a.sectorId} style={{ fontSize: 13, fontWeight: 600, display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 10px", borderRadius: 8, background: "hsl(var(--muted) / .5)" }}>
                    <span>{a.sectorName}</span>
                    <span style={{ color: "hsl(var(--muted-foreground))", fontWeight: 700 }}>
                      {a.people} pers. · {a.hours}h
                    </span>
                  </div>
                ))}
              </div>
            )}
            {selectedDay && dayDetail.length === 0 && (
              <div className="empty-state" style={{ padding: "24px 8px" }}>
                <p>Sin cobertura cargada para este día.</p>
                <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => { setForm((f) => ({ ...f, date: selectedDay, endDate: selectedDay })); setTab("carga"); }}>Cargar guardia</button>
              </div>
            )}
            {dayDetail.map((g) => (
              <div key={g.id} className="gm-detail-card">
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className={modalityClass(g.modality)}>{labelMod(g.modality)}</span>
                  <span className="badge">{g.startTime} – {g.endTime}</span>
                  <TagBadge label={g.tagLabel} color={g.tagColor} />
                </div>
                <div style={{ fontWeight: 800, marginTop: 8 }}>{g.professionalName}</div>
                <div className="page-subtitle" style={{ marginTop: 4 }}>
                  {g.sectorName || "Sector"} · {formatDateAR(g.date)}
                  {(g.endDate && g.endDate !== g.date) ? ` → ${formatDateAR(g.endDate)}` : ""}
                </div>
                {g.observations && <div style={{ marginTop: 6, fontSize: 13 }}>{g.observations}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => openEdit(g)}>Editar</button>
                  <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => void onDelete(g.id)}>Eliminar</button>
                </div>
              </div>
            ))}
          </aside>
        </div>
      )}

      {tab === "carga" && (
        <div style={{ maxWidth: 440 }}>
          <form className="card gm-form" onSubmit={onCreate}>
            <div className="section-kicker">Nueva guardia</div>
            <h2 className="section-title" style={{ marginTop: 6, marginBottom: 16 }}>Registrar cobertura</h2>
            {renderFormFields(form, setForm)}
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: "100%", marginTop: 4 }}>
              {saving ? "Guardando…" : "Guardar guardia"}
            </button>
          </form>
        </div>
      )}

      {tab === "registro" && (
        <div className="card gm-table-wrap">
          <div className="section-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
            <div>
              <div className="section-kicker">Registro historial</div>
              <h2 className="section-title" style={{ marginTop: 4 }}>{monthLabel}</h2>
              <p className="page-subtitle" style={{ marginTop: 4 }}>Todos los registros del mes. Podés editar o eliminar.</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-quiet" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>← Mes</button>
              <button type="button" className="btn btn-quiet" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>Mes →</button>
              <button type="button" className="btn btn-quiet" onClick={() => void load()}>Actualizar</button>
              <button type="button" className="btn btn-primary" onClick={() => setTab("carga")}>+ Carga nueva</button>
            </div>
          </div>
          <div className="agenda-table-wrap">
            <table className="agenda-table">
              <thead>
                <tr>
                  <th>Desde</th><th>Hasta</th><th>Sector</th><th>Hora inicio</th><th>Hora fin</th><th>Profesional</th><th>Modalidad</th><th>Etiqueta</th><th />
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={9} style={{ textAlign: "center", padding: 28, color: "hsl(var(--muted-foreground))" }}>No hay guardias en este mes.</td></tr>
                ) : (
                  items.map((g) => (
                    <tr key={g.id}>
                      <td>{formatDateAR(g.date)}</td>
                      <td>{formatDateAR(g.endDate || g.date)}</td>
                      <td>{g.sectorName ?? g.sectorId}</td>
                      <td>{g.startTime}</td>
                      <td>{g.endTime}</td>
                      <td className="agenda-title">{g.professionalName}</td>
                      <td><span className={modalityClass(g.modality)}>{labelMod(g.modality)}</span></td>
                      <td><TagBadge label={g.tagLabel} color={g.tagColor} /></td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => openEdit(g)}>Editar</button>
                        <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => void onDelete(g.id)}>Eliminar</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "stats" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", justifyContent: "space-between" }}>
              <div>
                <div className="section-kicker">Estadísticas</div>
                <h2 className="section-title" style={{ marginTop: 4 }}>{monthLabel}</h2>
                <p className="page-subtitle" style={{ marginTop: 4 }}>Horas y cobertura por sector y por profesional.</p>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
                <button type="button" className="btn btn-quiet" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>← Mes</button>
                <button type="button" className="btn btn-quiet" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>Mes →</button>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600 }}>
                  Sector
                  <select className="select" value={statsFilterSector} onChange={(e) => setStatsFilterSector(e.target.value)} style={{ minWidth: 160 }}>
                    <option value="">Todos</option>
                    {guardiaSectors.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600 }}>
                  Profesional
                  <input className="input" placeholder="Buscar nombre…" value={statsFilterPerson} onChange={(e) => setStatsFilterPerson(e.target.value)} style={{ minWidth: 160 }} />
                </label>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginTop: 16 }}>
              <div style={{ padding: 14, borderRadius: 12, background: "hsl(var(--muted) / .45)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "hsl(var(--muted-foreground))" }}>Guardias</div>
                <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{stats.totalGuardias}</div>
              </div>
              <div style={{ padding: 14, borderRadius: 12, background: "hsl(var(--muted) / .45)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "hsl(var(--muted-foreground))" }}>Horas totales</div>
                <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{stats.totalHours}h</div>
              </div>
              <div style={{ padding: 14, borderRadius: 12, background: "hsl(var(--muted) / .45)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "hsl(var(--muted-foreground))" }}>Sectores</div>
                <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{stats.sectors.length}</div>
              </div>
              <div style={{ padding: 14, borderRadius: 12, background: "hsl(var(--muted) / .45)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "hsl(var(--muted-foreground))" }}>Profesionales</div>
                <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{stats.people.length}</div>
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            <div className="card gm-table-wrap">
              <div className="section-kicker">Por sector</div>
              <h3 className="section-title" style={{ marginTop: 4, marginBottom: 12, fontSize: 16 }}>Horas y personas</h3>
              <div className="agenda-table-wrap">
                <table className="agenda-table">
                  <thead><tr><th>Sector</th><th>Guardias</th><th>Personas</th><th>Horas</th></tr></thead>
                  <tbody>
                    {stats.sectors.length === 0 ? (
                      <tr><td colSpan={4} style={{ textAlign: "center", padding: 20, color: "hsl(var(--muted-foreground))" }}>Sin datos en este mes.</td></tr>
                    ) : (
                      stats.sectors.map((s) => (
                        <tr key={s.name}>
                          <td className="agenda-title">{s.name}</td>
                          <td>{s.guardias}</td>
                          <td>{s.people}</td>
                          <td><strong>{s.hours}h</strong></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card gm-table-wrap">
              <div className="section-kicker">Por profesional</div>
              <h3 className="section-title" style={{ marginTop: 4, marginBottom: 12, fontSize: 16 }}>Días y horas del mes</h3>
              <div className="agenda-table-wrap">
                <table className="agenda-table">
                  <thead><tr><th>Profesional</th><th>Días</th><th>Guardias</th><th>Horas</th></tr></thead>
                  <tbody>
                    {stats.people.length === 0 ? (
                      <tr><td colSpan={4} style={{ textAlign: "center", padding: 20, color: "hsl(var(--muted-foreground))" }}>Sin datos en este mes.</td></tr>
                    ) : (
                      stats.people.map((p) => (
                        <tr key={p.name}>
                          <td className="agenda-title">{p.name}</td>
                          <td>{p.days}</td>
                          <td>{p.guardias}</td>
                          <td><strong>{p.hours}h</strong></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 90, padding: 16 }} onClick={closeEdit}>
          <form className="card" style={{ width: "min(460px, 100%)", maxHeight: "92vh", overflowY: "auto", padding: 22, display: "flex", flexDirection: "column", gap: 12 }} onClick={(e) => e.stopPropagation()} onSubmit={onSaveEdit}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "hsl(var(--muted-foreground))" }}>Modificar guardia</div>
              <h2 style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 800 }}>{editing.professionalName}</h2>
            </div>
            {editError && (
              <div style={{ padding: 12, borderRadius: 10, background: "hsl(0 70% 95%)", color: "hsl(0 55% 32%)", fontSize: 13, fontWeight: 600 }}>{editError}</div>
            )}
            {renderFormFields(editForm, setEditForm)}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8, borderTop: "1px solid hsl(var(--border))" }}>
              <button type="button" className="btn btn-quiet" onClick={closeEdit} disabled={editSaving}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={editSaving}>{editSaving ? "Guardando…" : "Guardar cambios"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
