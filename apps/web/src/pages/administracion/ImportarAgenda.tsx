import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { avisar } from "@/components/feedback";
import { adm } from "./api";
import { MESES_CORTOS, ORGANISMOS, fechaAR, parsearAgenda, sugerirObligacion, textoParaClave, type Obligacion } from "./logic";
import { Campo, Modal, S } from "./ui";

const ARCA_AGENDA = "https://seti.afip.gob.ar/av/seleccionVencimientos.do";

type Fila = { texto: string; fechas: string[]; sugerida: number | null; elegida: number | null };

/**
 * Pegar la agenda completa del año (ARCA, Rentas, PDF o planilla): el sistema reconoce cada renglón por las
 * palabras clave de las obligaciones, el usuario confirma o corrige, y se guardan todas las fechas juntas.
 */
export default function ImportarAgenda({ anio, obligaciones, onClose, onSaved }: { anio: number; obligaciones: Obligacion[]; onClose: () => void; onSaved: () => void }) {
  const [paso, setPaso] = useState<1 | 2>(1);
  const [texto, setTexto] = useState("");
  const [filas, setFilas] = useState<Fila[]>([]);
  const [otros, setOtros] = useState(0);
  const [norma, setNorma] = useState(`Calendario oficial ${anio}`);
  const [recordar, setRecordar] = useState(true);
  const [saving, setSaving] = useState(false);
  const activas = obligaciones.filter((o) => o.activo);

  function analizar() {
    const r = parsearAgenda(texto, anio);
    setOtros(r.otrosAnios);
    setFilas(r.filas.map((f) => {
      const s = sugerirObligacion(f.texto, activas);
      return { ...f, sugerida: s, elegida: s };
    }));
    setPaso(2);
  }

  // Fechas finales por obligación y mes (si se repite el mes, queda la última) y avisos de choque.
  const resumen = useMemo(() => {
    const porClave = new Map<string, string>();
    const choques = new Set<string>();
    for (const f of filas) {
      if (!f.elegida) continue;
      for (const fecha of f.fechas) {
        const k = `${f.elegida}:${Number(fecha.slice(5, 7))}`;
        if (porClave.has(k) && porClave.get(k) !== fecha) choques.add(k);
        porClave.set(k, fecha);
      }
    }
    return { total: porClave.size, choques };
  }, [filas]);

  const sinAsignar = filas.filter((f) => !f.elegida).length;

  async function guardar() {
    setSaving(true);
    try {
      const body = {
        anio,
        norma,
        filas: filas.flatMap((f) => (f.elegida ? f.fechas.map((fecha) => ({ obligacionId: f.elegida as number, fecha })) : [])),
        claves: recordar ? filas.filter((f) => f.elegida && f.elegida !== f.sugerida).map((f) => ({ obligacionId: f.elegida as number, texto: textoParaClave(f.texto) })) : [],
      };
      const r = await adm.importarAgenda(body);
      avisar(`Se cargaron ${r.cargadas} fechas de ${r.obligaciones} obligaciones.${r.aprendidas ? ` El sistema aprendió ${r.aprendidas} palabra${r.aprendidas === 1 ? "" : "s"} clave nueva${r.aprendidas === 1 ? "" : "s"}.` : ""}`, "ok", 8000);
      onSaved();
    } catch (e) {
      avisar((e as Error).message, "error");
      setSaving(false);
    }
  }

  return (
    <Modal
      titulo={`Pegar agenda completa ${anio}`}
      onClose={onClose}
      ancho={paso === 1 ? 680 : 920}
      pie={
        paso === 1 ? (
          <>
            <button type="button" className="btn btn-quiet" onClick={onClose}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={analizar} disabled={!texto.trim()}>Analizar</button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-quiet" style={{ marginRight: "auto" }} onClick={() => setPaso(1)}>Volver</button>
            <button type="button" className="btn btn-quiet" onClick={onClose}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={guardar} disabled={saving || resumen.total === 0}>{saving ? "Guardando…" : `Guardar ${resumen.total} fecha${resumen.total === 1 ? "" : "s"}`}</button>
          </>
        )
      }
    >
      {paso === 1 ? (
        <div className="adm-prosa" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, lineHeight: 1.6 }}>
            <li>
              Abrí la <a href={ARCA_AGENDA} target="_blank" rel="noreferrer">agenda de vencimientos de ARCA <ExternalLink size={12} style={{ display: "inline", verticalAlign: "-1px" }} /></a>.
            </li>
            <li>Fechas: del <strong>01/01/{anio}</strong> al <strong>31/12/{anio}</strong>. Terminación de CUIT: <strong>6</strong>.</li>
            <li>Impuestos: <em>Impuesto al Valor Agregado</em>, <em>Impuesto a las Ganancias</em> y <em>Regímenes nacionales de la seguridad social</em> (pasalos a «Seleccionados») y tocá <strong>Buscar</strong>.</li>
            <li>Seleccioná toda la tabla de resultados con el mouse, copiala (Ctrl + C) y pegala acá abajo (Ctrl + V).</li>
            <li>Repetí con el calendario de <strong>Rentas Córdoba</strong> (PDF o página) para Ingresos Brutos. Podés pegar todo junto.</li>
          </ol>
          <textarea className="textarea" rows={12} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={`Pegá acá la tabla copiada…\n\nEj.:  22/01/${anio}   IMPUESTO AL VALOR AGREGADO   Declaración jurada   6-7`} aria-label="Agenda pegada" style={{ fontFamily: "var(--app-font-mono)", fontSize: 12.5 }} />
          <p style={{ ...S.small, margin: 0 }}>
            No hace falta que quede prolijo: el sistema busca las fechas de {anio} en cada renglón y reconoce el impuesto por sus palabras clave. En el paso siguiente revisás todo antes de guardar.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ ...S.row, fontSize: 13 }}>
            <span><strong>{filas.length}</strong> renglones con fechas de {anio}</span>
            {sinAsignar > 0 && <span style={{ color: "var(--adm-warn)", fontWeight: 600 }}>· {sinAsignar} sin asignar (no se cargan)</span>}
            {otros > 0 && <span style={S.muted}>· {otros} fecha{otros === 1 ? "" : "s"} de otros años ignorada{otros === 1 ? "" : "s"}</span>}
          </div>
          {filas.length === 0 ? (
            <div className="form-error" style={{ margin: 0 }}>No se encontraron fechas de {anio} en el texto pegado. Revisá el año o volvé a copiar la tabla.</div>
          ) : (
            <div style={{ maxHeight: "52vh", overflow: "auto", border: "1px solid hsl(var(--border))", borderRadius: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                <thead>
                  <tr>
                    <th style={S.th}>Renglón pegado</th>
                    <th style={S.th}>Fechas</th>
                    <th style={S.th}>Se carga en</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, i) => {
                    const choque = f.elegida && f.fechas.some((fe) => resumen.choques.has(`${f.elegida}:${Number(fe.slice(5, 7))}`));
                    return (
                      <tr key={i} style={{ background: !f.elegida ? "hsl(var(--muted) / .5)" : undefined }}>
                        <td style={{ ...S.td, maxWidth: 380 }}>
                          <div style={{ overflowWrap: "anywhere" }}>{f.texto}</div>
                          {f.elegida && f.elegida === f.sugerida && <div style={{ ...S.small, color: "var(--adm-ok)" }}>Reconocido automáticamente</div>}
                          {choque && <div style={{ ...S.small, color: "var(--adm-warn)" }}>Otra fila pone una fecha distinta para el mismo mes: queda la última.</div>}
                        </td>
                        <td style={{ ...S.td, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                          {f.fechas.map((fe) => <div key={fe}>{fechaAR(fe)} <span style={S.small}>{MESES_CORTOS[Number(fe.slice(5, 7)) - 1]}</span></div>)}
                        </td>
                        <td style={S.td}>
                          <select
                            className="select"
                            value={f.elegida ?? ""}
                            onChange={(e) => setFilas((p) => p.map((x, j) => (j === i ? { ...x, elegida: e.target.value ? Number(e.target.value) : null } : x)))}
                            aria-label={`Obligación para «${f.texto}»`}
                            style={{ minWidth: 220 }}
                          >
                            <option value="">— No cargar —</option>
                            {activas.map((o) => <option key={o.id} value={o.id}>{o.nombre} ({ORGANISMOS[o.organismo] ?? o.organismo})</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, alignItems: "end" }}>
            <Campo label="Norma / fuente">
              <input className="input" value={norma} onChange={(e) => setNorma(e.target.value)} maxLength={200} />
            </Campo>
            <label style={{ ...S.row, fontSize: 13.5, paddingBottom: 10 }}>
              <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} /> Recordar mis correcciones para el año que viene
            </label>
          </div>
          <p style={{ ...S.small, margin: 0 }}>
            Las fechas se guardan como <strong>oficiales</strong> y verificadas. Los vencimientos pendientes de esos meses se actualizan solos (salvo los que tengan la fecha cambiada a mano).
          </p>
        </div>
      )}
    </Modal>
  );
}

