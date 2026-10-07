import { FormEvent, useMemo, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  Check,
  ClipboardList,
  KeyRound,
  LayoutDashboard,
  Package,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  Wallet,
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
import { useQueryClient } from "@tanstack/react-query";

const MODULE_CATALOG = [
  { key: "dashboard", label: "Resumen", desc: "Panel de inicio", icon: LayoutDashboard },
  { key: "administracion", label: "Administración", desc: "Vencimientos y calendario", icon: ClipboardList },
  { key: "guardias", label: "Guardias Médicas", desc: "Calendario y carga", icon: CalendarDays },
  { key: "inventario", label: "Inventario", desc: "Activos fijos", icon: Package },
  { key: "instructivos", label: "Instructivos", desc: "PDFs por sector", icon: BookOpen },
  { key: "liquidacion", label: "Liquidación", desc: "Placeholder", icon: Wallet },
] as const;

type ModuleKey = (typeof MODULE_CATALOG)[number]["key"];

const PRESETS: { id: string; label: string; hint: string; role: "usuario" | "responsable"; modules: ModuleKey[] }[] = [
  { id: "consulta", label: "Solo consulta", hint: "Resumen + instructivos", role: "usuario", modules: ["dashboard", "instructivos"] },
  { id: "operativo", label: "Operativo", hint: "Admin + guardias + inventario", role: "usuario", modules: ["dashboard", "administracion", "guardias", "inventario", "instructivos"] },
  { id: "responsable", label: "Responsable sector", hint: "Rol responsable + operativos", role: "responsable", modules: ["dashboard", "administracion", "guardias", "inventario", "instructivos"] },
  { id: "completo", label: "Acceso amplio", hint: "Todos los módulos", role: "usuario", modules: ["dashboard", "administracion", "liquidacion", "guardias", "inventario", "instructivos"] },
];

function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return value;
  }
}

function Metric({ label, value, note, icon }: { label: string; value: string | number; note: string; icon: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "center" }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center", background: "hsl(var(--primary) / .12)", color: "hsl(var(--primary))", flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>{note}</div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, marginBottom: 6, color: "hsl(var(--muted-foreground))" };
const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box" };
const sectionTitle: React.CSSProperties = { fontSize: 13, fontWeight: 800, marginBottom: 8, marginTop: 4 };
const hintStyle: React.CSSProperties = { fontSize: 12, color: "hsl(var(--muted-foreground))", margin: "0 0 10px", lineHeight: 1.4 };

export default function UsuariosPage() {
  const queryClient = useQueryClient();
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
      modules: user?.modules?.length ? [...user.modules] : ["dashboard"],
      sectorIds: user?.sectorIds ? [...user.sectorIds] : [],
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
            setNotice("Contraseña restablecida. El usuario deberá cambiarla al ingresar.");
            refresh();
          },
        },
      );
      return;
    }
    if (modal.mode === "edit" && modal.user) {
      update.mutate(
        {
          id: modal.user.id,
          data: {
            name: form.name.trim(),
            username: form.username.trim(),
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
    const data: CreateUserBody = {
      name: form.name.trim(),
      username: form.username.trim(),
      password: form.password,
      role: form.role,
      active: form.active,
      modules: form.modules,
      sectorIds: form.sectorIds,
    };
    create.mutate(
      { data },
      {
        onSuccess: () => {
          close();
          setNotice("Usuario creado. Puede ingresar con la contraseña inicial.");
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

  const total = users.data?.length || 0;
  const activos = users.data?.filter((u) => u.active).length || 0;
  const responsables = users.data?.filter((u) => u.role === "responsable" || u.role === "superadmin").length || 0;

  return (
    <main className="content-wrap usr-page" style={{ padding: "20px 24px 40px", maxWidth: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow">Espacio / Usuarios</div>
          <h1 className="page-title">Usuarios y permisos</h1>
          <p className="page-subtitle">Alta, edición y módulos visibles por persona.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => open("create")} data-testid="button-create-user">
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginTop: 16 }}>
        <Metric label="Total" value={total} note="Cuentas cargadas" icon={<Users size={18} />} />
        <Metric label="Activos" value={activos} note="Pueden iniciar sesión" icon={<ShieldCheck size={18} />} />
        <Metric label="Responsables" value={responsables} note="Rol elevado" icon={<KeyRound size={18} />} />
      </div>

      <div className="card" style={{ marginTop: 16, padding: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.45 }} />
            <input className="input" style={{ ...inputStyle, paddingLeft: 36 }} placeholder="Buscar por nombre o usuario…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {users.isLoading ? (
          <div style={{ padding: 24, textAlign: "center", color: "hsl(var(--muted-foreground))" }}>Cargando usuarios…</div>
        ) : users.isError ? (
          <div style={{ padding: 24, textAlign: "center" }}>
            <div style={{ fontWeight: 700 }}>No se pudo cargar</div>
            <button type="button" className="btn btn-quiet" style={{ marginTop: 10 }} onClick={() => users.refetch()}>
              Reintentar
            </button>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="agenda-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 11 }}>Nombre</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 11 }}>Usuario</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 11 }}>Rol</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 11 }}>Módulos</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 11 }}>Estado</th>
                  <th style={{ textAlign: "right", padding: "10px 12px", fontSize: 11 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id}>
                    <td style={{ padding: "12px", fontWeight: 600 }}>{u.name}</td>
                    <td style={{ padding: "12px" }}>@{u.username}</td>
                    <td style={{ padding: "12px" }}>{u.role === "superadmin" ? "Superadmin" : u.role === "responsable" ? "Responsable" : "Usuario"}</td>
                    <td style={{ padding: "12px", fontSize: 12, maxWidth: 220 }}>
                      {u.role === "superadmin" ? "Todos" : (u.modules || []).map(moduleLabel).join(", ") || "—"}
                    </td>
                    <td style={{ padding: "12px" }}>{u.active ? "Activo" : "Inactivo"}</td>
                    <td style={{ padding: "12px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {u.role !== "superadmin" ? (
                        <>
                          <button type="button" className="btn btn-quiet btn-icon" title="Editar" onClick={() => open("edit", u)}>
                            <Pencil size={15} />
                          </button>
                          <button type="button" className="btn btn-quiet btn-icon" title="Contraseña" onClick={() => open("reset", u)}>
                            <KeyRound size={15} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-quiet btn-icon"
                            title="Eliminar"
                            onClick={() => {
                              if (confirm(`¿Eliminar a ${u.name}?`)) {
                                remove.mutate({ id: u.id }, { onSuccess: () => { setNotice("Usuario eliminado."); refresh(); } });
                              }
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </>
                      ) : (
                        <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>Protegido</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr>
                    <td colSpan={6} style={{ padding: 28, textAlign: "center", color: "hsl(var(--muted-foreground))" }}>
                      No hay usuarios para mostrar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal.open ? (
        <div
          className="modal-backdrop"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60 }}
          onClick={close}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: 520,
              maxHeight: "92vh",
              overflowY: "auto",
              padding: "22px 22px 18px",
              boxSizing: "border-box",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))" }}>
                {modal.mode === "create" ? "Nuevo acceso" : modal.mode === "edit" ? "Editar acceso" : "Seguridad"}
              </div>
              <h2 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 800 }}>
                {modal.mode === "create" ? "Crear usuario" : modal.mode === "edit" ? "Editar usuario" : "Restablecer contraseña"}
              </h2>
            </div>

            <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {modal.mode === "reset" ? (
                <>
                  <p style={hintStyle}>
                    Nueva contraseña para <strong>{modal.user?.name}</strong> (@{modal.user?.username}). Deberá cambiarla al ingresar.
                  </p>
                  <div>
                    <label style={labelStyle}>Nueva contraseña</label>
                    <input className="input" style={inputStyle} type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoFocus />
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={labelStyle}>Nombre y apellido</label>
                      <input className="input" style={inputStyle} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
                    </div>
                    <div>
                      <label style={labelStyle}>Usuario</label>
                      <input className="input" style={inputStyle} required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, "") })} />
                    </div>
                    <div>
                      <label style={labelStyle}>{modal.mode === "create" ? "Contraseña inicial" : "Nueva contraseña (opcional)"}</label>
                      <input className="input" style={inputStyle} type="password" minLength={6} required={modal.mode === "create"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                    </div>
                    <div>
                      <label style={labelStyle}>Estado</label>
                      <select className="select" style={inputStyle} value={form.active ? "1" : "0"} onChange={(e) => setForm({ ...form, active: e.target.value === "1" })}>
                        <option value="1">Activo</option>
                        <option value="0">Inactivo</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <div style={sectionTitle}>Rol</div>
                    <p style={hintStyle}>El responsable gestiona con más permisos de escritura; el usuario consulta según módulos.</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      {(
                        [
                          { id: "usuario" as const, title: "Usuario", text: "Consulta según módulos asignados" },
                          { id: "responsable" as const, title: "Responsable de sector", text: "Escritura en sus sectores y módulos" },
                        ] as const
                      ).map((r) => {
                        const on = form.role === r.id;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => {
                              setPresetId(null);
                              setForm((p) => ({ ...p, role: r.id }));
                            }}
                            style={{
                              textAlign: "left",
                              padding: "12px 14px",
                              borderRadius: 12,
                              border: on ? "2px solid hsl(var(--primary))" : "1px solid hsl(var(--border))",
                              background: on ? "hsl(var(--primary) / .08)" : "hsl(var(--card))",
                              cursor: "pointer",
                              font: "inherit",
                              color: "inherit",
                            }}
                          >
                            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>{r.title}</div>
                            <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", lineHeight: 1.35 }}>{r.text}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div style={sectionTitle}>Permisos rápidos</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {PRESETS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => applyPreset(p.id)}
                          title={p.hint}
                          style={{
                            padding: "8px 12px",
                            borderRadius: 999,
                            border: presetId === p.id ? "2px solid hsl(var(--primary))" : "1px solid hsl(var(--border))",
                            background: presetId === p.id ? "hsl(var(--primary) / .1)" : "transparent",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                            font: "inherit",
                            color: "inherit",
                          }}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <div style={sectionTitle}>Módulos que puede ver</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" className="btn btn-quiet" style={{ fontSize: 12, padding: "6px 10px" }} onClick={selectAllModules}>
                          Todos
                        </button>
                        <button type="button" className="btn btn-quiet" style={{ fontSize: 12, padding: "6px 10px" }} onClick={clearModules}>
                          Solo resumen
                        </button>
                      </div>
                    </div>
                    <p style={hintStyle}>Marcá qué secciones aparecen en el menú lateral de esta persona.</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {MODULE_CATALOG.map((m) => {
                        const on = form.modules.includes(m.key);
                        const Icon = m.icon;
                        return (
                          <button
                            key={m.key}
                            type="button"
                            data-testid={`toggle-module-${m.key}`}
                            onClick={() => toggleModule(m.key)}
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 10,
                              textAlign: "left",
                              padding: "10px 12px",
                              borderRadius: 12,
                              border: on ? "2px solid hsl(var(--primary))" : "1px solid hsl(var(--border))",
                              background: on ? "hsl(var(--primary) / .08)" : "hsl(var(--card))",
                              cursor: "pointer",
                              font: "inherit",
                              color: "inherit",
                              minHeight: 64,
                              boxSizing: "border-box",
                            }}
                          >
                            <span
                              style={{
                                width: 18,
                                height: 18,
                                borderRadius: 5,
                                border: on ? "none" : "1px solid hsl(var(--border))",
                                background: on ? "hsl(var(--primary))" : "transparent",
                                color: "#fff",
                                display: "grid",
                                placeItems: "center",
                                flexShrink: 0,
                                marginTop: 2,
                              }}
                            >
                              {on ? <Check size={11} strokeWidth={3} /> : null}
                            </span>
                            <span style={{ minWidth: 0 }}>
                              <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 800, fontSize: 13 }}>
                                <Icon size={14} />
                                {m.label}
                              </span>
                              <span style={{ display: "block", fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 2, lineHeight: 1.3 }}>{m.desc}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div style={sectionTitle}>Sectores asignados</div>
                    <p style={hintStyle}>Vacío = sin filtro extra por sector (según rol). Útil para responsables de un área.</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {(sectors.data || []).map((sector) => {
                        const on = form.sectorIds.includes(sector.id);
                        return (
                          <button
                            key={sector.id}
                            type="button"
                            onClick={() => toggleSector(sector.id)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "8px 12px",
                              borderRadius: 999,
                              border: on ? "2px solid hsl(var(--primary))" : "1px solid hsl(var(--border))",
                              background: on ? "hsl(var(--primary) / .1)" : "transparent",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                              font: "inherit",
                              color: "inherit",
                            }}
                          >
                            {on ? <Check size={12} strokeWidth={3} /> : null}
                            {sector.name}
                          </button>
                        );
                      })}
                      {!sectors.data?.length && <span style={hintStyle}>No hay sectores cargados aún.</span>}
                    </div>
                  </div>
                </>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 8, borderTop: "1px solid hsl(var(--border))" }}>
                <button type="button" className="btn btn-quiet" onClick={close} disabled={busy}>
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
