import { useRef, useState } from "react";
import { CheckCircle2, Download, FileSpreadsheet, UploadCloud, XCircle } from "lucide-react";
import { avisar } from "@/components/feedback";
import { Modal, Pill, S, SegControl } from "../administracion/ui";
import { inv, type ResultadoImportacion } from "./api";
import { COLUMNAS, EXTENSIONES, descargarPlantilla, exportar, leerArchivo, type Lectura } from "./excel";

const ESTADO_FILA: Record<string, { txt: string; bg: string; fg: string }> = {
  nuevo: { txt: "Nuevo", bg: "#dcf3dc", fg: "#155c15" },
  actualiza: { txt: "Actualiza", bg: "#dbeafe", fg: "#1e3a8a" },
  igual: { txt: "Sin cambios", bg: "hsl(var(--muted))", fg: "hsl(var(--muted-foreground))" },
  error: { txt: "Error", bg: "#fde2e2", fg: "#8f1d1d" },
};

export function ImportarModal({ sectores, onClose, onDone }: { sectores: string[]; onClose: () => void; onDone: () => void }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [modo, setModo] = useState<"agregar" | "actualizar">("agregar");
  const [previa, setPrevia] = useState<ResultadoImportacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [soloErrores, setSoloErrores] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const simular = async (l: Lectura, m: "agregar" | "actualizar") => {
    setOcupado("Revisando las filas…");
    setError(null);
    try {
      setPrevia(await inv.importar(l.filas, m, true));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  const elegir = async (f: File | undefined | null) => {
    if (!f) return;
    setArchivo(f);
    setLectura(null);
    setPrevia(null);
    setError(null);
    setOcupado("Leyendo el archivo…");
    try {
      const l = await leerArchivo(f);
      setLectura(l);
      setOcupado(null);
      if (!l.faltan.length && l.filas.length) await simular(l, modo);
      else if (!l.filas.length) setError("El archivo no tiene filas con datos debajo de los encabezados.");
    } catch (err) {
      setOcupado(null);
      setError(`No se pudo leer el archivo: ${(err as Error).message}`);
    }
  };

  const importar = async () => {
    if (!lectura || !previa) return;
    setOcupado("Importando…");
    setError(null);
    try {
      const r = await inv.importar(lectura.filas, modo, false);
      avisar(`Importación lista: ${r.resumen.nuevos} nuevo${r.resumen.nuevos === 1 ? "" : "s"}, ${r.resumen.actualizados} actualizado${r.resumen.actualizados === 1 ? "" : "s"}${r.resumen.errores ? `, ${r.resumen.errores} con error (no se cargaron)` : ""}.`);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setOcupado(null);
    }
  };

  const bajarErrores = async () => {
    if (!lectura || !previa) return;
    const malas = previa.filas.filter((f) => f.estado === "error");
    const filas = malas.map((f) => {
      const orig = lectura.filas.find((x) => x.fila === f.fila) ?? {};
      const o: Record<string, unknown> = { FILA: f.fila };
      for (const c of COLUMNAS) if (lectura.reconocidas.some((r) => r.columna.key === c.key)) o[c.titulo] = orig[c.key] ?? "";
      o.ERRORES = f.mensajes.join(" ");
      return o;
    });
    await exportar(filas, "inventario-filas-con-error", "xlsx", "Errores");
  };

  const r = previa?.resumen;
  const cargables = r ? r.nuevos + r.actualizados : 0;
  const filasVista = (previa?.filas ?? []).filter((f) => !soloErrores || f.estado === "error").sort((a, b) => (a.estado === "error" ? 0 : 1) - (b.estado === "error" ? 0 : 1) || a.fila - b.fila);

  return (
    <Modal
      titulo="Importar inventario desde Excel"
      onClose={onClose}
      ancho={880}
      pie={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>Cancelar</button>
          {previa && (
            <button type="button" className="btn btn-primary" onClick={() => void importar()} disabled={Boolean(ocupado) || cargables === 0}>
              {ocupado === "Importando…" ? "Importando…" : cargables ? `Importar ${cargables} equipo${cargables === 1 ? "" : "s"}` : "Nada para importar"}
            </button>
          )}
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 360px", minWidth: 0 }}>
            <div style={S.label}>Columnas obligatorias</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {COLUMNAS.filter((c) => c.obligatoria).map((c) => {
                const ok = lectura ? !lectura.faltan.some((f) => f.key === c.key) : null;
                return (
                  <Pill key={c.key} style={{ background: ok === null ? "hsl(var(--muted))" : ok ? "#dcf3dc" : "#fde2e2", color: ok === null ? "hsl(var(--foreground))" : ok ? "#155c15" : "#8f1d1d" }} title={c.ayuda}>
                    {ok === true && <CheckCircle2 size={12} />}
                    {ok === false && <XCircle size={12} />}
                    {c.titulo}
                  </Pill>
                );
              })}
            </div>
            <div style={{ ...S.small, marginTop: 6 }}>
              Opcionales: {COLUMNAS.filter((c) => !c.obligatoria).map((c) => c.titulo).join(", ")}. Marca y código de serie pueden quedar vacíos en una fila, pero la columna tiene que estar.
            </div>
          </div>
          <button type="button" className="btn btn-quiet" onClick={() => void descargarPlantilla(sectores)}>
            <Download size={15} /> Descargar plantilla
          </button>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastrando(false);
            void elegir(e.dataTransfer.files?.[0]);
          }}
          onClick={() => input.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
          style={{
            border: `2px dashed ${arrastrando ? "hsl(var(--primary))" : "hsl(var(--border))"}`,
            borderRadius: 14,
            padding: "22px 16px",
            textAlign: "center",
            cursor: "pointer",
            background: arrastrando ? "hsl(var(--primary) / .06)" : "transparent",
          }}
        >
          <input ref={input} type="file" accept={EXTENSIONES} hidden onChange={(e) => void elegir(e.target.files?.[0])} />
          {archivo ? (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
              <FileSpreadsheet size={22} />
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: 700 }}>{archivo.name}</div>
                <div style={S.small}>{lectura ? `Hoja «${lectura.hoja}» · ${lectura.filas.length} fila${lectura.filas.length === 1 ? "" : "s"} · encabezados en la fila ${lectura.filaEncabezado}` : "…"} · tocá para elegir otro</div>
              </div>
            </div>
          ) : (
            <>
              <UploadCloud size={28} style={{ opacity: 0.7 }} />
              <div style={{ fontWeight: 700, marginTop: 6 }}>Arrastrá el archivo acá o tocá para elegirlo</div>
              <div style={S.small}>Excel (.xlsx, .xls, .xlsm, .xlsb), LibreOffice (.ods) o CSV · hasta 5000 filas</div>
            </>
          )}
        </div>

        {ocupado && <div style={{ ...S.small, fontSize: 13 }}>{ocupado}</div>}
        {error && <div className="form-error">{error}</div>}

        {lectura && lectura.faltan.length > 0 && (
          <div className="form-error">
            Faltan columnas obligatorias: <strong>{lectura.faltan.map((c) => c.titulo).join(", ")}</strong>.
            {lectura.encabezados.filter(Boolean).length > 0 && <> Encabezados encontrados: {lectura.encabezados.filter(Boolean).join(", ")}.</>} Usá la plantilla o renombrá esas columnas.
          </div>
        )}

        {lectura && !lectura.faltan.length && previa && r && (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <SegControl
                label="Si el código de serie ya existe"
                value={modo}
                onChange={(m) => {
                  setModo(m);
                  void simular(lectura, m);
                }}
                opciones={[
                  { value: "agregar", label: "Solo agregar nuevos" },
                  { value: "actualizar", label: "Actualizar los que ya existen" },
                ]}
              />
              <span style={S.small}>{modo === "actualizar" ? "Los equipos con el mismo código de serie se actualizan con los datos del archivo." : "Un código de serie que ya existe se marca como error."}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
              {[
                ["Filas", r.total, undefined],
                ["Nuevos", r.nuevos, "#155c15"],
                ["Se actualizan", r.actualizados, "#1e3a8a"],
                ["Sin cambios", r.iguales, undefined],
                ["Con error", r.errores, r.errores ? "#b91c1c" : undefined],
              ].map(([k, v, c]) => (
                <div key={k as string} className="card" style={{ padding: "10px 12px", borderRadius: 12 }}>
                  <div style={S.label}>{k}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: c as string | undefined }}>{v as number}</div>
                </div>
              ))}
            </div>
            {r.errores > 0 && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 12px", borderRadius: 10, background: "#fdf0d5", color: "#7a4a06", fontSize: 13 }}>
                <span style={{ flex: "1 1 280px" }}>Las filas con error <strong>no se importan</strong>. Podés importar las demás ahora y después corregir y subir solo las que fallaron.</span>
                <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => void bajarErrores()}><Download size={14} /> Bajar filas con error</button>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12.5 }}>
                  <input type="checkbox" checked={soloErrores} onChange={(e) => setSoloErrores(e.target.checked)} /> Ver solo errores
                </label>
              </div>
            )}
            <div style={{ maxHeight: 340, overflow: "auto", border: "1px solid hsl(var(--border))", borderRadius: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={S.th}>Fila</th>
                    <th style={S.th}>Descripción</th>
                    <th style={S.th}>Resultado</th>
                    <th style={S.th}>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {filasVista.slice(0, 500).map((f) => {
                    const m = ESTADO_FILA[f.estado];
                    return (
                      <tr key={f.fila}>
                        <td style={{ ...S.td, fontFamily: "monospace" }}>{f.fila}</td>
                        <td style={S.td}>{f.descripcion || <span style={S.small}>(vacía)</span>}</td>
                        <td style={S.td}><Pill style={{ background: m.bg, color: m.fg }}>{m.txt}</Pill></td>
                        <td style={{ ...S.td, fontSize: 12.5, color: f.estado === "error" ? "#8f1d1d" : "hsl(var(--muted-foreground))" }}>{f.mensajes.join(" ")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filasVista.length > 500 && <div style={{ ...S.small, padding: 10 }}>Se muestran 500 de {filasVista.length} filas.</div>}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
