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
  fiscalCode?: string | null;
  fiscalPeriod?: string | null;
};

type FiscalConfig = {
  cuit: string;
  terminacion: number;
  razonSocial: string;
  condicionIva: string;
  empleador: boolean;
  iibb: string;
};

const API = "/api";
const TYPES = [
  { value: "vencimiento", label: "Vencimiento" },
  { value: "cheque", label: "Cheque / pago" },
  { value: "seguro", label: "Seguro / contrato" },
  { value: "nota", label: "Nota" },
  { value: "recordatorio", label: "Recordatorio" },
];
const STATUSES = [
  { value: "pendiente", label: "Pendiente" },
  { value: "hecho", label: "Cumplido" },
  { value: "anulado", label: "Anulado" },
];
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const ALERT_OPTS = [
  { value: 0, label: "Sin aviso" },
  { value: 1, label: "1 día antes" },
  { value: 3, label: "3 días antes" },
  { value: 7, label: "7 días antes" },
  { value: 15, label: "15 días antes" },
  { value: 30, label: "30 días antes" },
];
const MONTH_NAMES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
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
function daysUntil(iso: string, today: string) {
  const a = new Date(iso + "T12:00:00").getTime();
  const b = new Date(today + "T12:00:00").getTime();
  return Math.round((a - b) / 86400000);
}
function typeLabel(v: string) {
  return TYPES.find((t) => t.value === v)?.label ?? v;
}
function statusLabel(v: string) {
  return STATUSES.find((t) => t.value === v)?.label ?? v;
}
function urgencyClass(days: number, status: string) {
  if (status !== "pendiente") return "adm-urg-ok";
  if (days < 0) return "adm-urg-over";
  if (days === 0) return "adm-urg-today";
  if (days <= 3) return "adm-urg-soon";
  if (days <= 7) return "adm-urg-week";
  return "adm-urg-ok";
}
function urgencyLabel(days: number, status: string) {
  if (status !== "pendiente") return "—";
  if (days < 0) return `Vencido hace ${Math.abs(days)} d`;
  if (days === 0) return "Vence hoy";
  if (days === 1) return "Mañana";
  return `En ${days} días`;
}

export default function Administracion() {
  const [tab, setTab] = useState<"listado" | "calendario" | "nuevo">("listado");
  const [cursor, setCursor] = useState(() => new Date());
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("pendiente");
  const [filterType, setFilterType] = useState("todos");
  const [search, setSearch] = useState("");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fiscal, setFiscal] = useState<FiscalConfig | null>(null);
  const [fiscalBusy, setFiscalBusy] = useState(false);
  const [fiscalMsg, setFiscalMsg] = useState<string | null>(null);
  const [fiscalPicker, setFiscalPicker] = useState(false);
  const [fiscalYear, setFiscalYear] = useState(() => new Date().getFullYear());
  const [fiscalMonth, setFiscalMonth] = useState(() => new Date().getMonth() + 1);

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
    alertDays: 7,
  });

  const range = useMemo(() => monthRange(cursor), [cursor]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const from = new Date();
      from.setMonth(from.getMonth() - 1);
      const to = new Date();
      to.setMonth(to.getMonth() + 2);
      const iso = (x: Date) =>
        `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
      const q = new URLSearchParams({ from: iso(from), to: iso(to) });
      if (filterStatus !== "todos") q.set("status", filterStatus);
      if (filterType !== "todos") q.set("itemType", filterType);
      const res = await fetch(`${API}/administracion?${q}`, { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message || "No se pudo cargar");
      }
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterType]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${API}/administracion/fiscal-config`, { credentials: "include" });
        if (res.ok) setFiscal(await res.json());
      } catch {
        /* ignore */
      }
    })();
  }, []);

  async function generarFiscal(year?: number, month?: number) {
    setFiscalBusy(true);
    setFiscalMsg(null);
    setError(null);
    try {
      const y = year ?? cursor.getFullYear();
      const m = month ?? cursor.getMonth() + 1;
      const res = await fetch(`${API}/administracion/generar-fiscal`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: y, month: m }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { message?: string }).message || "No se pudo generar");
      const created = (body as { created?: number }).created ?? 0;
      const skipped = (body as { skipped?: number }).skipped ?? 0;
      const period = (body as { period?: string }).period ?? `${y}-${m}`;
      setFiscalMsg(
        created > 0
          ? `Se generaron ${created} vencimiento(s) fiscal(es) para ${period}.` +
            (skipped ? ` (${skipped} ya existían)` : "")
          : `No hay nuevos: los ${skipped} vencimientos de ${period} ya estaban generados.`,
      );
      await load();
      setTab("listado");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al generar fiscal");
    } finally {
      setFiscalBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((i) => !q || i.title.toLowerCase().includes(q) || i.responsibleName.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [items, search]);

  const alerts = useMemo(() => {
    return filtered
      .filter((i) => {
        if (i.status !== "pendiente") return false;
        const d = daysUntil(i.dueDate, todayIso);
        return d <= (i.alertDays || 0);
      })
      .slice(0, 12);
  }, [filtered, todayIso]);

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

  async function onSubmit(e: FormEvent) {
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
      setTab("listado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
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
      if (!res.ok) throw new Error("No se pudo eliminar");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <div className="adm-page">
      <div className="adm-header">
        <div>
          <div className="eyebrow">Operación / Administración</div>
          <h1 className="page-title">Administración</h1>
          <p className="page-subtitle">
            Control de vencimientos, pagos y recordatorios — reemplazo del control en papel.
          </p>
        </div>
        <div className="adm-tabs" role="tablist">
          <button type="button" className={`adm-tab${tab === "listado" ? " is-active" : ""}`} onClick={() => setTab("listado")}>Listado</button>
          <button type="button" className={`adm-tab${tab === "calendario" ? " is-active" : ""}`} onClick={() => setTab("calendario")}>Calendario</button>
          <button type="button" className={`adm-tab${tab === "nuevo" ? " is-active" : ""}`} onClick={() => setTab("nuevo")}>+ Nuevo</button>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}
      {fiscalMsg && (
        <div className="card" style={{ padding: "12px 16px", fontSize: 13 }}>
          {fiscalMsg}
        </div>
      )}

      {fiscal && (
        <div className="card adm-fiscal-card" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 14, padding: "14px 16px" }}>
          <div className="adm-fiscal-info">
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "hsl(var(--muted-foreground))" }}>Calendario fiscal (datos del portal)</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2 }}>{fiscal.razonSocial}</div>
            <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginTop: 4 }}>
              CUIT <span className="font-mono">{fiscal.cuit}</span>
              <span style={{ margin: "0 6px", opacity: 0.5 }}>·</span>
              Term. {fiscal.terminacion}
              <span style={{ margin: "0 6px", opacity: 0.5 }}>·</span>
              {fiscal.condicionIva}
              <span style={{ margin: "0 6px", opacity: 0.5 }}>·</span>
              Empleador {fiscal.empleador ? "sí" : "no"}
              <span style={{ margin: "0 6px", opacity: 0.5 }}>·</span>
              IIBB {fiscal.iibb}
            </div>
            <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", margin: "6px 0 0", maxWidth: 520, lineHeight: 1.35 }}>
              Genera vencimientos reales del mes (SICORE, SUSS, IVA, IIBB Cba, agente de retención) según el portal de este CUIT.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={fiscalBusy}
            onClick={() => {
              setFiscalYear(new Date().getFullYear());
              setFiscalMonth(new Date().getMonth() + 1);
              setFiscalPicker(true);
            }}
          >
            {fiscalBusy ? "Generando…" : "Generar vencimientos"}
          </button>
        </div>
      )}

      {alerts.length > 0 && (
        <div className="adm-alerts card">
          <div className="adm-alerts-title">Avisos activos ({alerts.length})</div>
          <div className="adm-alerts-grid">
            {alerts.map((a) => {
              const d = daysUntil(a.dueDate, todayIso);
              return (
                <div key={a.id} className={`adm-alert-item ${urgencyClass(d, a.status)}`}>
                  <div className="adm-alert-when">{urgencyLabel(d, a.status)}</div>
                  <div className="adm-alert-title">{a.title}</div>
                  <div className="adm-alert-meta">{formatDateAR(a.dueDate)} · {typeLabel(a.itemType)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "listado" && (
        <div className="card adm-list-card">
          <div className="adm-toolbar">
            <input className="input" placeholder="Buscar por título o responsable…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="todos">Todos los estados</option>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select className="select" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="todos">Todos los tipos</option>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <button type="button" className="btn btn-quiet" onClick={() => void load()}>Actualizar</button>
          </div>
          {loading ? <div className="skeleton" style={{ height: 220 }} /> : (
            <div className="agenda-table-wrap">
              <table className="agenda-table adm-table">
                <thead>
                  <tr>
                    <th>Urgencia</th><th>Fecha</th><th>Título</th><th>Tipo</th><th>Responsable</th><th>Monto</th><th>Estado</th><th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: "center", padding: 32, color: "hsl(var(--muted-foreground))" }}>No hay ítems. Generá vencimientos o usá <strong>+ Nuevo</strong>.</td></tr>
                  ) : filtered.map((it) => {
                    const d = daysUntil(it.dueDate, todayIso);
                    return (
                      <tr key={it.id}>
                        <td><span className={`adm-badge ${urgencyClass(d, it.status)}`}>{urgencyLabel(d, it.status)}</span></td>
                        <td>{formatDateAR(it.dueDate)}</td>
                        <td className="agenda-title">{it.title}{it.source === "fiscal" ? <span style={{ marginLeft: 8, background: "hsl(220 45% 92%)", color: "hsl(220 45% 32%)", fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 999 }}>Fiscal</span> : null}{it.notes ? <div className="adm-note-preview">{it.notes}</div> : null}</td>
                        <td>{typeLabel(it.itemType)}{it.source === "fiscal" ? " · Fiscal" : ""}</td>
                        <td>{it.responsibleName || "—"}</td>
                        <td>{it.amount || "—"}</td>
                        <td>{statusLabel(it.status)}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          {it.status === "pendiente" && <button type="button" className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => void setStatus(it.id, "hecho")}>Cumplido</button>}
                          {it.status === "hecho" && <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => void setStatus(it.id, "pendiente")}>Reabrir</button>}
                          <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => void onDelete(it.id)}>Eliminar</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "calendario" && (
        <div className="adm-cal-wrap card">
          <div className="adm-cal-toolbar">
            <div className="adm-cal-nav">
              <button type="button" className="btn btn-quiet" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>←</button>
              <span className="adm-cal-month">{monthLabel}</span>
              <button type="button" className="btn btn-quiet" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>→</button>
            </div>
            <span className="page-subtitle" style={{ margin: 0 }}>Vista del mes · puntos por urgencia</span>
          </div>
          <div className="adm-weekdays">{WEEKDAYS.map((d) => <div key={d} className="adm-weekday">{d}</div>)}</div>
          <div className="adm-grid">
            {calendarCells.map((cell, i) => {
              if (!cell.day || !cell.iso) return <div key={`e-${i}`} className="adm-cell is-empty" />;
              const dayItems = byDate.get(cell.iso) || [];
              const pending = dayItems.filter((x) => x.status === "pendiente");
              const d = daysUntil(cell.iso, todayIso);
              const urg = pending.length ? urgencyClass(d, "pendiente") : "";
              return (
                <button type="button" key={cell.iso} className={`adm-cell${cell.iso === todayIso ? " is-today" : ""}${cell.iso === selectedDay ? " is-selected" : ""}${pending.length ? " has-items" : ""} ${urg}`} onClick={() => setSelectedDay(cell.iso)}>
                  <span className="adm-day-num">{cell.day}</span>
                  {pending.length > 0 && <span className="adm-dot-count">{pending.length}</span>}
                </button>
              );
            })}
          </div>
          {selectedDay && (
            <div className="adm-day-detail">
              <strong>{new Date(selectedDay + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}</strong>
              {(byDate.get(selectedDay) || []).length === 0 && <p className="page-subtitle">Sin ítems este día.</p>}
              {(byDate.get(selectedDay) || []).map((it) => (
                <div key={it.id} className="adm-day-row">
                  <span>{it.title}{it.source === "fiscal" ? " · Fiscal" : ""}</span>
                  <span className="page-subtitle">{typeLabel(it.itemType)} · {statusLabel(it.status)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "nuevo" && (
        <form className="card adm-form" onSubmit={onSubmit}>
          <div className="section-kicker">Alta</div>
          <h2 className="section-title" style={{ marginTop: 6, marginBottom: 16 }}>Nuevo vencimiento o nota</h2>
          <label className="field"><span className="field-label">Título</span>
            <input className="input" required placeholder="Ej. Seguro RC · renovación" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <div className="form-grid">
            <label className="field"><span className="field-label">Tipo</span>
              <select className="select" value={form.itemType} onChange={(e) => setForm({ ...form, itemType: e.target.value })}>
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="field"><span className="field-label">Fecha de vencimiento</span>
              <input className="input" type="date" required value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </label>
            <label className="field"><span className="field-label">Avisar con anticipación</span>
              <select className="select" value={form.alertDays} onChange={(e) => setForm({ ...form, alertDays: Number(e.target.value) })}>
                {ALERT_OPTS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </label>
            <label className="field"><span className="field-label">Monto (opcional)</span>
              <input className="input" placeholder="$ 0,00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </label>
          </div>
          <label className="field"><span className="field-label">Responsable</span>
            <input className="input" placeholder="Quién debe ocuparse" value={form.responsibleName} onChange={(e) => setForm({ ...form, responsibleName: e.target.value })} />
          </label>
          <label className="field"><span className="field-label">Notas</span>
            <textarea className="textarea" rows={3} placeholder="Nro de factura, contacto, detalle…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: "100%" }}>{saving ? "Guardando…" : "Guardar"}</button>
        </form>
      )}

      {fiscalPicker && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "grid", placeItems: "center", zIndex: 80, padding: 16 }}
          onClick={() => !fiscalBusy && setFiscalPicker(false)}
        >
          <div
            className="card"
            role="dialog"
            aria-modal="true"
            style={{ width: "min(420px, 100%)", padding: 20, display: "grid", gap: 14 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "hsl(var(--muted-foreground))" }}>
                Calendario fiscal
              </div>
              <h2 style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 800 }}>Generar vencimientos</h2>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "hsl(var(--muted-foreground))", lineHeight: 1.4 }}>
                Elegí el mes cuyas fechas de vencimiento querés cargar (SICORE, SUSS, IVA, IIBB, agente de retención).
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
              <label className="field">
                <span className="field-label">Mes</span>
                <select className="select" value={fiscalMonth} onChange={(e) => setFiscalMonth(Number(e.target.value))} disabled={fiscalBusy}>
                  {MONTH_NAMES_ES.map((name, i) => (
                    <option key={name} value={i + 1}>{name}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Año</span>
                <select className="select" value={fiscalYear} onChange={(e) => setFiscalYear(Number(e.target.value))} disabled={fiscalBusy}>
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button type="button" className="btn btn-quiet" disabled={fiscalBusy} onClick={() => setFiscalPicker(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={fiscalBusy}
                onClick={() => {
                  void (async () => {
                    await generarFiscal(fiscalYear, fiscalMonth);
                    setFiscalPicker(false);
                  })();
                }}
              >
                {fiscalBusy ? "Generando…" : "Generar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
