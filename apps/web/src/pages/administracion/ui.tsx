import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { X } from "lucide-react";
import { ORIGEN_FECHA, TIPO_META, faltante, fechaCorta, textoUrgencia, urgencia, type Item, type Tipo, type Urgencia } from "./logic";

export const S = {
  card: { padding: 16, borderRadius: 14 } as CSSProperties,
  muted: { color: "hsl(var(--muted-foreground))" } as CSSProperties,
  small: { fontSize: 12, color: "hsl(var(--muted-foreground))" } as CSSProperties,
  label: { fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))" } as CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } as CSSProperties,
  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 } as CSSProperties,
  th: { position: "sticky", top: 0, zIndex: 1, background: "hsl(var(--card))", textAlign: "left", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "hsl(var(--muted-foreground))", padding: "8px 10px", borderBottom: "1px solid hsl(var(--border))", whiteSpace: "nowrap" } as CSSProperties,
  td: { padding: "9px 10px", borderBottom: "1px solid hsl(var(--border))", fontSize: 13, verticalAlign: "top" } as CSSProperties,
};

const URG_STYLE: Record<Urgencia, CSSProperties> = {
  vencido: { background: "#fde2e2", color: "#8f1d1d", borderColor: "#f0b4b4" },
  hoy: { background: "#fde7d8", color: "#8a3b0c", borderColor: "#f3c09c" },
  pronto: { background: "#fdf0d5", color: "#7a4a06", borderColor: "#efd28f" },
  semana: { background: "hsl(var(--muted))", color: "hsl(var(--foreground))", borderColor: "hsl(var(--border))" },
  mas: { background: "transparent", color: "hsl(var(--muted-foreground))", borderColor: "hsl(var(--border))" },
  cumplido: { background: "#dcf3dc", color: "#155c15", borderColor: "#a9dca9" },
  cancelado: { background: "transparent", color: "hsl(var(--muted-foreground))", borderColor: "hsl(var(--border))", textDecoration: "line-through" },
};

export function Pill({ children, style, title }: { children: ReactNode; style?: CSSProperties; title?: string }) {
  return (
    <span
      title={title}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, border: "1px solid transparent", whiteSpace: "nowrap", lineHeight: "18px", ...style }}
    >
      {children}
    </span>
  );
}

export function UrgenciaPill({ item, hoy }: { item: Pick<Item, "estado" | "fecha" | "alertDays">; hoy: string }) {
  return <Pill style={URG_STYLE[urgencia(item, hoy)]}>{textoUrgencia(item, hoy)}</Pill>;
}

export function TipoPill({ tipo }: { tipo: Tipo }) {
  const m = TIPO_META[tipo] ?? TIPO_META.recordatorio;
  return (
    <Pill style={{ background: "hsl(var(--muted))", color: "hsl(var(--foreground))" }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: m.color, display: "inline-block" }} aria-hidden="true" />
      {m.label}
    </Pill>
  );
}

export function OrigenPill({ origen }: { origen: string }) {
  const m = ORIGEN_FECHA[origen];
  if (!m || origen === "manual") return null;
  const st: CSSProperties =
    origen === "estimada"
      ? { background: "transparent", color: "var(--adm-warn)", borderColor: "#e3b964", borderStyle: "dashed" }
      : origen === "prorroga"
        ? { background: "#ede7fb", color: "#4c2a99", borderColor: "#cbbcf0" }
        : { background: "#e2edfb", color: "#1d4f91", borderColor: "#b5cdee" };
  return (
    <Pill style={st} title={m.title}>
      {origen === "estimada" ? "≈ " : ""}
      {m.label}
    </Pill>
  );
}

export function Modal({ titulo, onClose, children, ancho = 560, pie }: { titulo: string; onClose: () => void; children: ReactNode; ancho?: number; pie?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("input, select, textarea, button:not([data-cerrar])")?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()} style={{ zIndex: 60 }}>
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-label={titulo} style={{ width: `min(${ancho}px, 100%)`, maxHeight: "calc(100vh - 40px)", display: "flex", flexDirection: "column", padding: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 20px", borderBottom: "1px solid hsl(var(--border))" }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{titulo}</h2>
          <button type="button" className="btn btn-quiet btn-icon" onClick={onClose} aria-label="Cerrar" data-cerrar>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: 20, overflowY: "auto" }}>{children}</div>
        {pie && <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", padding: "12px 20px", borderTop: "1px solid hsl(var(--border))" }}>{pie}</div>}
      </div>
    </div>
  );
}

export function Campo({ label, children, hint, full }: { label: string; children: ReactNode; hint?: string; full?: boolean }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, gridColumn: full ? "1 / -1" : undefined, minWidth: 0 }}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Vacio({ titulo, texto, accion }: { titulo: string; texto?: string; accion?: ReactNode }) {
  return (
    <div style={{ textAlign: "center", padding: "36px 16px", border: "1px dashed hsl(var(--border))", borderRadius: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{titulo}</div>
      {texto && <div style={{ ...S.small, maxWidth: 420, margin: "0 auto" }}>{texto}</div>}
      {accion && <div style={{ marginTop: 12 }}>{accion}</div>}
    </div>
  );
}

export function Kpi({ label, valor, nota, tono, onClick }: { label: string; valor: ReactNode; nota?: string; tono?: "alerta" | "ok"; onClick?: () => void }) {
  const color = tono === "alerta" ? "var(--adm-danger)" : tono === "ok" ? "var(--adm-ok)" : undefined;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className="card"
      style={{ padding: "14px 16px", borderRadius: 14, textAlign: "left", font: "inherit", color: "inherit", cursor: onClick ? "pointer" : "default", minWidth: 0 }}
    >
      <div style={S.label}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color, letterSpacing: "-0.02em" }}>{valor}</div>
      {nota && <div style={{ ...S.small, marginTop: 2 }}>{nota}</div>}
    </Tag>
  );
}

/** Fila compacta de un ítem (resumen, agenda, día del calendario). */
export function ItemFila({ item, hoy, onOpen, onCheck, mostrarFecha = true, puedeEditar }: { item: Item; hoy: string; onOpen: (it: Item) => void; onCheck?: (it: Item) => void; mostrarFecha?: boolean; puedeEditar: boolean }) {
  const m = TIPO_META[item.tipo] ?? TIPO_META.recordatorio;
  const falta = faltante(item);
  const sub = [
    item.tipo === "cheque" && item.datos?.direccion ? (item.datos.direccion === "emitido" ? "Emitido" : "Recibido") : "",
    item.datos?.contraparte || item.datos?.entidad || "",
    item.responsable,
    item.monto ? `$ ${item.monto}` : "",
    item.hora,
  ].filter(Boolean);
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 10, border: "1px solid hsl(var(--border))", borderLeft: `4px solid ${m.color}`, background: "hsl(var(--card))", minWidth: 0 }}
    >
      {onCheck && puedeEditar && item.estado === "pendiente" && (
        <button
          type="button"
          onClick={() => onCheck(item)}
          title="Marcar como cumplido"
          aria-label={`Marcar «${item.titulo}» como cumplido`}
          style={{ width: 22, height: 22, flex: "0 0 22px", borderRadius: 6, border: "2px solid hsl(var(--border))", background: "transparent", cursor: "pointer" }}
        />
      )}
      <button type="button" onClick={() => onOpen(item)} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer" }}>
        <div style={{ fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: item.estado === "cancelado" ? "line-through" : undefined }}>
          {item.prioridad === "alta" && item.estado === "pendiente" && <span style={{ color: "var(--adm-danger)" }} title="Prioridad alta">● </span>}
          {item.titulo}
        </div>
        {(sub.length > 0 || falta) && (
          <div style={{ ...S.small, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {falta && <strong style={{ color: "var(--adm-warn)" }}>{falta}</strong>}
            {falta && sub.length > 0 ? " · " : ""}
            {sub.join(" · ")}
          </div>
        )}
      </button>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flex: "0 0 auto" }}>
        <UrgenciaPill item={item} hoy={hoy} />
        <div style={{ ...S.small, fontSize: 11, display: "flex", gap: 4, alignItems: "center" }}>
          {item.fechaOrigen !== "manual" && item.tipo === "fiscal" && <OrigenPill origen={item.fechaOrigen} />}
          {mostrarFecha && fechaCorta(item.fecha)}
        </div>
      </div>
    </div>
  );
}

export function Seccion({ titulo, extra, children, style }: { titulo: ReactNode; extra?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <section className="card" style={{ ...S.card, minWidth: 0, ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

export function SegControl<T extends string>({ value, onChange, opciones, label }: { value: T; onChange: (v: NoInfer<T>) => void; opciones: { value: NoInfer<T>; label: ReactNode }[]; label: string }) {
  return (
    <div role="group" aria-label={label} style={{ display: "inline-flex", padding: 3, gap: 2, background: "hsl(var(--muted))", borderRadius: 10, border: "1px solid hsl(var(--border))", flexWrap: "wrap" }}>
      {opciones.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          style={{
            border: "none",
            padding: "6px 11px",
            borderRadius: 8,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
            background: value === o.value ? "hsl(var(--card))" : "transparent",
            color: value === o.value ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
            boxShadow: value === o.value ? "0 1px 2px rgba(0,0,0,.08)" : "none",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
