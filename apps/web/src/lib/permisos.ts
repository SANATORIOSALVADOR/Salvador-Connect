// Niveles de permiso por módulo y qué permite cada uno.
// Debe coincidir con los controles de la API (apps/api/src/lib/auth.ts → PERMISSION_MODULES).

export type Level = "ver" | "editar" | "total";

export const LEVEL_LABEL: Record<Level, string> = { ver: "Ver", editar: "Cargar y editar", total: "Control total" };
export const LEVEL_COLOR: Record<Level, { bg: string; fg: string }> = {
  ver: { bg: "hsl(220 15% 92%)", fg: "hsl(220 20% 30%)" },
  editar: { bg: "hsl(215 80% 92%)", fg: "hsl(215 70% 32%)" },
  total: { bg: "hsl(155 55% 88%)", fg: "hsl(155 60% 24%)" },
};

/**
 * Alcance en módulos con sectores (debe coincidir con la API: lib/auth.ts → ALCANCES).
 *  todos: ve y trabaja en todos · carga: ve todo y trabaja en sus sectores · sector: solo sus sectores.
 */
export type Alcance = "todos" | "carga" | "sector";
export type ModuleScope = { alcance: Alcance; sectorIds: number[] };
export const ALCANCE_LABEL: Record<Alcance, string> = {
  todos: "Todos los sectores",
  carga: "Ve todo, trabaja en sus sectores",
  sector: "Solo sus sectores",
};
export const ALCANCE_AYUDA: Record<Alcance, string> = {
  todos: "Ve y trabaja con la información de todos los sectores.",
  carga: "Ve la información de todos los sectores, pero carga, modifica y elimina solo en los suyos.",
  sector: "Ve y trabaja únicamente con la información de sus sectores: el resto no le aparece.",
};

/** Qué permite cada nivel en cada módulo (debe coincidir con los controles de la API). */
export const MODULES: { key: string; label: string; levels: Level[]; can: Partial<Record<Level, string>>; sectores?: boolean }[] = [
  { key: "dashboard", label: "Inicio", levels: ["ver"], can: { ver: "Ver la pantalla de inicio con lo de su día según sus módulos." } },
  {
    key: "administracion",
    label: "Administración",
    levels: ["ver", "editar", "total"],
    can: {
      ver: "Ver la agenda, el control fiscal, cheques, documentos, tareas y contactos.",
      editar: "Además: cargar y editar, registrar presentaciones y pagos, recurrentes, contactos y verificar las fechas del mes.",
      total: "Además: eliminar, el catálogo de obligaciones, el calendario oficial (fechas y prórrogas) y los feriados.",
    },
  },
  {
    key: "guardias",
    label: "Guardias Médicas",
    levels: ["ver", "editar", "total"],
    sectores: true,
    can: {
      ver: "Ver calendario, quién está de guardia ahora, registro y estadísticas; exportar CSV.",
      editar: "Además: cargar y modificar guardias, copiar semana o mes, ver el historial de cambios.",
      total: "Además: eliminar guardias y configurar horarios de sectores y datos de profesionales.",
    },
  },
  {
    key: "inventario",
    label: "Inventario (próximamente)",
    levels: ["ver", "editar", "total"],
    sectores: true,
    can: { ver: "Ver activos y movimientos.", editar: "Además: dar de alta y modificar activos.", total: "Además: eliminar activos." },
  },
  {
    key: "instructivos",
    label: "Instructivos (próximamente)",
    levels: ["ver", "editar", "total"],
    sectores: true,
    can: { ver: "Ver y consultar instructivos.", editar: "Además: publicar y modificar instructivos.", total: "Además: eliminar instructivos." },
  },
  { key: "liquidacion", label: "Liquidación (próximamente)", levels: ["ver"], can: { ver: "Ver el módulo cuando esté disponible." } },
];

/**
 * Acciones concretas de cada módulo (debe coincidir con la API: apps/api/src/lib/acciones.ts).
 * El nivel es un atajo: marca las acciones de ese nivel; a una persona o perfil se le pueden sumar o quitar.
 */
export const ACCIONES: Record<string, { key: string; label: string; nivel: Level }[]> = {
  dashboard: [{ key: "ver", label: "Ver la pantalla de inicio", nivel: "ver" }],
  liquidacion: [{ key: "ver", label: "Ver el módulo", nivel: "ver" }],
  guardias: [
    { key: "ver", label: "Ver calendario, registro y quién está de guardia", nivel: "ver" },
    { key: "estadisticas", label: "Ver estadísticas de productividad", nivel: "ver" },
    { key: "exportar", label: "Exportar CSV e imprimir", nivel: "ver" },
    { key: "cargar", label: "Cargar y modificar guardias", nivel: "editar" },
    { key: "copiar", label: "Copiar semana o mes", nivel: "editar" },
    { key: "historial", label: "Ver el historial de cambios", nivel: "editar" },
    { key: "eliminar", label: "Eliminar guardias", nivel: "total" },
    { key: "horarios", label: "Configurar sectores que participan y su horario", nivel: "total" },
    { key: "profesionales", label: "Editar datos de los profesionales", nivel: "total" },
  ],
  administracion: [
    { key: "ver", label: "Ver agenda, fiscal, cheques, documentos, tareas y contactos", nivel: "ver" },
    { key: "cargar", label: "Cargar y editar vencimientos, pagos, cheques, documentos y tareas", nivel: "editar" },
    { key: "cumplir", label: "Registrar presentaciones y pagos, marcar cumplido, reabrir o cancelar", nivel: "editar" },
    { key: "verificar", label: "Verificar las fechas del mes y crear los vencimientos fiscales", nivel: "editar" },
    { key: "recurrentes", label: "Configurar recurrentes", nivel: "editar" },
    { key: "contactos", label: "Cargar y editar contactos", nivel: "editar" },
    { key: "eliminar", label: "Eliminar ítems, recurrentes y contactos", nivel: "total" },
    { key: "calendario", label: "Catálogo de obligaciones, calendario oficial y feriados", nivel: "total" },
  ],
  inventario: [
    { key: "ver", label: "Ver activos y movimientos", nivel: "ver" },
    { key: "cargar", label: "Dar de alta y modificar activos", nivel: "editar" },
    { key: "eliminar", label: "Eliminar activos", nivel: "total" },
  ],
  instructivos: [
    { key: "ver", label: "Ver y consultar instructivos", nivel: "ver" },
    { key: "cargar", label: "Publicar y modificar instructivos", nivel: "editar" },
    { key: "eliminar", label: "Eliminar instructivos", nivel: "total" },
  ],
};

const RANGO: Record<Level, number> = { ver: 1, editar: 2, total: 3 };

/** Acciones típicas de un nivel (el atajo). */
export function accionesDeNivel(modulo: string, nivel: Level): string[] {
  return (ACCIONES[modulo] ?? []).filter((a) => RANGO[a.nivel] <= RANGO[nivel]).map((a) => a.key);
}

/** Ordena según el catálogo y siempre incluye "ver". */
export function ordenarAcciones(modulo: string, lista: string[]): string[] {
  const set = new Set([...lista, "ver"]);
  return (ACCIONES[modulo] ?? []).map((a) => a.key).filter((k) => set.has(k));
}

export function mismasAcciones(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
