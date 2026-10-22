// Excel del inventario: leer (xlsx, xls, xlsm, xlsb, ods, csv), plantilla y exportar.
// SheetJS se carga recién cuando se usa (no pesa en el resto del sistema).

import { clave } from "./api";

export type Columna = { key: string; titulo: string; obligatoria: boolean; ayuda: string; sinonimos: string[] };

/** Las 7 columnas del inventario son obligatorias en el archivo; las demás son opcionales. */
export const COLUMNAS: Columna[] = [
  { key: "planta", titulo: "PLANTA", obligatoria: true, ayuda: "Ej.: Planta baja, 1° piso", sinonimos: ["planta", "piso", "nivel", "edificio"] },
  { key: "sector", titulo: "SECTOR", obligatoria: true, ayuda: "Tiene que existir en el sistema", sinonimos: ["sector", "servicio", "area"] },
  { key: "rubro", titulo: "RUBRO", obligatoria: true, ayuda: "Ej.: Electromedicina, Informática, Mobiliario", sinonimos: ["rubro", "categoria", "familia"] },
  { key: "tipo", titulo: "TIPO", obligatoria: true, ayuda: "Ej.: Monitor multiparamétrico, PC, Camilla", sinonimos: ["tipo", "tipo de equipo", "clase"] },
  { key: "descripcion", titulo: "DESCRIPCION", obligatoria: true, ayuda: "Qué es (modelo, detalle)", sinonimos: ["descripcion", "detalle", "equipo", "nombre", "articulo"] },
  { key: "marca", titulo: "MARCA", obligatoria: true, ayuda: "Puede quedar vacía", sinonimos: ["marca", "fabricante"] },
  {
    key: "codigoSerie",
    titulo: "CODIGO DE SERIE",
    obligatoria: true,
    ayuda: "Puede quedar vacío; si está, no se repite",
    sinonimos: ["codigo de serie", "cod de serie", "codigo serie", "cod serie", "nro de serie", "numero de serie", "n de serie", "no de serie", "serie", "serial", "sn", "n serie", "nro serie"],
  },
  { key: "estado", titulo: "ESTADO", obligatoria: false, ayuda: "Operativo, Con falla, En reparación, Fuera de servicio, Baja", sinonimos: ["estado", "condicion"] },
  { key: "frecuencia", titulo: "FRECUENCIA DE CONTROL", obligatoria: false, ayuda: "Mensual, Trimestral, Semestral, Anual… o días", sinonimos: ["frecuencia de control", "frecuencia", "control cada", "cada cuanto", "periodicidad"] },
  { key: "ultimoControl", titulo: "ULTIMO CONTROL", obligatoria: false, ayuda: "Fecha (dd/mm/aaaa)", sinonimos: ["ultimo control", "fecha ultimo control", "fecha de control", "ultima revision", "fecha control"] },
  { key: "observaciones", titulo: "OBSERVACIONES", obligatoria: false, ayuda: "Opcional", sinonimos: ["observaciones", "observacion", "obs", "notas", "comentarios"] },
];

export const EXTENSIONES = ".xlsx,.xls,.xlsm,.xlsb,.ods,.csv,.txt";

/** Encabezado comparable: sin tildes, signos ni espacios de más ("Nº de Serie" → "n de serie"). */
function normalizarEncabezado(v: unknown): string {
  return clave(String(v ?? ""))
    .replace(/[º°.:_\-/#()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function columnaDe(encabezado: unknown): Columna | undefined {
  const h = normalizarEncabezado(encabezado);
  if (!h) return undefined;
  return COLUMNAS.find((c) => c.sinonimos.includes(h)) ?? COLUMNAS.find((c) => c.sinonimos.some((s) => s.length > 4 && h.startsWith(s)));
}

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Fecha de una celda: Date, número de serie de Excel, "dd/mm/aaaa" o "aaaa-mm-dd". */
function fechaCelda(v: unknown, XLSX: typeof import("xlsx")): string {
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : isoLocal(v);
  if (typeof v === "number") {
    const p = XLSX.SSF.parse_date_code(v);
    return p ? `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}` : "";
  }
  const t = String(v).trim();
  let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return t; // la API avisa que no es una fecha válida
}

export type Lectura = {
  hoja: string;
  filaEncabezado: number;
  encabezados: string[];
  reconocidas: { columna: Columna; encabezado: string }[];
  faltan: Columna[];
  ignoradas: string[];
  filas: Record<string, unknown>[];
};

/** Lee el archivo y busca la hoja y la fila de encabezados con las columnas del inventario. */
export async function leerArchivo(file: File): Promise<Lectura> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true, dense: true });
  let mejor: Lectura | null = null;
  for (const nombre of wb.SheetNames) {
    const ws = wb.Sheets[nombre];
    // Con las filas vacías incluidas, el índice + la primera fila de la hoja = número de fila del Excel.
    const filas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "", blankrows: true });
    const primera = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]).s.r + 1 : 1;
    // Encabezado: la primera fila (de las 15 primeras) con más columnas reconocidas.
    let idx = -1;
    let max = 0;
    filas.slice(0, 25).forEach((f, i) => {
      const n = new Set((f as unknown[]).map(columnaDe).filter(Boolean)).size;
      if (n > max) {
        max = n;
        idx = i;
      }
    });
    if (idx < 0) continue;
    const encabezados = (filas[idx] as unknown[]).map((v) => String(v ?? "").trim());
    const pos = new Map<string, number>();
    const reconocidas: Lectura["reconocidas"] = [];
    const ignoradas: string[] = [];
    encabezados.forEach((h, i) => {
      const c = columnaDe(h);
      if (c && !pos.has(c.key)) {
        pos.set(c.key, i);
        reconocidas.push({ columna: c, encabezado: h });
      } else if (h) ignoradas.push(h);
    });
    const datos = filas
      .slice(idx + 1)
      .map((f, j) => {
        const arr = f as unknown[];
        const o: Record<string, unknown> = {};
        Object.defineProperty(o, "fila", { value: primera + idx + 1 + j, enumerable: false });
        for (const [k, i] of pos) {
          const v = arr[i];
          o[k] = k === "ultimoControl" ? fechaCelda(v, XLSX) : v instanceof Date ? isoLocal(v) : typeof v === "string" ? v.trim() : v ?? "";
        }
        return o;
      })
      .filter((o) => Object.values(o).some((v) => v !== "" && v !== null && v !== undefined))
      .map((o) => ({ ...o, fila: (o as { fila?: number }).fila }));
    const lectura: Lectura = { hoja: nombre, filaEncabezado: primera + idx, encabezados, reconocidas, faltan: COLUMNAS.filter((c) => c.obligatoria && !pos.has(c.key)), ignoradas, filas: datos };
    if (!mejor || lectura.faltan.length < mejor.faltan.length || (lectura.faltan.length === mejor.faltan.length && datos.length > mejor.filas.length)) mejor = lectura;
  }
  if (!mejor) throw new Error("No encontré una hoja con encabezados en el archivo.");
  return mejor;
}

function descargarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Exporta filas (objetos con encabezados como claves) a Excel o CSV (separado por ";" para Excel en español). */
export async function exportar(filas: Record<string, unknown>[], nombre: string, formato: "xlsx" | "csv", hoja = "Inventario") {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(filas);
  const cols = Object.keys(filas[0] ?? {});
  ws["!cols"] = cols.map((c) => ({ wch: Math.min(50, Math.max(c.length + 2, ...filas.slice(0, 300).map((f) => String(f[c] ?? "").length + 1))) }));
  if (formato === "csv") {
    const csv = XLSX.utils.sheet_to_csv(ws, { FS: ";" });
    descargarBlob(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), `${nombre}.csv`);
    return;
  }
  ws["!autofilter"] = { ref: ws["!ref"] ?? "A1" };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, hoja.slice(0, 31));
  XLSX.writeFile(wb, `${nombre}.xlsx`, { compression: true });
}

/** Plantilla con las columnas, un ejemplo y una hoja de instrucciones con los sectores válidos. */
export async function descargarPlantilla(sectores: string[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const titulos = COLUMNAS.map((c) => c.titulo);
  const ejemplo = ["Planta baja", sectores[0] ?? "Guardia Central", "Electromedicina", "Monitor multiparamétrico", "Monitor de signos vitales 12\"", "Mindray", "SN-000123", "Operativo", "Semestral", "15/03/2026", ""];
  const ws = XLSX.utils.aoa_to_sheet([titulos, ejemplo]);
  ws["!cols"] = COLUMNAS.map((c) => ({ wch: Math.max(c.titulo.length + 4, 18) }));
  XLSX.utils.book_append_sheet(wb, ws, "Inventario");
  const ins = [
    ["Cómo completar la planilla del inventario"],
    [""],
    ["Columna", "¿Obligatoria?", "Qué va"],
    ...COLUMNAS.map((c) => [c.titulo, c.obligatoria ? (c.key === "marca" || c.key === "codigoSerie" ? "Sí (la columna; el dato puede quedar vacío)" : "Sí") : "No", c.ayuda]),
    [""],
    ["• Cada fila es un equipo o bien. La primera fila tiene que tener los nombres de las columnas."],
    ["• El SECTOR tiene que estar escrito como en el sistema (mayúsculas y tildes no importan)."],
    ["• Si el CÓDIGO DE SERIE ya existe, podés elegir actualizar ese equipo en lugar de cargarlo de nuevo."],
    ["• Antes de guardar, el sistema muestra qué filas tienen errores y por qué."],
    [""],
    ["Sectores válidos"],
    ...sectores.map((s) => [s]),
  ];
  const wsi = XLSX.utils.aoa_to_sheet(ins);
  wsi["!cols"] = [{ wch: 26 }, { wch: 42 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsi, "Instrucciones");
  XLSX.writeFile(wb, "plantilla-inventario.xlsx", { compression: true });
}
