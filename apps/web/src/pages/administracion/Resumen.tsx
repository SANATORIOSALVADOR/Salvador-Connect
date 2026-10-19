import { useState } from "react";
import { AlertTriangle, ArrowRight, BookOpen, X } from "lucide-react";
import { adm } from "./api";
import { useAdm, useDatos } from "./contexto";
import { diasEntre, fechaLarga, formatMonto, MESES, sumaMontos, type Item } from "./logic";
import { ItemFila, Kpi, S, Seccion, Vacio } from "./ui";

const GUIA_VISTA = "sc-adm-guia-vista";

export default function Resumen() {
  const { hoy, permisos, abrir, cumplir, irA, nuevo } = useAdm();
  const [verGuia, setVerGuia] = useState(() => {
    try {
      return localStorage.getItem(GUIA_VISTA) !== "1";
    } catch {
      return true;
    }
  });
  const ocultarGuia = () => {
    setVerGuia(false);
    try {
      localStorage.setItem(GUIA_VISTA, "1");
    } catch {}
  };
  const { data, error, cargando } = useDatos(() => adm.resumen(), []);

  if (error) return <div className="form-error">{error}</div>;
  if (!data) return <div style={S.muted}>{cargando ? "Cargando…" : ""}</div>;

  const pend = data.pendientes;
  const vencidos = pend.filter((i) => i.fecha < hoy);
  const deHoy = pend.filter((i) => i.fecha === hoy);
  const semana = pend.filter((i) => i.fecha > hoy && diasEntre(hoy, i.fecha) <= 7);
  const despues = pend.filter((i) => diasEntre(hoy, i.fecha) > 7);
  const emitidos = data.cheques.filter((c) => c.datos?.direccion !== "recibido");
  const recibidos = data.cheques.filter((c) => c.datos?.direccion === "recibido");
  const emit7 = sumaMontos(emitidos.filter((c) => diasEntre(hoy, c.fecha) <= 7));
  const f = data.fiscal;
  const mes = Number(data.periodo.slice(5, 7));
  const fiscalPct = f.total ? Math.round((f.cumplidos / Math.max(1, f.total - f.cancelados)) * 100) : 0;

  const grupo = (titulo: string, items: Item[], color?: string) =>
    items.length > 0 && (
      <div style={{ marginBottom: 14 }}>
        <div style={{ ...S.label, color: color ?? S.label.color, marginBottom: 6 }}>
          {titulo} · {items.length}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((it) => (
            <ItemFila key={it.id} item={it} hoy={hoy} onOpen={(x) => abrir(x.id)} onCheck={cumplir} puedeEditar={permisos.cumplir} />
          ))}
        </div>
      </div>
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {verGuia && (
        <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, border: "1px solid hsl(var(--primary) / .35)", background: "hsl(var(--primary) / .08)" }}>
          <BookOpen size={20} aria-hidden="true" style={{ color: "hsl(var(--primary))", flex: "0 0 auto" }} />
          <div style={{ flex: 1, fontSize: 13.5 }}>
            <strong>¿Primera vez en Administración?</strong> La guía explica cada pestaña, cómo cargar el calendario de ARCA y las rutinas de cada día, mes y año (5 minutos).
          </div>
          <button type="button" className="btn btn-primary" style={{ fontSize: 12.5, padding: "6px 12px" }} onClick={() => { ocultarGuia(); irA("guia"); }}>Abrir la guía</button>
          <button type="button" className="btn btn-quiet btn-icon" aria-label="No mostrar más" title="No mostrar más" onClick={ocultarGuia}><X size={16} /></button>
        </div>
      )}
      <p style={{ margin: 0, fontSize: 15 }}>
        Hoy es <strong>{fechaLarga(hoy)}</strong>.{" "}
        {vencidos.length + deHoy.length === 0 ? "No hay nada vencido ni para hoy." : `Hay ${vencidos.length + deHoy.length} cosa${vencidos.length + deHoy.length === 1 ? "" : "s"} para resolver hoy.`}
      </p>

      {data.avisos.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.avisos.map((a, i) => (
            <div key={i} role="status" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, border: "1px solid #efd28f", background: "#fdf6e3", color: "#6b4204", fontSize: 13.5 }}>
              <AlertTriangle size={16} aria-hidden="true" style={{ flex: "0 0 auto" }} />
              <span style={{ flex: 1 }}>{a.texto}</span>
              {a.tab && (
                <button type="button" className="btn" style={{ fontSize: 12.5, padding: "5px 10px", color: "#6b4204", background: "rgba(255,255,255,.7)", border: "1px solid #efd28f" }} onClick={() => irA(a.tab!)}>
                  Revisar <ArrowRight size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <Kpi label="Vencidos" valor={vencidos.length} tono={vencidos.length ? "alerta" : "ok"} nota={vencidos.length ? "Requieren atención" : "Todo al día"} onClick={() => irA("agenda")} />
        <Kpi label="Para hoy" valor={deHoy.length} nota={deHoy.length ? deHoy[0].titulo : "Nada para hoy"} onClick={() => irA("agenda")} />
        <Kpi label="Próximos 7 días" valor={semana.length} onClick={() => irA("agenda")} />
        <Kpi label={`Fiscal · ${MESES[mes - 1]}`} valor={`${f.cumplidos}/${Math.max(0, f.total - f.cancelados)}`} nota={f.vencidos ? `${f.vencidos} vencido${f.vencidos === 1 ? "" : "s"}` : `${fiscalPct}% cumplido`} tono={f.vencidos ? "alerta" : undefined} onClick={() => irA("fiscal")} />
        <Kpi label="Cheques a pagar · 7 días" valor={emit7.total ? formatMonto(emit7.total).replace(/,\d\d$/, "") : "—"} nota={`${emitidos.length} emitido${emitidos.length === 1 ? "" : "s"} · ${recibidos.length} a cobrar`} onClick={() => irA("cheques")} />
        <Kpi label="Tareas abiertas" valor={data.tareas.length} nota={data.tareas.filter((t) => t.fecha <= hoy).length ? `${data.tareas.filter((t) => t.fecha <= hoy).length} para hoy o atrasadas` : undefined} onClick={() => irA("tareas")} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 16, alignItems: "start" }}>
        <Seccion
          titulo="Qué viene"
          extra={<button type="button" className="btn btn-quiet" style={{ fontSize: 12.5 }} onClick={() => irA("agenda")}>Ver agenda <ArrowRight size={14} /></button>}
        >
          {pend.length === 0 ? (
            <Vacio titulo="Nada pendiente en los próximos 45 días" accion={permisos.editar ? <button type="button" className="btn btn-primary" onClick={() => nuevo()}>Cargar algo</button> : undefined} />
          ) : (
            <>
              {grupo("Vencidos", vencidos, "var(--adm-danger)")}
              {grupo("Hoy", deHoy, "var(--adm-hot)")}
              {grupo("Esta semana", semana)}
              {grupo("Más adelante", despues.slice(0, 12))}
              {despues.length > 12 && <div style={S.small}>y {despues.length - 12} más en la agenda.</div>}
            </>
          )}
        </Seccion>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <Seccion titulo={`Control fiscal de ${MESES[mes - 1].toLowerCase()}`} extra={<button type="button" className="btn btn-quiet" style={{ fontSize: 12.5 }} onClick={() => irA("fiscal")}>Abrir <ArrowRight size={14} /></button>}>
            <div style={{ height: 10, borderRadius: 999, background: "hsl(var(--muted))", overflow: "hidden" }} role="progressbar" aria-valuenow={fiscalPct} aria-valuemin={0} aria-valuemax={100} aria-label="Obligaciones cumplidas">
              <div style={{ width: `${fiscalPct}%`, height: "100%", background: "#0ca30c", borderRadius: 999 }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 12, fontSize: 13 }}>
              <div><div style={S.label}>Cumplidas</div><strong style={{ fontSize: 18 }}>{f.cumplidos}</strong></div>
              <div><div style={S.label}>Pendientes</div><strong style={{ fontSize: 18 }}>{Math.max(0, f.total - f.cumplidos - f.cancelados)}</strong></div>
              <div><div style={S.label}>Fechas verificadas</div><strong style={{ fontSize: 18, color: f.verificadas < f.obligaciones ? "var(--adm-warn)" : undefined }}>{f.verificadas}/{f.obligaciones}</strong></div>
            </div>
            {f.estimadas > 0 && (
              <p style={{ ...S.small, margin: "10px 0 0" }}>
                {f.estimadas} fecha{f.estimadas === 1 ? "" : "s"} todavía {f.estimadas === 1 ? "es" : "son"} estimada{f.estimadas === 1 ? "" : "s"}: verificalas con el calendario oficial en la pestaña Fiscal.
              </p>
            )}
          </Seccion>

          <Seccion titulo="Cheques próximos" extra={<button type="button" className="btn btn-quiet" style={{ fontSize: 12.5 }} onClick={() => irA("cheques")}>Ver todos <ArrowRight size={14} /></button>}>
            {data.cheques.length === 0 ? (
              <div style={S.small}>No hay cheques pendientes.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {data.cheques.slice(0, 5).map((it) => (
                  <ItemFila key={it.id} item={it} hoy={hoy} onOpen={(x) => abrir(x.id)} puedeEditar={permisos.editar} />
                ))}
              </div>
            )}
          </Seccion>

          <Seccion titulo="Tareas" extra={<button type="button" className="btn btn-quiet" style={{ fontSize: 12.5 }} onClick={() => irA("tareas")}>Ver todas <ArrowRight size={14} /></button>}>
            {data.tareas.length === 0 ? (
              <div style={S.small}>No hay tareas abiertas.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {data.tareas.slice(0, 6).map((it) => (
                  <ItemFila key={it.id} item={it} hoy={hoy} onOpen={(x) => abrir(x.id)} onCheck={cumplir} puedeEditar={permisos.cumplir} />
                ))}
              </div>
            )}
          </Seccion>
        </div>
      </div>
    </div>
  );
}
