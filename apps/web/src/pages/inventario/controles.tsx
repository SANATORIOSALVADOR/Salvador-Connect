import { useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, Check, CheckCheck, ChevronLeft, ClipboardCheck, Eye, SkipForward, Truck, Wrench } from "lucide-react";
import { avisar } from "@/components/feedback";
import { Campo, Modal, S } from "../administracion/ui";
import {
  ESTADOS,
  hoyIso,
  inv,
  planDe,
  resultadoDe,
  type DatosRegistro,
  type Equipo,
  type Estado,
  type EstadoPunto,
  type Plan,
  type PuntoControl,
} from "./api";

// Controles del inventario: lista de verificación, registro (control / falla / envío / reparación) y ronda.

type Punto = { item: string; estado: EstadoPunto | null; nota: string };

const PUNTO: Record<EstadoPunto, { label: string; color: string; bg: string }> = {
  ok: { label: "OK", color: "#15803d", bg: "#dcf3dc" },
  obs: { label: "Observación", color: "#b45309", bg: "#fdf0d5" },
  falla: { label: "Falla", color: "#b91c1c", bg: "#fde2e2" },
};

const RES_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  ok: { label: "Resultado: OK", color: "#15803d", bg: "#dcf3dc" },
  observacion: { label: "Resultado: con observaciones", color: "#b45309", bg: "#fdf0d5" },
  falla: { label: "Resultado: con falla", color: "#b91c1c", bg: "#fde2e2" },
};

export const puntosDe = (plan?: Plan): Punto[] => (plan?.checklist ?? []).map((item) => ({ item, estado: null, nota: "" }));

/** Lista de verificación: cada punto OK / Observación / Falla (con nota si no está OK). */
export function ListaVerificacion({ puntos, onChange }: { puntos: Punto[]; onChange: (p: Punto[]) => void }) {
  const set = (i: number, patch: Partial<Punto>) => onChange(puntos.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const faltan = puntos.filter((p) => !p.estado).length;
  return (
    <div className="inv-check">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={S.label}>Lista de verificación · {puntos.length - faltan}/{puntos.length}</span>
        {faltan > 0 && (
          <button type="button" className="btn btn-quiet" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => onChange(puntos.map((p) => (p.estado ? p : { ...p, estado: "ok" })))}>
            <CheckCheck size={14} /> Marcar el resto OK
          </button>
        )}
      </div>
      {puntos.map((p, i) => (
        <div key={p.item} className={`inv-check-fila${p.estado ? ` es-${p.estado}` : ""}`}>
          <span className="inv-check-item">{p.item}</span>
          <div className="inv-check-btns" role="radiogroup" aria-label={p.item}>
            {(Object.keys(PUNTO) as EstadoPunto[]).map((e) => (
              <button
                key={e}
                type="button"
                role="radio"
                aria-checked={p.estado === e}
                onClick={() => set(i, { estado: e })}
                style={p.estado === e ? { background: PUNTO[e].bg, color: PUNTO[e].color, borderColor: PUNTO[e].color } : undefined}
              >
                {e === "ok" ? <Check size={13} /> : e === "falla" ? <AlertTriangle size={13} /> : <Eye size={13} />} {PUNTO[e].label}
              </button>
            ))}
          </div>
          {(p.estado === "obs" || p.estado === "falla") && (
            <input className="input inv-check-nota" placeholder={p.estado === "falla" ? "¿Qué falla?" : "Observación"} value={p.nota} maxLength={300} onChange={(ev) => set(i, { nota: ev.target.value })} />
          )}
        </div>
      ))}
    </div>
  );
}

function PillResultado({ r }: { r: string | null }) {
  if (!r) return <span style={S.small}>Marcá todos los puntos para ver el resultado.</span>;
  const m = RES_LABEL[r];
  return <span style={{ display: "inline-block", fontSize: 12.5, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: m.bg, color: m.color }}>{m.label}</span>;
}

const TIPOS: { value: DatosRegistro["tipo"]; label: string; icono: typeof Wrench }[] = [
  { value: "control", label: "Control", icono: ClipboardCheck },
  { value: "falla", label: "Falla", icono: AlertTriangle },
  { value: "envio", label: "Enviar a reparación", icono: Truck },
  { value: "reparacion", label: "Reparado", icono: Wrench },
];

// ---------- registro de un equipo (o el mismo control para varios) ----------

export function RegistroForm({
  equipos,
  planes,
  tipoInicial,
  responsable,
  onClose,
  onSaved,
}: {
  equipos: Equipo[];
  planes: Plan[];
  tipoInicial: DatosRegistro["tipo"];
  responsable: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const uno = equipos.length === 1 ? equipos[0] : null;
  // La lista de verificación se usa si todos los equipos son del mismo tipo y ese tipo tiene una.
  const plan = useMemo(() => {
    const tipos = new Set(equipos.map((e) => e.tipo.toLowerCase()));
    return tipos.size === 1 ? planDe(planes, equipos[0].tipo) : undefined;
  }, [equipos, planes]);
  const [tipo, setTipo] = useState<DatosRegistro["tipo"]>(tipoInicial);
  const [fecha, setFecha] = useState(hoyIso());
  const [resp, setResp] = useState(responsable);
  const [proveedor, setProveedor] = useState("");
  const [resultado, setResultado] = useState<"ok" | "observacion" | "falla">("ok");
  const [puntos, setPuntos] = useState<Punto[]>(() => puntosDe(plan));
  const [detalle, setDetalle] = useState("");
  const [estado, setEstado] = useState<Estado | "">("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const conLista = tipo === "control" && puntos.length > 0;
  const res = conLista ? resultadoDe(puntos) : resultado;
  const conFalla = tipo === "falla" || (tipo === "control" && res === "falla");

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (conLista && !res) {
      setError("Marcá todos los puntos de la lista de verificación.");
      return;
    }
    if (conFalla && !detalle.trim() && !(conLista && puntos.some((p) => p.estado === "falla"))) {
      setError("Contá cuál es la falla.");
      return;
    }
    const body: DatosRegistro = {
      tipo,
      fecha,
      detalle,
      responsable: resp,
      proveedor: tipo === "envio" || tipo === "reparacion" ? proveedor : undefined,
      resultado: tipo === "control" && !conLista ? resultado : undefined,
      checklist: conLista ? (puntos.map((p) => ({ item: p.item, estado: p.estado!, ...(p.nota.trim() ? { nota: p.nota.trim() } : {}) })) as PuntoControl[]) : undefined,
      estado: estado || undefined,
    };
    setGuardando(true);
    try {
      if (uno) {
        await inv.registrar(uno.id, body);
        avisar(tipo === "control" ? "Control registrado." : tipo === "falla" ? "Falla registrada." : tipo === "envio" ? "Envío a reparación registrado." : "Reparación registrada.");
      } else {
        const r = await inv.registrarLote(equipos.map((x) => x.id), body);
        avisar(`${r.registrados} equipo${r.registrados === 1 ? "" : "s"} registrado${r.registrados === 1 ? "" : "s"}${r.omitidos.length ? ` · ${r.omitidos.length} omitido${r.omitidos.length === 1 ? "" : "s"} (de baja o sin permiso)` : ""}.`);
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  const estadoAuto = tipo === "reparacion" ? "Operativo" : tipo === "envio" ? "En reparación" : conFalla ? "Con falla" : "sin cambios";

  return (
    <Modal
      titulo={uno ? `Registrar · Nº ${uno.id}` : `Registrar · ${equipos.length} equipos`}
      onClose={onClose}
      ancho={660}
      pie={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>Cancelar</button>
          <button type="submit" form="form-registro" className="btn btn-primary" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button>
        </>
      }
    >
      <form id="form-registro" onSubmit={guardar} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {uno ? (
          <div className="inv-reg-equipo">
            <strong>{uno.descripcion}</strong>
            <span style={S.small}>
              {uno.tipo} · {uno.sectorName} · {uno.planta}
              {uno.codigoSerie && <> · Serie {uno.codigoSerie}</>}
            </span>
          </div>
        ) : (
          <div style={{ ...S.small, fontSize: 13 }}>Se registra lo mismo para los {equipos.length} equipos elegidos.</div>
        )}
        {error && <div className="form-error">{error}</div>}
        <div className="inv-reg-tipos" role="radiogroup" aria-label="Qué registrás">
          {TIPOS.map((t) => {
            const Ico = t.icono;
            return (
              <button key={t.value} type="button" role="radio" aria-checked={tipo === t.value} className={tipo === t.value ? "is-on" : undefined} onClick={() => { setTipo(t.value); setEstado(""); }}>
                <Ico size={17} />
                {t.label}
              </button>
            );
          })}
        </div>
        <div style={S.grid2}>
          <Campo label="Fecha">
            <input className="input" type="date" required max={hoyIso()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
          <Campo label="Responsable / técnico">
            <input className="input" maxLength={120} value={resp} onChange={(e) => setResp(e.target.value)} placeholder="Quién lo hizo" />
          </Campo>
          {(tipo === "envio" || tipo === "reparacion") && (
            <Campo label="Proveedor / service" full>
              <input className="input" maxLength={120} value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Ej.: Service técnico, empresa externa" />
            </Campo>
          )}
        </div>

        {tipo === "control" &&
          (conLista ? (
            <ListaVerificacion puntos={puntos} onChange={setPuntos} />
          ) : (
            <Campo label="Resultado" hint={plan ? undefined : "Tip: en «Plan y catálogos» podés cargar la lista de puntos a revisar para este tipo de equipo."}>
              <div className="inv-check-btns grande">
                {(["ok", "observacion", "falla"] as const).map((r) => {
                  const k = r === "observacion" ? "obs" : r;
                  return (
                    <button key={r} type="button" aria-pressed={resultado === r} onClick={() => setResultado(r)} style={resultado === r ? { background: PUNTO[k].bg, color: PUNTO[k].color, borderColor: PUNTO[k].color } : undefined}>
                      {r === "ok" ? <Check size={14} /> : r === "falla" ? <AlertTriangle size={14} /> : <Eye size={14} />} {r === "ok" ? "OK" : r === "falla" ? "Con falla" : "Con observaciones"}
                    </button>
                  );
                })}
              </div>
            </Campo>
          ))}
        {conLista && <PillResultado r={res} />}

        <Campo
          label={
            tipo === "falla"
              ? "¿Qué falla? *"
              : tipo === "envio"
                ? "Motivo / qué se envía a revisar"
                : tipo === "reparacion"
                  ? "Qué se hizo"
                  : conFalla
                    ? "Detalle de la falla"
                    : "Observaciones (opcional)"
          }
        >
          <textarea
            className="input"
            rows={3}
            maxLength={2000}
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            placeholder={tipo === "falla" ? "Ej.: no enciende, alarma de batería…" : tipo === "reparacion" ? "Ej.: cambio de batería, calibración…" : tipo === "envio" ? "Ej.: no carga la batería; se lleva al service" : ""}
          />
        </Campo>
        <Campo label="Estado en que queda" hint={`Automático: ${estadoAuto}.`}>
          <select className="select" value={estado} onChange={(e) => setEstado(e.target.value as Estado | "")}>
            <option value="">Automático</option>
            {ESTADOS.filter((x) => x.value !== "baja").map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
        </Campo>
        {(tipo === "control" || tipo === "reparacion") && uno?.frecuenciaDias && (
          <div style={S.small}>El próximo control queda para dentro de {uno.frecuenciaDias} días desde esta fecha.</div>
        )}
      </form>
    </Modal>
  );
}

// ---------- ronda de control: equipo por equipo ----------

type ResultadoRonda = { id: number; descripcion: string; resultado: "ok" | "observacion" | "falla" | "salteado"; detalle: string };

export function RondaModal({ equipos, planes, responsable, onClose, onDone }: { equipos: Equipo[]; planes: Plan[]; responsable: string; onClose: () => void; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [hechos, setHechos] = useState<ResultadoRonda[]>([]);
  const [resp, setResp] = useState(responsable);
  const [puntos, setPuntos] = useState<Punto[]>(() => puntosDe(planDe(planes, equipos[0]?.tipo ?? "")));
  const [resultado, setResultado] = useState<"ok" | "observacion" | "falla" | null>(null);
  const [detalle, setDetalle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const e = equipos[i];
  const fin = i >= equipos.length;

  const ir = (n: number) => {
    setI(n);
    setPuntos(puntosDe(planDe(planes, equipos[n]?.tipo ?? "")));
    setResultado(null);
    setDetalle("");
    setError(null);
  };

  const res = puntos.length ? resultadoDe(puntos) : resultado;

  const guardar = async (rapido?: "ok") => {
    if (!e) return;
    const r = rapido ?? res;
    setError(null);
    if (!r) {
      setError(puntos.length ? "Marcá todos los puntos (o usá «Todo OK»)." : "Elegí el resultado.");
      return;
    }
    const lista = rapido === "ok" && puntos.length ? puntos.map((p) => ({ item: p.item, estado: "ok" as const })) : puntos.length ? puntos.map((p) => ({ item: p.item, estado: p.estado!, ...(p.nota.trim() ? { nota: p.nota.trim() } : {}) })) : undefined;
    if (r === "falla" && !detalle.trim() && !(lista && lista.some((p) => p.estado === "falla"))) {
      setError("Contá cuál es la falla.");
      return;
    }
    setGuardando(true);
    try {
      await inv.registrar(e.id, { tipo: "control", fecha: hoyIso(), responsable: resp, detalle, resultado: lista ? undefined : r, checklist: lista as PuntoControl[] | undefined });
      setHechos((h) => [...h.filter((x) => x.id !== e.id), { id: e.id, descripcion: e.descripcion, resultado: r, detalle }]);
      ir(i + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  const saltear = () => {
    if (!e) return;
    setHechos((h) => [...h.filter((x) => x.id !== e.id), { id: e.id, descripcion: e.descripcion, resultado: "salteado", detalle: "" }]);
    ir(i + 1);
  };

  const cuenta = (r: ResultadoRonda["resultado"]) => hechos.filter((h) => h.resultado === r).length;

  return (
    <Modal
      titulo={fin ? "Ronda terminada" : `Ronda de control · ${i + 1} de ${equipos.length}`}
      onClose={() => {
        if (hechos.length) onDone();
        onClose();
      }}
      ancho={680}
      pie={
        fin ? (
          <button type="button" className="btn btn-primary" onClick={() => { onDone(); onClose(); }}>Listo</button>
        ) : (
          <>
            {i > 0 && (
              <button type="button" className="btn btn-quiet" style={{ marginRight: "auto" }} onClick={() => ir(i - 1)}>
                <ChevronLeft size={15} /> Anterior
              </button>
            )}
            <button type="button" className="btn btn-quiet" onClick={saltear} disabled={guardando}>
              <SkipForward size={15} /> Saltear
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => void guardar("ok")} disabled={guardando}>
              <CheckCheck size={15} /> Todo OK
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void guardar()} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar y seguir"}
            </button>
          </>
        )
      }
    >
      <div className="inv-ronda-barra" aria-hidden="true">
        <i style={{ width: `${(Math.min(i, equipos.length) / equipos.length) * 100}%` }} />
      </div>
      {fin ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
            {(
              [
                ["OK", cuenta("ok"), "#15803d"],
                ["Con observaciones", cuenta("observacion"), "#b45309"],
                ["Con falla", cuenta("falla"), "#b91c1c"],
                ["Salteados", cuenta("salteado"), undefined],
              ] as const
            ).map(([k, v, c]) => (
              <div key={k} className="card" style={{ padding: "10px 12px", borderRadius: 12 }}>
                <div style={S.label}>{k}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: c }}>{v}</div>
              </div>
            ))}
          </div>
          {hechos.some((h) => h.resultado === "falla" || h.resultado === "observacion") && (
            <div>
              <div style={{ ...S.label, marginBottom: 6 }}>Para atender</div>
              {hechos
                .filter((h) => h.resultado === "falla" || h.resultado === "observacion")
                .map((h) => (
                  <div key={h.id} style={{ fontSize: 13, padding: "6px 0", borderTop: "1px solid hsl(var(--border))" }}>
                    <strong style={{ color: h.resultado === "falla" ? "#b91c1c" : "#b45309" }}>{h.resultado === "falla" ? "Falla" : "Observación"}</strong> · Nº {h.id} {h.descripcion}
                    {h.detalle && <span style={S.small}> — {h.detalle}</span>}
                  </div>
                ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="inv-reg-equipo">
            <span style={S.small}>Nº {e.id} · {e.tipo}</span>
            <strong style={{ fontSize: 17 }}>{e.descripcion}</strong>
            <span style={S.small}>
              {e.sectorName} · {e.planta}
              {e.marca && <> · {e.marca}</>}
              {e.codigoSerie && <> · Serie {e.codigoSerie}</>}
            </span>
          </div>
          {error && <div className="form-error">{error}</div>}
          {puntos.length ? (
            <ListaVerificacion puntos={puntos} onChange={setPuntos} />
          ) : (
            <div className="inv-check-btns grande">
              {(["ok", "observacion", "falla"] as const).map((r) => {
                const k = r === "observacion" ? "obs" : r;
                return (
                  <button key={r} type="button" aria-pressed={resultado === r} onClick={() => setResultado(r)} style={resultado === r ? { background: PUNTO[k].bg, color: PUNTO[k].color, borderColor: PUNTO[k].color } : undefined}>
                    {r === "ok" ? <Check size={14} /> : r === "falla" ? <AlertTriangle size={14} /> : <Eye size={14} />} {r === "ok" ? "OK" : r === "falla" ? "Con falla" : "Con observaciones"}
                  </button>
                );
              })}
            </div>
          )}
          {puntos.length > 0 && <PillResultado r={res} />}
          <Campo label={res === "falla" ? "Detalle de la falla" : "Observaciones (opcional)"}>
            <textarea className="input" rows={2} maxLength={2000} value={detalle} onChange={(ev) => setDetalle(ev.target.value)} />
          </Campo>
          <Campo label="Responsable de la ronda">
            <input className="input" maxLength={120} value={resp} onChange={(ev) => setResp(ev.target.value)} />
          </Campo>
        </div>
      )}
    </Modal>
  );
}

// ---------- cómo se controla un equipo (frecuencia + lista de verificación) ----------

/**
 * Se edita desde la ficha del equipo. La lista de verificación es la misma para todos los equipos del mismo tipo;
 * la frecuencia se puede aplicar solo a este equipo o a todos los de su tipo.
 */
export function ComoSeControlaModal({
  equipo,
  planes,
  mismoTipo,
  puedeLista,
  onClose,
  onSaved,
}: {
  equipo: Equipo;
  planes: Plan[];
  mismoTipo: number;
  puedeLista: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const plan = planDe(planes, equipo.tipo);
  const [dias, setDias] = useState<string>(String(equipo.frecuenciaDias ?? plan?.frecuenciaDias ?? ""));
  const [lista, setLista] = useState((plan?.checklist ?? []).join("\n"));
  const [todos, setTodos] = useState(mismoTipo > 1 && puedeLista);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const FRECS: [number, string][] = [[7, "Semanal"], [15, "Quincenal"], [30, "Mensual"], [60, "Bimestral"], [90, "Trimestral"], [120, "Cuatrimestral"], [180, "Semestral"], [365, "Anual"], [730, "Cada 2 años"]];

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      const f = dias ? Number(dias) : null;
      const puntos = lista.split("\n").map((x) => x.trim()).filter(Boolean);
      if (puedeLista) {
        // La lista siempre es del tipo; la frecuencia, del tipo solo si se eligió "todos".
        await inv.plan(equipo.tipo, todos ? f : (plan?.frecuenciaDias ?? null), todos ? "todos" : "ninguno", puntos);
      }
      if (!todos && f !== equipo.frecuenciaDias) await inv.editar(equipo.id, { frecuenciaDias: f });
      avisar(todos ? `Guardado para los ${mismoTipo} equipos de tipo «${equipo.tipo}».` : "Guardado.");
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      titulo="Cómo se controla"
      onClose={onClose}
      ancho={560}
      pie={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>Cancelar</button>
          <button type="submit" form="form-plan" className="btn btn-primary" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button>
        </>
      }
    >
      <form id="form-plan" onSubmit={guardar} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="inv-reg-equipo">
          <strong>{equipo.descripcion}</strong>
          <span style={S.small}>Tipo: {equipo.tipo}</span>
        </div>
        {error && <div className="form-error">{error}</div>}
        <Campo label="Cada cuánto se controla">
          <select className="select" value={dias} onChange={(e) => setDias(e.target.value)}>
            <option value="">Sin control periódico</option>
            {FRECS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}
            {dias && !FRECS.some(([d]) => String(d) === dias) && <option value={dias}>Cada {dias} días</option>}
          </select>
        </Campo>
        {puedeLista && (
          <Campo label="Qué se revisa (un punto por renglón)" hint={`La lista es la misma para todos los equipos de tipo «${equipo.tipo}». Vacía = el control se registra como OK / observaciones / falla.`}>
            <textarea className="input" rows={6} value={lista} onChange={(e) => setLista(e.target.value)} placeholder={"Ej.:\nEnciende y hace el autotest\nAlarmas funcionan\nCable y batería en buen estado"} />
          </Campo>
        )}
        {puedeLista && mismoTipo > 1 && (
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
            <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} style={{ marginTop: 2 }} />
            <span>
              Usar la misma frecuencia en los <strong>{mismoTipo} equipos</strong> de tipo «{equipo.tipo}»
              <span style={{ ...S.small, display: "block" }}>Y los equipos nuevos de este tipo la toman solos.</span>
            </span>
          </label>
        )}
      </form>
    </Modal>
  );
}
