import { FormEvent, useEffect, useState, type CSSProperties } from "react";
import { avisar } from "@/components/feedback";
import { PasswordInput } from "@/components/password-input";
import { LEVEL_COLOR, LEVEL_LABEL, MODULES, type Level } from "@/lib/permisos";
import { guardarTamanoTexto, guardarTema, useApariencia, type TamanoTexto, type Tema } from "./shared/apariencia";

// Mi perfil: datos propios, cambio de contraseña, permisos y preferencias de cada persona.

type Me = {
  id: number;
  username: string;
  name: string;
  email: string | null;
  role: string;
  mustChangePassword: boolean;
  permissions: Record<string, Level>;
  sectorIds: number[];
};
type Sector = { id: number; name: string };

const CARD: CSSProperties = { padding: 18, borderRadius: 14 };
const H2: CSSProperties = { margin: "0 0 12px", fontSize: 16, fontWeight: 800 };
const MUTED: CSSProperties = { fontSize: 12, color: "hsl(var(--muted-foreground))" };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { credentials: "include", ...init, headers: init?.body ? { "Content-Type": "application/json" } : undefined });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { message?: string }).message || `Error ${res.status}`);
  return body as T;
}

export default function Perfil() {
  const { temaPropio, texto } = useApariencia();
  const [me, setMe] = useState<Me | null>(null);
  const [sectores, setSectores] = useState<Sector[]>([]);
  const [datos, setDatos] = useState({ name: "", email: "" });
  const [guardandoDatos, setGuardandoDatos] = useState(false);
  const [pw, setPw] = useState({ actual: "", nueva: "", repetir: "" });
  const [guardandoPw, setGuardandoPw] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api<Me>("/auth/me"), api<Sector[]>("/sectors")])
      .then(([m, s]) => {
        setMe(m);
        setDatos({ name: m.name, email: m.email || "" });
        setSectores(s);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar el perfil."));
  }, []);

  async function guardarDatos(e: FormEvent) {
    e.preventDefault();
    setGuardandoDatos(true);
    try {
      const m = await api<Me>("/auth/me", { method: "PATCH", body: JSON.stringify({ name: datos.name, email: datos.email }) });
      setMe(m);
      avisar("Datos actualizados.");
    } catch (err) {
      avisar(err instanceof Error ? err.message : "No se pudo guardar.", "error");
    } finally {
      setGuardandoDatos(false);
    }
  }

  async function cambiarClave(e: FormEvent) {
    e.preventDefault();
    if (pw.nueva.length < 8) return avisar("La contraseña nueva debe tener al menos 8 caracteres.", "error");
    if (pw.nueva !== pw.repetir) return avisar("Las contraseñas nuevas no coinciden.", "error");
    if (pw.nueva === pw.actual) return avisar("La contraseña nueva tiene que ser distinta de la actual.", "error");
    setGuardandoPw(true);
    try {
      await api("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword: pw.actual, newPassword: pw.nueva }) });
      setPw({ actual: "", nueva: "", repetir: "" });
      avisar("Contraseña cambiada. Se cerraron tus sesiones en otros equipos.");
    } catch (err) {
      avisar(err instanceof Error ? err.message : "No se pudo cambiar la contraseña.", "error");
    } finally {
      setGuardandoPw(false);
    }
  }

  if (error) return <div className="content-wrap"><div className="form-error">{error}</div></div>;
  if (!me) return <div className="content-wrap"><div className="skeleton" style={{ height: 240 }} /></div>;

  const esSuper = me.role === "superadmin";
  const misSectores = me.sectorIds.map((id) => sectores.find((s) => s.id === id)?.name || `#${id}`);
  const fuerza = pw.nueva.length === 0 ? null : pw.nueva.length < 8 ? "corta" : /[A-Z]/.test(pw.nueva) && /\d/.test(pw.nueva) && pw.nueva.length >= 10 ? "buena" : "aceptable";

  const opcion = (activo: boolean, onClick: () => void, titulo: string, desc: string) => (
    <button type="button" onClick={onClick} aria-pressed={activo} style={{ textAlign: "left", padding: "10px 12px", borderRadius: 12, cursor: "pointer", font: "inherit", color: "inherit", background: "hsl(var(--card))", border: `2px solid ${activo ? "hsl(var(--primary))" : "hsl(var(--border))"}` }}>
      <strong style={{ fontSize: 13 }}>{titulo}</strong>
      <div style={MUTED}>{desc}</div>
    </button>
  );

  return (
    <main className="content-wrap" style={{ padding: "20px 22px 40px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div className="eyebrow">Espacio / Mi perfil</div>
        <h1 className="page-title">Mi perfil</h1>
        <p className="page-subtitle">@{me.username} · {esSuper ? "Superadmin" : "Usuario"}</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
        <form className="card" style={CARD} onSubmit={guardarDatos}>
          <h2 style={H2}>Mis datos</h2>
          <label className="field"><span className="field-label">Nombre y apellido</span><input className="input" required minLength={2} maxLength={80} value={datos.name} onChange={(e) => setDatos({ ...datos, name: e.target.value })} autoComplete="name" /></label>
          <label className="field" style={{ marginTop: 10 }}><span className="field-label">Email (opcional)</span><input className="input" type="email" value={datos.email} onChange={(e) => setDatos({ ...datos, email: e.target.value })} autoComplete="email" /></label>
          <label className="field" style={{ marginTop: 10 }}><span className="field-label">Usuario</span><input className="input" value={me.username} disabled /></label>
          <button type="submit" className="btn btn-primary" style={{ marginTop: 14 }} disabled={guardandoDatos}>{guardandoDatos ? "Guardando…" : "Guardar datos"}</button>
        </form>

        <form className="card" style={CARD} onSubmit={cambiarClave}>
          <h2 style={H2}>Cambiar contraseña</h2>
          {!me.mustChangePassword && (
            <label className="field"><span className="field-label">Contraseña actual</span><PasswordInput value={pw.actual} onChange={(v) => setPw({ ...pw, actual: v })} autoComplete="current-password" testId="perfil-pw-actual" required /></label>
          )}
          <label className="field" style={{ marginTop: 10 }}><span className="field-label">Contraseña nueva</span><PasswordInput value={pw.nueva} onChange={(v) => setPw({ ...pw, nueva: v })} autoComplete="new-password" testId="perfil-pw-nueva" minLength={8} required /></label>
          {fuerza && (
            <div style={{ ...MUTED, marginTop: 4, color: fuerza === "corta" ? "#b91c1c" : fuerza === "buena" ? "#15803d" : undefined }}>
              {fuerza === "corta" ? "Muy corta: mínimo 8 caracteres." : fuerza === "buena" ? "Buena contraseña." : "Aceptable. Más segura con 10+ caracteres, una mayúscula y un número."}
            </div>
          )}
          <label className="field" style={{ marginTop: 10 }}><span className="field-label">Repetir contraseña nueva</span><PasswordInput value={pw.repetir} onChange={(v) => setPw({ ...pw, repetir: v })} autoComplete="new-password" testId="perfil-pw-repetir" minLength={8} required /></label>
          <button type="submit" className="btn btn-primary" style={{ marginTop: 14 }} disabled={guardandoPw}>{guardandoPw ? "Cambiando…" : "Cambiar contraseña"}</button>
        </form>

        <section className="card" style={CARD}>
          <h2 style={H2}>Preferencias de este equipo</h2>
          <div className="field-label" style={{ marginBottom: 6 }}>Tema</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
            {([
              [null, "Como el sistema", "Lo que eligió el administrador."],
              ["claro", "Claro", "Fondo claro."],
              ["oscuro", "Oscuro", "Fondo oscuro."],
              ["sistema", "Automático", "Según tu computadora."],
            ] as [Tema | null, string, string][]).map(([v, t, d]) => <span key={t}>{opcion(temaPropio === v, () => guardarTema(v), t, d)}</span>)}
          </div>
          <div className="field-label" style={{ margin: "14px 0 6px" }}>Tamaño del texto</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {([
              ["normal", "Normal", "100 %"],
              ["grande", "Grande", "112 %"],
              ["muy-grande", "Muy grande", "125 %"],
            ] as [TamanoTexto, string, string][]).map(([v, t, d]) => <span key={v}>{opcion(texto === v, () => guardarTamanoTexto(v), t, d)}</span>)}
          </div>
          <p style={{ ...MUTED, marginTop: 10 }}>Se guardan en este navegador: en otra computadora podés elegir otras.</p>
        </section>

        <section className="card" style={CARD}>
          <h2 style={H2}>Mis permisos</h2>
          {esSuper ? (
            <p className="page-subtitle">Sos superadmin: tenés acceso total a todos los módulos y administrás usuarios, sectores y apariencia.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {MODULES.map((m) => {
                const lvl = me.permissions[m.key];
                return (
                  <div key={m.key} style={{ display: "flex", gap: 10, alignItems: "baseline", opacity: lvl ? 1 : 0.55 }}>
                    <span style={{ minWidth: 130, fontWeight: 700, fontSize: 13 }}>{m.label}</span>
                    {lvl ? (
                      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ alignSelf: "flex-start", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: LEVEL_COLOR[lvl].bg, color: LEVEL_COLOR[lvl].fg }}>{LEVEL_LABEL[lvl]}</span>
                        <span style={MUTED}>{m.can[lvl]}</span>
                      </span>
                    ) : (
                      <span style={MUTED}>Sin acceso</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="field-label" style={{ margin: "14px 0 4px" }}>Sectores a cargo</div>
          <div style={MUTED}>{esSuper || misSectores.length === 0 ? "Todos" : misSectores.join(", ")}</div>
          <p style={{ ...MUTED, marginTop: 10 }}>Si necesitás más permisos, pedíselo al administrador del sistema.</p>
        </section>
      </div>
    </main>
  );
}
