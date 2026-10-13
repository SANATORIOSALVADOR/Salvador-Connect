// Apariencia del sistema (logo, nombre, colores, tema claro/oscuro).
// Se aplica al importar el módulo con lo último guardado (sin parpadeo) y se refresca desde /api/apariencia.
import { useEffect, useState } from "react";

export type Tema = "claro" | "oscuro" | "sistema";

export type Apariencia = {
  nombre: string;
  subtitulo: string;
  logo: string | null;
  colorPrimario: string;
  colorMenu: string;
  temaPorDefecto: Tema;
  tituloLogin: string;
  mensajeLogin: string;
};

export const APARIENCIA_DEFAULT: Apariencia = {
  nombre: "Sanatorio del Salvador",
  subtitulo: "Sistema interno",
  logo: null,
  colorPrimario: "#208379",
  colorMenu: "#103b4c",
  temaPorDefecto: "claro",
  tituloLogin: "Una forma más serena de trabajar.",
  mensajeLogin: "",
};

const CACHE_KEY = "sc-apariencia";
const TEMA_KEY = "sc-tema"; // preferencia de cada persona en este navegador

// ---------- colores ----------

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** "#208379" → [h, s, l] (grados, %, %). */
export function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

const hsl = ([h, s, l]: [number, number, number]) => `${h} ${s}% ${l}%`;
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

/** Luminancia relativa (WCAG) para elegir texto claro u oscuro encima de un color. */
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ---------- tema ----------

export function temaGuardado(): Tema | null {
  try {
    const t = localStorage.getItem(TEMA_KEY);
    return t === "claro" || t === "oscuro" || t === "sistema" ? t : null;
  } catch {
    return null;
  }
}

export function guardarTema(t: Tema | null) {
  try {
    if (t) localStorage.setItem(TEMA_KEY, t);
    else localStorage.removeItem(TEMA_KEY);
  } catch {
    /* sin almacenamiento: solo esta sesión */
  }
  aplicar(actual);
  emit();
}

/** Tema efectivo: el que eligió la persona o, si no eligió, el del sistema. */
export function temaEfectivo(a: Apariencia = actual): "claro" | "oscuro" {
  const t = temaGuardado() ?? a.temaPorDefecto;
  if (t === "sistema") return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro";
  return t;
}

// ---------- aplicar ----------

function aplicar(a: Apariencia) {
  const root = document.documentElement;
  const oscuro = temaEfectivo(a) === "oscuro";
  root.classList.toggle("dark", oscuro);
  root.style.colorScheme = oscuro ? "dark" : "light";

  // Color principal: un poco más claro en oscuro para que contraste con el fondo.
  const [ph, ps, pl] = hexToHsl(a.colorPrimario);
  const prim: [number, number, number] = [ph, ps, oscuro ? clamp(pl + 10, 35, 65) : clamp(pl, 20, 50)];
  root.style.setProperty("--primary", hsl(prim));
  root.style.setProperty("--ring", hsl([ph, ps, clamp(prim[2] + 4, 20, 70)]));
  root.style.setProperty("--primary-foreground", luminance(a.colorPrimario) > 0.45 && !oscuro ? "198 35% 10%" : "42 35% 99%");

  // Menú lateral: fondo, borde y resaltado derivados del color elegido.
  const [mh, ms, ml] = hexToHsl(a.colorMenu);
  const base = oscuro ? clamp(ml - 8, 5, 16) : clamp(ml, 8, 40);
  const claroMenu = !oscuro && luminance(a.colorMenu) > 0.4;
  root.style.setProperty("--sidebar", hsl([mh, ms, base]));
  root.style.setProperty("--sidebar-accent", hsl([mh, clamp(ms, 10, 45), claroMenu ? base - 8 : base + 8]));
  root.style.setProperty("--sidebar-border", hsl([mh, clamp(ms - 8, 5, 40), claroMenu ? base - 12 : base + 10]));
  root.style.setProperty("--sidebar-foreground", claroMenu ? "198 34% 16%" : "39 28% 91%");

  // Nombre de la pestaña y favicon.
  document.title = a.subtitulo ? `${a.nombre} · ${a.subtitulo}` : a.nombre;
  let icon = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!icon) {
    icon = document.createElement("link");
    icon.rel = "icon";
    document.head.appendChild(icon);
  }
  icon.href = a.logo || "/favicon.svg";
  icon.type = a.logo ? a.logo.slice(5, a.logo.indexOf(";")) : "image/svg+xml";
}

// ---------- estado compartido ----------

function leerCache(): Apariencia {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? { ...APARIENCIA_DEFAULT, ...JSON.parse(raw) } : APARIENCIA_DEFAULT;
  } catch {
    return APARIENCIA_DEFAULT;
  }
}

let actual: Apariencia = leerCache();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function setApariencia(a: Apariencia) {
  actual = { ...APARIENCIA_DEFAULT, ...a };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(actual));
  } catch {
    /* logo muy grande para el almacenamiento local: se usa igual en memoria */
  }
  aplicar(actual);
  emit();
}

let pedido: Promise<void> | null = null;
export function refrescarApariencia(): Promise<void> {
  pedido ??= fetch("/api/apariencia", { credentials: "include" })
    .then((r) => (r.ok ? r.json() : null))
    .then((a) => {
      if (a) setApariencia(a);
    })
    .catch(() => undefined)
    .finally(() => {
      pedido = null;
    });
  return pedido;
}

/** Apariencia actual + tema efectivo; se actualiza cuando cambia. */
export function useApariencia() {
  const [, set] = useState(0);
  useEffect(() => {
    const fn = () => set((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return { apariencia: actual, tema: temaGuardado() ?? actual.temaPorDefecto, oscuro: temaEfectivo() === "oscuro" };
}

// Al cargar: aplicar lo guardado, pedir lo último al servidor y seguir el tema del sistema operativo.
if (typeof window !== "undefined") {
  aplicar(actual);
  void refrescarApariencia();
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    aplicar(actual);
    emit();
  });
}
