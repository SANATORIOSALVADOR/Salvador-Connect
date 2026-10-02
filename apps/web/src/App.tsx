import { FormEvent, useEffect, useState } from "react";
import GuardiasMedicas from "./pages/GuardiasMedicas";

type User = {
  id: number;
  username: string;
  name: string;
  role: string;
  modules: string[];
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
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">Cargando…</div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <form
          onSubmit={onLogin}
          className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-xl"
        >
          <h1 className="mb-1 text-xl font-semibold text-white">Sanatorio del Salvador</h1>
          <p className="mb-6 text-sm text-slate-400">Sistema interno</p>
          {error && (
            <p className="mb-3 rounded bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</p>
          )}
          <label className="mb-3 block text-sm text-slate-300">
            Usuario
            <input
              className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-white"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className="mb-4 block text-sm text-slate-300">
            Contraseña
            <input
              type="password"
              className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-white"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button
            type="submit"
            className="w-full rounded bg-sky-600 px-3 py-2 font-medium text-white hover:bg-sky-500"
          >
            Ingresar
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex min-h-full">
      <aside className="w-56 shrink-0 border-r border-slate-800 bg-slate-950 p-4">
        <div className="mb-6 text-sm font-semibold text-sky-400">Salvador Connect</div>
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
              <Card title="Guardias Médicas" body="Calendario y carga de cobertura" onClick={() => setPage("guardias")} />
              <Card title="Administración" body="Agenda y recordatorios" onClick={() => setPage("administracion")} />
              <Card title="Inventario" body="Activos fijos por sector" onClick={() => setPage("inventario")} />
            </div>
          </div>
        )}

        {page === "guardias" && <GuardiasMedicas />}

        {page !== "dashboard" && page !== "guardias" && (
          <Placeholder title={NAV.find((n) => n.id === page)?.label ?? page} />
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
      className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-left hover:border-sky-700"
    >
      <h2 className="font-medium text-white">{title}</h2>
      <p className="mt-1 text-sm text-slate-400">{body}</p>
    </button>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-8 text-center">
      <h1 className="text-xl font-semibold text-white">{title}</h1>
      <p className="mt-2 text-sm text-slate-400">Módulo en desarrollo (próximo tramo).</p>
    </div>
  );
}
