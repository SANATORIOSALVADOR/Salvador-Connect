import { useState } from "react";
import { AlertTriangle, CheckCircle2, Inbox, Phone, Send, Trash2, Undo2, UserRound, XCircle } from "lucide-react";
import { avisar, confirmar } from "@/components/feedback";
import { S } from "../administracion/ui";
import { ANTICIPACION, MOTIVOS, api, fechaAr, fechaHora, fechaLarga, resumenDias, type Solicitud } from "./api";
import { AnticipacionPill, EstadoPill, UrgenciaPill, type Puede } from "./compartido";

// Lo que hace Dirección Médica con cada solicitud: tomarla, aceptarla (pasa sola a Central de Turnos) o rechazarla.
// Lo usan las tarjetas de la bandeja y el detalle, para que sea el mismo botón en los dos lados.

/** Si Central de Turnos la devolvió (y desde entonces nadie la resolvió), el motivo. */
export function devueltaPorCentral(s: Solicitud): string | null {
  for (let i = s.eventos.length - 1; i >= 0; i--) {
    const e = s.eventos[i];
    if (e.accion === "devuelta") return e.detalle || "Sin motivo";
    if (e.accion === "aceptada" || e.accion === "rechazada" || e.accion === "reabierta") return null;
  }
  return null;
}

/** Borra la solicitud del sistema (mal cargada, duplicada). Pide confirmación. Devuelve true si se borró. */
export async function eliminarSolicitud(s: Solicitud): Promise<boolean> {
  const ok = await confirmar({
    titulo: `¿Eliminar la solicitud ${s.numero} de ${s.prestador}?`,
    mensaje: "Se saca del sistema con todo su historial (por ejemplo, si fue mal cargada o está duplicada). El médico ya no la va a poder consultar. No se puede deshacer.",
    accion: "Eliminar",
    peligro: true,
  });
  if (!ok) return false;
  try {
    await api(`/api/cancelaciones/${s.id}`, { method: "DELETE" });
    avisar(`Solicitud ${s.numero} eliminada del sistema.`);
    return true;
  } catch (err) {
    avisar((err as Error).message, "error");
    return false;
  }
}

/** Botones de Dirección Médica + el formulario corto para aceptar / rechazar. */
export function PanelDecision({ s, puede, onHecho, alineado = "end" }: { s: Solicitud; puede: Puede; onHecho: (s: Solicitud) => void; alineado?: "start" | "end" }) {
  const [decidir, setDecidir] = useState<"aceptada" | "rechazada" | null>(null);
  const [respuesta, setRespuesta] = useState("");
  const [ocupado, setOcupado] = useState(false);
  if (!puede.resolver || (s.estado !== "pendiente" && s.estado !== "en_analisis")) return null;

  const enviar = async (url: string, body: unknown, ok: string) => {
    setOcupado(true);
    try {
      const r = await api<Solicitud>(`/api/cancelaciones/${s.id}${url}`, { method: "POST", body });
      avisar(ok);
      setDecidir(null);
      setRespuesta("");
      onHecho(r);
    } catch (err) {
      avisar((err as Error).message, "error");
    } finally {
      setOcupado(false);
    }
  };

  if (decidir) {
    const acepta = decidir === "aceptada";
    return (
      <div className={`can-decidir ${acepta ? "acepta" : "rechaza"}`}>
        <strong>{acepta ? "Aceptar y enviar a Central de Turnos" : "Rechazar la solicitud"}</strong>
        {acepta && <span style={S.small}>Pasa sola a la solapa Central de Turnos para que cancelen la agenda. El médico ve que fue aceptada.</span>}
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span className="field-label">{acepta ? "Mensaje para el médico y Central (opcional)" : "Motivo del rechazo (lo ve el médico)"}</span>
          <textarea value={respuesta} onChange={(e) => setRespuesta(e.target.value)} rows={2} maxLength={1500} autoFocus placeholder={acepta ? "Ej.: Avisar a los pacientes y ofrecer turno con el Dr. Paz." : "Ej.: No hay quién cubra la agenda en esas fechas."} />
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-quiet" onClick={() => setDecidir(null)}>Volver</button>
          <button
            type="button"
            className={acepta ? "btn btn-primary" : "btn btn-danger"}
            disabled={ocupado || (!acepta && respuesta.trim().length < 3)}
            onClick={() => void enviar("/resolver", { decision: decidir, respuesta }, acepta ? `${s.numero} aceptada: pasó a Central de Turnos.` : `${s.numero} rechazada.`)}
          >
            {acepta ? <><Send size={15} /> Aceptar y enviar</> : <><XCircle size={15} /> Rechazar</>}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: alineado === "end" ? "flex-end" : "flex-start" }}>
      {s.estado === "pendiente" && (
        <button type="button" className="btn btn-quiet" disabled={ocupado} onClick={() => void enviar("/analisis", {}, `${s.numero} quedó en análisis.`)} title="Para que el resto sepa que alguien ya la está viendo">
          <Inbox size={15} /> Tomar para análisis
        </button>
      )}
      <button type="button" className="btn btn-quiet" disabled={ocupado} onClick={() => setDecidir("rechazada")} style={{ color: "#b91c1c" }}>
        <XCircle size={15} /> Rechazar
      </button>
      <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => setDecidir("aceptada")}>
        <CheckCircle2 size={15} /> Aceptar y enviar a Central
      </button>
    </div>
  );
}

/** Tarjeta de la bandeja de Dirección Médica: todo lo necesario para decidir sin abrir el detalle. */
export function TarjetaSolicitud({ s, puede, onAbrir, onCambio }: { s: Solicitud; puede: Puede; onAbrir: (id: number) => void; onCambio: () => void }) {
  const devuelta = devueltaPorCentral(s);
  const motivoMeta = MOTIVOS.find((m) => m.key === s.motivo);
  return (
    <article className={`can-tarjeta${s.excepcional ? " excepcional" : ""} etapa-${s.estado}`}>
      <header className="can-tarjeta-cab">
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <strong style={{ fontSize: 16 }}>{s.prestador}</strong>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, fontWeight: 700, ...S.muted }}>{s.numero}</span>
            <EstadoPill estado={s.estado} />
          </div>
          <div style={{ ...S.small, display: "flex", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
            <span>{s.servicio}</span>
            <span>Mat. {s.matricula}</span>
            {s.telefono && <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><Phone size={12} /> {s.telefono}</span>}
            <span>Recibida {fechaHora(s.createdAt)}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <AnticipacionPill s={s} />
          <UrgenciaPill desde={s.fechaDesde} hasta={s.fechaHasta} />
        </div>
      </header>

      {devuelta && (
        <div className="can-aviso devuelta">
          <Undo2 size={16} style={{ flex: "0 0 auto" }} />
          <div><strong>Central de Turnos la devolvió:</strong> {devuelta}</div>
        </div>
      )}
      {s.excepcional && (
        <div className="can-aviso excepcional">
          <AlertTriangle size={16} style={{ flex: "0 0 auto" }} />
          <div>
            <strong>Excepcional ({s.anticipacionHabiles} de {ANTICIPACION} días hábiles).</strong> {s.justificacion}
          </div>
        </div>
      )}

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
          {s.fechaReprogramacion && <div style={{ fontSize: 13, marginTop: 6 }}><strong>Reprogramación:</strong> {fechaAr(s.fechaReprogramacion)}</div>}
        </div>
        <dl className="can-datos">
          <dt>Motivo</dt>
          <dd>{s.motivoLabel}{s.motivoDetalle ? ` — ${s.motivoDetalle}` : ""}</dd>
          {s.pideConstancia && (
            <>
              <dt>Constancia</dt>
              <dd>{s.constanciaRecibida ? "Recibida" : <span style={{ color: "#8a3b0c" }}>Falta {motivoMeta?.constancia ?? "la constancia"}</span>}</dd>
            </>
          )}
          <dt>Pacientes agendados</dt>
          <dd>{s.pacientesAgendados ? "Sí" : "No"}</dd>
          <dt>Colega que atiende</dt>
          <dd>{s.hayColega ? <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><UserRound size={13} /> {s.colega}</span> : "No hay"}</dd>
        </dl>
      </div>

      <footer className="can-tarjeta-pie">
        <button type="button" className="btn btn-quiet" onClick={() => onAbrir(s.id)}>Ver todo</button>
        {puede.eliminar && (
          <button type="button" className="btn btn-quiet" style={{ color: "#b91c1c" }} title="Sacarla del sistema (mal cargada o duplicada)" onClick={() => void eliminarSolicitud(s).then((ok) => ok && onCambio())}>
            <Trash2 size={15} /> Eliminar
          </button>
        )}
        <div style={{ flex: "1 1 320px" }}>
          {puede.resolver ? <PanelDecision s={s} puede={puede} onHecho={onCambio} /> : <div style={{ ...S.small, textAlign: "right" }}>La acepta o rechaza Dirección Médica.</div>}
        </div>
      </footer>
    </article>
  );
}
