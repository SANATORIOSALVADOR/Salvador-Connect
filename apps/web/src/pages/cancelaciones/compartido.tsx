import type { ReactNode } from "react";
import { AlertTriangle, Search } from "lucide-react";
import { Pill, S } from "../administracion/ui";
import { ANTICIPACION, ESTADO_META, MOTIVOS, type Estado, type Motivo, type Solicitud } from "./api";

// Piezas que comparten las solapas de Cancelaciones (Solicitudes, Central de Turnos, Historial).

export type Me = { id: number; name: string; role: string; acciones?: Record<string, string[]> };
export type Puede = { resolver: boolean; central: boolean; eliminar: boolean; exportar: boolean };

/** Fecha de hoy en esta PC (YYYY-MM-DD). */
export const hoyLocal = () => new Date().toLocaleDateString("sv-SE");

/** Días corridos de hoy a una fecha ISO (negativo = ya pasó). */
export function diasHasta(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const [hy, hm, hd] = hoyLocal().split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(hy, hm - 1, hd)) / 864e5);
}

export function EstadoPill({ estado }: { estado: Estado }) {
  const m = ESTADO_META[estado];
  return <Pill style={{ background: m.bg, color: m.fg, borderColor: m.borde }}>{m.label}</Pill>;
}

export function AnticipacionPill({ s }: { s: Pick<Solicitud, "excepcional" | "anticipacionHabiles"> }) {
  return s.excepcional ? (
    <Pill style={{ background: "#fde7d8", color: "#8a3b0c", borderColor: "#f3c09c" }} title={`Pedida con ${s.anticipacionHabiles} días hábiles de anticipación (mínimo ${ANTICIPACION})`}>
      <AlertTriangle size={11} /> Excepcional · {s.anticipacionHabiles} d.h.
    </Pill>
  ) : (
    <span style={S.small}>{s.anticipacionHabiles} días hábiles</span>
  );
}

/** Cuánto falta para el primer día de la agenda a cancelar (para que Central priorice). */
export function UrgenciaPill({ desde, hasta }: { desde: string; hasta: string }) {
  const n = diasHasta(desde);
  const fin = diasHasta(hasta);
  const [txt, bg, fg, borde] =
    fin < 0 ? ["Ya pasó", "hsl(var(--muted))", "hsl(var(--muted-foreground))", "hsl(var(--border))"]
    : n <= 0 ? ["Ya empezó", "#fde2e2", "#8f1d1d", "#f0b4b4"]
    : n === 1 ? ["Empieza mañana", "#fde2e2", "#8f1d1d", "#f0b4b4"]
    : n <= 3 ? [`Empieza en ${n} días`, "#fde7d8", "#8a3b0c", "#f3c09c"]
    : n <= 7 ? [`Empieza en ${n} días`, "#fdf0d5", "#7a4a06", "#efd28f"]
    : [`En ${n} días`, "transparent", "hsl(var(--muted-foreground))", "hsl(var(--border))"];
  return <Pill style={{ background: bg, color: fg, borderColor: borde }}>{txt}</Pill>;
}

// ----- Filtros comunes -----

export type Filtros = { q: string; motivo: "" | Motivo; servicio: string; desde: string; hasta: string };
export const FILTROS_VACIOS: Filtros = { q: "", motivo: "", servicio: "", desde: "", hasta: "" };
export const hayFiltros = (f: Filtros) => Boolean(f.q || f.motivo || f.servicio || f.desde || f.hasta);

/** Búsqueda libre + motivo + servicio + días a cancelar dentro del período. */
export function pasaFiltros(s: Solicitud, f: Filtros): boolean {
  const t = f.q.trim().toLowerCase();
  if (t && ![s.numero, s.prestador, s.servicio, s.matricula, s.dni, s.colega, s.telefono].some((v) => v.toLowerCase().includes(t))) return false;
  if (f.motivo && s.motivo !== f.motivo) return false;
  if (f.servicio && s.servicio.toLowerCase() !== f.servicio.toLowerCase()) return false;
  if (f.desde && s.fechaHasta < f.desde) return false;
  if (f.hasta && s.fechaDesde > f.hasta) return false;
  return true;
}

/** Servicios presentes en la lista (sin repetir, sin distinguir mayúsculas). */
export function serviciosDe(filas: Solicitud[]): string[] {
  const m = new Map<string, string>();
  for (const s of filas) if (s.servicio && !m.has(s.servicio.toLowerCase())) m.set(s.servicio.toLowerCase(), s.servicio);
  return [...m.values()].sort((a, b) => a.localeCompare(b, "es"));
}

export function BarraFiltros({ f, set, servicios, extra, placeholder = "Buscar médico, servicio, matrícula, DNI o trámite", periodo = "Días a cancelar" }: { f: Filtros; set: (f: Filtros) => void; servicios: string[]; extra?: ReactNode; placeholder?: string; periodo?: string }) {
  return (
    <div className="can-filtros">
      <div className="can-buscar">
        <Search size={15} aria-hidden="true" />
        <input value={f.q} onChange={(e) => set({ ...f, q: e.target.value })} placeholder={placeholder} aria-label="Buscar" />
      </div>
      <label>
        <span style={S.label}>Servicio</span>
        <select value={f.servicio} onChange={(e) => set({ ...f, servicio: e.target.value })}>
          <option value="">Todos</option>
          {servicios.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label>
        <span style={S.label}>Motivo</span>
        <select value={f.motivo} onChange={(e) => set({ ...f, motivo: e.target.value as Filtros["motivo"] })}>
          <option value="">Todos</option>
          {MOTIVOS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      </label>
      <label>
        <span style={S.label}>{periodo} desde</span>
        <input type="date" value={f.desde} onChange={(e) => set({ ...f, desde: e.target.value })} />
      </label>
      <label>
        <span style={S.label}>hasta</span>
        <input type="date" value={f.hasta} onChange={(e) => set({ ...f, hasta: e.target.value })} />
      </label>
      {extra}
    </div>
  );
}
