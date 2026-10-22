// Inventario: tipos, llamadas a la API y cálculos de controles (sin React).

export type Estado = "operativo" | "con_falla" | "en_reparacion" | "fuera_servicio" | "baja";

export type Equipo = {
  id: number;
  planta: string;
  sectorId: number;
  sectorName: string | null;
  rubro: string;
  tipo: string;
  descripcion: string;
  marca: string;
  codigoSerie: string;
  estado: Estado;
  frecuenciaDias: number | null;
  ultimoControl: string | null;
  proximoControl: string | null;
  observaciones: string;
  createdAt: string;
  updatedAt: string;
};

export type TipoRegistro = "control" | "falla" | "envio" | "reparacion" | "traslado" | "alta" | "cambio" | "baja" | "importacion";

export type EstadoPunto = "ok" | "obs" | "falla";
export type PuntoControl = { item: string; estado: EstadoPunto; nota?: string };

export type Registro = {
  id: number;
  itemId: number;
  tipo: TipoRegistro;
  fecha: string;
  resultado: "" | "ok" | "observacion" | "falla";
  detalle: string;
  responsable: string;
  estadoNuevo: string;
  checklist: PuntoControl[] | null;
  proveedor: string;
  userNombre: string;
  createdAt: string;
  item?: { id: number; descripcion: string; planta: string; sectorName: string | null; rubro: string; tipo: string; marca: string; codigoSerie: string };
};

export type EquipoDetalle = Equipo & { registros: Registro[] };

/** Plan de un tipo de equipo: cada cuánto se controla y qué se revisa. */
export type Plan = { tipo: string; frecuenciaDias: number | null; checklist: string[] };

export type Catalogos = {
  plantas: { valor: string; n: number }[];
  rubros: { valor: string; n: number }[];
  tipos: { valor: string; n: number }[];
  planes: Plan[];
};

export type ResultadoImportacion = {
  simulado: boolean;
  resumen: { total: number; nuevos: number; actualizados: number; iguales: number; errores: number };
  filas: { fila: number; estado: "nuevo" | "actualiza" | "igual" | "error"; mensajes: string[]; id?: number; descripcion: string }[];
};

export const ESTADOS: { value: Estado; label: string; bg: string; fg: string }[] = [
  { value: "operativo", label: "Operativo", bg: "#dcf3dc", fg: "#155c15" },
  { value: "con_falla", label: "Con falla", bg: "#fde2e2", fg: "#8f1d1d" },
  { value: "en_reparacion", label: "En reparación", bg: "#fdf0d5", fg: "#7a4a06" },
  { value: "fuera_servicio", label: "Fuera de servicio", bg: "#e5e7eb", fg: "#374151" },
  { value: "baja", label: "Baja", bg: "transparent", fg: "#6b7280" },
];
export const estadoMeta = (e: string) => ESTADOS.find((x) => x.value === e) ?? ESTADOS[0];

export const FRECUENCIAS: { dias: number; label: string }[] = [
  { dias: 7, label: "Semanal" },
  { dias: 15, label: "Quincenal" },
  { dias: 30, label: "Mensual" },
  { dias: 60, label: "Bimestral" },
  { dias: 90, label: "Trimestral" },
  { dias: 120, label: "Cuatrimestral" },
  { dias: 180, label: "Semestral" },
  { dias: 365, label: "Anual" },
  { dias: 730, label: "Cada 2 años" },
];

export function frecuenciaTexto(dias: number | null | undefined): string {
  if (!dias) return "Sin control periódico";
  return FRECUENCIAS.find((f) => f.dias === dias)?.label ?? `Cada ${dias} días`;
}

export const TIPO_REGISTRO: Record<TipoRegistro, string> = {
  control: "Control",
  falla: "Falla",
  envio: "Enviado a reparación",
  reparacion: "Reparación",
  traslado: "Traslado",
  alta: "Alta",
  cambio: "Cambio",
  baja: "Baja",
  importacion: "Importación",
};
export const RESULTADO: Record<string, string> = { ok: "OK", observacion: "Con observaciones", falla: "Con falla" };

export function hoyIso(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function sumarDias(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return hoyIso(new Date(y, m - 1, d + n, 12));
}
export function fechaAr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(hasta + "T12:00:00") - Date.parse(desde + "T12:00:00")) / 86_400_000);
}

/** Situación del próximo control de un equipo. */
export type Situacion = "vencido" | "semana" | "mes" | "aldia" | "sin";
export function situacion(e: Pick<Equipo, "proximoControl" | "estado">, hoy: string): Situacion {
  if (!e.proximoControl || e.estado === "baja") return "sin";
  const d = diasEntre(hoy, e.proximoControl);
  if (d < 0) return "vencido";
  if (d <= 7) return "semana";
  if (d <= 30) return "mes";
  return "aldia";
}
export const SITUACION: Record<Situacion, { label: string; bg: string; fg: string }> = {
  vencido: { label: "Control vencido", bg: "#fde2e2", fg: "#8f1d1d" },
  semana: { label: "Esta semana", bg: "#fde7d8", fg: "#8a3b0c" },
  mes: { label: "Este mes", bg: "#fdf0d5", fg: "#7a4a06" },
  aldia: { label: "Al día", bg: "#dcf3dc", fg: "#155c15" },
  sin: { label: "Sin control", bg: "transparent", fg: "#6b7280" },
};

export function textoProximo(e: Pick<Equipo, "proximoControl" | "estado">, hoy: string): string {
  if (!e.proximoControl || e.estado === "baja") return "—";
  const d = diasEntre(hoy, e.proximoControl);
  if (d < 0) return `Venció hace ${-d} día${d === -1 ? "" : "s"}`;
  if (d === 0) return "Hoy";
  if (d === 1) return "Mañana";
  return `En ${d} días · ${fechaAr(e.proximoControl)}`;
}

/** Búsqueda sin tildes ni mayúsculas. */
export function clave(v: string): string {
  return (v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api/inventario${path}`, {
    method: init?.method ?? "GET",
    credentials: "include",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(b.message || `Error ${res.status}`);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

export type DatosEquipo = {
  planta: string;
  sectorId: number | "";
  rubro: string;
  tipo: string;
  descripcion: string;
  marca: string;
  codigoSerie: string;
  frecuenciaDias: number | null;
  ultimoControl?: string | null;
  observaciones: string;
  estado?: Estado;
};

export type DatosRegistro = {
  tipo: "control" | "falla" | "envio" | "reparacion";
  fecha: string;
  resultado?: "ok" | "observacion" | "falla";
  detalle: string;
  responsable: string;
  proveedor?: string;
  checklist?: PuntoControl[];
  estado?: Estado | "";
};

/** Resultado de un control según la lista de verificación (el peor punto). */
export function resultadoDe(puntos: { estado: EstadoPunto | null }[]): "ok" | "observacion" | "falla" | null {
  if (puntos.some((p) => !p.estado)) return null;
  if (puntos.some((p) => p.estado === "falla")) return "falla";
  if (puntos.some((p) => p.estado === "obs")) return "observacion";
  return "ok";
}

/** Plan del tipo de un equipo (sin distinguir mayúsculas ni tildes). */
export function planDe(planes: Plan[] | undefined, tipo: string): Plan | undefined {
  return (planes ?? []).find((p) => clave(p.tipo) === clave(tipo));
}

export const inv = {
  items: (bajas = false) => api<Equipo[]>(`/items${bajas ? "?bajas=1" : ""}`),
  item: (id: number) => api<EquipoDetalle>(`/items/${id}`),
  crear: (d: DatosEquipo) => api<Equipo>("/items", { method: "POST", body: d }),
  editar: (id: number, d: Partial<DatosEquipo>) => api<Equipo>(`/items/${id}`, { method: "PATCH", body: d }),
  lote: (ids: number[], cambios: Partial<DatosEquipo>) => api<{ actualizados: number; omitidos: number[] }>("/lote", { method: "PATCH", body: { ids, cambios } }),
  baja: (id: number, motivo: string) => api<Equipo>(`/items/${id}/baja`, { method: "POST", body: { motivo } }),
  reactivar: (id: number) => api<Equipo>(`/items/${id}/reactivar`, { method: "POST", body: {} }),
  eliminar: (id: number) => api<null>(`/items/${id}`, { method: "DELETE" }),
  registrar: (id: number, d: DatosRegistro) => api<Equipo>(`/items/${id}/registros`, { method: "POST", body: d }),
  registrarLote: (ids: number[], d: DatosRegistro) => api<{ registrados: number; omitidos: number[] }>("/registros/lote", { method: "POST", body: { ids, ...d } }),
  registros: (q: { desde?: string; hasta?: string; tipo?: string; limit?: number }) =>
    api<Registro[]>(`/registros?${new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]))}`),
  importar: (filas: Record<string, unknown>[], modo: "agregar" | "actualizar", simular: boolean) =>
    api<ResultadoImportacion>("/importar", { method: "POST", body: { filas, modo, simular } }),
  catalogos: () => api<Catalogos>("/catalogos"),
  renombrar: (campo: "planta" | "rubro" | "tipo", de: string, a: string) => api<{ actualizados: number }>("/catalogos/renombrar", { method: "POST", body: { campo, de, a } }),
  plan: (tipo: string, frecuenciaDias: number | null, aplicar: "todos" | "sin_frecuencia" | "ninguno", checklist?: string[]) =>
    api<{ actualizados: number }>("/planes", { method: "PUT", body: { tipo, frecuenciaDias, aplicar, checklist } }),
};
