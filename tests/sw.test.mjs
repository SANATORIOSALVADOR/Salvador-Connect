// Pruebas del service worker (apps/web/public/sw.js) con caché, red y eventos simulados.
// Uso: node tests/sw.test.mjs
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const codigo = fs.readFileSync(path.join(raiz, "apps/web/public/sw.js"), "utf8");
let ok = 0, mal = 0;
const eq = (d, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); s ? ok++ : mal++; console.log((s ? "  OK   " : "  FAIL ") + d + (s ? "" : `  →  ${JSON.stringify(a)} != ${JSON.stringify(b)}`)); };

// ---- caché simulada ----
const almacen = new Map(); // nombre → Map(url → Response)
const keyOf = (r) => (typeof r === "string" ? new URL(r, "http://x").pathname + new URL(r, "http://x").search : new URL(r.url).pathname + new URL(r.url).search);
const caches = {
  open: async (n) => { if (!almacen.has(n)) almacen.set(n, new Map()); const m = almacen.get(n); return { put: async (r, res) => m.set(keyOf(r), res), match: async (r) => m.get(keyOf(r)), addAll: async (urls) => urls.forEach((u) => m.set(keyOf(u), new Response("cache:" + u))) }; },
  keys: async () => [...almacen.keys()],
  delete: async (n) => almacen.delete(n),
  match: async (r) => { for (const m of almacen.values()) { const h = m.get(keyOf(r)); if (h) return h; } },
};

// ---- red simulada ----
let modoRed = "ok"; // ok | caida (sin red) | 502
const fetchSim = async (req) => {
  const url = typeof req === "string" ? req : req.url;
  if (modoRed === "caida") throw new TypeError("Failed to fetch");
  if (modoRed === "502") return new Response("bad gateway", { status: 502 });
  if (modoRed === "mantenimiento") return new Response("Estamos haciendo mantenimiento", { status: 503 });
  return new Response("red:" + new URL(url, "http://localhost").pathname, { status: 200 });
};

const handlers = {};
const self = { addEventListener: (t, fn) => (handlers[t] = fn), skipWaiting: () => {}, clients: { claim: () => {} }, location: { origin: "http://localhost" } };
vm.runInNewContext(codigo, { self, caches, fetch: fetchSim, Response, URL, setTimeout, clearTimeout, Promise, console });

async function pedir(path, opts = {}) {
  let respuesta = null;
  const req = { url: "http://localhost" + path, method: opts.method || "GET", mode: opts.mode || "cors" };
  handlers.fetch({ request: req, respondWith: (p) => (respuesta = p) });
  if (!respuesta) return "(no intercepta)";
  const r = await respuesta;
  await new Promise((s) => setTimeout(s, 10)); // deja terminar los put en caché
  return r.type === "error" ? "(error de red)" : `${r.status} ${await r.clone().text()}`;
}

// install + activate
await new Promise((res) => handlers.install({ waitUntil: (p) => p.then(res) }));
almacen.set("sc-viejo-v0", new Map());
await new Promise((res) => handlers.activate({ waitUntil: (p) => p.then(res) }));
eq("activate borra cachés viejas", [...almacen.keys()].includes("sc-viejo-v0"), false);

eq("navegación con red", await pedir("/guardias", { mode: "navigate" }), "200 red:/guardias");
modoRed = "caida";
eq("navegación sin red → app guardada", (await pedir("/guardias", { mode: "navigate" })).startsWith("200 red:/guardias"), true);
modoRed = "ok";

// Mantenimiento: se muestra lo que manda el servidor, pero no reemplaza la copia guardada de la app.
modoRed = "mantenimiento";
eq("navegación en mantenimiento → pantalla del servidor", await pedir("/dashboard", { mode: "navigate" }), "503 Estamos haciendo mantenimiento");
modoRed = "caida";
eq("después, sin red → sigue la app guardada (no la de mantenimiento)", (await pedir("/dashboard", { mode: "navigate" })).startsWith("200 red:/guardias"), true);
modoRed = "ok";

eq("asset con red", await pedir("/assets/index-abc.js"), "200 red:/assets/index-abc.js");
modoRed = "caida";
eq("asset sin red → desde caché", await pedir("/assets/index-abc.js"), "200 red:/assets/index-abc.js");
modoRed = "ok";

eq("API de guardias con red", await pedir("/api/guardias?from=a&to=b"), "200 red:/api/guardias");
modoRed = "caida";
eq("API de guardias sin red → última copia", await pedir("/api/guardias?from=a&to=b"), "200 red:/api/guardias");
modoRed = "502";
eq("API de guardias con servidor caído (502) → última copia", await pedir("/api/guardias?from=a&to=b"), "200 red:/api/guardias");
eq("API de guardias sin copia y servidor caído → 502", await pedir("/api/guardias?from=x&to=y"), "502 bad gateway");
modoRed = "ok";

eq("otras APIs no se interceptan (nunca se guardan)", await pedir("/api/users"), "(no intercepta)");
eq("POST no se intercepta", await pedir("/api/guardias", { method: "POST" }), "(no intercepta)");

await new Promise((res) => handlers.message({ data: "logout", waitUntil: (p) => p.then(res) }));
eq("al cerrar sesión se borran los datos de la API", [...almacen.keys()].some((k) => k.startsWith("sc-api")), false);
modoRed = "caida";
eq("después del logout, sin red no hay datos viejos", await pedir("/api/guardias?from=a&to=b"), "(error de red)");

console.log(`\nRESULTADO: ${ok} OK, ${mal} FALLAS`);
process.exit(mal ? 1 : 0);
