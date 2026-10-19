import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { avisar, confirmar } from "@/components/feedback";
import { adm } from "./api";
import { useAdm, useDatos } from "./contexto";
import { FRECUENCIAS, TIPOS, TIPO_META, describirRecurrente, fechaAR, formatMonto, parseMonto, type Recurrente, type Tipo } from "./logic";
import { Campo, Modal, Pill, S, TipoPill, Vacio } from "./ui";

const EJEMPLOS = ["Alquiler del depósito", "Factura de luz (EPEC)", "Agua (Aguas Cordobesas)", "Internet y telefonía", "Sueldos — fecha de pago", "Aportes sindicales (FATSA)", "Prepaga del personal", "Control de matafuegos", "Mantenimiento de ascensores"];

export default function Recurrentes() {
  const { permisos, refrescar } = useAdm();
  const { data, error } = useDatos(() => adm.recurrentes(), []);
  const [editando, setEditando] = useState<Partial<Recurrente> | null>(null);
  const hoy = new Date();
  const desdeDefault = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-10`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...S.row, justifyContent: "space-between" }}>
        <p style={{ ...S.small, margin: 0, maxWidth: 640 }}>
          Pagos y tareas que se repiten (servicios, alquileres, sueldos, controles). Se cargan una vez y el sistema crea solo cada vencimiento con dos meses de anticipación.
        </p>
        {permisos.recurrentes && <button type="button" className="btn btn-primary" onClick={() => setEditando({ tipo: "pago", frecuencia: "mensual", dia: 10, desde: desdeDefault, habiles: true, alertDays: 3, activo: true })}><Plus size={15} /> Nuevo recurrente</button>}
      </div>
      {error && <div className="form-error">{error}</div>}
      {data && data.length === 0 ? (
        <Vacio titulo="Todavía no hay vencimientos recurrentes" texto={`Ideas: ${EJEMPLOS.slice(0, 6).join(", ")}.`} />
      ) : (
        <div className="card" style={{ ...S.card, padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr>
                <th style={S.th}>Qué</th>
                <th style={S.th}>Cuándo</th>
                <th style={S.th}>Próxima</th>
                <th style={{ ...S.th, textAlign: "right" }}>Monto</th>
                <th style={S.th}>Responsable</th>
                <th style={S.th}><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((r) => {
                const n = parseMonto(r.monto);
                return (
                  <tr key={r.id} style={{ opacity: r.activo ? 1 : 0.55 }}>
                    <td style={S.td}>
                      <div style={{ fontWeight: 600 }}>{r.titulo}</div>
                      <div style={{ ...S.row, gap: 4, marginTop: 3 }}><TipoPill tipo={r.tipo} />{!r.activo && <Pill style={{ border: "1px solid hsl(var(--border))" }}>Pausado</Pill>}</div>
                    </td>
                    <td style={S.td}>{describirRecurrente(r)}{r.hasta && <div style={S.small}>hasta {fechaAR(r.hasta)}</div>}</td>
                    <td style={{ ...S.td, whiteSpace: "nowrap" }}>{r.proxima ? fechaAR(r.proxima) : <span style={S.muted}>—</span>}</td>
                    <td style={{ ...S.td, textAlign: "right", whiteSpace: "nowrap" }}>{r.monto ? (Number.isFinite(n) ? formatMonto(n) : r.monto) : ""}</td>
                    <td style={S.td}>{r.responsable}</td>
                    <td style={{ ...S.td, textAlign: "right" }}>{permisos.recurrentes && <button type="button" className="btn btn-quiet btn-icon" aria-label={`Editar ${r.titulo}`} onClick={() => setEditando(r)}><Pencil size={15} /></button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editando && <RecurrenteForm r={editando} puedeBorrar={permisos.eliminar} onClose={() => setEditando(null)} onSaved={() => { setEditando(null); refrescar(); }} />}
    </div>
  );
}

function RecurrenteForm({ r, puedeBorrar, onClose, onSaved }: { r: Partial<Recurrente>; puedeBorrar: boolean; onClose: () => void; onSaved: () => void }) {
  const { responsables } = useAdm();
  const [f, setF] = useState<Partial<Recurrente>>(r);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Recurrente>(k: K, v: Recurrente[K]) => setF((p) => ({ ...p, [k]: v }));

  async function guardar() {
    setSaving(true);
    setError(null);
    try {
      const body = { ...f, hasta: f.hasta || null };
      const res = r.id ? await adm.editarRecurrente(r.id, body) : await adm.crearRecurrente(body);
      avisar(`Guardado.${res.generados ? ` Se agendaron ${res.generados} fecha${res.generados === 1 ? "" : "s"}.` : ""}`);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  async function borrar() {
    if (!r.id || !(await confirmar({ titulo: `¿Eliminar «${r.titulo}»?`, mensaje: "Se borran las fechas pendientes que vienen. Lo ya cumplido queda en el historial. Si solo querés pausarlo, destildá «Activo».", accion: "Eliminar", peligro: true }))) return;
    try {
      await adm.borrarRecurrente(r.id);
      avisar("Eliminado.");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const preview = f.frecuencia && f.desde ? describirRecurrente({ frecuencia: f.frecuencia, dia: f.dia ?? 1, desde: f.desde, habiles: f.habiles ?? true }) : "";

  return (
    <Modal
      titulo={r.id ? "Editar recurrente" : "Nuevo recurrente"}
      onClose={onClose}
      ancho={600}
      pie={
        <>
          {r.id && puedeBorrar && <button type="button" className="btn btn-danger" style={{ marginRight: "auto" }} onClick={borrar}>Eliminar</button>}
          <button type="button" className="btn btn-quiet" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={guardar} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button>
        </>
      }
    >
      {error && <div className="form-error" role="alert">{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
        <Campo label="Qué es" full>
          <input className="input" list="adm-rec-ejemplos" value={f.titulo ?? ""} onChange={(e) => set("titulo", e.target.value)} placeholder="Ej.: Factura de luz (EPEC)" maxLength={300} />
          <datalist id="adm-rec-ejemplos">{EJEMPLOS.map((x) => <option key={x} value={x} />)}</datalist>
        </Campo>
        <Campo label="Tipo">
          <select className="select" value={f.tipo ?? "pago"} onChange={(e) => set("tipo", e.target.value as Tipo)}>
            {TIPOS.filter((t) => t.value !== "fiscal").map((t) => <option key={t.value} value={t.value}>{TIPO_META[t.value].label}</option>)}
          </select>
        </Campo>
        <Campo label="Frecuencia">
          <select className="select" value={f.frecuencia ?? "mensual"} onChange={(e) => set("frecuencia", e.target.value)}>
            {FRECUENCIAS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
        </Campo>
        {f.frecuencia !== "semanal" && (
          <Campo label="Día del mes">
            <input className="input" type="number" min={1} max={31} value={f.dia ?? 10} onChange={(e) => set("dia", Number(e.target.value))} />
          </Campo>
        )}
        <Campo label={f.frecuencia === "semanal" ? "Primer día" : "Desde"} hint={f.frecuencia === "anual" || f.frecuencia === "semestral" || f.frecuencia === "trimestral" || f.frecuencia === "bimestral" ? "El mes de esta fecha marca el ciclo." : undefined}>
          <input className="input" type="date" value={f.desde ?? ""} onChange={(e) => set("desde", e.target.value)} />
        </Campo>
        <Campo label="Hasta (opcional)">
          <input className="input" type="date" value={f.hasta ?? ""} onChange={(e) => set("hasta", e.target.value || null)} />
        </Campo>
        <Campo label="Monto habitual (opcional)">
          <input className="input" value={f.monto ?? ""} onChange={(e) => set("monto", e.target.value)} inputMode="decimal" maxLength={40} />
        </Campo>
        <Campo label="Responsable">
          <input className="input" list="adm-rec-resp" value={f.responsable ?? ""} onChange={(e) => set("responsable", e.target.value)} maxLength={120} />
          <datalist id="adm-rec-resp">{responsables.map((x) => <option key={x} value={x} />)}</datalist>
        </Campo>
        <Campo label="Avisar días antes">
          <input className="input" type="number" min={0} max={120} value={f.alertDays ?? 3} onChange={(e) => set("alertDays", Number(e.target.value))} />
        </Campo>
        <div style={{ gridColumn: "1 / -1", display: "flex", gap: 16, flexWrap: "wrap" }}>
          <label style={{ ...S.row, fontSize: 13.5 }}><input type="checkbox" checked={f.habiles ?? true} onChange={(e) => set("habiles", e.target.checked)} /> Si cae feriado o fin de semana, pasar al día hábil siguiente</label>
          <label style={{ ...S.row, fontSize: 13.5 }}><input type="checkbox" checked={f.activo ?? true} onChange={(e) => set("activo", e.target.checked)} /> Activo</label>
        </div>
        <Campo label="Notas" full><textarea className="textarea" rows={2} value={f.descripcion ?? ""} onChange={(e) => set("descripcion", e.target.value)} /></Campo>
        {preview && <div style={{ gridColumn: "1 / -1", fontSize: 13, padding: "8px 12px", borderRadius: 10, background: "hsl(var(--muted))" }}>📅 {preview}</div>}
        {r.id && <p style={{ ...S.small, gridColumn: "1 / -1", margin: 0 }}>Al guardar, las fechas pendientes que vienen se rehacen con estos datos. Lo pasado no cambia.</p>}
      </div>
    </Modal>
  );
}
