import { useMemo, useState } from "react";
import { FileSpreadsheet, Search } from "lucide-react";
import { S, SegControl, Vacio } from "../administracion/ui";
import { ACCION_EVENTO, fechaHora, type Evento, type Solicitud } from "./api";
import { EstadoPill, hoyLocal, type Puede } from "./compartido";

// Solapa «Historial»: todos los movimientos de todas las solicitudes (quién hizo qué y cuándo), con filtros.

type Tipo = "" | "medico" | "direccion" | "central" | "notas";
const TIPOS: { value: Tipo; label: string; acciones: string[] }[] = [
  { value: "", label: "Todo", acciones: [] },
  { value: "medico", label: "Médicos", acciones: ["creada", "anulada"] },
  { value: "direccion", label: "Dirección Médica", acciones: ["en_analisis", "aceptada", "rechazada", "reabierta", "constancia", "constancia_quitada", "central", "central_quitada"] },
  { value: "central", label: "Central de Turnos", acciones: ["agenda_cancelada", "agenda_restituida", "devuelta"] },
  { value: "notas", label: "Notas", acciones: ["nota"] },
];

type Mov = Evento & { s: Solicitud };
const POR_PAGINA = 150;

export function Historial({ filas, puede, onAbrir }: { filas: Solicitud[]; puede: Puede; onAbrir: (id: number) => void }) {
  const [tipo, setTipo] = useState<Tipo>("");
  const [q, setQ] = useState("");
  const [quien, setQuien] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [ver, setVer] = useState(POR_PAGINA);

  const movs = useMemo(() => filas.flatMap((s) => s.eventos.map((e) => ({ ...e, s }))).sort((a, b) => b.at.localeCompare(a.at)), [filas]);
  const personas = useMemo(() => [...new Set(movs.filter((m) => m.accion !== "creada" && m.accion !== "anulada").map((m) => m.quien))].sort((a, b) => a.localeCompare(b, "es")), [movs]);

  const lista = useMemo(() => {
    const acc = TIPOS.find((t) => t.value === tipo)?.acciones ?? [];
    const t = q.trim().toLowerCase();
    return movs.filter((m) => {
      const dia = new Date(m.at).toLocaleDateString("sv-SE");
      return (
        (!acc.length || acc.includes(m.accion)) &&
        (!quien || m.quien === quien) &&
        (!desde || dia >= desde) &&
        (!hasta || dia <= hasta) &&
        (!t || [m.s.numero, m.s.prestador, m.s.servicio, m.quien, m.detalle ?? "", ACCION_EVENTO[m.accion] ?? ""].some((v) => v.toLowerCase().includes(t)))
      );
    });
  }, [movs, tipo, q, quien, desde, hasta]);

  const exportar = async () => {
    const XLSX = await import("xlsx");
    const filasX = lista.map((m: Mov) => ({
      Fecha: fechaHora(m.at),
      "N° trámite": m.s.numero,
      Prestador: m.s.prestador,
      Servicio: m.s.servicio,
      Quién: m.quien,
      Movimiento: ACCION_EVENTO[m.accion] ?? m.accion,
      Detalle: m.detalle ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(filasX);
    ws["!cols"] = [{ wch: 17 }, { wch: 11 }, { wch: 28 }, { wch: 20 }, { wch: 24 }, { wch: 44 }, { wch: 50 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Historial");
    XLSX.writeFile(wb, `cancelaciones-historial-${hoyLocal()}.xlsx`, { compression: true });
  };

  const limpiar = () => {
    setTipo("");
    setQ("");
    setQuien("");
    setDesde("");
    setHasta("");
  };

  return (
    <section className="card" style={{ ...S.card, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <SegControl value={tipo} onChange={(v) => { setTipo(v); setVer(POR_PAGINA); }} label="Tipo de movimiento" opciones={TIPOS.map((t) => ({ value: t.value, label: t.label }))} />
        {puede.exportar && (
          <button type="button" className="btn btn-quiet" onClick={() => void exportar()} disabled={!lista.length}>
            <FileSpreadsheet size={15} /> Exportar ({lista.length})
          </button>
        )}
      </div>
      <div className="can-filtros">
        <div className="can-buscar">
          <Search size={15} aria-hidden="true" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setVer(POR_PAGINA); }} placeholder="Buscar médico, trámite, servicio o detalle" aria-label="Buscar" />
        </div>
        <label>
          <span style={S.label}>Persona del sanatorio</span>
          <select value={quien} onChange={(e) => setQuien(e.target.value)}>
            <option value="">Todas</option>
            {personas.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>
          <span style={S.label}>Fecha desde</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label>
          <span style={S.label}>hasta</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        {(tipo || q || quien || desde || hasta) && <button type="button" className="btn btn-quiet" onClick={limpiar}>Limpiar filtros</button>}
      </div>

      {!lista.length ? (
        <Vacio titulo={movs.length ? "No hay movimientos con estos filtros" : "Todavía no hay movimientos"} />
      ) : (
        <>
          <div style={{ overflowX: "auto", border: "1px solid hsl(var(--border))", borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={S.th}>Fecha</th>
                  <th style={S.th}>Solicitud</th>
                  <th style={S.th}>Quién</th>
                  <th style={S.th}>Movimiento</th>
                </tr>
              </thead>
              <tbody>
                {lista.slice(0, ver).map((m, i) => (
                  <tr key={`${m.s.id}-${m.at}-${i}`} className="can-fila" onClick={() => onAbrir(m.s.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onAbrir(m.s.id)} style={{ cursor: "pointer" }}>
                    <td style={{ ...S.td, whiteSpace: "nowrap" }}>{fechaHora(m.at)}</td>
                    <td style={S.td}>
                      <div><span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700 }}>{m.s.numero}</span> · {m.s.prestador}</div>
                      <div style={{ ...S.small, display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>{m.s.servicio} <EstadoPill estado={m.s.estado} /></div>
                    </td>
                    <td style={S.td}>{m.quien}</td>
                    <td style={S.td}>
                      <div>{ACCION_EVENTO[m.accion] ?? m.accion}</div>
                      {m.detalle && <div style={{ ...S.small, whiteSpace: "pre-wrap", marginTop: 2 }}>{m.detalle}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lista.length > ver && (
            <button type="button" className="btn btn-quiet" style={{ alignSelf: "center" }} onClick={() => setVer((v) => v + POR_PAGINA)}>
              Ver más ({lista.length - ver} restantes)
            </button>
          )}
        </>
      )}
    </section>
  );
}
