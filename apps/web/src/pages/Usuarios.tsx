import { FormEvent, useMemo, useState } from "react";
import {
  KeyRound,
  Pencil,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Users,
  LayoutDashboard,
  ClipboardList,
  Wallet,
  CalendarDays,
  Package,
  BookOpen,
  Check,
} from "lucide-react";
import {
  getListSectorsQueryKey,
  getListUsersQueryKey,
  useCreateUser,
  useDeleteUser,
  useListSectors,
  useListUsers,
  useResetUserPassword,
  useUpdateUser,
  type CreateUserBody,
  type UserAdmin,
} from "@salvador/api-client-react";
import { queryClient } from "@/lib/queryClient";

const MODULE_CATALOG = [
  { key: "dashboard", label: "Resumen", desc: "Panel de inicio y lectura del día", icon: LayoutDashboard },
  { key: "administracion", label: "Administración", desc: "Vencimientos, notas y calendario", icon: ClipboardList },
  { key: "liquidacion", label: "Liquidación", desc: "Módulo reservado (placeholder)", icon: Wallet },
  { key: "guardias", label: "Guardias Médicas", desc: "Calendario y carga de guardias", icon: CalendarDays },
  { key: "inventario", label: "Inventario", desc: "Activos fijos por sector", icon: Package },
  { key: "instructivos", label: "Instructivos", desc: "Repositorio de PDFs por sector", icon: BookOpen },
] as const;

type ModuleKey = (typeof MODULE_CATALOG)[number]["key"];

const PRESETS: { id: string; label: string; hint: string; role: "usuario" | "responsable"; modules: ModuleKey[] }[] = [
  {
    id: "consulta",
    label: "Solo consulta",
    hint: "Resumen + instructivos",
    role: "usuario",
    modules: ["dashboard", "instructivos"],
  },
  {
    id: "operativo",
    label: "Operativo",
    hint: "Agenda, guardias e inventario",
    role: "usuario",
    modules: ["dashboard", "administracion", "guardias", "inventario", "instructivos"],
  },
  {
    id: "responsable",
    label: "Responsable de sector",
    hint: "Perfil responsable + módulos operativos",
    role: "responsable",
    modules: ["dashboard", "administracion", "guardias", "inventario", "instructivos"],
  },
  {
    id: "completo",
    label: "Acceso amplio",
    hint: "Todos los módulos (sin Usuarios)",
    role: "usuario",
    modules: ["dashboard", "administracion", "liquidacion", "guardias", "inventario", "instructivos"],
  },
];

function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return value;
  }
}

function Metric({ label, value, note, icon }: { label: string; value: number | string; note: string; icon: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "center" }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center", background: "hsl(var(--primary) / .12)", color: "hsl(var(--primary))" }}>{icon}</div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>{note}</div>
      </div>
    </div>
  );
}

function StatusMessage({ title, detail, action }: { title: string; detail: string; action?: () => void }) {
  return (
    <div className="card" style={{ padding: 28, textAlign: "center" }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", marginBottom: 14 }}>{detail}</div>
      {action && (
        <button type="button" className="btn btn-quiet" onClick={action}>
          Reintentar
        </button>
      )}
    </div>
  );
}

export default function UsuariosPage() {
  const users = useListUsers({ query: { queryKey: getListUsersQueryKey(), retry: false } });
  const sectors = useListSectors({ query: { queryKey: getListSectorsQueryKey(), retry: false } });
  const create = useCreateUser();
  const update = useUpdateUser();
  const remove = useDeleteUser();
  const reset = useResetUserPassword();
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ open: boolean; mode: "create" | "edit" | "reset"; user?: UserAdmin }>({ open: false, mode: "create" });
  const [form, setForm] = useState({
    name: "",
    username: "",
    password: "",
    role: "usuario" as "usuario" | "responsable",
    active: true,
    modules: ["dashboard"] as string[],
    sectorIds: [] as number[],
  });
  const [notice, setNotice] = useState("");
  const [presetId, setPresetId] = useState<string | null>(null);

  const open = (mode: "create" | "edit" | "reset", user?: UserAdmin) => {
    setModal({ open: true, mode, user });
    setPresetId(null);
    setForm({
      name: user?.name || "",
      username: user?.username || "",
      password: "",
      role: user?.role === "responsable" ? "responsable" : "usuario",
      active: user?.active ?? true,
      modules: user?.modules?.length ? user.modules : ["dashboard"],
      sectorIds: user?.sectorIds || [],
    });
  };
  const close = () => setModal({ open: false, mode: "create" });
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });

  const toggleModule = (key: string) => {
    setPresetId(null);
    setForm((prev) => ({
      ...prev,
      modules: prev.modules.includes(key) ? prev.modules.filter((m) => m !== key) : [...prev.modules, key],
    }));
  };

  const toggleSector = (id: number) => {
    setForm((prev) => ({
      ...prev,
      sectorIds: prev.sectorIds.includes(id) ? prev.sectorIds.filter((s) => s !== id) : [...prev.sectorIds, id],
    }));
  };

  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setPresetId(id);
    setForm((prev) => ({ ...prev, role: p.role, modules: [...p.modules] }));
  };

  const selectAllModules = () => {
    setPresetId("completo");
    setForm((prev) => ({ ...prev, modules: MODULE_CATALOG.map((m) => m.key) }));
  };

  const clearModules = () => {
    setPresetId(null);
    setForm((prev) => ({ ...prev, modules: ["dashboard"] }));
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (modal.mode === "reset" && modal.user) {
      reset.mutate(
        { id: modal.user.id, data: { password: form.password } },
        {
          onSuccess: () => {
            close();
            setNotice("Contraseña restablecida. El usuario deberá confirmarla al ingresar.");
            refresh();
          },
        },
      );
      return;
    }
    const data: CreateUserBody = {
      name: form.name,
      username: form.username,
      password: form.password,
      role: form.role,
      active: form.active,
      modules: form.modules,
      sectorIds: form.sectorIds,
    };
    if (modal.mode === "edit" && modal.user) {
      update.mutate(
        {
          id: modal.user.id,
          data: {
            name: form.name,
            username: form.username,
            role: form.role,
            active: form.active,
            modules: form.modules,
            sectorIds: form.sectorIds,
            ...(form.password ? { password: form.password } : {}),
          },
        },
        {
          onSuccess: () => {
            close();
            setNotice("Usuario actualizado.");
            refresh();
          },
        },
      );
      return;
    }
    create.mutate(
      { data },
      {
        onSuccess: () => {
          close();
          setNotice("Usuario creado. Podrá ingresar con la contraseña inicial.");
          refresh();
        },
      },
    );
  };

  const busy = create.isPending || update.isPending || reset.isPending || remove.isPending;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = users.data || [];
    if (!q) return list;
    return list.filter((u) => u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q));
  }, [users.data, search]);

  const moduleLabel = (key: string) => MODULE_CATALOG.find((m) => m.key === key)?.label || key;

  return (
    <main className="content-wrap usr-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow">Espacio / Usuarios</div>
          <h1 className="page-title">Usuarios y permisos</h1>
          <p className="page-subtitle">Creá accesos internos y definí qué módulos y sectores puede ver cada persona.</p>
        </div>
        <button className="btn btn-primary" onClick={() => open("create")} data-testid="button-create-user">
          <Plus size={16} /> Nuevo usuario
        </button>
      </div>

      {notice ? (
        <div className="card" style={{ marginTop: 14, padding: "12px 16px", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 13 }}>{notice}</span>
          <button type="button" className="btn btn-quiet" onClick={() => setNotice("")}>
            Cerrar
          </button>
        </div>
      ) : null}

      <div className="user-summary-grid" style={{ marginTop: 16 }}>
        <Metric label="Usuarios activos" value={(users.data || []).filter((u) => u.active).length} note="Con acceso habilitado" icon={<Users size={16} />} />
        <Metric label="Pendientes de confirmar" value={(users.data || []).filter((u) => u.mustChangePassword).length} note="Primer ingreso" icon={<ShieldCheck size={16} />} />
        <Metric label="Responsables" value={(users.data || []).filter((u) => u.role === "responsable").length} note="Con permisos ampliados" icon={<Settings2 size={16} />} />
      </div>

      <div className="agenda-toolbar" style={{ marginTop: 14 }}>
        <div className="search-control">
          <Search size={15} />
          <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o usuario" data-testid="input-search-users" />
        </div>
        <div style={{ marginLeft: "auto", color: "hsl(var(--muted-foreground))", fontSize: 11 }}>
          <span className="font-mono">{filtered.length.toString().padStart(2, "0")}</span> usuarios
        </div>
      </div>

      {users.isLoading ? (
        <div className="card" style={{ padding: 20, display: "grid", gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <div className="skeleton" style={{ height: 52 }} key={i} />
          ))}
        </div>
      ) : users.isError ? (
        <StatusMessage title="No se pudieron cargar los usuarios" detail="Revisá tu sesión de superadmin e intentá nuevamente." action={() => users.refetch()} />
      ) : (
        <div className="card agenda-table-wrap">
          <table className="agenda-table users-table">
            <thead>
              <tr>
                <th>Persona</th>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Módulos</th>
                <th>Estado</th>
                <th style={{ textAlign: "right" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? (
                filtered.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="agenda-title">{user.name}</div>
                      <div className="agenda-description">{user.lastLoginAt ? `Último acceso: ${formatDate(user.lastLoginAt)}` : "Sin accesos registrados"}</div>
                    </td>
                    <td>
                      <span className="font-mono">@{user.username}</span>
                    </td>
                    <td>
                      <span className={`badge ${user.role === "responsable" ? "badge-type" : "badge-done"}`}>{user.role === "responsable" ? "Responsable" : user.role === "superadmin" ? "Superadmin" : "Usuario"}</span>
                    </td>
                    <td>
                      <div className="module-pills">
                        {(user.modules || []).slice(0, 3).map((m) => (
                          <span className="badge badge-type" key={m}>
                            {moduleLabel(m)}
                          </span>
                        ))}
                        {(user.modules || []).length > 3 && <span className="badge badge-type">+{user.modules.length - 3}</span>}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${user.active ? "badge-done" : "badge-pending"}`}>{user.active ? (user.mustChangePassword ? "Primer acceso" : "Activo") : "Inactivo"}</span>
                    </td>
                    <td>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                        {user.role !== "superadmin" && (
                          <>
                            <button type="button" className="btn btn-icon btn-quiet" title="Editar" onClick={() => open("edit", user)}>
                              <Pencil size={14} />
                            </button>
                            <button type="button" className="btn btn-icon btn-quiet" title="Restablecer contraseña" onClick={() => open("reset", user)}>
                              <KeyRound size={14} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-icon btn-quiet"
                              title="Eliminar"
                              onClick={() => {
                                if (confirm(`¿Eliminar a ${user.name}?`)) {
                                  remove.mutate({ id: user.id }, { onSuccess: () => refresh() });
                                }
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 28, color: "hsl(var(--muted-foreground))" }}>
                    No hay usuarios que coincidan con la búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal.open ? (
        <div className="modal-backdrop" onClick={close}>
          <div className="modal usr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="usr-modal-head">
              <div>
                <div className="eyebrow">{modal.mode === "create" ? "Nuevo acceso" : modal.mode === "edit" ? "Editar acceso" : "Seguridad"}</div>
                <h2 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 800 }}>
                  {modal.mode === "create" ? "Crear usuario" : modal.mode === "edit" ? "Editar usuario" : "Restablecer contraseña"}
                </h2>
              </div>
              <button type="button" className="btn btn-icon btn-quiet" onClick={close} aria-label="Cerrar">
                ×
              </button>
            </div>

            <form onSubmit={save} className="usr-modal-body">
              {modal.mode === "reset" ? (
                <label className="field">
                  <span className="field-label">Nueva contraseña</span>
                  <input className="input" type="password" minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required autoComplete="new-password" />
                </label>
              ) : (
                <>
                  <div className="usr-form-grid">
                    <label className="field">
                      <span className="field-label">Nombre y apellido</span>
                      <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required data-testid="input-user-name" />
                    </label>
                    <label className="field">
                      <span className="field-label">Usuario</span>
                      <input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required data-testid="input-user-username" />
                    </label>
                    <label className="field">
                      <span className="field-label">{modal.mode === "create" ? "Contraseña inicial" : "Contraseña (opcional)"}</span>
                      <input
                        className="input"
                        type="password"
                        minLength={6}
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        autoComplete="new-password"
                        required={modal.mode === "create"}
                        data-testid="input-user-password"
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">Estado</span>
                      <select className="select" value={form.active ? "activo" : "inactivo"} onChange={(e) => setForm({ ...form, active: e.target.value === "activo" })}>
                        <option value="activo">Activo</option>
                        <option value="inactivo">Inactivo</option>
                      </select>
                    </label>
                  </div>

                  <div className="usr-section">
                    <div className="usr-section-title">Perfil</div>
                    <div className="usr-role-row">
                      <button type="button" className={`usr-role-chip ${form.role === "usuario" ? "is-on" : ""}`} onClick={() => { setPresetId(null); setForm({ ...form, role: "usuario" }); }}>
                        Usuario
                      </button>
                      <button type="button" className={`usr-role-chip ${form.role === "responsable" ? "is-on" : ""}`} onClick={() => { setPresetId(null); setForm({ ...form, role: "responsable" }); }}>
                        Responsable de sector
                      </button>
                    </div>
                    <p className="usr-hint">El responsable gestiona sus sectores; el usuario tiene consulta según módulos asignados.</p>
                  </div>

                  <div className="usr-section">
                    <div className="usr-section-title">Permisos rápidos</div>
                    <div className="usr-preset-grid">
                      {PRESETS.map((p) => (
                        <button key={p.id} type="button" className={`usr-preset ${presetId === p.id ? "is-on" : ""}`} onClick={() => applyPreset(p.id)}>
                          <span className="usr-preset-label">{p.label}</span>
                          <span className="usr-preset-hint">{p.hint}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="usr-section">
                    <div className="usr-section-head">
                      <div className="usr-section-title" style={{ margin: 0 }}>
                        Módulos habilitados
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" className="btn btn-quiet" style={{ fontSize: 11, padding: "4px 10px" }} onClick={selectAllModules}>
                          Todos
                        </button>
                        <button type="button" className="btn btn-quiet" style={{ fontSize: 11, padding: "4px 10px" }} onClick={clearModules}>
                          Solo resumen
                        </button>
                      </div>
                    </div>
                    <div className="usr-module-grid">
                      {MODULE_CATALOG.map((m) => {
                        const Icon = m.icon;
                        const on = form.modules.includes(m.key);
                        return (
                          <button key={m.key} type="button" className={`usr-module-card ${on ? "is-on" : ""}`} onClick={() => toggleModule(m.key)} data-testid={`toggle-module-${m.key}`}>
                            <span className="usr-module-check">{on ? <Check size={12} strokeWidth={3} /> : null}</span>
                            <span className="usr-module-icon">
                              <Icon size={16} />
                            </span>
                            <span className="usr-module-text">
                              <span className="usr-module-name">{m.label}</span>
                              <span className="usr-module-desc">{m.desc}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="usr-section">
                    <div className="usr-section-title">Sectores asignados</div>
                    <p className="usr-hint">Limitá la vista a sectores concretos. Vacío = sin restricción por sector (según rol).</p>
                    <div className="usr-sector-grid">
                      {(sectors.data || []).map((sector) => {
                        const on = form.sectorIds.includes(sector.id);
                        return (
                          <button key={sector.id} type="button" className={`usr-sector-chip ${on ? "is-on" : ""}`} onClick={() => toggleSector(sector.id)}>
                            {on ? <Check size={12} strokeWidth={3} /> : null}
                            {sector.name}
                          </button>
                        );
                      })}
                      {!sectors.data?.length && <span className="usr-hint">No hay sectores cargados aún.</span>}
                    </div>
                  </div>
                </>
              )}

              <div className="usr-modal-actions">
                <button type="button" className="btn btn-quiet" onClick={close}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? "Guardando…" : modal.mode === "reset" ? "Restablecer contraseña" : modal.mode === "create" ? "Crear usuario" : "Guardar cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
