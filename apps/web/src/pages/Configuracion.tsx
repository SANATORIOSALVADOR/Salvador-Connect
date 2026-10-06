import { FormEvent, useCallback, useEffect, useState } from "react";

type Sector = { id: number; name: string; shortName: string; active: boolean };

const API = "/api";

export default function ConfiguracionPage() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<Sector | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", shortName: "", active: true });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/sectores`, { credentials: "include" });
      if (!res.ok) throw new Error("No se pudieron cargar los sectores");
      const data = await res.json();
      setSectors(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setSectors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ name: "", shortName: "", active: true });
    setModal("create");
  }
  function openEdit(s: Sector) {
    setEditing(s);
    setForm({ name: s.name, shortName: s.shortName, active: s.active });
    setModal("edit");
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        shortName: form.shortName.trim() || form.name.trim().slice(0, 8),
        active: form.active,
      };
      const res =
        modal === "edit" && editing
          ? await fetch(`${API}/sectores/${editing.id}`, {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await fetch(`${API}/sectores`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { message?: string }).message || "No se pudo guardar (¿sos superadmin?)");
      setModal(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: number) {
    if (!confirm("¿Eliminar este sector? Solo si no está en uso.")) return;
    try {
      const res = await fetch(`${API}/sectores/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message || "No se pudo eliminar");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <div className="adm-page">
      <div className="adm-header">
        <div>
          <div className="eyebrow">Espacio / Configuración</div>
          <h1 className="page-title">Configuración</h1>
          <p className="page-subtitle">Sectores del sanatorio. Solo el superadmin puede crear o modificar.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>+ Nuevo sector</button>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="card adm-list-card">
        {loading ? (
          <div className="skeleton" style={{ height: 160 }} />
        ) : (
          <div className="agenda-table-wrap">
            <table className="agenda-table adm-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Abreviatura</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sectors.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: 28, color: "hsl(var(--muted-foreground))" }}>
                      No hay sectores. Creá Guardia Central, UTI, etc.
                    </td>
                  </tr>
                ) : (
                  sectors.map((s) => (
                    <tr key={s.id}>
                      <td className="agenda-title">{s.name}</td>
                      <td><span className="font-mono">{s.shortName}</span></td>
                      <td>{s.active ? "Activo" : "Inactivo"}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => openEdit(s)}>Editar</button>
                        <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => void onDelete(s.id)}>Eliminar</button>
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
          <form className="card" style={{ width: "min(420px, 100%)", padding: 20, display: "grid", gap: 12 }} onClick={(e) => e.stopPropagation()} onSubmit={onSave}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{modal === "create" ? "Nuevo sector" : "Editar sector"}</h2>
            <label className="field"><span className="field-label">Nombre</span>
              <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej. Guardia Central" />
            </label>
            <label className="field"><span className="field-label">Abreviatura</span>
              <input className="input" value={form.shortName} onChange={(e) => setForm({ ...form, shortName: e.target.value })} placeholder="Ej. GC" />
            </label>
            <label className="field"><span className="field-label">Estado</span>
              <select className="select" value={form.active ? "1" : "0"} onChange={(e) => setForm({ ...form, active: e.target.value === "1" })}>
                <option value="1">Activo</option>
                <option value="0">Inactivo</option>
              </select>
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
