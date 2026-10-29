import { eq } from "drizzle-orm";
import { appSettingsTable, db } from "@salvador/db";
import { PERMISSION_MODULES } from "./auth";

// Módulos desactivados para todo el sistema (Configuración → Módulos). Un módulo desactivado no aparece en el menú
// de nadie (salvo el superadmin, que lo sigue viendo para revisarlo) y la API lo trata como sin acceso.
// Se guarda en app_settings["modulos"] = { desactivados: [...] }.

const CLAVE = "modulos";
/** Inicio no se puede desactivar: es la pantalla a la que entra todo el mundo. */
export const NO_DESACTIVABLES = ["dashboard"];

let cache: { at: number; desactivados: Set<string> } | null = null;
const TTL = 30_000;

export async function modulosDesactivados(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < TTL) return cache.desactivados;
  try {
    const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, CLAVE)).limit(1);
    const lista = Array.isArray((row?.value as { desactivados?: unknown } | undefined)?.desactivados) ? ((row!.value as { desactivados: unknown[] }).desactivados as unknown[]) : [];
    cache = { at: Date.now(), desactivados: new Set(lista.map(String).filter((k) => PERMISSION_MODULES[k] && !NO_DESACTIVABLES.includes(k))) };
  } catch (err) {
    console.error("[modulos]", err);
    cache = { at: Date.now(), desactivados: new Set() };
  }
  return cache.desactivados;
}

export async function guardarDesactivados(lista: string[]): Promise<Set<string>> {
  const limpios = [...new Set(lista)].filter((k) => PERMISSION_MODULES[k] && !NO_DESACTIVABLES.includes(k)).sort();
  await db
    .insert(appSettingsTable)
    .values({ key: CLAVE, value: { desactivados: limpios } })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: { desactivados: limpios }, updatedAt: new Date() } });
  cache = { at: Date.now(), desactivados: new Set(limpios) };
  return cache.desactivados;
}
