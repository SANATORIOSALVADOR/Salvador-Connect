import { FormEvent, useCallback, useEffect, useState } from "react";
import { Check, Shield } from "lucide-react";

type Sector = { id: number; name: string; shortName: string; active: boolean };
type UserRow = {
  id: number;
  username: string;
  name: string;
  role: string;
  active: boolean;
  modules?: string[];
  sectorIds?: number[];
};

const API = "/api";

const MODULES = [
  { key: "dashboard", label: "Resumen" },
  { key: "administracion", label: "Administración" },
  { key: "guardias", label: "Guardias Médicas" },
  { key: "inventario", label: "Inventario" },
  { key: "instructivos", label: "Instructivos" },
  { key: "liquidacion", label: "Liquidación" },
  { key: "configuracion", label: "Configuración" },
  { key: "usuarios", label: "Usuarios" },
] as const;

const NIVELES = [
  { id: "usuario" as const, nivel: "Nivel 1", title: "Solo lectura", desc: "Consulta módulos asignados. No crea ni elimina." },
  { id: "responsable" as const, nivel: "Nivel 2", title: "Operativo", desc: "Puede crear, editar y eliminar en sus módulos." },
  { id: "nivel3" as const, nivel: "Nivel 3", title: "Ampliado", desc: "Máximo alcance operativo en todos los módulos marcados." },
];

export default function ConfiguracionPage() {
  const [tab, setTab] = useState<"sectores" | "permisos">("sectores");
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<Sector | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", shortName: "", active: true });

  const [users, setUsers] = useState<UserRow[]>([]);
  const [permUser, setPermUser] = useState<UserRow | null>(null);
  const [permForm, setPermForm] = useState({
    role: "usuario" as "usuario" | "responsable" | "nivel3",
    modules: ["dashboard"] as string[],
    sectorIds: [] as number[],
  });
  const [permError, setPermError] = useState("");
  const [permNotice, setPermNotice] = useState("");
  const [permSaving, setPermSaving] = useState(false);

  const loadSectors = useCallback(async () => {
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

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch(`${API}/users`, { credentials: "include" });
      if (!res.ok) throw new Error("No se pudieron cargar usuarios");
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    void loadSectors();
    void loadUsers();
  }, [loadSectors, loadUsers]);

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

  async function onSaveSector(e: FormEvent) {
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
      if (!res.ok) throw new Error((body as { message?: string }).message || "No se pudo guardar");
      setModal(null);
      await loadSectors();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteSector(id: number) {
    if (!confirm("¿Eliminar este sector?")) return;
    const res = await fetch(`${API}/sectores/${id}`, { method: "DELETE", credentials: "include" });
    if (!res.ok) {
      setError("No se pudo eliminar el sector");
      return;
    }
    await loadSectors();
  }

  function openPermisos(u: UserRow) {
    if (u.role === "superadmin") return;
    setPermUser(u);
    setPermError("");
    setPermForm({
      role: u.role === "responsable" ? "responsable" : "usuario",
      modules: u.modules?.length ? [...u.modules] : ["dashboard"],
      sectorIds: u.sectorIds ? [...u.sectorIds] : [],
    });
  }

  function toggleModule(key: string) {
    setPermForm((prev) => {
      if (key === "dashboard" && prev.modules.length === 1 && prev.modules[0] === "dashboard") return prev;
      let modules = prev.modules.includes(key)
        ? prev.modules.filter((m) => m !== key)
        : [...prev.modules, key];
      if (!modules.includes("dashboard")) modules = ["dashboard", ...modules];
      return { ...prev, modules };
    });
  }

  function toggleSector(id: number) {
    setPermForm((prev) => ({
      ...prev,
      sectorIds: prev.sectorIds.includes(id)
        ? prev.sectorIds.filter((s) => s !== id)
        : [...prev.sectorIds, id],
    }));
  }

  async function savePermisos(e: FormEvent) {
    e.preventDefault();
    if (!permUser) return;
    setPermSaving(true);
    setPermError("");
    try {
      const role = permForm.role === "usuario" ? "usuario" : "responsable";
      const modules =
        permForm.role === "nivel3"
          ? MODULES.map((m) => m.key)
          : permForm.modules.length
            ? permForm.modules
            : ["dashboard"];

      const res = await fetch(`${API}/users/${permUser.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, modules, sectorIds: permForm.sectorIds }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { message?: string }).message || "No se pudo guardar permisos");
      setPermUser(null);
      setPermNotice(`Permisos actualizados para ${permUser.name}.`);
      await loadUsers();
    } catch (err) {
      setPermError(err instanceof Error ? err.message : "Error");
    } finally {
      setPermSaving(false);
    }
  }

  const chip = (on: boolean): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    font: "inherit",
    color: "inherit",
    border: on ? "2px solid hsl(var(--primary))" : "1px solid hsl(var(--border))",
    background: on ? "hsl(var(--primary) / .1)" : "transparent",
  });

  return (
    <div className="content-wrap" style={{ padding: "20px 24px 40px", boxSizing: "border-box" }}>
      <div className="eyebrow">Espacio / Configuración</div>
      <h1 className="page-title">Configuración</h1>
      <p className="page-subtitle">Sectores del sanatorio y permisos de usuarios.</p>

      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <button type="button" className={tab === "sectores" ? "btn btn-primary" : "btn btn-quiet"} onClick={() => setTab("sectores")}>
          Sectores
        </button>
        <button type="button" className={tab === "permisos" ? "btn btn-primary" : "btn btn-quiet"} onClick={() => setTab("permisos")}>
          Permisos de usuarios
        </button>
      </div>

      {permNotice ? (
        <div className="card" style={{ marginTop: 14, padding: "12px 16px", display: "flex", justifyContent: "space-between", background: "hsl(150 40% 95%)" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{permNotice}</span>
          <button type="button" className="btn btn-quiet" onClick={() => setPermNotice("")}>Cerrar</button>
        </div>
      ) : null}

      {tab === "sectores" ? (
        <div className="card" style={{ marginTop: 16, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Sectores</h2>
            <button type="button" className="btn btn-primary" onClick={openCreate}>Nuevo sector</button>
          </div>
          {error ? <div style={{ color: "hsl(0 55% 40%)", fontSize: 13, marginBottom: 10 }}>{error}</div> : null}
          {loading ? (
            <div style={{ padding: 20, textAlign: "center" }}>Cargando…</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                  <th style={{ textAlign: "left", padding: 10 }}>Nombre</th>
                  <th style={{ textAlign: "left", padding: 10 }}>Abrev.</th>
                  <th style={{ textAlign: "left", padding: 10 }}>Estado</th>
                  <th style={{ textAlign: "right", padding: 10 }}></th>
                </tr>
              </thead>
              <tbody>
                {sectors.map((s) => (
                  <tr key={s.id} style={{ borderBottom: "1px solid hsl(var(--border) / .5)" }}>
                    <td style={{ padding: 10, fontWeight: 600 }}>{s.name}</td>
                    <td style={{ padding: 10 }}>{s.shortName}</td>
                    <td style={{ padding: 10 }}>{s.active ? "Activo" : "Inactivo"}</td>
                    <td style={{ padding: 10, textAlign: "right" }}>
                      <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => openEdit(s)}>Editar</button>
                      <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => void onDeleteSector(s.id)}>Eliminar</button>
                    </td>
                  </tr>
                ))}
                {!sectors.length && (
                  <tr><td colSpan={4} style={{ padding: 24, textAlign: "center", opacity: 0.6 }}>Sin sectores</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="card" style={{ marginTop: 16, padding: 16 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800 }}>
            <Shield size={16} style={{ verticalAlign: -2, marginRight: 6 }} />
            Permisos, módulos y sectores
          </h2>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: "hsl(var(--muted-foreground))", lineHeight: 1.45 }}>
            Elegí un usuario: <strong>nivel (1–3)</strong>, <strong>módulos</strong> visibles y <strong>sectores</strong> a cargo (opcional).
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                <th style={{ textAlign: "left", padding: 10 }}>Usuario</th>
                <th style={{ textAlign: "left", padding: 10 }}>Nivel</th>
                <th style={{ textAlign: "left", padding: 10 }}>Módulos</th>
                <th style={{ textAlign: "right", padding: 10 }}></th>
              </tr>
            </thead>
            <tbody>
              {users.filter((u) => u.role !== "superadmin").map((u) => (
                <tr key={u.id} style={{ borderBottom: "1px solid hsl(var(--border) / .5)" }}>
                  <td style={{ padding: 10 }}>
                    <div style={{ fontWeight: 600 }}>{u.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>@{u.username}</div>
                  </td>
                  <td style={{ padding: 10 }}>
                    {u.role === "responsable" ? "Nivel 2 · Operativo" : "Nivel 1 · Solo lectura"}
                  </td>
                  <td style={{ padding: 10, fontSize: 12 }}>
                    {(u.modules || []).map((k) => MODULES.find((m) => m.key === k)?.label || k).join(", ") || "—"}
                  </td>
                  <td style={{ padding: 10, textAlign: "right" }}>
                    <button type="button" className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => openPermisos(u)}>
                      Configurar
                    </button>
                  </td>
                </tr>
              ))}
              {!users.filter((u) => u.role !== "superadmin").length && (
                <tr><td colSpan={4} style={{ padding: 24, textAlign: "center", opacity: 0.6 }}>Creá usuarios en el módulo Usuarios.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "grid", placeItems: "center", zIndex: 80, padding: 16 }} onClick={() => setModal(null)}>
          <form className="card" style={{ width: "min(420px, 100%)", padding: 20, display: "grid", gap: 12 }} onClick={(e) => e.stopPropagation()} onSubmit={onSaveSector}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{modal === "create" ? "Nuevo sector" : "Editar sector"}</h2>
            <label className="field"><span className="field-label">Nombre</span>
              <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="field"><span className="field-label">Abreviatura</span>
              <input className="input" value={form.shortName} onChange={(e) => setForm({ ...form, shortName: e.target.value })} />
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

      {permUser && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 80, padding: 16 }} onClick={() => setPermUser(null)}>
          <form className="card" style={{ width: "min(560px, 100%)", maxHeight: "92vh", overflowY: "auto", padding: 22, display: "flex", flexDirection: "column", gap: 16 }} onClick={(e) => e.stopPropagation()} onSubmit={savePermisos}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "hsl(var(--muted-foreground))" }}>Permisos</div>
              <h2 style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 800 }}>
                {permUser.name} <span style={{ fontWeight: 500, opacity: 0.7 }}>@{permUser.username}</span>
              </h2>
            </div>
            {permError ? (
              <div style={{ padding: 12, borderRadius: 10, background: "hsl(0 70% 95%)", color: "hsl(0 55% 32%)", fontSize: 13, fontWeight: 600 }}>{permError}</div>
            ) : null}

            <div>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>Nivel de permiso</div>
              <div style={{ display: "grid", gap: 8 }}>
                {NIVELES.map((n) => {
                  const on = permForm.role === n.id;
                  return (
                    <button key={n.id} type="button" onClick={() => setPermForm((p) => ({ ...p, role: n.id }))} style={{
                      textAlign: "left", padding: 12, borderRadius: 12, cursor: "pointer", font: "inherit", color: "inherit",
                      border: on ? "2px solid hsl(var(--primary))" : "1px solid hsl(var(--border))",
                      background: on ? "hsl(var(--primary) / .08)" : "hsl(var(--card))",
                    }}>
                      <div style={{ fontWeight: 800, fontSize: 13 }}>{n.nivel} · {n.title}</div>
                      <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginTop: 4 }}>{n.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>Módulos visibles</div>
              <p style={{ margin: "0 0 10px", fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                Solo estos aparecen en el menú. Resumen siempre queda.
                {permForm.role === "nivel3" ? " Nivel 3 habilita todos al guardar." : ""}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {MODULES.map((m) => {
                  const on = permForm.role === "nivel3" || permForm.modules.includes(m.key);
                  return (
                    <button key={m.key} type="button" disabled={permForm.role === "nivel3"} onClick={() => toggleModule(m.key)} style={chip(on)}>
                      {on ? <Check size={12} strokeWidth={3} /> : null}{m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>
                Sectores a cargo <span style={{ fontWeight: 500, opacity: 0.6 }}>(opcional)</span>
              </div>
              <p style={{ margin: "0 0 10px", fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                Vacío = sin filtro por sector.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {sectors.filter((s) => s.active).map((s) => {
                  const on = permForm.sectorIds.includes(s.id);
                  return (
                    <button key={s.id} type="button" onClick={() => toggleSector(s.id)} style={chip(on)}>
                      {on ? <Check size={12} strokeWidth={3} /> : null}{s.name}
                    </button>
                  );
                })}
                {!sectors.filter((s) => s.active).length && (
                  <span style={{ fontSize: 12, opacity: 0.6 }}>No hay sectores activos.</span>
                )}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 8, borderTop: "1px solid hsl(var(--border))" }}>
              <button type="button" className="btn btn-quiet" onClick={() => setPermUser(null)} disabled={permSaving}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={permSaving}>{permSaving ? "Guardando…" : "Guardar permisos"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
