import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, ArrowRightLeft, CheckCircle2, ClipboardCheck, FileUp, History, PencilLine, PlusCircle, Trash2, Wrench } from "lucide-react";
import { avisar, confirmar } from "@/components/feedback";
import { Campo, Modal, Pill, S, SegControl } from "../administracion/ui";
import {
  ESTADOS,
  FRECUENCIAS,
  RESULTADO,
  SITUACION,
  TIPO_REGISTRO,
  clave,
  estadoMeta,
  fechaAr,
  frecuenciaTexto,
  hoyIso,
  inv,
  situacion,
  textoProximo,
  type Catalogos,
  type DatosEquipo,
  type DatosRegistro,
  type Equipo,
  type EquipoDetalle,
  type Estado,
  type Registro,
} from "./api";

export type Permisos = { cargar: boolean; controlar: boolean; eliminar: boolean; importar: boolean; exportar: boolean; configurar: boolean };

export function EstadoPill({ estado }: { estado: string }) {
  const m = estadoMeta(estado);
  return <Pill style={{ background: m.bg, color: m.fg, borderColor: estado === "baja" ? "hsl(var(--border))" : "transparent", textDecoration: estado === "baja" ? "line-through" : undefined }}>{m.label}</Pill>;
}

export function ControlPill({ e, hoy }: { e: Pick<Equipo, "proximoControl" | "estado">; hoy: string }) {
  const s = situacion(e, hoy);
  if (s === "sin") return <span style={S.small}>{e.estado === "baja" ? "—" : "Sin control"}</span>;
  const m = SITUACION[s];
  return <Pill style={{ background: m.bg, color: m.fg }} title={m.label}>{textoProximo(e, hoy)}</Pill>;
}

/** Frecuencia de control: lista de las habituales o "cada N días". */
function SelectorFrecuencia({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const habitual = value === null || FRECUENCIAS.some((f) => f.dias === value);
  const [otra, setOtra] = useState(!habitual);
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <select
        className="select"
        value={otra ? "otra" : value ?? ""}
        onChange={(e) => {
          if (e.target.value === "otra") {
            setOtra(true);
            onChange(value ?? 30);
          } else {
            setOtra(false);
            onChange(e.target.value ? Number(e.target.value) : null);
          }
        }}
      >
        <option value="">Sin control periódico</option>
        {FRECUENCIAS.map((f) => <option key={f.dias} value={f.dias}>{f.label}</option>)}
        <option value="otra">Otra (en días)…</option>
      </select>
      {otra && <input className="input" type="number" min={1} max={3650} style={{ width: 100 }} value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} aria-label="Cada cuántos días" />}
    </div>
  );
}

// ---------- alta / edición ----------

export function EquipoForm({
  equipo,
  sectores,
  catalogos,
  onClose,
  onSaved,
}: {
  equipo?: Equipo;
  sectores: { id: number; name: string }[];
  catalogos: Catalogos | null;
  onClose: () => void;
  onSaved: (e: Equipo) => void;
}) {
  const [d, setD] = useState<DatosEquipo>(() =>
    equipo
      ? { planta: equipo.planta, sectorId: equipo.sectorId, rubro: equipo.rubro, tipo: equipo.tipo, descripcion: equipo.descripcion, marca: equipo.marca, codigoSerie: equipo.codigoSerie, frecuenciaDias: equipo.frecuenciaDias, observaciones: equipo.observaciones, estado: equipo.estado }
      : { planta: "", sectorId: sectores.length === 1 ? sectores[0].id : "", rubro: "", tipo: "", descripcion: "", marca: "", codigoSerie: "", frecuenciaDias: null, ultimoControl: "", observaciones: "" },
  );
  const [frecTocada, setFrecTocada] = useState(Boolean(equipo));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const planes = useMemo(() => new Map((catalogos?.planes ?? []).map((p) => [clave(p.tipo), p.frecuenciaDias])), [catalogos]);
  const set = (p: Partial<DatosEquipo>) => setD((x) => ({ ...x, ...p }));

  // Al elegir un tipo con plan de controles, se propone su frecuencia.
  useEffect(() => {
    if (frecTocada) return;
    const f = planes.get(clave(d.tipo));
    if (f) set({ frecuenciaDias: f });
  }, [d.tipo, planes, frecTocada]);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      const body = { ...d, ultimoControl: d.ultimoControl || null };
      const r = equipo ? await inv.editar(equipo.id, body) : await inv.crear(body);
      avisar(equipo ? "Equipo guardado." : "Equipo dado de alta.");
      onSaved(r);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  const lista = (id: string, vals?: { valor: string }[]) => (
    <datalist id={id}>
      {(vals ?? []).map((v) => <option key={v.valor} value={v.valor} />)}
    </datalist>
  );

  return (
    <Modal
      titulo={equipo ? `Editar equipo Nº ${equipo.id}` : "Nuevo equipo"}
      onClose={onClose}
      ancho={720}
      pie={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>Cancelar</button>
          <button type="submit" form="form-equipo" className="btn btn-primary" disabled={guardando}>{guardando ? "Guardando…" : equipo ? "Guardar cambios" : "Dar de alta"}</button>
        </>
      }
    >
      <form id="form-equipo" onSubmit={guardar} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        {error && <div className="form-error" style={{ gridColumn: "1 / -1" }}>{error}</div>}
        <Campo label="Planta *">
          <input className="input" required list="inv-plantas" value={d.planta} onChange={(e) => set({ planta: e.target.value })} placeholder="Ej.: Planta baja" />
          {lista("inv-plantas", catalogos?.plantas)}
        </Campo>
        <Campo label="Sector *">
          <select className="select" required value={d.sectorId} onChange={(e) => set({ sectorId: e.target.value ? Number(e.target.value) : "" })}>
            <option value="">Elegí…</option>
            {sectores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Campo>
        <Campo label="Rubro *">
          <input className="input" required list="inv-rubros" value={d.rubro} onChange={(e) => set({ rubro: e.target.value })} placeholder="Ej.: Electromedicina" />
          {lista("inv-rubros", catalogos?.rubros)}
        </Campo>
        <Campo label="Tipo *">
          <input className="input" required list="inv-tipos" value={d.tipo} onChange={(e) => set({ tipo: e.target.value })} placeholder="Ej.: Monitor multiparamétrico" />
          {lista("inv-tipos", catalogos?.tipos)}
        </Campo>
        <Campo label="Descripción *" full>
          <input className="input" required maxLength={300} value={d.descripcion} onChange={(e) => set({ descripcion: e.target.value })} placeholder="Qué es: modelo, detalle" />
        </Campo>
        <Campo label="Marca">
          <input className="input" maxLength={80} value={d.marca} onChange={(e) => set({ marca: e.target.value })} />
        </Campo>
        <Campo label="Código de serie" hint="Si está, no se puede repetir.">
          <input className="input" maxLength={80} value={d.codigoSerie} onChange={(e) => set({ codigoSerie: e.target.value })} style={{ fontFamily: "monospace" }} />
        </Campo>
        <Campo label="Control periódico" hint={planes.get(clave(d.tipo)) ? `El plan de «${d.tipo}» es ${frecuenciaTexto(planes.get(clave(d.tipo))).toLowerCase()}.` : "Cada cuánto se revisa este equipo."}>
          <SelectorFrecuencia
            value={d.frecuenciaDias}
            onChange={(v) => {
              setFrecTocada(true);
              set({ frecuenciaDias: v });
            }}
          />
        </Campo>
        {!equipo ? (
          <Campo label="Último control (opcional)" hint="Si no lo sabés, el próximo control se cuenta desde hoy.">
            <input className="input" type="date" max={hoyIso()} value={d.ultimoControl ?? ""} onChange={(e) => set({ ultimoControl: e.target.value })} />
          </Campo>
        ) : (
          <Campo label="Estado" hint="Para fallas y reparaciones conviene registrarlas (quedan en la historia).">
            <select className="select" value={d.estado} onChange={(e) => set({ estado: e.target.value as Estado })}>
              {ESTADOS.filter((x) => x.value !== "baja").map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
          </Campo>
        )}
        <Campo label="Observaciones" full>
          <textarea className="input" rows={2} maxLength={1000} value={d.observaciones} onChange={(e) => set({ observaciones: e.target.value })} />
        </Campo>
      </form>
    </Modal>
  );
}

// ---------- control / falla / reparación ----------

export function RegistroForm({
  equipos,
  tipoInicial,
  responsable,
  onClose,
  onSaved,
}: {
  equipos: Equipo[];
  tipoInicial: DatosRegistro["tipo"];
  responsable: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState<DatosRegistro>({ tipo: tipoInicial, fecha: hoyIso(), resultado: "ok", detalle: "", responsable, estado: "" });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const uno = equipos.length === 1 ? equipos[0] : null;
  const conFalla = d.tipo === "falla" || (d.tipo === "control" && d.resultado === "falla");

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      const body = { ...d, resultado: d.tipo === "control" ? d.resultado : undefined, estado: d.estado || undefined };
      if (uno) await inv.registrar(uno.id, body);
      else {
        const r = await inv.registrarLote(equipos.map((x) => x.id), body);
        avisar(`${r.registrados} equipo${r.registrados === 1 ? "" : "s"} registrado${r.registrados === 1 ? "" : "s"}${r.omitidos.length ? ` · ${r.omitidos.length} omitido${r.omitidos.length === 1 ? "" : "s"} (de baja o de sectores que no tenés a cargo)` : ""}.`);
      }
      if (uno) avisar(d.tipo === "control" ? "Control registrado." : d.tipo === "falla" ? "Falla registrada." : "Reparación registrada.");
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  const titulo = d.tipo === "control" ? "Registrar control" : d.tipo === "falla" ? "Reportar falla" : "Registrar reparación";
  return (
    <Modal
      titulo={uno ? `${titulo} · Nº ${uno.id}` : `${titulo} · ${equipos.length} equipos`}
      onClose={onClose}
      ancho={600}
      pie={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>Cancelar</button>
          <button type="submit" form="form-registro" className="btn btn-primary" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button>
        </>
      }
    >
      <form id="form-registro" onSubmit={guardar} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {uno ? (
          <div style={{ ...S.small, fontSize: 13 }}>
            <strong style={{ color: "hsl(var(--foreground))" }}>{uno.descripcion}</strong> · {uno.sectorName} · {uno.planta}
            {uno.codigoSerie && <> · Serie {uno.codigoSerie}</>}
          </div>
        ) : (
          <div style={{ ...S.small, fontSize: 13 }}>Se registra lo mismo para los {equipos.length} equipos elegidos.</div>
        )}
        {error && <div className="form-error">{error}</div>}
        <SegControl
          label="Qué registrás"
          value={d.tipo}
          onChange={(tipo) => setD({ ...d, tipo, estado: "" })}
          opciones={[
            { value: "control", label: "Control" },
            { value: "falla", label: "Falla" },
            { value: "reparacion", label: "Reparación" },
          ]}
        />
        <div style={S.grid2}>
          <Campo label="Fecha">
            <input className="input" type="date" required max={hoyIso()} value={d.fecha} onChange={(e) => setD({ ...d, fecha: e.target.value })} />
          </Campo>
          <Campo label="Responsable / técnico">
            <input className="input" maxLength={120} value={d.responsable} onChange={(e) => setD({ ...d, responsable: e.target.value })} placeholder="Quién lo hizo" />
          </Campo>
        </div>
        {d.tipo === "control" && (
          <Campo label="Resultado">
            <SegControl
              label="Resultado del control"
              value={d.resultado ?? "ok"}
              onChange={(resultado) => setD({ ...d, resultado })}
              opciones={[
                { value: "ok", label: <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><CheckCircle2 size={14} /> OK</span> },
                { value: "observacion", label: "Con observaciones" },
                { value: "falla", label: <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><AlertTriangle size={14} /> Con falla</span> },
              ]}
            />
          </Campo>
        )}
        <Campo label={conFalla ? "¿Qué falla? *" : d.tipo === "reparacion" ? "Qué se hizo" : "Detalle (opcional)"}>
          <textarea className="input" rows={3} required={conFalla} maxLength={2000} value={d.detalle} onChange={(e) => setD({ ...d, detalle: e.target.value })} placeholder={conFalla ? "Ej.: no enciende, alarma de batería…" : d.tipo === "reparacion" ? "Ej.: cambio de batería, service externo…" : ""} />
        </Campo>
        <Campo label="Estado en que queda" hint={d.tipo === "reparacion" ? "Por defecto vuelve a Operativo." : conFalla ? "Por defecto queda Con falla." : "Por defecto no cambia."}>
          <select className="select" value={d.estado ?? ""} onChange={(e) => setD({ ...d, estado: e.target.value as Estado | "" })}>
            <option value="">Automático</option>
            {ESTADOS.filter((x) => x.value !== "baja").map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
        </Campo>
        {d.tipo === "control" && uno?.frecuenciaDias && <div style={S.small}>El próximo control queda para dentro de {uno.frecuenciaDias} días desde la fecha del control.</div>}
      </form>
    </Modal>
  );
}

// ---------- cambios en varios equipos ----------

type CampoLote = "frecuenciaDias" | "estado" | "planta" | "sectorId" | "rubro" | "tipo";

export function LoteForm({ equipos, sectores, catalogos, onClose, onSaved }: { equipos: Equipo[]; sectores: { id: number; name: string }[]; catalogos: Catalogos | null; onClose: () => void; onSaved: () => void }) {
  const [campo, setCampo] = useState<CampoLote>("frecuenciaDias");
  const [valor, setValor] = useState<string | number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (campo !== "frecuenciaDias" && (valor === null || valor === "")) {
      setError("Elegí el valor nuevo.");
      return;
    }
    setGuardando(true);
    try {
      const r = await inv.lote(equipos.map((x) => x.id), { [campo]: campo === "sectorId" ? Number(valor) : valor } as Partial<DatosEquipo>);
      avisar(`${r.actualizados} equipo${r.actualizados === 1 ? "" : "s"} actualizado${r.actualizados === 1 ? "" : "s"}${r.omitidos.length ? ` · ${r.omitidos.length} sin permiso` : ""}.`);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  };
  const lista = campo === "planta" ? catalogos?.plantas : campo === "rubro" ? catalogos?.rubros : campo === "tipo" ? catalogos?.tipos : undefined;
  return (
    <Modal
      titulo={`Cambiar en ${equipos.length} equipos`}
      onClose={onClose}
      ancho={520}
      pie={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>Cancelar</button>
          <button type="submit" form="form-lote" className="btn btn-primary" disabled={guardando}>{guardando ? "Guardando…" : "Aplicar"}</button>
        </>
      }
    >
      <form id="form-lote" onSubmit={guardar} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error && <div className="form-error">{error}</div>}
        <Campo label="Qué cambiar">
          <select
            className="select"
            value={campo}
            onChange={(e) => {
              setCampo(e.target.value as CampoLote);
              setValor(null);
            }}
          >
            <option value="frecuenciaDias">Control periódico</option>
            <option value="estado">Estado</option>
            <option value="sectorId">Sector (traslado)</option>
            <option value="planta">Planta</option>
            <option value="rubro">Rubro</option>
            <option value="tipo">Tipo</option>
          </select>
        </Campo>
        <Campo label="Valor nuevo">
          {campo === "frecuenciaDias" ? (
            <SelectorFrecuencia value={(valor as number | null) ?? null} onChange={setValor} />
          ) : campo === "estado" ? (
            <select className="select" value={(valor as string) ?? ""} onChange={(e) => setValor(e.target.value)}>
              <option value="">Elegí…</option>
              {ESTADOS.filter((x) => x.value !== "baja").map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
          ) : campo === "sectorId" ? (
            <select className="select" value={(valor as string) ?? ""} onChange={(e) => setValor(e.target.value)}>
              <option value="">Elegí…</option>
              {sectores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ) : (
            <>
              <input className="input" list="inv-lote-lista" value={(valor as string) ?? ""} onChange={(e) => setValor(e.target.value)} />
              <datalist id="inv-lote-lista">{(lista ?? []).map((v) => <option key={v.valor} value={v.valor} />)}</datalist>
            </>
          )}
        </Campo>
        <div style={S.small}>Cada cambio queda en la historia de cada equipo.</div>
      </form>
    </Modal>
  );
}

// ---------- detalle del equipo ----------

const ICONO_REGISTRO: Record<string, typeof History> = {
  control: ClipboardCheck,
  falla: AlertTriangle,
  reparacion: Wrench,
  traslado: ArrowRightLeft,
  alta: PlusCircle,
  importacion: FileUp,
  cambio: PencilLine,
  baja: Trash2,
};

function colorRegistro(r: Registro): string {
  if (r.tipo === "falla" || r.resultado === "falla") return "#b91c1c";
  if (r.tipo === "control") return r.resultado === "observacion" ? "#b45309" : "#15803d";
  if (r.tipo === "reparacion") return "#1d4ed8";
  if (r.tipo === "baja") return "#6b7280";
  return "hsl(var(--muted-foreground))";
}

export function EquipoDetalleModal({
  id,
  permisos,
  puedeEscribir,
  onClose,
  onEditar,
  onRegistrar,
  onChanged,
}: {
  id: number;
  permisos: Permisos;
  puedeEscribir: (sectorId: number) => boolean;
  onClose: () => void;
  onEditar: (e: Equipo) => void;
  onRegistrar: (e: Equipo, tipo: DatosRegistro["tipo"]) => void;
  onChanged: () => void;
}) {
  const [e, setE] = useState<EquipoDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hoy = hoyIso();
  const cargar = () =>
    inv
      .item(id)
      .then(setE)
      .catch((err) => setError((err as Error).message));
  useEffect(() => {
    void cargar();
  }, [id]);

  const escribe = e ? puedeEscribir(e.sectorId) : false;
  const accion = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      avisar(ok);
      onChanged();
      await cargar();
    } catch (err) {
      avisar((err as Error).message, "error");
    }
  };
  const baja = async () => {
    if (!e) return;
    const motivo = window.prompt("Motivo de la baja (queda en la historia):", "");
    if (motivo === null) return;
    await accion(() => inv.baja(e.id, motivo), "Equipo dado de baja.");
  };
  const eliminar = async () => {
    if (!e) return;
    if (!(await confirmar({ titulo: `¿Eliminar el equipo Nº ${e.id}?`, mensaje: "Se borra con toda su historia. Si dejó de usarse, conviene «Dar de baja» (queda el registro).", accion: "Eliminar", peligro: true }))) return;
    try {
      await inv.eliminar(e.id);
      avisar("Equipo eliminado.");
      onChanged();
      onClose();
    } catch (err) {
      avisar((err as Error).message, "error");
    }
  };

  const ultimaFalla = e?.registros.find((r) => r.tipo === "falla" || r.resultado === "falla");
  const controles = e?.registros.filter((r) => r.tipo === "control").length ?? 0;
  const fallas = e?.registros.filter((r) => r.tipo === "falla" || r.resultado === "falla").length ?? 0;

  return (
    <Modal
      titulo={e ? `Equipo Nº ${e.id}` : "Equipo"}
      onClose={onClose}
      ancho={820}
      pie={
        e && escribe ? (
          <>
            {permisos.eliminar && (
              <>
                <button type="button" className="btn btn-quiet" style={{ marginRight: "auto", color: "#b91c1c" }} onClick={() => void eliminar()}>Eliminar</button>
                {e.estado === "baja" ? (
                  <button type="button" className="btn btn-quiet" onClick={() => void accion(() => inv.reactivar(e.id), "Equipo reactivado.")}>Reactivar</button>
                ) : (
                  <button type="button" className="btn btn-quiet" onClick={() => void baja()}>Dar de baja</button>
                )}
              </>
            )}
            {permisos.cargar && <button type="button" className="btn btn-quiet" onClick={() => onEditar(e)}>Editar</button>}
            {permisos.controlar && e.estado !== "baja" && (
              <>
                {(e.estado === "con_falla" || e.estado === "en_reparacion" || e.estado === "fuera_servicio") && (
                  <button type="button" className="btn btn-quiet" onClick={() => onRegistrar(e, "reparacion")}>Registrar reparación</button>
                )}
                <button type="button" className="btn btn-quiet" onClick={() => onRegistrar(e, "falla")}>Reportar falla</button>
                <button type="button" className="btn btn-primary" onClick={() => onRegistrar(e, "control")}>Registrar control</button>
              </>
            )}
          </>
        ) : undefined
      }
    >
      {error && <div className="form-error">{error}</div>}
      {!e ? (
        !error && <div className="skeleton" style={{ height: 260 }} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <EstadoPill estado={e.estado} />
              <ControlPill e={e} hoy={hoy} />
            </div>
            <h3 style={{ margin: "8px 0 2px", fontSize: 20, fontWeight: 700, lineHeight: 1.3 }}>{e.descripcion}</h3>
            <div style={S.small}>
              {[e.marca, e.codigoSerie && `Serie ${e.codigoSerie}`].filter(Boolean).join(" · ") || "Sin marca ni código de serie"}
            </div>
          </div>
          {ultimaFalla && (e.estado === "con_falla" || e.estado === "en_reparacion" || e.estado === "fuera_servicio") && (
            <div style={{ padding: "10px 12px", borderRadius: 10, background: "#fde2e2", color: "#8f1d1d", fontSize: 13 }}>
              <strong>Falla reportada el {fechaAr(ultimaFalla.fecha)}:</strong> {ultimaFalla.detalle || "sin detalle"}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12 }}>
            {[
              ["Planta", e.planta],
              ["Sector", e.sectorName ?? "—"],
              ["Rubro", e.rubro],
              ["Tipo", e.tipo],
              ["Control", frecuenciaTexto(e.frecuenciaDias)],
              ["Último control", fechaAr(e.ultimoControl)],
              ["Próximo control", textoProximo(e, hoy)],
              ["Historial", `${controles} control${controles === 1 ? "" : "es"} · ${fallas} falla${fallas === 1 ? "" : "s"}`],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={S.label}>{k}</div>
                <div style={{ fontSize: 14, marginTop: 2 }}>{v || "—"}</div>
              </div>
            ))}
          </div>
          {e.observaciones && (
            <div>
              <div style={S.label}>Observaciones</div>
              <div style={{ fontSize: 13.5, marginTop: 2, whiteSpace: "pre-wrap" }}>{e.observaciones}</div>
            </div>
          )}
          <div>
            <div style={{ ...S.label, marginBottom: 8 }}>Historia del equipo</div>
            {e.registros.length === 0 ? (
              <div style={S.small}>Sin registros.</div>
            ) : (
              <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
                {e.registros.map((r) => {
                  const Ico = ICONO_REGISTRO[r.tipo] ?? History;
                  const color = colorRegistro(r);
                  return (
                    <li key={r.id} style={{ display: "grid", gridTemplateColumns: "28px minmax(0, 1fr)", gap: 10, padding: "8px 0", borderTop: "1px solid hsl(var(--border))" }}>
                      <span style={{ width: 28, height: 28, borderRadius: 8, display: "grid", placeItems: "center", background: `${color}1a`, color }} aria-hidden="true">
                        <Ico size={15} />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                          <strong style={{ fontSize: 13.5 }}>{TIPO_REGISTRO[r.tipo] ?? r.tipo}{r.resultado ? ` · ${RESULTADO[r.resultado] ?? r.resultado}` : ""}</strong>
                          <span style={S.small}>{fechaAr(r.fecha)}{r.responsable ? ` · ${r.responsable}` : ""}{r.userNombre && r.userNombre !== r.responsable ? ` · cargó ${r.userNombre}` : ""}</span>
                          {r.estadoNuevo && <EstadoPill estado={r.estadoNuevo} />}
                        </div>
                        {r.detalle && <div style={{ fontSize: 13, marginTop: 2, whiteSpace: "pre-wrap" }}>{r.detalle}</div>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
