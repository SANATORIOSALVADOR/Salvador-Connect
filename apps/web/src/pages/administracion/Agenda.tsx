import { useMemo, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, Download, Plus, Printer } from "lucide-react";
import { imprimir } from "@/components/print-header";
import { downloadCsv } from "../guardias/logic";
import { adm } from "./api";
import { useAdm, useDatos } from "./contexto";
import {
  DIAS_SEMANA,
  ESTADOS,
  MESES,
  TIPOS,
  TIPO_META,
  addDays,
  agruparPorFecha,
  coincide,
  fechaAR,
  fechaLarga,
  finDeMes,
  grillaMes,
  urgencia,
  type Item,
  type Tipo,
} from "./logic";
import { ItemFila, S, SegControl, Vacio } from "./ui";

type Vista = "lista" | "calendario";
type Rango = "30" | "mes" | "90" | "todo";

export default function Agenda({ busquedaInicial }: { busquedaInicial: string }) {
  const { hoy, permisos, abrir, cumplir, nuevo, responsables } = useAdm();
  const [vista, setVista] = useState<Vista>("lista");
  const [q, setQ] = useState(busquedaInicial);
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [estado, setEstado] = useState(busquedaInicial ? "todos" : "pendiente");
  const [responsable, setResponsable] = useState("");
  const [rango, setRango] = useState<Rango>(busquedaInicial ? "todo" : "30");
  const [cursor, setCursor] = useState(() => ({ anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)) }));
  const [dia, setDia] = useState<string | null>(hoy);

  // Lista: pendientes incluye todo lo vencido; el resto, por rango. Calendario: el mes visible.
  const consulta = useMemo(() => {
    if (vista === "calendario") {
      const desde = `${cursor.anio}-${String(cursor.mes).padStart(2, "0")}-01`;
      return { desde, hasta: finDeMes(cursor.anio, cursor.mes) };
    }
    const hasta = rango === "todo" ? undefined : rango === "mes" ? finDeMes(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7))) : addDays(hoy, Number(rango));
    const desde = rango === "todo" || estado === "pendiente" || estado === "vencido" ? undefined : rango === "mes" ? `${hoy.slice(0, 7)}-01` : addDays(hoy, -Number(rango));
    return { desde, hasta };
  }, [vista, cursor, rango, hoy, estado]);

  const { data, error, cargando } = useDatos(
    () => adm.items({ ...consulta, estado: vista === "calendario" ? undefined : estado, responsable: responsable || undefined, tipo: tipos.join(",") || undefined }),
    [consulta.desde, consulta.hasta, estado, responsable, tipos.join(","), vista],
  );
  const items = useMemo(() => (data ?? []).filter((it) => coincide(it, q)), [data, q]);

  function exportar() {
    downloadCsv(
      `administracion-${hoy}.csv`,
      [
        ["Fecha", "Tipo", "Título", "Estado", "Responsable", "Monto", "Comprobante", "Notas"],
        ...items.map((it) => [fechaAR(it.fecha), TIPO_META[it.tipo]?.label ?? it.tipo, it.titulo, it.estado, it.responsable, it.monto, it.comprobante, it.descripcion]),
      ],
      "Administración — agenda",
    );
  }

  const toggleTipo = (t: Tipo) => setTipos((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="no-print" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <SegControl label="Vista" value={vista} onChange={setVista} opciones={[{ value: "lista", label: "Lista" }, { value: "calendario", label: "Calendario" }]} />
        <input className="input" style={{ flex: "1 1 200px", maxWidth: 320 }} placeholder="Buscar título, responsable, N° de cheque…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
        {vista === "lista" && (
          <>
            <select className="select" style={{ width: "auto" }} value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado">
              <option value="pendiente">Pendientes</option>
              <option value="vencido">Solo vencidos</option>
              {ESTADOS.filter((e) => e.value !== "pendiente").map((e) => <option key={e.value} value={e.value}>{e.label}s</option>)}
              <option value="todos">Todos</option>
            </select>
            <select className="select" style={{ width: "auto" }} value={rango} onChange={(e) => setRango(e.target.value as Rango)} aria-label="Período">
              <option value="30">Próximos 30 días</option>
              <option value="mes">Este mes</option>
              <option value="90">Próximos 90 días</option>
              <option value="todo">Todas las fechas</option>
            </select>
          </>
        )}
        <select className="select" style={{ width: "auto", maxWidth: 200 }} value={responsable} onChange={(e) => setResponsable(e.target.value)} aria-label="Responsable">
          <option value="">Todos los responsables</option>
          {responsables.map((r) => <option key={r}>{r}</option>)}
        </select>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button type="button" className="btn btn-quiet" onClick={exportar} title="Descargar Excel (CSV)"><Download size={15} /> Excel</button>
          <button type="button" className="btn btn-quiet" onClick={imprimir} title="Imprimir"><Printer size={15} /></button>
        </div>
      </div>
      <div className="no-print" style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="group" aria-label="Filtrar por tipo">
        {TIPOS.map((t) => {
          const on = tipos.includes(t.value);
          return (
            <button
              key={t.value}
              type="button"
              aria-pressed={on}
              onClick={() => toggleTipo(t.value)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${on ? t.color : "hsl(var(--border))"}`, background: on ? "hsl(var(--muted))" : "transparent", color: on ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 2, background: t.color }} aria-hidden="true" />
              {t.plural}
            </button>
          );
        })}
        {tipos.length > 0 && <button type="button" className="btn btn-quiet" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setTipos([])}>Quitar filtro</button>}
      </div>

      {error && <div className="form-error">{error}</div>}

      {vista === "lista" ? (
        <Lista items={items} hoy={hoy} cargando={cargando && !data} puedeEditar={permisos.editar} onOpen={(it) => abrir(it.id)} onCheck={cumplir} onNuevo={permisos.editar ? () => nuevo() : undefined} />
      ) : (
        <Calendario
          items={items}
          hoy={hoy}
          cursor={cursor}
          setCursor={setCursor}
          dia={dia}
          setDia={setDia}
          puedeEditar={permisos.editar}
          onOpen={(it) => abrir(it.id)}
          onCheck={cumplir}
          onNuevo={(f) => nuevo(undefined, f)}
        />
      )}
    </div>
  );
}

function Lista({ items, hoy, cargando, puedeEditar, onOpen, onCheck, onNuevo }: { items: Item[]; hoy: string; cargando: boolean; puedeEditar: boolean; onOpen: (it: Item) => void; onCheck: (it: Item) => void; onNuevo?: () => void }) {
  if (cargando) return <div style={S.muted}>Cargando…</div>;
  if (!items.length) return <Vacio titulo="No hay nada con estos filtros" texto="Probá con otro período o estado." accion={onNuevo && <button type="button" className="btn btn-primary" onClick={onNuevo}><Plus size={15} /> Nuevo</button>} />;
  const grupos = agruparPorFecha(items);
  return (
    <div className="card" style={{ ...S.card, display: "flex", flexDirection: "column", gap: 14 }}>
      {grupos.map(([fecha, lista]) => {
        const venc = lista.some((i) => urgencia(i, hoy) === "vencido");
        return (
          <div key={fecha} style={{ display: "grid", gridTemplateColumns: "minmax(0, 130px) minmax(0, 1fr)", gap: 12 }}>
            <div style={{ paddingTop: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: venc ? "var(--adm-danger)" : fecha === hoy ? "hsl(var(--primary))" : undefined }}>{fecha === hoy ? "Hoy" : fechaAR(fecha)}</div>
              <div style={{ ...S.small, textTransform: "capitalize" }}>{fechaLarga(fecha).split(" ")[0]}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
              {lista.map((it) => <ItemFila key={it.id} item={it} hoy={hoy} onOpen={onOpen} onCheck={onCheck} mostrarFecha={false} puedeEditar={puedeEditar} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Calendario({ items, hoy, cursor, setCursor, dia, setDia, puedeEditar, onOpen, onCheck, onNuevo }: {
  items: Item[];
  hoy: string;
  cursor: { anio: number; mes: number };
  setCursor: (c: { anio: number; mes: number }) => void;
  dia: string | null;
  setDia: (d: string | null) => void;
  puedeEditar: boolean;
  onOpen: (it: Item) => void;
  onCheck: (it: Item) => void;
  onNuevo: (fecha: string) => void;
}) {
  const celdas = grillaMes(cursor.anio, cursor.mes);
  const porDia = useMemo(() => new Map(agruparPorFecha(items)), [items]);
  const mover = (d: number) => {
    const idx = cursor.anio * 12 + cursor.mes - 1 + d;
    setCursor({ anio: Math.floor(idx / 12), mes: (idx % 12) + 1 });
  };
  const delDia = dia ? porDia.get(dia) ?? [] : [];
  const celda: CSSProperties = { minHeight: 92, borderRadius: 10, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", padding: 6, display: "flex", flexDirection: "column", gap: 3, textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer", minWidth: 0, overflow: "hidden" };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
      <div className="card" style={{ ...S.card, flex: "3 1 560px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
          <button type="button" className="btn btn-quiet btn-icon" onClick={() => mover(-1)} aria-label="Mes anterior"><ChevronLeft size={18} /></button>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{MESES[cursor.mes - 1]} {cursor.anio}</div>
          <div style={{ display: "flex", gap: 4 }}>
            <button type="button" className="btn btn-quiet" style={{ fontSize: 12.5 }} onClick={() => { setCursor({ anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)) }); setDia(hoy); }}>Hoy</button>
            <button type="button" className="btn btn-quiet btn-icon" onClick={() => mover(1)} aria-label="Mes siguiente"><ChevronRight size={18} /></button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4, marginBottom: 4 }}>
          {DIAS_SEMANA.map((d) => <div key={d} style={{ ...S.label, textAlign: "center", padding: "2px 0" }}>{d}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>
          {celdas.map((f, i) => {
            if (!f) return <div key={`v${i}`} style={{ ...celda, cursor: "default", background: "hsl(var(--muted) / .35)", borderStyle: "dashed" }} aria-hidden="true" />;
            const lista = porDia.get(f) ?? [];
            const vencido = lista.some((x) => urgencia(x, hoy) === "vencido");
            const sel = f === dia;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setDia(f)}
                aria-label={`${fechaLarga(f)}: ${lista.length} ítem${lista.length === 1 ? "" : "s"}`}
                aria-pressed={sel}
                style={{ ...celda, borderColor: sel ? "hsl(var(--primary))" : f === hoy ? "hsl(var(--primary) / .6)" : undefined, boxShadow: sel ? "0 0 0 2px hsl(var(--primary) / .25)" : undefined }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: f === hoy ? "hsl(var(--primary))" : vencido ? "var(--adm-danger)" : "hsl(var(--muted-foreground))" }}>{Number(f.slice(8))}</span>
                {lista.slice(0, 3).map((it) => (
                  <span key={it.id} style={{ display: "block", fontSize: 11, lineHeight: "15px", padding: "1px 4px", borderRadius: 4, borderLeft: `3px solid ${TIPO_META[it.tipo]?.color}`, background: "hsl(var(--muted))", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: it.estado !== "pendiente" ? "line-through" : undefined, opacity: it.estado !== "pendiente" ? 0.6 : 1 }}>
                    {it.titulo}
                  </span>
                ))}
                {lista.length > 3 && <span style={{ fontSize: 11, fontWeight: 700, color: "hsl(var(--muted-foreground))" }}>+{lista.length - 3} más</span>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="card" style={{ ...S.card, flex: "1 1 280px", minWidth: 0 }}>
        {dia ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, textTransform: "capitalize" }}>{dia === hoy ? "Hoy" : fechaLarga(dia)}</h2>
              {puedeEditar && <button type="button" className="btn btn-quiet" style={{ fontSize: 12.5 }} onClick={() => onNuevo(dia)}><Plus size={14} /> Agregar</button>}
            </div>
            {delDia.length === 0 ? (
              <div style={S.small}>Nada cargado para este día.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {delDia.map((it) => <ItemFila key={it.id} item={it} hoy={hoy} onOpen={onOpen} onCheck={onCheck} mostrarFecha={false} puedeEditar={puedeEditar} />)}
              </div>
            )}
          </>
        ) : (
          <div style={S.small}>Elegí un día para ver el detalle.</div>
        )}
      </div>
    </div>
  );
}
