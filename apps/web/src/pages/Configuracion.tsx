import { FormEvent, Fragment, useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { confirmar } from "@/components/feedback";
import AparienciaConfig from "./shared/AparienciaConfig";
import { ALCANCE_AYUDA, ALCANCE_LABEL, LEVEL_COLOR, LEVEL_LABEL, MODULES, type Alcance, type Level, type ModuleScope } from "@/lib/permisos";
import { CoberturaEditor, TAG_COLORS, TagBadge, franjasResumen, type Etiqueta } from "./guardias/compartido";
import type { Franja, SectorConfig } from "./guardias/logic";

// Configuración (solo superadmin): Usuarios (ABM + permisos por módulo), Sectores (y su participación en
// Guardias con el horario requerido), Etiquetas de Guardias y Apariencia.

type Seccion = "usuarios" | "sectores" | "etiquetas" | "apariencia";
const SECCIONES: Seccion[] = ["usuarios", "sectores", "etiquetas", "apariencia"];

const API = "/api";

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
  scopes?: Record<string, ModuleScope>;
  sectorIds: number[];
  lastLoginAt: string | null;
  createdAt: string;
};


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

type Plantilla = { nombre: string; permissions: Record<string, Level>; scopes?: Record<string, ModuleScope>; sectorIds?: number[] };

type UserForm = {
  name: string;
  username: string;
  email: string;
  password: string;
  active: boolean;
  role: "superadmin" | "usuario";
  permissions: Record<string, Level>;
  /** Alcance por módulo con sectores (los que no figuran = todos los sectores). */
  scopes: Record<string, ModuleScope>;
};

function emptyUserForm(): UserForm {
  return { name: "", username: "", email: "", password: randomPassword(), active: true, role: "usuario", permissions: { dashboard: "ver" }, scopes: {} };
}

/** Alcance de una plantilla o usuario viejo que solo tenía "sectores a cargo" (lo de antes = ve todo, carga en esos). */
function scopesDe(x: { permissions: Record<string, Level>; scopes?: Record<string, ModuleScope>; sectorIds?: number[] }): Record<string, ModuleScope> {
  if (x.scopes) return JSON.parse(JSON.stringify(x.scopes));
  const out: Record<string, ModuleScope> = {};
  if (x.sectorIds?.length) for (const m of MODULES) if (m.sectores && x.permissions[m.key]) out[m.key] = { alcance: "carga", sectorIds: [...x.sectorIds] };
  return out;
}

/** Resumen corto del alcance de un usuario, para la tabla. */
function AlcanceResumen({ u, sectorName }: { u: UserRow; sectorName: Map<number, string> }) {
  if (u.role === "superadmin") return <span style={MUTED}>Todos</span>;
  const sc = scopesDe(u);
  const filas = MODULES.filter((m) => m.sectores && u.permissions[m.key]).map((m) => ({ m, s: sc[m.key] }));
  if (!filas.length) return <span style={MUTED}>—</span>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {filas.map(({ m, s }) => (
        <span key={m.key} style={{ fontSize: 12.5 }}>
          <strong>{m.label.replace(" (próximamente)", "")}:</strong>{" "}
          {!s || s.alcance === "todos" ? (
            <span style={MUTED}>todos</span>
          ) : (
            <>
              {s.sectorIds.map((id) => sectorName.get(id) || `#${id}`).join(", ")}{" "}
              <span style={MUTED}>({s.alcance === "sector" ? "solo sus sectores" : "ve todo"})</span>
            </>
          )}
        </span>
      ))}
    </div>
  );
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
  const [section, setSection] = useState<Seccion>(() => {
    const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("seccion") : null;
    return SECCIONES.includes(q as Seccion) ? (q as Seccion) : "usuarios";
  });
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
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [nombrePlantilla, setNombrePlantilla] = useState<string | null>(null);

  // sectores
  const [sectorEditor, setSectorEditor] = useState<{ mode: "create" | "edit"; sector?: Sector; guardiaIni: string } | null>(null);
  const [sform, setSform] = useState<{ name: string; shortName: string; active: boolean; guardia: boolean; cobertura: Franja[] }>({ name: "", shortName: "", active: true, guardia: false, cobertura: [] });
  const [sguardando, setSguardando] = useState(false);
  const [guardiaCfg, setGuardiaCfg] = useState<SectorConfig[]>([]);

  // etiquetas de Guardias
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [etiquetaEditor, setEtiquetaEditor] = useState<{ mode: "create" | "edit"; etiqueta?: Etiqueta } | null>(null);
  const [eform, setEform] = useState({ nombre: "", color: TAG_COLORS[0] });
  const [eerror, setEerror] = useState<string | null>(null);

  const isSuperadmin = me?.role === "superadmin";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meData = await apiJson<{ id: number; role: string }>("/auth/me");
      setMe(meData);
      if (meData.role !== "superadmin") return;
      const [u, s, pl, et, gc] = await Promise.all([
        apiJson<UserRow[]>("/users"),
        apiJson<Sector[]>("/sectores"),
        apiJson<Plantilla[]>("/users/plantillas").catch(() => []),
        apiJson<Etiqueta[]>("/guardias/etiquetas").catch(() => [] as Etiqueta[]),
        apiJson<SectorConfig[]>("/guardias/config").catch(() => [] as SectorConfig[]),
      ]);
      setPlantillas(Array.isArray(pl) ? pl : []);
      setEtiquetas(Array.isArray(et) ? et : []);
      setGuardiaCfg(Array.isArray(gc) ? gc : []);
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
    setUform({ name: u.name, username: u.username, email: u.email || "", password: "", active: u.active, role: u.role, permissions: { ...u.permissions }, scopes: scopesDe(u) });
    setUerror(null);
    setEditor({ mode: "edit", user: u });
  }

  function setLevel(moduleKey: string, level: Level | null) {
    setUform((f) => {
      const permissions = { ...f.permissions };
      if (level) permissions[moduleKey] = level;
      else delete permissions[moduleKey];
      const scopes = { ...f.scopes };
      if (!level) delete scopes[moduleKey];
      return { ...f, permissions, scopes };
    });
  }

  function setAlcance(moduleKey: string, alcance: Alcance) {
    setUform((f) => {
      const scopes = { ...f.scopes };
      if (alcance === "todos") delete scopes[moduleKey];
      else scopes[moduleKey] = { alcance, sectorIds: f.scopes[moduleKey]?.sectorIds ?? [] };
      return { ...f, scopes };
    });
  }

  function toggleSectorAlcance(moduleKey: string, sectorId: number, on: boolean) {
    setUform((f) => {
      const sc = f.scopes[moduleKey];
      if (!sc) return f;
      const sectorIds = on ? [...new Set([...sc.sectorIds, sectorId])] : sc.sectorIds.filter((x) => x !== sectorId);
      return { ...f, scopes: { ...f.scopes, [moduleKey]: { ...sc, sectorIds } } };
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
    const sinSectores = MODULES.find((m) => m.sectores && uform.permissions[m.key] && uform.scopes[m.key] && uform.scopes[m.key].alcance !== "todos" && !uform.scopes[m.key].sectorIds.length);
    if (uform.role === "usuario" && sinSectores) {
      setUerror(`${sinSectores.label}: marcá al menos un sector o elegí "Todos los sectores".`);
      return;
    }
    if (uform.role === "usuario" && Object.keys(uform.permissions).length === 0 && !(await confirmar({ titulo: "Sin acceso a módulos", mensaje: "El usuario no va a tener acceso a ningún módulo. ¿Guardar igual?", accion: "Guardar igual" }))) return;
    setUsaving(true);
    try {
      const body = {
        name: uform.name.trim(),
        username: uform.username.trim(),
        email: uform.email.trim() || null,
        active: uform.active,
        role: uform.role,
        permissions: uform.role === "superadmin" ? {} : uform.permissions,
        scopes: uform.role === "superadmin" ? {} : Object.fromEntries(Object.entries(uform.scopes).filter(([k]) => uform.permissions[k])),
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

  async function guardarPlantillas(lista: Plantilla[], mensaje: string) {
    try {
      setPlantillas(await apiJson<Plantilla[]>("/users/plantillas", { method: "PUT", body: JSON.stringify(lista) }));
      setNotice(mensaje);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron guardar las plantillas.");
    }
  }

  async function guardarComoPlantilla() {
    const nombre = (nombrePlantilla ?? "").trim();
    if (!nombre) return;
    const existe = plantillas.some((p) => p.nombre.toLowerCase() === nombre.toLowerCase());
    if (existe && !(await confirmar({ titulo: `Reemplazar la plantilla "${nombre}"?`, accion: "Reemplazar" }))) return;
    const nueva: Plantilla = { nombre, permissions: { ...uform.permissions }, scopes: JSON.parse(JSON.stringify(uform.scopes)) };
    await guardarPlantillas([...plantillas.filter((p) => p.nombre.toLowerCase() !== nombre.toLowerCase()), nueva], `Plantilla "${nombre}" guardada.`);
    setNombrePlantilla(null);
  }

  async function borrarPlantilla(nombre: string) {
    if (!(await confirmar({ titulo: `¿Borrar la plantilla "${nombre}"?`, mensaje: "Los usuarios que la usaron conservan sus permisos.", accion: "Borrar", peligro: true }))) return;
    await guardarPlantillas(plantillas.filter((p) => p.nombre !== nombre), "Plantilla borrada.");
  }

  async function toggleActive(u: UserRow) {
    if (u.active && !(await confirmar({ titulo: `¿Desactivar a ${u.name}?`, mensaje: "No va a poder ingresar, pero se conserva su historial.", accion: "Desactivar", peligro: true }))) return;
    try {
      await apiJson(`/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ active: !u.active }) });
      setNotice(u.active ? "Usuario desactivado." : "Usuario activado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function deleteUser(u: UserRow) {
    if (!(await confirmar({ titulo: `¿Eliminar definitivamente a ${u.name}?`, mensaje: "Si tiene registros cargados, conviene desactivarlo.", accion: "Eliminar", peligro: true }))) return;
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

  const cfgDe = (id: number) => guardiaCfg.find((c) => c.sectorId === id);

  function openSector(s?: Sector) {
    const c = s ? cfgDe(s.id) : undefined;
    const guardia = Boolean(c?.active);
    const cobertura = c?.cobertura ?? [];
    setSform(s ? { name: s.name, shortName: s.shortName, active: s.active, guardia, cobertura } : { name: "", shortName: "", active: true, guardia: false, cobertura: [] });
    setSectorEditor({ mode: s ? "edit" : "create", sector: s, guardiaIni: JSON.stringify({ guardia, cobertura }) });
  }

  async function saveSector(e: FormEvent) {
    e.preventDefault();
    if (!sectorEditor) return;
    setSguardando(true);
    try {
      const body = JSON.stringify({ name: sform.name.trim(), shortName: sform.shortName.trim() || sform.name.trim().slice(0, 8), active: sform.active });
      let id = sectorEditor.sector?.id;
      if (sectorEditor.mode === "edit" && id) await apiJson(`/sectores/${id}`, { method: "PATCH", body });
      else id = (await apiJson<Sector>("/sectores", { method: "POST", body })).id;
      // Participación en Guardias y horario requerido: solo si cambió (o es un sector nuevo que participa).
      // Al dejar de participar se conserva el horario, por si el sector vuelve a Guardias.
      const cambioGuardia = JSON.stringify({ guardia: sform.guardia, cobertura: sform.cobertura }) !== sectorEditor.guardiaIni;
      if (id && cambioGuardia && (sform.guardia || sectorEditor.mode === "edit")) {
        await apiJson(`/guardias/config/${id}`, { method: "PUT", body: JSON.stringify({ active: sform.guardia, cobertura: sform.cobertura }) });
      }
      setSectorEditor(null);
      setNotice("Sector guardado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el sector");
    } finally {
      setSguardando(false);
    }
  }

  // ---------- etiquetas ----------

  function openEtiqueta(et?: Etiqueta) {
    setEform(et ? { nombre: et.nombre, color: et.color } : { nombre: "", color: TAG_COLORS[(etiquetas.length + 1) % TAG_COLORS.length] });
    setEerror(null);
    setEtiquetaEditor({ mode: et ? "edit" : "create", etiqueta: et });
  }

  async function saveEtiqueta(e: FormEvent) {
    e.preventDefault();
    if (!etiquetaEditor) return;
    setEerror(null);
    try {
      const body = JSON.stringify({ nombre: eform.nombre.trim(), color: eform.color });
      if (etiquetaEditor.mode === "edit" && etiquetaEditor.etiqueta) {
        const r = await apiJson<{ guardiasActualizadas?: number }>(`/guardias/etiquetas/${etiquetaEditor.etiqueta.id}`, { method: "PATCH", body });
        const n = r?.guardiasActualizadas ?? 0;
        setNotice(n ? `Etiqueta guardada. Se actualizaron ${n} guardia${n === 1 ? "" : "s"} que la usaban.` : "Etiqueta guardada.");
      } else {
        await apiJson("/guardias/etiquetas", { method: "POST", body });
        setNotice("Etiqueta creada: ya se puede elegir al cargar guardias.");
      }
      setEtiquetaEditor(null);
      await load();
    } catch (err) {
      setEerror(err instanceof Error ? err.message : "No se pudo guardar la etiqueta");
    }
  }

  async function toggleEtiqueta(et: Etiqueta) {
    try {
      await apiJson(`/guardias/etiquetas/${et.id}`, { method: "PATCH", body: JSON.stringify({ activa: !et.activa }) });
      setNotice(et.activa ? `«${et.nombre}» desactivada: ya no aparece al cargar guardias.` : `«${et.nombre}» activada.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function deleteEtiqueta(et: Etiqueta) {
    if (!(await confirmar({ titulo: `¿Eliminar la etiqueta ${et.nombre}?`, mensaje: "Solo se puede eliminar si ninguna guardia la usa.", accion: "Eliminar", peligro: true }))) return;
    try {
      await apiJson(`/guardias/etiquetas/${et.id}`, { method: "DELETE" });
      setNotice("Etiqueta eliminada.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la etiqueta");
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
    if (!(await confirmar({ titulo: `¿Eliminar el sector ${s.name}?`, mensaje: "Si tiene guardias, usuarios o activos asociados, conviene desactivarlo.", accion: "Eliminar", peligro: true }))) return;
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
          <strong>Los usuarios, sectores y etiquetas los administra el área de Sistemas.</strong>
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
          <p className="page-subtitle">Usuarios, permisos, sectores, etiquetas y apariencia del sistema.</p>
        </div>
        <div className="gm-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={section === "usuarios"} className={`gm-tab${section === "usuarios" ? " is-active" : ""}`} onClick={() => setSection("usuarios")}>Usuarios ({users.filter((u) => u.active).length})</button>
          <button type="button" role="tab" aria-selected={section === "sectores"} className={`gm-tab${section === "sectores" ? " is-active" : ""}`} onClick={() => setSection("sectores")}>Sectores ({sectors.length})</button>
          <button type="button" role="tab" aria-selected={section === "etiquetas"} className={`gm-tab${section === "etiquetas" ? " is-active" : ""}`} onClick={() => setSection("etiquetas")}>Etiquetas ({etiquetas.filter((e) => e.activa).length})</button>
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
          {plantillas.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 12, ...MUTED }}>
              <span>Plantillas de permisos:</span>
              {plantillas.map((p) => (
                <span key={p.nombre} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 4px 2px 10px", borderRadius: 999, border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }}>
                  {p.nombre}
                  <button type="button" onClick={() => void borrarPlantilla(p.nombre)} aria-label={`Borrar plantilla ${p.nombre}`} title="Borrar plantilla" style={{ border: "none", background: "transparent", cursor: "pointer", color: "inherit", fontSize: 14, lineHeight: 1, padding: "0 4px" }}>×</button>
                </span>
              ))}
            </div>
          )}
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
                        <AlcanceResumen u={u} sectorName={sectorName} />
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
      ) : section === "etiquetas" ? (
        <div className="card" style={CARD}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
            <p className="page-subtitle" style={{ margin: 0, maxWidth: 720 }}>Etiquetas que se eligen al cargar una guardia (ej. GUARDIA EXTRA, REEMPLAZO). Renombrar o cambiar el color actualiza todas las guardias que la usan; desactivarla la saca de la carga, pero las guardias la conservan.</p>
            <button type="button" className="btn btn-primary" onClick={() => openEtiqueta()}>+ Nueva etiqueta</button>
          </div>
          <div className="agenda-table-wrap">
            <table className="agenda-table">
              <thead><tr><th>Etiqueta</th><th>Color</th><th>Guardias que la usan</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {etiquetas.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: "center", padding: 20, color: "hsl(var(--muted-foreground))" }}>Todavía no hay etiquetas.</td></tr>
                ) : (
                  etiquetas.map((et) => (
                    <tr key={et.id} style={{ opacity: et.activa ? 1 : 0.6 }}>
                      <td><TagBadge label={et.nombre} color={et.color} /></td>
                      <td><span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "monospace", fontSize: 12 }}><i style={{ width: 14, height: 14, borderRadius: 4, background: et.color, display: "inline-block" }} />{et.color}</span></td>
                      <td>{et.usos}</td>
                      <td>{et.activa ? <span style={CHIP("hsl(155 55% 88%)", "hsl(155 60% 24%)")}>Activa</span> : <span style={CHIP("hsl(0 0% 90%)", "hsl(0 0% 35%)")}>Inactiva</span>}</td>
                      <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                        <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => openEtiqueta(et)}>Editar</button>
                        <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => void toggleEtiqueta(et)}>{et.activa ? "Desactivar" : "Activar"}</button>
                        <button type="button" className="btn btn-quiet" style={{ fontSize: 12, color: "#b91c1c" }} disabled={et.usos > 0} title={et.usos > 0 ? "Está en uso: desactivala en su lugar" : undefined} onClick={() => void deleteEtiqueta(et)}>Eliminar</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card" style={CARD}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
            <p className="page-subtitle" style={{ margin: 0, maxWidth: 720 }}>Los sectores se usan en Guardias, Inventario e Instructivos, y para limitar a qué sectores accede cada usuario. En cada sector se define si participa de Guardias Médicas y qué horario necesita cubierto.</p>
            <button type="button" className="btn btn-primary" onClick={() => openSector()}>+ Nuevo sector</button>
          </div>
          <div className="agenda-table-wrap">
            <table className="agenda-table">
              <thead><tr><th>Sector</th><th>Abreviatura</th><th>Guardias Médicas</th><th>Usuarios a cargo</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {sectors.map((s) => (
                  <tr key={s.id} style={{ opacity: s.active ? 1 : 0.6 }}>
                    <td className="agenda-title">{s.name}</td>
                    <td style={{ fontFamily: "monospace" }}>{s.shortName}</td>
                    <td>
                      {cfgDe(s.id)?.active ? (
                        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span><span style={CHIP("hsl(262 80% 93%)", "hsl(262 55% 38%)")}>Participa</span></span>
                          <span style={MUTED}>{franjasResumen(cfgDe(s.id)!.cobertura)}</span>
                        </span>
                      ) : (
                        <span style={MUTED}>No participa</span>
                      )}
                    </td>
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
              <h2 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 700 }}>{editor.mode === "create" ? "Crear usuario" : editor.user?.name}</h2>
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
                        if (src) setUform((f) => ({ ...f, permissions: { ...src.permissions }, scopes: scopesDe(src) }));
                      }}
                    >
                      <option value="">Copiar de un usuario…</option>
                      {users.filter((u) => u.role === "usuario" && u.id !== editor.user?.id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    {plantillas.length > 0 && (
                      <select
                        className="select"
                        style={{ width: 200, fontSize: 12 }}
                        value=""
                        aria-label="Aplicar plantilla de permisos"
                        onChange={(e) => {
                          const pl = plantillas.find((p) => p.nombre === e.target.value);
                          if (pl) setUform((f) => ({ ...f, permissions: { ...pl.permissions }, scopes: scopesDe(pl) }));
                        }}
                      >
                        <option value="">Aplicar plantilla…</option>
                        {plantillas.map((p) => <option key={p.nombre} value={p.nombre}>{p.nombre}</option>)}
                      </select>
                    )}
                    <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => setUform((f) => ({ ...f, permissions: Object.fromEntries(MODULES.map((m) => [m.key, "ver" as Level])) }))}>Ver todo</button>
                    <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => setUform((f) => ({ ...f, permissions: {} }))}>Quitar todo</button>
                    <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => setNombrePlantilla("")}>Guardar como plantilla</button>
                  </div>
                </div>
                {nombrePlantilla !== null && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                    <input
                      className="input"
                      autoFocus
                      maxLength={60}
                      placeholder="Nombre de la plantilla (ej. Jefe de guardia)"
                      value={nombrePlantilla}
                      onChange={(e) => setNombrePlantilla(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void guardarComoPlantilla();
                        } else if (e.key === "Escape") setNombrePlantilla(null);
                      }}
                      style={{ maxWidth: 300 }}
                    />
                    <button type="button" className="btn btn-primary" style={{ fontSize: 12 }} disabled={!nombrePlantilla.trim()} onClick={() => void guardarComoPlantilla()}>Guardar plantilla</button>
                    <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => setNombrePlantilla(null)}>Cancelar</button>
                    <span style={MUTED}>Guarda los permisos y sectores elegidos arriba.</span>
                  </div>
                )}
                <div className="agenda-table-wrap">
                  <table className="agenda-table">
                    <thead>
                      <tr><th>Módulo</th><th style={{ textAlign: "center" }}>Sin acceso</th>{(["ver", "editar", "total"] as Level[]).map((l) => <th key={l} style={{ textAlign: "center" }}>{LEVEL_LABEL[l]}</th>)}</tr>
                    </thead>
                    <tbody>
                      {MODULES.map((m) => {
                        const cur = uform.permissions[m.key] ?? null;
                        const sc = uform.scopes[m.key];
                        const alcance: Alcance = sc?.alcance ?? "todos";
                        return (
                          <Fragment key={m.key}>
                          <tr>
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
                          {m.sectores && cur && (
                            <tr>
                              <td colSpan={5} style={{ background: "hsl(var(--muted) / .35)", paddingTop: 10, paddingBottom: 12 }}>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                                  <span className="field-label" style={{ margin: 0 }}>Sectores</span>
                                  <select className="select" style={{ width: 290, fontSize: 13 }} value={alcance} onChange={(e) => setAlcance(m.key, e.target.value as Alcance)} aria-label={`${m.label}: alcance por sector`}>
                                    {(["todos", "carga", "sector"] as Alcance[]).map((a) => <option key={a} value={a}>{ALCANCE_LABEL[a]}</option>)}
                                  </select>
                                  <span style={{ ...MUTED, flex: "1 1 260px", whiteSpace: "normal" }}>{ALCANCE_AYUDA[alcance]}</span>
                                </div>
                                {alcance !== "todos" && (
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                                    {sectors.filter((s) => s.active || sc?.sectorIds.includes(s.id)).map((s) => {
                                      const on = Boolean(sc?.sectorIds.includes(s.id));
                                      return (
                                        <label key={s.id} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12.5, fontWeight: 600, padding: "5px 10px", borderRadius: 999, cursor: "pointer", border: `1px solid ${on ? "hsl(var(--primary))" : "hsl(var(--border))"}`, background: on ? "hsl(var(--primary) / .12)" : "hsl(var(--card))" }}>
                                          <input type="checkbox" checked={on} onChange={(e) => toggleSectorAlcance(m.key, s.id, e.target.checked)} />
                                          {s.name}
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
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
              <h2 style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 700 }}>Restablecer contraseña · @{resetUser.username}</h2>
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
          <form className="card" style={{ width: sform.guardia ? "min(640px, 100%)" : "min(460px, 100%)", padding: 22, display: "flex", flexDirection: "column", gap: 12 }} onClick={(e) => e.stopPropagation()} onSubmit={saveSector}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{sectorEditor.mode === "create" ? "Nuevo sector" : `Editar ${sectorEditor.sector?.name}`}</h2>
            <label className="field"><span className="field-label">Nombre</span><input className="input" required value={sform.name} onChange={(e) => setSform({ ...sform, name: e.target.value })} /></label>
            <label className="field"><span className="field-label">Abreviatura</span><input className="input" maxLength={8} value={sform.shortName} placeholder="Opcional (ej. UTI)" onChange={(e) => setSform({ ...sform, shortName: e.target.value })} /></label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 600 }}>
              <input type="checkbox" checked={sform.active} onChange={(e) => setSform({ ...sform, active: e.target.checked })} />
              Sector activo
            </label>
            <section style={{ borderTop: "1px solid hsl(var(--border))", paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, fontWeight: 600 }}>
                <input type="checkbox" checked={sform.guardia} disabled={!sform.active} onChange={(e) => setSform({ ...sform, guardia: e.target.checked })} style={{ marginTop: 2 }} />
                <span>
                  Participa de Guardias Médicas
                  <span style={{ ...MUTED, display: "block", fontWeight: 400 }}>Aparece en el calendario de Guardias y se controla su cobertura.</span>
                </span>
              </label>
              {sform.guardia && sform.active && (
                <div>
                  <div className="field-label" style={{ marginBottom: 6 }}>Horario que necesita cubierto</div>
                  <CoberturaEditor value={sform.cobertura} onChange={(cobertura) => setSform({ ...sform, cobertura })} />
                </div>
              )}
            </section>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-quiet" onClick={() => setSectorEditor(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={sguardando}>{sguardando ? "Guardando…" : "Guardar"}</button>
            </div>
          </form>
        </div>
      )}

      {etiquetaEditor && (
        <div style={OVERLAY} onClick={() => setEtiquetaEditor(null)}>
          <form className="card" style={{ width: "min(460px, 100%)", padding: 22, display: "flex", flexDirection: "column", gap: 14 }} onClick={(e) => e.stopPropagation()} onSubmit={saveEtiqueta}>
            <div>
              <div className="eyebrow">Etiquetas de Guardias</div>
              <h2 style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 700 }}>{etiquetaEditor.mode === "create" ? "Nueva etiqueta" : `Editar ${etiquetaEditor.etiqueta?.nombre}`}</h2>
            </div>
            {eerror && <div className="form-error">{eerror}</div>}
            <label className="field">
              <span className="field-label">Nombre</span>
              <input className="input" required minLength={2} maxLength={30} value={eform.nombre} placeholder="Ej: GUARDIA EXTRA" onChange={(e) => setEform({ ...eform, nombre: e.target.value.toUpperCase() })} />
            </label>
            <div>
              <div className="field-label" style={{ marginBottom: 6 }}>Color</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                {TAG_COLORS.map((c) => (
                  <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={eform.color === c} onClick={() => setEform({ ...eform, color: c })}
                    style={{ width: 30, height: 30, borderRadius: 9, background: c, cursor: "pointer", border: "none", boxShadow: eform.color === c ? `0 0 0 2px hsl(var(--card)), 0 0 0 4px ${c}` : "inset 0 0 0 1px rgba(0,0,0,.08)" }} />
                ))}
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "hsl(var(--muted-foreground))", cursor: "pointer" }}>
                  <input type="color" value={eform.color} onChange={(e) => setEform({ ...eform, color: e.target.value })} style={{ width: 34, height: 30, border: "none", padding: 0, background: "transparent", cursor: "pointer" }} />
                  Otro
                </label>
              </div>
            </div>
            <div style={{ ...MUTED, display: "flex", alignItems: "center", gap: 8 }}>Vista previa: <TagBadge label={eform.nombre.trim() || "ETIQUETA"} color={eform.color} /></div>
            {etiquetaEditor.mode === "edit" && (etiquetaEditor.etiqueta?.usos ?? 0) > 0 && (
              <div style={MUTED}>Los cambios se aplican también a las {etiquetaEditor.etiqueta?.usos} guardias que ya la usan.</div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-quiet" onClick={() => setEtiquetaEditor(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">Guardar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
