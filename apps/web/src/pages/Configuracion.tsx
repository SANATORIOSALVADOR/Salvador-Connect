import { FormEvent, useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import AparienciaConfig from "./shared/AparienciaConfig";

// Configuración: secciones Usuarios (ABM + permisos por módulo) y Sectores. Solo superadmin.

const API = "/api";

type Level = "ver" | "editar" | "total";
type Sector = { id: number; name: string; shortName: string; active: boolean };
type UserRow = {
  id: number;
  username: string;
  name: string;
  email: string | null;
  role: "superadmin" | "usuario";
  legacyRole: string | null;
  active: boolean;
  mustChangePassword: boolean;
  permissions: Record<string, Level>;
  sectorIds: number[];
  lastLoginAt: string | null;
  createdAt: string;
};

const LEVEL_LABEL: Record<Level, string> = { ver: "Ver", editar: "Cargar y editar", total: "Control total" };
const LEVEL_COLOR: Record<Level, { bg: string; fg: string }> = {
  ver: { bg: "hsl(220 15% 92%)", fg: "hsl(220 20% 30%)" },
  editar: { bg: "hsl(215 80% 92%)", fg: "hsl(215 70% 32%)" },
  total: { bg: "hsl(155 55% 88%)", fg: "hsl(155 60% 24%)" },
};

/** Qué permite cada nivel en cada módulo (debe coincidir con los controles de la API). */
const MODULES: { key: string; label: string; levels: Level[]; can: Partial<Record<Level, string>> }[] = [
  { key: "dashboard", label: "Resumen", levels: ["ver"], can: { ver: "Ver el tablero: vencimientos próximos, guardias de hoy y actividad reciente." } },
  {
    key: "administracion",
    label: "Administración",
    levels: ["ver", "editar", "total"],
    can: {
      ver: "Ver el listado, el calendario y los avisos de vencimientos.",
      editar: "Además: crear y modificar ítems, marcarlos como cumplidos o reabrirlos.",
      total: "Además: eliminar ítems y generar los vencimientos fiscales del mes.",
    },
  },
  {
    key: "guardias",
    label: "Guardias Médicas",
    levels: ["ver", "editar", "total"],
    can: {
      ver: "Ver calendario, quién está de guardia ahora, registro y estadísticas; exportar CSV.",
      editar: "Además: cargar y modificar guardias, copiar semana o mes, ver el historial de cambios.",
      total: "Además: eliminar guardias y configurar horarios de sectores y datos de profesionales.",
    },
  },
  {
    key: "inventario",
    label: "Inventario",
    levels: ["ver", "editar", "total"],
    can: { ver: "Ver activos y movimientos.", editar: "Además: dar de alta y modificar activos.", total: "Además: eliminar activos." },
  },
  {
    key: "instructivos",
    label: "Instructivos",
    levels: ["ver", "editar", "total"],
    can: { ver: "Ver y consultar instructivos.", editar: "Además: publicar y modificar instructivos.", total: "Además: eliminar instructivos." },
  },
  { key: "liquidacion", label: "Liquidación", levels: ["ver"], can: { ver: "Ver el módulo (en desarrollo)." } },
];

const CARD: CSSProperties = { padding: 16, borderRadius: 14 };
const MUTED: CSSProperties = { fontSize: 12, color: "hsl(var(--muted-foreground))" };
const OVERLAY: CSSProperties = { position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 90, padding: "40px 16px", overflowY: "auto" };
const CHIP = (bg: string, fg: string): CSSProperties => ({ display: "inline-block", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: bg, color: fg, whiteSpace: "nowrap" });

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message || `Error ${res.status}`);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

function randomPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const arr = new Uint32Array(10);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

function fmtDate(iso: string | null) {
  if (!iso) return "Nunca";
  return new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

type UserForm = {
  name: string;
  username: string;
  email: string;
  password: string;
  active: boolean;
  role: "superadmin" | "usuario";
  permissions: Record<string, Level>;
  sectorIds: number[];
};

function emptyUserForm(): UserForm {
  return { name: "", username: "", email: "", password: randomPassword(), active: true, role: "usuario", permissions: { dashboard: "ver" }, sectorIds: [] };
}

function PermChips({ u }: { u: UserRow }) {
  if (u.role === "superadmin") return <span style={CHIP("hsl(270 60% 92%)", "hsl(270 50% 32%)")}>Todo + administración</span>;
  const list = MODULES.filter((m) => u.permissions[m.key]);
  if (!list.length) return <span style={MUTED}>Sin acceso a módulos</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {list.map((m) => {
        const lvl = u.permissions[m.key];
        const c = LEVEL_COLOR[lvl];
        return (
          <span key={m.key} style={CHIP(c.bg, c.fg)} title={`${m.label}: ${LEVEL_LABEL[lvl]}`}>
            {m.label} · {LEVEL_LABEL[lvl]}
          </span>
        );
      })}
    </div>
  );
}

export default function ConfiguracionPage() {
  const [section, setSection] = useState<"usuarios" | "sectores" | "apariencia">("usuarios");
  const [me, setMe] = useState<{ id: number; role: string } | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // usuarios
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "activos" | "inactivos">("activos");
  const [editor, setEditor] = useState<{ mode: "create" | "edit"; user?: UserRow } | null>(null);
  const [uform, setUform] = useState<UserForm>(emptyUserForm);
  const [uerror, setUerror] = useState<string | null>(null);
  const [usaving, setUsaving] = useState(false);
  const [resetUser, setResetUser] = useState<UserRow | null>(null);
  const [resetPw, setResetPw] = useState("");

  // sectores
  const [sectorEditor, setSectorEditor] = useState<{ mode: "create" | "edit"; sector?: Sector } | null>(null);
  const [sform, setSform] = useState({ name: "", shortName: "", active: true });

  const isSuperadmin = me?.role === "superadmin";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meData = await apiJson<{ id: number; role: string }>("/auth/me");
      setMe(meData);
      if (meData.role !== "superadmin") return;
      const [u, s] = await Promise.all([apiJson<UserRow[]>("/users"), apiJson<Sector[]>("/sectores")]);
      setUsers(Array.isArray(u) ? u : []);
      setSectors(Array.isArray(s) ? s : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar la configuración");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(t);
  }, [notice]);

  const sectorName = useMemo(() => new Map(sectors.map((s) => [s.id, s.name])), [sectors]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(
      (u) =>
        (statusFilter === "todos" || (statusFilter === "activos" ? u.active : !u.active)) &&
        (!q || `${u.name} ${u.username} ${u.email || ""}`.toLowerCase().includes(q)),
    );
  }, [users, search, statusFilter]);

  // ---------- usuarios ----------

  function openCreate() {
    setUform(emptyUserForm());
    setUerror(null);
    setEditor({ mode: "create" });
  }

  function openEditUser(u: UserRow) {
    setUform({ name: u.name, username: u.username, email: u.email || "", password: "", active: u.active, role: u.role, permissions: { ...u.permissions }, sectorIds: [...u.sectorIds] });
    setUerror(null);
    setEditor({ mode: "edit", user: u });
  }

  function setLevel(moduleKey: string, level: Level | null) {
    setUform((f) => {
      const permissions = { ...f.permissions };
      if (level) permissions[moduleKey] = level;
      else delete permissions[moduleKey];
      return { ...f, permissions };
    });
  }

  async function saveUser(e: FormEvent) {
    e.preventDefault();
    setUerror(null);
    if (!uform.name.trim() || !uform.username.trim()) {
      setUerror("Nombre y usuario son obligatorios.");
      return;
    }
    if (editor?.mode === "create" && uform.password.length < 6) {
      setUerror("La contraseña inicial debe tener al menos 6 caracteres.");
      return;
    }
    if (uform.role === "usuario" && Object.keys(uform.permissions).length === 0 && !confirm("El usuario no va a tener acceso a ningún módulo. ¿Guardar igual?")) return;
    setUsaving(true);
    try {
      const body = {
        name: uform.name.trim(),
        username: uform.username.trim(),
        email: uform.email.trim() || null,
        active: uform.active,
        role: uform.role,
        permissions: uform.role === "superadmin" ? {} : uform.permissions,
        sectorIds: uform.sectorIds,
        ...(editor?.mode === "create" ? { password: uform.password } : {}),
      };
      if (editor?.mode === "create") {
        await apiJson("/users", { method: "POST", body: JSON.stringify(body) });
        setNotice(`Usuario creado. Contraseña inicial: ${uform.password} (deberá cambiarla al ingresar).`);
      } else if (editor?.user) {
        await apiJson(`/users/${editor.user.id}`, { method: "PATCH", body: JSON.stringify(body) });
        setNotice("Usuario actualizado. Los permisos nuevos se aplican en su próxima acción.");
      }
      setEditor(null);
      await load();
    } catch (err) {
      setUerror(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setUsaving(false);
    }
  }

  async function toggleActive(u: UserRow) {
    if (u.active && !confirm(`¿Desactivar a ${u.name}? No va a poder ingresar, pero se conserva su historial.`)) return;
    try {
      await apiJson(`/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ active: !u.active }) });
      setNotice(u.active ? "Usuario desactivado." : "Usuario activado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function deleteUser(u: UserRow) {
    if (!confirm(`¿Eliminar definitivamente a ${u.name}? Si tiene registros cargados, conviene desactivarlo.`)) return;
    try {
      await apiJson(`/users/${u.id}`, { method: "DELETE" });
      setNotice("Usuario eliminado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function doReset(e: FormEvent) {
    e.preventDefault();
    if (!resetUser) return;
    try {
      await apiJson(`/users/${resetUser.id}/reset-password`, { method: "POST", body: JSON.stringify({ password: resetPw }) });
      setNotice(`Contraseña de @${resetUser.username} restablecida: ${resetPw} (deberá cambiarla al ingresar).`);
      setResetUser(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  // ---------- sectores ----------

  function openSector(s?: Sector) {
    setSform(s ? { name: s.name, shortName: s.shortName, active: s.active } : { name: "", shortName: "", active: true });
    setSectorEditor({ mode: s ? "edit" : "create", sector: s });
  }

  async function saveSector(e: FormEvent) {
    e.preventDefault();
    try {
      const body = JSON.stringify({ name: sform.name.trim(), shortName: sform.shortName.trim() || sform.name.trim().slice(0, 8), active: sform.active });
      if (sectorEditor?.mode === "edit" && sectorEditor.sector) await apiJson(`/sectores/${sectorEditor.sector.id}`, { method: "PATCH", body });
      else await apiJson("/sectores", { method: "POST", body });
      setSectorEditor(null);
      setNotice("Sector guardado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el sector");
    }
  }

  async function toggleSector(s: Sector) {
    try {
      await apiJson(`/sectores/${s.id}`, { method: "PATCH", body: JSON.stringify({ active: !s.active }) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function deleteSector(s: Sector) {
    if (!confirm(`¿Eliminar el sector ${s.name}?`)) return;
    try {
      await apiJson(`/sectores/${s.id}`, { method: "DELETE" });
      setNotice("Sector eliminado.");
      await load();
    } catch {
      setError("No se pudo eliminar: el sector tiene guardias, usuarios o activos asociados. Desactivalo en su lugar.");
    }
  }

  // ---------- render ----------

  const usersInSector = (id: number) => users.filter((u) => u.sectorIds.includes(id)).length;

  if (!loading && me && !isSuperadmin) {
    return (
      <div className="content-wrap" style={{ padding: "20px 22px" }}>
        <div className="eyebrow">Espacio / Configuración</div>
        <h1 className="page-title">Configuración</h1>
        <div className="card" style={{ ...CARD, marginTop: 16, maxWidth: 520 }}>
          <strong>Solo el superadmin puede administrar usuarios y sectores.</strong>
          <p className="page-subtitle" style={{ marginTop: 6 }}>Si necesitás un acceso o un cambio de permisos, pedíselo al área de Sistemas.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="content-wrap usr-page" style={{ padding: "20px 22px 40px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 14 }}>
        <div>
          <div className="eyebrow">Espacio / Configuración</div>
          <h1 className="page-title">Configuración</h1>
          <p className="page-subtitle">Usuarios, permisos, sectores y apariencia del sistema.</p>
        </div>
        <div className="gm-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={section === "usuarios"} className={`gm-tab${section === "usuarios" ? " is-active" : ""}`} onClick={() => setSection("usuarios")}>Usuarios ({users.filter((u) => u.active).length})</button>
          <button type="button" role="tab" aria-selected={section === "sectores"} className={`gm-tab${section === "sectores" ? " is-active" : ""}`} onClick={() => setSection("sectores")}>Sectores ({sectors.length})</button>
          <button type="button" role="tab" aria-selected={section === "apariencia"} className={`gm-tab${section === "apariencia" ? " is-active" : ""}`} onClick={() => setSection("apariencia")}>Apariencia</button>
        </div>
      </div>

      {error && (
        <div className="form-error" role="alert" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <span>{error}</span>
          <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => setError(null)}>Cerrar</button>
        </div>
      )}
      {notice && (
        <div role="status" style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid hsl(150 45% 75%)", background: "hsl(150 60% 95%)", color: "hsl(150 60% 22%)", fontSize: 13, fontWeight: 600 }}>{notice}</div>
      )}

      {loading ? (
        <div className="skeleton" style={{ height: 240 }} />
      ) : section === "apariencia" ? (
        <AparienciaConfig onNotice={setNotice} onError={setError} />
      ) : section === "usuarios" ? (
        <div className="card" style={CARD}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14 }}>
            <input className="input" placeholder="Buscar por nombre, usuario o email…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: "1 1 220px", maxWidth: 320 }} />
            <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} style={{ width: 150 }}>
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
              <option value="todos">Todos</option>
            </select>
            <button type="button" className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={openCreate}>+ Nuevo usuario</button>
          </div>
          <div className="agenda-table-wrap">
            <table className="agenda-table">
              <thead>
                <tr><th>Persona</th><th>Usuario</th><th>Tipo</th><th>Permisos</th><th>Sectores</th><th>Estado</th><th /></tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, ...MUTED }}>No hay usuarios con ese filtro.</td></tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.id} style={{ opacity: u.active ? 1 : 0.6 }}>
                      <td>
                        <div className="agenda-title">{u.name}{u.id === me?.id ? " (vos)" : ""}</div>
                        <div style={MUTED}>Último acceso: {fmtDate(u.lastLoginAt)}</div>
                      </td>
                      <td style={{ fontFamily: "monospace" }}>@{u.username}</td>
                      <td>{u.role === "superadmin" ? <span style={CHIP("hsl(270 60% 92%)", "hsl(270 50% 32%)")}>Superadmin</span> : "Usuario"}</td>
                      <td style={{ maxWidth: 360 }}><PermChips u={u} /></td>
                      <td style={{ fontSize: 12 }}>
                        {u.role === "superadmin" || u.sectorIds.length === 0 ? <span style={MUTED}>Todos</span> : u.sectorIds.map((id) => sectorName.get(id) || `#${id}`).join(", ")}
                      </td>
                      <td>
                        {!u.active ? <span style={CHIP("hsl(0 0% 90%)", "hsl(0 0% 35%)")}>Inactivo</span> : u.mustChangePassword ? <span style={CHIP("hsl(40 90% 90%)", "hsl(35 70% 30%)")}>Primer acceso</span> : <span style={CHIP("hsl(155 55% 88%)", "hsl(155 60% 24%)")}>Activo</span>}
                      </td>
                      <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                        <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => openEditUser(u)}>Editar</button>
                        <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => { setResetUser(u); setResetPw(randomPassword()); }}>Clave</button>
                        {u.id !== me?.id && (
                          <>
                            <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => void toggleActive(u)}>{u.active ? "Desactivar" : "Activar"}</button>
                            <button type="button" className="btn btn-quiet" style={{ fontSize: 12, color: "#b91c1c" }} onClick={() => void deleteUser(u)}>Eliminar</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div style={{ ...MUTED, marginTop: 12, display: "flex", gap: 14, flexWrap: "wrap" }}>
            {(["ver", "editar", "total"] as Level[]).map((l) => <span key={l}><span style={CHIP(LEVEL_COLOR[l].bg, LEVEL_COLOR[l].fg)}>{LEVEL_LABEL[l]}</span></span>)}
            <span>Desactivar conserva el historial; eliminar solo es posible si el usuario no cargó registros.</span>
          </div>
        </div>
      ) : (
        <div className="card" style={CARD}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
            <p className="page-subtitle" style={{ margin: 0 }}>Los sectores se usan en Guardias, Inventario e Instructivos, y para limitar a qué sectores accede cada usuario.</p>
            <button type="button" className="btn btn-primary" onClick={() => openSector()}>+ Nuevo sector</button>
          </div>
          <div className="agenda-table-wrap">
            <table className="agenda-table">
              <thead><tr><th>Sector</th><th>Abreviatura</th><th>Usuarios a cargo</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {sectors.map((s) => (
                  <tr key={s.id} style={{ opacity: s.active ? 1 : 0.6 }}>
                    <td className="agenda-title">{s.name}</td>
                    <td style={{ fontFamily: "monospace" }}>{s.shortName}</td>
                    <td>{usersInSector(s.id)}</td>
                    <td>{s.active ? <span style={CHIP("hsl(155 55% 88%)", "hsl(155 60% 24%)")}>Activo</span> : <span style={CHIP("hsl(0 0% 90%)", "hsl(0 0% 35%)")}>Inactivo</span>}</td>
                    <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                      <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => openSector(s)}>Editar</button>
                      <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => void toggleSector(s)}>{s.active ? "Desactivar" : "Activar"}</button>
                      <button type="button" className="btn btn-quiet" style={{ fontSize: 12, color: "#b91c1c" }} onClick={() => void deleteSector(s)}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editor && (
        <div style={OVERLAY} onClick={() => setEditor(null)}>
          <form className="card" style={{ width: "min(760px, 100%)", padding: 22, display: "flex", flexDirection: "column", gap: 16 }} onClick={(e) => e.stopPropagation()} onSubmit={saveUser}>
            <div>
              <div className="eyebrow">{editor.mode === "create" ? "Nuevo acceso" : "Editar usuario"}</div>
              <h2 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 800 }}>{editor.mode === "create" ? "Crear usuario" : editor.user?.name}</h2>
              {editor.user?.legacyRole && <div style={{ ...MUTED, marginTop: 4 }}>Tenía el rol anterior "{editor.user.legacyRole}"; al guardar se convierte a permisos por módulo.</div>}
            </div>
            {uerror && <div className="form-error">{uerror}</div>}

            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              <label className="field"><span className="field-label">Nombre y apellido</span><input className="input" required value={uform.name} onChange={(e) => setUform({ ...uform, name: e.target.value })} /></label>
              <label className="field"><span className="field-label">Usuario (para ingresar)</span><input className="input" required value={uform.username} placeholder="ej. jperez" onChange={(e) => setUform({ ...uform, username: e.target.value })} /></label>
              <label className="field"><span className="field-label">Email (opcional)</span><input className="input" type="email" value={uform.email} onChange={(e) => setUform({ ...uform, email: e.target.value })} /></label>
              {editor.mode === "create" && (
                <label className="field">
                  <span className="field-label">Contraseña inicial</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input className="input" required minLength={6} value={uform.password} onChange={(e) => setUform({ ...uform, password: e.target.value })} style={{ fontFamily: "monospace" }} />
                    <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => setUform({ ...uform, password: randomPassword() })}>Generar</button>
                  </div>
                </label>
              )}
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 13 }}>
                <input type="checkbox" checked={uform.active} disabled={editor.user?.id === me?.id} onChange={(e) => setUform({ ...uform, active: e.target.checked })} />
                Usuario activo
              </label>
            </section>

            <section>
              <div className="field-label" style={{ marginBottom: 8 }}>Tipo de cuenta</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 }}>
                {([
                  ["usuario", "Usuario", "Accede solo a los módulos y con el nivel que elijas abajo."],
                  ["superadmin", "Superadmin", "Acceso total a todos los módulos y administra usuarios y sectores."],
                ] as const).map(([value, title, desc]) => (
                  <label key={value} style={{ display: "flex", gap: 10, padding: 12, borderRadius: 12, border: `2px solid ${uform.role === value ? "hsl(var(--primary))" : "hsl(var(--border))"}`, cursor: "pointer" }}>
                    <input type="radio" name="role" checked={uform.role === value} disabled={editor.user?.id === me?.id} onChange={() => setUform({ ...uform, role: value })} />
                    <span><strong>{title}</strong><br /><span style={MUTED}>{desc}</span></span>
                  </label>
                ))}
              </div>
            </section>

            {uform.role === "usuario" && (
              <section>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  <div className="field-label">Permisos por módulo</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <select
                      className="select"
                      style={{ width: 210, fontSize: 12 }}
                      value=""
                      onChange={(e) => {
                        const src = users.find((u) => u.id === Number(e.target.value));
                        if (src) setUform((f) => ({ ...f, permissions: { ...src.permissions }, sectorIds: [...src.sectorIds] }));
                      }}
                    >
                      <option value="">Copiar permisos de…</option>
                      {users.filter((u) => u.role === "usuario" && u.id !== editor.user?.id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => setUform((f) => ({ ...f, permissions: Object.fromEntries(MODULES.map((m) => [m.key, "ver" as Level])) }))}>Ver todo</button>
                    <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => setUform((f) => ({ ...f, permissions: {} }))}>Quitar todo</button>
                  </div>
                </div>
                <div className="agenda-table-wrap">
                  <table className="agenda-table">
                    <thead>
                      <tr><th>Módulo</th><th style={{ textAlign: "center" }}>Sin acceso</th>{(["ver", "editar", "total"] as Level[]).map((l) => <th key={l} style={{ textAlign: "center" }}>{LEVEL_LABEL[l]}</th>)}</tr>
                    </thead>
                    <tbody>
                      {MODULES.map((m) => {
                        const cur = uform.permissions[m.key] ?? null;
                        return (
                          <tr key={m.key}>
                            <td>
                              <div className="agenda-title">{m.label}</div>
                              <div style={{ ...MUTED, maxWidth: 300, whiteSpace: "normal" }}>{cur ? m.can[cur] : "No ve el módulo en el menú."}</div>
                            </td>
                            <td style={{ textAlign: "center" }}><input type="radio" name={`perm-${m.key}`} checked={!cur} onChange={() => setLevel(m.key, null)} aria-label={`${m.label}: sin acceso`} /></td>
                            {(["ver", "editar", "total"] as Level[]).map((l) => (
                              <td key={l} style={{ textAlign: "center" }}>
                                {m.levels.includes(l) ? (
                                  <input type="radio" name={`perm-${m.key}`} checked={cur === l} onChange={() => setLevel(m.key, l)} aria-label={`${m.label}: ${LEVEL_LABEL[l]}`} />
                                ) : (
                                  <span style={MUTED}>—</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {uform.role === "usuario" && (
              <section>
                <div className="field-label" style={{ marginBottom: 4 }}>Sectores a cargo</div>
                <div style={{ ...MUTED, marginBottom: 8 }}>En Guardias solo puede cargar y modificar en estos sectores. Si no marcás ninguno, puede trabajar en todos.</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6 }}>
                  {sectors.filter((s) => s.active || uform.sectorIds.includes(s.id)).map((s) => (
                    <label key={s.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={uform.sectorIds.includes(s.id)}
                        onChange={(e) => setUform((f) => ({ ...f, sectorIds: e.target.checked ? [...f.sectorIds, s.id] : f.sectorIds.filter((x) => x !== s.id) }))}
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              </section>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8, borderTop: "1px solid hsl(var(--border))" }}>
              <button type="button" className="btn btn-quiet" onClick={() => setEditor(null)} disabled={usaving}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={usaving}>{usaving ? "Guardando…" : editor.mode === "create" ? "Crear usuario" : "Guardar cambios"}</button>
            </div>
          </form>
        </div>
      )}

      {resetUser && (
        <div style={OVERLAY} onClick={() => setResetUser(null)}>
          <form className="card" style={{ width: "min(420px, 100%)", padding: 22, display: "flex", flexDirection: "column", gap: 12 }} onClick={(e) => e.stopPropagation()} onSubmit={doReset}>
            <div>
              <div className="eyebrow">Seguridad</div>
              <h2 style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 800 }}>Restablecer contraseña · @{resetUser.username}</h2>
              <p className="page-subtitle" style={{ marginTop: 6 }}>Se cierran sus sesiones abiertas y deberá cambiarla al ingresar.</p>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input className="input" required minLength={6} value={resetPw} onChange={(e) => setResetPw(e.target.value)} style={{ fontFamily: "monospace" }} />
              <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => setResetPw(randomPassword())}>Generar</button>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-quiet" onClick={() => setResetUser(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">Restablecer</button>
            </div>
          </form>
        </div>
      )}

      {sectorEditor && (
        <div style={OVERLAY} onClick={() => setSectorEditor(null)}>
          <form className="card" style={{ width: "min(420px, 100%)", padding: 22, display: "flex", flexDirection: "column", gap: 12 }} onClick={(e) => e.stopPropagation()} onSubmit={saveSector}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{sectorEditor.mode === "create" ? "Nuevo sector" : `Editar ${sectorEditor.sector?.name}`}</h2>
            <label className="field"><span className="field-label">Nombre</span><input className="input" required value={sform.name} onChange={(e) => setSform({ ...sform, name: e.target.value })} /></label>
            <label className="field"><span className="field-label">Abreviatura</span><input className="input" maxLength={8} value={sform.shortName} placeholder="Opcional (ej. UTI)" onChange={(e) => setSform({ ...sform, shortName: e.target.value })} /></label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 600 }}>
              <input type="checkbox" checked={sform.active} onChange={(e) => setSform({ ...sform, active: e.target.checked })} />
              Sector activo
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-quiet" onClick={() => setSectorEditor(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">Guardar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
