import { FormEvent, useMemo, useState } from "react";
import {
  BookOpen, CalendarDays, Check, ClipboardList, KeyRound, LayoutDashboard,
  Package, Pencil, Plus, Search, Settings2, ShieldCheck, Trash2, Users, Wallet,
} from "lucide-react";
import {
  getListSectorsQueryKey, getListUsersQueryKey, useCreateUser, useDeleteUser,
  useListSectors, useListUsers, useResetUserPassword, useUpdateUser, type UserAdmin,
} from "@salvador/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const MODULE_CATALOG = [
  { key: "dashboard", label: "Resumen", desc: "Panel de inicio", icon: LayoutDashboard },
  { key: "administracion", label: "Administración", desc: "Vencimientos y calendario", icon: ClipboardList },
  { key: "guardias", label: "Guardias Médicas", desc: "Calendario y carga", icon: CalendarDays },
  { key: "inventario", label: "Inventario", desc: "Activos fijos", icon: Package },
  { key: "instructivos", label: "Instructivos", desc: "PDFs por sector", icon: BookOpen },
  { key: "liquidacion", label: "Liquidación", desc: "Placeholder", icon: Wallet },
  { key: "configuracion", label: "Configuración", desc: "Sectores", icon: Settings2 },
] as const;

function errMessage(err: unknown): string {
  if (!err) return "Error desconocido.";
  if (typeof err === "string") return err;
  const e = err as { message?: string; data?: { message?: string; error?: string } };
  if (e?.data?.message) return e.data.message;
  if (e?.data?.error) return String(e.data.error);
  if (e?.message) return e.message.replace(/^HTTP \d+ [^:]+:\s*/i, "") || e.message;
  return "No se pudo completar la operación.";
}

const L: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, marginBottom: 6, color: "hsl(var(--muted-foreground))" };
const I: React.CSSProperties = { width: "100%", boxSizing: "border-box" };
const T: React.CSSProperties = { fontSize: 14, fontWeight: 800, margin: "0 0 6px" };
const H: React.CSSProperties = { fontSize: 12, color: "hsl(var(--muted-foreground))", margin: "0 0 12px", lineHeight: 1.45 };

export default function UsuariosPage() {
  const qc = useQueryClient();
  const users = useListUsers({ query: { queryKey: getListUsersQueryKey(), retry: false } });
  const sectors = useListSectors({ query: { queryKey: getListSectorsQueryKey(), retry: false } });
  const create = useCreateUser();
  const update = useUpdateUser();
  const remove = useDeleteUser();
  const resetPw = useResetUserPassword();

  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ open: boolean; mode: "create" | "edit" | "reset"; user?: UserAdmin }>({ open: false, mode: "create" });
  const [form, setForm] = useState({
    name: "", username: "", password: "",
    role: "usuario" as "usuario" | "responsable",
    active: true, modules: ["dashboard"] as string[], sectorIds: [] as number[],
  });
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");

  const open = (mode: "create" | "edit" | "reset", user?: UserAdmin) => {
    setModal({ open: true, mode, user });
    setFormError("");
    setForm({
      name: user?.name || "", username: user?.username || "", password: "",
      role: user?.role === "responsable" ? "responsable" : "usuario",
      active: user?.active ?? true,
      modules: user?.modules?.length ? [...user.modules] : ["dashboard"],
      sectorIds: user?.sectorIds ? [...user.sectorIds] : [],
    });
  };
  const close = () => { setModal({ open: false, mode: "create" }); setFormError(""); };
  const refresh = () => qc.invalidateQueries({ queryKey: getListUsersQueryKey() });

  const toggleModule = (key: string) => {
    setForm((prev) => {
      if (key === "dashboard" && prev.modules.length === 1 && prev.modules[0] === "dashboard") return prev;
      let modules = prev.modules.includes(key) ? prev.modules.filter((m) => m !== key) : [...prev.modules, key];
      if (!modules.includes("dashboard")) modules = ["dashboard", ...modules];
      return { ...prev, modules };
    });
  };
  const toggleSector = (id: number) => {
    setForm((prev) => ({
      ...prev,
      sectorIds: prev.sectorIds.includes(id) ? prev.sectorIds.filter((s) => s !== id) : [...prev.sectorIds, id],
    }));
  };

  const save = (ev: FormEvent) => {
    ev.preventDefault();
    setFormError("");
    if (modal.mode === "reset" && modal.user) {
      if (form.password.length < 6) { setFormError("Contraseña mínima 6 caracteres."); return; }
      resetPw.mutate(
        { id: modal.user.id, data: { password: form.password } },
        { onSuccess: () => { close(); setNotice("Contraseña restablecida."); refresh(); }, onError: (e) => setFormError(errMessage(e)) },
      );
      return;
    }
    if (!form.name.trim() || !form.username.trim()) { setFormError("Nombre y usuario obligatorios."); return; }
    if (modal.mode === "create" && form.password.length < 6) { setFormError("Contraseña mínima 6 caracteres."); return; }

    const base = {
      name: form.name.trim(),
      username: form.username.trim().toLowerCase().replace(/\s+/g, ""),
      role: form.role,
      active: form.active,
      modules: form.modules.length ? form.modules : ["dashboard"],
      sectorIds: form.sectorIds,
    };

    if (modal.mode === "edit" && modal.user) {
      update.mutate(
        { id: modal.user.id, data: { ...base, ...(form.password ? { password: form.password } : {}) } },
        { onSuccess: () => { close(); setNotice("Usuario actualizado."); refresh(); }, onError: (e) => setFormError(errMessage(e)) },
      );
      return;
    }
    create.mutate(
      { data: { ...base, password: form.password } },
      { onSuccess: () => { close(); setNotice("Usuario creado."); refresh(); }, onError: (e) => setFormError(errMessage(e)) },
    );
  };

  const busy = create.isPending || update.isPending || resetPw.isPending || remove.isPending;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = users.data || [];
    if (!q) return list;
    return list.filter((u) => u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q));
  }, [users.data, search]);
  const ml = (k: string) => MODULE_CATALOG.find((m) => m.key === k)?.label || k;

  return (
    <main className="content-wrap usr-page" style={{ padding: "20px 24px 40px", boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <div className="eyebrow">Espacio / Usuarios</div>
          <h1 className="page-title">Usuarios y permisos</h1>
          <p className="page-subtitle">Módulos visibles y si puede solo ver o también modificar.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => open("create")}><Plus size={16} /> Nuevo usuario</button>
      </div>

      {notice ? (
        <div className="card" style={{ marginTop: 14, padding: "12px 16px", display: "flex", justifyContent: "space-between", background: "hsl(150 40% 95%)" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{notice}</span>
          <button type="button" className="btn btn-quiet" onClick={() => setNotice("")}>Cerrar</button>
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 16, padding: 16 }}>
        <div style={{ position: "relative", maxWidth: 320, marginBottom: 14 }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.45 }} />
          <input className="input" style={{ ...I, paddingLeft: 36 }} placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {users.isError ? (
          <div style={{ padding: 20, textAlign: "center" }}>
            <div style={{ fontWeight: 700 }}>No se pudo cargar</div>
            <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", margin: "8px 0" }}>{errMessage(users.error)}</div>
            <button type="button" className="btn btn-quiet" onClick={() => users.refetch()}>Reintentar</button>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                  {["Nombre", "Usuario", "Acceso", "Módulos", "Estado", ""].map((h, i) => (
                    <th key={i} style={{ textAlign: i === 5 ? "right" : "left", padding: "10px 12px", fontSize: 11, color: "hsl(var(--muted-foreground))" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} style={{ borderBottom: "1px solid hsl(var(--border) / .5)" }}>
                    <td style={{ padding: 12, fontWeight: 600 }}>{u.name}</td>
                    <td style={{ padding: 12 }}>@{u.username}</td>
                    <td style={{ padding: 12 }}>{u.role === "superadmin" ? "Total" : u.role === "responsable" ? "Ver y modificar" : "Solo ver"}</td>
                    <td style={{ padding: 12, fontSize: 12 }}>{u.role === "superadmin" ? "Todos" : (u.modules || []).map(ml).join(", ") || "—"}</td>
                    <td style={{ padding: 12 }}>{u.active ? "Activo" : "Inactivo"}</td>
                    <td style={{ padding: 12, textAlign: "right", whiteSpace: "nowrap" }}>
                      {u.role !== "superadmin" ? (
                        <>
                          <button type="button" className="btn btn-quiet btn-icon" title="Editar" onClick={() => open("edit", u)}><Pencil size={15} /></button>
                          <button type="button" className="btn btn-quiet btn-icon" title="Clave" onClick={() => open("reset", u)}><KeyRound size={15} /></button>
                          <button type="button" className="btn btn-quiet btn-icon" title="Eliminar" onClick={() => {
                            if (!confirm(`¿Eliminar a ${u.name}?`)) return;
                            remove.mutate({ id: u.id }, { onSuccess: () => { setNotice("Eliminado."); refresh(); }, onError: (e) => setNotice(errMessage(e)) });
                          }}><Trash2 size={15} /></button>
                        </>
                      ) : <span style={{ fontSize: 11, opacity: 0.6 }}>Protegido</span>}
                    </td>
                  </tr>
                ))}
                {!filtered.length && !users.isLoading && (
                  <tr><td colSpan={6} style={{ padding: 28, textAlign: "center", color: "hsl(var(--muted-foreground))" }}>Sin usuarios</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal.open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 80 }} onClick={close}>
          <div className="card" style={{ width: "100%", maxWidth: 540, maxHeight: "92vh", overflowY: "auto", padding: 22, boxSizing: "border-box" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "hsl(var(--muted-foreground))" }}>
              {modal.mode === "create" ? "Nuevo acceso" : modal.mode === "edit" ? "Editar permisos" : "Seguridad"}
            </div>
            <h2 style={{ margin: "4px 0 14px", fontSize: 20, fontWeight: 800 }}>
              {modal.mode === "create" ? "Crear usuario" : modal.mode === "edit" ? "Editar usuario" : "Restablecer contraseña"}
            </h2>

            <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {formError && (
                <div style={{ padding: "12px 14px", borderRadius: 10, background: "hsl(0 70% 95%)", color: "hsl(0 55% 32%)", fontSize: 13, fontWeight: 600 }}>{formError}</div>
              )}

              {modal.mode === "reset" ? (
                <div>
                  <label style={L}>Nueva contraseña</label>
                  <input className="input" style={I} type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoFocus />
                </div>
              ) : (
                <>
                  <div>
                    <div style={T}>Datos de acceso</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <label style={L}>Nombre y apellido</label>
                        <input className="input" style={I} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
                      </div>
                      <div>
                        <label style={L}>Usuario</label>
                        <input className="input" style={I} required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, "") })} />
                      </div>
                      <div>
                        <label style={L}>{modal.mode === "create" ? "Contraseña (mín. 6)" : "Nueva clave (opcional)"}</label>
                        <input className="input" style={I} type="password" minLength={6} required={modal.mode === "create"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                      </div>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <label style={L}>Estado</label>
                        <select className="select" style={I} value={form.active ? "1" : "0"} onChange={(e) => setForm({ ...form, active: e.target.value === "1" })}>
                          <option value="1">Activo</option>
                          <option value="0">Inactivo</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div style={T}>Nivel de permiso</div>
                    <p style={H}>Define si solo consulta o también crea, edita y elimina en sus módulos.</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      {([
                        { id: "usuario" as const, title: "Solo ver", text: "Consulta. No crea ni borra." },
                        { id: "responsable" as const, title: "Ver y modificar", text: "Puede crear, editar y eliminar." },
                      ]).map((r) => {
                        const on = form.role === r.id;
                        return (
                          <button key={r.id} type="button" onClick={() => setForm((p) => ({ ...p, role: r.id }))} style={{
                            textAlign: "left", padding: 14, borderRadius: 12, cursor: "pointer", font: "inherit", color: "inherit",
                            border: on ? "2px solid hsl(var(--primary))" : "1px solid hsl(var(--border))",
                            background: on ? "hsl(var(--primary) / .08)" : "hsl(var(--card))",
                          }}>
                            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>{r.title}</div>
                            <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>{r.text}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <div style={T}>Módulos que puede ver</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" className="btn btn-quiet" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => setForm((p) => ({ ...p, modules: MODULE_CATALOG.map((m) => m.key) }))}>Todos</button>
                        <button type="button" className="btn btn-quiet" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => setForm((p) => ({ ...p, modules: ["dashboard"] }))}>Solo resumen</button>
                      </div>
                    </div>
                    <p style={H}>Aparecen en el menú. Resumen siempre habilitado.</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {MODULE_CATALOG.map((m) => {
                        const on = form.modules.includes(m.key);
                        const Icon = m.icon;
                        return (
                          <button key={m.key} type="button" onClick={() => toggleModule(m.key)} style={{
                            display: "flex", gap: 10, textAlign: "left", padding: 12, borderRadius: 12, cursor: "pointer",
                            font: "inherit", color: "inherit", minHeight: 64, boxSizing: "border-box", alignItems: "flex-start",
                            border: on ? "2px solid hsl(var(--primary))" : "1px solid hsl(var(--border))",
                            background: on ? "hsl(var(--primary) / .08)" : "hsl(var(--card))",
                          }}>
                            <span style={{
                              width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1, display: "grid", placeItems: "center",
                              border: on ? "none" : "1.5px solid hsl(var(--border))", background: on ? "hsl(var(--primary))" : "transparent", color: "#fff",
                            }}>{on ? <Check size={12} strokeWidth={3} /> : null}</span>
                            <span>
                              <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 800, fontSize: 13 }}><Icon size={14} />{m.label}</span>
                              <span style={{ display: "block", fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 3 }}>
                                {m.desc}{on ? (form.role === "responsable" ? " · puede modificar" : " · solo lectura") : ""}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div style={T}>Sectores (opcional)</div>
                    <p style={H}>Vacío = sin filtro. Si marcás, limita a esos sectores.</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {(sectors.data || []).map((s) => {
                        const on = form.sectorIds.includes(s.id);
                        return (
                          <button key={s.id} type="button" onClick={() => toggleSector(s.id)} style={{
                            display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 999,
                            fontSize: 12, fontWeight: 600, cursor: "pointer", font: "inherit", color: "inherit",
                            border: on ? "2px solid hsl(var(--primary))" : "1px solid hsl(var(--border))",
                            background: on ? "hsl(var(--primary) / .1)" : "transparent",
                          }}>{on ? <Check size={12} strokeWidth={3} /> : null}{s.name}</button>
                        );
                      })}
                      {!sectors.data?.length && <span style={H}>No hay sectores.</span>}
                    </div>
                  </div>
                </>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 8, borderTop: "1px solid hsl(var(--border))" }}>
                <button type="button" className="btn btn-quiet" onClick={close} disabled={busy}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? "Guardando…" : modal.mode === "reset" ? "Restablecer" : modal.mode === "create" ? "Crear usuario" : "Guardar cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
