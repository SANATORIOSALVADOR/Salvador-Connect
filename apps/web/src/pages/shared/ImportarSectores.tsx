import { useRef, useState } from "react";
import { Download, FileSpreadsheet, UploadCloud } from "lucide-react";
import { avisar } from "@/components/feedback";
import { Modal, Pill, S } from "../administracion/ui";

// Importar sectores desde Excel (xlsx, xls, xlsm, xlsb, ods, csv). Solo el nombre es obligatorio:
// la abreviatura se arma sola si no viene, se crean activos y los que ya existen se omiten.

type FilaRes = { fila: number; nombre: string; abreviatura: string; estado: "nuevo" | "existe" | "repetido" | "error"; mensaje: string };
type Resultado = { simulado: boolean; resumen: { total: number; nuevos: number; existentes: number; repetidos: number; errores: number }; filas: FilaRes[] };

const EST: Record<FilaRes["estado"], { txt: string; bg: string; fg: string }> = {
  nuevo: { txt: "Se crea", bg: "#dcf3dc", fg: "#155c15" },
  existe: { txt: "Ya existe", bg: "hsl(var(--muted))", fg: "hsl(var(--muted-foreground))" },
  repetido: { txt: "Repetido", bg: "hsl(var(--muted))", fg: "hsl(var(--muted-foreground))" },
  error: { txt: "Error", bg: "#fde2e2", fg: "#8f1d1d" },
};

const clave = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[º°.:_\-/#()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const ES_NOMBRE = ["sector", "sectores", "nombre", "nombre del sector", "area", "areas", "servicio", "servicios", "descripcion", "sector nombre"];
const ES_ABREV = ["abreviatura", "abrev", "abreviacion", "sigla", "siglas", "codigo", "cod", "nombre corto", "corto", "short"];

async function leer(file: File): Promise<{ hoja: string; filas: { nombre: unknown; abreviatura: unknown; fila: number }[]; conEncabezado: boolean }> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", dense: true });
  for (const hoja of wb.SheetNames) {
    const ws = wb.Sheets[hoja];
    const filas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "", blankrows: true });
    const primera = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]).s.r + 1 : 1;
    if (!filas.some((f) => (f as unknown[]).some((v) => String(v).trim()))) continue;
    // Encabezado: la primera fila (de las 15 primeras) con una columna de nombre de sector.
    let idx = -1;
    let colN = 0;
    let colA = -1;
    for (let i = 0; i < Math.min(15, filas.length) && idx < 0; i++) {
      const f = (filas[i] as unknown[]).map(clave);
      const n = f.findIndex((h) => ES_NOMBRE.includes(h));
      if (n >= 0) {
        idx = i;
        colN = n;
        colA = f.findIndex((h) => ES_ABREV.includes(h));
      }
    }
    const datos = filas
      .map((f, i) => ({ arr: f as unknown[], fila: primera + i }))
      .slice(idx + 1)
      .map(({ arr, fila }) => ({ nombre: String(arr[colN] ?? "").trim(), abreviatura: colA >= 0 ? String(arr[colA] ?? "").trim() : "", fila }))
      .filter((x) => x.nombre || x.abreviatura);
    return { hoja, filas: datos, conEncabezado: idx >= 0 };
  }
  throw new Error("El archivo está vacío.");
}

async function plantilla() {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([["SECTOR", "ABREVIATURA"], ["Guardia Central", "GCE"], ["Farmacia", ""], ["Laboratorio", ""]]);
  ws["!cols"] = [{ wch: 34 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sectores");
  XLSX.writeFile(wb, "plantilla-sectores.xlsx", { compression: true });
}

async function api(filas: { nombre: unknown; abreviatura: unknown; fila: number }[], simular: boolean): Promise<Resultado> {
  const r = await fetch("/api/sectores/importar", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filas, simular }) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((b as { message?: string }).message || `Error ${r.status}`);
  return b as Resultado;
}

export function ImportarSectoresModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [lectura, setLectura] = useState<Awaited<ReturnType<typeof leer>> | null>(null);
  const [previa, setPrevia] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const elegir = async (f?: File | null) => {
    if (!f) return;
    setArchivo(f);
    setLectura(null);
    setPrevia(null);
    setError(null);
    setOcupado("Leyendo el archivo…");
    try {
      const l = await leer(f);
      setLectura(l);
      if (!l.filas.length) throw new Error("No encontré sectores en el archivo.");
      setOcupado("Revisando…");
      setPrevia(await api(l.filas, true));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  const importar = async () => {
    if (!lectura) return;
    setOcupado("Importando…");
    try {
      const r = await api(lectura.filas, false);
      avisar(`${r.resumen.nuevos} sector${r.resumen.nuevos === 1 ? "" : "es"} creado${r.resumen.nuevos === 1 ? "" : "s"}${r.resumen.existentes ? ` · ${r.resumen.existentes} ya existía${r.resumen.existentes === 1 ? "" : "n"} (omitido${r.resumen.existentes === 1 ? "" : "s"})` : ""}.`);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setOcupado(null);
    }
  };

  const r = previa?.resumen;
  return (
    <Modal
      titulo="Importar sectores desde Excel"
      onClose={onClose}
      ancho={720}
      pie={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>Cancelar</button>
          {previa && (
            <button type="button" className="btn btn-primary" disabled={Boolean(ocupado) || !r?.nuevos} onClick={() => void importar()}>
              {ocupado === "Importando…" ? "Importando…" : r?.nuevos ? `Crear ${r.nuevos} sector${r.nuevos === 1 ? "" : "es"}` : "No hay sectores nuevos"}
            </button>
          )}
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ ...S.small, fontSize: 13, flex: "1 1 340px" }}>
            Una fila por sector. Columna <strong>SECTOR</strong> (obligatoria) y, si querés, <strong>ABREVIATURA</strong>: si falta, se arma sola. Se crean <strong>activos</strong>; los que ya están cargados se omiten. Si el archivo no tiene encabezados, se toma la primera columna.
          </div>
          <button type="button" className="btn btn-quiet" onClick={() => void plantilla()}>
            <Download size={15} /> Descargar plantilla
          </button>
        </div>
        <div
          role="button"
          tabIndex={0}
          onClick={() => input.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
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
          style={{ border: `2px dashed ${arrastrando ? "hsl(var(--primary))" : "hsl(var(--border))"}`, borderRadius: 14, padding: "20px 16px", textAlign: "center", cursor: "pointer", background: arrastrando ? "hsl(var(--primary) / .06)" : "transparent" }}
        >
          <input ref={input} type="file" hidden accept=".xlsx,.xls,.xlsm,.xlsb,.ods,.csv,.txt" onChange={(e) => void elegir(e.target.files?.[0])} />
          {archivo ? (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
              <FileSpreadsheet size={22} />
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: 700 }}>{archivo.name}</div>
                <div style={S.small}>
                  {lectura ? `Hoja «${lectura.hoja}» · ${lectura.filas.length} fila${lectura.filas.length === 1 ? "" : "s"}${lectura.conEncabezado ? "" : " · sin encabezados: se usa la primera columna"}` : "…"} · tocá para elegir otro
                </div>
              </div>
            </div>
          ) : (
            <>
              <UploadCloud size={28} style={{ opacity: 0.7 }} />
              <div style={{ fontWeight: 700, marginTop: 6 }}>Arrastrá el archivo acá o tocá para elegirlo</div>
              <div style={S.small}>Excel (.xlsx, .xls, .xlsm, .xlsb), LibreOffice (.ods) o CSV</div>
            </>
          )}
        </div>
        {ocupado && <div style={S.small}>{ocupado}</div>}
        {error && <div className="form-error">{error}</div>}
        {previa && r && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
              {(
                [
                  ["Se crean", r.nuevos, "#155c15"],
                  ["Ya existen", r.existentes, undefined],
                  ["Repetidos", r.repetidos, undefined],
                  ["Con error", r.errores, r.errores ? "#b91c1c" : undefined],
                ] as const
              ).map(([k, v, c]) => (
                <div key={k} className="card" style={{ padding: "10px 12px", borderRadius: 12 }}>
                  <div style={S.label}>{k}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: c }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ maxHeight: 320, overflow: "auto", border: "1px solid hsl(var(--border))", borderRadius: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={S.th}>Fila</th>
                    <th style={S.th}>Sector</th>
                    <th style={S.th}>Abreviatura</th>
                    <th style={S.th}>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {[...previa.filas].sort((a, b) => ["error", "nuevo", "existe", "repetido"].indexOf(a.estado) - ["error", "nuevo", "existe", "repetido"].indexOf(b.estado) || a.fila - b.fila).map((f) => {
                    const m = EST[f.estado];
                    return (
                      <tr key={f.fila}>
                        <td style={{ ...S.td, fontFamily: "monospace" }}>{f.fila}</td>
                        <td style={S.td}>{f.nombre || <span style={S.small}>(vacío)</span>}</td>
                        <td style={{ ...S.td, fontFamily: "monospace" }}>{f.abreviatura}</td>
                        <td style={S.td}>
                          <Pill style={{ background: m.bg, color: m.fg }}>{m.txt}</Pill>
                          {f.mensaje && <div style={{ ...S.small, marginTop: 3 }}>{f.mensaje}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
