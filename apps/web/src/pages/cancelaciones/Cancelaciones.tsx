import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Download, ExternalLink, FileSpreadsheet, Printer, QrCode, RotateCcw, Search, Trash2, XCircle } from "lucide-react";
import { avisar, confirmar } from "@/components/feedback";
import { useApariencia } from "@/pages/shared/apariencia";
import { Kpi, Modal, Pill, S, SegControl, Vacio } from "../administracion/ui";
import { ACCION_EVENTO, ANTICIPACION, ESTADO_META, MOTIVOS, RUTA_PUBLICA, api, fechaAr, fechaHora, fechaLarga, resumenDias, type Estado, type Solicitud } from "./api";

// Medical → Cancelaciones Médicos: bandeja de solicitudes de cancelación de agenda que mandan los médicos por QR.

type Me = { id: number; name: string; role: string; acciones?: Record<string, string[]> };
type Lista = { filas: Solicitud[]; porEstado: Record<Estado, number>; resumen: { excepcionales: number; sinInformar: number } | null; anticipacionMinima: number };
type FiltroEstado = "abiertas" | Estado | "todas";

const FILTROS: { value: FiltroEstado; label: string }[] = [
  { value: "abiertas", label: "Sin resolver" },
  { value: "pendiente", label: "Pendientes" },
  { value: "en_analisis", label: "En análisis" },
  { value: "aceptada", label: "Aceptadas" },
  { value: "rechazada", label: "Rechazadas" },
  { value: "anulada", label: "Anuladas" },
  { value: "todas", label: "Todas" },
];

/** Fecha de hoy en esta PC (YYYY-MM-DD). */
const hoyLocal = () => new Date().toLocaleDateString("sv-SE");

export function EstadoPill({ estado }: { estado: Estado }) {
  const m = ESTADO_META[estado];
  return <Pill style={{ background: m.bg, color: m.fg, borderColor: m.borde }}>{m.label}</Pill>;
}

function AnticipacionPill({ s }: { s: Pick<Solicitud, "excepcional" | "anticipacionHabiles"> }) {
  return s.excepcional ? (
    <Pill style={{ background: "#fde7d8", color: "#8a3b0c", borderColor: "#f3c09c" }} title={`Pedida con ${s.anticipacionHabiles} días hábiles de anticipación (mínimo ${ANTICIPACION})`}>
      <AlertTriangle size={11} /> Excepcional · {s.anticipacionHabiles} d.h.
    </Pill>
  ) : (
    <span style={S.small}>{s.anticipacionHabiles} días hábiles</span>
  );
}

export default function CancelacionesPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [lista, setLista] = useState<Lista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inicial = useMemo(() => new URLSearchParams(window.location.search), []);
  const [estado, setEstado] = useState<FiltroEstado>((FILTROS.some((f) => f.value === inicial.get("estado")) ? inicial.get("estado") : "abiertas") as FiltroEstado);
  const [q, setQ] = useState("");
  const [soloExcepcionales, setSoloExcepcionales] = useState(false);
  const [sinInformar, setSinInformar] = useState(false);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [abierta, setAbierta] = useState<number | null>(inicial.get("id") ? Number(inicial.get("id")) : null);
  const [qr, setQr] = useState(false);

  useEffect(() => {
    api<Me>("/api/auth/me").then(setMe).catch(() => setMe(null));
  }, []);

  const cargar = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (estado !== "todas") p.set("estado", estado);
      if (desde) p.set("desde", desde);
      if (hasta) p.set("hasta", hasta);
      if (soloExcepcionales) p.set("excepcional", "1");
      setLista(await api<Lista>(`/api/cancelaciones?${p}`));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [estado, desde, hasta, soloExcepcionales]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const acc = useMemo(() => (me?.role === "superadmin" ? ["ver", "exportar", "resolver", "eliminar"] : (me?.acciones?.cancelaciones ?? [])), [me]);
  const puede = { resolver: acc.includes("resolver"), eliminar: acc.includes("eliminar"), exportar: acc.includes("exportar") };

  const filas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (lista?.filas ?? []).filter(
      (s) =>
        (!sinInformar || (s.estado === "aceptada" && !s.centralInformadaAt && s.fechaHasta >= hoyLocal())) &&
        (!t || [s.numero, s.prestador, s.servicio, s.matricula, s.dni, s.colega].some((v) => v.toLowerCase().includes(t))),
    );
  }, [lista, q, sinInformar]);

  const pe = lista?.porEstado;
  const excepAbiertas = lista?.resumen?.excepcionales ?? 0;
  const sinInf = lista?.resumen?.sinInformar ?? 0;

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
        "Central de Turnos informada": s.centralInformadaAt ? fechaHora(s.centralInformadaAt) : "",
      })),
    );
    const ws = XLSX.utils.json_to_sheet(filasX);
    ws["!cols"] = Object.keys(filasX[0] ?? { a: 1 }).map((k) => ({ wch: Math.max(12, Math.min(40, k.length + 4)) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cancelaciones");
    XLSX.writeFile(wb, `cancelaciones-agenda-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
  };

  return (
    <div className="content-wrap" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">Medical / Cancelaciones Médicos</div>
          <h1 className="page-title">Cancelaciones de agenda</h1>
          <p className="page-subtitle">Pedidos de cancelación o reprogramación de agenda de consultorio que envían los médicos desde el QR.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} className="no-print">
          <button type="button" className="btn btn-quiet" onClick={() => setQr(true)}>
            <QrCode size={15} /> QR del formulario
          </button>
          {puede.exportar && (
            <button type="button" className="btn btn-quiet" onClick={() => void exportar()} disabled={!filas.length}>
              <FileSpreadsheet size={15} /> Exportar ({filas.length})
            </button>
          )}
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <Kpi label="Pendientes" valor={pe?.pendiente ?? "—"} nota="Sin revisar todavía" tono={pe?.pendiente ? "alerta" : undefined} onClick={() => setEstado("pendiente")} />
        <Kpi label="En análisis" valor={pe?.en_analisis ?? "—"} nota="Recibidas por Dirección Médica" onClick={() => setEstado("en_analisis")} />
        <Kpi
          label="Excepcionales"
          valor={lista ? excepAbiertas : "—"}
          nota={`Sin resolver, con menos de ${ANTICIPACION} días hábiles`}
          tono={excepAbiertas ? "alerta" : undefined}
          onClick={() => {
            setEstado("abiertas");
            setSoloExcepcionales(true);
          }}
        />
        <Kpi
          label="Aceptadas"
          valor={pe?.aceptada ?? "—"}
          nota={sinInf ? `${sinInf} sin informar a Central de Turnos` : "Todas informadas a Central de Turnos"}
          tono={sinInf ? "alerta" : "ok"}
          onClick={() => {
            setEstado("aceptada");
            setSinInformar(true);
          }}
        />
      </div>

      <section className="card" style={{ ...S.card, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <SegControl value={estado} onChange={(v) => setEstado(v)} label="Estado" opciones={FILTROS.map((f) => ({ value: f.value, label: !pe || f.value === "todas" ? f.label : `${f.label} ${f.value === "abiertas" ? pe.pendiente + pe.en_analisis : pe[f.value]}` }))} />
          <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 340 }}>
            <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar médico, servicio, matrícula, DNI o trámite" style={{ paddingLeft: 32, width: "100%" }} aria-label="Buscar" />
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={S.label}>Días a cancelar desde</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={S.label}>hasta</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, paddingBottom: 8 }}>
            <input type="checkbox" checked={soloExcepcionales} onChange={(e) => setSoloExcepcionales(e.target.checked)} /> Solo excepcionales
          </label>
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, paddingBottom: 8 }}>
            <input type="checkbox" checked={sinInformar} onChange={(e) => setSinInformar(e.target.checked)} /> Aceptadas sin informar a Central
          </label>
          {(desde || hasta || soloExcepcionales || sinInformar || q) && (
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                setDesde("");
                setHasta("");
                setSoloExcepcionales(false);
                setSinInformar(false);
                setQ("");
              }}
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {error && <div className="form-error">{error}</div>}
        {!lista && !error && <div className="skeleton" style={{ height: 120 }} />}
        {lista && !filas.length && (
          <Vacio
            titulo={estado === "abiertas" ? "No hay solicitudes sin resolver" : "No hay solicitudes con estos filtros"}
            texto={(lista.filas.length === 0 && estado === "abiertas") ? "Cuando un médico envíe un pedido desde el QR, aparece acá." : undefined}
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
                      {s.estado === "aceptada" && !s.centralInformadaAt && <div style={{ ...S.small, marginTop: 3 }}>Falta informar a Central</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {abierta != null && <DetalleModal id={abierta} puede={puede} onClose={() => setAbierta(null)} onCambio={() => void cargar()} onAbrir={setAbierta} />}
      {qr && <QrModal onClose={() => setQr(false)} />}
    </div>
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

function DetalleModal({ id, puede, onClose, onCambio, onAbrir }: { id: number; puede: { resolver: boolean; eliminar: boolean }; onClose: () => void; onCambio: () => void; onAbrir: (id: number) => void }) {
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
            {s.resueltoAt && <span style={S.small}>· {s.estado === "aceptada" ? "Aceptada" : "Rechazada"} por {s.resueltoPor} el {fechaHora(s.resueltoAt)}</span>}
          </div>

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
            <h3 className="can-h3">Seguimiento</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {s.pideConstancia && (
                <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 14 }}>
                  <input type="checkbox" checked={s.constanciaRecibida} disabled={!puede.resolver || ocupado} onChange={(e) => void accion("/seguimiento", { constanciaRecibida: e.target.checked }, "PATCH")} />
                  Se recibió {motivoMeta?.constancia ?? "la constancia"} en Dirección Médica
                </label>
              )}
              <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 14, opacity: s.estado === "aceptada" || s.centralInformadaAt ? 1 : 0.6 }}>
                <input
                  type="checkbox"
                  checked={Boolean(s.centralInformadaAt)}
                  disabled={!puede.resolver || ocupado || (s.estado !== "aceptada" && !s.centralInformadaAt)}
                  onChange={(e) => void accion("/seguimiento", { centralInformada: e.target.checked }, "PATCH", e.target.checked ? "Marcada como informada a Central de Turnos." : undefined)}
                />
                Central de Turnos informada
                {s.centralInformadaAt ? <span style={S.small}>({s.centralInformadaPor}, {fechaHora(s.centralInformadaAt)})</span> : s.estado !== "aceptada" && <span style={S.small}>(una vez aceptada)</span>}
              </label>
            </div>
          </section>

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
            {puede.resolver && (
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
<div class="url">${escapar(url)}</div>
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
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span className="field-label">Dirección que abre el QR</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} />
            <span className="field-hint">Usa la IP y el puerto del sistema (ej. http://172.20.1.134:8085): los celulares no conocen el nombre «sanatorio.salvador.connect». Por ahora funciona solo dentro de la red / Wi-Fi del sanatorio.</span>
          </label>
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
<div class="fila">${marca(s.estado === "aceptada")} Aceptada ${marca(s.estado === "rechazada")} Rechazada ${s.resueltoAt ? `<span class="l">por ${escapar(s.resueltoPor)} el ${fechaHora(s.resueltoAt)}</span>` : ""}</div>
${s.respuesta ? `<div class="fila"><span class="l">Respuesta:</span> ${escapar(s.respuesta)}</div>` : ""}
<div class="fila">${marca(Boolean(s.centralInformadaAt))} Central de Turnos informada ${s.centralInformadaAt ? `<span class="l">(${escapar(s.centralInformadaPor)}, ${fechaHora(s.centralInformadaAt)})</span>` : ""}</div>
<div class="firmas"><div>Firma y sello del solicitante</div><div>Firma y sello del Responsable del Servicio</div></div>
<div class="pie">Solicitud enviada por el médico desde el formulario digital (QR), con declaración de que los datos son correctos.</div>
<script>window.onload = () => { window.print(); }</script>
</body></html>`);
  w.document.close();
}
