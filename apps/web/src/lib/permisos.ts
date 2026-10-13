// Niveles de permiso por módulo y qué permite cada uno.
// Debe coincidir con los controles de la API (apps/api/src/lib/auth.ts → PERMISSION_MODULES).

export type Level = "ver" | "editar" | "total";

export const LEVEL_LABEL: Record<Level, string> = { ver: "Ver", editar: "Cargar y editar", total: "Control total" };
export const LEVEL_COLOR: Record<Level, { bg: string; fg: string }> = {
  ver: { bg: "hsl(220 15% 92%)", fg: "hsl(220 20% 30%)" },
  editar: { bg: "hsl(215 80% 92%)", fg: "hsl(215 70% 32%)" },
  total: { bg: "hsl(155 55% 88%)", fg: "hsl(155 60% 24%)" },
};

/** Qué permite cada nivel en cada módulo (debe coincidir con los controles de la API). */
export const MODULES: { key: string; label: string; levels: Level[]; can: Partial<Record<Level, string>> }[] = [
  { key: "dashboard", label: "Resumen", levels: ["ver"], can: { ver: "Ver el tablero: vencimientos próximos, guardias de hoy y actividad reciente." } },
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
    can: {
      ver: "Ver calendario, quién está de guardia ahora, registro y estadísticas; exportar CSV.",
      editar: "Además: cargar y modificar guardias, copiar semana o mes, ver el historial de cambios.",
      total: "Además: eliminar guardias y configurar horarios de sectores y datos de profesionales.",
    },
  },
  {
    key: "inventario",
    label: "Inventario",
    levels: ["ver", "editar", "total"],
    can: { ver: "Ver activos y movimientos.", editar: "Además: dar de alta y modificar activos.", total: "Además: eliminar activos." },
  },
  {
    key: "instructivos",
    label: "Instructivos",
    levels: ["ver", "editar", "total"],
    can: { ver: "Ver y consultar instructivos.", editar: "Además: publicar y modificar instructivos.", total: "Además: eliminar instructivos." },
  },
  { key: "liquidacion", label: "Liquidación", levels: ["ver"], can: { ver: "Ver el módulo (en desarrollo)." } },
];
