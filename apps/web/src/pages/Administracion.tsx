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

// Deben coincidir con TYPES / STATUSES de apps/api/src/routes/administracion.ts
const TYPE_OPTIONS = [
  { value: "vencimiento", label: "Vencimiento" },
  { value: "pago", label: "Pago" },
  { value: "cheque", label: "Cheque" },
  { value: "seguro", label: "Seguro" },
  { value: "recordatorio", label: "Recordatorio" },
  { value: "nota", label: "Nota" },
];
const STATUS_OPTIONS = [
  { value: "pendiente", label: "Pendiente" },
  { value: "cumplido", label: "Cumplido" },
  { value: "cancelado", label: "Cancelado" },
];
const WRITE_ROLES = ["superadmin", "responsable", "nivel2", "nivel3"];
const FISCAL_MARKER_RE = /\[FISCAL:[A-Z0-9_]+:\d{4}-\d{2}\]\s*/g;
const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function typeLabel(t: string) {
  if (t === "liquidacion") return "Liquidación";
  return TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
}

function statusLabel(s: string) {
  return STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;
}

/** Notas sin la marca interna [FISCAL:...] (la API la conserva sola). */
function cleanNotes(notes: string) {
  return (notes || "").replace(FISCAL_MARKER_RE, "").trim();
}

type FormState = {
  title: string;
  itemType: string;
  dueDate: string;
  amount: string;
  responsibleName: string;
  notes: string;
  alertDays: number;
};

function emptyForm(today: string): FormState {
  return { title: "", itemType: "vencimiento", dueDate: today, amount: "", responsibleName: "", notes: "", alertDays: 7 };
}

function payload(f: FormState) {
  return {
    title: f.title.trim(),
    itemType: f.itemType,
    dueDate: f.dueDate,
    amount: f.amount.trim(),
    responsibleName: f.responsibleName.trim(),
    notes: f.notes.trim(),
    alertDays: f.alertDays,
  };
}

function formatDateAR(iso: string) {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export default function Administracion() {
  // El botón "Nuevo vencimiento" del resumen llega con ?nuevo=1
  const [tab, setTab] = useState<"listado" | "calendario" | "nuevo">(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("nuevo") ? "nuevo" : "listado",
  );
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

  const [form, setForm] = useState<FormState>(() => emptyForm(todayIso));
  const [editing, setEditing] = useState<Item | null>(null);
  const [editForm, setEditForm] = useState<FormState>(() => emptyForm(todayIso));
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [canWrite, setCanWrite] = useState(false);

  // Se trae todo y se filtra en cliente: así el calendario y los avisos no dependen del filtro del listado.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, meRes] = await Promise.all([
        fetch(`${API}/administracion`, { credentials: "include" }),
        fetch(`${API}/auth/me`, { credentials: "include" }),
      ]);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message || "No se pudo cargar administración");
      }
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
      if (meRes.ok) {
        const me = await meRes.json();
        setCanWrite(WRITE_ROLES.includes(String(me.role || "")));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(
      (i) =>
        (filterStatus === "todos" || i.status === filterStatus) &&
        (filterType === "todos" || i.itemType === filterType) &&
        (!q || i.title.toLowerCase().includes(q) || (i.responsibleName || "").toLowerCase().includes(q)),
    );
  }, [items, search, filterStatus, filterType]);

  const alerts = useMemo(() => {
    return items
      .filter((i) => i.status === "pendiente")
      .map((i) => ({ ...i, d: daysUntil(i.dueDate, todayIso) }))
      .filter((i) => i.d <= (i.alertDays ?? 7))
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
        body: JSON.stringify(payload(form)),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message || "No se pudo guardar");
      }
      setForm(emptyForm(todayIso));
      setTab("listado");
      setNotice("Ítem creado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(it: Item) {
    setEditing(it);
    setEditError(null);
    setEditForm({
      title: it.title,
      itemType: it.itemType,
      dueDate: it.dueDate,
      amount: it.amount || "",
      responsibleName: it.responsibleName || "",
      notes: cleanNotes(it.notes),
      alertDays: it.alertDays ?? 7,
    });
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`${API}/administracion/${editing.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload(editForm)),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message || "No se pudo guardar");
      }
      setEditing(null);
      setNotice("Cambios guardados.");
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setEditSaving(false);
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
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message || "No se pudo actualizar");
      }
      setNotice(`Marcado como ${statusLabel(status).toLowerCase()}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function onDelete(id: number) {
    if (!confirm("¿Eliminar este ítem? No se puede deshacer.")) return;
    try {
      const res = await fetch(`${API}/administracion/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message || "No se pudo eliminar");
      }
      if (editing?.id === id) setEditing(null);
      setNotice("Ítem eliminado.");
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
      const body = (await res.json().catch(() => ({}))) as { message?: string; created?: number; skipped?: number };
      if (!res.ok) throw new Error(body.message || "No se pudo generar");
      const created = body.created ?? 0;
      const skipped = body.skipped ?? 0;
      const period = `${MONTH_NAMES[month - 1]} ${year}`;
      setNotice(
        created === 0
          ? `${period}: no se creó nada nuevo (${skipped} ya existían).`
          : `${period}: ${created} vencimiento${created === 1 ? "" : "s"} creado${created === 1 ? "" : "s"}${skipped ? `, ${skipped} ya existían` : ""}.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setFiscalBusy(false);
    }
  }

  function renderFields(f: FormState, setF: (x: FormState) => void) {
    return (
      <>
        <label className="field"><span className="field-label">Título</span>
          <input className="input" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <label className="field"><span className="field-label">Tipo</span>
            <select className="select" value={f.itemType} onChange={(e) => setF({ ...f, itemType: e.target.value })}>
              {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              {f.itemType === "liquidacion" && <option value="liquidacion">Liquidación</option>}
            </select>
          </label>
          <label className="field"><span className="field-label">Fecha</span>
            <input className="input" type="date" required value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
          </label>
          <label className="field"><span className="field-label">Monto (opcional)</span>
            <input className="input" inputMode="decimal" placeholder="Ej: 150.000,00" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </label>
          <label className="field"><span className="field-label">Responsable</span>
            <input className="input" value={f.responsibleName} onChange={(e) => setF({ ...f, responsibleName: e.target.value })} />
          </label>
          <label className="field"><span className="field-label">Avisar con (días)</span>
            <input className="input" type="number" min={0} max={90} value={f.alertDays} onChange={(e) => setF({ ...f, alertDays: Math.max(0, Number(e.target.value) || 0) })} />
          </label>
        </div>
        <label className="field"><span className="field-label">Notas</span>
          <textarea className="textarea" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </label>
      </>
    );
  }

  return (
    <div className="adm-page" style={{ padding: "20px 24px 40px", display: "flex", flexDirection: "column", gap: 16, maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}>
      <div className="adm-header" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
        <div>
          <div className="eyebrow">Operación / Administración</div>
          <h1 className="page-title">Administración</h1>
          <p className="page-subtitle">Control de vencimientos, pagos y recordatorios — reemplazo del control en papel.</p>
        </div>
        <div className="adm-tabs" role="tablist">
          <button type="button" className={`adm-tab${tab === "listado" ? " is-active" : ""}`} onClick={() => setTab("listado")}>Listado</button>
          <button type="button" className={`adm-tab${tab === "calendario" ? " is-active" : ""}`} onClick={() => setTab("calendario")}>Calendario</button>
          {canWrite && (
            <button type="button" className={`adm-tab${tab === "nuevo" ? " is-active" : ""}`} onClick={() => setTab("nuevo")}>+ Nuevo</button>
          )}
        </div>
      </div>

      {error && (
        <div className="form-error" role="alert" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <span>{error}</span>
          <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => setError(null)}>Cerrar</button>
        </div>
      )}
      {notice && (
        <div role="status" style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid hsl(150 45% 75%)", background: "hsl(150 60% 95%)", color: "hsl(150 60% 22%)", fontSize: 13, fontWeight: 600 }}>
          {notice}
        </div>
      )}

      {canWrite && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <p className="page-subtitle" style={{ margin: 0, maxWidth: 520 }}>
            Genera los vencimientos del mes según el portal ARCA de este CUIT. Si la fecha cae en fin de semana o feriado, pasa al siguiente día hábil.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setFiscalPicker(true)} disabled={fiscalBusy}>
            {fiscalBusy ? "Generando…" : "Generar vencimientos"}
          </button>
        </div>
      )}

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
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className="select" style={{ minWidth: 140 }} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="todos">Todos los tipos</option>
              {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
                    <th style={{ textAlign: "left", padding: 10, fontSize: 11 }}>Monto</th>
                    <th style={{ textAlign: "left", padding: 10, fontSize: 11 }}>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: "center", padding: 28, color: "hsl(var(--muted-foreground))" }}>Sin ítems.</td></tr>
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
                          <td style={{ padding: 12, whiteSpace: "nowrap" }}>{it.amount || "—"}</td>
                          <td style={{ padding: 12 }}>{statusLabel(it.status)}</td>
                          <td style={{ padding: 12, textAlign: "right", whiteSpace: "nowrap" }}>
                            {canWrite && (
                              <div style={{ display: "inline-flex", gap: 6 }}>
                                {it.status === "pendiente" ? (
                                  <button type="button" className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => void setStatus(it.id, "cumplido")}>Cumplido</button>
                                ) : (
                                  <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => void setStatus(it.id, "pendiente")}>Reabrir</button>
                                )}
                                <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => openEdit(it)}>Editar</button>
                                <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => void onDelete(it.id)}>Eliminar</button>
                              </div>
                            )}
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
        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 420px) minmax(240px, 1fr)", gap: 20, alignItems: "start", maxWidth: 960 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button type="button" className="btn btn-quiet" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>←</button>
                <span style={{ fontWeight: 800, textTransform: "capitalize", minWidth: 140, textAlign: "center" }}>{monthLabel}</span>
                <button type="button" className="btn btn-quiet" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>→</button>
              </div>
              <span className="page-subtitle" style={{ margin: 0 }}>Número = pendientes · rojo = vencido</span>
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
                const overdue = pending.length > 0 && cell.iso < todayIso;
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
                        background: overdue ? "hsl(0 72% 45%)" : "hsl(var(--primary))", color: overdue ? "#fff" : "hsl(var(--primary-foreground))",
                      }}>{pending.length}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card" style={{ padding: 18, minHeight: 280 }}>
            {!selectedDay ? (
              <div>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Detalle del día</div>
                <p className="page-subtitle" style={{ margin: 0 }}>Hacé clic en un día del calendario para ver vencimientos y recordatorios.</p>
              </div>
            ) : (
              <div>
                <div style={{ fontWeight: 800, marginBottom: 12, textTransform: "capitalize" }}>
                  {new Date(selectedDay + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
                </div>
                {(byDate.get(selectedDay) || []).length === 0 && (
                  <p className="page-subtitle">Sin ítems este día.</p>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(byDate.get(selectedDay) || []).map((it) => (
                    <div key={it.id} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{it.title}{it.source === "fiscal" ? " · Fiscal" : ""}</div>
                      <div className="page-subtitle" style={{ marginTop: 2 }}>
                        {typeLabel(it.itemType)} · {statusLabel(it.status)}{it.amount ? ` · ${it.amount}` : ""}{it.responsibleName ? ` · ${it.responsibleName}` : ""}
                      </div>
                      {cleanNotes(it.notes) && (
                        <div style={{ marginTop: 6, fontSize: 12, whiteSpace: "pre-wrap", color: "hsl(var(--muted-foreground))" }}>{cleanNotes(it.notes)}</div>
                      )}
                      {canWrite && (
                        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                          {it.status === "pendiente" && (
                            <button type="button" className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => void setStatus(it.id, "cumplido")}>Marcar cumplido</button>
                          )}
                          <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => openEdit(it)}>Editar</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "nuevo" && canWrite && (
        <form className="card" style={{ padding: 18, maxWidth: 560, display: "grid", gap: 12 }} onSubmit={onSave}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Nuevo ítem</h2>
          {renderFields(form, setForm)}
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button>
        </form>
      )}

      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "grid", placeItems: "center", zIndex: 80, padding: 16 }} onClick={() => setEditing(null)}>
          <form className="card" style={{ width: "min(560px, 100%)", maxHeight: "90vh", overflowY: "auto", padding: 20, display: "grid", gap: 12 }} onClick={(e) => e.stopPropagation()} onSubmit={onSaveEdit}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Editar ítem{editing.source === "fiscal" ? " · Fiscal" : ""}</h2>
            {editError && <div className="form-error">{editError}</div>}
            {renderFields(editForm, setEditForm)}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-quiet" onClick={() => void onDelete(editing.id)}>Eliminar</button>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn btn-quiet" onClick={() => setEditing(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={editSaving}>{editSaving ? "Guardando…" : "Guardar cambios"}</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {fiscalPicker && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "grid", placeItems: "center", zIndex: 80, padding: 16 }} onClick={() => setFiscalPicker(false)}>
          <div className="card" style={{ width: "min(400px, 100%)", padding: 20 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 800 }}>Generar vencimientos</h2>
            <p className="page-subtitle">Elegí el mes a generar según el calendario del portal ARCA.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
              <label className="field"><span className="field-label">Mes</span>
                <select className="select" value={fiscalMonth} onChange={(e) => setFiscalMonth(Number(e.target.value))}>
                  {MONTH_NAMES.map((name, i) => (
                    <option key={name} value={i + 1}>{name}</option>
                  ))}
                </select>
              </label>
              <label className="field"><span className="field-label">Año</span>
                <input className="input" type="number" min={2020} max={2100} value={fiscalYear} onChange={(e) => setFiscalYear(Number(e.target.value) || new Date().getFullYear())} />
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
