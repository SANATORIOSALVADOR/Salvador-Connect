import { useMemo, useState } from "react";
import { Mail, Pencil, Phone, Plus } from "lucide-react";
import { avisar, confirmar } from "@/components/feedback";
import { adm } from "./api";
import { useAdm, useDatos } from "./contexto";
import { clave, type Contacto } from "./logic";
import { Campo, Modal, S, Vacio } from "./ui";

const RUBROS = ["Estudio contable", "Banco", "Aseguradora", "Proveedor", "Servicio técnico", "Organismo público", "Obra social / prepaga", "Abogado", "Otro"];

export default function Contactos({ busquedaInicial }: { busquedaInicial: string }) {
  const { permisos, refrescar } = useAdm();
  const { data, error } = useDatos(() => adm.contactos(), []);
  const [q, setQ] = useState(busquedaInicial);
  const [editando, setEditando] = useState<Partial<Contacto> | null>(null);
  const lista = useMemo(() => {
    const k = clave(q.trim());
    return (data ?? []).filter((c) => !k || [c.nombre, c.rubro, c.persona, c.cuit, c.email, c.telefono].some((x) => clave(x).includes(k)));
  }, [data, q]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...S.row }}>
        <input className="input" style={{ flex: "1 1 220px", maxWidth: 340 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nombre, rubro, CUIT…" aria-label="Buscar contacto" />
        <span style={S.small}>{lista.length} contacto{lista.length === 1 ? "" : "s"}</span>
        {permisos.editar && <button type="button" className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setEditando({})}><Plus size={15} /> Nuevo contacto</button>}
      </div>
      {error && <div className="form-error">{error}</div>}
      {data && lista.length === 0 ? (
        <Vacio titulo={q ? "Sin resultados" : "La agenda está vacía"} texto="Guardá acá los teléfonos y mails que el área usa seguido: estudio contable, bancos, aseguradoras, proveedores, servicio técnico." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))", gap: 12 }}>
          {lista.map((c) => (
            <div key={c.id} className="card" style={{ ...S.card, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{c.nombre}</div>
                  <div style={S.small}>{[c.rubro, c.persona].filter(Boolean).join(" · ")}</div>
                </div>
                {permisos.editar && <button type="button" className="btn btn-quiet btn-icon" aria-label={`Editar ${c.nombre}`} onClick={() => setEditando(c)}><Pencil size={15} /></button>}
              </div>
              {c.telefono && <a href={`tel:${c.telefono.replace(/[^\d+]/g, "")}`} style={{ ...S.row, fontSize: 13.5, color: "inherit" }}><Phone size={14} aria-hidden="true" /> {c.telefono}</a>}
              {c.email && <a href={`mailto:${c.email}`} style={{ ...S.row, fontSize: 13.5, color: "inherit", overflowWrap: "anywhere" }}><Mail size={14} aria-hidden="true" /> {c.email}</a>}
              {c.cuit && <div style={S.small}>CUIT {c.cuit}</div>}
              {c.notas && <div style={{ ...S.small, whiteSpace: "pre-wrap" }}>{c.notas}</div>}
            </div>
          ))}
        </div>
      )}
      {editando && <ContactoForm c={editando} puedeBorrar={permisos.total} onClose={() => setEditando(null)} onSaved={() => { setEditando(null); refrescar(); }} />}
    </div>
  );
}

function ContactoForm({ c, puedeBorrar, onClose, onSaved }: { c: Partial<Contacto>; puedeBorrar: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<Contacto>>(c);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Contacto, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function guardar() {
    setError(null);
    try {
      if (c.id) await adm.editarContacto(c.id, f);
      else await adm.crearContacto(f);
      avisar("Contacto guardado.");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function borrar() {
    if (!c.id || !(await confirmar({ titulo: `¿Eliminar a «${c.nombre}»?`, accion: "Eliminar", peligro: true }))) return;
    try {
      await adm.borrarContacto(c.id);
      avisar("Eliminado.");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Modal
      titulo={c.id ? "Editar contacto" : "Nuevo contacto"}
      onClose={onClose}
      pie={
        <>
          {c.id && puedeBorrar && <button type="button" className="btn btn-danger" style={{ marginRight: "auto" }} onClick={borrar}>Eliminar</button>}
          <button type="button" className="btn btn-quiet" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={guardar}>Guardar</button>
        </>
      }
    >
      {error && <div className="form-error" role="alert">{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <Campo label="Nombre / empresa" full><input className="input" value={f.nombre ?? ""} onChange={(e) => set("nombre", e.target.value)} maxLength={160} /></Campo>
        <Campo label="Rubro">
          <input className="input" list="adm-rubros" value={f.rubro ?? ""} onChange={(e) => set("rubro", e.target.value)} maxLength={160} />
          <datalist id="adm-rubros">{RUBROS.map((r) => <option key={r} value={r} />)}</datalist>
        </Campo>
        <Campo label="Persona de contacto"><input className="input" value={f.persona ?? ""} onChange={(e) => set("persona", e.target.value)} maxLength={160} /></Campo>
        <Campo label="Teléfono"><input className="input" type="tel" value={f.telefono ?? ""} onChange={(e) => set("telefono", e.target.value)} maxLength={160} /></Campo>
        <Campo label="Email"><input className="input" type="email" value={f.email ?? ""} onChange={(e) => set("email", e.target.value)} maxLength={160} /></Campo>
        <Campo label="CUIT"><input className="input" value={f.cuit ?? ""} onChange={(e) => set("cuit", e.target.value)} maxLength={20} /></Campo>
        <Campo label="Notas" full><textarea className="textarea" rows={3} value={f.notas ?? ""} onChange={(e) => set("notas", e.target.value)} placeholder="Horarios, N° de cliente, CBU…" /></Campo>
      </div>
    </Modal>
  );
}
