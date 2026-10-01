import { FormEvent, useEffect, useState } from "react";

type User = {
  id: number;
  username: string;
  name: string;
  role: string;
  modules: string[];
};

const API = "/api";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

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
      <div className="flex h-full items-center justify-center text-slate-400">
        Cargando…
      </div>
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
          <label className="mb-3 block text-sm">
            Usuario
            <input
              className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-white"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className="mb-4 block text-sm">
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
      <aside className="w-56 border-r border-slate-800 bg-slate-950 p-4">
        <div className="mb-6 text-sm font-semibold text-sky-400">Salvador Connect</div>
        <nav className="space-y-1 text-sm text-slate-300">
          <div className="rounded bg-slate-800 px-3 py-2 text-white">Dashboard</div>
          <div className="px-3 py-2 opacity-50">Administración</div>
          <div className="px-3 py-2 opacity-50">Guardias</div>
          <div className="px-3 py-2 opacity-50">Inventario</div>
          <div className="px-3 py-2 opacity-50">Instructivos</div>
          <div className="px-3 py-2 opacity-50">Configuración</div>
        </nav>
      </aside>
      <main className="flex-1 p-6">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
            <p className="text-sm text-slate-400">
              Hola, {user.name} · {user.role}
            </p>
          </div>
          <button
            onClick={onLogout}
            className="rounded border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            Salir
          </button>
        </header>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card title="Agenda" body="Próximos vencimientos y recordatorios" />
          <Card title="Guardias" body="Cobertura por sector (próximo tramo)" />
          <Card title="Inventario" body="Activos fijos por sector (próximo tramo)" />
        </div>
      </main>
    </div>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="font-medium text-white">{title}</h2>
      <p className="mt-1 text-sm text-slate-400">{body}</p>
    </div>
  );
}
