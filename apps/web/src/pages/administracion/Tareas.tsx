import { useMemo, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { avisar } from "@/components/feedback";
import { adm } from "./api";
import { useAdm, useDatos } from "./contexto";
import { addDays, diasEntre, fechaCorta, type Item } from "./logic";
import { S, Vacio } from "./ui";

/** Tareas del día a día: tablero por urgencia + carga rápida. */
export default function Tareas() {
  const { hoy, permisos, abrir, cumplir, refrescar, responsables } = useAdm();
  const [responsable, setResponsable] = useState("");
  const { data, error } = useDatos(() => adm.items({ tipo: "tarea", estado: "todos", desde: addDays(hoy, -14) }), [hoy]);
  const { data: viejas } = useDatos(() => adm.items({ tipo: "tarea", estado: "pendiente", hasta: addDays(hoy, -15) }), [hoy]);
  const [titulo, setTitulo] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [quien, setQuien] = useState("");
  const [guardando, setGuardando] = useState(false);

  const todas = useMemo(() => [...(viejas ?? []), ...(data ?? [])].filter((t) => !responsable || t.responsable === responsable), [data, viejas, responsable]);
  const abiertas = todas.filter((t) => t.estado === "pendiente");
  const cols: { titulo: string; items: Item[]; color?: string }[] = [
    { titulo: "Atrasadas y hoy", items: abiertas.filter((t) => t.fecha <= hoy), color: "var(--adm-danger)" },
    { titulo: "Esta semana", items: abiertas.filter((t) => t.fecha > hoy && diasEntre(hoy, t.fecha) <= 7) },
    { titulo: "Más adelante", items: abiertas.filter((t) => diasEntre(hoy, t.fecha) > 7) },
    { titulo: "Hechas (últimos 14 días)", items: todas.filter((t) => t.estado === "cumplido").reverse() },
  ];

  async function crear(e: FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) return;
    setGuardando(true);
    try {
      await adm.crear({ tipo: "tarea", titulo: titulo.trim(), fecha, responsable: quien, alertDays: 1 });
      setTitulo("");
      avisar("Tarea agregada.");
      refrescar();
    } catch (err) {
      avisar((err as Error).message, "error");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {permisos.editar && (
        <form onSubmit={crear} className="card no-print" style={{ ...S.card, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input className="input" style={{ flex: "3 1 260px" }} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Nueva tarea… (ej.: pedir presupuesto de mantenimiento del ascensor)" aria-label="Nueva tarea" maxLength={300} />
          <input className="input" type="date" style={{ flex: "0 1 160px" }} value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label="Para el día" />
          <input className="input" style={{ flex: "1 1 150px" }} list="adm-resp-tareas" value={quien} onChange={(e) => setQuien(e.target.value)} placeholder="Responsable" aria-label="Responsable" />
          <datalist id="adm-resp-tareas">{responsables.map((r) => <option key={r} value={r} />)}</datalist>
          <button type="submit" className="btn btn-primary" disabled={guardando || !titulo.trim()}><Plus size={15} /> Agregar</button>
        </form>
      )}
      <div style={{ ...S.row }}>
        <select className="select" style={{ width: "auto" }} value={responsable} onChange={(e) => setResponsable(e.target.value)} aria-label="Responsable">
          <option value="">Todos los responsables</option>
          {responsables.map((r) => <option key={r}>{r}</option>)}
        </select>
        <span style={S.small}>{abiertas.length} abierta{abiertas.length === 1 ? "" : "s"}</span>
      </div>
      {error && <div className="form-error">{error}</div>}
      {data && todas.length === 0 ? (
        <Vacio titulo="Sin tareas" texto="Anotá acá los pendientes del día a día del área: llamados, trámites, pedidos, controles." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 12, alignItems: "start" }}>
          {cols.map((c) => (
            <section key={c.titulo} style={{ background: "hsl(var(--muted) / .5)", borderRadius: 14, padding: 10, minWidth: 0 }}>
              <h2 style={{ ...S.label, color: c.color ?? S.label.color, margin: "2px 4px 10px" }}>{c.titulo} · {c.items.length}</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {c.items.map((t) => <TarjetaTarea key={t.id} t={t} hoy={hoy} puedeEditar={permisos.cumplir} onOpen={() => abrir(t.id)} onCheck={() => cumplir(t)} />)}
                {c.items.length === 0 && <div style={{ ...S.small, padding: "6px 4px" }}>—</div>}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function TarjetaTarea({ t, hoy, puedeEditar, onOpen, onCheck }: { t: Item; hoy: string; puedeEditar: boolean; onOpen: () => void; onCheck: () => void }) {
  const subs = Array.isArray(t.datos?.subtareas) ? t.datos.subtareas : [];
  const hechas = subs.filter((s) => s.hecho).length;
  const atrasada = t.estado === "pendiente" && t.fecha < hoy;
  return (
    <div className="card" style={{ padding: 10, borderRadius: 10, display: "flex", gap: 8, alignItems: "flex-start", borderLeft: t.prioridad === "alta" ? "3px solid #d03b3b" : undefined }}>
      {puedeEditar && t.estado === "pendiente" ? (
        <button type="button" onClick={onCheck} aria-label={`Completar «${t.titulo}»`} title="Completar" style={{ width: 20, height: 20, flex: "0 0 20px", borderRadius: 6, border: "2px solid hsl(var(--border))", background: "transparent", cursor: "pointer", marginTop: 1 }} />
      ) : (
        <span aria-hidden="true" style={{ width: 20, height: 20, flex: "0 0 20px", borderRadius: 6, background: t.estado === "cumplido" ? "#0ca30c" : "hsl(var(--muted))", color: "#fff", fontSize: 13, display: "grid", placeItems: "center" }}>{t.estado === "cumplido" ? "✓" : ""}</span>
      )}
      <button type="button" onClick={onOpen} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer" }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, textDecoration: t.estado === "cumplido" ? "line-through" : undefined, overflowWrap: "anywhere" }}>{t.titulo}</div>
        <div style={{ ...S.small, marginTop: 2 }}>
          <span style={{ color: atrasada ? "var(--adm-danger)" : undefined, fontWeight: atrasada ? 700 : undefined }}>{t.fecha === hoy ? "Hoy" : fechaCorta(t.fecha)}{t.hora ? ` ${t.hora}` : ""}</span>
          {t.responsable && ` · ${t.responsable}`}
          {subs.length > 0 && ` · ${hechas}/${subs.length} pasos`}
        </div>
      </button>
    </div>
  );
}
