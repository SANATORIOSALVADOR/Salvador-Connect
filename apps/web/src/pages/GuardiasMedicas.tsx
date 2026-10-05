import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Sector = { id: number; name: string; shortName?: string | null };
type Guardia = {
  id: number;
  sectorId: number;
  sectorName?: string | null;
  sectorShortName?: string | null;
  date: string;
  shift: string;
  modality: string;
  type: string;
  professionalName: string;
  observations: string;
};

const API = "/api";
const SHIFTS = [
  { value: "mañana", label: "Mañana" },
  { value: "tarde", label: "Tarde" },
  { value: "noche", label: "Noche" },
  { value: "24h", label: "24 h" },
];
const MODALITIES = [
  { value: "presencial", label: "Presencial" },
  { value: "retencion", label: "Retención" },
];
const TYPES = [
  { value: "fija", label: "Fija" },
  { value: "rotativa", label: "Rotativa" },
  { value: "pasiva", label: "Pasiva" },
];
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function monthRange(d: Date) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const from = new Date(y, m, 1);
  const to = new Date(y, m + 1, 0);
  const iso = (x: Date) => {
    const yy = x.getFullYear();
    const mm = String(x.getMonth() + 1).padStart(2, "0");
    const dd = String(x.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  };
  return { from: iso(from), to: iso(to), year: y, month: m };
}

function labelShift(v: string) {
  return SHIFTS.find((s) => s.value === v)?.label ?? v;
}
function labelMod(v: string) {
  return MODALITIES.find((s) => s.value === v)?.label ?? v;
}
function labelType(v: string) {
  return TYPES.find((s) => s.value === v)?.label ?? v;
}

function shiftClass(shift: string) {
  if (shift === "mañana") return "gm-chip gm-chip-manana";
  if (shift === "tarde") return "gm-chip gm-chip-tarde";
  if (shift === "noche") return "gm-chip gm-chip-noche";
  return "gm-chip gm-chip-24h";
}

export default function GuardiasMedicas() {
  const [tab, setTab] = useState<"calendario" | "carga">("calendario");
  const [cursor, setCursor] = useState(() => new Date());
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [items, setItems] = useState<Guardia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterSector, setFilterSector] = useState("");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    sectorId: "",
    date: new Date().toISOString().slice(0, 10),
    shift: "mañana",
    modality: "presencial",
    type: "fija",
    professionalName: "",
    observations: "",
  });

  const range = useMemo(() => monthRange(cursor), [cursor]);

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
    for (const g of items) {
      const list = map.get(g.date) || [];
      list.push(g);
      map.set(g.date, list);
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
  const todayIso = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  })();
  const dayDetail = selectedDay ? byDate.get(selectedDay) || [] : [];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API}/guardias`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectorId: Number(form.sectorId),
          date: form.date,
          shift: form.shift,
          modality: form.modality,
          type: form.type,
          professionalName: form.professionalName.trim(),
          observations: form.observations.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message || "No se pudo guardar");
      }
      setForm((f) => ({ ...f, professionalName: "", observations: "" }));
      await load();
      setTab("calendario");
      setSelectedDay(form.date);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: number) {
    if (!confirm("¿Eliminar esta guardia?")) return;
    try {
      const res = await fetch(`${API}/guardias/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("No se pudo eliminar");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
    }
  }

  return (
    <div className="gm-page">
      <div className="gm-header">
        <div>
          <div className="eyebrow">Operación / Cobertura</div>
          <h1 className="page-title">Guardias Médicas</h1>
          <p className="page-subtitle">
            Calendario de quién está de guardia y registro de cargas por sector, turno y modalidad.
          </p>
        </div>
        <div className="gm-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "calendario"} className={`gm-tab${tab === "calendario" ? " is-active" : ""}`} onClick={() => setTab("calendario")}>
            Calendario
          </button>
          <button type="button" role="tab" aria-selected={tab === "carga"} className={`gm-tab${tab === "carga" ? " is-active" : ""}`} onClick={() => setTab("carga")}>
            Carga y registro
          </button>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      {tab === "calendario" && (
        <div className="gm-calendar-layout">
          <div className="card gm-calendar-panel">
            <div className="gm-cal-toolbar">
              <div className="gm-cal-nav">
                <button type="button" className="btn btn-quiet" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
                  ← Mes anterior
                </button>
                <span className="gm-cal-month">{monthLabel}</span>
                <button type="button" className="btn btn-quiet" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
                  Mes siguiente →
                </button>
              </div>
              <label className="gm-filter">
                <span>Sector</span>
                <select className="select" value={filterSector} onChange={(e) => setFilterSector(e.target.value)}>
                  <option value="">Todos</option>
                  {sectors.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
            </div>

            {loading ? (
              <div className="skeleton" style={{ height: 320 }} />
            ) : (
              <>
                <div className="gm-weekdays">
                  {WEEKDAYS.map((d) => (
                    <div key={d} className="gm-weekday">{d}</div>
                  ))}
                </div>
                <div className="gm-grid">
                  {calendarCells.map((cell, i) => {
                    if (!cell.day || !cell.iso) return <div key={`e-${i}`} className="gm-cell is-empty" />;
                    const dayItems = byDate.get(cell.iso) || [];
                    const isToday = cell.iso === todayIso;
                    const isSelected = cell.iso === selectedDay;
                    return (
                      <button
                        type="button"
                        key={cell.iso}
                        className={`gm-cell${isToday ? " is-today" : ""}${isSelected ? " is-selected" : ""}${dayItems.length ? " has-items" : ""}`}
                        onClick={() => setSelectedDay(cell.iso)}
                      >
                        <span className="gm-day-num">{cell.day}</span>
                        <div className="gm-day-chips">
                          {dayItems.slice(0, 3).map((g) => (
                            <span key={g.id} className={shiftClass(g.shift)} title={`${g.professionalName} · ${labelShift(g.shift)}`}>
                              {g.professionalName.split(" ").slice(-1)[0]}
                            </span>
                          ))}
                          {dayItems.length > 3 && <span className="gm-chip gm-chip-more">+{dayItems.length - 3}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="gm-legend">
                  <span><i className="gm-dot gm-chip-manana" /> Mañana</span>
                  <span><i className="gm-dot gm-chip-tarde" /> Tarde</span>
                  <span><i className="gm-dot gm-chip-noche" /> Noche</span>
                  <span><i className="gm-dot gm-chip-24h" /> 24 h</span>
                </div>
              </>
            )}
          </div>

          <aside className="card gm-day-panel">
            <div className="section-kicker">Detalle del día</div>
            <h2 className="section-title" style={{ marginTop: 6 }}>
              {selectedDay
                ? new Date(selectedDay + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })
                : "Seleccioná un día"}
            </h2>
            {!selectedDay && (
              <p className="page-subtitle" style={{ marginTop: 12 }}>
                Tocá un día del calendario para ver quién está de guardia.
              </p>
            )}
            {selectedDay && dayDetail.length === 0 && (
              <div className="empty-state" style={{ padding: "24px 8px" }}>
                <p>Sin cobertura cargada para este día.</p>
                <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => { setForm((f) => ({ ...f, date: selectedDay })); setTab("carga"); }}>
                  Cargar guardia
                </button>
              </div>
            )}
            {dayDetail.map((g) => (
              <div key={g.id} className="gm-detail-card">
                <div className="gm-detail-top">
                  <span className={shiftClass(g.shift)}>{labelShift(g.shift)}</span>
                  <span className="badge badge-type">{labelType(g.type)}</span>
                </div>
                <div className="gm-detail-name">{g.professionalName}</div>
                <div className="gm-detail-meta">{g.sectorName || "Sector"} · {labelMod(g.modality)}</div>
                {g.observations && <div className="gm-detail-obs">{g.observations}</div>}
                <button type="button" className="btn btn-quiet" style={{ marginTop: 8, fontSize: 12 }} onClick={() => void onDelete(g.id)}>
                  Eliminar
                </button>
              </div>
            ))}
          </aside>
        </div>
      )}

      {tab === "carga" && (
        <div className="gm-carga-layout">
          <form className="card gm-form" onSubmit={onSubmit}>
            <div className="section-kicker">Nueva guardia</div>
            <h2 className="section-title" style={{ marginTop: 6, marginBottom: 16 }}>Registrar cobertura</h2>
            <label className="field">
              <span className="field-label">Sector</span>
              <select className="select" required value={form.sectorId} onChange={(e) => setForm({ ...form, sectorId: e.target.value })}>
                <option value="">Seleccionar…</option>
                {sectors.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label className="field">
                <span className="field-label">Fecha</span>
                <input className="input" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">Turno</span>
                <select className="select" value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })}>
                  {SHIFTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Modalidad</span>
                <select className="select" value={form.modality} onChange={(e) => setForm({ ...form, modality: e.target.value })}>
                  {MODALITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Tipo</span>
                <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
            </div>
            <label className="field">
              <span className="field-label">Profesional</span>
              <input className="input" required placeholder="Apellido y nombre" value={form.professionalName} onChange={(e) => setForm({ ...form, professionalName: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">Observaciones</span>
              <textarea className="textarea" rows={3} placeholder="Opcional" value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} />
            </label>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: "100%" }}>
              {saving ? "Guardando…" : "Guardar guardia"}
            </button>
          </form>

          <div className="card gm-table-wrap">
            <div className="section-head">
              <div>
                <div className="section-kicker">Registro del mes</div>
                <h2 className="section-title" style={{ marginTop: 4 }}>{monthLabel}</h2>
              </div>
              <button type="button" className="btn btn-quiet" onClick={() => void load()}>Actualizar</button>
            </div>
            <div className="agenda-table-wrap">
              <table className="agenda-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Sector</th>
                    <th>Turno</th>
                    <th>Profesional</th>
                    <th>Modalidad</th>
                    <th>Tipo</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: 28, color: "hsl(var(--muted-foreground))" }}>
                        No hay guardias en este mes. Cargá la primera con el formulario.
                      </td>
                    </tr>
                  ) : (
                    items.map((g) => (
                      <tr key={g.id}>
                        <td>{g.date}</td>
                        <td>{g.sectorName ?? g.sectorId}</td>
                        <td><span className={shiftClass(g.shift)}>{labelShift(g.shift)}</span></td>
                        <td className="agenda-title">{g.professionalName}</td>
                        <td>{labelMod(g.modality)}</td>
                        <td>{labelType(g.type)}</td>
                        <td style={{ textAlign: "right" }}>
                          <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => void onDelete(g.id)}>Eliminar</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
