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
};

const API = "/api";
const TYPES = [
  { value: "vencimiento", label: "Vencimiento" },
  { value: "liquidacion", label: "Liquidación" },
  { value: "cheque", label: "Cheque / pago" },
  { value: "nota", label: "Nota" },
  { value: "recordatorio", label: "Recordatorio" },
];
const STATUSES = [
  { value: "pendiente", label: "Pendiente" },
  { value: "hecho", label: "Hecho" },
  { value: "anulado", label: "Anulado" },
];
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const ALERT_OPTS = [
  { value: 0, label: "Sin aviso" },
  { value: 1, label: "1 día antes" },
  { value: 3, label: "3 días antes" },
  { value: 7, label: "7 días antes" },
];

function monthRange(d: Date) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const iso = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)), year: y, month: m };
}

function formatDateAR(iso: string) {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function typeLabel(v: string) {
  return TYPES.find((t) => t.value === v)?.label ?? v;
}
function statusLabel(v: string) {
  return STATUSES.find((t) => t.value === v)?.label ?? v;
}
function typeClass(t: string) {
  if (t === "vencimiento") return "li-chip li-chip-venc";
  if (t === "liquidacion") return "li-chip li-chip-liq";
  if (t === "cheque") return "li-chip li-chip-cheque";
  if (t === "nota") return "li-chip li-chip-nota";
  return "li-chip li-chip-rec";
}
function statusClass(s: string) {
  if (s === "hecho") return "badge badge-done";
  if (s === "anulado") return "badge";
  return "badge badge-type";
}

export default function Liquidacion() {
  const [tab, setTab] = useState<"calendario" | "registro">("calendario");
  const [cursor, setCursor] = useState(() => new Date());
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterType, setFilterType] = useState("todos");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const todayIso = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  })();

  const [form, setForm] = useState({
    title: "",
    itemType: "vencimiento",
    status: "pendiente",
    dueDate: todayIso,
    amount: "",
    responsibleName: "",
    notes: "",
    alertDays: 3,
  });

  const range = useMemo(() => monthRange(cursor), [cursor]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ from: range.from, to: range.to });
      if (filterStatus !== "todos") q.set("status", filterStatus);
      if (filterType !== "todos") q.set("itemType", filterType);
      const res = await fetch(`${API}/liquidacion?${q}`, { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message || "No se pudo cargar liquidación");
      }
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, filterStatus, filterType]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDate = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of items) {
      const list = map.get(it.dueDate) || [];
      list.push(it);
      map.set(it.dueDate, list);
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

  const upcoming = useMemo(() => {
    const limit = new Date();
    limit.setDate(limit.getDate() + 7);
    const lim = `${limit.getFullYear()}-${String(limit.getMonth() + 1).padStart(2, "0")}-${String(limit.getDate()).padStart(2, "0")}`;
    return items
      .filter((i) => i.status === "pendiente" && i.dueDate >= todayIso && i.dueDate <= lim)
      .slice(0, 8);
  }, [items, todayIso]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API}/liquidacion`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          itemType: form.itemType,
          status: form.status,
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
      setForm((f) => ({ ...f, title: "", amount: "", responsibleName: "", notes: "" }));
      await load();
      setTab("calendario");
      setSelectedDay(form.dueDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: number, status: string) {
    try {
      const res = await fetch(`${API}/liquidacion/${id}`, {
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
      const res = await fetch(`${API}/liquidacion/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("No se pudo eliminar");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <div className="li-page">
      <div className="li-header">
        <div>
          <div className="eyebrow">Operación / Liquidación</div>
          <h1 className="page-title">Liquidación</h1>
          <p className="page-subtitle">
            Vencimientos, liquidaciones, cheques, notas y recordatorios — el control que hoy está en papel.
          </p>
        </div>
        <div className="gm-tabs" role="tablist">
          <button type="button" className={`gm-tab${tab === "calendario" ? " is-active" : ""}`} onClick={() => setTab("calendario")}>
            Calendario
          </button>
          <button type="button" className={`gm-tab${tab === "registro" ? " is-active" : ""}`} onClick={() => setTab("registro")}>
            Registro
          </button>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      {upcoming.length > 0 && tab === "calendario" && (
        <div className="card li-upcoming">
          <div className="section-kicker">Próximos 7 días</div>
          <div className="li-upcoming-list">
            {upcoming.map((u) => (
              <button
                type="button"
                key={u.id}
                className="li-upcoming-item"
                onClick={() => {
                  setSelectedDay(u.dueDate);
                  setCursor(new Date(u.dueDate + "T12:00:00"));
                }}
              >
                <span className={typeClass(u.itemType)}>{typeLabel(u.itemType)}</span>
                <strong>{u.title}</strong>
                <span className="li-upcoming-date">{formatDateAR(u.dueDate)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === "calendario" && (
        <div className="li-calendar-layout">
          <div className="card li-calendar-panel">
            <div className="gm-cal-toolbar">
              <div className="gm-cal-nav">
                <button type="button" className="btn btn-quiet" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>←</button>
                <span className="gm-cal-month">{monthLabel}</span>
                <button type="button" className="btn btn-quiet" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>→</button>
              </div>
              <div className="li-filters">
                <select className="select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="todos">Todos los estados</option>
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <select className="select" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                  <option value="todos">Todos los tipos</option>
                  {TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {loading ? (
              <div className="skeleton" style={{ height: 280 }} />
            ) : (
              <>
                <div className="gm-weekdays">{WEEKDAYS.map((d) => <div key={d} className="gm-weekday">{d}</div>)}</div>
                <div className="gm-grid li-grid">
                  {calendarCells.map((cell, i) => {
                    if (!cell.day || !cell.iso) return <div key={`e-${i}`} className="gm-cell is-empty li-cell" />;
                    const dayItems = byDate.get(cell.iso) || [];
                    const hasPending = dayItems.some((x) => x.status === "pendiente");
                    const isPast = cell.iso < todayIso && hasPending;
                    return (
                      <button
                        type="button"
                        key={cell.iso}
                        className={`gm-cell li-cell${cell.iso === todayIso ? " is-today" : ""}${cell.iso === selectedDay ? " is-selected" : ""}${dayItems.length ? " has-items" : ""}${isPast ? " is-overdue" : ""}`}
                        onClick={() => setSelectedDay(cell.iso)}
                      >
                        <span className="gm-day-num">{cell.day}</span>
                        <div className="gm-day-chips">
                          {dayItems.slice(0, 2).map((it) => (
                            <span key={it.id} className={typeClass(it.itemType)} title={it.title}>
                              {it.title.length > 14 ? it.title.slice(0, 12) + "…" : it.title}
                            </span>
                          ))}
                          {dayItems.length > 2 && <span className="gm-chip gm-chip-more">+{dayItems.length - 2}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="gm-legend">
                  <span><i className="gm-dot li-chip-venc" /> Vencimiento</span>
                  <span><i className="gm-dot li-chip-liq" /> Liquidación</span>
                  <span><i className="gm-dot li-chip-cheque" /> Cheque</span>
                  <span><i className="gm-dot li-chip-nota" /> Nota</span>
                  <span><i className="gm-dot li-chip-rec" /> Recordatorio</span>
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
              <p className="page-subtitle" style={{ marginTop: 12 }}>Tocá un día para ver vencimientos, notas y recordatorios.</p>
            )}
            {selectedDay && dayDetail.length === 0 && (
              <div className="empty-state" style={{ padding: "20px 8px" }}>
                <p>Nada cargado en este día.</p>
                <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => { setForm((f) => ({ ...f, dueDate: selectedDay })); setTab("registro"); }}>
                  Agregar ítem
                </button>
              </div>
            )}
            {dayDetail.map((it) => (
              <div key={it.id} className="gm-detail-card">
                <div className="gm-detail-top">
                  <span className={typeClass(it.itemType)}>{typeLabel(it.itemType)}</span>
                  <span className={statusClass(it.status)}>{statusLabel(it.status)}</span>
                </div>
                <div className="gm-detail-name">{it.title}</div>
                <div className="gm-detail-meta">
                  {formatDateAR(it.dueDate)}
                  {it.amount ? ` · ${it.amount}` : ""}
                  {it.responsibleName ? ` · ${it.responsibleName}` : ""}
                </div>
                {it.notes && <div className="gm-detail-obs">{it.notes}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  {it.status === "pendiente" && (
                    <button type="button" className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => void setStatus(it.id, "hecho")}>Marcar hecho</button>
                  )}
                  {it.status === "hecho" && (
                    <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => void setStatus(it.id, "pendiente")}>Reabrir</button>
                  )}
                  <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => void onDelete(it.id)}>Eliminar</button>
                </div>
              </div>
            ))}
          </aside>
        </div>
      )}

      {tab === "registro" && (
        <div className="li-registro-layout">
          <form className="card gm-form" onSubmit={onSubmit}>
            <div className="section-kicker">Nuevo ítem</div>
            <h2 className="section-title" style={{ marginTop: 6, marginBottom: 16 }}>Registrar</h2>
            <label className="field">
              <span className="field-label">Título</span>
              <input className="input" required placeholder="Ej. Seguro responsabilidad civil" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <div className="form-grid">
              <label className="field">
                <span className="field-label">Tipo</span>
                <select className="select" value={form.itemType} onChange={(e) => setForm({ ...form, itemType: e.target.value })}>
                  {TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Fecha</span>
                <input className="input" type="date" required value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">Monto (opcional)</span>
                <input className="input" placeholder="$ 0,00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">Aviso</span>
                <select className="select" value={form.alertDays} onChange={(e) => setForm({ ...form, alertDays: Number(e.target.value) })}>
                  {ALERT_OPTS.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              <span className="field-label">Responsable</span>
              <input className="input" placeholder="Nombre" value={form.responsibleName} onChange={(e) => setForm({ ...form, responsibleName: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">Notas</span>
              <textarea className="textarea" rows={3} placeholder="Detalle, nro de factura, etc." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: "100%" }}>
              {saving ? "Guardando…" : "Guardar"}
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
                    <th>Título</th>
                    <th>Tipo</th>
                    <th>Monto</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: 28, color: "hsl(var(--muted-foreground))" }}>
                        Sin ítems este mes. Cargá el primero con el formulario.
                      </td>
                    </tr>
                  ) : (
                    items.map((it) => (
                      <tr key={it.id}>
                        <td>{formatDateAR(it.dueDate)}</td>
                        <td className="agenda-title">{it.title}</td>
                        <td><span className={typeClass(it.itemType)}>{typeLabel(it.itemType)}</span></td>
                        <td>{it.amount || "—"}</td>
                        <td><span className={statusClass(it.status)}>{statusLabel(it.status)}</span></td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          {it.status === "pendiente" && (
                            <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => void setStatus(it.id, "hecho")}>Hecho</button>
                          )}
                          <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => void onDelete(it.id)}>Eliminar</button>
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
