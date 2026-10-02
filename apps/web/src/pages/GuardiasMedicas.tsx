import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Sector = { id: number; name: string; shortName?: string };
type Guardia = {
  id: number;
  sectorId: number;
  sectorName?: string | null;
  sectorShortName?: string | null;
  date: string;
  shift: string;
  modality: string;
  type: string;
  professionalName: string;
  observations: string;
};

const API = "/api";
const SHIFTS = [
  { value: "mañana", label: "Mañana" },
  { value: "tarde", label: "Tarde" },
  { value: "noche", label: "Noche" },
  { value: "24h", label: "24 h" },
];
const MODALITIES = [
  { value: "presencial", label: "Presencial" },
  { value: "retencion", label: "Retención" },
];
const TYPES = [
  { value: "fija", label: "Fija" },
  { value: "rotativa", label: "Rotativa" },
  { value: "pasiva", label: "Pasiva" },
];

function monthRange(d: Date) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const from = new Date(y, m, 1);
  const to = new Date(y, m + 1, 0);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to), year: y, month: m };
}

function labelShift(v: string) {
  return SHIFTS.find((s) => s.value === v)?.label ?? v;
}
function labelMod(v: string) {
  return MODALITIES.find((s) => s.value === v)?.label ?? v;
}
function labelType(v: string) {
  return TYPES.find((s) => s.value === v)?.label ?? v;
}

export default function GuardiasMedicas() {
  const [tab, setTab] = useState<"calendario" | "carga">("calendario");
  const [cursor, setCursor] = useState(() => new Date());
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [items, setItems] = useState<Guardia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterSector, setFilterSector] = useState("");

  const range = useMemo(() => monthRange(cursor), [cursor]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ from: range.from, to: range.to });
      if (filterSector) q.set("sectorId", filterSector);
      const [gRes, sRes] = await Promise.all([
        fetch(`${API}/guardias?${q}`, { credentials: "include" }),
        fetch(`${API}/sectors`, { credentials: "include" }),
      ]);
      if (!gRes.ok) throw new Error("No se pudieron cargar las guardias");
      const gData = await gRes.json();
      setItems(Array.isArray(gData) ? gData : []);
      if (sRes.ok) {
        const sData = await sRes.json();
        setSectors(Array.isArray(sData) ? sData : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, filterSector]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDate = useMemo(() => {
    const map = new Map<string, Guardia[]>();
    for (const g of items) {
      const list = map.get(g.date) ?? [];
      list.push(g);
      map.set(g.date, list);
    }
    return map;
  }, [items]);

  const days = useMemo(() => {
    const { year, month } = range;
    const first = new Date(year, month, 1);
    const startPad = (first.getDay() + 6) % 7; // lunes=0
    const dim = new Date(year, month + 1, 0).getDate();
    const cells: ({ day: number; iso: string } | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) {
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, iso });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [range]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      sectorId: Number(fd.get("sectorId")),
      date: String(fd.get("date")),
      shift: String(fd.get("shift")),
      modality: String(fd.get("modality")),
      type: String(fd.get("type")),
      professionalName: String(fd.get("professionalName")),
      observations: String(fd.get("observations") ?? ""),
    };
    const res = await fetch(`${API}/guardias`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.message ?? "No se pudo guardar");
      return;
    }
    e.currentTarget.reset();
    await load();
    setTab("calendario");
  }

  async function onDelete(id: number) {
    if (!confirm("¿Eliminar esta guardia médica?")) return;
    const res = await fetch(`${API}/guardias/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok && res.status !== 204) {
      setError("No se pudo eliminar");
      return;
    }
    await load();
  }

  const monthLabel = cursor.toLocaleDateString("es-AR", { month: "long", year: "numeric" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Guardias Médicas</h1>
          <p className="text-sm text-slate-400">Calendario de cobertura y registro de cargas</p>
        </div>
        <div className="flex gap-2 rounded-lg border border-slate-700 bg-slate-900 p-1">
          <button
            type="button"
            onClick={() => setTab("calendario")}
            className={`rounded-md px-3 py-1.5 text-sm ${tab === "calendario" ? "bg-sky-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}
          >
            Calendario
          </button>
          <button
            type="button"
            onClick={() => setTab("carga")}
            className={`rounded-md px-3 py-1.5 text-sm ${tab === "carga" ? "bg-sky-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}
          >
            Carga y registro
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="rounded border border-slate-600 px-2 py-1 text-sm text-slate-300 hover:bg-slate-800"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
        >
          ← Mes anterior
        </button>
        <span className="min-w-[10rem] text-center capitalize text-slate-200">{monthLabel}</span>
        <button
          type="button"
          className="rounded border border-slate-600 px-2 py-1 text-sm text-slate-300 hover:bg-slate-800"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
        >
          Mes siguiente →
        </button>
        <label className="ml-auto flex items-center gap-2 text-sm text-slate-400">
          Sector
          <select
            className="rounded border border-slate-600 bg-slate-950 px-2 py-1 text-slate-200"
            value={filterSector}
            onChange={(e) => setFilterSector(e.target.value)}
          >
            <option value="">Todos</option>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p className="text-slate-400">Cargando…</p>
      ) : tab === "calendario" ? (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
          <div className="grid grid-cols-7 border-b border-slate-800 text-center text-xs font-medium uppercase tracking-wide text-slate-500">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <div key={d} className="px-1 py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 auto-rows-fr">
            {days.map((cell, i) =>
              cell ? (
                <div key={cell.iso} className="min-h-[7rem] border-b border-r border-slate-800 p-1.5">
                  <div className="mb-1 text-xs font-semibold text-slate-400">{cell.day}</div>
                  <div className="space-y-1">
                    {(byDate.get(cell.iso) ?? []).map((g) => (
                      <div
                        key={g.id}
                        className={`rounded px-1.5 py-1 text-[10px] leading-tight ${
                          g.modality === "presencial"
                            ? "bg-emerald-900/60 text-emerald-100"
                            : "bg-amber-900/50 text-amber-100"
                        }`}
                        title={`${g.professionalName} · ${labelShift(g.shift)} · ${g.sectorName ?? ""}`}
                      >
                        <div className="font-semibold">{g.professionalName}</div>
                        <div className="opacity-80">
                          {labelShift(g.shift)} · {g.sectorShortName || g.sectorName}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div key={`e-${i}`} className="min-h-[7rem] border-b border-r border-slate-800 bg-slate-950/40" />
              ),
            )}
          </div>
          <div className="flex gap-4 border-t border-slate-800 px-3 py-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Presencial
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> Retención
            </span>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <form
            onSubmit={onCreate}
            className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4 lg:col-span-2"
          >
            <h2 className="font-medium text-white">Nueva guardia médica</h2>
            <label className="block text-sm text-slate-300">
              Fecha
              <input
                name="date"
                type="date"
                required
                className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
            <label className="block text-sm text-slate-300">
              Sector
              <select
                name="sectorId"
                required
                className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-white"
              >
                <option value="">Elegir…</option>
                {sectors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-slate-300">
              Turno
              <select
                name="shift"
                required
                className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-white"
              >
                {SHIFTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-slate-300">
              Profesional
              <input
                name="professionalName"
                required
                placeholder="Ej. Dr. García"
                className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-slate-300">
                Modalidad
                <select
                  name="modality"
                  className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-white"
                >
                  {MODALITIES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-slate-300">
                Tipo
                <select
                  name="type"
                  className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-white"
                >
                  {TYPES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-sm text-slate-300">
              Observaciones
              <textarea
                name="observations"
                rows={2}
                className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500"
            >
              Guardar guardia
            </button>
          </form>

          <div className="overflow-auto rounded-xl border border-slate-800 bg-slate-900 lg:col-span-3">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Sector</th>
                  <th className="px-3 py-2">Turno</th>
                  <th className="px-3 py-2">Profesional</th>
                  <th className="px-3 py-2">Modalidad</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                      No hay guardias en este mes. Cargá la primera con el formulario.
                    </td>
                  </tr>
                ) : (
                  items.map((g) => (
                    <tr key={g.id} className="border-b border-slate-800/80 text-slate-200">
                      <td className="px-3 py-2 whitespace-nowrap">{g.date}</td>
                      <td className="px-3 py-2">{g.sectorName ?? g.sectorId}</td>
                      <td className="px-3 py-2">{labelShift(g.shift)}</td>
                      <td className="px-3 py-2">{g.professionalName}</td>
                      <td className="px-3 py-2">{labelMod(g.modality)}</td>
                      <td className="px-3 py-2">{labelType(g.type)}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => void onDelete(g.id)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
