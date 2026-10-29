// Configuración: tipos, llamadas a la API y ayudas compartidas por todas las secciones (sin React).

import { ACCIONES, MODULES, accionesDeNivel, mismasAcciones, ordenarAcciones, type Alcance, type Level, type ModuleScope } from "@/lib/permisos";

export type Sector = { id: number; name: string; shortName: string; active: boolean };

export type Persona = {
  id: number;
  username: string;
  name: string;
  email: string | null;
  role: "superadmin" | "usuario";
  legacyRole: string | null;
  active: boolean;
  mustChangePassword: boolean;
  permissions: Record<string, Level>;
  scopes?: Record<string, ModuleScope>;
  sectorIds: number[];
  perfilId?: number | null;
  perfilNombre?: string | null;
  excepciones?: string[];
  acciones?: Record<string, string[]>;
  accesoHasta?: string | null;
  accesoVencido?: boolean;
  vencimientos?: Record<string, string>;
  vencidos?: { modulo: string; hasta: string }[];
  lastLoginAt: string | null;
  createdAt: string;
};

export type Perfil = {
  id: number;
  nombre: string;
  descripcion: string;
  permisos: Record<string, Level>;
  alcances: Record<string, Alcance>;
  acciones: Record<string, string[]>;
  usuarios: number;
  sinSectores: string[];
};

export type Movimiento = { id: number; userId: number | null; userNombre: string; perfilId: number | null; perfilNombre: string; actorNombre: string; accion: string; detalle: string; createdAt: string };

export type EstadoModulos = { desactivados: string[]; noDesactivables: string[] };

/**
 * Accesos editables (de una persona o de un perfil). En un perfil, `scopes` solo usa el tipo de alcance:
 * los sectores concretos se eligen en cada persona.
 */
export type Accesos = {
  permisos: Record<string, Level>;
  scopes: Record<string, ModuleScope>;
  /** Solo los módulos con acciones distintas a las típicas de su nivel. */
  acciones: Record<string, string[]>;
  /** Permisos temporarios (solo personas). */
  vencimientos: Record<string, string>;
};

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? "GET",
    credentials: "include",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error((b as { message?: string }).message || `Error ${res.status}`);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

export function claveAleatoria(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const arr = new Uint32Array(10);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

/** "Juan Pérez" → "jperez" (sugerencia de usuario para ingresar). */
export function sugerirUsuario(nombre: string): string {
  const p = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (!p.length) return "";
  return p.length === 1 ? p[0] : `${p[0][0]}${p[p.length - 1]}`;
}

export const iniciales = (n: string) =>
  (n || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();

export const fechaAr = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

/** "hace 3 días", "hoy 10:24", "nunca" */
export function hace(iso: string | null | undefined): string {
  if (!iso) return "Nunca";
  const d = new Date(iso);
  const dias = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const hora = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  if (dias <= 0 && new Date().toDateString() === d.toDateString()) return `Hoy ${hora}`;
  if (dias <= 1) return `Ayer ${hora}`;
  if (dias < 30) return `Hace ${dias} días`;
  return d.toLocaleDateString("es-AR");
}

/** Alcance de una persona vieja que solo tenía "sectores a cargo" (lo de antes = ve todo, carga en esos). */
export function scopesDe(x: { permissions: Record<string, Level>; scopes?: Record<string, ModuleScope>; sectorIds?: number[] }): Record<string, ModuleScope> {
  if (x.scopes) return JSON.parse(JSON.stringify(x.scopes));
  const out: Record<string, ModuleScope> = {};
  if (x.sectorIds?.length) for (const m of MODULES) if (m.sectores && x.permissions[m.key]) out[m.key] = { alcance: "carga", sectorIds: [...x.sectorIds] };
  return out;
}

/** Solo los módulos cuyas acciones difieren de las típicas de su nivel. */
export function accionesAMedida(permisos: Record<string, Level>, acciones?: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [mod, lista] of Object.entries(acciones ?? {})) {
    const nivel = permisos[mod];
    if (!nivel) continue;
    const ord = ordenarAcciones(mod, lista);
    if (!mismasAcciones(ord, accionesDeNivel(mod, nivel))) out[mod] = ord;
  }
  return out;
}

export const accionesEfectivas = (mod: string, nivel: Level, aMedida?: string[]) => (aMedida ? ordenarAcciones(mod, aMedida) : accionesDeNivel(mod, nivel));
export const etiquetaAccion = (mod: string, k: string) => ACCIONES[mod]?.find((a) => a.key === k)?.label ?? k;

export function accesosDePersona(p: Persona): Accesos {
  return { permisos: { ...p.permissions }, scopes: scopesDe(p), acciones: accionesAMedida(p.permissions, p.acciones), vencimientos: { ...(p.vencimientos ?? {}) } };
}

export function accesosDePerfil(p: Perfil | null): Accesos {
  if (!p) return { permisos: { dashboard: "ver" }, scopes: {}, acciones: {}, vencimientos: {} };
  const scopes: Record<string, ModuleScope> = {};
  for (const [k, a] of Object.entries(p.alcances ?? {})) if (p.permisos[k] && a !== "todos") scopes[k] = { alcance: a, sectorIds: [] };
  return { permisos: { ...p.permisos }, scopes, acciones: JSON.parse(JSON.stringify(p.acciones ?? {})), vencimientos: {} };
}

/** Aplica un perfil conservando los sectores ya elegidos en cada módulo. */
export function aplicarPerfil(p: Perfil, actual: Accesos): Accesos {
  const base = accesosDePerfil(p);
  for (const [k, sc] of Object.entries(base.scopes)) sc.sectorIds = actual.scopes[k]?.sectorIds ?? [];
  return base;
}

/** ¿El módulo difiere del perfil (nivel, acciones o tipo de alcance)? = excepción. */
export function esExcepcion(mod: string, a: Accesos, p: Perfil | null): boolean {
  if (!p) return false;
  const nivel = a.permisos[mod] ?? null;
  if (nivel !== (p.permisos[mod] ?? null)) return true;
  if (!nivel) return false;
  if (!mismasAcciones(accionesEfectivas(mod, nivel, a.acciones[mod]), accionesEfectivas(mod, nivel, p.acciones?.[mod]))) return true;
  const m = MODULES.find((x) => x.key === mod);
  return Boolean(m?.sectores && (a.scopes[mod]?.alcance ?? "todos") !== (p.alcances[mod] ?? "todos"));
}

/** Módulo con alcance por sectores pero sin ningún sector elegido (no vería nada). */
export function faltanSectores(a: Accesos): string | null {
  const m = MODULES.find((x) => x.sectores && a.permisos[x.key] && a.scopes[x.key] && a.scopes[x.key].alcance !== "todos" && !a.scopes[x.key].sectorIds.length);
  return m ? m.label : null;
}

/** Cuerpo para crear / guardar una persona. */
export function cuerpoPersona(d: { name: string; username: string; email: string; active: boolean; role: "superadmin" | "usuario"; accesoHasta: string; perfilId: number | null }, a: Accesos, perfil: Perfil | null) {
  const sa = d.role === "superadmin";
  return {
    name: d.name.trim(),
    username: d.username.trim(),
    email: d.email.trim() || null,
    active: d.active,
    role: d.role,
    accesoHasta: d.accesoHasta || null,
    perfilId: sa ? null : d.perfilId,
    permissions: sa ? {} : a.permisos,
    scopes: sa ? {} : Object.fromEntries(Object.entries(a.scopes).filter(([k]) => a.permisos[k])),
    acciones: sa ? {} : Object.fromEntries(Object.entries(a.acciones).filter(([k]) => a.permisos[k])),
    vencimientos: sa ? {} : Object.fromEntries(Object.entries(a.vencimientos).filter(([k, v]) => v && a.permisos[k] && (!perfil || esExcepcion(k, a, perfil)))),
  };
}

/** Estado de una persona, para chips y filtros. */
export type EstadoPersona = "activa" | "primer_acceso" | "vencida" | "inactiva";
export function estadoDe(p: Persona): EstadoPersona {
  if (!p.active) return "inactiva";
  if (p.accesoVencido) return "vencida";
  if (p.mustChangePassword) return "primer_acceso";
  return "activa";
}
export const ESTADO_PERSONA: Record<EstadoPersona, { label: string; bg: string; fg: string }> = {
  activa: { label: "Activa", bg: "hsl(155 55% 88%)", fg: "hsl(155 60% 24%)" },
  primer_acceso: { label: "Primer acceso pendiente", bg: "hsl(40 90% 90%)", fg: "hsl(35 70% 30%)" },
  vencida: { label: "Acceso vencido", bg: "hsl(0 70% 92%)", fg: "hsl(0 60% 35%)" },
  inactiva: { label: "Inactiva", bg: "hsl(0 0% 90%)", fg: "hsl(0 0% 35%)" },
};

/** Días hasta una fecha (negativo = ya pasó). */
export function diasHasta(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const hoy = new Date();
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())) / 86_400_000);
}
