// Acciones concretas de cada módulo. El nivel (Ver / Cargar y editar / Control total) es un atajo:
// marca las acciones típicas de ese nivel, y a una persona o perfil se le pueden sumar o quitar.
// Debe coincidir con la pantalla: apps/web/src/lib/permisos.ts → ACCIONES.

export type Nivel = "ver" | "editar" | "total";
export type Accion = { key: string; nivel: Nivel };

export const ACCIONES: Record<string, Accion[]> = {
  dashboard: [{ key: "ver", nivel: "ver" }],
  liquidacion: [{ key: "ver", nivel: "ver" }],
  guardias: [
    { key: "ver", nivel: "ver" }, // calendario, registro, quién está de guardia
    { key: "estadisticas", nivel: "ver" },
    { key: "exportar", nivel: "ver" }, // CSV e imprimir
    { key: "cargar", nivel: "editar" }, // cargar y modificar guardias
    { key: "copiar", nivel: "editar" }, // copiar semana o mes
    { key: "historial", nivel: "editar" }, // historial de cambios
    { key: "eliminar", nivel: "total" },
    { key: "horarios", nivel: "total" }, // qué sectores participan y su horario requerido
    { key: "profesionales", nivel: "total" }, // datos de los profesionales
  ],
  administracion: [
    { key: "ver", nivel: "ver" },
    { key: "cargar", nivel: "editar" }, // cargar y editar vencimientos, pagos, cheques, documentos y tareas
    { key: "cumplir", nivel: "editar" }, // registrar presentaciones y pagos, marcar cumplido, reabrir, cancelar
    { key: "verificar", nivel: "editar" }, // verificar las fechas del mes y crear los vencimientos fiscales
    { key: "recurrentes", nivel: "editar" },
    { key: "contactos", nivel: "editar" },
    { key: "eliminar", nivel: "total" },
    { key: "calendario", nivel: "total" }, // obligaciones, calendario oficial y feriados
  ],
  inventario: [
    { key: "ver", nivel: "ver" },
    { key: "cargar", nivel: "editar" },
    { key: "eliminar", nivel: "total" },
  ],
  instructivos: [
    { key: "ver", nivel: "ver" },
    { key: "cargar", nivel: "editar" },
    { key: "eliminar", nivel: "total" },
  ],
};

const RANGO: Record<Nivel, number> = { ver: 1, editar: 2, total: 3 };

/** Acciones que da un nivel en un módulo (el atajo). */
export function accionesDeNivel(modulo: string, nivel: Nivel): string[] {
  return (ACCIONES[modulo] ?? []).filter((a) => RANGO[a.nivel] <= RANGO[nivel]).map((a) => a.key);
}

/**
 * Lista pedida → lista válida y ordenada (siempre incluye "ver"); null si coincide con la del nivel
 * (así, si el nivel cambia en un perfil, la persona lo hereda sin quedar "a medida").
 */
export function normalizarAcciones(modulo: string, nivel: Nivel, lista: unknown): string[] | null {
  if (!Array.isArray(lista)) return null;
  const validas = (ACCIONES[modulo] ?? []).map((a) => a.key);
  const pedidas = new Set(lista.map(String));
  pedidas.add("ver");
  const out = validas.filter((k) => pedidas.has(k));
  const base = accionesDeNivel(modulo, nivel);
  return out.length === base.length && out.every((k, i) => k === base[i]) ? null : out;
}
