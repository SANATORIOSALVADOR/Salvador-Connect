import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { avisar, confirmar } from "@/components/feedback";
import { adm } from "./api";
import {
  CATEGORIAS_DOC,
  ORGANISMOS,
  ORIGEN_FECHA,
  TIPOS,
  TIPO_META,
  addDays,
  fechaAR,
  hoyIso,
  type Datos,
  type Historial,
  type Item,
  type Subtarea,
  type Tipo,
} from "./logic";
import { Campo, Modal, OrigenPill, Pill, S, TipoPill, UrgenciaPill } from "./ui";

export type Permisos = { editar: boolean; total: boolean };

const AVISOS = [
  { v: 0, l: "El mismo día" },
  { v: 1, l: "1 día antes" },
  { v: 3, l: "3 días antes" },
  { v: 7, l: "1 semana antes" },
  { v: 15, l: "15 días antes" },
  { v: 30, l: "1 mes antes" },
  { v: 60, l: "2 meses antes" },
];

type Form = {
  tipo: Tipo;
  titulo: string;
  fecha: string;
  hora: string;
  responsable: string;
  monto: string;
  alertDays: number;
  prioridad: "baja" | "normal" | "alta";
  descripcion: string;
  datos: Datos;
};

function formDe(it: Partial<Item> | null, tipo: Tipo, fecha: string): Form {
  return {
    tipo: (it?.tipo as Tipo) ?? tipo,
    titulo: it?.titulo ?? "",
    fecha: it?.fecha ?? fecha,
    hora: it?.hora ?? "",
    responsable: it?.responsable ?? "",
    monto: it?.monto ?? "",
    alertDays: it?.alertDays ?? (tipo === "documento" ? 30 : tipo === "tarea" ? 1 : 3),
    prioridad: it?.prioridad ?? "normal",
    descripcion: it?.descripcion ?? "",
    datos: { ...(tipo === "cheque" ? { direccion: "emitido" as const } : {}), ...(tipo === "documento" ? { categoria: CATEGORIAS_DOC[0] } : {}), ...(it?.datos ?? {}) },
  };
}

/** Alta y edición de cualquier ítem (los campos cambian según el tipo). */
export function ItemForm({ item, tipoInicial = "recordatorio", fechaInicial, responsables, onClose, onSaved }: {
  item: Item | null;
  tipoInicial?: Tipo;
  fechaInicial?: string;
  responsables: string[];
  onClose: () => void;
  onSaved: (it: Item) => void;
}) {
  const [f, setF] = useState<Form>(() => formDe(item, item?.tipo ?? tipoInicial, fechaInicial ?? hoyIso()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const setDato = (k: string, v: unknown) => setF((p) => ({ ...p, datos: { ...p.datos, [k]: v } }));
  const generado = !!item?.obligacionId;
  const subtareas: Subtarea[] = Array.isArray(f.datos.subtareas) ? f.datos.subtareas : [];

  const cambiarTipo = (t: Tipo) =>
    setF((p) => ({
      ...p,
      tipo: t,
      datos: { ...p.datos, ...(t === "cheque" && !p.datos.direccion ? { direccion: "emitido" } : {}), ...(t === "documento" && !p.datos.categoria ? { categoria: CATEGORIAS_DOC[0] } : {}) },
      alertDays: item ? p.alertDays : t === "documento" ? 30 : t === "tarea" ? 1 : p.alertDays,
    }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.titulo.trim()) return setError("Poné un título.");
    if (!f.fecha) return setError("Elegí la fecha.");
    setSaving(true);
    try {
      const datos = { ...f.datos, subtareas: subtareas.filter((s) => s.texto.trim()) };
      if (f.tipo !== "tarea") delete datos.subtareas;
      const body = { ...f, titulo: f.titulo.trim(), datos };
      const saved = item ? await adm.editar(item.id, body) : await adm.crear(body);
      avisar(item ? "Cambios guardados." : "Creado.");
      onSaved(saved);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const tituloPh: Record<Tipo, string> = {
    fiscal: "Ej.: Plan de pagos ARCA — cuota 3",
    vencimiento: "Ej.: Vence factura de oxígeno",
    pago: "Ej.: Pago a proveedor de descartables",
    cheque: "Ej.: Cheque a Droguería del Sud",
    documento: "Ej.: Póliza de responsabilidad civil",
    tarea: "Ej.: Preparar documentación para la auditoría",
    recordatorio: "Ej.: Llamar al estudio contable",
  };

  return (
    <Modal
      titulo={item ? "Editar" : `Nuevo: ${TIPO_META[f.tipo].label.toLowerCase()}`}
      onClose={onClose}
      ancho={620}
      pie={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>Cancelar</button>
          <button type="submit" form="adm-item-form" className="btn btn-primary" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button>
        </>
      }
    >
      <form id="adm-item-form" onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        {error && <div className="form-error" role="alert" style={{ gridColumn: "1 / -1", margin: 0 }}>{error}</div>}
        {!generado && (
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 6, flexWrap: "wrap" }} role="group" aria-label="Tipo">
            {TIPOS.map((t) => (
              <button
                key={t.value}
                type="button"
                aria-pressed={f.tipo === t.value}
                onClick={() => cambiarTipo(t.value)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${f.tipo === t.value ? t.color : "hsl(var(--border))"}`, background: f.tipo === t.value ? "hsl(var(--muted))" : "transparent", color: "hsl(var(--foreground))" }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 2, background: t.color }} aria-hidden="true" />
                {t.label}
              </button>
            ))}
          </div>
        )}
        <Campo label="Título" full>
          <input className="input" value={f.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder={tituloPh[f.tipo]} maxLength={300} required />
        </Campo>
        <Campo label={f.tipo === "cheque" ? "Fecha de pago / cobro" : f.tipo === "documento" ? "Vence el" : f.tipo === "tarea" ? "Para el" : "Fecha"} hint={generado && item?.fecha !== f.fecha ? "Al cambiarla a mano, el calendario oficial ya no la actualiza." : undefined}>
          <input className="input" type="date" value={f.fecha} onChange={(e) => set("fecha", e.target.value)} required />
        </Campo>
        <Campo label="Hora (opcional)">
          <input className="input" type="time" value={f.hora} onChange={(e) => set("hora", e.target.value)} />
        </Campo>

        {f.tipo === "cheque" && (
          <>
            <Campo label="Cheque">
              <select className="select" value={f.datos.direccion ?? "emitido"} onChange={(e) => setDato("direccion", e.target.value)}>
                <option value="emitido">Emitido (a pagar)</option>
                <option value="recibido">Recibido (a cobrar)</option>
              </select>
            </Campo>
            <Campo label="Número">
              <input className="input" value={f.datos.numero ?? ""} onChange={(e) => setDato("numero", e.target.value)} inputMode="numeric" />
            </Campo>
            <Campo label="Banco">
              <input className="input" value={f.datos.banco ?? ""} onChange={(e) => setDato("banco", e.target.value)} />
            </Campo>
            <Campo label={f.datos.direccion === "recibido" ? "Librador (quién lo dio)" : "Beneficiario"}>
              <input className="input" value={f.datos.contraparte ?? ""} onChange={(e) => setDato("contraparte", e.target.value)} />
            </Campo>
            <label style={{ ...S.row, gridColumn: "1 / -1", fontSize: 13 }}>
              <input type="checkbox" checked={!!f.datos.echeq} onChange={(e) => setDato("echeq", e.target.checked)} /> Es e-cheq (cheque electrónico)
            </label>
          </>
        )}

        {f.tipo === "documento" && (
          <>
            <Campo label="Categoría">
              <select className="select" value={f.datos.categoria ?? CATEGORIAS_DOC[0]} onChange={(e) => setDato("categoria", e.target.value)}>
                {CATEGORIAS_DOC.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Campo>
            <Campo label="Entidad / proveedor">
              <input className="input" value={f.datos.entidad ?? ""} onChange={(e) => setDato("entidad", e.target.value)} placeholder="Aseguradora, organismo, empresa…" />
            </Campo>
            <Campo label="N° de póliza / contrato / expediente">
              <input className="input" value={f.datos.numero ?? ""} onChange={(e) => setDato("numero", e.target.value)} />
            </Campo>
          </>
        )}

        <Campo label="Responsable">
          <input className="input" list="adm-responsables" value={f.responsable} onChange={(e) => set("responsable", e.target.value)} placeholder="Quién se encarga" maxLength={120} />
          <datalist id="adm-responsables">{responsables.map((r) => <option key={r} value={r} />)}</datalist>
        </Campo>
        {f.tipo !== "tarea" && f.tipo !== "recordatorio" && (
          <Campo label="Monto (opcional)">
            <input className="input" value={f.monto} onChange={(e) => set("monto", e.target.value)} placeholder="Ej.: 1.250.000,50" inputMode="decimal" maxLength={40} />
          </Campo>
        )}
        <Campo label="Avisar">
          <select className="select" value={f.alertDays} onChange={(e) => set("alertDays", Number(e.target.value))}>
            {AVISOS.map((a) => <option key={a.v} value={a.v}>{a.l}</option>)}
            {!AVISOS.some((a) => a.v === f.alertDays) && <option value={f.alertDays}>{f.alertDays} días antes</option>}
          </select>
        </Campo>
        <Campo label="Prioridad">
          <select className="select" value={f.prioridad} onChange={(e) => set("prioridad", e.target.value as Form["prioridad"])}>
            <option value="baja">Baja</option>
            <option value="normal">Normal</option>
            <option value="alta">Alta</option>
          </select>
        </Campo>

        {f.tipo === "tarea" && (
          <div style={{ gridColumn: "1 / -1" }}>
            <div className="field-label" style={{ marginBottom: 6 }}>Pasos (opcional)</div>
            {subtareas.map((s, i) => (
              <div key={i} style={{ ...S.row, flexWrap: "nowrap", marginBottom: 6 }}>
                <input type="checkbox" checked={s.hecho} onChange={(e) => setDato("subtareas", subtareas.map((x, j) => (j === i ? { ...x, hecho: e.target.checked } : x)))} aria-label="Hecho" />
                <input className="input" value={s.texto} onChange={(e) => setDato("subtareas", subtareas.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} maxLength={200} />
                <button type="button" className="btn btn-quiet btn-icon" onClick={() => setDato("subtareas", subtareas.filter((_, j) => j !== i))} aria-label="Quitar paso"><Trash2 size={15} /></button>
              </div>
            ))}
            <button type="button" className="btn btn-quiet" style={{ fontSize: 12.5 }} onClick={() => setDato("subtareas", [...subtareas, { texto: "", hecho: false }])}><Plus size={14} /> Agregar paso</button>
          </div>
        )}

        <Campo label="Notas" full>
          <textarea className="textarea" rows={3} value={f.descripcion} onChange={(e) => set("descripcion", e.target.value)} maxLength={5000} />
        </Campo>
      </form>
    </Modal>
  );
}

/** Registrar que se cumplió (o un avance: presentada / pagada). */
export function CumplirModal({ item, onClose, onDone }: { item: Item; onClose: () => void; onDone: () => void }) {
  const fiscal = item.requierePresentacion || item.requierePago;
  const [fecha, setFecha] = useState(hoyIso());
  const [presentado, setPresentado] = useState(item.presentado || !item.requierePresentacion);
  const [pagado, setPagado] = useState(item.pagado || !item.requierePago);
  const [comprobante, setComprobante] = useState(item.comprobante);
  const [montoPagado, setMontoPagado] = useState(item.montoPagado || item.monto);
  const [nota, setNota] = useState(item.cumplimientoNota);
  const esDoc = item.tipo === "documento";
  const [renovar, setRenovar] = useState(esDoc);
  const [renovarFecha, setRenovarFecha] = useState(() => addDays(item.fecha, 365));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const completo = (!item.requierePresentacion || presentado) && (!item.requierePago || pagado);

  async function guardar() {
    setSaving(true);
    setError(null);
    try {
      const r = await adm.cumplir(item.id, { fecha, presentado, pagado, comprobante, montoPagado, nota, renovarFecha: renovar && completo ? renovarFecha : undefined });
      avisar(r.item.estado === "cumplido" ? (r.renovado ? `Cumplido. Próximo vencimiento: ${fechaAR(r.renovado.fecha)}.` : "Marcado como cumplido.") : "Avance registrado.");
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const etiquetaComp = item.tipo === "fiscal" ? "N° de VEP / constancia" : item.tipo === "cheque" ? "N° de operación / depósito" : "Comprobante / referencia";
  return (
    <Modal
      titulo={fiscal ? "Registrar presentación y pago" : item.tipo === "cheque" ? (item.datos?.direccion === "recibido" ? "Registrar cobro" : "Registrar débito") : item.tipo === "tarea" ? "Completar tarea" : "Marcar como cumplido"}
      onClose={onClose}
      ancho={520}
      pie={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={guardar} disabled={saving || (fiscal && !presentado && !pagado)}>
            {saving ? "Guardando…" : completo ? "Marcar cumplido" : "Guardar avance"}
          </button>
        </>
      }
    >
      <div style={{ fontWeight: 600, marginBottom: 12 }}>{item.titulo}</div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        {fiscal && (
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 16, flexWrap: "wrap" }}>
            {item.requierePresentacion && (
              <label style={{ ...S.row, fontSize: 14, fontWeight: 600 }}>
                <input type="checkbox" checked={presentado} onChange={(e) => setPresentado(e.target.checked)} /> Declaración presentada
              </label>
            )}
            {item.requierePago && (
              <label style={{ ...S.row, fontSize: 14, fontWeight: 600 }}>
                <input type="checkbox" checked={pagado} onChange={(e) => setPagado(e.target.checked)} /> Pagado
              </label>
            )}
          </div>
        )}
        <Campo label="Fecha">
          <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Campo>
        {item.tipo !== "tarea" && item.tipo !== "recordatorio" && (
          <>
            <Campo label={etiquetaComp}>
              <input className="input" value={comprobante} onChange={(e) => setComprobante(e.target.value)} maxLength={120} />
            </Campo>
            <Campo label="Monto pagado / cobrado">
              <input className="input" value={montoPagado} onChange={(e) => setMontoPagado(e.target.value)} inputMode="decimal" maxLength={40} />
            </Campo>
          </>
        )}
        <Campo label="Observación" full>
          <textarea className="textarea" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={2000} />
        </Campo>
        {esDoc && completo && (
          <div style={{ gridColumn: "1 / -1", padding: 12, borderRadius: 10, background: "hsl(var(--muted))" }}>
            <label style={{ ...S.row, fontSize: 13.5, fontWeight: 600 }}>
              <input type="checkbox" checked={renovar} onChange={(e) => setRenovar(e.target.checked)} /> Se renovó: agendar el próximo vencimiento
            </label>
            {renovar && (
              <div style={{ marginTop: 8, maxWidth: 220 }}>
                <input className="input" type="date" value={renovarFecha} onChange={(e) => setRenovarFecha(e.target.value)} aria-label="Próximo vencimiento" />
              </div>
            )}
          </div>
        )}
      </div>
      {fiscal && !completo && (presentado || pagado) && <p style={{ ...S.small, marginTop: 10 }}>Queda pendiente hasta que esté presentada y pagada.</p>}
    </Modal>
  );
}

/** Ficha completa de un ítem con acciones e historial. */
export function ItemDetalle({ id, permisos, hoy, onClose, onChanged, onEdit, onCumplir }: {
  id: number;
  permisos: Permisos;
  hoy: string;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (it: Item) => void;
  onCumplir: (it: Item) => void;
}) {
  const [it, setIt] = useState<(Item & { historial: Historial[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState("");

  const cargar = () => adm.item(id).then(setIt).catch((e) => setError((e as Error).message));
  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function accion(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      avisar(ok);
      onChanged();
      await cargar();
    } catch (err) {
      avisar((err as Error).message, "error");
    }
  }

  if (!it) {
    return (
      <Modal titulo="Detalle" onClose={onClose}>
        {error ? <div className="form-error">{error}</div> : <div style={S.muted}>Cargando…</div>}
      </Modal>
    );
  }

  const subtareas = Array.isArray(it.datos?.subtareas) ? it.datos.subtareas : [];
  const filas: [string, string][] = [
    ["Fecha", `${fechaAR(it.fecha)}${it.hora ? ` · ${it.hora} h` : ""}`],
    ["Responsable", it.responsable],
    ["Monto", it.monto ? `$ ${it.monto}` : ""],
    ["Obligación", it.obligacionNombre ? `${it.obligacionNombre}${it.organismo ? ` (${ORGANISMOS[it.organismo] ?? it.organismo})` : ""}` : ""],
    ["Cheque", it.tipo === "cheque" ? [it.datos?.direccion === "recibido" ? "Recibido" : "Emitido", it.datos?.echeq ? "e-cheq" : "", it.datos?.numero ? `N° ${it.datos.numero}` : "", it.datos?.banco].filter(Boolean).join(" · ") : ""],
    [it.datos?.direccion === "recibido" ? "Librador" : "Beneficiario", it.tipo === "cheque" ? String(it.datos?.contraparte ?? "") : ""],
    ["Categoría", it.tipo === "documento" ? String(it.datos?.categoria ?? "") : ""],
    ["Entidad", String(it.datos?.entidad ?? "")],
    ["Número", it.tipo === "documento" ? String(it.datos?.numero ?? "") : ""],
    ["Avisar", it.alertDays === 0 ? "El mismo día" : `${it.alertDays} días antes`],
    ["Repite", it.recurrenteId ? "Sí (vencimiento recurrente)" : ""],
  ].filter(([, v]) => v) as [string, string][];

  const puedeBorrar = permisos.total && !it.obligacionId;

  return (
    <Modal
      titulo={TIPO_META[it.tipo]?.label ?? "Detalle"}
      onClose={onClose}
      ancho={640}
      pie={
        permisos.editar ? (
          <>
            {puedeBorrar && (
              <button
                type="button"
                className="btn btn-danger"
                style={{ marginRight: "auto" }}
                onClick={async () => {
                  if (!(await confirmar({ titulo: "¿Eliminar definitivamente?", mensaje: it.recurrenteId ? "Es un vencimiento recurrente: se borra solo esta fecha." : "No se puede deshacer. Si solo no corresponde, usá Cancelar.", accion: "Eliminar", peligro: true }))) return;
                  try {
                    await adm.borrar(it.id);
                    avisar("Eliminado.");
                    onChanged();
                    onClose();
                  } catch (err) {
                    avisar((err as Error).message, "error");
                  }
                }}
              >
                Eliminar
              </button>
            )}
            {it.estado === "pendiente" && !cancelando && (
              <button type="button" className="btn btn-quiet" onClick={() => setCancelando(true)}>Cancelar ítem</button>
            )}
            {it.estado !== "pendiente" && (
              <button type="button" className="btn btn-quiet" onClick={() => accion(() => adm.reabrir(it.id), "Volvió a pendiente.")}>Reabrir</button>
            )}
            <button type="button" className="btn btn-quiet" onClick={() => onEdit(it)}>Editar</button>
            {it.estado === "pendiente" && (
              <button type="button" className="btn btn-primary" onClick={() => onCumplir(it)}>
                {it.requierePresentacion || it.requierePago ? "Registrar presentación / pago" : "Marcar cumplido"}
              </button>
            )}
          </>
        ) : undefined
      }
    >
      <div style={{ ...S.row, marginBottom: 8 }}>
        <TipoPill tipo={it.tipo} />
        <UrgenciaPill item={it} hoy={hoy} />
        {it.tipo === "fiscal" && it.fechaOrigen !== "manual" && <OrigenPill origen={it.fechaOrigen} />}
        {it.fechaOrigen === "manual" && it.obligacionId && <Pill style={{ border: "1px solid hsl(var(--border))" }} title={ORIGEN_FECHA.manual.title}>Fecha manual</Pill>}
        {it.prioridad === "alta" && <Pill style={{ background: "#fde2e2", color: "#8f1d1d" }}>Prioridad alta</Pill>}
      </div>
      <h3 style={{ margin: "0 0 12px", fontSize: 19, fontWeight: 700, lineHeight: 1.3 }}>{it.titulo}</h3>

      {cancelando && (
        <div style={{ padding: 12, borderRadius: 10, background: "hsl(var(--muted))", marginBottom: 12 }}>
          <Campo label="¿Por qué se cancela? (queda en el historial)">
            <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: no corresponde este mes" autoFocus />
          </Campo>
          <div style={{ ...S.row, marginTop: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-quiet" onClick={() => setCancelando(false)}>Volver</button>
            <button type="button" className="btn btn-primary" onClick={() => { setCancelando(false); void accion(() => adm.cancelar(it.id, motivo), "Cancelado."); }}>Confirmar cancelación</button>
          </div>
        </div>
      )}

      <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 14px", margin: 0, fontSize: 13.5 }}>
        {filas.map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <dt style={S.muted}>{k}</dt>
            <dd style={{ margin: 0, minWidth: 0, overflowWrap: "anywhere" }}>{v}</dd>
          </div>
        ))}
      </dl>
      {it.descripcion && <p style={{ whiteSpace: "pre-wrap", fontSize: 13.5, margin: "12px 0 0", padding: 12, borderRadius: 10, background: "hsl(var(--muted) / .6)" }}>{it.descripcion}</p>}

      {subtareas.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={S.label}>Pasos ({subtareas.filter((s) => s.hecho).length}/{subtareas.length})</div>
          {subtareas.map((s, i) => (
            <label key={i} style={{ ...S.row, flexWrap: "nowrap", marginTop: 6, fontSize: 13.5 }}>
              <input
                type="checkbox"
                checked={s.hecho}
                disabled={!permisos.editar}
                onChange={(e) => {
                  const nuevas = subtareas.map((x, j) => (j === i ? { ...x, hecho: e.target.checked } : x));
                  void accion(() => adm.editar(it.id, { datos: { ...it.datos, subtareas: nuevas } }), "Actualizado.");
                }}
              />
              <span style={{ textDecoration: s.hecho ? "line-through" : undefined, color: s.hecho ? "hsl(var(--muted-foreground))" : undefined }}>{s.texto}</span>
            </label>
          ))}
        </div>
      )}

      {(it.estado === "cumplido" || it.presentado || it.pagado) && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 10, border: "1px solid #a9dca9", background: "#effaef", color: "#155c15", fontSize: 13.5 }}>
          <strong>{it.estado === "cumplido" ? "Cumplido" : "Avance"}</strong>
          {it.cumplidoFecha && ` el ${fechaAR(it.cumplidoFecha)}`}
          {it.requierePresentacion && ` · ${it.presentado ? "presentado" : "sin presentar"}`}
          {it.requierePago && ` · ${it.pagado ? "pagado" : "sin pagar"}`}
          {it.comprobante && <div>Comprobante: {it.comprobante}</div>}
          {it.montoPagado && <div>Monto: $ {it.montoPagado}</div>}
          {it.cumplimientoNota && <div style={{ whiteSpace: "pre-wrap" }}>{it.cumplimientoNota}</div>}
        </div>
      )}

      {it.historial.length > 0 && (
        <details style={{ marginTop: 14 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Historial ({it.historial.length})</summary>
          <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "flex", flexDirection: "column", gap: 6 }}>
            {it.historial.map((hh) => (
              <li key={hh.id} style={{ fontSize: 12.5, borderLeft: "2px solid hsl(var(--border))", paddingLeft: 10 }}>
                <span style={S.muted}>{new Date(hh.createdAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })} · {hh.userName}</span>
                <div><strong style={{ textTransform: "capitalize" }}>{hh.accion}</strong>{hh.detalle ? ` — ${hh.detalle}` : ""}</div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Modal>
  );
}
