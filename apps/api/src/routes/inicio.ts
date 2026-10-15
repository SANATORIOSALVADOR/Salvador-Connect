import { Router, type IRouter } from "express";
import fs from "node:fs";
import path from "node:path";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { admItemsTable, admObligacionesTable, db, guardiasTable, sectorsTable, usersTable } from "@salvador/db";
import { hasLevel, hasModule, levelOf, requireAuth } from "../lib/auth";
import { aplicaEnMes, calendarioDelAnio, isoDate } from "../lib/administracion";
import { addDaysIso, coberturaDia, fmtHM, guardiasEntre, horizonte, isoLocal, sectoresDeGuardia } from "../lib/cobertura";

/**
 * Pantalla de Inicio: arma lo del día de cada persona según sus permisos.
 * Solo devuelve los bloques de los módulos que puede ver (y el de Sistemas, solo al superadmin).
 *  - urgente: lo que hay que atender ya, de todos sus módulos, ordenado por importancia
 *  - semana: los próximos 7 días (vencimientos y cobertura de guardias)
 *  - administracion / guardias / sistema: los bloques de cada módulo
 */
const router: IRouter = Router();

const ESTADO = process.env.ESTADO_PATH || "/estado";

type Nivel = "alta" | "media" | "baja";
type Urgente = { nivel: Nivel; modulo: "administracion" | "guardias" | "sistema"; titulo: string; detalle: string; link: string; fecha?: string };

/** "1.250.000,50" / "1250000.50" → número (NaN si no hay). Igual que en la web. */
function parseMonto(txt: string): number {
  const s = String(txt ?? "").replace(/[^\d.,-]/g, "");
  if (!s) return NaN;
  const coma = s.lastIndexOf(",");
  const punto = s.lastIndexOf(".");
  let n: string;
  if (coma > punto) n = s.replace(/\./g, "").replace(",", ".");
  else if (punto > coma && coma >= 0) n = s.replace(/,/g, "");
  else if (punto >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) n = s.replace(/\./g, "");
  else n = s;
  const v = Number(n);
  return Number.isFinite(v) ? v : NaN;
}
function suma(items: { monto: string }[]) {
  let total = 0;
  let sinMonto = 0;
  for (const i of items) {
    const v = parseMonto(i.monto);
    if (Number.isFinite(v)) total += v;
    else sinMonto++;
  }
  return { total: Math.round(total * 100) / 100, cantidad: items.length, sinMonto };
}
function diasEntre(a: string, b: string) {
  const [x, y, z] = a.split("-").map(Number);
  const [p, q, r] = b.split("-").map(Number);
  return Math.round((Date.UTC(p, q - 1, r) - Date.UTC(x, y - 1, z)) / 86400000);
}
/** Fecha y hora local de una guardia (inicio o fin). */
function momento(fecha: string, hm: string) {
  const [y, m, d] = fecha.split("-").map(Number);
  const [h, mi] = hm.split(":").map(Number);
  return new Date(y, m - 1, d, h || 0, mi || 0);
}
function finDeGuardia(g: { date: string; endDate: string | null; startTime: string; endTime: string }) {
  const finFecha = g.endDate && g.endDate > g.date ? g.endDate : g.endTime <= g.startTime ? addDaysIso(g.date, 1) : g.date;
  return momento(finFecha, g.endTime === "24:00" ? "23:59" : g.endTime);
}

router.get("/inicio", requireAuth, async (req, res): Promise<void> => {
  try {
    const user = req.authUser!;
    const ahora = new Date();
    const hoy = isoLocal(ahora);
    const dias7 = Array.from({ length: 7 }, (_, i) => addDaysIso(hoy, i));
    const urgente: Urgente[] = [];
    const semana = dias7.map((fecha) => ({ fecha, vencimientos: null as number | null, cobertura: null as number | null, huecos: null as number | null }));
    const out: Record<string, unknown> = {
      hoy,
      ahora: ahora.toISOString(),
      usuario: { nombre: user.name, rol: user.role },
      accesos: {
        administracion: levelOf(user, "administracion"),
        guardias: levelOf(user, "guardias"),
        superadmin: user.role === "superadmin",
      },
    };

    // ----- Administración -----
    if (hasModule(user, "administracion")) {
      const pendientes = await db
        .select()
        .from(admItemsTable)
        .where(and(eq(admItemsTable.estado, "pendiente"), lte(admItemsTable.fecha, addDaysIso(hoy, 45))))
        .orderBy(asc(admItemsTable.fecha), asc(admItemsTable.hora));
      const fin7 = addDaysIso(hoy, 6);
      const nombre = user.name.trim().toLowerCase();
      // «A tu cargo»: donde figura como responsable (nombre completo, usuario o solo el nombre de pila).
      const pila = nombre.split(" ")[0];
      const esMio = (r: string) => {
        const x = r.trim().toLowerCase();
        return !!x && (x === nombre || x === user.username.toLowerCase() || (pila.length > 2 && x === pila));
      };
      const mios = pendientes.filter((i) => esMio(i.responsable));
      const resumir = (i: typeof admItemsTable.$inferSelect) => ({
        id: i.id, tipo: i.tipo, titulo: i.titulo, fecha: i.fecha, hora: i.hora, responsable: i.responsable, prioridad: i.prioridad, monto: i.monto,
        direccion: (i.datos as { direccion?: string })?.direccion ?? null, categoria: (i.datos as { categoria?: string })?.categoria ?? null,
      });

      // Lo urgente: vencidos y de hoy (de a tu cargo primero).
      const vencidos = pendientes.filter((i) => i.fecha < hoy);
      const deHoy = pendientes.filter((i) => i.fecha === hoy);
      const ordenMio = (a: typeof pendientes[number], b: typeof pendientes[number]) => Number(esMio(b.responsable)) - Number(esMio(a.responsable));
      for (const i of [...vencidos].sort(ordenMio).slice(0, 5)) {
        const d = -diasEntre(hoy, i.fecha);
        urgente.push({ nivel: "alta", modulo: "administracion", titulo: i.titulo, detalle: `${d === 1 ? "Venció ayer" : `Vencido hace ${d} días`}${i.responsable ? ` · ${i.responsable}` : ""}`, link: `/administracion?item=${i.id}`, fecha: i.fecha });
      }
      if (vencidos.length > 5) urgente.push({ nivel: "alta", modulo: "administracion", titulo: vencidos.length - 5 === 1 ? "Y 1 vencimiento atrasado más" : `Y ${vencidos.length - 5} vencimientos atrasados más`, detalle: "Revisalos en la agenda", link: "/administracion?tab=agenda" });
      for (const i of [...deHoy].sort(ordenMio).slice(0, 4)) {
        urgente.push({ nivel: "media", modulo: "administracion", titulo: i.titulo, detalle: `Vence hoy${i.hora ? ` a las ${i.hora}` : ""}${i.responsable ? ` · ${i.responsable}` : ""}`, link: `/administracion?item=${i.id}`, fecha: i.fecha });
      }
      // Cheques que se debitan / cobran mañana.
      for (const c of pendientes.filter((i) => i.tipo === "cheque" && i.fecha === addDaysIso(hoy, 1))) {
        const v = parseMonto(c.monto);
        const recibido = (c.datos as { direccion?: string })?.direccion === "recibido";
        urgente.push({ nivel: "baja", modulo: "administracion", titulo: `${recibido ? "Se cobra" : "Se debita"} mañana: ${c.titulo}`, detalle: Number.isFinite(v) ? `$ ${v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Cheque", link: `/administracion?item=${c.id}`, fecha: c.fecha });
      }

      for (const s of semana) s.vencimientos = pendientes.filter((i) => i.fecha === s.fecha).length;

      const anio = ahora.getFullYear();
      const mes = ahora.getMonth() + 1;
      const periodo = `${anio}-${String(mes).padStart(2, "0")}`;
      const fiscalMes = await db
        .select({ estado: admItemsTable.estado, fecha: admItemsTable.fecha })
        .from(admItemsTable)
        .where(and(eq(admItemsTable.tipo, "fiscal"), gte(admItemsTable.fecha, `${periodo}-01`), lte(admItemsTable.fecha, isoDate(anio, mes, 31))));
      const obligs = (await db.select().from(admObligacionesTable).where(eq(admObligacionesTable.activo, true))).filter((o) => aplicaEnMes(o, mes));
      const cal = await calendarioDelAnio(anio);
      const verificadas = obligs.filter((o) => cal.get(`${o.id}:${anio}:${mes}`)?.verificadoAt).length;

      const semana7 = pendientes.filter((i) => i.fecha <= fin7);
      const chequesPagar = semana7.filter((i) => i.tipo === "cheque" && (i.datos as { direccion?: string })?.direccion !== "recibido");
      const chequesCobrar = semana7.filter((i) => i.tipo === "cheque" && (i.datos as { direccion?: string })?.direccion === "recibido");
      const pagos = semana7.filter((i) => ["pago", "vencimiento", "fiscal"].includes(i.tipo) && i.monto.trim());
      const documentos = pendientes.filter((i) => i.tipo === "documento" && i.fecha <= addDaysIso(hoy, 45));
      const tareas = pendientes.filter((i) => i.tipo === "tarea");

      out.administracion = {
        vencidos: vencidos.length,
        hoy: deHoy.length,
        semana: pendientes.filter((i) => i.fecha > hoy && i.fecha <= fin7).length,
        misPendientes: mios.filter((i) => i.fecha <= addDaysIso(hoy, 14)).slice(0, 5).map(resumir),
        misPendientesTotal: mios.length,
        proximos: semana7.slice(0, 5).map(resumir),
        dinero: {
          chequesPagar: suma(chequesPagar),
          chequesCobrar: suma(chequesCobrar),
          pagos: suma(pagos),
          proximosPagos: [...chequesPagar, ...pagos].sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 4).map(resumir),
        },
        documentos: documentos.slice(0, 4).map(resumir),
        documentosTotal: documentos.length,
        tareas: { abiertas: tareas.length, atrasadas: tareas.filter((t) => t.fecha < hoy).length, mias: tareas.filter((t) => esMio(t.responsable)).length },
        fiscal: {
          total: fiscalMes.filter((f) => f.estado !== "cancelado").length,
          cumplidos: fiscalMes.filter((f) => f.estado === "cumplido").length,
          vencidos: fiscalMes.filter((f) => f.estado === "pendiente" && f.fecha < hoy).length,
          obligaciones: obligs.length,
          verificadas,
        },
      };
    }

    // ----- Guardias: de guardia ahora, quién sigue y cobertura, en los sectores de la persona -----
    if (hasModule(user, "guardias")) {
      const misSectores = user.role === "superadmin" || user.sectorIds.length === 0 ? null : new Set(user.sectorIds);
      const sectores = (await sectoresDeGuardia()).filter((s) => !misSectores || misSectores.has(s.sectorId));
      const ids = new Set(sectores.map((s) => s.sectorId));
      const filas = (
        await db
          .select({ g: guardiasTable, sector: sectorsTable.name })
          .from(guardiasTable)
          .leftJoin(sectorsTable, eq(guardiasTable.sectorId, sectorsTable.id))
          .where(and(lte(guardiasTable.date, addDaysIso(hoy, 1)), gte(sql`coalesce(${guardiasTable.endDate}, ${guardiasTable.date})`, addDaysIso(hoy, -1))))
      ).filter((f) => ids.has(f.g.sectorId));
      const conHoras = filas.map((f) => ({ ...f, ini: momento(f.g.date, f.g.startTime), fin: finDeGuardia(f.g) }));
      const t = ahora.getTime();
      const enCurso = conHoras.filter((f) => f.ini.getTime() <= t && f.fin.getTime() > t);
      const porSector = sectores.map((s) => {
        const actuales = enCurso.filter((f) => f.g.sectorId === s.sectorId).sort((a, b) => a.fin.getTime() - b.fin.getTime());
        const finActual = actuales.length ? Math.max(...actuales.map((a) => a.fin.getTime())) : t;
        const siguiente = conHoras
          .filter((f) => f.g.sectorId === s.sectorId && f.ini.getTime() > t && f.ini.getTime() - t < 24 * 3600 * 1000)
          .sort((a, b) => a.ini.getTime() - b.ini.getTime())[0];
        return {
          sector: s.name,
          ahora: actuales.map((a) => ({
            profesional: a.g.professionalName,
            modalidad: a.g.modality,
            desde: a.ini.toISOString(),
            hasta: a.fin.toISOString(),
            avance: Math.round(((t - a.ini.getTime()) / Math.max(1, a.fin.getTime() - a.ini.getTime())) * 100),
          })),
          sigue: siguiente
            ? { profesional: siguiente.g.professionalName, desde: siguiente.ini.toISOString(), modalidad: siguiente.g.modality, empalma: Math.abs(siguiente.ini.getTime() - finActual) < 60000 }
            : null,
        };
      });
      const sinGuardiaAhora = porSector.filter((p) => !p.ahora.length).map((p) => p.sector);
      for (const s of sinGuardiaAhora) {
        const sig = porSector.find((p) => p.sector === s)?.sigue;
        urgente.unshift({
          nivel: "alta",
          modulo: "guardias",
          titulo: `${s}: sin guardia en este momento`,
          detalle: sig ? `Sigue ${sig.profesional} a las ${new Date(sig.desde).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}` : "No hay nadie cargado en las próximas 24 horas",
          link: "/guardias",
        });
      }

      const tope = await horizonte();
      const guardias = tope ? await guardiasEntre(hoy, addDaysIso(hoy, 6)) : [];
      const huecosHoy = tope && hoy <= tope
        ? coberturaDia(guardias, hoy, sectores).filter((c) => c.huecos.length && !c.sinGuardia).map((c) => ({ sector: c.name, texto: c.huecos.map(([a, b]) => `${fmtHM(a)}–${fmtHM(b)}`).join(", ") }))
        : [];
      for (const h of huecosHoy) {
        if (sinGuardiaAhora.includes(h.sector)) continue;
        urgente.push({ nivel: "media", modulo: "guardias", titulo: `${h.sector}: hueco de guardia hoy`, detalle: h.texto, link: "/guardias" });
      }
      for (const s of semana) {
        if (!tope || s.fecha > tope) continue;
        const cob = coberturaDia(guardias, s.fecha, sectores);
        // Promedio de la cobertura de cada sector ese día (sin horario fijo: 100 % si hay alguien, 0 % si no).
        const pcts = cob.map((c) => (c.requeridoMin ? c.cubiertoMin / c.requeridoMin : c.sinGuardia ? 0 : 1));
        s.cobertura = pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 100) : null;
        s.huecos = cob.filter((c) => c.huecos.length).length;
      }
      out.guardias = {
        sectores: sectores.length,
        todosLosSectores: !misSectores,
        porSector,
        sinGuardiaAhora,
        huecosHoy,
        diasConHuecos: semana.filter((s) => (s.huecos ?? 0) > 0).length,
        planificadoHasta: tope,
        puedeCargar: hasLevel(user, "guardias", "editar"),
      };
    }

    // ----- Sistemas (solo superadmin) -----
    if (user.role === "superadmin") {
      let dbOk = true;
      try {
        await db.execute(sql`select 1`);
      } catch {
        dbOk = false;
      }
      const mantenimiento = fs.existsSync(path.join(ESTADO, "mantenimiento.json"));
      const inicioDia = new Date(ahora);
      inicioDia.setHours(0, 0, 0, 0);
      const [{ hoyN }] = await db.select({ hoyN: sql<number>`count(*)::int` }).from(usersTable).where(gte(usersTable.lastLoginAt, inicioDia));
      const [{ activos }] = await db.select({ activos: sql<number>`count(*)::int` }).from(usersTable).where(eq(usersTable.active, true));
      const [{ nunca }] = await db.select({ nunca: sql<number>`count(*)::int` }).from(usersTable).where(and(eq(usersTable.active, true), sql`${usersTable.lastLoginAt} is null`));
      if (mantenimiento) urgente.unshift({ nivel: "alta", modulo: "sistema", titulo: "El modo mantenimiento está prendido", detalle: "Nadie puede guardar cambios. Apagalo con: bash scripts/mantenimiento.sh off", link: "/dashboard" });
      if (!dbOk) urgente.unshift({ nivel: "alta", modulo: "sistema", titulo: "La base de datos no responde", detalle: "Revisá el contenedor «db» en el servidor", link: "/dashboard" });
      out.sistema = { db: dbOk ? "ok" : "error", mantenimiento, usuariosHoy: hoyN, usuariosActivos: activos, usuariosSinEntrar: nunca };
    }

    const peso: Record<Nivel, number> = { alta: 0, media: 1, baja: 2 };
    out.urgente = urgente.sort((a, b) => peso[a.nivel] - peso[b.nivel]).slice(0, 9);
    out.urgenteTotal = urgente.length;
    out.semana = semana;
    res.json(out);
  } catch (err) {
    console.error("[inicio]", err);
    res.status(500).json({ message: "No se pudo armar la pantalla de inicio." });
  }
});

export default router;
