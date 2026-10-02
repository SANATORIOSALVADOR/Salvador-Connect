import { FormEvent, useEffect, useState } from "react";
import GuardiasMedicas from "./pages/GuardiasMedicas";

type User = {
  id: number;
  username: string;
  name: string;
  role: string;
  modules?: string[];
};

const API = "/api";

type Page =
  | "dashboard"
  | "administracion"
  | "guardias"
  | "inventario"
  | "instructivos"
  | "usuarios"
  | "liquidacion";

const NAV: { id: Page; label: string }[] = [
  { id: "dashboard", label: "Resumen" },
  { id: "administracion", label: "Administración" },
  { id: "guardias", label: "Guardias Médicas" },
  { id: "inventario", label: "Inventario" },
  { id: "instructivos", label: "Instructivos" },
  { id: "usuarios", label: "Usuarios" },
  { id: "liquidacion", label: "Liquidación" },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<Page>("dashboard");
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    fetch(`${API}/auth/me`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error("no session");
        return r.json();
      })
      .then((data) => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.message ?? "No se pudo iniciar sesión");
      return;
    }
    const data = await res.json();
    setUser(data.user);
  }

  async function onLogout() {
    await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" });
    setUser(null);
    setShowLogin(false);
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">Cargando…</div>
    );
  }

  if (!user) {
    return (
      <div className="auth-layout">
        <aside className="auth-aside">
          <div className="brand">
            <span style={{ fontSize: 22 }}>🏥</span>
            <div>
              Sanatorio Salvador
              <small>SISTEMA INTERNO</small>
            </div>
          </div>
          <div className="pill">
            <span>● Mega operativa</span>
            <span>· Acceso interno</span>
          </div>
          <h1>
            El día claro.
            <br />
            <span>La operación en orden.</span>
          </h1>
          <p>
            Un espacio de trabajo preciso para quienes sostienen el Sanatorio
            Salvador todos los días.
          </p>
        </aside>
        <section className="auth-panel">
          {!showLogin ? (
            <>
              <div className="eyebrow">Sistema interno</div>
              <h2>Bienvenido al equipo.</h2>
              <p className="lead">
                Ingresá para revisar la agenda, los sectores y las prioridades de
                hoy.
              </p>
              <button type="button" className="btn-primary" onClick={() => setShowLogin(true)}>
                Ingresar al sistema →
              </button>
              <button type="button" className="btn-secondary" style={{ marginTop: 10 }} disabled>
                Solicitar acceso
              </button>
              <p className="auth-foot">Acceso reservado para personal autorizado</p>
            </>
          ) : (
            <>
              <div className="eyebrow">Acceso</div>
              <h2>Ingresar</h2>
              <p className="lead">Usuario y contraseña del sistema interno.</p>
              {error && <div className="auth-error">{error}</div>}
              <form className="auth-form" onSubmit={onLogin}>
                <label>
                  Usuario
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    required
                  />
                </label>
                <label>
                  Contraseña
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </label>
                <button type="submit" className="btn-primary">
                  Ingresar
                </button>
                <button type="button" className="btn-secondary" onClick={() => setShowLogin(false)}>
                  Volver
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="flex min-h-full">
      <aside className="w-56 shrink-0 border-r border-slate-800 bg-slate-950 p-4">
        <div className="mb-1 text-sm font-semibold text-teal-400">Sanatorio Salvador</div>
        <div className="mb-6 text-[11px] uppercase tracking-wide text-slate-500">Sistema interno</div>
        <nav className="space-y-1 text-sm">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPage(item.id)}
              className={`block w-full rounded px-3 py-2 text-left ${
                page === item.id ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-900"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <header className="mb-6 flex items-center justify-between">
          <p className="text-sm text-slate-400">
            {user.name} · {user.role}
          </p>
          <button
            type="button"
            onClick={onLogout}
            className="rounded border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            Salir
          </button>
        </header>

        {page === "dashboard" && (
          <div>
            <h1 className="mb-4 text-2xl font-semibold text-white">Resumen</h1>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Card
                title="Guardias Médicas"
                body="Calendario y carga de cobertura"
                onClick={() => setPage("guardias")}
              />
              <Card title="Administración" body="Agenda y recordatorios" onClick={() => setPage("administracion")} />
              <Card title="Inventario" body="Activos fijos por sector" onClick={() => setPage("inventario")} />
            </div>
          </div>
        )}

        {page === "guardias" && <GuardiasMedicas />}

        {page !== "dashboard" && page !== "guardias" && (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-8 text-center">
            <h1 className="text-xl font-semibold text-white">
              {NAV.find((n) => n.id === page)?.label}
            </h1>
            <p className="mt-2 text-sm text-slate-400">Módulo en desarrollo (próximo tramo).</p>
          </div>
        )}
      </main>
    </div>
  );
}

function Card({
  title,
  body,
  onClick,
}: {
  title: string;
  body: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-left hover:border-teal-700"
    >
      <h2 className="font-medium text-white">{title}</h2>
      <p className="mt-1 text-sm text-slate-400">{body}</p>
    </button>
  );
}
