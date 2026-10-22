import { and, inArray, sql } from "drizzle-orm";
import { db, invItemsTable } from "@salvador/db";
import { hoyIso, visibleSectorIds, type AuthUser } from "./auth";

/** Números del inventario que ve la persona (Inicio, avisos y resumen). Sin módulo: null. */
export async function resumenInventario(user: AuthUser): Promise<{ total: number; vencidos: number; porVencer: number; conFalla: number; enReparacion: number } | null> {
  try {
    return await calcular(user);
  } catch (err) {
    // Que un problema del inventario no tire abajo Inicio ni las notificaciones.
    console.error("[inventario.resumen]", err);
    return null;
  }
}

async function calcular(user: AuthUser): Promise<{ total: number; vencidos: number; porVencer: number; conFalla: number; enReparacion: number }> {
  const ids = visibleSectorIds(user, "inventario");
  if (ids && !ids.length) return { total: 0, vencidos: 0, porVencer: 0, conFalla: 0, enReparacion: 0 };
  const hoy = hoyIso();
  const [r] = await db
    .select({
      total: sql<number>`count(*)::int`,
      vencidos: sql<number>`count(*) filter (where ${invItemsTable.proximoControl} < ${hoy})::int`,
      porVencer: sql<number>`count(*) filter (where ${invItemsTable.proximoControl} >= ${hoy} and ${invItemsTable.proximoControl} <= (${hoy}::date + 7))::int`,
      conFalla: sql<number>`count(*) filter (where ${invItemsTable.estado} = 'con_falla')::int`,
      enReparacion: sql<number>`count(*) filter (where ${invItemsTable.estado} = 'en_reparacion')::int`,
    })
    .from(invItemsTable)
    .where(and(sql`${invItemsTable.estado} <> 'baja'`, ids ? inArray(invItemsTable.sectorId, ids) : undefined));
  return {
    total: Number(r?.total ?? 0),
    vencidos: Number(r?.vencidos ?? 0),
    porVencer: Number(r?.porVencer ?? 0),
    conFalla: Number(r?.conFalla ?? 0),
    enReparacion: Number(r?.enReparacion ?? 0),
  };
}
