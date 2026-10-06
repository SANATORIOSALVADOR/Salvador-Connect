import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Sector = { id: number; name: string; shortName?: string; active?: boolean };
type Item = {
  id: number;
  name: string;
  category: string;
  serialNumber: string | null;
  status: string;
  sectorId: number | null;
  sectorName: string | null;
  locationNote: string;
  acquiredAt: string | null;
};

const API = "/api";
const CATEGORIES = [
  { value: "equipo_medico", label: "Equipo médico" },
  { value: "informatico", label: "Informático" },
  { value: "mobiliario", label: "Mobiliario" },
  { value: "infraestructura", label: "Infraestructura" },
  { value: "otro", label: "Otro" },
];
const STATUSES = [
  { value: "activo", label: "Activo" },
  { value: "en_reparacion", label: "En reparación" },
  { value: "reservado", label: "Reservado" },
  { value: "baja", label: "Baja" },
];

function catLabel(v: string) {
  return CATEGORIES.find((c) => c.value === v)?.label ?? v;
}
function stLabel(v: string) {
  return STATUSES.find((s) => s.value === v)?.label ?? v;
}

export default function InventarioPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("activo");
  const [filterSector, setFilterSector] = useState("todos");
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "equipo_medico",
    serialNumber: "",
    status: "activo",
    sectorId: "",
    locationNote: "",
    acquiredAt: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (filterStatus !== "todos") q.set("status", filterStatus);
      if (filterSector !== "todos") q.set("sectorId", filterSector);
      const [rItems, rSec] = await Promise.all([
        fetch(`${API}/inventario?${q}`, { credentials: "include" }),
        fetch(`${API}/sectores`, { credentials: "include" }),
      ]);
      if (!rItems.ok) throw new Error("No se pudo cargar inventario");
      const data = await rItems.json();
      setItems(Array.isArray(data) ? data : []);
      if (rSec.ok) {
        const sec = await rSec.json();
        setSectors(Array.isArray(sec) ? sec.filter((s: Sector) => s.active !== false) : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterSector]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.serialNumber || "").toLowerCase().includes(q) ||
        (i.sectorName || "").toLowerCase().includes(q),
    );
  }, [items, search]);

  function openCreate() {
    setEditing(null);
    setForm({ name: "", category: "equipo_medico", serialNumber: "", status: "activo", sectorId: "", locationNote: "", acquiredAt: "" });
    setModal("create");
  }

  function openEdit(item: Item) {
    setEditing(item);
    setForm({
      name: item.name,
      category: item.category,
      serialNumber: item.serialNumber || "",
      status: item.status,
      sectorId: item.sectorId != null ? String(item.sectorId) : "",
      locationNote: item.locationNote || "",
      acquiredAt: item.acquiredAt || "",
    });
    setModal("edit");
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        serialNumber: form.serialNumber.trim() || null,
        status: form.status,
        sectorId: form.sectorId ? Number(form.sectorId) : null,
        locationNote: form.locationNote.trim(),
        acquiredAt: form.acquiredAt || null,
      };
      const res =
        modal === "edit" && editing
          ? await fetch(`${API}/inventario/${editing.id}`, {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await fetch(`${API}/inventario`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { message?: string }).message || "No se pudo guardar");
      setModal(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: number) {
    if (!confirm("¿Eliminar este activo?")) return;
    try {
      const res = await fetch(`${API}/inventario/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok && res.status !== 204) throw new Error("No se pudo eliminar");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <div className="adm-page">
      <div className="adm-header">
        <div>
          <div className="eyebrow">Operación / Inventario</div>
          <h1 className="page-title">Inventario de activos</h1>
          <p className="page-subtitle">Equipos y bienes fijos asignados a sectores. Los movimientos quedan registrados.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>+ Nuevo activo</button>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="card adm-list-card">
        <div className="adm-toolbar">
          <input className="input" placeholder="Buscar por nombre, serie o sector…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="todos">Todos los estados</option>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select className="select" value={filterSector} onChange={(e) => setFilterSector(e.target.value)}>
            <option value="todos">Todos los sectores</option>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button type="button" className="btn btn-quiet" onClick={() => void load()}>Actualizar</button>
        </div>

        {loading ? (
          <div className="skeleton" style={{ height: 200 }} />
        ) : (
          <div className="agenda-table-wrap">
            <table className="agenda-table adm-table">
              <thead>
                <tr>
                  <th>Activo</th>
                  <th>Categoría</th>
                  <th>Serie</th>
                  <th>Sector</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: 28, color: "hsl(var(--muted-foreground))" }}>
                      Sin activos. Creá el primero con <strong>+ Nuevo activo</strong>.
                    </td>
                  </tr>
                ) : (
                  filtered.map((it) => (
                    <tr key={it.id}>
                      <td>
                        <div className="agenda-title">{it.name}</div>
                        {it.locationNote ? <div className="adm-note-preview">{it.locationNote}</div> : null}
                      </td>
                      <td>{catLabel(it.category)}</td>
                      <td><span className="font-mono">{it.serialNumber || "—"}</span></td>
                      <td>{it.sectorName || "—"}</td>
                      <td>{stLabel(it.status)}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => openEdit(it)}>Editar</button>
                        <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => void onDelete(it.id)}>Eliminar</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "grid", placeItems: "center", zIndex: 80, padding: 16 }} onClick={() => setModal(null)}>
          <form className="card" style={{ width: "min(520px, 100%)", padding: 20, display: "grid", gap: 12 }} onClick={(e) => e.stopPropagation()} onSubmit={onSave}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{modal === "create" ? "Nuevo activo" : "Editar activo"}</h2>
            <label className="field"><span className="field-label">Nombre</span>
              <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label className="field"><span className="field-label">Categoría</span>
                <select className="select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </label>
              <label className="field"><span className="field-label">Estado</span>
                <select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
              <label className="field"><span className="field-label">Nº de serie</span>
                <input className="input" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
              </label>
              <label className="field"><span className="field-label">Sector</span>
                <select className="select" value={form.sectorId} onChange={(e) => setForm({ ...form, sectorId: e.target.value })}>
                  <option value="">Sin asignar</option>
                  {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="field"><span className="field-label">Fecha de alta</span>
                <input className="input" type="date" value={form.acquiredAt} onChange={(e) => setForm({ ...form, acquiredAt: e.target.value })} />
              </label>
            </div>
            <label className="field"><span className="field-label">Ubicación / nota</span>
              <input className="input" value={form.locationNote} onChange={(e) => setForm({ ...form, locationNote: e.target.value })} placeholder="Ej. Quirofano 2 · rack A" />
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-quiet" onClick={() => setModal(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
