// Detecta cuando el sistema está caído o en mantenimiento mirando las respuestas de /api.
// El nginx de la web responde 503 con {"codigo":"caido"} si el API no contesta y
// {"codigo":"mantenimiento"} si está prendido el modo mantenimiento (deploy/nginx.conf).

export type EstadoSistema = "caido" | "mantenimiento";
export const EVENTO_ESTADO = "sc-estado-sistema";

/** fetch original (sin vigilar): lo usan las pantallas de estado para sus pruebas. */
export const fetchOriginal: typeof fetch = typeof window !== "undefined" ? window.fetch.bind(window) : fetch;

function avisar(estado: EstadoSistema) {
  window.dispatchEvent(new CustomEvent<EstadoSistema>(EVENTO_ESTADO, { detail: estado }));
}

/** ¿Qué indica esta respuesta de /api? (null = nada raro). Exportada para las pruebas. */
export function clasificarRespuesta(status: number, codigo: string | null | undefined): EstadoSistema | null {
  if (codigo === "mantenimiento") return "mantenimiento";
  if (codigo === "caido") return "caido";
  if (status === 502 || status === 504) return "caido";
  return null;
}

function esApiPropia(input: RequestInfo | URL): boolean {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(raw, window.location.href);
    return u.origin === window.location.origin && u.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

let instalado = false;

/** Envuelve window.fetch una sola vez (se llama en main.tsx antes de dibujar la app). */
export function vigilarEstadoSistema() {
  if (instalado || typeof window === "undefined") return;
  instalado = true;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const api = esApiPropia(input);
    try {
      const r = await fetchOriginal(input, init);
      if (api && r.status >= 502 && r.status <= 504) {
        const codigo = await r
          .clone()
          .json()
          .then((d: { codigo?: string } | null) => d?.codigo ?? null)
          .catch(() => null);
        const estado = clasificarRespuesta(r.status, codigo);
        if (estado) avisar(estado);
      }
      return r;
    } catch (err) {
      // Sin respuesta del servidor (red cortada, contenedor web caído). Las cancelaciones no cuentan.
      if (api && (err as Error)?.name !== "AbortError") avisar("caido");
      throw err;
    }
  };
}

/** Prueba de salud del API (con tiempo límite). */
export async function sistemaResponde(ms = 4500): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetchOriginal(`/api/health?_=${Date.now()}`, { cache: "no-store", signal: ctrl.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export type AvisoMantenimiento = { mensaje?: string; hasta?: string; desde?: string };

/** null = no hay mantenimiento prendido. */
export async function leerMantenimiento(): Promise<AvisoMantenimiento | null> {
  try {
    const r = await fetchOriginal(`/estado/mantenimiento.json?_=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as AvisoMantenimiento;
  } catch {
    return null;
  }
}

/** "hoy a las 18:30" / "jueves 16 de octubre a las 9:00". */
export function textoHasta(iso: string | undefined, ahora = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hora = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  const mismoDia = d.toDateString() === ahora.toDateString();
  return `${mismoDia ? "hoy" : d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })} a las ${hora}`;
}
