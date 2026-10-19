import { useState, type CSSProperties } from "react";
import { Check, ChevronLeft, ChevronRight, ClipboardPaste, ExternalLink, Pencil, Plus, ShieldCheck } from "lucide-react";
import { avisar, confirmar } from "@/components/feedback";
import { adm, type FilaFiscal } from "./api";
import { useAdm, useDatos } from "./contexto";
import { MESES, MESES_CORTOS, ORGANISMOS, fechaAR, fechaCorta, type FechaCal, type Obligacion } from "./logic";
import { Campo, Modal, OrigenPill, Pill, S, SegControl, UrgenciaPill, Vacio } from "./ui";
import ImportarAgenda from "./ImportarAgenda";

const ARCA_AGENDA = "https://seti.afip.gob.ar/av/seleccionVencimientos.do";
const RENTAS_CBA = "https://www.rentascordoba.gob.ar/";
const TERMINACION_CUIT = 6;

type Vista = "mes" | "calendario" | "obligaciones";

export default function Fiscal() {
  const [vista, setVista] = useState<Vista>("mes");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="no-print" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <SegControl
          label="Vista fiscal"
          value={vista}
          onChange={setVista}
          opciones={[
            { value: "mes", label: "Control del mes" },
            { value: "calendario", label: "Calendario oficial" },
            { value: "obligaciones", label: "Obligaciones" },
          ]}
        />
        <div style={{ ...S.row, fontSize: 12.5 }}>
          <span style={S.muted}>Fuentes oficiales:</span>
          <a href={ARCA_AGENDA} target="_blank" rel="noreferrer" className="btn btn-quiet" style={{ fontSize: 12.5, padding: "5px 10px" }}>Agenda ARCA <ExternalLink size={13} /></a>
          <a href={RENTAS_CBA} target="_blank" rel="noreferrer" className="btn btn-quiet" style={{ fontSize: 12.5, padding: "5px 10px" }}>Rentas Córdoba <ExternalLink size={13} /></a>
        </div>
      </div>
      {vista === "mes" && <ControlMes />}
      {vista === "calendario" && <CalendarioOficial />}
      {vista === "obligaciones" && <Obligaciones />}
    </div>
  );
}

// ===== Control del mes =====

function ControlMes() {
  const { hoy, permisos, abrir, cumplir, refrescar } = useAdm();
  const [cur, setCur] = useState(() => ({ anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)) }));
  const { data, error } = useDatos(() => adm.fiscal(cur.anio, cur.mes), [cur.anio, cur.mes]);
  const [verificando, setVerificando] = useState(false);
  const [generando, setGenerando] = useState(false);
  const mover = (d: number) => {
    const idx = cur.anio * 12 + cur.mes - 1 + d;
    setCur({ anio: Math.floor(idx / 12), mes: (idx % 12) + 1 });
  };

  const filas = data?.filas ?? [];
  const sinItem = filas.filter((f) => !f.item && f.obligacion.activo);
  const activos = filas.filter((f) => f.item?.estado !== "cancelado");
  const cumplidas = activos.filter((f) => f.item?.estado === "cumplido").length;
  const sinVerificar = filas.filter((f) => !f.verificado && f.obligacion.activo).length;
  const pct = activos.length ? Math.round((cumplidas / activos.length) * 100) : 0;

  async function verificar() {
    const ok = await confirmar({
      titulo: `¿Las fechas de ${MESES[cur.mes - 1].toLowerCase()} coinciden con el calendario oficial?`,
      mensaje: `Abrí la agenda de ARCA (terminación de CUIT ${TERMINACION_CUIT}) y el calendario de Rentas Córdoba, y compará. Si alguna fecha es distinta, corregila primero con el lápiz. Al confirmar, todas las fechas del mes quedan como oficiales y verificadas.`,
      accion: "Sí, están verificadas",
    });
    if (!ok) return;
    setVerificando(true);
    try {
      await adm.verificarMes(cur.anio, cur.mes);
      avisar("Fechas del mes verificadas.");
      refrescar();
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setVerificando(false);
    }
  }

  async function generar() {
    setGenerando(true);
    try {
      const r = await adm.generar(cur.anio, cur.mes);
      avisar(r.creados ? `${r.creados} vencimiento${r.creados === 1 ? "" : "s"} creado${r.creados === 1 ? "" : "s"}.` : "Ya estaban todos creados.");
      refrescar();
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="card" style={{ ...S.card, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button type="button" className="btn btn-quiet btn-icon" onClick={() => mover(-1)} aria-label="Mes anterior"><ChevronLeft size={18} /></button>
          <div style={{ fontWeight: 700, fontSize: 17, minWidth: 150, textAlign: "center" }}>{MESES[cur.mes - 1]} {cur.anio}</div>
          <button type="button" className="btn btn-quiet btn-icon" onClick={() => mover(1)} aria-label="Mes siguiente"><ChevronRight size={18} /></button>
        </div>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={{ ...S.row, justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
            <span><strong>{cumplidas}</strong> de {activos.length} cumplidas</span>
            <span style={{ color: sinVerificar ? "var(--adm-warn)" : "var(--adm-ok)", fontWeight: 600 }}>{sinVerificar ? `${sinVerificar} fecha${sinVerificar === 1 ? "" : "s"} sin verificar` : "Fechas verificadas ✓"}</span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: "hsl(var(--muted))", overflow: "hidden" }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Cumplimiento del mes">
            <div style={{ width: `${pct}%`, height: "100%", background: "#0ca30c" }} />
          </div>
        </div>
        {permisos.verificar && (
          <div style={{ ...S.row }} className="no-print">
            {sinItem.length > 0 && <button type="button" className="btn btn-quiet" onClick={generar} disabled={generando}>{generando ? "Creando…" : `Crear ${sinItem.length} vencimiento${sinItem.length === 1 ? "" : "s"}`}</button>}
            {sinVerificar > 0 && <button type="button" className="btn btn-primary" onClick={verificar} disabled={verificando}><ShieldCheck size={16} /> {verificando ? "Guardando…" : "Verificar fechas del mes"}</button>}
          </div>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}
      {data && !data.feriadosCargados && (
        <div style={{ fontSize: 13, padding: "8px 12px", borderRadius: 10, background: "#fdf6e3", color: "#6b4204", border: "1px solid #efd28f" }}>
          No hay feriados cargados para {cur.anio}: las fechas estimadas usan los feriados calculados por ley (sin puentes). Cargalos en Ajustes.
        </div>
      )}

      <div className="card" style={{ ...S.card, padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead>
            <tr>
              <th style={S.th}>Obligación</th>
              <th style={S.th}>Vence</th>
              <th style={S.th}>Fecha</th>
              <th style={S.th}>Estado</th>
              <th style={S.th}>Comprobante</th>
              <th style={{ ...S.th, textAlign: "right" }}><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr><td colSpan={6} style={S.td}><Vacio titulo="No hay obligaciones para este mes" texto="Cargalas en la vista Obligaciones." /></td></tr>
            )}
            {filas.map((f) => <FilaMes key={f.obligacion.id} f={f} hoy={hoy} puedeEditar={permisos.cumplir} onOpen={abrir} onCumplir={cumplir} />)}
            {(data?.sueltos ?? []).map((it) => (
              <tr key={`s${it.id}`}>
                <td style={S.td}><button type="button" onClick={() => abrir(it.id)} style={linkBtn}>{it.titulo}</button><div style={S.small}>Cargado a mano</div></td>
                <td style={S.td}>{fechaCorta(it.fecha)}</td>
                <td style={S.td}><Pill style={{ border: "1px solid hsl(var(--border))" }}>Manual</Pill></td>
                <td style={S.td}><UrgenciaPill item={it} hoy={hoy} /></td>
                <td style={S.td}>{it.comprobante}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{permisos.cumplir && it.estado === "pendiente" && <button type="button" className="btn btn-quiet" style={{ fontSize: 12.5 }} onClick={() => cumplir(it)}>Registrar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ ...S.small, margin: 0 }}>
        <strong>Oficial</strong>: tomada del calendario publicado. <strong>≈ Estimada</strong>: calculada con el día habitual; puede no coincidir. <strong>Prórroga</strong>: corrida por resolución. Los vencimientos del mes en curso y del siguiente se crean solos.
      </p>
    </div>
  );
}

const linkBtn: CSSProperties = { background: "none", border: "none", padding: 0, font: "inherit", fontWeight: 600, color: "inherit", cursor: "pointer", textAlign: "left" };

function FilaMes({ f, hoy, puedeEditar, onOpen, onCumplir }: { f: FilaFiscal; hoy: string; puedeEditar: boolean; onOpen: (id: number) => void; onCumplir: (it: NonNullable<FilaFiscal["item"]>) => void }) {
  const it = f.item;
  const o = f.obligacion;
  const pres = o.presentacion;
  const pago = o.pago;
  return (
    <tr style={{ opacity: o.activo ? 1 : 0.6 }}>
      <td style={S.td}>
        {it ? <button type="button" onClick={() => onOpen(it.id)} style={linkBtn}>{o.nombre}</button> : <strong style={{ fontWeight: 600 }}>{o.nombre}</strong>}
        <div style={S.small}>{ORGANISMOS[o.organismo] ?? o.organismo}{o.referencia ? ` · ${o.referencia}` : ""}{!o.activo ? " · inactiva" : ""}</div>
      </td>
      <td style={{ ...S.td, whiteSpace: "nowrap", fontWeight: 600 }}>{fechaCorta(it?.fecha ?? f.fecha)}{it && it.fecha !== f.fecha && <div style={S.small}>calendario: {fechaAR(f.fecha)}</div>}</td>
      <td style={S.td}>
        <div style={{ ...S.row, gap: 4 }}>
          {it?.fechaOrigen === "manual" ? <Pill style={{ border: "1px solid hsl(var(--border))" }} title="Cambiada a mano en el vencimiento">Manual</Pill> : <OrigenPill origen={f.origen} />}
          {f.verificado && <span title="Verificada con el calendario oficial" style={{ color: "var(--adm-ok)", display: "inline-flex" }}><Check size={15} aria-label="Verificada" /></span>}
        </div>
        {f.norma && <div style={S.small}>{f.norma}</div>}
      </td>
      <td style={S.td}>
        {!it ? (
          <span style={S.small}>Sin crear</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
            <UrgenciaPill item={it} hoy={hoy} />
            {it.estado === "pendiente" && pres && pago && (it.presentado || it.pagado) && (
              <span style={{ fontSize: 12 }}>{it.presentado ? "✓ Presentada" : "✗ Sin presentar"} · {it.pagado ? "✓ Pagada" : "✗ Sin pagar"}</span>
            )}
          </div>
        )}
      </td>
      <td style={{ ...S.td, fontSize: 12.5 }}>{it?.comprobante}{it?.montoPagado ? <div style={S.small}>$ {it.montoPagado}</div> : null}</td>
      <td style={{ ...S.td, textAlign: "right", whiteSpace: "nowrap" }}>
        {puedeEditar && it?.estado === "pendiente" && (
          <button type="button" className="btn btn-quiet" style={{ fontSize: 12.5 }} onClick={() => onCumplir(it)}>Registrar</button>
        )}
      </td>
    </tr>
  );
}

// ===== Calendario oficial (obligación × mes) =====

function CalendarioOficial() {
  const { hoy, permisos, refrescar } = useAdm();
  const [anio, setAnio] = useState(Number(hoy.slice(0, 4)));
  const { data, error } = useDatos(() => adm.calendario(anio), [anio]);
  const [editar, setEditar] = useState<{ o: Obligacion; mes: number; c: FechaCal } | null>(null);
  const [pegar, setPegar] = useState<Obligacion | null>(null);
  const [importar, setImportar] = useState(false);
  const obligs = (data?.obligaciones ?? []).filter((o) => o.activo);
  const cargadas = obligs.reduce((n, o) => n + Object.values(data?.celdas[o.id] ?? {}).filter((c) => c.origen !== "estimada").length, 0);
  const totalCeldas = obligs.reduce((n, o) => n + Object.keys(data?.celdas[o.id] ?? {}).length, 0);

  const celdaStyle = (c: FechaCal): CSSProperties =>
    c.origen === "estimada"
      ? { border: "1px dashed #d9b25c", color: "#8a5a00", background: "transparent" }
      : c.origen === "prorroga"
        ? { border: "1px solid #cbbcf0", background: "#ede7fb", color: "#4c2a99" }
        : { border: "1px solid #b5cdee", background: "#e2edfb", color: "#1d4f91" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="card" style={{ ...S.card, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button type="button" className="btn btn-quiet btn-icon" onClick={() => setAnio(anio - 1)} aria-label="Año anterior"><ChevronLeft size={18} /></button>
          <div style={{ fontWeight: 700, fontSize: 17, minWidth: 70, textAlign: "center" }}>{anio}</div>
          <button type="button" className="btn btn-quiet btn-icon" onClick={() => setAnio(anio + 1)} aria-label="Año siguiente"><ChevronRight size={18} /></button>
        </div>
        {permisos.calendario && (
          <button type="button" className="btn btn-primary" onClick={() => setImportar(true)}>
            <ClipboardPaste size={16} /> Pegar agenda completa
          </button>
        )}
        <p style={{ ...S.small, margin: 0, flex: "1 1 320px" }}>
          <strong style={{ color: cargadas < totalCeldas ? "var(--adm-warn)" : "var(--adm-ok)" }}>{cargadas} de {totalCeldas} fechas oficiales cargadas.</strong>{" "}
          Cuando ARCA y Rentas publiquen el calendario del año, cargá las fechas de la terminación de CUIT {TERMINACION_CUIT}. Podés copiar la fila completa de una obligación desde la agenda o el PDF y pegarla con el botón «pegar» de cada fila. {permisos.calendario ? "Tocá una fecha para corregirla o cargar una prórroga." : "Solo Control total puede cambiar fechas."}
        </p>
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="card" style={{ ...S.card, padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
          <thead>
            <tr>
              <th style={{ ...S.th, position: "sticky", left: 0, zIndex: 2, minWidth: 220 }}>Obligación</th>
              {MESES_CORTOS.map((m) => <th key={m} style={{ ...S.th, textAlign: "center" }}>{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {obligs.map((o) => (
              <tr key={o.id}>
                <td style={{ ...S.td, position: "sticky", left: 0, background: "hsl(var(--card))", zIndex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{o.nombre}</div>
                      <div style={S.small}>{ORGANISMOS[o.organismo] ?? o.organismo}</div>
                    </div>
                    {permisos.calendario && <button type="button" className="btn btn-quiet btn-icon" title="Pegar fechas del año" aria-label={`Pegar fechas de ${o.nombre}`} onClick={() => setPegar(o)}><ClipboardPaste size={15} /></button>}
                  </div>
                </td>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((mes) => {
                  const c = data?.celdas[o.id]?.[mes];
                  if (!c) return <td key={mes} style={{ ...S.td, textAlign: "center", color: "hsl(var(--muted-foreground))" }}>—</td>;
                  const pasado = `${anio}-${String(mes).padStart(2, "0")}` < hoy.slice(0, 7);
                  return (
                    <td key={mes} style={{ ...S.td, textAlign: "center", padding: 4 }}>
                      <button
                        type="button"
                        disabled={!permisos.calendario}
                        onClick={() => setEditar({ o, mes, c })}
                        title={`${c.origen === "estimada" ? "Estimada" : c.origen === "prorroga" ? "Prórroga" : "Oficial"}${c.verificado ? " · verificada" : ""}${c.norma ? ` · ${c.norma}` : ""}`}
                        style={{ ...celdaStyle(c), width: "100%", padding: "5px 2px", borderRadius: 7, fontSize: 12.5, fontWeight: 700, cursor: permisos.calendario ? "pointer" : "default", opacity: pasado ? 0.55 : 1, fontVariantNumeric: "tabular-nums" }}
                      >
                        {c.origen === "estimada" ? "≈" : ""}{c.fecha.slice(8, 10)}/{c.fecha.slice(5, 7)}
                        {c.verificado && c.origen !== "estimada" ? " ✓" : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ ...S.row, fontSize: 12 }}>
        <span style={{ ...celdaStyle({ origen: "oficial" } as FechaCal), padding: "2px 8px", borderRadius: 6 }}>Oficial ✓</span>
        <span style={{ ...celdaStyle({ origen: "prorroga" } as FechaCal), padding: "2px 8px", borderRadius: 6 }}>Prórroga</span>
        <span style={{ ...celdaStyle({ origen: "estimada" } as FechaCal), padding: "2px 8px", borderRadius: 6 }}>≈ Estimada (sin cargar)</span>
      </div>

      {editar && <EditarFecha anio={anio} {...editar} onClose={() => setEditar(null)} onSaved={() => { setEditar(null); refrescar(); }} />}
      {pegar && <PegarFechas anio={anio} o={pegar} onClose={() => setPegar(null)} onSaved={() => { setPegar(null); refrescar(); }} />}
      {importar && data && <ImportarAgenda anio={anio} obligaciones={data.obligaciones} onClose={() => setImportar(false)} onSaved={() => { setImportar(false); refrescar(); }} />}
    </div>
  );
}

function EditarFecha({ anio, o, mes, c, onClose, onSaved }: { anio: number; o: Obligacion; mes: number; c: FechaCal; onClose: () => void; onSaved: () => void }) {
  const [fecha, setFecha] = useState(c.fecha);
  const [origen, setOrigen] = useState<"oficial" | "prorroga">(c.origen === "prorroga" ? "prorroga" : "oficial");
  const [norma, setNorma] = useState(c.norma);
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const fueraDeMes = fecha && Number(fecha.slice(5, 7)) !== mes;

  async function guardar(quitar = false) {
    setSaving(true);
    try {
      await adm.guardarFecha({ obligacionId: o.id, anio, mes, fecha: quitar ? null : fecha, origen, norma, motivo });
      avisar(quitar ? "Vuelve a fecha estimada." : "Fecha guardada. Los vencimientos pendientes se actualizaron.");
      onSaved();
    } catch (e) {
      avisar((e as Error).message, "error");
      setSaving(false);
    }
  }

  return (
    <Modal
      titulo={`${o.nombre} · ${MESES[mes - 1]} ${anio}`}
      onClose={onClose}
      ancho={480}
      pie={
        <>
          {c.origen !== "estimada" && <button type="button" className="btn btn-quiet" style={{ marginRight: "auto" }} onClick={() => guardar(true)} disabled={saving}>Quitar (volver a estimada)</button>}
          <button type="button" className="btn btn-quiet" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={() => guardar()} disabled={saving || !fecha}>Guardar</button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 12 }}>
        <Campo label="Fecha de vencimiento" hint={fueraDeMes ? "Ojo: la fecha cae en otro mes." : undefined}>
          <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Campo>
        <SegControl label="Origen" value={origen} onChange={setOrigen} opciones={[{ value: "oficial", label: "Calendario oficial" }, { value: "prorroga", label: "Prórroga" }]} />
        <Campo label={origen === "prorroga" ? "Resolución que la prorroga" : "Norma / fuente (opcional)"}>
          <input className="input" value={norma} onChange={(e) => setNorma(e.target.value)} placeholder={origen === "prorroga" ? "Ej.: RG ARCA 5800/2026" : "Ej.: Agenda ARCA"} maxLength={200} />
        </Campo>
        <Campo label="Motivo del cambio (queda en el historial)">
          <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} />
        </Campo>
      </div>
    </Modal>
  );
}

function PegarFechas({ anio, o, onClose, onSaved }: { anio: number; o: Obligacion; onClose: () => void; onSaved: () => void }) {
  const [texto, setTexto] = useState("");
  const [norma, setNorma] = useState("");
  const [saving, setSaving] = useState(false);
  const detectadas = (texto.match(/\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{4}/g) ?? []).length;

  async function guardar() {
    setSaving(true);
    try {
      const r = await adm.cargarLote({ obligacionId: o.id, anio, texto, norma });
      avisar(`${r.cargadas} fecha${r.cargadas === 1 ? "" : "s"} cargada${r.cargadas === 1 ? "" : "s"} (${r.meses.map((m) => MESES_CORTOS[m - 1]).join(", ")})${r.ignoradas.length ? `. Ignoradas: ${r.ignoradas.join(", ")}` : ""}.`);
      onSaved();
    } catch (e) {
      avisar((e as Error).message, "error");
      setSaving(false);
    }
  }

  return (
    <Modal
      titulo={`Pegar fechas ${anio} · ${o.nombre}`}
      onClose={onClose}
      ancho={560}
      pie={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={guardar} disabled={saving || !detectadas}>Cargar {detectadas || ""} fecha{detectadas === 1 ? "" : "s"}</button>
        </>
      }
    >
      <p style={{ ...S.small, marginTop: 0 }}>
        Pegá el texto copiado del calendario (agenda de ARCA, PDF de Rentas, una planilla). Se toman todas las fechas de {anio} en formato 21/01/{anio} o {anio}-01-21: cada una se guarda en el mes al que pertenece. Si hay dos del mismo mes, queda la última.
      </p>
      <div style={{ display: "grid", gap: 12 }}>
        <textarea className="textarea" rows={7} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={`21/01/${anio}  20/02/${anio}  20/03/${anio} …`} aria-label="Fechas" />
        <Campo label="Norma / fuente (opcional)">
          <input className="input" value={norma} onChange={(e) => setNorma(e.target.value)} placeholder={`Ej.: Calendario ARCA ${anio}`} maxLength={200} />
        </Campo>
      </div>
    </Modal>
  );
}

// ===== Catálogo de obligaciones =====

const DESFASES = [
  { v: -1, l: "Mes anterior" },
  { v: 0, l: "Mismo mes" },
  { v: -2, l: "Dos meses antes" },
  { v: -12, l: "Año anterior" },
];

function Obligaciones() {
  const { permisos, refrescar } = useAdm();
  const { data, error } = useDatos(() => adm.obligaciones(), []);
  const [editando, setEditando] = useState<Partial<Obligacion> | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...S.row, justifyContent: "space-between" }}>
        <p style={{ ...S.small, margin: 0, maxWidth: 640 }}>
          Lo que el sanatorio tiene que presentar o pagar periódicamente. Revisalo con el estudio contable: agregá las que falten y desactivá las que no correspondan. El «día habitual» solo se usa para estimar cuando no hay fecha oficial cargada.
        </p>
        {permisos.calendario && <button type="button" className="btn btn-primary" onClick={() => setEditando({ organismo: "arca", periodicidad: "mensual", diaEstimado: 20, desfasePeriodo: -1, presentacion: true, pago: true, alertDays: 7, activo: true })}><Plus size={15} /> Nueva obligación</button>}
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="card" style={{ ...S.card, padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead>
            <tr>
              <th style={S.th}>Obligación</th>
              <th style={S.th}>Organismo</th>
              <th style={S.th}>Cuándo</th>
              <th style={S.th}>Requiere</th>
              <th style={S.th}>Responsable</th>
              <th style={S.th}>Estado</th>
              <th style={S.th}><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((o) => (
              <tr key={o.id} style={{ opacity: o.activo ? 1 : 0.55 }}>
                <td style={S.td}><strong style={{ fontWeight: 600 }}>{o.nombre}</strong>{o.referencia && <div style={S.small}>{o.referencia}</div>}</td>
                <td style={S.td}>{ORGANISMOS[o.organismo] ?? o.organismo}</td>
                <td style={S.td}>
                  {o.periodicidad === "anual" ? `Anual, ${MESES[(o.mesAnual ?? 1) - 1].toLowerCase()}` : "Mensual"}
                  <div style={S.small}>día habitual ≈ {o.diaEstimado} · período: {DESFASES.find((d) => d.v === o.desfasePeriodo)?.l.toLowerCase() ?? `${o.desfasePeriodo} meses`}</div>
                </td>
                <td style={S.td}>{[o.presentacion && "Presentar", o.pago && "Pagar"].filter(Boolean).join(" y ") || "—"}</td>
                <td style={S.td}>{o.responsable || <span style={S.muted}>—</span>}</td>
                <td style={S.td}>{o.activo ? <Pill style={{ background: "#dcf3dc", color: "#155c15" }}>Activa</Pill> : <Pill style={{ border: "1px solid hsl(var(--border))" }}>Inactiva</Pill>}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{permisos.calendario && <button type="button" className="btn btn-quiet btn-icon" aria-label={`Editar ${o.nombre}`} onClick={() => setEditando(o)}><Pencil size={15} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editando && <ObligacionForm o={editando} onClose={() => setEditando(null)} onSaved={() => { setEditando(null); refrescar(); }} />}
    </div>
  );
}

function ObligacionForm({ o, onClose, onSaved }: { o: Partial<Obligacion>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<Obligacion>>(o);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Obligacion>(k: K, v: Obligacion[K]) => setF((p) => ({ ...p, [k]: v }));

  async function guardar() {
    setSaving(true);
    setError(null);
    try {
      if (o.id) await adm.editarObligacion(o.id, f);
      else await adm.crearObligacion(f);
      avisar("Obligación guardada.");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  async function borrar() {
    if (!o.id || !(await confirmar({ titulo: `¿Eliminar «${o.nombre}»?`, mensaje: "Solo se puede si nunca generó vencimientos. Si no, desactivala.", accion: "Eliminar", peligro: true }))) return;
    try {
      await adm.borrarObligacion(o.id);
      avisar("Eliminada.");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Modal
      titulo={o.id ? "Editar obligación" : "Nueva obligación"}
      onClose={onClose}
      ancho={620}
      pie={
        <>
          {o.id && <button type="button" className="btn btn-danger" style={{ marginRight: "auto" }} onClick={borrar}>Eliminar</button>}
          <button type="button" className="btn btn-quiet" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={guardar} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button>
        </>
      }
    >
      {error && <div className="form-error" role="alert">{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <Campo label="Nombre" full><input className="input" value={f.nombre ?? ""} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej.: Ganancias Sociedades — anticipo" maxLength={160} /></Campo>
        <Campo label="Organismo">
          <select className="select" value={f.organismo ?? "arca"} onChange={(e) => set("organismo", e.target.value)}>
            {Object.entries(ORGANISMOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Campo>
        <Campo label="Periodicidad">
          <select className="select" value={f.periodicidad ?? "mensual"} onChange={(e) => set("periodicidad", e.target.value as Obligacion["periodicidad"])}>
            <option value="mensual">Mensual</option>
            <option value="anual">Anual</option>
          </select>
        </Campo>
        {f.periodicidad === "anual" && (
          <Campo label="Mes en que vence">
            <select className="select" value={f.mesAnual ?? 5} onChange={(e) => set("mesAnual", Number(e.target.value))}>
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </Campo>
        )}
        <Campo label="Día habitual (para estimar)" hint="Si cae feriado o fin de semana, pasa al siguiente día hábil.">
          <input className="input" type="number" min={1} max={31} value={f.diaEstimado ?? 20} onChange={(e) => set("diaEstimado", Number(e.target.value))} />
        </Campo>
        <Campo label="Período que se declara">
          <select className="select" value={f.desfasePeriodo ?? -1} onChange={(e) => set("desfasePeriodo", Number(e.target.value))}>
            {DESFASES.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
          </select>
        </Campo>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", gridColumn: "1 / -1" }}>
          <label style={{ ...S.row, fontSize: 13.5 }}><input type="checkbox" checked={f.presentacion ?? true} onChange={(e) => set("presentacion", e.target.checked)} /> Hay que presentar declaración</label>
          <label style={{ ...S.row, fontSize: 13.5 }}><input type="checkbox" checked={f.pago ?? true} onChange={(e) => set("pago", e.target.checked)} /> Hay que pagar</label>
          <label style={{ ...S.row, fontSize: 13.5 }}><input type="checkbox" checked={f.activo ?? true} onChange={(e) => set("activo", e.target.checked)} /> Activa</label>
        </div>
        <Campo label="Responsable"><input className="input" value={f.responsable ?? ""} onChange={(e) => set("responsable", e.target.value)} maxLength={120} /></Campo>
        <Campo label="Avisar días antes"><input className="input" type="number" min={0} max={120} value={f.alertDays ?? 7} onChange={(e) => set("alertDays", Number(e.target.value))} /></Campo>
        <Campo label="Orden en la lista"><input className="input" type="number" min={0} value={f.orden ?? 0} onChange={(e) => set("orden", Number(e.target.value))} /></Campo>
        <Campo label="Palabras clave para reconocerla al pegar la agenda" hint="Separadas por «|». Ej.: valor agregado|iva|f.2002" full>
          <input className="input" value={f.claves ?? ""} onChange={(e) => set("claves", e.target.value)} maxLength={2000} />
        </Campo>
        <Campo label="Referencia (formulario, impuesto)" full><input className="input" value={f.referencia ?? ""} onChange={(e) => set("referencia", e.target.value)} placeholder="Ej.: F.2002 · IVA del mes anterior" maxLength={300} /></Campo>
        <Campo label="Notas" full><textarea className="textarea" rows={2} value={f.notas ?? ""} onChange={(e) => set("notas", e.target.value)} /></Campo>
      </div>
    </Modal>
  );
}
