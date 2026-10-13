import { useMemo, useState } from "react";
import { Download, Plus } from "lucide-react";
import { downloadCsv } from "../guardias/logic";
import { adm } from "./api";
import { useAdm, useDatos } from "./contexto";
import { coincide, diasEntre, fechaAR, formatMonto, parseMonto, sumaMontos } from "./logic";
import { Kpi, S, SegControl, UrgenciaPill, Vacio } from "./ui";

type Vista = "emitido" | "recibido" | "historial";

export default function Cheques() {
  const { hoy, permisos, abrir, cumplir, nuevo } = useAdm();
  const [vista, setVista] = useState<Vista>("emitido");
  const [q, setQ] = useState("");
  const { data, error } = useDatos(() => adm.items({ tipo: "cheque", estado: vista === "historial" ? "todos" : "pendiente", orden: vista === "historial" ? "desc" : undefined }), [vista]);

  const lista = useMemo(
    () => (data ?? []).filter((c) => (vista === "historial" ? true : (c.datos?.direccion === "recibido" ? "recibido" : "emitido") === vista)).filter((c) => coincide(c, q)),
    [data, vista, q],
  );
  const pendientes = (data ?? []).filter((c) => c.estado === "pendiente");
  const emit = pendientes.filter((c) => c.datos?.direccion !== "recibido");
  const rec = pendientes.filter((c) => c.datos?.direccion === "recibido");
  const emit7 = sumaMontos(emit.filter((c) => diasEntre(hoy, c.fecha) <= 7));
  const totalEmit = sumaMontos(emit);
  const totalRec = sumaMontos(rec);

  function exportar() {
    downloadCsv(`cheques-${hoy}.csv`, [
      ["Fecha", "Tipo", "Número", "Banco", "Beneficiario / librador", "Monto", "e-cheq", "Estado", "Comprobante"],
      ...lista.map((c) => [fechaAR(c.fecha), c.datos?.direccion === "recibido" ? "Recibido" : "Emitido", String(c.datos?.numero ?? ""), String(c.datos?.banco ?? ""), String(c.datos?.contraparte ?? ""), c.monto, c.datos?.echeq ? "Sí" : "No", c.estado, c.comprobante]),
    ], "Cheques");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {vista !== "historial" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
          <Kpi label="A pagar · próximos 7 días" valor={emit7.total ? formatMonto(emit7.total) : "—"} nota={emit7.sinMonto ? `${emit7.sinMonto} sin monto cargado` : undefined} tono={emit.some((c) => c.fecha < hoy) ? "alerta" : undefined} />
          <Kpi label="Emitidos pendientes" valor={emit.length} nota={totalEmit.total ? formatMonto(totalEmit.total) : undefined} onClick={() => setVista("emitido")} />
          <Kpi label="A cobrar" valor={rec.length} nota={totalRec.total ? formatMonto(totalRec.total) : undefined} onClick={() => setVista("recibido")} />
        </div>
      )}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }} className="no-print">
        <SegControl label="Cheques" value={vista} onChange={setVista} opciones={[{ value: "emitido", label: "Emitidos (a pagar)" }, { value: "recibido", label: "Recibidos (a cobrar)" }, { value: "historial", label: "Historial" }]} />
        <input className="input" style={{ flex: "1 1 200px", maxWidth: 300 }} placeholder="Buscar número, banco, beneficiario…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar cheque" />
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button type="button" className="btn btn-quiet" onClick={exportar}><Download size={15} /> Excel</button>
          {permisos.editar && <button type="button" className="btn btn-primary" onClick={() => nuevo("cheque")}><Plus size={15} /> Nuevo cheque</button>}
        </div>
      </div>
      {error && <div className="form-error">{error}</div>}
      {data && lista.length === 0 ? (
        <Vacio titulo={vista === "historial" ? "Sin cheques registrados" : "No hay cheques pendientes"} texto="Cargá los cheques emitidos y recibidos con su fecha de pago o cobro para que el sistema avise a tiempo." />
      ) : (
        <div className="card" style={{ ...S.card, padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr>
                <th style={S.th}>{vista === "recibido" ? "Cobro" : "Pago"}</th>
                <th style={S.th}>N°</th>
                <th style={S.th}>Banco</th>
                <th style={S.th}>{vista === "recibido" ? "Librador" : vista === "emitido" ? "Beneficiario" : "Beneficiario / librador"}</th>
                <th style={{ ...S.th, textAlign: "right" }}>Monto</th>
                <th style={S.th}>Estado</th>
                <th style={S.th}><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => {
                const n = parseMonto(c.monto);
                return (
                  <tr key={c.id}>
                    <td style={{ ...S.td, whiteSpace: "nowrap", fontWeight: 600 }}>{fechaAR(c.fecha)}</td>
                    <td style={S.td}>
                      <button type="button" onClick={() => abrir(c.id)} style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", fontWeight: 600, textAlign: "left" }}>{c.datos?.numero || c.titulo}</button>
                      {c.datos?.echeq && <div style={S.small}>e-cheq</div>}
                      {vista === "historial" && <div style={S.small}>{c.datos?.direccion === "recibido" ? "Recibido" : "Emitido"}</div>}
                    </td>
                    <td style={S.td}>{c.datos?.banco}</td>
                    <td style={S.td}>{c.datos?.contraparte || <span style={S.muted}>{c.titulo}</span>}</td>
                    <td style={{ ...S.td, textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>{Number.isFinite(n) ? formatMonto(n) : c.monto}</td>
                    <td style={S.td}><UrgenciaPill item={c} hoy={hoy} /></td>
                    <td style={{ ...S.td, textAlign: "right" }}>
                      {permisos.editar && c.estado === "pendiente" && (
                        <button type="button" className="btn btn-quiet" style={{ fontSize: 12.5 }} onClick={() => cumplir(c)}>{c.datos?.direccion === "recibido" ? "Cobrado" : "Debitado"}</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
