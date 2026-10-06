import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Sector = { id: number; name: string; active?: boolean };
type Doc = {
  id: number;
  title: string;
  sectorId: number | null;
  sectorName: string | null;
  filePath: string;
  version: string;
  publishedAt: string;
};

const API = "/api";

export default function InstructivosPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterSector, setFilterSector] = useState("todos");
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<Doc | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", filePath: "", version: "1.0", sectorId: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (filterSector !== "todos") q.set("sectorId", filterSector);
      const [rDocs, rSec] = await Promise.all([
        fetch(`${API}/instructivos?${q}`, { credentials: "include" }),
        fetch(`${API}/sectores`, { credentials: "include" }),
      ]);
      if (!rDocs.ok) throw new Error("No se pudo cargar instructivos");
      const data = await rDocs.json();
      setDocs(Array.isArray(data) ? data : []);
      if (rSec.ok) {
        const sec = await rSec.json();
        setSectors(Array.isArray(sec) ? sec.filter((s: Sector) => s.active !== false) : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [filterSector]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => d.title.toLowerCase().includes(q) || (d.sectorName || "").toLowerCase().includes(q));
  }, [docs, search]);

  function openCreate() {
    setEditing(null);
    setForm({ title: "", filePath: "", version: "1.0", sectorId: "" });
    setModal("create");
  }
  function openEdit(doc: Doc) {
    setEditing(doc);
    setForm({
      title: doc.title,
      filePath: doc.filePath,
      version: doc.version || "1.0",
      sectorId: doc.sectorId != null ? String(doc.sectorId) : "",
    });
    setModal("edit");
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: form.title.trim(),
        filePath: form.filePath.trim(),
        version: form.version.trim() || "1.0",
        sectorId: form.sectorId ? Number(form.sectorId) : null,
      };
      const res =
        modal === "edit" && editing
          ? await fetch(`${API}/instructivos/${editing.id}`, {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await fetch(`${API}/instructivos`, {
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
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: number) {
    if (!confirm("¿Eliminar este instructivo?")) return;
    try {
      const res = await fetch(`${API}/instructivos/${id}`, { method: "DELETE", credentials: "include" });
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
          <div className="eyebrow">Operación / Instructivos</div>
          <h1 className="page-title">Instructivos</h1>
          <p className="page-subtitle">Repositorio de documentos formales por sector (PDF o enlace interno).</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>+ Nuevo instructivo</button>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="card adm-list-card">
        <div className="adm-toolbar">
          <input className="input" placeholder="Buscar por título o sector…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="select" value={filterSector} onChange={(e) => setFilterSector(e.target.value)}>
            <option value="todos">Todos los sectores</option>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button type="button" className="btn btn-quiet" onClick={() => void load()}>Actualizar</button>
        </div>

        {loading ? (
          <div className="skeleton" style={{ height: 180 }} />
        ) : (
          <div className="agenda-table-wrap">
            <table className="agenda-table adm-table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Sector</th>
                  <th>Versión</th>
                  <th>Documento</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: 28, color: "hsl(var(--muted-foreground))" }}>
                      Sin instructivos cargados.
                    </td>
                  </tr>
                ) : (
                  filtered.map((d) => (
                    <tr key={d.id}>
                      <td className="agenda-title">{d.title}</td>
                      <td>{d.sectorName || "General"}</td>
                      <td><span className="font-mono">{d.version}</span></td>
                      <td>
                        <a href={d.filePath} target="_blank" rel="noreferrer" style={{ color: "hsl(var(--primary))", fontWeight: 600 }}>
                          Abrir
                        </a>
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => openEdit(d)}>Editar</button>
                        <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => void onDelete(d.id)}>Eliminar</button>
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
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{modal === "create" ? "Nuevo instructivo" : "Editar instructivo"}</h2>
            <label className="field"><span className="field-label">Título</span>
              <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label className="field"><span className="field-label">Ruta o enlace del PDF</span>
              <input className="input" required placeholder="https://… o /archivos/protocolo.pdf" value={form.filePath} onChange={(e) => setForm({ ...form, filePath: e.target.value })} />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label className="field"><span className="field-label">Versión</span>
                <input className="input" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
              </label>
              <label className="field"><span className="field-label">Sector</span>
                <select className="select" value={form.sectorId} onChange={(e) => setForm({ ...form, sectorId: e.target.value })}>
                  <option value="">General</option>
                  {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            </div>
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
