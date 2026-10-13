import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApariencia } from "@/pages/shared/apariencia";

// Gráficos del Resumen. Paleta categórica validada (slots 1-2 de la paleta de referencia, claro y oscuro)
// y colores de estado reservados para cobertura y vencidos; cada color va con leyenda o etiqueta.

type Datos = {
  guardiasPorSector?: { sector: string; activas: number; pasivas: number }[];
  cobertura7?: { fecha: string; etiqueta: string; porcentaje: number | null }[];
  vencimientos?: { semana: string; desde: string; pendientes: number; vencidos: number }[];
};

const SERIES = {
  claro: { s1: "#2a78d6", s2: "#eb6834" },
  oscuro: { s1: "#3987e5", s2: "#d95926" },
};
const ESTADO = { bien: "#0ca30c", atencion: "#ec835a", critico: "#d03b3b" };

const CARD: CSSProperties = { padding: 16, borderRadius: 14, minWidth: 0 };
const TICK = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };

function estadoCobertura(p: number): { color: string; texto: string } {
  if (p >= 95) return { color: ESTADO.bien, texto: "Cubierto" };
  if (p >= 75) return { color: ESTADO.atencion, texto: "Faltan horas" };
  return { color: ESTADO.critico, texto: "Muy incompleto" };
}

function Tarjeta({ titulo, subtitulo, tabla, children }: { titulo: string; subtitulo: string; tabla: ReactNode; children: ReactNode }) {
  const [verTabla, setVerTabla] = useState(false);
  return (
    <section className="card" style={CARD}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div>
          <div className="section-title" style={{ fontSize: 15 }}>{titulo}</div>
          <div className="section-kicker">{subtitulo}</div>
        </div>
        <button type="button" className="btn btn-quiet" style={{ fontSize: 11, padding: "4px 8px", flex: "0 0 auto" }} onClick={() => setVerTabla((v) => !v)} aria-pressed={verTabla}>
          {verTabla ? "Ver gráfico" : "Ver tabla"}
        </button>
      </div>
      <div style={{ marginTop: 12 }}>{verTabla ? tabla : children}</div>
    </section>
  );
}

function TooltipCaja({ active, payload, label, sufijo = "" }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; sufijo?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, padding: "8px 10px", fontSize: 12, boxShadow: "0 8px 24px rgba(15,23,42,.18)" }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
          <span style={{ color: "hsl(var(--muted-foreground))" }}>{p.name}:</span>
          <strong>{p.value}{sufijo}</strong>
        </div>
      ))}
    </div>
  );
}

const TABLA: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const TD: CSSProperties = { padding: "6px 8px", borderBottom: "1px solid hsl(var(--border))", textAlign: "left" };

export function DashboardGraficos() {
  const { oscuro } = useApariencia();
  const colores = oscuro ? SERIES.oscuro : SERIES.claro;
  const [datos, setDatos] = useState<Datos | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/graficos", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setDatos)
      .catch(() => setDatos(null));
  }, []);

  if (!datos) return null;
  const { guardiasPorSector, cobertura7, vencimientos } = datos;
  if (!guardiasPorSector && !cobertura7 && !vencimientos) return null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 14, marginTop: 18 }}>
      {guardiasPorSector && (
        <Tarjeta
          titulo="Horas de guardia por sector"
          subtitulo="Este mes · activas y pasivas"
          tabla={
            <table style={TABLA}>
              <thead><tr><th style={TD}>Sector</th><th style={TD}>Activas</th><th style={TD}>Pasivas</th></tr></thead>
              <tbody>{guardiasPorSector.map((g) => <tr key={g.sector}><td style={TD}>{g.sector}</td><td style={TD}>{g.activas} h</td><td style={TD}>{g.pasivas} h</td></tr>)}</tbody>
            </table>
          }
        >
          {guardiasPorSector.length === 0 ? (
            <p className="page-subtitle">Todavía no hay guardias cargadas este mes.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={guardiasPorSector} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
                <XAxis dataKey="sector" tick={TICK} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} interval={0} tickFormatter={(s: string) => (s.length > 12 ? s.slice(0, 11) + "…" : s)} />
                <YAxis tick={TICK} tickLine={false} axisLine={false} unit=" h" />
                <Tooltip content={<TooltipCaja sufijo=" h" />} cursor={{ fill: "hsl(var(--muted) / .5)" }} />
                <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, color: "hsl(var(--foreground))" }} />
                {/* Separación de 2 px entre segmentos apilados (stroke del color de la tarjeta). */}
                <Bar dataKey="activas" name="Activas" stackId="h" fill={colores.s1} stroke="hsl(var(--card))" strokeWidth={2} radius={[0, 0, 0, 0]} />
                <Bar dataKey="pasivas" name="Pasivas" stackId="h" fill={colores.s2} stroke="hsl(var(--card))" strokeWidth={2} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Tarjeta>
      )}

      {cobertura7 && (
        <Tarjeta
          titulo="Cobertura de los próximos 7 días"
          subtitulo="% del horario requerido que ya tiene guardia"
          tabla={
            <table style={TABLA}>
              <thead><tr><th style={TD}>Día</th><th style={TD}>Cobertura</th></tr></thead>
              <tbody>{cobertura7.map((c) => <tr key={c.fecha}><td style={TD}>{c.etiqueta}</td><td style={TD}>{c.porcentaje == null ? "Sin planificar" : `${c.porcentaje} % · ${estadoCobertura(c.porcentaje).texto}`}</td></tr>)}</tbody>
            </table>
          }
        >
          {cobertura7.every((c) => c.porcentaje == null) ? (
            <p className="page-subtitle">Configurá el horario requerido de cada sector en Guardias → Configuración y cargá las guardias de la semana.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={cobertura7.map((c) => ({ ...c, valor: c.porcentaje ?? 0 }))} margin={{ top: 22, right: 8, left: -12, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
                <XAxis dataKey="etiqueta" tick={TICK} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} />
                <YAxis domain={[0, 100]} tick={TICK} tickLine={false} axisLine={false} unit=" %" />
                <Tooltip cursor={{ fill: "hsl(var(--muted) / .5)" }} content={({ active, payload, label }) => {
                  const p = payload?.[0]?.payload as { porcentaje: number | null } | undefined;
                  if (!active || !p) return null;
                  const e = p.porcentaje == null ? null : estadoCobertura(p.porcentaje);
                  return <TooltipCaja active label={String(label)} payload={[{ name: e ? e.texto : "Sin planificar", value: p.porcentaje ?? 0, color: e?.color ?? "hsl(var(--muted-foreground))" }]} sufijo=" %" />;
                }} />
                <Bar dataKey="valor" name="Cobertura" radius={[4, 4, 0, 0]}>
                  {cobertura7.map((c) => <Cell key={c.fecha} fill={c.porcentaje == null ? "hsl(var(--muted))" : estadoCobertura(c.porcentaje).color} />)}
                  {/* Etiqueta directa: el estado no depende solo del color. */}
                  <LabelList dataKey="porcentaje" position="top" style={{ fontSize: 11, fontWeight: 700, fill: "hsl(var(--foreground))" }} formatter={(v: number | null) => (v == null ? "—" : `${v}%`)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Tarjeta>
      )}

      {vencimientos && (
        <Tarjeta
          titulo="Vencimientos pendientes"
          subtitulo="Próximas 6 semanas · los vencidos se suman a esta semana"
          tabla={
            <table style={TABLA}>
              <thead><tr><th style={TD}>Semana</th><th style={TD}>Pendientes</th><th style={TD}>Vencidos</th></tr></thead>
              <tbody>{vencimientos.map((v) => <tr key={v.desde}><td style={TD}>{v.semana}</td><td style={TD}>{v.pendientes}</td><td style={TD}>{v.vencidos}</td></tr>)}</tbody>
            </table>
          }
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={vencimientos} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
              <XAxis dataKey="semana" tick={TICK} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} />
              <YAxis allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} />
              <Tooltip content={<TooltipCaja />} cursor={{ fill: "hsl(var(--muted) / .5)" }} />
              <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, color: "hsl(var(--foreground))" }} />
              <Bar dataKey="vencidos" name="Vencidos" stackId="v" fill={ESTADO.critico} stroke="hsl(var(--card))" strokeWidth={2} />
              <Bar dataKey="pendientes" name="Pendientes" stackId="v" fill={colores.s1} stroke="hsl(var(--card))" strokeWidth={2} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Tarjeta>
      )}
    </div>
  );
}
