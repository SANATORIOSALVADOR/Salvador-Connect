// Pruebas de la lógica de Guardias (apps/web/src/pages/guardias/logic.ts): horas, nocturnas, huecos, estadísticas.
// Uso: node tests/web-logic.test.mjs
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// esbuild viene con la API: se resuelve desde apps/api.
const { buildSync } = createRequire(path.join(raiz, "apps/api/package.json"))("esbuild");
const salida = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sc-logic-")), "logic.mjs");
buildSync({ entryPoints: [path.join(raiz, "apps/web/src/pages/guardias/logic.ts")], format: "esm", outfile: salida, logLevel: "warning" });
const L = await import(pathToFileURL(salida).href);
let ok = 0, bad = 0;
const eq = (d, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); s ? ok++ : bad++; console.log((s ? "  OK   " : "  FAIL ") + d + (s ? "" : ` :: ${JSON.stringify(a)} != ${JSON.stringify(b)}`)); };
const G = (o) => L.normalizeGuardia({ id: Math.random(), sectorId: 1, sectorName: "UTI", professionalName: "A", observations: "", modality: "activa", ...o });
const cfg24 = { sectorId: 1, name: "UTI", configured: true, active: true, cobertura: [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, start: "00:00", end: "24:00" })) };
const cfgSimple = { sectorId: 2, name: "Piso", configured: true, active: true, cobertura: [] };
// 2026-10-05 es lunes
const n1 = G({ date: "2026-10-05", startTime: "20:00", endTime: "08:00" });
eq("nocturna normalizada", n1.endDate, "2026-10-06");
eq("horas nocturna", L.hoursOfGuardia(n1), 12);
eq("tramo día 1", L.intervalOnDay(n1, "2026-10-05"), [1200, 1440]);
eq("tramo día 2", L.intervalOnDay(n1, "2026-10-06"), [0, 480]);
const d1 = G({ date: "2026-10-05", startTime: "08:00", endTime: "20:00" });
let c = L.dayCoverage([n1, d1], "2026-10-05", [cfg24], "2026-12-31");
eq("UTI 24h: 08-20 + 20-08 cubre el lunes salvo 00-08", L.describeGaps(c.sectors[0]), "00:00–08:00");
eq("estado baja", c.status, "baja");
c = L.dayCoverage([n1], "2026-10-06", [cfg24], "2026-12-31");
eq("martes: solo 00-08 cubierto", L.describeGaps(c.sectors[0]), "08:00–24:00");
c = L.dayCoverage([], "2026-10-07", [cfg24, cfgSimple], "2026-12-31");
eq("sin nadie = sin", c.status, "sin");
c = L.dayCoverage([], "2026-11-20", [cfg24], "2026-10-31");
eq("después del horizonte = futuro", c.status, "futuro");
const lv = { sectorId: 3, name: "Gineco", configured: true, active: true, cobertura: [1, 2, 3, 4, 5].map((dow) => ({ dow, start: "08:00", end: "20:00" })) };
c = L.dayCoverage([], "2026-10-04", [lv], "2026-12-31"); // domingo
eq("domingo sin requisito = vacio", c.status, "vacio");
eq("restar intervalos", L.subtractIntervals([[0, 1440]], [[100, 200], [150, 300], [1000, 1500]]), [[0, 100], [300, 1000]]);
const m = G({ date: "2026-10-31", startTime: "20:00", endTime: "08:00", professionalId: 7, professionalName: "B", tagLabel: "GUARDIA EXTRA" });
const p = G({ date: "2026-10-10", startTime: "08:00", endTime: "14:00", modality: "pasiva", professionalId: 7, professionalName: "B" });
const st = L.computeStats([m, p], "2026-10-01", "2026-10-31", [], "2026-10-31", [m, p]);
eq("horas en octubre (4 + 6)", st.people[0].horas, 10);
eq("activas / pasivas", [st.people[0].horasActivas, st.people[0].horasPasivas], [4, 6]);
eq("nocturnas / extras", [st.people[0].nocturnas, st.people[0].extras], [1, 1]);
const stNov = L.computeStats([m], "2026-11-01", "2026-11-30", [], "2026-11-30", [m]);
eq("horas en noviembre (8)", stNov.people[0].horas, 8);
const cov = L.computeStats([d1, n1], "2026-10-05", "2026-10-05", [cfg24], "2026-10-05", [d1, n1]);
eq("% cobertura del lunes (16 de 24 h)", cov.sectors[0].cobertura, 66.7);
const now = new Date(2026, 9, 6, 3, 0);
eq("de guardia ahora (madrugada martes)", L.isActiveAt(n1, now), true);
eq("no está ahora", L.isActiveAt(d1, now), false);
console.log(`\nRESULTADO: ${ok} OK, ${bad} FALLAS`);
process.exit(bad ? 1 : 0);
