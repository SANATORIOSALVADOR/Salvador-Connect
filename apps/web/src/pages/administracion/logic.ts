// Lógica pura del módulo Administración (sin React): tipos, fechas, urgencia, montos.
// Se prueba en tests/web-logic.test.mjs.

export type Tipo = "fiscal" | "vencimiento" | "pago" | "cheque" | "documento" | "tarea" | "recordatorio";
export type Estado = "pendiente" | "cumplido" | "cancelado";

export type Subtarea = { texto: string; hecho: boolean };
export type Datos = {
  // cheque
  direccion?: "emitido" | "recibido";
  numero?: string;
  banco?: string;
  contraparte?: string;
  echeq?: boolean;
  // documento
  categoria?: string;
  entidad?: string;
  // tarea
  subtareas?: Subtarea[];
  // recurrente
  base?: string;
  [k: string]: unknown;
};

export type Item = {
  id: number;
  tipo: Tipo;
  titulo: string;
  descripcion: string;
  fecha: string;
  hora: string;
  estado: Estado;
  prioridad: "baja" | "normal" | "alta";
  responsable: string;
  monto: string;
  alertDays: number;
  obligacionId: number | null;
  periodo: string | null;
  fechaOrigen: "manual" | "estimada" | "oficial" | "prorroga";
  recurrenteId: number | null;
  datos: Datos;
  presentado: boolean;
  pagado: boolean;
  cumplidoFecha: string | null;
  comprobante: string;
  montoPagado: string;
  cumplimientoNota: string;
  createdAt: string;
  updatedAt: string;
  obligacionNombre: string | null;
  organismo: string | null;
  requierePresentacion: boolean;
  requierePago: boolean;
};

export type Historial = { id: number; entidad: string; entidadId: number | null; accion: string; detalle: string; userName: string; createdAt: string; titulo?: string | null };

export type Obligacion = {
  id: number;
  codigo: string;
  nombre: string;
  organismo: string;
  periodicidad: "mensual" | "anual";
  mesAnual: number | null;
  diaEstimado: number;
  desfasePeriodo: number;
  presentacion: boolean;
  pago: boolean;
  responsable: string;
  alertDays: number;
  referencia: string;
  notas: string;
  activo: boolean;
  orden: number;
};

export type FechaCal = { fecha: string; origen: "oficial" | "prorroga" | "estimada"; norma: string; verificado: boolean };

export type Recurrente = {
  id: number;
  titulo: string;
  tipo: Tipo;
  descripcion: string;
  frecuencia: string;
  dia: number;
  desde: string;
  hasta: string | null;
  habiles: boolean;
  monto: string;
  responsable: string;
  alertDays: number;
  activo: boolean;
  proxima: string | null;
};

export type Contacto = { id: number; nombre: string; rubro: string; persona: string; telefono: string; email: string; cuit: string; notas: string };
export type Feriado = { fecha: string; nombre: string; tipo: string };

/** Colores fijos por tipo (marca de identidad: borde/punto; el texto va siempre en color de texto). */
export const TIPOS: { value: Tipo; label: string; plural: string; color: string }[] = [
  { value: "fiscal", label: "Fiscal", plural: "Fiscales", color: "#2a78d6" },
  { value: "pago", label: "Pago", plural: "Pagos", color: "#0ca30c" },
  { value: "cheque", label: "Cheque", plural: "Cheques", color: "#8b5cf6" },
  { value: "documento", label: "Documento / contrato", plural: "Documentos", color: "#eb6834" },
  { value: "tarea", label: "Tarea", plural: "Tareas", color: "#0d9488" },
  { value: "vencimiento", label: "Vencimiento", plural: "Vencimientos", color: "#ca8a04" },
  { value: "recordatorio", label: "Recordatorio", plural: "Recordatorios", color: "#64748b" },
];
export const TIPO_META = Object.fromEntries(TIPOS.map((t) => [t.value, t])) as Record<Tipo, (typeof TIPOS)[number]>;

export const ESTADOS: { value: Estado; label: string }[] = [
  { value: "pendiente", label: "Pendiente" },
  { value: "cumplido", label: "Cumplido" },
  { value: "cancelado", label: "Cancelado" },
];

export const ORGANISMOS: Record<string, string> = {
  arca: "ARCA",
  rentas_cba: "Rentas Córdoba",
  municipalidad: "Municipalidad",
  sindicato: "Sindicato / obra social",
  otro: "Otro",
};

export const ORIGEN_FECHA: Record<string, { label: string; title: string }> = {
  oficial: { label: "Oficial", title: "Fecha tomada del calendario oficial publicado" },
  prorroga: { label: "Prórroga", title: "Fecha prorrogada por resolución" },
  estimada: { label: "Estimada", title: "Calculada con la regla del día habitual: verificala con el calendario oficial" },
  manual: { label: "Manual", title: "Fecha cambiada a mano en este vencimiento" },
};

export const CATEGORIAS_DOC = ["Seguro / póliza", "Contrato", "Habilitación", "Certificado", "Licencia / suscripción", "Alquiler", "Mantenimiento", "Otro"];

export const FRECUENCIAS: { value: string; label: string }[] = [
  { value: "semanal", label: "Semanal" },
  { value: "mensual", label: "Mensual" },
  { value: "bimestral", label: "Cada 2 meses" },
  { value: "trimestral", label: "Cada 3 meses" },
  { value: "semestral", label: "Cada 6 meses" },
  { value: "anual", label: "Anual" },
];

export const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
export const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

// ----- fechas -----

export function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function hoyIso(): string {
  return isoOf(new Date());
}
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return isoOf(new Date(y, m - 1, d + n, 12));
}
/** Días de `desde` a `hasta` (positivo si hasta es posterior). */
export function diasEntre(desde: string, hasta: string): number {
  const [a, b, c] = desde.split("-").map(Number);
  const [x, y, z] = hasta.split("-").map(Number);
  return Math.round((Date.UTC(x, y - 1, z) - Date.UTC(a, b - 1, c)) / 86_400_000);
}
export function fechaAR(iso: string | null | undefined): string {
  if (!iso || iso.length < 10) return iso ?? "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
/** "lun 13/10" */
export function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${DIAS_LARGOS[new Date(y, m - 1, d, 12).getDay()].slice(0, 3)} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}
/** "lunes 13 de octubre" */
export function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${DIAS_LARGOS[new Date(y, m - 1, d, 12).getDay()]} ${d} de ${MESES[m - 1].toLowerCase()}`;
}
export function finDeMes(anio: number, mes: number): string {
  return isoOf(new Date(anio, mes, 0, 12));
}

/** Celdas de un mes para una grilla de 7 columnas que empieza el lunes (null = relleno). */
export function grillaMes(anio: number, mes: number): (string | null)[] {
  const primero = new Date(anio, mes - 1, 1, 12);
  const offset = (primero.getDay() + 6) % 7;
  const dias = new Date(anio, mes, 0).getDate();
  const out: (string | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= dias; d++) out.push(`${anio}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  while (out.length % 7) out.push(null);
  return out;
}

// ----- urgencia -----

export type Urgencia = "vencido" | "hoy" | "pronto" | "semana" | "mas" | "cumplido" | "cancelado";

export function urgencia(it: Pick<Item, "estado" | "fecha" | "alertDays">, hoy: string): Urgencia {
  if (it.estado === "cumplido") return "cumplido";
  if (it.estado === "cancelado") return "cancelado";
  const d = diasEntre(hoy, it.fecha);
  if (d < 0) return "vencido";
  if (d === 0) return "hoy";
  if (d <= Math.max(2, Math.min(it.alertDays ?? 3, 3))) return "pronto";
  if (d <= 7) return "semana";
  return "mas";
}

export function textoUrgencia(it: Pick<Item, "estado" | "fecha" | "alertDays">, hoy: string): string {
  if (it.estado === "cumplido") return "Cumplido";
  if (it.estado === "cancelado") return "Cancelado";
  const d = diasEntre(hoy, it.fecha);
  if (d < 0) return d === -1 ? "Venció ayer" : `Vencido hace ${-d} días`;
  if (d === 0) return "Vence hoy";
  if (d === 1) return "Mañana";
  return `En ${d} días`;
}

/** Estado de avance de un fiscal: qué falta. */
export function faltante(it: Pick<Item, "requierePresentacion" | "requierePago" | "presentado" | "pagado" | "estado">): string {
  if (it.estado !== "pendiente") return "";
  const f: string[] = [];
  if (it.requierePresentacion && !it.presentado) f.push("presentar");
  if (it.requierePago && !it.pagado) f.push("pagar");
  if (it.requierePresentacion && it.requierePago && f.length === 1) return `Falta ${f[0]}`;
  return "";
}

// ----- montos -----

/** Lee "$ 1.234.567,89", "1234567.89" o "1,234.50" → número (NaN si no hay). */
export function parseMonto(txt: string | null | undefined): number {
  const s = String(txt ?? "").replace(/[^\d.,-]/g, "");
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let norm: string;
  if (lastComma > lastDot) norm = s.replace(/\./g, "").replace(",", ".");
  else if (lastDot > lastComma && lastComma >= 0) norm = s.replace(/,/g, "");
  else if (lastDot >= 0 && /^\-?\d{1,3}(\.\d{3})+$/.test(s)) norm = s.replace(/\./g, "");
  else norm = s;
  const n = Number(norm);
  return Number.isFinite(n) ? n : NaN;
}

export function formatMonto(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function sumaMontos(items: Pick<Item, "monto">[]): { total: number; sinMonto: number } {
  let total = 0;
  let sinMonto = 0;
  for (const it of items) {
    const n = parseMonto(it.monto);
    if (Number.isFinite(n)) total += n;
    else sinMonto++;
  }
  return { total, sinMonto };
}

// ----- recurrentes -----

export function describirRecurrente(r: Pick<Recurrente, "frecuencia" | "dia" | "desde" | "habiles">): string {
  const f = FRECUENCIAS.find((x) => x.value === r.frecuencia)?.label ?? r.frecuencia;
  if (r.frecuencia === "semanal") return `Todos los ${DIAS_LARGOS[new Date(`${r.desde}T12:00`).getDay()]}`;
  const mesInicio = MESES[Number(r.desde.slice(5, 7)) - 1]?.toLowerCase() ?? "";
  const base = r.frecuencia === "mensual" ? `Todos los días ${r.dia}` : r.frecuencia === "anual" ? `Cada ${r.dia} de ${mesInicio}` : `${f}, día ${r.dia} (desde ${mesInicio})`;
  return r.habiles ? `${base} · día hábil` : base;
}

/** Agrupa ítems por fecha (para listas tipo agenda). */
export function agruparPorFecha<T extends { fecha: string }>(items: T[]): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const l = m.get(it.fecha);
    if (l) l.push(it);
    else m.set(it.fecha, [it]);
  }
  return [...m.entries()];
}

/** Coincidencia de búsqueda sin tildes ni mayúsculas. */
export function clave(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
export function coincide(it: Item, q: string): boolean {
  if (!q.trim()) return true;
  const k = clave(q.trim());
  return [it.titulo, it.descripcion, it.responsable, it.comprobante, it.datos?.numero, it.datos?.banco, it.datos?.contraparte, it.datos?.entidad, it.obligacionNombre]
    .some((c) => clave(String(c ?? "")).includes(k));
}
