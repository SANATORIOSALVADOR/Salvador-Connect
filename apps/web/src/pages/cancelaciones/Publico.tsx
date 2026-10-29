import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, CalendarPlus, CalendarRange, CalendarX2, Check, CheckCircle2, Copy, FileSearch, Info, Plus, Trash2 } from "lucide-react";
import { useApariencia } from "@/pages/shared/apariencia";
import { ESTADO_META, MOTIVOS, api, fechaAr, fechaHora, fechaLarga, type Dia, type Motivo, type Reglas, type TramitePublico } from "./api";

// Formulario que abre el médico con el QR (sin usuario del sistema; por ahora solo desde la red del sanatorio).
// Es la versión digital de la «Planilla de reprogramación de agenda de consultorio — Pedido de cancelación».

const GUARDADOS = "sc-cancelaciones-mias";
type Guardado = { numero: string; dni: string; at: string };

function leerGuardados(): Guardado[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(GUARDADOS) || "[]");
    return Array.isArray(v) ? v.slice(0, 10) : [];
  } catch {
    return [];
  }
}
function guardar(g: Guardado) {
  try {
    const lista = [g, ...leerGuardados().filter((x) => x.numero !== g.numero)].slice(0, 10);
    window.localStorage.setItem(GUARDADOS, JSON.stringify(lista));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

type Vista = { v: "inicio" } | { v: "pedir" } | { v: "enviado"; t: TramitePublico; dni: string } | { v: "consultar"; numero?: string; dni?: string };

const sumarDias = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const diaSemana = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

export default function CancelacionPublica() {
  const { apariencia } = useApariencia();
  const inicial = useMemo<Vista>(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get("n") ? { v: "consultar", numero: p.get("n") ?? "" } : { v: "inicio" };
  }, []);
  const [vista, setVista] = useState<Vista>(inicial);
  useEffect(() => {
    document.title = `Cancelación de agenda · ${apariencia.nombre}`;
    window.scrollTo(0, 0);
  }, [vista.v, apariencia.nombre]);

  return (
    <div className="canp-page">
      <header className="canp-top">
        {apariencia.logo ? <img src={apariencia.logo} alt="" className="canp-logo" /> : <span className="canp-logo-ico"><CalendarX2 size={20} /></span>}
        <div style={{ minWidth: 0 }}>
          <div className="canp-marca">{apariencia.nombre}</div>
          <div className="canp-sub">Dirección Médica · Reprogramación de agenda de consultorio</div>
        </div>
      </header>
      <main className="canp-main">
        {vista.v === "inicio" && <Inicio onPedir={() => setVista({ v: "pedir" })} onConsultar={() => setVista({ v: "consultar" })} />}
        {vista.v === "pedir" && <Pedir onVolver={() => setVista({ v: "inicio" })} onEnviado={(t, dni) => setVista({ v: "enviado", t, dni })} />}
        {vista.v === "enviado" && <Enviado t={vista.t} onVer={() => setVista({ v: "consultar", numero: vista.t.numero, dni: vista.dni })} onOtra={() => setVista({ v: "pedir" })} />}
        {vista.v === "consultar" && <Consultar numero0={vista.numero} dni0={vista.dni} onVolver={() => setVista({ v: "inicio" })} />}
      </main>
      <footer className="canp-pie">Ante cualquier duda, comunicate con Dirección Médica.</footer>
    </div>
  );
}

function Inicio({ onPedir, onConsultar }: { onPedir: () => void; onConsultar: () => void }) {
  return (
    <div className="canp-card">
      <h1 className="canp-h1">Cancelación de agenda de consultorio</h1>
      <p className="canp-lead">Pedí la cancelación o reprogramación de tus turnos, o consultá cómo va una solicitud que ya hiciste.</p>
      <div className="canp-opciones">
        <button type="button" className="canp-opcion" onClick={onPedir}>
          <span className="canp-opcion-ico"><CalendarPlus size={22} /></span>
          <span>
            <strong>Pedir cancelación de agenda</strong>
            <span>Completá el pedido y te damos un número de trámite.</span>
          </span>
        </button>
        <button type="button" className="canp-opcion" onClick={onConsultar}>
          <span className="canp-opcion-ico"><FileSearch size={22} /></span>
          <span>
            <strong>Ver mi solicitud</strong>
            <span>Con tu número de trámite y tu DNI.</span>
          </span>
        </button>
      </div>
      <div className="canp-nota">
        <Info size={16} />
        <span>
          La regla es pedirlo con <strong>15 días hábiles de anticipación</strong>. Si es con menos (por ejemplo, algo del mismo día), igual podés enviarlo: queda como <strong>excepcional</strong> y te pedimos que expliques la urgencia.
        </span>
      </div>
    </div>
  );
}

function Bloque({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return (
    <section className="canp-bloque">
      <h2><span className="canp-num">{n}</span>{titulo}</h2>
      {children}
    </section>
  );
}

function Campo({ label, children, hint, full, req }: { label: string; children: ReactNode; hint?: ReactNode; full?: boolean; req?: boolean }) {
  return (
    <label className="canp-campo" style={full ? { gridColumn: "1 / -1" } : undefined}>
      <span className="field-label">
        {label}
        {req && <span aria-hidden="true" style={{ color: "#b91c1c" }}> *</span>}
      </span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function SiNo({ value, onChange, label }: { value: boolean | null; onChange: (v: boolean) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="canp-sino">
      {[true, false].map((v) => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>
          {value === v && <Check size={15} />} {v ? "Sí" : "No"}
        </button>
      ))}
    </div>
  );
}

const DIA_VACIO: Dia = { fecha: "", desde: "", hasta: "" };

function Pedir({ onVolver, onEnviado }: { onVolver: () => void; onEnviado: (t: TramitePublico, dni: string) => void }) {
  const [reglas, setReglas] = useState<Reglas | null>(null);
  const [prestador, setPrestador] = useState("");
  const [matricula, setMatricula] = useState("");
  const [dni, setDni] = useState("");
  const [servicio, setServicio] = useState("");
  const [telefono, setTelefono] = useState("");
  const [dias, setDias] = useState<Dia[]>([{ ...DIA_VACIO }]);
  const [rango, setRango] = useState<{ desde: string; hasta: string; hDesde: string; hHasta: string; habiles: boolean } | null>(null);
  const [pacientes, setPacientes] = useState<boolean | null>(null);
  const [hayColega, setHayColega] = useState<boolean | null>(null);
  const [colega, setColega] = useState("");
  const [motivo, setMotivo] = useState<Motivo | "">("");
  const [motivoDetalle, setMotivoDetalle] = useState("");
  const [reprogramacion, setReprogramacion] = useState("");
  const [justificacion, setJustificacion] = useState("");
  const [declaracion, setDeclaracion] = useState(false);
  const [anticipacion, setAnticipacion] = useState<{ fecha: string; habiles: number; excepcional: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api<Reglas>("/api/publico/cancelaciones/reglas").then(setReglas).catch((e: Error) => setError(e.message));
  }, []);

  const hoy = reglas?.hoy ?? new Date().toISOString().slice(0, 10);
  const completos = dias.filter((d) => d.fecha);
  const primera = completos.map((d) => d.fecha).sort()[0] ?? "";

  // Anticipación en días hábiles (con los feriados del sistema): avisa antes de enviar si va a ser excepcional.
  useEffect(() => {
    if (!primera || primera < hoy) {
      setAnticipacion(null);
      return;
    }
    let vivo = true;
    const t = window.setTimeout(() => {
      api<{ habiles: number; excepcional: boolean }>("/api/publico/cancelaciones/anticipacion", { method: "POST", body: { fecha: primera } })
        .then((r) => vivo && setAnticipacion({ fecha: primera, ...r }))
        .catch(() => undefined);
    }, 250);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
  }, [primera, hoy]);

  const excepcional = anticipacion?.fecha === primera ? anticipacion.excepcional : false;
  const meta = MOTIVOS.find((m) => m.key === motivo);

  const cambiarDia = (i: number, campo: keyof Dia, v: string) =>
    setDias((ds) => {
      const out = ds.map((d, j) => (j === i ? { ...d, [campo]: v } : d));
      // Al cargar el primer horario, los días siguientes sin horario toman el mismo.
      if (campo !== "fecha" && i === 0) for (const d of out) if (d !== out[0] && !d[campo]) d[campo] = v;
      return out;
    });

  const agregarRango = () => {
    if (!rango) return;
    if (!rango.desde || !rango.hasta || rango.hasta < rango.desde) return setError("Revisá las fechas del período.");
    const nuevos: Dia[] = [];
    for (let d = rango.desde; d <= rango.hasta && nuevos.length < 62; d = sumarDias(d, 1)) {
      if (rango.habiles && [0, 6].includes(diaSemana(d))) continue;
      nuevos.push({ fecha: d, desde: rango.hDesde, hasta: rango.hHasta });
    }
    setDias((ds) => {
      const previos = ds.filter((d) => d.fecha && !nuevos.some((n) => n.fecha === d.fecha));
      return [...previos, ...nuevos].sort((a, b) => a.fecha.localeCompare(b.fecha));
    });
    setRango(null);
    setError(null);
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pacientes === null) return setError("Indicá si hay pacientes agendados en el período.");
    if (hayColega === null) return setError("Indicá si hay un colega del servicio que pueda atender.");
    if (!motivo) return setError("Elegí el motivo.");
    if (!completos.length) return setError("Cargá al menos un día a cancelar.");
    if (!declaracion) return setError("Confirmá que los datos son correctos.");
    setEnviando(true);
    try {
      const t = await api<TramitePublico>("/api/publico/cancelaciones", {
        method: "POST",
        body: { prestador, matricula, dni, servicio, telefono, dias: completos, pacientesAgendados: pacientes, hayColega, colega, motivo, motivoDetalle, fechaReprogramacion: reprogramacion || null, justificacion, declaracion },
      });
      const d = dni.replace(/\D/g, "");
      guardar({ numero: t.numero, dni: d, at: new Date().toISOString() });
      onEnviado(t, d);
    } catch (err) {
      setError((err as Error).message);
      setEnviando(false);
    }
  };

  return (
    <form className="canp-card" onSubmit={(e) => void enviar(e)} noValidate={false}>
      <button type="button" className="canp-volver" onClick={onVolver}><ArrowLeft size={16} /> Volver</button>
      <h1 className="canp-h1">Pedido de cancelación de agenda</h1>
      <p className="canp-lead">Los campos con <span style={{ color: "#b91c1c" }}>*</span> son obligatorios.</p>

      <Bloque n={1} titulo="Datos del prestador y servicio">
        <div className="canp-grid">
          <Campo label="Nombre y apellido" req full>
            <input value={prestador} onChange={(e) => setPrestador(e.target.value)} required minLength={3} maxLength={120} autoComplete="name" />
          </Campo>
          <Campo label="Matrícula" req>
            <input value={matricula} onChange={(e) => setMatricula(e.target.value)} required maxLength={30} />
          </Campo>
          <Campo label="DNI" req hint="Solo números. Lo vas a usar para consultar el trámite.">
            <input value={dni} onChange={(e) => setDni(e.target.value.replace(/\D/g, "").slice(0, 9))} required inputMode="numeric" pattern="\d{6,9}" />
          </Campo>
          <Campo label="Servicio" req>
            <input value={servicio} onChange={(e) => setServicio(e.target.value)} required maxLength={120} list="canp-servicios" placeholder="Ej.: Cardiología" />
            <datalist id="canp-servicios">{reglas?.servicios.map((s) => <option key={s} value={s} />)}</datalist>
          </Campo>
          <Campo label="Teléfono de contacto" hint="Opcional, por si hay que consultarte algo.">
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} maxLength={40} inputMode="tel" autoComplete="tel" />
          </Campo>
        </div>
      </Bloque>

      <Bloque n={2} titulo="Días a cancelar">
        <div className="canp-dias">
          <div className="canp-dias-head" aria-hidden="true">
            <span>Fecha</span>
            <span>Desde</span>
            <span>Hasta</span>
            <span />
          </div>
          {dias.map((d, i) => (
            <div key={i} className="canp-dia">
              <input type="date" aria-label={`Fecha del día ${i + 1}`} value={d.fecha} min={hoy} onChange={(e) => cambiarDia(i, "fecha", e.target.value)} required={i === 0} />
              <input type="time" aria-label={`Horario desde del día ${i + 1}`} value={d.desde} onChange={(e) => cambiarDia(i, "desde", e.target.value)} required={Boolean(d.fecha)} />
              <input type="time" aria-label={`Horario hasta del día ${i + 1}`} value={d.hasta} onChange={(e) => cambiarDia(i, "hasta", e.target.value)} required={Boolean(d.fecha)} />
              <button type="button" className="canp-quitar" aria-label={`Quitar el día ${i + 1}`} disabled={dias.length === 1} onClick={() => setDias((ds) => ds.filter((_, j) => j !== i))}>
                <Trash2 size={16} />
              </button>
              {d.fecha && <span className="canp-dia-nombre">{fechaLarga(d.fecha)}</span>}
            </div>
          ))}
        </div>
        <div className="canp-acciones-dias">
          <button type="button" className="btn btn-quiet" onClick={() => setDias((ds) => [...ds, { fecha: "", desde: ds[ds.length - 1]?.desde ?? "", hasta: ds[ds.length - 1]?.hasta ?? "" }])} disabled={dias.length >= 62}>
            <Plus size={15} /> Agregar otro día
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setRango(rango ? null : { desde: "", hasta: "", hDesde: dias[0]?.desde ?? "", hHasta: dias[0]?.hasta ?? "", habiles: true })}>
            <CalendarRange size={15} /> Cargar un período (ej. vacaciones)
          </button>
        </div>
        {rango && (
          <div className="canp-rango">
            <div className="canp-grid">
              <Campo label="Desde el día">
                <input type="date" value={rango.desde} min={hoy} onChange={(e) => setRango({ ...rango, desde: e.target.value })} />
              </Campo>
              <Campo label="Hasta el día">
                <input type="date" value={rango.hasta} min={rango.desde || hoy} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} />
              </Campo>
              <Campo label="Horario desde">
                <input type="time" value={rango.hDesde} onChange={(e) => setRango({ ...rango, hDesde: e.target.value })} />
              </Campo>
              <Campo label="Horario hasta">
                <input type="time" value={rango.hHasta} onChange={(e) => setRango({ ...rango, hHasta: e.target.value })} />
              </Campo>
            </div>
            <label className="canp-check">
              <input type="checkbox" checked={rango.habiles} onChange={(e) => setRango({ ...rango, habiles: e.target.checked })} /> Solo de lunes a viernes
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button type="button" className="btn btn-quiet" onClick={() => setRango(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={agregarRango} disabled={!rango.desde || !rango.hasta || !rango.hDesde || !rango.hHasta}>
                Agregar los días
              </button>
            </div>
            <div className="field-hint">Después podés ajustar el horario de cada día o quitar los que no correspondan.</div>
          </div>
        )}
        {anticipacion && anticipacion.fecha === primera && (
          <div className={`canp-antic ${excepcional ? "excepcional" : "ok"}`} role="status">
            {excepcional ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
            <div>
              <strong>
                {anticipacion.habiles} día{anticipacion.habiles === 1 ? "" : "s"} hábil{anticipacion.habiles === 1 ? "" : "es"} de anticipación
              </strong>
              {excepcional ? (
                <>
                  {" "}— menos de {reglas?.anticipacionMinima ?? 15}: el pedido queda como <strong>excepcional</strong>.
                  {reglas && <div className="field-hint" style={{ color: "inherit", opacity: 0.85 }}>Para que no sea excepcional, el primer día tendría que ser a partir del {fechaAr(reglas.primerDiaSinExcepcion)}.</div>}
                </>
              ) : (
                <> — cumple con los 15 días hábiles.</>
              )}
            </div>
          </div>
        )}
        {excepcional && (
          <Campo label="¿Por qué se pide con menos de 15 días hábiles?" req full hint="Reemplaza al «Pedido de cancelación al reverso» de la planilla en papel.">
            <textarea value={justificacion} onChange={(e) => setJustificacion(e.target.value)} required minLength={10} maxLength={2000} rows={3} placeholder="Contá brevemente qué pasó y por qué es urgente." />
          </Campo>
        )}
      </Bloque>

      <Bloque n={3} titulo="Pacientes y reemplazo">
        <div className="canp-pregunta">
          <div>
            <div className="canp-preg-txt">¿Hay pacientes agendados en el período? <span style={{ color: "#b91c1c" }}>*</span></div>
            <div className="field-hint">Para informar a Central de Turnos.</div>
          </div>
          <SiNo value={pacientes} onChange={setPacientes} label="Pacientes agendados" />
        </div>
        <div className="canp-pregunta">
          <div>
            <div className="canp-preg-txt">¿Hay un colega del servicio que pueda atender? <span style={{ color: "#b91c1c" }}>*</span></div>
            <div className="field-hint">Para informar a Central de Turnos.</div>
          </div>
          <SiNo value={hayColega} onChange={setHayColega} label="Colega que puede atender" />
        </div>
        {hayColega && (
          <Campo label="¿Quién?" req full>
            <input value={colega} onChange={(e) => setColega(e.target.value)} required maxLength={120} placeholder="Nombre y apellido del colega" />
          </Campo>
        )}
      </Bloque>

      <Bloque n={4} titulo="Motivo de la reprogramación">
        <div role="radiogroup" aria-label="Motivo" className="canp-motivos">
          {MOTIVOS.map((m) => (
            <button key={m.key} type="button" role="radio" aria-checked={motivo === m.key} className={`canp-motivo${motivo === m.key ? " on" : ""}`} onClick={() => setMotivo(m.key)}>
              <span className="canp-radio" aria-hidden="true" />
              <span>
                <strong>{m.label}</strong>
                <span>{m.ayuda}</span>
              </span>
            </button>
          ))}
        </div>
        {meta?.constancia && (
          <div className="canp-nota" style={{ marginTop: 10 }}>
            <Info size={16} />
            <span>Presentá {meta.constancia} en <strong>Dirección Médica</strong> (en papel o por mail). Desde acá no se adjuntan archivos.</span>
          </div>
        )}
        {motivo && (
          <Campo label={motivo === "formacion" ? "¿Qué congreso o curso?" : "Detalle"} full hint="Opcional.">
            <textarea value={motivoDetalle} onChange={(e) => setMotivoDetalle(e.target.value)} maxLength={1000} rows={2} />
          </Campo>
        )}
      </Bloque>

      <Bloque n={5} titulo="Reprogramación">
        <div className="canp-grid">
          <Campo label="Fecha de reprogramación" hint="Opcional: cuándo podrías atender a los pacientes reprogramados.">
            <input type="date" value={reprogramacion} min={hoy} onChange={(e) => setReprogramacion(e.target.value)} />
          </Campo>
        </div>
      </Bloque>

      <label className="canp-check canp-declaro">
        <input type="checkbox" checked={declaracion} onChange={(e) => setDeclaracion(e.target.checked)} required />
        <span>Confirmo que los datos son correctos y que el pedido lo hago yo. <span className="field-hint">(Reemplaza la firma y sello del solicitante.)</span></span>
      </label>

      {error && <div className="form-error" role="alert">{error}</div>}
      <button type="submit" className="btn btn-primary canp-enviar" disabled={enviando || !reglas}>
        {enviando ? "Enviando…" : "Enviar solicitud"}
      </button>
    </form>
  );
}

function Enviado({ t, onVer, onOtra }: { t: TramitePublico; onVer: () => void; onOtra: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(t.numero);
      setCopiado(true);
    } catch {
      /* sin portapapeles (http): el número queda a la vista */
    }
  };
  return (
    <div className="canp-card" style={{ textAlign: "center" }}>
      <CheckCircle2 size={44} style={{ color: "#16803c", margin: "0 auto" }} />
      <h1 className="canp-h1" style={{ marginTop: 10 }}>¡Solicitud enviada!</h1>
      <p className="canp-lead">Tu número de trámite es:</p>
      <div className="canp-numero">{t.numero}</div>
      <button type="button" className="btn btn-quiet" onClick={() => void copiar()} style={{ margin: "6px auto 0" }}>
        {copiado ? <Check size={15} /> : <Copy size={15} />} {copiado ? "Copiado" : "Copiar número"}
      </button>
      <p className="canp-lead" style={{ marginTop: 16 }}>
        Anotalo o sacale una captura: con el número y tu DNI podés ver si fue aceptada. En este celular también queda guardado.
      </p>
      {t.excepcional && (
        <div className="canp-antic excepcional" style={{ textAlign: "left" }}>
          <AlertTriangle size={18} />
          <div>Quedó como <strong>excepcional</strong> ({t.anticipacionHabiles} días hábiles de anticipación). Dirección Médica lo va a analizar.</div>
        </div>
      )}
      {t.pideConstancia && (
        <div className="canp-nota" style={{ textAlign: "left" }}>
          <Info size={16} />
          <span>Recordá presentar {MOTIVOS.find((m) => m.key === t.motivo)?.constancia} en Dirección Médica.</span>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 16 }}>
        <button type="button" className="btn btn-primary" onClick={onVer}>Ver mi solicitud</button>
        <button type="button" className="btn btn-quiet" onClick={onOtra}>Hacer otro pedido</button>
      </div>
    </div>
  );
}

function EstadoPill({ estado, label }: { estado: TramitePublico["estado"]; label?: string }) {
  const m = ESTADO_META[estado];
  const st: CSSProperties = { background: m.bg, color: m.fg, border: `1px solid ${m.borde}`, borderRadius: 999, padding: "4px 12px", fontWeight: 700, fontSize: 14, display: "inline-block" };
  return <span style={st}>{label ?? m.label}</span>;
}

function Consultar({ numero0, dni0, onVolver }: { numero0?: string; dni0?: string; onVolver: () => void }) {
  const [numero, setNumero] = useState(numero0 ?? "");
  const [dni, setDni] = useState(dni0 ?? "");
  const [t, setT] = useState<TramitePublico | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const guardados = useMemo(leerGuardados, []);

  const buscar = async (n = numero, d = dni) => {
    setError(null);
    setCargando(true);
    try {
      const r = await api<TramitePublico>(`/api/publico/cancelaciones/${encodeURIComponent(n.trim())}?dni=${encodeURIComponent(d.replace(/\D/g, ""))}`);
      setT(r);
      guardar({ numero: r.numero, dni: d.replace(/\D/g, ""), at: new Date().toISOString() });
    } catch (err) {
      setT(null);
      setError((err as Error).message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (numero0 && dni0) void buscar(numero0, dni0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const anular = async () => {
    if (!t || !window.confirm(`¿Anular la solicitud ${t.numero}? Si después la necesitás, tendrás que hacer un pedido nuevo.`)) return;
    setAnulando(true);
    try {
      setT(await api<TramitePublico>(`/api/publico/cancelaciones/${t.numero}/anular`, { method: "POST", body: { dni } }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAnulando(false);
    }
  };

  return (
    <div className="canp-card">
      <button type="button" className="canp-volver" onClick={onVolver}><ArrowLeft size={16} /> Volver</button>
      <h1 className="canp-h1">Ver mi solicitud</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void buscar();
        }}
        className="canp-grid"
        style={{ alignItems: "end" }}
      >
        <Campo label="Número de trámite">
          <input value={numero} onChange={(e) => setNumero(e.target.value.toUpperCase())} required placeholder="CAN-0001" autoCapitalize="characters" />
        </Campo>
        <Campo label="DNI">
          <input value={dni} onChange={(e) => setDni(e.target.value.replace(/\D/g, "").slice(0, 9))} required inputMode="numeric" />
        </Campo>
        <button type="submit" className="btn btn-primary" disabled={cargando || !numero || !dni} style={{ gridColumn: "1 / -1" }}>
          {cargando ? "Buscando…" : "Consultar"}
        </button>
      </form>
      {!t && guardados.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="field-label" style={{ marginBottom: 6 }}>Pedidos hechos desde este celular</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {guardados.map((g) => (
              <button
                key={g.numero}
                type="button"
                className="btn btn-quiet"
                onClick={() => {
                  setNumero(g.numero);
                  setDni(g.dni);
                  void buscar(g.numero, g.dni);
                }}
              >
                {g.numero}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <div className="form-error" role="alert" style={{ marginTop: 12 }}>{error}</div>}
      {t && (
        <div className="canp-resultado">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div className="field-label">Trámite</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "ui-monospace, monospace" }}>{t.numero}</div>
            </div>
            <EstadoPill estado={t.estado} label={t.estadoLabel} />
          </div>
          <p className="canp-lead" style={{ margin: "10px 0 0" }}>
            {t.estado === "pendiente" && "Dirección Médica todavía no la revisó."}
            {t.estado === "en_analisis" && "Dirección Médica la recibió y la está analizando."}
            {t.estado === "aceptada" && "Tu pedido fue aceptado. Central de Turnos va a cancelar la agenda en el sistema."}
            {t.estado === "agenda_cancelada" && "Tu pedido fue aceptado y Central de Turnos ya canceló la agenda."}
            {t.estado === "rechazada" && "Tu pedido no fue aceptado."}
            {t.estado === "anulada" && "Anulaste esta solicitud."}
          </p>
          {t.respuesta && (
            <div className={`canp-antic ${t.estado === "rechazada" ? "excepcional" : "ok"}`}>
              <Info size={18} />
              <div>
                <strong>Respuesta de Dirección Médica:</strong> {t.respuesta}
              </div>
            </div>
          )}
          <dl className="canp-dl">
            <dt>Prestador</dt>
            <dd>{t.prestador} · {t.servicio}</dd>
            <dt>Motivo</dt>
            <dd>{t.motivoLabel}</dd>
            <dt>Días</dt>
            <dd>
              {t.dias.map((d, i) => (
                <div key={i}>{fechaLarga(d.fecha)} · {d.desde} a {d.hasta}</div>
              ))}
            </dd>
            {t.fechaReprogramacion && (
              <>
                <dt>Reprogramación</dt>
                <dd>{fechaAr(t.fechaReprogramacion)}</dd>
              </>
            )}
            <dt>Enviada</dt>
            <dd>{fechaHora(t.createdAt)}{t.excepcional ? ` · excepcional (${t.anticipacionHabiles} días hábiles)` : ""}</dd>
            {t.pideConstancia && (
              <>
                <dt>Constancia</dt>
                <dd>{t.constanciaRecibida ? "Recibida en Dirección Médica" : "Todavía no se recibió en Dirección Médica"}</dd>
              </>
            )}
          </dl>
          {(t.estado === "pendiente" || t.estado === "en_analisis") && (
            <button type="button" className="btn btn-quiet" onClick={() => void anular()} disabled={anulando} style={{ marginTop: 12 }}>
              {anulando ? "Anulando…" : "Ya no la necesito: anular solicitud"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
