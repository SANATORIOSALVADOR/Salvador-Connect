// Medical → Cancelaciones Médicos: tipos, textos y llamadas a la API (sin React).

export type Motivo = "formacion" | "vacaciones" | "personales" | "licencia";
export type Estado = "pendiente" | "en_analisis" | "aceptada" | "agenda_cancelada" | "rechazada" | "anulada";
export type Dia = { fecha: string; desde: string; hasta: string };
export type Evento = { at: string; quien: string; accion: string; detalle?: string };

export const RUTA_PUBLICA = "/cancelar-agenda";
export const ANTICIPACION = 15;

export const MOTIVOS: { key: Motivo; label: string; ayuda: string; constancia?: string }[] = [
  { key: "formacion", label: "Formación profesional", ayuda: "Congresos, cursos, jornadas. Pre-aviso de 15 días hábiles.", constancia: "la solicitud de inscripción" },
  { key: "vacaciones", label: "Vacaciones", ayuda: "Pre-aviso de 15 días hábiles." },
  { key: "personales", label: "Motivos personales", ayuda: "Contanos brevemente el motivo si querés." },
  { key: "licencia", label: "Licencia médica", ayuda: "Por enfermedad o tratamiento.", constancia: "el certificado médico" },
];
export const MOTIVO_LABEL = Object.fromEntries(MOTIVOS.map((m) => [m.key, m.label])) as Record<Motivo, string>;

export const ESTADO_META: Record<Estado, { label: string; bg: string; fg: string; borde: string }> = {
  pendiente: { label: "Pendiente", bg: "#fdf0d5", fg: "#7a4a06", borde: "#efd28f" },
  en_analisis: { label: "En análisis", bg: "#e2edfb", fg: "#1d4f91", borde: "#b5cdee" },
  aceptada: { label: "Aceptada · en Central", bg: "#dcf3dc", fg: "#155c15", borde: "#a9dca9" },
  agenda_cancelada: { label: "Agenda cancelada", bg: "#e7e3fb", fg: "#3f2f8f", borde: "#c9c0f0" },
  rechazada: { label: "Rechazada", bg: "#fde2e2", fg: "#8f1d1d", borde: "#f0b4b4" },
  anulada: { label: "Anulada por el médico", bg: "transparent", fg: "hsl(var(--muted-foreground))", borde: "hsl(var(--border))" },
};

/** Lo que ve el médico de su trámite. */
export type TramitePublico = {
  numero: string;
  estado: Estado;
  estadoLabel: string;
  prestador: string;
  servicio: string;
  motivo: Motivo;
  motivoLabel: string;
  dias: Dia[];
  fechaReprogramacion: string | null;
  excepcional: boolean;
  anticipacionHabiles: number;
  pideConstancia: boolean;
  constanciaRecibida: boolean;
  respuesta: string;
  resueltoAt: string | null;
  createdAt: string;
};

export type Solicitud = {
  id: number;
  numero: string;
  prestador: string;
  matricula: string;
  dni: string;
  servicio: string;
  telefono: string;
  pacientesAgendados: boolean;
  hayColega: boolean;
  colega: string;
  motivo: Motivo;
  motivoLabel: string;
  motivoDetalle: string;
  dias: Dia[];
  fechaDesde: string;
  fechaHasta: string;
  fechaReprogramacion: string | null;
  anticipacionHabiles: number;
  excepcional: boolean;
  justificacion: string;
  estado: Estado;
  estadoLabel: string;
  respuesta: string;
  pideConstancia: boolean;
  constanciaRecibida: boolean;
  agendaCanceladaAt: string | null;
  agendaCanceladaPor: string;
  centralNota: string;
  resueltoPor: string;
  resueltoAt: string | null;
  eventos: Evento[];
  createdAt: string;
  updatedAt: string;
  otras?: Solicitud[];
};

export type Reglas = {
  hoy: string;
  anticipacionMinima: number;
  primerDiaSinExcepcion: string;
  motivos: { key: Motivo; label: string; pideConstancia: boolean }[];
  servicios: string[];
};

export async function api<T>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(url, {
    method: opts.method ?? "GET",
    credentials: "include",
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (r.status === 204) return undefined as T;
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error((b as { message?: string }).message || `Error ${r.status}`), { status: r.status });
  return b as T;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** 2026-11-20 → 20/11/2026 */
export function fechaAr(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
/** 2026-11-20 → vie 20 nov */
export function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dia = DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dia.slice(0, 3)} ${d} ${MESES[m - 1]}`;
}
export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.toLocaleDateString("es-AR")} ${d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** "20/11 al 24/11 (3 días)" */
export function resumenDias(dias: Dia[]): string {
  if (!dias.length) return "";
  const fechas = [...new Set(dias.map((d) => d.fecha))];
  const corta = (iso: string) => fechaAr(iso).slice(0, 5);
  const rango = fechas.length === 1 ? fechaLarga(fechas[0]) : `${corta(fechas[0])} al ${corta(fechas[fechas.length - 1])}`;
  return `${rango} · ${fechas.length} día${fechas.length === 1 ? "" : "s"}`;
}

export const ACCION_EVENTO: Record<string, string> = {
  creada: "Envió la solicitud",
  en_analisis: "Tomó la solicitud para analizarla",
  aceptada: "Aceptó la solicitud",
  rechazada: "Rechazó la solicitud",
  reabierta: "Reabrió la solicitud",
  anulada: "Anuló la solicitud",
  constancia: "Marcó la constancia como recibida",
  constancia_quitada: "Quitó la marca de constancia recibida",
  central: "Informó a Central de Turnos",
  central_quitada: "Quitó la marca de Central de Turnos informada",
  agenda_cancelada: "Canceló la agenda en el sistema de turnos (Central de Turnos)",
  devuelta: "Devolvió la solicitud a Dirección Médica (Central de Turnos)",
  agenda_restituida: "Deshizo la cancelación de la agenda (vuelve a Central de Turnos)",
  nota: "Nota interna",
};
