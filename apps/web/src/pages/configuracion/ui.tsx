import type { CSSProperties, ReactNode } from "react";
import { Archive, CalendarDays, CalendarX2, ClipboardList, FileText, LayoutDashboard, PackageOpen, type LucideIcon } from "lucide-react";
import { LEVEL_COLOR, LEVEL_LABEL, type Level } from "@/lib/permisos";
import { iniciales } from "./api";

// Piezas visuales compartidas por las secciones de Configuración.

export const ICONO_MODULO: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  administracion: ClipboardList,
  guardias: CalendarDays,
  cancelaciones: CalendarX2,
  inventario: PackageOpen,
  instructivos: Archive,
  liquidacion: FileText,
};

export const MUTED: CSSProperties = { fontSize: 12, color: "hsl(var(--muted-foreground))" };

export function Chip({ children, bg, fg, title, style }: { children: ReactNode; bg: string; fg: string; title?: string; style?: CSSProperties }) {
  return (
    <span title={title} className="cfg-chip" style={{ background: bg, color: fg, ...style }}>
      {children}
    </span>
  );
}

export function NivelChip({ nivel, corto }: { nivel: Level; corto?: boolean }) {
  const c = LEVEL_COLOR[nivel];
  return (
    <Chip bg={c.bg} fg={c.fg} title={LEVEL_LABEL[nivel]}>
      {corto ? { ver: "Ver", editar: "Carga", total: "Total" }[nivel] : LEVEL_LABEL[nivel]}
    </Chip>
  );
}

export const CHIP_PERFIL = { bg: "hsl(262 70% 93%)", fg: "hsl(262 50% 34%)" };
export const CHIP_EXCEPCION = { bg: "hsl(35 90% 90%)", fg: "hsl(30 70% 30%)" };
export const CHIP_SA = { bg: "hsl(222 60% 22%)", fg: "#fff" };

export function Avatar({ nombre, tam = 36, apagado }: { nombre: string; tam?: number; apagado?: boolean }) {
  // Color estable por nombre.
  let h = 0;
  for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span className="cfg-avatar" aria-hidden="true" style={{ width: tam, height: tam, fontSize: tam * 0.38, background: apagado ? "hsl(var(--muted))" : `hsl(${h} 55% 88%)`, color: apagado ? "hsl(var(--muted-foreground))" : `hsl(${h} 45% 28%)` }}>
      {iniciales(nombre)}
    </span>
  );
}

/** Encabezado de cada sección: título, explicación corta y acciones a la derecha. */
export function Cabecera({ titulo, texto, acciones }: { titulo: string; texto?: ReactNode; acciones?: ReactNode }) {
  return (
    <div className="cfg-cabecera">
      <div style={{ minWidth: 0 }}>
        <h2 className="cfg-h2">{titulo}</h2>
        {texto && <p className="cfg-texto">{texto}</p>}
      </div>
      {acciones && <div className="cfg-cabecera-acciones">{acciones}</div>}
    </div>
  );
}

export function Vacio({ titulo, texto, accion }: { titulo: string; texto?: string; accion?: ReactNode }) {
  return (
    <div className="cfg-vacio">
      <strong>{titulo}</strong>
      {texto && <span>{texto}</span>}
      {accion}
    </div>
  );
}

/** Panel lateral derecho (ficha, editor). En el celular ocupa toda la pantalla. */
export function Panel({ titulo, sub, onClose, children, pie, ancho = 760 }: { titulo: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; pie?: ReactNode; ancho?: number }) {
  return (
    <div className="cfg-panel-fondo" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="cfg-panel" style={{ width: `min(${ancho}px, 100%)` }} role="dialog" aria-modal="true" onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <header className="cfg-panel-cab">
          <div style={{ minWidth: 0, flex: 1 }}>{typeof titulo === "string" ? <h2 className="cfg-h2" style={{ margin: 0 }}>{titulo}</h2> : titulo}{sub}</div>
          <button type="button" className="btn btn-quiet cfg-cerrar" onClick={onClose} aria-label="Cerrar">✕</button>
        </header>
        <div className="cfg-panel-cuerpo">{children}</div>
        {pie && <footer className="cfg-panel-pie">{pie}</footer>}
      </aside>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: NoInfer<T>) => void; tabs: { value: NoInfer<T>; label: ReactNode }[] }) {
  return (
    <div className="cfg-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value} className={value === t.value ? "on" : ""} onClick={() => onChange(t.value)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
