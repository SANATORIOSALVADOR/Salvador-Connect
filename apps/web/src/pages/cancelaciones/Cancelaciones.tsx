import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Check, CheckCircle2, Download, ExternalLink, Eye, EyeOff, FileSpreadsheet, Printer, QrCode, RotateCcw, Trash2, XCircle } from "lucide-react";
import { avisar, confirmar } from "@/components/feedback";
import { useApariencia } from "@/pages/shared/apariencia";
import { Kpi, Modal, S, SegControl, Vacio } from "../administracion/ui";
import { ACCION_EVENTO, ANTICIPACION, ESTADO_META, MOTIVOS, RUTA_PUBLICA, api, fechaAr, fechaHora, fechaLarga, resumenDias, type Estado, type Solicitud } from "./api";
import { AnticipacionPill, BarraFiltros, EstadoPill, FILTROS_VACIOS, hayFiltros, hoyLocal, pasaFiltros, serviciosDe, type Filtros, type Me, type Puede } from "./compartido";
import { Central, SeccionCentral } from "./Central";
import { Historial } from "./Historial";

// Medical → Cancelaciones Médicos. Tres solapas:
//  - Solicitudes: bandeja de Dirección Médica (analizar, aceptar, rechazar) de los pedidos que mandan los médicos por QR.
//  - Central de Turnos: las aceptadas, para que el personal de turnos cancele la agenda y la marque «agenda cancelada».
//  - Historial: todos los movimientos, con filtros.

type Lista = { filas: Solicitud[]; porEstado: Record<Estado, number>; resumen: { excepcionales: number; porCancelar: number; urgentesCentral: number } | null; anticipacionMinima: number };
type FiltroEstado = "abiertas" | Estado | "todas";
type Vista = "solicitudes" | "central" | "historial";

const FILTROS: { value: FiltroEstado; label: string }[] = [
  { value: "abiertas", label: "Sin resolver" },
  { value: "pendiente", label: "Pendientes" },
  { value: "en_analisis", label: "En análisis" },
  { value: "aceptada", label: "En Central" },
  { value: "agenda_cancelada", label: "Agenda cancelada" },
  { value: "rechazada", label: "Rechazadas" },
  { value: "anulada", label: "Anuladas" },
  { value: "todas", label: "Todas" },
];

export { EstadoPill };

export default function CancelacionesPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [lista, setLista] = useState<Lista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inicial = useMemo(() => new URLSearchParams(window.location.search), []);
  const [vista, setVistaState] = useState<Vista | null>((["solicitudes", "central", "historial"] as Vista[]).find((v) => v === inicial.get("vista")) ?? null);
  const [estado, setEstado] = useState<FiltroEstado>((FILTROS.some((f) => f.value === inicial.get("estado")) ? inicial.get("estado") : "abiertas") as FiltroEstado);
  const [f, setF] = useState<Filtros>(FILTROS_VACIOS);
  const [soloExcepcionales, setSoloExcepcionales] = useState(false);
  const [abierta, setAbierta] = useState<number | null>(inicial.get("id") ? Number(inicial.get("id")) : null);
  const [qr, setQr] = useState(false);

  useEffect(() => {
    api<Me>("/api/auth/me").then(setMe).catch(() => setMe(null));
  }, []);

  // Se trae todo una vez (son pocas por mes) y cada solapa filtra en pantalla.
  const cargar = useCallback(async () => {
    try {
      setLista(await api<Lista>("/api/cancelaciones"));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const acc = useMemo(() => (me?.role === "superadmin" ? ["ver", "exportar", "central", "resolver", "eliminar"] : (me?.acciones?.cancelaciones ?? [])), [me]);
  const puede: Puede = { resolver: acc.includes("resolver"), central: acc.includes("central"), eliminar: acc.includes("eliminar"), exportar: acc.includes("exportar") };
  // Quien solo trabaja en Central de Turnos entra directo a su solapa.
  const vistaActual: Vista = vista ?? (me && puede.central && !puede.resolver ? "central" : "solicitudes");
  const setVista = (v: Vista) => {
    setVistaState(v);
    const u = new URL(window.location.href);
    u.searchParams.set("vista", v);
    u.searchParams.delete("estado");
    window.history.replaceState(null, "", u);
  };

  const todas = lista?.filas ?? [];
  const filas = useMemo(
    () =>
      todas.filter(
        (s) =>
          (estado === "todas" || (estado === "abiertas" ? s.estado === "pendiente" || s.estado === "en_analisis" : s.estado === estado)) &&
          (!soloExcepcionales || s.excepcional) &&
          pasaFiltros(s, f),
      ),
    [todas, estado, soloExcepcionales, f],
  );

  const pe = lista?.porEstado;
  const excepAbiertas = lista?.resumen?.excepcionales ?? 0;
  const porCancelar = pe?.aceptada ?? 0;

  const exportar = async () => {
    const XLSX = await import("xlsx");
    const filasX = filas.flatMap((s) =>
      s.dias.map((d) => ({
        "N° trámite": s.numero,
        Recibida: fechaHora(s.createdAt),
        Estado: ESTADO_META[s.estado].label,
        Prestador: s.prestador,
        Matrícula: s.matricula,
        DNI: s.dni,
        Servicio: s.servicio,
        Teléfono: s.telefono,
        "Fecha a cancelar": fechaAr(d.fecha),
        Desde: d.desde,
        Hasta: d.hasta,
        Motivo: s.motivoLabel,
        "Detalle del motivo": s.motivoDetalle,
        "Pacientes agendados": s.pacientesAgendados ? "Sí" : "No",
        "Colega que atiende": s.hayColega ? s.colega : "No",
        "Días hábiles de anticipación": s.anticipacionHabiles,
        Excepcional: s.excepcional ? "Sí" : "No",
        "Motivo de la urgencia": s.justificacion,
        "Fecha de reprogramación": fechaAr(s.fechaReprogramacion),
        Respuesta: s.respuesta,
        "Resuelta por": s.resueltoPor,
        "Resuelta el": fechaHora(s.resueltoAt),
        "Agenda cancelada por": s.agendaCanceladaPor,
        "Agenda cancelada el": fechaHora(s.agendaCanceladaAt),
        "Observación de Central": s.centralNota,
      })),
    );
    const ws = XLSX.utils.json_to_sheet(filasX);
    ws["!cols"] = Object.keys(filasX[0] ?? { a: 1 }).map((k) => ({ wch: Math.max(12, Math.min(40, k.length + 4)) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cancelaciones");
    XLSX.writeFile(wb, `cancelaciones-agenda-${hoyLocal()}.xlsx`, { compression: true });
  };

  const abiertas = (pe?.pendiente ?? 0) + (pe?.en_analisis ?? 0);
  const TABS: [Vista, string][] = [
    ["solicitudes", `Solicitudes${abiertas ? ` · ${abiertas} sin resolver` : ""}`],
    ["central", `Central de Turnos${porCancelar ? ` · ${porCancelar} por cancelar` : ""}`],
    ["historial", "Historial"],
  ];

  return (
    <div className="content-wrap" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">Medical / Cancelaciones Médicos</div>
          <h1 className="page-title">Cancelaciones de agenda</h1>
          <p className="page-subtitle">Pedidos de cancelación de agenda de consultorio que envían los médicos desde el QR: Dirección Médica los resuelve y Central de Turnos cancela la agenda.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} className="no-print">
          <button type="button" className="btn btn-quiet" onClick={() => setQr(true)}>
            <QrCode size={15} /> QR del formulario
          </button>
          {puede.exportar && vistaActual === "solicitudes" && (
            <button type="button" className="btn btn-quiet" onClick={() => void exportar()} disabled={!filas.length}>
              <FileSpreadsheet size={15} /> Exportar ({filas.length})
            </button>
          )}
        </div>
      </header>

      <Circuito />

      <div className="gm-tabs no-print" role="tablist" style={{ alignSelf: "flex-start", flexWrap: "wrap" }}>
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={vistaActual === id} className={`gm-tab${vistaActual === id ? " is-active" : ""}`} onClick={() => setVista(id)}>
            {label}
          </button>
        ))}
      </div>

      {error && <div className="form-error">{error}</div>}
      {!lista && !error && <div className="skeleton" style={{ height: 160 }} />}

      {lista && vistaActual === "central" && <Central filas={todas} puede={puede} onAbrir={setAbierta} onCambio={() => void cargar()} />}
      {lista && vistaActual === "historial" && <Historial filas={todas} puede={puede} onAbrir={setAbierta} />}

      {lista && vistaActual === "solicitudes" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
            <Kpi label="Pendientes" valor={pe?.pendiente ?? "—"} nota="Sin revisar todavía" tono={pe?.pendiente ? "alerta" : undefined} onClick={() => setEstado("pendiente")} />
            <Kpi label="En análisis" valor={pe?.en_analisis ?? "—"} nota="Recibidas por Dirección Médica" onClick={() => setEstado("en_analisis")} />
            <Kpi
              label="Excepcionales"
              valor={excepAbiertas}
              nota={`Sin resolver, con menos de ${ANTICIPACION} días hábiles`}
              tono={excepAbiertas ? "alerta" : undefined}
              onClick={() => {
                setEstado("abiertas");
                setSoloExcepcionales(true);
              }}
            />
            <Kpi label="En Central de Turnos" valor={porCancelar} nota={porCancelar ? "Aceptadas: falta cancelar la agenda" : "Ninguna agenda por cancelar"} tono={porCancelar ? "alerta" : "ok"} onClick={() => setVista("central")} />
          </div>

          <section className="card" style={{ ...S.card, display: "flex", flexDirection: "column", gap: 12 }}>
            <SegControl value={estado} onChange={(v) => setEstado(v)} label="Estado" opciones={FILTROS.map((x) => ({ value: x.value, label: !pe || x.value === "todas" ? x.label : `${x.label} ${x.value === "abiertas" ? abiertas : pe[x.value] ?? 0}` }))} />
            <BarraFiltros
              f={f}
              set={setF}
              servicios={serviciosDe(todas)}
              extra={
                <>
                  <label className="can-check">
                    <input type="checkbox" checked={soloExcepcionales} onChange={(e) => setSoloExcepcionales(e.target.checked)} /> Solo excepcionales
                  </label>
                  {(hayFiltros(f) || soloExcepcionales) && (
                    <button type="button" className="btn btn-quiet" onClick={() => { setF(FILTROS_VACIOS); setSoloExcepcionales(false); }}>
                      Limpiar filtros
                    </button>
                  )}
                </>
              }
            />

            {!filas.length && (
              <Vacio
                titulo={estado === "abiertas" ? "No hay solicitudes sin resolver" : "No hay solicitudes con estos filtros"}
                texto={todas.length === 0 ? "Cuando un médico envíe un pedido desde el QR, aparece acá." : undefined}
                accion={<button type="button" className="btn btn-quiet" onClick={() => setQr(true)}><QrCode size={15} /> Ver el QR para los médicos</button>}
              />
            )}
            {filas.length > 0 && (
              <div style={{ overflowX: "auto", border: "1px solid hsl(var(--border))", borderRadius: 12 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
                  <thead>
                    <tr>
                      <th style={S.th}>Trámite</th>
                      <th style={S.th}>Prestador</th>
                      <th style={S.th}>Días a cancelar</th>
                      <th style={S.th}>Motivo</th>
                      <th style={S.th}>Anticipación</th>
                      <th style={S.th}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((s) => (
                      <tr key={s.id} className="can-fila" onClick={() => setAbierta(s.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setAbierta(s.id)} style={{ cursor: "pointer" }}>
                        <td style={S.td}>
                          <div style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700 }}>{s.numero}</div>
                          <div style={S.small}>{fechaHora(s.createdAt)}</div>
                        </td>
                        <td style={S.td}>
                          <div style={{ fontWeight: 600 }}>{s.prestador}</div>
                          <div style={S.small}>{s.servicio} · Mat. {s.matricula}</div>
                        </td>
                        <td style={S.td}>
                          <div>{resumenDias(s.dias)}</div>
                          <div style={S.small}>{s.pacientesAgendados ? "Con pacientes agendados" : "Sin pacientes agendados"}{s.hayColega ? ` · atiende ${s.colega}` : ""}</div>
                        </td>
                        <td style={S.td}>{s.motivoLabel}</td>
                        <td style={S.td}><AnticipacionPill s={s} /></td>
                        <td style={S.td}>
                          <EstadoPill estado={s.estado} />
                          {s.estado === "agenda_cancelada" && <div style={{ ...S.small, marginTop: 3 }}>por {s.agendaCanceladaPor}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {abierta != null && <DetalleModal id={abierta} puede={puede} onClose={() => setAbierta(null)} onCambio={() => void cargar()} onAbrir={setAbierta} />}
      {qr && <QrModal onClose={() => setQr(false)} />}
    </div>
  );
}

/** El circuito en una línea, para que todos sepan quién hace qué. */
function Circuito() {
  const pasos = ["El médico pide por QR", "Dirección Médica acepta o rechaza", "Central de Turnos cancela la agenda", "Queda en el historial"];
  return (
    <ol className="can-circuito no-print" aria-label="Circuito">
      {pasos.map((p, i) => (
        <li key={p}><span>{i + 1}</span>{p}</li>
      ))}
    </ol>
  );
}

/** Dónde está la solicitud dentro del circuito. */
function Progreso({ s }: { s: Solicitud }) {
  if (s.estado === "rechazada" || s.estado === "anulada") return null;
  const actual = { pendiente: 0, en_analisis: 1, aceptada: 2, agenda_cancelada: 3 }[s.estado as "pendiente"] ?? 0;
  const pasos = ["Recibida", "En análisis", "Aceptada · en Central", "Agenda cancelada"];
  return (
    <ol className="can-progreso" aria-label="Avance de la solicitud">
      {pasos.map((p, i) => (
        <li key={p} className={i < actual || s.estado === "agenda_cancelada" ? "hecho" : i === actual ? "actual" : ""}>
          <span>{i < actual || s.estado === "agenda_cancelada" ? <Check size={12} /> : i + 1}</span>
          {p}
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------------------------

function Dato({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : undefined, minWidth: 0 }}>
      <div style={S.label}>{label}</div>
      <div style={{ marginTop: 3, fontSize: 14, overflowWrap: "anywhere" }}>{children}</div>
    </div>
  );
}

function DetalleModal({ id, puede, onClose, onCambio, onAbrir }: { id: number; puede: Puede; onClose: () => void; onCambio: () => void; onAbrir: (id: number) => void }) {
  const [s, setS] = useState<Solicitud | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [decidir, setDecidir] = useState<"aceptada" | "rechazada" | null>(null);
  const [respuesta, setRespuesta] = useState("");
  const [nota, setNota] = useState("");
  const { apariencia } = useApariencia();

  const cargar = useCallback(() => {
    setS(null);
    api<Solicitud>(`/api/cancelaciones/${id}`).then(setS).catch((e: Error) => setError(e.message));
  }, [id]);
  useEffect(() => {
    setDecidir(null);
    setRespuesta("");
    cargar();
  }, [cargar]);

  const accion = async (url: string, body: unknown, metodo = "POST", ok?: string) => {
    setOcupado(true);
    setError(null);
    try {
      const r = await api<Solicitud>(`/api/cancelaciones/${id}${url}`, { method: metodo, body });
      setS((prev) => ({ ...r, otras: prev?.otras }));
      setDecidir(null);
      setRespuesta("");
      if (ok) avisar(ok);
      onCambio();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const eliminar = async () => {
    if (!s || !(await confirmar({ titulo: `¿Eliminar la solicitud ${s.numero}?`, mensaje: "Se borra con todo su historial. No se puede deshacer.", accion: "Eliminar", peligro: true }))) return;
    try {
      await api(`/api/cancelaciones/${id}`, { method: "DELETE" });
      avisar(`Solicitud ${s.numero} eliminada.`);
      onCambio();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const abiertaEstado = s && (s.estado === "pendiente" || s.estado === "en_analisis");
  const motivoMeta = s ? MOTIVOS.find((m) => m.key === s.motivo) : undefined;

  return (
    <Modal
      titulo={s ? `Solicitud ${s.numero}` : "Solicitud"}
      onClose={onClose}
      ancho={820}
      pie={
        s && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", width: "100%", alignItems: "center" }}>
            {puede.eliminar && (
              <button type="button" className="btn btn-quiet" onClick={() => void eliminar()} style={{ color: "#b91c1c" }}>
                <Trash2 size={15} /> Eliminar
              </button>
            )}
            <button type="button" className="btn btn-quiet" onClick={() => imprimirPlanilla(s, apariencia.nombre, apariencia.logo)}>
              <Printer size={15} /> Imprimir planilla
            </button>
            <span style={{ flex: 1 }} />
            {puede.resolver && s.estado === "pendiente" && (
              <button type="button" className="btn btn-quiet" disabled={ocupado} onClick={() => void accion("/analisis", {}, "POST", "Quedó en análisis.")}>
                Tomar para análisis
              </button>
            )}
            {puede.resolver && abiertaEstado && (
              <>
                <button type="button" className="btn btn-quiet" disabled={ocupado} onClick={() => setDecidir("rechazada")} style={{ color: "#b91c1c" }}>
                  <XCircle size={15} /> Rechazar
                </button>
                <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => setDecidir("aceptada")}>
                  <CheckCircle2 size={15} /> Aceptar
                </button>
              </>
            )}
            {puede.resolver && (s.estado === "aceptada" || s.estado === "rechazada") && (
              <button type="button" className="btn btn-quiet" disabled={ocupado} onClick={() => void accion("/reabrir", {}, "POST", "Solicitud reabierta.")}>
                <RotateCcw size={15} /> Reabrir
              </button>
            )}
          </div>
        )
      }
    >
      {!s && !error && <div className="skeleton" style={{ height: 240 }} />}
      {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}
      {s && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <EstadoPill estado={s.estado} />
            <AnticipacionPill s={s} />
            <span style={S.small}>Recibida el {fechaHora(s.createdAt)}</span>
            {s.resueltoAt && <span style={S.small}>· {s.estado === "rechazada" ? "Rechazada" : "Aceptada"} por {s.resueltoPor} el {fechaHora(s.resueltoAt)}</span>}
          </div>

          <Progreso s={s} />

          {decidir && (
            <div className="card" style={{ padding: 14, borderRadius: 12, borderColor: decidir === "aceptada" ? "#a9dca9" : "#f0b4b4", display: "flex", flexDirection: "column", gap: 8 }}>
              <strong>{decidir === "aceptada" ? "Aceptar la solicitud" : "Rechazar la solicitud"}</strong>
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span className="field-label">{decidir === "aceptada" ? "Mensaje para el médico (opcional)" : "Motivo del rechazo (lo ve el médico)"}</span>
                <textarea value={respuesta} onChange={(e) => setRespuesta(e.target.value)} rows={2} maxLength={1500} autoFocus placeholder={decidir === "aceptada" ? "Ej.: Se reprograma a los pacientes para la semana siguiente." : "Ej.: No hay quién cubra la agenda en esas fechas."} />
              </label>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-quiet" onClick={() => setDecidir(null)}>Cancelar</button>
                <button
                  type="button"
                  className={decidir === "aceptada" ? "btn btn-primary" : "btn btn-danger"}
                  disabled={ocupado || (decidir === "rechazada" && respuesta.trim().length < 3)}
                  onClick={() => void accion("/resolver", { decision: decidir, respuesta }, "POST", decidir === "aceptada" ? "Solicitud aceptada." : "Solicitud rechazada.")}
                >
                  {decidir === "aceptada" ? "Confirmar: aceptar" : "Confirmar: rechazar"}
                </button>
              </div>
            </div>
          )}

          {s.respuesta && !decidir && (
            <div style={{ fontSize: 13, padding: "8px 12px", borderRadius: 10, background: "hsl(var(--muted))" }}>
              <strong>Respuesta al médico:</strong> {s.respuesta}
            </div>
          )}

          {s.excepcional && (
            <div style={{ display: "flex", gap: 10, padding: "10px 12px", borderRadius: 10, background: "#fde7d8", color: "#7a3309", border: "1px solid #f3c09c", fontSize: 13 }}>
              <AlertTriangle size={18} style={{ flex: "0 0 auto" }} />
              <div>
                <strong>Pedido excepcional:</strong> {s.anticipacionHabiles} día{s.anticipacionHabiles === 1 ? "" : "s"} hábil{s.anticipacionHabiles === 1 ? "" : "es"} de anticipación (mínimo {ANTICIPACION}).
                <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{s.justificacion}</div>
              </div>
            </div>
          )}

          <section>
            <h3 className="can-h3">Datos del prestador y servicio</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
              <Dato label="Nombre y apellido">{s.prestador}</Dato>
              <Dato label="Servicio">{s.servicio}</Dato>
              <Dato label="Matrícula">{s.matricula}</Dato>
              <Dato label="DNI">{s.dni}</Dato>
              <Dato label="Teléfono">{s.telefono || <span style={S.small}>—</span>}</Dato>
            </div>
          </section>

          <section>
            <h3 className="can-h3">Días a cancelar</h3>
            <div style={{ border: "1px solid hsl(var(--border))", borderRadius: 10, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={S.th}>Fecha</th>
                    <th style={S.th}>Desde</th>
                    <th style={S.th}>Hasta</th>
                  </tr>
                </thead>
                <tbody>
                  {s.dias.map((d, i) => (
                    <tr key={i}>
                      <td style={S.td}>{fechaLarga(d.fecha)} <span style={S.small}>{fechaAr(d.fecha)}</span></td>
                      <td style={S.td}>{d.desde}</td>
                      <td style={S.td}>{d.hasta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {s.fechaReprogramacion && <div style={{ marginTop: 8, fontSize: 13 }}><strong>Fecha de reprogramación:</strong> {fechaAr(s.fechaReprogramacion)}</div>}
          </section>

          <section>
            <h3 className="can-h3">Pedido</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              <Dato label="¿Pacientes agendados en el período?">{s.pacientesAgendados ? "Sí" : "No"}</Dato>
              <Dato label="¿Colega del servicio que pueda atender?">{s.hayColega ? `Sí — ${s.colega}` : "No"}</Dato>
              <Dato label="Motivo">{s.motivoLabel}</Dato>
              {s.motivoDetalle && <Dato label="Detalle del motivo" full><span style={{ whiteSpace: "pre-wrap" }}>{s.motivoDetalle}</span></Dato>}
            </div>
          </section>

          <section>
            <h3 className="can-h3">Constancia</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {s.pideConstancia && (
                <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 14 }}>
                  <input type="checkbox" checked={s.constanciaRecibida} disabled={!puede.resolver || ocupado} onChange={(e) => void accion("/seguimiento", { constanciaRecibida: e.target.checked }, "PATCH")} />
                  Se recibió {motivoMeta?.constancia ?? "la constancia"} en Dirección Médica
                </label>
              )}
            </div>
            {!s.pideConstancia && <div style={S.small}>Este motivo no lleva constancia.</div>}
          </section>

          {s.estado !== "rechazada" && s.estado !== "anulada" && (
            <section>
              <h3 className="can-h3">Central de Turnos</h3>
              <SeccionCentral s={s} puede={puede} ocupado={ocupado} accion={accion} />
            </section>
          )}

          <section>
            <h3 className="can-h3">Historial</h3>
            <ol className="can-tl">
              {s.eventos.map((e, i) => (
                <li key={i}>
                  <span className="can-tl-dot" aria-hidden="true" />
                  <div>
                    <strong>{e.quien}</strong> · {ACCION_EVENTO[e.accion] ?? e.accion}
                    <span style={{ ...S.small, marginLeft: 6 }}>{fechaHora(e.at)}</span>
                    {e.detalle && <div style={{ fontSize: 13, whiteSpace: "pre-wrap", marginTop: 2 }}>{e.detalle}</div>}
                  </div>
                </li>
              ))}
            </ol>
            {(puede.resolver || puede.central) && (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Agregar una nota interna (no la ve el médico)" maxLength={1000} style={{ flex: 1 }} aria-label="Nota interna" />
                <button
                  type="button"
                  className="btn btn-quiet"
                  disabled={!nota.trim() || ocupado}
                  onClick={() => {
                    void accion("/nota", { texto: nota }).then(() => setNota(""));
                  }}
                >
                  Agregar
                </button>
              </div>
            )}
          </section>

          {s.otras && s.otras.length > 0 && (
            <section>
              <h3 className="can-h3">Otras solicitudes de {s.prestador.split(" ")[0]} ({s.otras.length})</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {s.otras.map((o) => (
                  <button key={o.id} type="button" className="can-otra" onClick={() => onAbrir(o.id)}>
                    <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700 }}>{o.numero}</span>
                    <span>{resumenDias(o.dias)}</span>
                    <span style={S.small}>{o.motivoLabel}</span>
                    <span style={{ marginLeft: "auto" }}><EstadoPill estado={o.estado} /></span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------

/**
 * Dirección del formulario para el QR: IP + puerto de Docker (ej. http://172.20.1.134:8085). Los celulares no conocen
 * el nombre local, y por IP sin puerto (80) responde otro nginx del servidor. Si se entra por IP, se usa esa misma.
 */
function urlSugerida(cfg: { ipUrl?: string | null } | null): string {
  const enIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(window.location.hostname);
  const base = enIp ? window.location.origin : cfg?.ipUrl || window.location.origin;
  return base.replace(/\/+$/, "") + RUTA_PUBLICA;
}

function QrModal({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [png, setPng] = useState<string | null>(null);
  const [verDireccion, setVerDireccion] = useState(false);
  const { apariencia } = useApariencia();

  useEffect(() => {
    fetch("/api/acceso", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((c) => setUrl((u) => u || urlSugerida(c)));
  }, []);

  useEffect(() => {
    if (!url) return;
    let vivo = true;
    import("qrcode")
      .then((QR) => QR.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: "M" }))
      .then((d) => vivo && setPng(d))
      .catch(() => vivo && setPng(null));
    return () => {
      vivo = false;
    };
  }, [url]);

  const imprimirCartel = () => {
    if (!png) return;
    const w = window.open("", "_blank");
    if (!w) return avisar("El navegador bloqueó la ventana de impresión.", "error");
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>QR · Cancelación de agenda</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #111; text-align: center; margin: 0; }
  .logo { max-height: 70px; max-width: 240px; margin: 0 auto 10px; display: block; }
  h1 { font-size: 30px; margin: 6px 0 4px; }
  h2 { font-size: 18px; font-weight: 500; margin: 0 0 22px; color: #444; }
  img.qr { width: 340px; height: 340px; image-rendering: pixelated; }
  ol { text-align: left; display: inline-block; font-size: 16px; line-height: 1.6; margin: 22px auto 0; }
  .url { font-family: ui-monospace, monospace; font-size: 14px; color: #333; margin-top: 10px; word-break: break-all; }
  .nota { margin-top: 22px; font-size: 13px; color: #555; }
</style></head><body>
${apariencia.logo ? `<img class="logo" src="${apariencia.logo}" alt="">` : ""}
<div style="font-size:14px;color:#555;text-transform:uppercase;letter-spacing:.08em">${escapar(apariencia.nombre)} · Dirección Médica</div>
<h1>Cancelación de agenda de consultorio</h1>
<h2>Escaneá el código con la cámara del celular</h2>
<img class="qr" src="${png}" alt="Código QR">
<ol>
  <li><strong>Pedir cancelación de agenda:</strong> completá el formulario y guardá tu número de trámite.</li>
  <li><strong>Ver mi solicitud:</strong> con el número de trámite y tu DNI.</li>
</ol>
<div class="nota">Se pide con 15 días hábiles de anticipación. Funciona conectado al Wi-Fi del sanatorio.</div>
<script>window.onload = () => { window.print(); }</script>
</body></html>`);
    w.document.close();
  };

  return (
    <Modal
      titulo="QR del formulario para los médicos"
      onClose={onClose}
      ancho={620}
      pie={
        <>
          <a className="btn btn-quiet" href={url} target="_blank" rel="noreferrer">
            <ExternalLink size={15} /> Abrir el formulario
          </a>
          {png && (
            <a className="btn btn-quiet" href={png} download="qr-cancelacion-agenda.png">
              <Download size={15} /> Descargar imagen
            </a>
          )}
          <button type="button" className="btn btn-primary" onClick={imprimirCartel} disabled={!png}>
            <Printer size={15} /> Imprimir cartel
          </button>
        </>
      }
    >
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "0 0 auto", background: "#fff", padding: 8, borderRadius: 12, border: "1px solid hsl(var(--border))", margin: "0 auto" }}>
          {png ? <img src={png} alt="Código QR del formulario" width={220} height={220} style={{ display: "block", imageRendering: "pixelated" }} /> : <div className="skeleton" style={{ width: 220, height: 220 }} />}
        </div>
        <div style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: 10, fontSize: 13.5 }}>
          <p style={{ margin: 0 }}>
            Es un único QR para todos los médicos. Al escanearlo eligen <strong>Pedir cancelación de agenda</strong> o <strong>Ver mi solicitud</strong>. No necesitan usuario del sistema.
          </p>
          <span className="field-hint">Funciona solo dentro de la red / Wi-Fi del sanatorio.</span>
          {/* La dirección interna queda oculta: solo se muestra (y se corrige) si hace falta. */}
          {verDireccion ? (
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span className="field-label">Dirección que abre el QR</span>
              <input value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} autoComplete="off" />
              <span className="field-hint">IP y puerto del sistema: los celulares no conocen el nombre local.</span>
              <button type="button" className="btn btn-quiet" style={{ alignSelf: "flex-start" }} onClick={() => setVerDireccion(false)}>
                <EyeOff size={15} /> Ocultar dirección
              </button>
            </label>
          ) : (
            <button type="button" className="btn btn-quiet" style={{ alignSelf: "flex-start", fontSize: 12.5 }} onClick={() => setVerDireccion(true)}>
              <Eye size={15} /> Ver o corregir la dirección
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------

function escapar(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** La planilla en papel, completa con los datos de la solicitud (para archivo o para firmar). */
function imprimirPlanilla(s: Solicitud, nombre: string, logo?: string | null) {
  const w = window.open("", "_blank");
  if (!w) return avisar("El navegador bloqueó la ventana de impresión.", "error");
  const marca = (v: boolean) => `<span class="box">${v ? "X" : "&nbsp;"}</span>`;
  const filas = s.dias.map((d) => `<tr><td>${fechaAr(d.fecha)}</td><td>${d.desde}</td><td>${d.hasta}</td></tr>`).join("");
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${s.numero} · Planilla de reprogramación</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #111; font-size: 13px; margin: 0; }
  header { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #111; padding-bottom: 8px; }
  header img { max-height: 48px; max-width: 160px; }
  h1 { font-size: 17px; margin: 0; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; background: #eee; padding: 5px 8px; margin: 14px 0 6px; }
  .meta { margin-left: auto; text-align: right; font-size: 12px; }
  .fila { display: flex; gap: 18px; flex-wrap: wrap; margin: 5px 0; }
  .l { color: #555; }
  .box { display: inline-block; width: 14px; height: 14px; border: 1px solid #111; text-align: center; line-height: 14px; font-size: 11px; font-weight: 700; margin-right: 4px; vertical-align: middle; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { border: 1px solid #555; padding: 4px 8px; text-align: left; }
  th { background: #f3f3f3; font-size: 12px; }
  .firmas { display: flex; gap: 40px; margin-top: 46px; }
  .firmas div { flex: 1; border-top: 1px solid #111; text-align: center; padding-top: 4px; font-size: 12px; }
  .exc { border: 1px solid #b45309; background: #fff7ed; padding: 6px 8px; margin-top: 6px; }
  .pie { margin-top: 18px; font-size: 11px; color: #555; }
</style></head><body>
<header>${logo ? `<img src="${logo}" alt="">` : ""}<div><h1>Planilla de reprogramación de agenda de consultorio</h1><div>1) Pedido de cancelación · ${escapar(nombre)}</div></div>
<div class="meta"><strong>${s.numero}</strong><br>Recibida el ${fechaHora(s.createdAt)}<br>Estado: ${ESTADO_META[s.estado].label}</div></header>
<h2>Datos del prestador y servicio</h2>
<div class="fila"><span><span class="l">Nombre y apellido del prestador:</span> <strong>${escapar(s.prestador)}</strong></span><span><span class="l">Servicio:</span> <strong>${escapar(s.servicio)}</strong></span></div>
<div class="fila"><span><span class="l">Matrícula:</span> ${escapar(s.matricula)}</span><span><span class="l">DNI:</span> ${escapar(s.dni)}</span>${s.telefono ? `<span><span class="l">Teléfono:</span> ${escapar(s.telefono)}</span>` : ""}</div>
<h2>Pedido</h2>
<div class="fila">¿El pedido se realiza con 15 días hábiles de anticipación? &nbsp; ${marca(!s.excepcional)} Sí ${marca(s.excepcional)} No <span class="l">(${s.anticipacionHabiles} días hábiles)</span></div>
${s.excepcional ? `<div class="exc"><strong>Motivo de la urgencia:</strong> ${escapar(s.justificacion)}</div>` : ""}
<div class="fila">¿Existen pacientes agendados en el período solicitado? &nbsp; ${marca(s.pacientesAgendados)} Sí ${marca(!s.pacientesAgendados)} No</div>
<div class="fila">¿Existe un colega del Servicio que pueda atender? &nbsp; ${marca(s.hayColega)} Sí ${s.hayColega ? `¿Quién? <strong>${escapar(s.colega)}</strong>` : ""} ${marca(!s.hayColega)} No</div>
<h2>Motivo de reprogramación</h2>
<div class="fila">${MOTIVOS.map((m) => `<span>${marca(s.motivo === m.key)} ${m.label}</span>`).join("")}</div>
${s.motivoDetalle ? `<div class="fila"><span class="l">Detalle:</span> ${escapar(s.motivoDetalle)}</div>` : ""}
${s.pideConstancia ? `<div class="fila">${marca(s.constanciaRecibida)} Constancia recibida en Dirección Médica</div>` : ""}
<h2>Días a cancelar</h2>
<table><thead><tr><th>Fecha</th><th>Horario desde</th><th>Hasta</th></tr></thead><tbody>${filas}</tbody></table>
<div class="fila" style="margin-top:8px"><span class="l">Fecha de reprogramación:</span> ${s.fechaReprogramacion ? fechaAr(s.fechaReprogramacion) : "—"}</div>
<h2>Resolución de Dirección Médica</h2>
<div class="fila">${marca(s.estado === "aceptada" || s.estado === "agenda_cancelada")} Aceptada ${marca(s.estado === "rechazada")} Rechazada ${s.resueltoAt ? `<span class="l">por ${escapar(s.resueltoPor)} el ${fechaHora(s.resueltoAt)}</span>` : ""}</div>
${s.respuesta ? `<div class="fila"><span class="l">Respuesta:</span> ${escapar(s.respuesta)}</div>` : ""}
<h2>Central de Turnos</h2>
<div class="fila">${marca(s.estado === "agenda_cancelada")} Agenda cancelada en el sistema de turnos ${s.agendaCanceladaAt ? `<span class="l">por ${escapar(s.agendaCanceladaPor)} el ${fechaHora(s.agendaCanceladaAt)}</span>` : ""}</div>
${s.centralNota ? `<div class="fila"><span class="l">Observación:</span> ${escapar(s.centralNota)}</div>` : ""}
<div class="firmas"><div>Firma y sello del solicitante</div><div>Firma y sello del Responsable del Servicio</div></div>
<div class="pie">Solicitud enviada por el médico desde el formulario digital (QR), con declaración de que los datos son correctos.</div>
<script>window.onload = () => { window.print(); }</script>
</body></html>`);
  w.document.close();
}
