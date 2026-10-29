import { sql } from "drizzle-orm";
import { db, medCancelacionesTable } from "@salvador/db";
import { addDaysIso, Feriados } from "./administracion";
import { hoyIso } from "./auth";

// Medical → Cancelaciones Médicos: reglas compartidas por el formulario público y la bandeja del personal.

export const ANTICIPACION_MINIMA = 15; // días hábiles

export const MOTIVOS = ["formacion", "vacaciones", "personales", "licencia"] as const;
export type Motivo = (typeof MOTIVOS)[number];
export const MOTIVO_LABEL: Record<Motivo, string> = {
  formacion: "Formación profesional",
  vacaciones: "Vacaciones",
  personales: "Motivos personales",
  licencia: "Licencia médica",
};
/** Motivos que llevan constancia (inscripción al congreso / certificado médico) a presentar en Dirección Médica. */
export const PIDE_CONSTANCIA: Motivo[] = ["formacion", "licencia"];

export const ESTADOS = ["pendiente", "en_analisis", "aceptada", "rechazada", "anulada"] as const;
export type Estado = (typeof ESTADOS)[number];
export const ESTADO_LABEL: Record<Estado, string> = {
  pendiente: "Pendiente",
  en_analisis: "En análisis",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
  anulada: "Anulada por el médico",
};

/** Número de trámite que ve el médico: CAN-0007. */
export function numeroTramite(id: number): string {
  return `CAN-${String(id).padStart(4, "0")}`;
}

/** Acepta "CAN-0007", "can 7", "0007" o "7". */
export function idDeNumero(v: unknown): number | null {
  const m = String(v ?? "").trim().match(/^(?:can[\s-]*)?0*(\d{1,9})$/i);
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Días hábiles de anticipación: los hábiles que hay desde mañana hasta el día anterior al primer día a cancelar
 * (sin fines de semana ni feriados). Pedir hoy por algo de hoy = 0.
 */
export async function habilesEntre(hoy: string, primerDia: string, fer = new Feriados()): Promise<number> {
  let n = 0;
  for (let d = addDaysIso(hoy, 1); d < primerDia && n < 400; d = addDaysIso(d, 1)) {
    if (await fer.esHabil(d)) n++;
  }
  return n;
}

/** Primer día que cumple la regla de 15 días hábiles (para mostrarle al médico desde cuándo no es excepcional). */
export async function primerDiaSinExcepcion(hoy: string, fer = new Feriados()): Promise<string> {
  let n = 0;
  let d = hoy;
  while (n < ANTICIPACION_MINIMA) {
    d = addDaysIso(d, 1);
    if (await fer.esHabil(d)) n++;
  }
  return addDaysIso(d, 1);
}

/** Para la campanita y el Inicio: solicitudes abiertas, cuántas son excepcionales y cuántas aceptadas falta informar. */
export async function resumenCancelaciones() {
  try {
    const [r] = await db
      .select({
        pendientes: sql<number>`count(*) filter (where ${medCancelacionesTable.estado} = 'pendiente')::int`,
        enAnalisis: sql<number>`count(*) filter (where ${medCancelacionesTable.estado} = 'en_analisis')::int`,
        excepcionales: sql<number>`count(*) filter (where ${medCancelacionesTable.estado} in ('pendiente','en_analisis') and ${medCancelacionesTable.excepcional})::int`,
        sinInformar: sql<number>`count(*) filter (where ${medCancelacionesTable.estado} = 'aceptada' and ${medCancelacionesTable.centralInformadaAt} is null and ${medCancelacionesTable.fechaHasta} >= ${hoyIso()})::int`,
      })
      .from(medCancelacionesTable);
    return r ?? null;
  } catch (err) {
    console.error("[cancelaciones resumen]", err);
    return null;
  }
}

