import { useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, CloudDownload, Trash2 } from "lucide-react";
import { avisar, confirmar } from "@/components/feedback";
import { adm } from "./api";
import { useAdm, useDatos } from "./contexto";
import { fechaAR, fechaLarga } from "./logic";
import { Campo, Pill, S, Seccion } from "./ui";

const TIPOS_FERIADO: Record<string, string> = { inamovible: "Inamovible", trasladable: "Trasladable", puente: "Puente / no laborable", no_laborable: "No laborable", local: "Local" };

export default function Ajustes() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 16, alignItems: "start" }}>
      <Feriados />
      <HistorialModulo />
    </div>
  );
}

function Feriados() {
  const { hoy, permisos, refrescar } = useAdm();
  const [anio, setAnio] = useState(Number(hoy.slice(0, 4)));
  const { data, error } = useDatos(() => adm.feriados(anio), [anio]);
  const [fecha, setFecha] = useState("");
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("inamovible");
  const [importando, setImportando] = useState(false);

  async function agregar(e: FormEvent) {
    e.preventDefault();
    if (!fecha) return;
    try {
      await adm.crearFeriado({ fecha, nombre, tipo });
      setFecha("");
      setNombre("");
      avisar("Feriado guardado. Las fechas estimadas se recalcularon.");
      refrescar();
    } catch (err) {
      avisar((err as Error).message, "error");
    }
  }

  async function importar() {
    setImportando(true);
    try {
      const r = await adm.importarFeriados(anio);
      avisar(`${r.importados} feriados de ${anio} importados.`);
      refrescar();
    } catch (err) {
      avisar((err as Error).message, "error", 8000);
    } finally {
      setImportando(false);
    }
  }

  return (
    <Seccion
      titulo="Feriados y días no laborables"
      extra={
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button type="button" className="btn btn-quiet btn-icon" onClick={() => setAnio(anio - 1)} aria-label="Año anterior"><ChevronLeft size={16} /></button>
          <strong style={{ minWidth: 44, textAlign: "center" }}>{anio}</strong>
          <button type="button" className="btn btn-quiet btn-icon" onClick={() => setAnio(anio + 1)} aria-label="Año siguiente"><ChevronRight size={16} /></button>
        </div>
      }
    >
      <p style={{ ...S.small, marginTop: 0 }}>
        Se usan para correr las fechas estimadas y los recurrentes al siguiente día hábil. Si un año no tiene feriados cargados se usan los fijados por ley (sin puentes ni feriados extraordinarios).
      </p>
      {error && <div className="form-error">{error}</div>}
      {permisos.calendario && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
          <button type="button" className="btn btn-quiet" style={{ alignSelf: "flex-start" }} onClick={importar} disabled={importando}>
            <CloudDownload size={15} /> {importando ? "Consultando…" : `Traer feriados oficiales de ${anio}`}
          </button>
          <form onSubmit={agregar} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, alignItems: "end" }}>
            <Campo label="Fecha"><input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required /></Campo>
            <Campo label="Nombre"><input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Asueto provincial" /></Campo>
            <Campo label="Tipo">
              <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {Object.entries(TIPOS_FERIADO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            <button type="submit" className="btn btn-primary">Agregar</button>
          </form>
        </div>
      )}
      {data && data.length === 0 ? (
        <div style={{ fontSize: 13, padding: "8px 12px", borderRadius: 10, background: "#fdf6e3", color: "#6b4204", border: "1px solid #efd28f" }}>
          No hay feriados cargados para {anio}.
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          {(data ?? []).map((f) => (
            <li key={f.fecha} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 8, background: f.fecha < hoy ? "transparent" : "hsl(var(--muted) / .5)", opacity: f.fecha < hoy ? 0.6 : 1 }}>
              <span style={{ fontWeight: 700, flex: "0 0 auto", minWidth: 92, fontVariantNumeric: "tabular-nums" }}>{fechaAR(f.fecha)}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
                {f.nombre}
                <span style={{ ...S.small, marginLeft: 6, textTransform: "capitalize" }}>{fechaLarga(f.fecha).split(" ")[0]}</span>
              </span>
              <Pill style={{ border: "1px solid hsl(var(--border))" }}>{TIPOS_FERIADO[f.tipo] ?? f.tipo}</Pill>
              {permisos.calendario && (
                <button
                  type="button"
                  className="btn btn-quiet btn-icon"
                  aria-label={`Quitar ${f.nombre}`}
                  onClick={async () => {
                    if (!(await confirmar({ titulo: `¿Quitar el feriado del ${fechaAR(f.fecha)}?`, accion: "Quitar", peligro: true }))) return;
                    try {
                      await adm.borrarFeriado(f.fecha);
                      refrescar();
                    } catch (err) {
                      avisar((err as Error).message, "error");
                    }
                  }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Seccion>
  );
}

function HistorialModulo() {
  const { data, error } = useDatos(() => adm.historial(), []);
  return (
    <Seccion titulo="Últimos cambios del módulo">
      {error && <div className="form-error">{error}</div>}
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8, maxHeight: 560, overflowY: "auto" }}>
        {(data ?? []).map((h) => (
          <li key={h.id} style={{ fontSize: 12.5, borderLeft: "2px solid hsl(var(--border))", paddingLeft: 10 }}>
            <div style={S.muted}>{new Date(h.createdAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })} · {h.userName}</div>
            <div>
              <strong style={{ textTransform: "capitalize" }}>{h.entidad === "item" ? "" : `${h.entidad} · `}{h.accion}</strong>
              {h.titulo && !h.detalle.includes(h.titulo) ? ` · ${h.titulo}` : ""}
              {h.detalle ? ` — ${h.detalle}` : ""}
            </div>
          </li>
        ))}
        {data && data.length === 0 && <li style={S.small}>Sin cambios registrados.</li>}
      </ul>
    </Seccion>
  );
}
