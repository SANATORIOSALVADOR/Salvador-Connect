import type { Contacto, FechaCal, Feriado, Historial, Item, Obligacion, Recurrente } from "./logic";

const API = "/api/administracion";

/** fetch con cookie de sesión; si falla, lanza el mensaje que manda el servidor. */
export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? "GET",
    credentials: "include",
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data as { message?: string } | null)?.message || `Error ${res.status}`);
  return data as T;
}

export type Resumen = {
  hoy: string;
  periodo: string;
  pendientes: Item[];
  cheques: Item[];
  tareas: Item[];
  fiscal: { total: number; cumplidos: number; cancelados: number; vencidos: number; estimadas: number; obligaciones: number; oficiales: number; verificadas: number };
  avisos: { nivel: "alta" | "media"; texto: string; tab?: string }[];
};

export type FilaFiscal = { obligacion: Obligacion; item: Item | null } & FechaCal;
export type MesFiscal = { anio: number; mes: number; periodo: string; filas: FilaFiscal[]; sueltos: Item[]; feriadosCargados: boolean };
export type CalendarioAnual = { anio: number; obligaciones: Obligacion[]; celdas: Record<number, Record<number, FechaCal>>; feriadosCargados: boolean };

export const adm = {
  resumen: () => api<Resumen>("/resumen"),
  items: (q: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]);
    return api<Item[]>(`/items?${p}`);
  },
  item: (id: number) => api<Item & { historial: Historial[] }>(`/items/${id}`),
  crear: (body: Partial<Item>) => api<Item>("/items", { method: "POST", body }),
  editar: (id: number, body: Partial<Item>) => api<Item>(`/items/${id}`, { method: "PATCH", body }),
  cumplir: (id: number, body: Record<string, unknown>) => api<{ item: Item; renovado: Item | null }>(`/items/${id}/cumplir`, { method: "POST", body }),
  reabrir: (id: number) => api<Item>(`/items/${id}/reabrir`, { method: "POST", body: {} }),
  cancelar: (id: number, motivo: string) => api<Item>(`/items/${id}/cancelar`, { method: "POST", body: { motivo } }),
  borrar: (id: number) => api<void>(`/items/${id}`, { method: "DELETE" }),
  responsables: () => api<string[]>("/responsables"),

  fiscal: (anio: number, mes: number) => api<MesFiscal>(`/fiscal?anio=${anio}&mes=${mes}`),
  generar: (anio: number, mes: number) => api<{ creados: number; actualizados: number }>("/fiscal/generar", { method: "POST", body: { anio, mes } }),
  obligaciones: () => api<Obligacion[]>("/obligaciones"),
  crearObligacion: (body: Partial<Obligacion>) => api<Obligacion>("/obligaciones", { method: "POST", body }),
  editarObligacion: (id: number, body: Partial<Obligacion>) => api<Obligacion>(`/obligaciones/${id}`, { method: "PATCH", body }),
  borrarObligacion: (id: number) => api<void>(`/obligaciones/${id}`, { method: "DELETE" }),
  calendario: (anio: number) => api<CalendarioAnual>(`/calendario?anio=${anio}`),
  guardarFecha: (body: { obligacionId: number; anio: number; mes: number; fecha: string | null; origen?: string; norma?: string; motivo?: string }) =>
    api<{ ok: true }>("/calendario", { method: "PUT", body }),
  cargarLote: (body: { obligacionId: number; anio: number; texto: string; norma?: string }) =>
    api<{ cargadas: number; meses: number[]; ignoradas: string[] }>("/calendario/lote", { method: "POST", body }),
  importarAgenda: (body: { anio: number; norma: string; filas: { obligacionId: number; fecha: string }[]; claves: { obligacionId: number; texto: string }[] }) =>
    api<{ cargadas: number; obligaciones: number; aprendidas: number }>("/calendario/importar", { method: "POST", body }),
  verificarMes: (anio: number, mes: number) => api<{ verificadas: number }>("/calendario/verificar", { method: "POST", body: { anio, mes } }),
  historial: (entidad?: string) => api<Historial[]>(`/historial${entidad ? `?entidad=${entidad}` : ""}`),

  feriados: (anio: number) => api<Feriado[]>(`/feriados?anio=${anio}`),
  crearFeriado: (body: Feriado) => api<Feriado>("/feriados", { method: "POST", body }),
  borrarFeriado: (fecha: string) => api<void>(`/feriados/${fecha}`, { method: "DELETE" }),
  importarFeriados: (anio: number) => api<{ importados: number }>("/feriados/importar", { method: "POST", body: { anio } }),

  recurrentes: () => api<Recurrente[]>("/recurrentes"),
  crearRecurrente: (body: Partial<Recurrente>) => api<Recurrente & { generados: number }>("/recurrentes", { method: "POST", body }),
  editarRecurrente: (id: number, body: Partial<Recurrente>) => api<Recurrente & { generados: number }>(`/recurrentes/${id}`, { method: "PATCH", body }),
  borrarRecurrente: (id: number) => api<void>(`/recurrentes/${id}`, { method: "DELETE" }),

  contactos: () => api<Contacto[]>("/contactos"),
  crearContacto: (body: Partial<Contacto>) => api<Contacto>("/contactos", { method: "POST", body }),
  editarContacto: (id: number, body: Partial<Contacto>) => api<Contacto>(`/contactos/${id}`, { method: "PATCH", body }),
  borrarContacto: (id: number) => api<void>(`/contactos/${id}`, { method: "DELETE" }),
};
