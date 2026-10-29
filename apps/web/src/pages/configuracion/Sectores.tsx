import { useMemo, useState, type FormEvent } from "react";
import { Plus, Search, Upload } from "lucide-react";
import { avisar, confirmar } from "@/components/feedback";
import { Modal } from "../administracion/ui";
import { CoberturaEditor, franjasResumen } from "../guardias/compartido";
import type { Franja } from "../guardias/logic";
import { ImportarSectoresModal } from "../shared/ImportarSectores";
import { api, type Sector } from "./api";
import type { Datos, Nav } from "./Configuracion";
import { Cabecera, Chip, MUTED, Vacio } from "./ui";

// Sectores del sanatorio: se usan en Guardias, Inventario e Instructivos y para limitar a qué sectores accede cada persona.

type Props = { datos: Datos; recargar: () => Promise<void>; nav: Nav };
type Form = { name: string; shortName: string; active: boolean; guardia: boolean; cobertura: Franja[] };

export function Sectores({ datos, recargar }: Props) {
  const { sectores, guardiaCfg, personas } = datos;
  const [q, setQ] = useState("");
  const [ver, setVer] = useState<"activos" | "inactivos" | "guardias" | "todos">("activos");
  const [editor, setEditor] = useState<{ sector?: Sector; inicialGuardia: string } | null>(null);
  const [f, setF] = useState<Form>({ name: "", shortName: "", active: true, guardia: false, cobertura: [] });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importar, setImportar] = useState(false);

  const cfgDe = (id: number) => guardiaCfg.find((c) => c.sectorId === id);
  const personasEn = (id: number) => personas.filter((p) => p.active && p.sectorIds.includes(id)).length;

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return sectores.filter(
      (s) =>
        (ver === "todos" || (ver === "activos" && s.active) || (ver === "inactivos" && !s.active) || (ver === "guardias" && cfgDe(s.id)?.active)) &&
        (!t || `${s.name} ${s.shortName}`.toLowerCase().includes(t)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectores, q, ver, guardiaCfg]);

  const abrir = (s?: Sector) => {
    const c = s ? cfgDe(s.id) : undefined;
    const guardia = Boolean(c?.active);
    const cobertura = c?.cobertura ?? [];
    setF(s ? { name: s.name, shortName: s.shortName, active: s.active, guardia, cobertura } : { name: "", shortName: "", active: true, guardia: false, cobertura: [] });
    setError(null);
    setEditor({ sector: s, inicialGuardia: JSON.stringify({ guardia, cobertura }) });
  };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (!editor) return;
    setGuardando(true);
    setError(null);
    try {
      const body = { name: f.name.trim(), shortName: f.shortName.trim(), active: f.active };
      let id = editor.sector?.id;
      if (id) await api(`/sectores/${id}`, { method: "PATCH", body });
      else id = (await api<Sector>("/sectores", { method: "POST", body })).id;
      // Participación en Guardias y horario requerido: solo si cambió. Al dejar de participar se conserva el horario.
      const cambio = JSON.stringify({ guardia: f.guardia, cobertura: f.cobertura }) !== editor.inicialGuardia;
      if (id && cambio && (f.guardia || editor.sector)) await api(`/guardias/config/${id}`, { method: "PUT", body: { active: f.guardia, cobertura: f.cobertura } });
      setEditor(null);
      avisar(editor.sector ? "Sector guardado." : "Sector creado.");
      await recargar();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  const activar = async (s: Sector) => {
    try {
      await api(`/sectores/${s.id}`, { method: "PATCH", body: { active: !s.active } });
      await recargar();
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };

  const eliminar = async (s: Sector) => {
    if (!(await confirmar({ titulo: `¿Eliminar el sector ${s.name}?`, mensaje: "Si tiene guardias, personas o equipos asociados, conviene desactivarlo.", accion: "Eliminar", peligro: true }))) return;
    try {
      await api(`/sectores/${s.id}`, { method: "DELETE" });
      avisar("Sector eliminado.");
      setEditor(null);
      await recargar();
    } catch {
      avisar("No se pudo eliminar: el sector tiene guardias, personas o equipos asociados. Desactivalo en su lugar.", "error", 8000);
    }
  };

  const n = { activos: sectores.filter((s) => s.active).length, inactivos: sectores.filter((s) => !s.active).length, guardias: sectores.filter((s) => cfgDe(s.id)?.active).length, todos: sectores.length };

  return (
    <>
      <Cabecera
        titulo="Sectores"
        texto="Se usan en Guardias, Inventario e Instructivos, y para limitar a qué sectores accede cada persona. En cada sector se define si participa de Guardias Médicas y qué horario necesita cubierto."
        acciones={
          <>
            <button type="button" className="btn btn-quiet" onClick={() => setImportar(true)}><Upload size={15} /> Importar Excel</button>
            <button type="button" className="btn btn-primary" onClick={() => abrir()}><Plus size={16} /> Nuevo sector</button>
          </>
        }
      />
      <div className="cfg-filtros-chips" role="tablist">
        {(
          [
            ["activos", "Activos"],
            ["guardias", "Participan de Guardias"],
            ["inactivos", "Inactivos"],
            ["todos", "Todos"],
          ] as const
        ).map(([v, t]) => (
          <button key={v} type="button" role="tab" aria-selected={ver === v} className={`cfg-fchip${ver === v ? " on" : ""}`} onClick={() => setVer(v)}>
            {t} <span>{n[v]}</span>
          </button>
        ))}
      </div>
      <div className="cfg-toolbar">
        <div className="cfg-buscar">
          <Search size={15} aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar sector" aria-label="Buscar sector" />
        </div>
      </div>
      {lista.length === 0 ? (
        <Vacio titulo="No hay sectores con este filtro" />
      ) : (
        <div className="cfg-tabla-wrap">
          <table className="cfg-tabla">
            <thead>
              <tr><th>Sector</th><th>Abreviatura</th><th>Guardias Médicas</th><th>Personas a cargo</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {lista.map((s) => {
                const c = cfgDe(s.id);
                return (
                  <tr key={s.id} className={`cfg-fila${s.active ? "" : " apagada"}`} onClick={() => abrir(s)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && abrir(s)}>
                    <td><strong>{s.name}</strong></td>
                    <td style={{ fontFamily: "ui-monospace, monospace" }}>{s.shortName}</td>
                    <td>{c?.active ? <><Chip bg="hsl(262 80% 93%)" fg="hsl(262 55% 38%)">Participa</Chip><div style={{ ...MUTED, marginTop: 3 }}>{franjasResumen(c.cobertura)}</div></> : <span style={MUTED}>No participa</span>}</td>
                    <td>{personasEn(s.id) || <span style={MUTED}>—</span>}</td>
                    <td>{s.active ? <Chip bg="hsl(155 55% 88%)" fg="hsl(155 60% 24%)">Activo</Chip> : <Chip bg="hsl(0 0% 90%)" fg="hsl(0 0% 35%)">Inactivo</Chip>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editor && (
        <Modal
          titulo={editor.sector ? `Sector: ${editor.sector.name}` : "Nuevo sector"}
          onClose={() => setEditor(null)}
          ancho={f.guardia ? 660 : 480}
          pie={
            <>
              {editor.sector && (
                <>
                  <button type="button" className="btn btn-quiet" style={{ color: "#b91c1c" }} onClick={() => void eliminar(editor.sector!)}>Eliminar</button>
                  <button type="button" className="btn btn-quiet" onClick={() => { void activar(editor.sector!); setEditor(null); }}>{editor.sector.active ? "Desactivar" : "Activar"}</button>
                </>
              )}
              <span style={{ flex: 1 }} />
              <button type="button" className="btn btn-quiet" onClick={() => setEditor(null)}>Cancelar</button>
              <button type="submit" form="cfg-sector" className="btn btn-primary" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button>
            </>
          }
        >
          <form id="cfg-sector" className="cfg-form" onSubmit={(e) => void guardar(e)}>
            {error && <div className="form-error">{error}</div>}
            <label><span className="field-label">Nombre</span><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></label>
            <label><span className="field-label">Abreviatura</span><input maxLength={8} value={f.shortName} placeholder="Vacío = se arma sola (ej. UTI)" onChange={(e) => setF({ ...f, shortName: e.target.value })} /></label>
            <label className="cfg-check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Sector activo</label>
            <label className="cfg-check">
              <input type="checkbox" checked={f.guardia} disabled={!f.active} onChange={(e) => setF({ ...f, guardia: e.target.checked })} />
              <span>Participa de Guardias Médicas<span className="field-hint" style={{ display: "block" }}>Aparece en el calendario de Guardias y se controla su cobertura.</span></span>
            </label>
            {f.guardia && f.active && (
              <div>
                <div className="field-label" style={{ marginBottom: 6 }}>Horario que necesita cubierto</div>
                <CoberturaEditor value={f.cobertura} onChange={(cobertura) => setF({ ...f, cobertura })} />
              </div>
            )}
          </form>
        </Modal>
      )}
      {importar && <ImportarSectoresModal onClose={() => setImportar(false)} onDone={() => { setImportar(false); void recargar(); }} />}
    </>
  );
}
