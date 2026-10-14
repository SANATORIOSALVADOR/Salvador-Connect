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
 */
const router: IRouter = Router();

const BACKUPS = process.env.BACKUP_PATH || "/backups";
const ESTADO = process.env.ESTADO_PATH || "/estado";

function minutosAhora(d = new Date()) {
  return d.getHours() * 60 + d.getMinutes();
}
function aMin(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

router.get("/inicio", requireAuth, async (req, res): Promise<void> => {
  try {
    const user = req.authUser!;
    const ahora = new Date();
    const hoy = isoLocal(ahora);
    const out: Record<string, unknown> = {
      hoy,
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
        .where(and(eq(admItemsTable.estado, "pendiente"), lte(admItemsTable.fecha, addDaysIso(hoy, 30))))
        .orderBy(asc(admItemsTable.fecha), asc(admItemsTable.hora));
      const semana = addDaysIso(hoy, 7);
      const nombre = user.name.trim().toLowerCase();
      // «Mis pendientes»: donde figura como responsable (nombre completo, usuario o solo el nombre de pila).
      const pila = nombre.split(" ")[0];
      const mios = pendientes.filter((i) => {
        const r = i.responsable.trim().toLowerCase();
        return !!r && (r === nombre || r === user.username.toLowerCase() || (pila.length > 2 && r === pila));
      });
      const anio = ahora.getFullYear();
      const mes = ahora.getMonth() + 1;
      const periodo = `${anio}-${String(mes).padStart(2, "0")}`;
      const fiscalMes = await db
        .select({ estado: admItemsTable.estado, fecha: admItemsTable.fecha })
        .from(admItemsTable)
        .where(and(eq(admItemsTable.tipo, "fiscal"), gte(admItemsTable.fecha, `${periodo}-01`), lte(admItemsTable.fecha, isoDate(anio, mes, 31))));
      const obligs = (await db.select().from(admObligacionesTable).where(eq(admObligacionesTable.activo, true))).filter((o) => aplicaEnMes(o, mes));
      const cal = await calendarioDelAnio(anio);
      const resumir = (i: typeof admItemsTable.$inferSelect) => ({ id: i.id, tipo: i.tipo, titulo: i.titulo, fecha: i.fecha, hora: i.hora, responsable: i.responsable, prioridad: i.prioridad });
      out.administracion = {
        vencidos: pendientes.filter((i) => i.fecha < hoy).length,
        hoy: pendientes.filter((i) => i.fecha === hoy).length,
        semana: pendientes.filter((i) => i.fecha > hoy && i.fecha <= semana).length,
        misPendientes: mios.filter((i) => i.fecha <= addDaysIso(hoy, 14)).slice(0, 6).map(resumir),
        misPendientesTotal: mios.length,
        proximos: pendientes.filter((i) => i.fecha <= semana).slice(0, 6).map(resumir),
        fiscal: {
          total: fiscalMes.filter((f) => f.estado !== "cancelado").length,
          cumplidos: fiscalMes.filter((f) => f.estado === "cumplido").length,
          vencidos: fiscalMes.filter((f) => f.estado === "pendiente" && f.fecha < hoy).length,
          obligaciones: obligs.length,
          verificadas: obligs.filter((o) => cal.get(`${o.id}:${anio}:${mes}`)?.verificadoAt).length,
        },
      };
    }

    // ----- Guardias: de guardia ahora y huecos, en los sectores de la persona -----
    if (hasModule(user, "guardias")) {
      const misSectores = user.role === "superadmin" || user.sectorIds.length === 0 ? null : new Set(user.sectorIds);
      const sectores = (await sectoresDeGuardia()).filter((s) => !misSectores || misSectores.has(s.sectorId));
      const ids = new Set(sectores.map((s) => s.sectorId));
      const filas = await db
        .select({ g: guardiasTable, sector: sectorsTable.name })
        .from(guardiasTable)
        .leftJoin(sectorsTable, eq(guardiasTable.sectorId, sectorsTable.id))
        .where(and(lte(guardiasTable.date, hoy), gte(sql`coalesce(${guardiasTable.endDate}, ${guardiasTable.date})`, addDaysIso(hoy, -1))));
      const m = minutosAhora(ahora);
      const ahoraLista = filas
        .filter((f) => ids.has(f.g.sectorId))
        .filter((f) => {
          const ini = aMin(f.g.startTime);
          const fin = aMin(f.g.endTime);
          const cruza = (f.g.endDate && f.g.endDate > f.g.date) || fin <= ini;
          if (f.g.date === hoy) return cruza ? m >= ini : m >= ini && m < fin;
          // Empezó ayer y termina hoy.
          return cruza && f.g.date === addDaysIso(hoy, -1) && m < fin;
        })
        .map((f) => ({ sector: f.sector ?? "", profesional: f.g.professionalName, modalidad: f.g.modality, hasta: f.g.endTime }))
        .sort((a, b) => a.sector.localeCompare(b.sector, "es"));
      const cubiertos = new Set(ahoraLista.map((a) => a.sector));
      const tope = await horizonte();
      const hasta = addDaysIso(hoy, 6);
      const guardias = tope ? await guardiasEntre(hoy, hasta) : [];
      const huecosHoy = tope && hoy <= tope
        ? coberturaDia(guardias, hoy, sectores).filter((c) => c.huecos.length).map((c) => ({ sector: c.name, texto: c.sinGuardia ? "sin guardia" : c.huecos.map(([a, b]) => `${fmtHM(a)}–${fmtHM(b)}`).join(", ") }))
        : [];
      let diasConHuecos = 0;
      for (let d = hoy; tope && d <= hasta && d <= tope; d = addDaysIso(d, 1)) if (coberturaDia(guardias, d, sectores).some((c) => c.huecos.length)) diasConHuecos++;
      out.guardias = {
        sectores: sectores.length,
        todosLosSectores: !misSectores,
        ahora: ahoraLista,
        sinGuardiaAhora: sectores.map((s) => s.name).filter((n) => !cubiertos.has(n)),
        huecosHoy,
        diasConHuecos,
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
      let ultimoBackup: { archivo: string; fecha: string; tamanoMb: number } | null = null;
      try {
        const archivos = fs.readdirSync(BACKUPS).filter((f) => /^sanatorio_.*\.dump$/.test(f));
        const conFecha = archivos.map((f) => ({ f, s: fs.statSync(path.join(BACKUPS, f)) })).sort((a, b) => b.s.mtimeMs - a.s.mtimeMs);
        if (conFecha[0]) ultimoBackup = { archivo: conFecha[0].f, fecha: conFecha[0].s.mtime.toISOString(), tamanoMb: Math.round((conFecha[0].s.size / 1048576) * 10) / 10 };
      } catch {
        ultimoBackup = null;
      }
      const inicioDia = new Date(ahora);
      inicioDia.setHours(0, 0, 0, 0);
      const [{ hoyN }] = await db.select({ hoyN: sql<number>`count(*)::int` }).from(usersTable).where(gte(usersTable.lastLoginAt, inicioDia));
      const [{ activos }] = await db.select({ activos: sql<number>`count(*)::int` }).from(usersTable).where(eq(usersTable.active, true));
      out.sistema = {
        db: dbOk ? "ok" : "error",
        ultimoBackup,
        backupsVisibles: fs.existsSync(BACKUPS),
        mantenimiento: fs.existsSync(path.join(ESTADO, "mantenimiento.json")),
        usuariosHoy: hoyN,
        usuariosActivos: activos,
      };
    }

    res.json(out);
  } catch (err) {
    console.error("[inicio]", err);
    res.status(500).json({ message: "No se pudo armar la pantalla de inicio." });
  }
});

export default router;
