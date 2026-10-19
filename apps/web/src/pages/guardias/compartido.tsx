// Piezas de Guardias que también usa Configuración (sectores de guardia y catálogo de etiquetas).
import type { Franja } from "./logic";

export const DOW_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** Colores sugeridos para las etiquetas (todos con buen contraste sobre texto blanco). */
export const TAG_COLORS = ["#0d9488", "#c2410c", "#1d4ed8", "#7c3aed", "#b91c1c", "#ca8a04", "#334155", "#be185d"];

/** Etiqueta del catálogo (Configuración → Etiquetas). */
export type Etiqueta = { id: number; nombre: string; color: string; activa: boolean; usos: number };

export function TagBadge({ label, color }: { label?: string | null; color?: string | null }) {
  if (!label) return null;
  return (
    <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.02em", padding: "2px 8px", borderRadius: 999, background: color || "#0d9488", color: "#fff", lineHeight: 1.4, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

/** Editor del horario de cobertura requerido de un sector. */
export function CoberturaEditor({ value, onChange, disabled }: { value: Franja[]; onChange: (v: Franja[]) => void; disabled?: boolean }) {
  const preset = (dows: number[], start: string, end: string) => onChange(dows.map((dow) => ({ dow, start, end })));
  const update = (i: number, patch: Partial<Franja>) => onChange(value.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} disabled={disabled} onClick={() => preset([0, 1, 2, 3, 4, 5, 6], "00:00", "24:00")}>24 h todos los días</button>
        <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} disabled={disabled} onClick={() => preset([1, 2, 3, 4, 5], "08:00", "20:00")}>Lun a Vie 08–20</button>
        <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} disabled={disabled} onClick={() => preset([0, 1, 2, 3, 4, 5, 6], "08:00", "20:00")}>Todos los días 08–20</button>
        <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} disabled={disabled} onClick={() => onChange([])}>Sin horario fijo</button>
      </div>
      {value.length === 0 ? (
        <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>Sin horario fijo: se marca solo si un día no hay nadie.</div>
      ) : (
        value.map((f, i) => (
          <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <select className="select" style={{ width: 130 }} value={f.dow} disabled={disabled} onChange={(e) => update(i, { dow: Number(e.target.value) })}>
              {DOW_LABELS.map((l, d) => <option key={d} value={d}>{l}</option>)}
            </select>
            <input className="input" type="time" style={{ width: 110 }} value={f.start} disabled={disabled} onChange={(e) => update(i, { start: e.target.value })} />
            <span style={{ fontSize: 12 }}>a</span>
            {/* 00:00 como hora de fin = hasta el final del día (se guarda como 24:00). */}
            <input className="input" type="time" style={{ width: 110 }} value={f.end === "24:00" ? "00:00" : f.end} disabled={disabled} onChange={(e) => update(i, { end: e.target.value === "00:00" ? "24:00" : e.target.value })} />
            <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} disabled={disabled} onClick={() => onChange(value.filter((_, j) => j !== i))}>Quitar</button>
          </div>
        ))
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} disabled={disabled} onClick={() => onChange([...value, { dow: 1, start: "08:00", end: "20:00" }])}>+ Agregar franja</button>
        <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>Fin 00:00 = hasta medianoche. Una noche (20 a 08) se carga como 20:00–00:00 y, el día siguiente, 00:00–08:00.</span>
      </div>
    </div>
  );
}

export function franjasResumen(c: Franja[]): string {
  if (c.length === 0) return "Sin horario fijo";
  const full = c.filter((f) => f.start === "00:00" && f.end === "24:00").map((f) => f.dow);
  if (full.length === 7 && c.length === 7) return "24 h todos los días";
  const byRange = new Map<string, number[]>();
  for (const f of c) byRange.set(`${f.start}–${f.end}`, [...(byRange.get(`${f.start}–${f.end}`) || []), f.dow]);
  return Array.from(byRange.entries())
    .map(([r, dows]) => `${dows.sort().map((d) => DOW_LABELS[d].slice(0, 3)).join(", ")} ${r}`)
    .join(" · ");
}
