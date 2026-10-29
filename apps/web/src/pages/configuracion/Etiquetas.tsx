import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { avisar, confirmar } from "@/components/feedback";
import { Modal } from "../administracion/ui";
import { TAG_COLORS, TagBadge, type Etiqueta } from "../guardias/compartido";
import { api } from "./api";
import type { Datos, Nav } from "./Configuracion";
import { Cabecera, Chip, MUTED, Vacio } from "./ui";

// Etiquetas que se eligen al cargar una guardia (ej. GUARDIA EXTRA, REEMPLAZO).

type Props = { datos: Datos; recargar: () => Promise<void>; nav: Nav };

export function Etiquetas({ datos, recargar }: Props) {
  const { etiquetas } = datos;
  const [editor, setEditor] = useState<{ etiqueta?: Etiqueta } | null>(null);
  const [f, setF] = useState({ nombre: "", color: TAG_COLORS[0] });
  const [error, setError] = useState<string | null>(null);

  const abrir = (et?: Etiqueta) => {
    setF(et ? { nombre: et.nombre, color: et.color } : { nombre: "", color: TAG_COLORS[(etiquetas.length + 1) % TAG_COLORS.length] });
    setError(null);
    setEditor({ etiqueta: et });
  };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (!editor) return;
    setError(null);
    try {
      const body = { nombre: f.nombre.trim(), color: f.color };
      if (editor.etiqueta) {
        const r = await api<{ guardiasActualizadas?: number }>(`/guardias/etiquetas/${editor.etiqueta.id}`, { method: "PATCH", body });
        const n = r?.guardiasActualizadas ?? 0;
        avisar(n ? `Etiqueta guardada. Se actualizaron ${n} guardia${n === 1 ? "" : "s"} que la usaban.` : "Etiqueta guardada.");
      } else {
        await api("/guardias/etiquetas", { method: "POST", body });
        avisar("Etiqueta creada: ya se puede elegir al cargar guardias.");
      }
      setEditor(null);
      await recargar();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const activar = async (et: Etiqueta) => {
    try {
      await api(`/guardias/etiquetas/${et.id}`, { method: "PATCH", body: { activa: !et.activa } });
      avisar(et.activa ? `«${et.nombre}» desactivada: ya no aparece al cargar guardias.` : `«${et.nombre}» activada.`);
      setEditor(null);
      await recargar();
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };

  const eliminar = async (et: Etiqueta) => {
    if (!(await confirmar({ titulo: `¿Eliminar la etiqueta ${et.nombre}?`, mensaje: "Solo se puede eliminar si ninguna guardia la usa.", accion: "Eliminar", peligro: true }))) return;
    try {
      await api(`/guardias/etiquetas/${et.id}`, { method: "DELETE" });
      avisar("Etiqueta eliminada.");
      setEditor(null);
      await recargar();
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };

  return (
    <>
      <Cabecera
        titulo="Etiquetas de Guardias"
        texto="Se eligen al cargar una guardia (ej. GUARDIA EXTRA, REEMPLAZO). Renombrar o cambiar el color actualiza todas las guardias que la usan; desactivarla la saca de la carga pero las guardias la conservan."
        acciones={<button type="button" className="btn btn-primary" onClick={() => abrir()}><Plus size={16} /> Nueva etiqueta</button>}
      />
      {etiquetas.length === 0 ? (
        <Vacio titulo="Todavía no hay etiquetas" />
      ) : (
        <div className="cfg-etiquetas">
          {etiquetas.map((et) => (
            <button key={et.id} type="button" className={`cfg-etiqueta${et.activa ? "" : " apagada"}`} onClick={() => abrir(et)}>
              <TagBadge label={et.nombre} color={et.color} />
              <span style={MUTED}>{et.usos} guardia{et.usos === 1 ? "" : "s"}</span>
              {!et.activa && <Chip bg="hsl(0 0% 90%)" fg="hsl(0 0% 35%)">Inactiva</Chip>}
            </button>
          ))}
        </div>
      )}
      {editor && (
        <Modal
          titulo={editor.etiqueta ? `Etiqueta ${editor.etiqueta.nombre}` : "Nueva etiqueta"}
          onClose={() => setEditor(null)}
          ancho={460}
          pie={
            <>
              {editor.etiqueta && (
                <>
                  <button type="button" className="btn btn-quiet" style={{ color: "#b91c1c" }} disabled={editor.etiqueta.usos > 0} title={editor.etiqueta.usos > 0 ? "Está en uso: desactivala en su lugar" : undefined} onClick={() => void eliminar(editor.etiqueta!)}>Eliminar</button>
                  <button type="button" className="btn btn-quiet" onClick={() => void activar(editor.etiqueta!)}>{editor.etiqueta.activa ? "Desactivar" : "Activar"}</button>
                </>
              )}
              <span style={{ flex: 1 }} />
              <button type="button" className="btn btn-quiet" onClick={() => setEditor(null)}>Cancelar</button>
              <button type="submit" form="cfg-etiqueta" className="btn btn-primary">Guardar</button>
            </>
          }
        >
          <form id="cfg-etiqueta" className="cfg-form" onSubmit={(e) => void guardar(e)}>
            {error && <div className="form-error">{error}</div>}
            <label><span className="field-label">Nombre</span><input required minLength={2} maxLength={30} value={f.nombre} placeholder="Ej.: GUARDIA EXTRA" onChange={(e) => setF({ ...f, nombre: e.target.value.toUpperCase() })} autoFocus /></label>
            <div>
              <div className="field-label" style={{ marginBottom: 6 }}>Color</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                {TAG_COLORS.map((c) => (
                  <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={f.color === c} onClick={() => setF({ ...f, color: c })} style={{ width: 30, height: 30, borderRadius: 9, background: c, cursor: "pointer", border: "none", boxShadow: f.color === c ? `0 0 0 2px hsl(var(--card)), 0 0 0 4px ${c}` : "inset 0 0 0 1px rgba(0,0,0,.08)" }} />
                ))}
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "hsl(var(--muted-foreground))", cursor: "pointer" }}>
                  <input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} style={{ width: 34, height: 30, border: "none", padding: 0, background: "transparent", cursor: "pointer" }} />
                  Otro
                </label>
              </div>
            </div>
            <div style={{ ...MUTED, display: "flex", alignItems: "center", gap: 8 }}>Vista previa: <TagBadge label={f.nombre.trim() || "ETIQUETA"} color={f.color} /></div>
            {editor.etiqueta && editor.etiqueta.usos > 0 && <div style={MUTED}>Los cambios se aplican también a las {editor.etiqueta.usos} guardias que ya la usan.</div>}
          </form>
        </Modal>
      )}
    </>
  );
}
