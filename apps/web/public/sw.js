// Service worker de la app instalable.
// - Pantallas: primero la red; sin conexión, la última versión guardada (la app abre igual).
//   En mantenimiento (503) se muestra lo que manda el servidor y no se guarda.
// - Archivos con hash (/assets/…): se guardan y se sirven desde la caché (nunca cambian).
// - /api/guardias y /api/apariencia: primero la red (espera 4 s); sin conexión, la última respuesta
//   guardada, así "De guardia ahora" se ve aunque se corte la red. Se borra al cerrar sesión.
// - El resto de la API nunca se guarda.

const VERSION = "v1";
const SHELL = `sc-shell-${VERSION}`;
const ASSETS = `sc-assets-${VERSION}`;
const API = `sc-api-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/", "/favicon.svg", "/manifest.webmanifest"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, ASSETS, API].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "logout") event.waitUntil(caches.delete(API));
});

function conTimeout(promesa, ms) {
  return new Promise((ok, mal) => {
    const t = setTimeout(() => mal(new Error("timeout")), ms);
    promesa.then((r) => (clearTimeout(t), ok(r)), (e) => (clearTimeout(t), mal(e)));
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Pantallas de la app (navegación).
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((r) => {
          // Solo se guarda la app de verdad: nunca la pantalla de mantenimiento ni un error.
          if (r.ok && !new URL(r.url || req.url).pathname.startsWith("/estado/")) {
            const copia = r.clone();
            caches.open(SHELL).then((c) => c.put("/", copia));
          }
          return r;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  // Archivos con hash: inmutables.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((r) => {
            if (r.ok) {
              const copia = r.clone();
              caches.open(ASSETS).then((c) => c.put(req, copia));
            }
            return r;
          }),
      ),
    );
    return;
  }

  // API de guardias y apariencia: red primero, copia como respaldo.
  if (url.pathname === "/api/guardias" || url.pathname === "/api/guardias/config" || url.pathname === "/api/apariencia") {
    event.respondWith(
      conTimeout(fetch(req), 4000)
        .then(async (r) => {
          if (r.ok) {
            const copia = r.clone();
            caches.open(API).then((c) => c.put(req, copia));
            return r;
          }
          // Servidor caído (502/503/504): mejor la última copia que un error.
          if (r.status >= 500) return (await caches.open(API).then((c) => c.match(req))) || r;
          return r;
        })
        .catch(() => caches.open(API).then((c) => c.match(req)).then((hit) => hit || Response.error())),
    );
  }
});
