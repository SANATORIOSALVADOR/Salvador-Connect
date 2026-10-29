import { useMemo, useState } from "react";
import { CalendarCheck2, CalendarX2, FileSpreadsheet, Phone, RotateCcw, Trash2, Undo2, UserRound } from "lucide-react";
import { avisar } from "@/components/feedback";
import { Kpi, S, SegControl, Vacio } from "../administracion/ui";
import { api, fechaAr, fechaHora, fechaLarga, resumenDias, type Solicitud } from "./api";
import { eliminarSolicitud } from "./Decision";
import { BarraFiltros, FILTROS_VACIOS, diasHasta, hayFiltros, hoyLocal, pasaFiltros, serviciosDe, UrgenciaPill, type Filtros, type Puede } from "./compartido";

// Solapa «Central de Turnos»: las solicitudes que Dirección Médica aceptó llegan acá para que el personal de turnos
// cancele la agenda en el sistema de agendas y la marque como «agenda cancelada».

export type VistaCentral = "por_cancelar" | "canceladas" | "todas";

export function Central({ filas, puede, vista, setVista, onAbrir, onCambio }: { filas: Solicitud[]; puede: Puede; vista: VistaCentral; setVista: (v: VistaCentral) => void; onAbrir: (id: number) => void; onCambio: () => void }) {
  const [f, setF] = useState<Filtros>(FILTROS_VACIOS);
  const [urgentes, setUrgentes] = useState(false);

  const enCentral = useMemo(() => filas.filter((s) => s.estado === "aceptada" || s.estado === "agenda_cancelada"), [filas]);
  const porCancelar = enCentral.filter((s) => s.estado === "aceptada");
  const canceladas = enCentral.filter((s) => s.estado === "agenda_cancelada");
  const nUrgentes = porCancelar.filter((s) => diasHasta(s.fechaDesde) <= 3).length;
  const mes = hoyLocal().slice(0, 7);
  const nMes = canceladas.filter((s) => (s.agendaCanceladaAt ?? "").slice(0, 7) === mes).length;

  const lista = useMemo(() => {
    const base = vista === "por_cancelar" ? porCancelar : vista === "canceladas" ? canceladas : enCentral;
    const out = base.filter((s) => pasaFiltros(s, f) && (!urgentes || (s.estado === "aceptada" && diasHasta(s.fechaDesde) <= 3)));
    // Por cancelar: primero la que empieza antes. Canceladas: la última cancelada arriba.
    return vista === "canceladas"
      ? out.sort((a, b) => (b.agendaCanceladaAt ?? "").localeCompare(a.agendaCanceladaAt ?? ""))
      : out.sort((a, b) => Number(b.estado === "aceptada") - Number(a.estado === "aceptada") || a.fechaDesde.localeCompare(b.fechaDesde));
  }, [enCentral, vista, f, urgentes]);

  const exportar = async () => {
    const XLSX = await import("xlsx");
    const filasX = lista.flatMap((s) =>
      s.dias.map((d) => ({
        "N° trámite": s.numero,
        Estado: s.estado === "agenda_cancelada" ? "Agenda cancelada" : "Por cancelar",
        Prestador: s.prestador,
        Matrícula: s.matricula,
        Servicio: s.servicio,
        Teléfono: s.telefono,
        "Fecha a cancelar": fechaAr(d.fecha),
        Desde: d.desde,
        Hasta: d.hasta,
        Motivo: s.motivoLabel,
        "Pacientes agendados": s.pacientesAgendados ? "Sí" : "No",
        "Colega que atiende": s.hayColega ? s.colega : "No",
        "Fecha de reprogramación": fechaAr(s.fechaReprogramacion),
        "Aceptada por": s.resueltoPor,
        "Aceptada el": fechaHora(s.resueltoAt),
        "Agenda cancelada por": s.agendaCanceladaPor,
        "Agenda cancelada el": fechaHora(s.agendaCanceladaAt),
        Observación: s.centralNota,
      })),
    );
    const ws = XLSX.utils.json_to_sheet(filasX);
    ws["!cols"] = Object.keys(filasX[0] ?? { a: 1 }).map((k) => ({ wch: Math.max(12, Math.min(40, k.length + 4)) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Central de Turnos");
    XLSX.writeFile(wb, `central-turnos-${hoyLocal()}.xlsx`, { compression: true });
  };

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <Kpi label="Por cancelar" valor={porCancelar.length} nota="Aceptadas por Dirección Médica" tono={porCancelar.length ? "alerta" : "ok"} onClick={() => { setVista("por_cancelar"); setUrgentes(false); }} />
        <Kpi label="Urgentes" valor={nUrgentes} nota="Empiezan en 3 días o menos" tono={nUrgentes ? "alerta" : undefined} onClick={() => { setVista("por_cancelar"); setUrgentes(true); }} />
        <Kpi label="Canceladas este mes" valor={nMes} nota={`${canceladas.length} en total`} onClick={() => { setVista("canceladas"); setUrgentes(false); }} />
      </div>

      <section className="card" style={{ ...S.card, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <SegControl
            value={vista}
            onChange={(v) => { setVista(v); if (v !== "por_cancelar") setUrgentes(false); }}
            label="Vista"
            opciones={[
              { value: "por_cancelar", label: `Por cancelar ${porCancelar.length}` },
              { value: "canceladas", label: `Agendas canceladas ${canceladas.length}` },
              { value: "todas", label: "Todas" },
            ]}
          />
          {puede.exportar && (
            <button type="button" className="btn btn-quiet" onClick={() => void exportar()} disabled={!lista.length}>
              <FileSpreadsheet size={15} /> Exportar ({lista.length})
            </button>
          )}
        </div>
        <BarraFiltros
          f={f}
          set={setF}
          servicios={serviciosDe(enCentral)}
          extra={
            <>
              {vista === "por_cancelar" && (
                <label className="can-check">
                  <input type="checkbox" checked={urgentes} onChange={(e) => setUrgentes(e.target.checked)} /> Solo urgentes
                </label>
              )}
              {(hayFiltros(f) || urgentes) && <button type="button" className="btn btn-quiet" onClick={() => { setF(FILTROS_VACIOS); setUrgentes(false); }}>Limpiar filtros</button>}
            </>
          }
        />

        {!lista.length ? (
          <Vacio
            titulo={vista === "por_cancelar" && !hayFiltros(f) && !urgentes ? "No hay agendas para cancelar" : "No hay solicitudes con estos filtros"}
            texto={vista === "por_cancelar" && !hayFiltros(f) && !urgentes ? "Cuando Dirección Médica acepte una solicitud, aparece acá con los datos para cancelar la agenda." : undefined}
          />
        ) : vista === "canceladas" ? (
          <TablaCanceladas filas={lista} onAbrir={onAbrir} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {lista.map((s) => <Tarjeta key={s.id} s={s} puede={puede} onAbrir={onAbrir} onCambio={onCambio} />)}
          </div>
        )}
      </section>
    </>
  );
}

/** Lo que necesita Central para cancelar la agenda, sin abrir el detalle. */
function Tarjeta({ s, puede, onAbrir, onCambio }: { s: Solicitud; puede: Puede; onAbrir: (id: number) => void; onCambio: () => void }) {
  const [marcando, setMarcando] = useState<"cancelar" | "devolver" | null>(null);
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const cancelada = s.estado === "agenda_cancelada";

  const marcar = async () => {
    setOcupado(true);
    try {
      if (marcando === "devolver") {
        await api(`/api/cancelaciones/${s.id}/devolver`, { method: "POST", body: { motivo: nota } });
        avisar(`${s.numero} devuelta a Dirección Médica.`);
      } else {
        await api(`/api/cancelaciones/${s.id}/agenda-cancelada`, { method: "POST", body: { nota } });
        avisar(`Agenda de ${s.prestador} marcada como cancelada.`);
      }
      setMarcando(null);
      setNota("");
      onCambio();
    } catch (err) {
      avisar((err as Error).message, "error");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <article className={`can-tarjeta${cancelada ? " cancelada" : ""}`}>
      <header className="can-tarjeta-cab">
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <strong style={{ fontSize: 16 }}>{s.prestador}</strong>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, fontWeight: 700, ...S.muted }}>{s.numero}</span>
          </div>
          <div style={{ ...S.small, display: "flex", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
            <span>{s.servicio}</span>
            <span>Mat. {s.matricula}</span>
            {s.telefono && <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><Phone size={12} /> {s.telefono}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {cancelada ? (
            <span className="can-ok"><CalendarCheck2 size={14} /> Agenda cancelada</span>
          ) : (
            <UrgenciaPill desde={s.fechaDesde} hasta={s.fechaHasta} />
          )}
        </div>
      </header>

      <div className="can-tarjeta-cuerpo">
        <div>
          <div style={S.label}>Agenda a cancelar · {resumenDias(s.dias)}</div>
          <table className="can-dias">
            <tbody>
              {s.dias.map((d, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600, textTransform: "capitalize" }}>{fechaLarga(d.fecha)}</td>
                  <td>{fechaAr(d.fecha)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{d.desde} a {d.hasta}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {s.fechaReprogramacion && <div style={{ fontSize: 13, marginTop: 6 }}><strong>Reprogramar a partir del:</strong> {fechaAr(s.fechaReprogramacion)}</div>}
        </div>
        <dl className="can-datos">
          <dt>Motivo</dt>
          <dd>{s.motivoLabel}{s.motivoDetalle ? ` — ${s.motivoDetalle}` : ""}</dd>
          <dt>Pacientes agendados</dt>
          <dd>{s.pacientesAgendados ? <strong>Sí: hay que avisarles</strong> : "No"}</dd>
          <dt>Colega que atiende</dt>
          <dd>{s.hayColega ? <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><UserRound size={13} /> {s.colega}</span> : "No hay"}</dd>
          <dt>Dirección Médica</dt>
          <dd>
            Aceptada por {s.resueltoPor || "—"} · {fechaHora(s.resueltoAt)}
            {s.respuesta && <div style={{ ...S.small, marginTop: 2 }}>«{s.respuesta}»</div>}
          </dd>
          {cancelada && (
            <>
              <dt>Central de Turnos</dt>
              <dd>
                Cancelada por {s.agendaCanceladaPor} · {fechaHora(s.agendaCanceladaAt)}
                {s.centralNota && <div style={{ ...S.small, marginTop: 2 }}>{s.centralNota}</div>}
              </dd>
            </>
          )}
        </dl>
      </div>

      {marcando && (
        <div className={`can-marcar${marcando === "devolver" ? " devolver" : ""}`}>
          {marcando === "devolver" && <strong>Devolver a Dirección Médica</strong>}
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span className="field-label">{marcando === "devolver" ? "¿Por qué no se puede cancelar? (lo ve Dirección Médica)" : "Observación (opcional)"}</span>
            <textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={1000} autoFocus placeholder={marcando === "devolver" ? "Ej.: El médico no tiene agenda ese día; revisar las fechas." : "Ej.: Se avisó a los 6 pacientes; 4 reprogramados para el 15/12."} />
          </label>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button type="button" className="btn btn-quiet" onClick={() => setMarcando(null)}>Volver</button>
            {marcando === "devolver" ? (
              <button type="button" className="btn btn-danger" disabled={ocupado || nota.trim().length < 3} onClick={() => void marcar()}>
                <Undo2 size={15} /> Devolver
              </button>
            ) : (
              <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => void marcar()}>
                <CalendarCheck2 size={15} /> Confirmar: agenda cancelada
              </button>
            )}
          </div>
        </div>
      )}

      <footer className="can-tarjeta-pie">
        <button type="button" className="btn btn-quiet" onClick={() => onAbrir(s.id)}>Ver todo</button>
        {puede.eliminar && (
          <button type="button" className="btn btn-quiet" style={{ color: "#b91c1c" }} title="Sacarla del sistema (mal cargada o duplicada)" onClick={() => void eliminarSolicitud(s).then((ok) => ok && onCambio())}>
            <Trash2 size={15} /> Eliminar
          </button>
        )}
        <span style={{ flex: 1 }} />
        {!cancelada && puede.central && !marcando && (
          <>
            <button type="button" className="btn btn-quiet" onClick={() => { setNota(""); setMarcando("devolver"); }} title="Si no se puede cancelar (fechas o datos que no cierran)">
              <Undo2 size={15} /> Devolver a Dirección
            </button>
            <button type="button" className="btn btn-primary" onClick={() => { setNota(""); setMarcando("cancelar"); }}>
              <CalendarX2 size={15} /> Marcar agenda cancelada
            </button>
          </>
        )}
        {!cancelada && !puede.central && <span style={S.small}>Solo el personal de Central de Turnos la marca como cancelada.</span>}
      </footer>
    </article>
  );
}

function TablaCanceladas({ filas, onAbrir }: { filas: Solicitud[]; onAbrir: (id: number) => void }) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid hsl(var(--border))", borderRadius: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
        <thead>
          <tr>
            <th style={S.th}>Trámite</th>
            <th style={S.th}>Prestador</th>
            <th style={S.th}>Agenda cancelada</th>
            <th style={S.th}>Motivo</th>
            <th style={S.th}>Cancelada por</th>
            <th style={S.th}>Observación</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((s) => (
            <tr key={s.id} className="can-fila" onClick={() => onAbrir(s.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onAbrir(s.id)} style={{ cursor: "pointer" }}>
              <td style={S.td}><span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700 }}>{s.numero}</span></td>
              <td style={S.td}>
                <div style={{ fontWeight: 600 }}>{s.prestador}</div>
                <div style={S.small}>{s.servicio}</div>
              </td>
              <td style={S.td}>{resumenDias(s.dias)}</td>
              <td style={S.td}>{s.motivoLabel}</td>
              <td style={S.td}>
                <div>{s.agendaCanceladaPor}</div>
                <div style={S.small}>{fechaHora(s.agendaCanceladaAt)}</div>
              </td>
              <td style={{ ...S.td, maxWidth: 260 }}><span style={S.small}>{s.centralNota || "—"}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Bloque «Central de Turnos» dentro del detalle de la solicitud. */
export function SeccionCentral({ s, puede, ocupado, accion }: { s: Solicitud; puede: Puede; ocupado: boolean; accion: (url: string, body: unknown, metodo?: string, ok?: string) => Promise<void> }) {
  const [nota, setNota] = useState("");
  const [deshacer, setDeshacer] = useState<string | null>(null);

  if (s.estado === "agenda_cancelada") {
    return (
      <div className="can-central ok">
        <CalendarCheck2 size={18} style={{ flex: "0 0 auto" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>Agenda cancelada en el sistema de turnos</strong> por {s.agendaCanceladaPor} · {fechaHora(s.agendaCanceladaAt)}
          {s.centralNota && <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{s.centralNota}</div>}
          {puede.central && (deshacer === null ? (
            <button type="button" className="btn btn-quiet" style={{ marginTop: 6, fontSize: 12.5 }} onClick={() => setDeshacer("")}>
              <RotateCcw size={14} /> Deshacer (vuelve a «por cancelar»)
            </button>
          ) : (
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <input value={deshacer} onChange={(e) => setDeshacer(e.target.value)} placeholder="¿Por qué se deshace? Queda en el historial" maxLength={300} style={{ flex: "1 1 220px" }} autoFocus aria-label="Motivo para deshacer" />
              <button type="button" className="btn btn-quiet" onClick={() => setDeshacer(null)}>Volver</button>
              <button type="button" className="btn btn-danger" disabled={ocupado || deshacer.trim().length < 3} onClick={() => void accion("/agenda-restituir", { motivo: deshacer }, "POST", "Volvió a Central de Turnos como «por cancelar».").then(() => setDeshacer(null))}>
                Deshacer
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (s.estado !== "aceptada") {
    return <div style={S.small}>Cuando Dirección Médica la acepte, pasa sola a Central de Turnos para que cancelen la agenda.</div>;
  }
  return (
    <div className="can-central">
      <CalendarX2 size={18} style={{ flex: "0 0 auto" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong>En Central de Turnos: falta cancelar la agenda</strong> <UrgenciaPill desde={s.fechaDesde} hasta={s.fechaHasta} />
        {puede.central ? (
          <>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Observación (opcional): pacientes avisados, reprogramados…" maxLength={1000} style={{ flex: "1 1 240px" }} aria-label="Observación" />
              <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => void accion("/agenda-cancelada", { nota }, "POST", "Agenda marcada como cancelada.").then(() => setNota(""))}>
                <CalendarCheck2 size={15} /> Marcar agenda cancelada
              </button>
            </div>
            {deshacer === null ? (
              <button type="button" className="btn btn-quiet" style={{ marginTop: 6, fontSize: 12.5 }} onClick={() => setDeshacer("")}>
                <Undo2 size={14} /> No se puede cancelar: devolver a Dirección Médica
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <input value={deshacer} onChange={(e) => setDeshacer(e.target.value)} placeholder="¿Por qué? Lo ve Dirección Médica" maxLength={500} style={{ flex: "1 1 220px" }} autoFocus aria-label="Motivo para devolver" />
                <button type="button" className="btn btn-quiet" onClick={() => setDeshacer(null)}>Volver</button>
                <button type="button" className="btn btn-danger" disabled={ocupado || deshacer.trim().length < 3} onClick={() => void accion("/devolver", { motivo: deshacer }, "POST", "Devuelta a Dirección Médica.").then(() => setDeshacer(null))}>
                  Devolver
                </button>
              </div>
            )}
          </>
        ) : (
          <div style={{ ...S.small, marginTop: 4 }}>La marca el personal de Central de Turnos cuando la cancela en el sistema de agendas.</div>
        )}
      </div>
    </div>
  );
}
