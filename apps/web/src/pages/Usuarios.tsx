import { FormEvent, useMemo, useState } from "react";
import { KeyRound, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  getListUsersQueryKey,
  useCreateUser,
  useDeleteUser,
  useListUsers,
  useResetUserPassword,
  useUpdateUser,
  type UserAdmin,
} from "@salvador/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

function errMessage(err: unknown): string {
  if (!err) return "Error desconocido.";
  if (typeof err === "string") return err;
  const e = err as { message?: string; data?: { message?: string; error?: string } };
  if (e?.data?.message) return e.data.message;
  if (e?.data?.error) return String(e.data.error);
  if (e?.message) return e.message.replace(/^HTTP \d+ [^:]+:\s*/i, "") || e.message;
  return "No se pudo completar la operación.";
}

function nivelLabel(role: string) {
  if (role === "superadmin") return "Nivel 3 · Total";
  if (role === "responsable") return "Nivel 2 · Operativo";
  return "Nivel 1 · Solo lectura";
}

const I: React.CSSProperties = { width: "100%", boxSizing: "border-box" };
const L: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 6,
  color: "hsl(var(--muted-foreground))",
};

export default function UsuariosPage() {
  const qc = useQueryClient();
  const users = useListUsers({ query: { queryKey: getListUsersQueryKey(), retry: false } });
  const create = useCreateUser();
  const update = useUpdateUser();
  const remove = useDeleteUser();
  const resetPw = useResetUserPassword();

  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"create" | "edit" | "reset" | null>(null);
  const [selected, setSelected] = useState<UserAdmin | null>(null);
  const [form, setForm] = useState({ name: "", username: "", password: "", active: true });
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");

  const openCreate = () => {
    setSelected(null);
    setForm({ name: "", username: "", password: "", active: true });
    setFormError("");
    setModal("create");
  };
  const openEdit = (u: UserAdmin) => {
    setSelected(u);
    setForm({ name: u.name, username: u.username, password: "", active: u.active });
    setFormError("");
    setModal("edit");
  };
  const openReset = (u: UserAdmin) => {
    setSelected(u);
    setForm({ name: u.name, username: u.username, password: "", active: u.active });
    setFormError("");
    setModal("reset");
  };
  const close = () => {
    setModal(null);
    setFormError("");
  };
  const refresh = () => qc.invalidateQueries({ queryKey: getListUsersQueryKey() });

  const save = (ev: FormEvent) => {
    ev.preventDefault();
    setFormError("");

    if (modal === "reset" && selected) {
      if (form.password.length < 6) {
        setFormError("Contraseña mínima 6 caracteres.");
        return;
      }
      resetPw.mutate(
        { id: selected.id, data: { password: form.password } },
        {
          onSuccess: () => {
            close();
            setNotice("Contraseña restablecida.");
            refresh();
          },
          onError: (e) => setFormError(errMessage(e)),
        },
      );
      return;
    }

    if (!form.name.trim() || !form.username.trim()) {
      setFormError("Nombre y usuario son obligatorios.");
      return;
    }

    if (modal === "create") {
      if (form.password.length < 6) {
        setFormError("Contraseña mínima 6 caracteres.");
        return;
      }
      create.mutate(
        {
          data: {
            name: form.name.trim(),
            username: form.username.trim().toLowerCase().replace(/\s+/g, ""),
            password: form.password,
            role: "usuario",
            active: form.active,
            modules: ["dashboard"],
            sectorIds: [],
          },
        },
        {
          onSuccess: () => {
            close();
            setNotice(
              "Usuario creado. Asigná nivel, módulos y sectores en Configuración → Permisos.",
            );
            refresh();
          },
          onError: (e) => setFormError(errMessage(e)),
        },
      );
      return;
    }

    if (modal === "edit" && selected) {
      update.mutate(
        {
          id: selected.id,
          data: {
            name: form.name.trim(),
            username: form.username.trim().toLowerCase().replace(/\s+/g, ""),
            active: form.active,
          },
        },
        {
          onSuccess: () => {
            close();
            setNotice("Datos actualizados.");
            refresh();
          },
          onError: (e) => setFormError(errMessage(e)),
        },
      );
    }
  };

  const busy = create.isPending || update.isPending || resetPw.isPending || remove.isPending;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = users.data || [];
    if (!q) return list;
    return list.filter(
      (u) => u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q),
    );
  }, [users.data, search]);

  return (
    <main className="content-wrap" style={{ padding: "20px 24px 40px", boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <div className="eyebrow">Espacio / Usuarios</div>
          <h1 className="page-title">Usuarios</h1>
          <p className="page-subtitle">
            Alta y datos de acceso. Permisos, módulos y sectores se gestionan en{" "}
            <a href="/configuracion" style={{ fontWeight: 700, color: "hsl(var(--primary))" }}>
              Configuración → Permisos
            </a>
            .
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus size={16} /> Nuevo usuario
        </button>
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
            <div style={{ fontSize: 13, margin: "8px 0" }}>{errMessage(users.error)}</div>
            <button type="button" className="btn btn-quiet" onClick={() => users.refetch()}>Reintentar</button>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                  {["Nombre", "Usuario", "Nivel", "Estado", ""].map((h, i) => (
                    <th key={i} style={{ textAlign: i === 4 ? "right" : "left", padding: "10px 12px", fontSize: 11, color: "hsl(var(--muted-foreground))" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} style={{ borderBottom: "1px solid hsl(var(--border) / .5)" }}>
                    <td style={{ padding: 12, fontWeight: 600 }}>{u.name}</td>
                    <td style={{ padding: 12 }}>@{u.username}</td>
                    <td style={{ padding: 12 }}>{nivelLabel(u.role)}</td>
                    <td style={{ padding: 12 }}>{u.active ? "Activo" : "Inactivo"}</td>
                    <td style={{ padding: 12, textAlign: "right", whiteSpace: "nowrap" }}>
                      {u.role !== "superadmin" ? (
                        <>
                          <button type="button" className="btn btn-quiet btn-icon" title="Editar" onClick={() => openEdit(u)}><Pencil size={15} /></button>
                          <button type="button" className="btn btn-quiet btn-icon" title="Clave" onClick={() => openReset(u)}><KeyRound size={15} /></button>
                          <button type="button" className="btn btn-quiet btn-icon" title="Eliminar" onClick={() => {
                            if (!confirm(`¿Eliminar a ${u.name}?`)) return;
                            remove.mutate({ id: u.id }, { onSuccess: () => { setNotice("Eliminado."); refresh(); }, onError: (e) => setNotice(errMessage(e)) });
                          }}><Trash2 size={15} /></button>
                        </>
                      ) : (
                        <span style={{ fontSize: 11, opacity: 0.6 }}>Protegido</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!filtered.length && !users.isLoading && (
                  <tr><td colSpan={5} style={{ padding: 28, textAlign: "center", color: "hsl(var(--muted-foreground))" }}>Sin usuarios</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 80 }} onClick={close}>
          <div className="card" style={{ width: "100%", maxWidth: 420, padding: 22 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "hsl(var(--muted-foreground))" }}>
              {modal === "create" ? "Nuevo acceso" : modal === "edit" ? "Editar datos" : "Seguridad"}
            </div>
            <h2 style={{ margin: "4px 0 14px", fontSize: 20, fontWeight: 800 }}>
              {modal === "create" ? "Crear usuario" : modal === "edit" ? "Editar usuario" : "Restablecer contraseña"}
            </h2>
            <form noValidate onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {formError ? (
                <div style={{ padding: "12px 14px", borderRadius: 10, background: "hsl(0 70% 95%)", color: "hsl(0 55% 32%)", fontSize: 13, fontWeight: 600 }}>{formError}</div>
              ) : null}
              {modal === "reset" ? (
                <div>
                  <label style={L}>Nueva contraseña</label>
                  <input className="input" style={I} type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoFocus />
                </div>
              ) : (
                <>
                  <div>
                    <label style={L}>Nombre y apellido</label>
                    <input className="input" style={I} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
                  </div>
                  <div>
                    <label style={L}>Usuario (login)</label>
                    <input className="input" style={I} required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, "") })} />
                  </div>
                  {modal === "create" ? (
                    <div>
                      <label style={L}>Contraseña inicial (mín. 6)</label>
                      <input className="input" style={I} type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                    </div>
                  ) : null}
                  <div>
                    <label style={L}>Estado</label>
                    <select className="select" style={I} value={form.active ? "1" : "0"} onChange={(e) => setForm({ ...form, active: e.target.value === "1" })}>
                      <option value="1">Activo</option>
                      <option value="0">Inactivo</option>
                    </select>
                  </div>
                  {modal === "create" ? (
                    <p style={{ margin: 0, fontSize: 12, color: "hsl(var(--muted-foreground))", lineHeight: 1.45 }}>
                      Después configurá <strong>nivel</strong>, <strong>módulos</strong> y <strong>sectores</strong> en Configuración → Permisos.
                    </p>
                  ) : null}
                </>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 8, borderTop: "1px solid hsl(var(--border))" }}>
                <button type="button" className="btn btn-quiet" onClick={close} disabled={busy}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? "Guardando…" : modal === "reset" ? "Restablecer" : modal === "create" ? "Crear usuario" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
