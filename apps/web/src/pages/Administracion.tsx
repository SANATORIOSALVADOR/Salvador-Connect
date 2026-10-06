import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Item = {
  id: number;
  title: string;
  itemType: string;
  status: string;
  dueDate: string;
  amount: string;
  responsibleName: string;
  notes: string;
  alertDays: number;
  source?: string;
};

const API = "/api";
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function daysUntil(due: string, today: string) {
  const a = new Date(due + "T12:00:00").getTime();
  const b = new Date(today + "T12:00:00").getTime();
  return Math.round((a - b) / 86400000);
}

function urgencyClass(d: number, status: string) {
  if (status !== "pendiente") return "adm-urg-ok";
  if (d < 0) return "adm-urg-over";
  if (d === 0) return "adm-urg-today";
  if (d <= 3) return "adm-urg-soon";
  if (d <= 7) return "adm-urg-week";
  return "adm-urg-ok";
}

function urgencyLabel(d: number, status: string) {
  if (status !== "pendiente") return status;
  if (d < 0) return `Vencido (${Math.abs(d)}d)`;
  if (d === 0) return "Hoy";
  return `En ${d} días`;
}

function typeLabel(t: string) {
  const map: Record<string, string> = {
    vencimiento: "Vencimiento",
    pago: "Pago",
    recordatorio: "Recordatorio",
    nota: "Nota",
  };
  return map[t] || t;
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    pendiente: "Pendiente",
    cumplido: "Cumplido",
    cancelado: "Cancelado",
  };
  return map[s] || s;
}

function formatDateAR(iso: string) {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export default function Administracion() {
  const [tab, setTab] = useState<"listado" | "calendario" | "nuevo">("listado");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("pendiente");
  const [filterType, setFilterType] = useState("todos");
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fiscalBusy, setFiscalBusy] = useState(false);
  const [fiscalPicker, setFiscalPicker] = useState(false);
  const [fiscalMonth, setFiscalMonth] = useState(() => new Date().getMonth() + 1);
  const [fiscalYear, setFiscalYear] = useState(() => new Date().getFullYear());

  const todayIso = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  })();

  const [form, setForm] = useState({
    title: "",
    itemType: "vencimiento",
    dueDate: todayIso,
    amount: "",
    responsibleName: "",
    notes: "",
    alertDays: 7,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (filterStatus !== "todos") q.set("status", filterStatus);
      if (filterType !== "todos") q.set("type", filterType);
      const res = await fetch(`${API}/administracion?${q}`, { credentials: "include" });
      if (!res.ok) throw new Error("No se pudo cargar administración");
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterType]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        (i.responsibleName || "").toLowerCase().includes(q),
    );
  }, [items, search]);

  const alerts = useMemo(() => {
    return items
      .filter((i) => i.status === "pendiente")
      .map((i) => ({ ...i, d: daysUntil(i.dueDate, todayIso) }))
      .filter((i) => i.d <= (i.alertDays || 7))
      .sort((a, b) => a.d - b.d)
      .slice(0, 6);
  }, [items, todayIso]);

  const byDate = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of items) {
      const list = map.get(it.dueDate) || [];
      list.push(it);
      map.set(it.dueDate, list);
    }
    return map;
  }, [items]);

  const range = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    return { year: y, month: m };
  }, [cursor]);

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

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API}/administracion`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          itemType: form.itemType,
          dueDate: form.dueDate,
          amount: form.amount.trim(),
          responsibleName: form.responsibleName.trim(),
          notes: form.notes.trim(),
          alertDays: form.alertDays,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message || "No se pudo guardar");
      }
      setForm({ title: "", itemType: "vencimiento", dueDate: todayIso, amount: "", responsibleName: "", notes: "", alertDays: 7 });
      setTab("listado");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: number, status: string) {
    try {
      const res = await fetch(`${API}/administracion/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("No se pudo actualizar");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function onDelete(id: number) {
    if (!confirm("¿Eliminar este ítem?")) return;
    try {
      const res = await fetch(`${API}/administracion/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok && res.status !== 204) throw new Error("No se pudo eliminar");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function generarFiscal(year: number, month: number) {
    setFiscalBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API}/administracion/generar-fiscal`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { message?: string }).message || "No se pudo generar");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setFiscalBusy(false);
    }
  }

  return (
    <div className="adm-page" style={{ padding: "20px 22px 36px", display: "flex", flexDirection: "column", gap: 16, maxWidth: "100%", minWidth: 0 }}>
      <div className="adm-header">
        <div>
          <div className="eyebrow">Operación / Administración</div>
          <h1 className="page-title">Administración</h1>
          <p className="page-subtitle">Control de vencimientos, pagos y recordatorios — reemplazo del control en papel.</p>
        </div>
        <div className="adm-tabs" role="tablist">
          <button type="button" className={`adm-tab${tab === "listado" ? " is-active" : ""}`} onClick={() => setTab("listado")}>Listado</button>
          <button type="button" className={`adm-tab${tab === "calendario" ? " is-active" : ""}`} onClick={() => setTab("calendario")}>Calendario</button>
          <button type="button" className={`adm-tab${tab === "nuevo" ? " is-active" : ""}`} onClick={() => setTab("nuevo")}>+ Nuevo</button>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div className="eyebrow">Calendario fiscal (datos del portal)</div>
            <div style={{ fontWeight: 800, marginTop: 4 }}>Sanatorio del Salvador</div>
            <div className="page-subtitle" style={{ marginTop: 4 }}>
              CUIT 30-68976794-6 · Term. 6 · Responsable Inscripto · Empleador sí · IIBB Córdoba
            </div>
            <p className="page-subtitle" style={{ marginTop: 6 }}>
              Genera vencimientos reales del mes (SICORE, SUSS, IVA, IIBB Cba, agente de retención) según el portal de este CUIT.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setFiscalPicker(true)} disabled={fiscalBusy}>
            Generar vencimientos
          </button>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="card adm-alerts">
          <div className="adm-alerts-title">Avisos activos ({alerts.length})</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {alerts.map((a) => (
              <div key={a.id} className="adm-alert-item" style={{ borderRadius: 12, padding: "12px 14px", border: "1px solid hsl(40 60% 80%)", background: "hsl(45 90% 94%)" }}>
                <strong style={{ fontSize: 12 }}>{urgencyLabel(a.d, a.status)}</strong>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{a.title}</span>
                <span className="page-subtitle">{formatDateAR(a.dueDate)} · {typeLabel(a.itemType)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "listado" && (
        <div className="card adm-list-card">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14 }}>
            <input className="input" style={{ flex: "1 1 180px", minWidth: 140, maxWidth: 280 }} placeholder="Buscar por título o responsable…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="select" style={{ minWidth: 140 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="todos">Todos los estados</option>
              <option value="pendiente">Pendiente</option>
              <option value="cumplido">Cumplido</option>
              <option value="cancelado">Cancelado</option>
            </select>
            <select className="select" style={{ minWidth: 140 }} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="todos">Todos los tipos</option>
              <option value="vencimiento">Vencimiento</option>
              <option value="pago">Pago</option>
              <option value="recordatorio">Recordatorio</option>
              <option value="nota">Nota</option>
            </select>
            <button type="button" className="btn btn-quiet" onClick={() => void load()}>Actualizar</button>
          </div>
          {loading ? (
            <div className="skeleton" style={{ height: 180 }} />
          ) : (
            <div className="agenda-table-wrap" style={{ overflowX: "auto" }}>
              <table className="agenda-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: 10, fontSize: 11 }}>Urgencia</th>
                    <th style={{ textAlign: "left", padding: 10, fontSize: 11 }}>Fecha</th>
                    <th style={{ textAlign: "left", padding: 10, fontSize: 11 }}>Título</th>
                    <th style={{ textAlign: "left", padding: 10, fontSize: 11 }}>Tipo</th>
                    <th style={{ textAlign: "left", padding: 10, fontSize: 11 }}>Responsable</th>
                    <th style={{ textAlign: "left", padding: 10, fontSize: 11 }}>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: "center", padding: 28, color: "hsl(var(--muted-foreground))" }}>Sin ítems.</td></tr>
                  ) : (
                    filtered.map((it) => {
                      const d = daysUntil(it.dueDate, todayIso);
                      return (
                        <tr key={it.id}>
                          <td style={{ padding: 12 }}><span className={`adm-badge ${urgencyClass(d, it.status)}`}>{urgencyLabel(d, it.status)}</span></td>
                          <td style={{ padding: 12 }}>{formatDateAR(it.dueDate)}</td>
                          <td style={{ padding: 12, fontWeight: 700, maxWidth: 320 }}>
                            {it.title}
                            {it.source === "fiscal" && <span className="adm-badge" style={{ marginLeft: 6 }}>Fiscal</span>}
                          </td>
                          <td style={{ padding: 12 }}>{typeLabel(it.itemType)}</td>
                          <td style={{ padding: 12 }}>{it.responsibleName || "—"}</td>
                          <td style={{ padding: 12 }}>{statusLabel(it.status)}</td>
                          <td style={{ padding: 12, textAlign: "right", whiteSpace: "nowrap" }}>
                            {it.status === "pendiente" && (
                              <button type="button" className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => void setStatus(it.id, "cumplido")}>Cumplido</button>
                            )}
                            <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => void onDelete(it.id)}>Eliminar</button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "calendario" && (
        <div className="card" style={{ padding: 18, maxWidth: 560 }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button type="button" className="btn btn-quiet" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>←</button>
              <span style={{ fontWeight: 800, textTransform: "capitalize", minWidth: 140, textAlign: "center" }}>{monthLabel}</span>
              <button type="button" className="btn btn-quiet" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>→</button>
            </div>
            <span className="page-subtitle" style={{ margin: 0 }}>Vista del mes · puntos por urgencia</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6, marginBottom: 6 }}>
            {WEEKDAYS.map((d) => (
              <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "hsl(var(--muted-foreground))", padding: "4px 0" }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6 }}>
            {calendarCells.map((cell, i) => {
              if (!cell.day || !cell.iso) return <div key={`e-${i}`} style={{ minHeight: 48, borderRadius: 10, border: "1px dashed hsl(var(--border))", background: "hsl(var(--muted) / .3)" }} />;
              const dayItems = byDate.get(cell.iso) || [];
              const pending = dayItems.filter((x) => x.status === "pendiente");
              const isToday = cell.iso === todayIso;
              const isSel = cell.iso === selectedDay;
              return (
                <button
                  type="button"
                  key={cell.iso}
                  onClick={() => setSelectedDay(cell.iso)}
                  style={{
                    minHeight: 52,
                    borderRadius: 10,
                    border: isToday || isSel ? "1.5px solid hsl(var(--primary))" : "1px solid hsl(var(--border))",
                    background: isSel ? "hsl(var(--primary) / .08)" : "hsl(var(--card))",
                    padding: "6px 8px",
                    textAlign: "left",
                    cursor: "pointer",
                    font: "inherit",
                    color: "inherit",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: 4,
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 800, color: "hsl(var(--muted-foreground))" }}>{cell.day}</span>
                  {pending.length > 0 && (
                    <span style={{
                      alignSelf: "flex-end", minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999,
                      fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center",
                      background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))",
                    }}>{pending.length}</span>
                  )}
                </button>
              );
            })}
          </div>
          {selectedDay && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid hsl(var(--border))" }}>
              <strong>{new Date(selectedDay + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}</strong>
              {(byDate.get(selectedDay) || []).length === 0 && <p className="page-subtitle">Sin ítems este día.</p>}
              {(byDate.get(selectedDay) || []).map((it) => (
                <div key={it.id} style={{ marginTop: 8, padding: "8px 10px", borderRadius: 10, border: "1px solid hsl(var(--border))" }}>
                  <div style={{ fontWeight: 700 }}>{it.title}{it.source === "fiscal" ? " · Fiscal" : ""}</div>
                  <div className="page-subtitle">{typeLabel(it.itemType)} · {statusLabel(it.status)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "nuevo" && (
        <form className="card" style={{ padding: 18, maxWidth: 520, display: "grid", gap: 12 }} onSubmit={onSave}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Nuevo ítem</h2>
          <label className="field"><span className="field-label">Título</span>
            <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label className="field"><span className="field-label">Tipo</span>
              <select className="select" value={form.itemType} onChange={(e) => setForm({ ...form, itemType: e.target.value })}>
                <option value="vencimiento">Vencimiento</option>
                <option value="pago">Pago</option>
                <option value="recordatorio">Recordatorio</option>
                <option value="nota">Nota</option>
              </select>
            </label>
            <label className="field"><span className="field-label">Fecha</span>
              <input className="input" type="date" required value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </label>
            <label className="field"><span className="field-label">Responsable</span>
              <input className="input" value={form.responsibleName} onChange={(e) => setForm({ ...form, responsibleName: e.target.value })} />
            </label>
            <label className="field"><span className="field-label">Avisar con (días)</span>
              <input className="input" type="number" min={0} max={90} value={form.alertDays} onChange={(e) => setForm({ ...form, alertDays: Number(e.target.value) || 0 })} />
            </label>
          </div>
          <label className="field"><span className="field-label">Notas</span>
            <textarea className="textarea" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button>
        </form>
      )}

      {fiscalPicker && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "grid", placeItems: "center", zIndex: 80, padding: 16 }} onClick={() => setFiscalPicker(false)}>
          <div className="card" style={{ width: "min(400px, 100%)", padding: 20 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 800 }}>Generar vencimientos</h2>
            <p className="page-subtitle">Elegí el mes a generar según el calendario del portal ARCA.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
              <label className="field"><span className="field-label">Mes</span>
                <select className="select" value={fiscalMonth} onChange={(e) => setFiscalMonth(Number(e.target.value))}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="field"><span className="field-label">Año</span>
                <input className="input" type="number" value={fiscalYear} onChange={(e) => setFiscalYear(Number(e.target.value) || new Date().getFullYear())} />
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button type="button" className="btn btn-quiet" onClick={() => setFiscalPicker(false)}>Cancelar</button>
              <button type="button" className="btn btn-primary" disabled={fiscalBusy} onClick={() => { void (async () => { await generarFiscal(fiscalYear, fiscalMonth); setFiscalPicker(false); })(); }}>
                {fiscalBusy ? "Generando…" : "Generar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
