import { useMemo, useState } from "react";
import { Download, Plus } from "lucide-react";
import { downloadCsv } from "../guardias/logic";
import { adm } from "./api";
import { useAdm, useDatos } from "./contexto";
import { CATEGORIAS_DOC, coincide, diasEntre, fechaAR } from "./logic";
import { Kpi, S, SegControl, UrgenciaPill, Vacio } from "./ui";

export default function Documentos() {
  const { hoy, permisos, abrir, cumplir, nuevo } = useAdm();
  const [vista, setVista] = useState<"vigentes" | "todos">("vigentes");
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const { data, error } = useDatos(() => adm.items({ tipo: "documento", estado: vista === "vigentes" ? "pendiente" : "todos" }), [vista]);

  const lista = useMemo(() => (data ?? []).filter((d) => (!cat || d.datos?.categoria === cat) && coincide(d, q)), [data, cat, q]);
  const pend = (data ?? []).filter((d) => d.estado === "pendiente");
  const vencidos = pend.filter((d) => d.fecha < hoy).length;
  const en30 = pend.filter((d) => d.fecha >= hoy && diasEntre(hoy, d.fecha) <= 30).length;
  const en90 = pend.filter((d) => d.fecha >= hoy && diasEntre(hoy, d.fecha) <= 90).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <Kpi label="Vencidos" valor={vencidos} tono={vencidos ? "alerta" : "ok"} nota={vencidos ? "Renovar cuanto antes" : "Ninguno"} />
        <Kpi label="Vencen en 30 días" valor={en30} />
        <Kpi label="Vencen en 90 días" valor={en90} />
        <Kpi label="Vigentes" valor={pend.length} />
      </div>
      <p style={{ ...S.small, margin: 0 }}>Pólizas, contratos, habilitaciones, certificados y licencias. Al marcarlos como renovados, el sistema agenda el próximo vencimiento.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }} className="no-print">
        <SegControl label="Documentos" value={vista} onChange={setVista} opciones={[{ value: "vigentes", label: "Vigentes" }, { value: "todos", label: "Todos (con historial)" }]} />
        <select className="select" style={{ width: "auto" }} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {CATEGORIAS_DOC.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input className="input" style={{ flex: "1 1 200px", maxWidth: 300 }} placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar documento" />
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => downloadCsv(`documentos-${hoy}.csv`, [["Vence", "Categoría", "Documento", "Entidad", "Número", "Responsable", "Estado"], ...lista.map((d) => [fechaAR(d.fecha), String(d.datos?.categoria ?? ""), d.titulo, String(d.datos?.entidad ?? ""), String(d.datos?.numero ?? ""), d.responsable, d.estado])], "Documentos y contratos")}
          >
            <Download size={15} /> Excel
          </button>
          {permisos.editar && <button type="button" className="btn btn-primary" onClick={() => nuevo("documento")}><Plus size={15} /> Nuevo documento</button>}
        </div>
      </div>
      {error && <div className="form-error">{error}</div>}
      {data && lista.length === 0 ? (
        <Vacio titulo="No hay documentos cargados" texto="Ej.: seguro de mala praxis, póliza de incendio, habilitación municipal, contrato de mantenimiento de equipos, certificado de matafuegos." />
      ) : (
        <div className="card" style={{ ...S.card, padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr>
                <th style={S.th}>Vence</th>
                <th style={S.th}>Documento</th>
                <th style={S.th}>Categoría</th>
                <th style={S.th}>Entidad</th>
                <th style={S.th}>Responsable</th>
                <th style={S.th}>Estado</th>
                <th style={S.th}><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((d) => (
                <tr key={d.id}>
                  <td style={{ ...S.td, whiteSpace: "nowrap", fontWeight: 600 }}>{fechaAR(d.fecha)}</td>
                  <td style={S.td}>
                    <button type="button" onClick={() => abrir(d.id)} style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", fontWeight: 600, textAlign: "left" }}>{d.titulo}</button>
                    {d.datos?.numero && <div style={S.small}>N° {d.datos.numero}</div>}
                  </td>
                  <td style={S.td}>{d.datos?.categoria}</td>
                  <td style={S.td}>{d.datos?.entidad}</td>
                  <td style={S.td}>{d.responsable}</td>
                  <td style={S.td}><UrgenciaPill item={d} hoy={hoy} /></td>
                  <td style={{ ...S.td, textAlign: "right" }}>{permisos.editar && d.estado === "pendiente" && <button type="button" className="btn btn-quiet" style={{ fontSize: 12.5 }} onClick={() => cumplir(d)}>Renovado</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
