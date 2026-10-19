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
