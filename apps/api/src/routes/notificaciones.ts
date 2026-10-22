import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { admItemsTable, db, guardiasAuditoriaTable, userModulesTable, usersTable } from "@salvador/db";
import { can, hasModule, ownSectorIds, requireAuth, visibleSectorIds } from "../lib/auth";
import { resumenInventario } from "../lib/inventario";
import { addDaysIso, coberturaDia, fmtHM, guardiasEntre, horasEnRango, horizonte, isoLocal, sectoresDeGuardia } from "../lib/cobertura";

// Campanita y gráficos del Resumen. Todo se calcula en el momento según los módulos de cada persona.

const router: IRouter = Router();

type Notificacion = {
  id: string; // estable: la web recuerda cuáles ya se leyeron
  modulo: "administracion" | "guardias" | "inventario" | "sistema";
  nivel: "alta" | "media" | "info";
  titulo: string;
  detalle: string;
  fecha: string;
  link: string;
};

function fechaCorta(iso: string): string {
  const [, m, d] = iso.split("-");
  const dias = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const [y, mm, dd] = iso.split("-").map(Number);
  return `${dias[new Date(Date.UTC(y, mm - 1, dd)).getUTCDay()]} ${d}/${m}`;
}

router.get("/notificaciones", requireAuth, async (req, res): Promise<void> => {
  try {
    const user = req.authUser!;
    const hoy = isoLocal(new Date());
    const out: Notificacion[] = [];

    // Vencimientos: vencidos y los que entran en su período de aviso.
    if (hasModule(user, "administracion")) {
      const items = await db
        .select()
        .from(admItemsTable)
        .where(and(eq(admItemsTable.estado, "pendiente"), lte(admItemsTable.fecha, addDaysIso(hoy, 120))))
        .orderBy(asc(admItemsTable.fecha));
      for (const it of items) {
        const dias = Math.round((Date.parse(it.fecha) - Date.parse(hoy)) / 86_400_000);
        if (dias > (it.alertDays ?? 7)) continue;
        out.push({
          id: `venc-${it.id}-${it.fecha}`,
          modulo: "administracion",
          nivel: dias < 0 ? "alta" : dias <= 1 ? "alta" : "media",
          titulo: dias < 0 ? `Vencido hace ${-dias} día${dias === -1 ? "" : "s"}` : dias === 0 ? "Vence hoy" : `Vence en ${dias} día${dias === 1 ? "" : "s"}`,
          detalle: it.titulo,
          fecha: it.fecha,
          link: `/administracion?item=${it.id}`,
        });
      }
    }

    if (hasModule(user, "guardias")) {
      // Sus sectores a cargo de Guardias (sin sectores a cargo: todos).
      const propios = ownSectorIds(user, "guardias");
      const misSectores = propios ? new Set(propios) : null;
      const sectores = (await sectoresDeGuardia()).filter((s) => !misSectores || misSectores.has(s.sectorId));
      const hasta = addDaysIso(hoy, 6);
      const tope = await horizonte();

      // Huecos de cobertura de hoy a 7 días (solo hasta donde ya hay guardias cargadas).
      if (sectores.length && tope) {
        const guardias = await guardiasEntre(hoy, hasta);
        for (let day = hoy; day <= hasta && day <= tope; day = addDaysIso(day, 1)) {
          const faltan = coberturaDia(guardias, day, sectores).filter((c) => c.huecos.length > 0);
          if (!faltan.length) continue;
          out.push({
            id: `cob-${day}-${faltan.map((f) => `${f.sectorId}:${f.huecos.map((h) => h.join("-")).join(",")}`).join("|")}`,
            modulo: "guardias",
            nivel: day === hoy ? "alta" : "media",
            titulo: `${day === hoy ? "Hoy" : fechaCorta(day)}: ${faltan.length} sector${faltan.length === 1 ? "" : "es"} sin cubrir`,
            detalle: faltan
              .map((f) => `${f.name} ${f.requeridoMin === 0 ? "(sin guardia)" : f.huecos.map(([a, b]) => `${fmtHM(a)}–${fmtHM(b)}`).join(", ")}`)
              .join(" · "),
            fecha: day,
            link: "/guardias",
          });
        }
      }

      // Cambios de otros en guardias de mis sectores (últimas 48 h), para quien carga guardias.
      if (can(user, "guardias", "cargar")) {
        const desde = new Date(Date.now() - 48 * 3_600_000);
        const cambios = await db
          .select()
          .from(guardiasAuditoriaTable)
          .where(and(gte(guardiasAuditoriaTable.createdAt, desde), ne(guardiasAuditoriaTable.userId, user.id)))
          .orderBy(desc(guardiasAuditoriaTable.createdAt))
          .limit(30);
        const accion: Record<string, string> = { alta: "cargó", modificacion: "modificó", baja: "eliminó", copia: "copió" };
        for (const c of cambios) {
          const g = ((c.after ?? c.before) || {}) as { sectorId?: number; sectorName?: string; professionalName?: string; date?: string; startTime?: string; endTime?: string };
          if (misSectores && g.sectorId && !misSectores.has(g.sectorId)) continue;
          out.push({
            id: `aud-${c.id}`,
            modulo: "guardias",
            nivel: c.action === "baja" ? "media" : "info",
            titulo: `${c.userName || "Alguien"} ${accion[c.action] ?? c.action} una guardia`,
            detalle: `${g.professionalName ?? ""} · ${g.sectorName ?? ""}${g.date ? ` · ${fechaCorta(g.date)} ${g.startTime ?? ""}–${g.endTime ?? ""}` : ""}`,
            fecha: c.createdAt.toISOString(),
            link: "/guardias",
          });
        }
      }
    }

    // Inventario: controles vencidos / por vencer y equipos con falla (de los sectores que ve).
    if (hasModule(user, "inventario")) {
      const inv = await resumenInventario(user);
      if (inv?.conFalla) out.push({ id: `inv-falla-${hoy}-${inv.conFalla}`, modulo: "inventario", nivel: "alta", titulo: inv.conFalla === 1 ? "1 equipo con falla" : `${inv.conFalla} equipos con falla`, detalle: "Pendientes de reparación.", fecha: hoy, link: "/inventario?filtro=falla" });
      if (inv?.vencidos) out.push({ id: `inv-venc-${hoy}-${inv.vencidos}`, modulo: "inventario", nivel: "media", titulo: inv.vencidos === 1 ? "1 control de equipo vencido" : `${inv.vencidos} controles de equipos vencidos`, detalle: "Registrá los controles en Inventario.", fecha: hoy, link: "/inventario?filtro=vencidos" });
      if (inv?.porVencer) out.push({ id: `inv-prox-${hoy}-${inv.porVencer}`, modulo: "inventario", nivel: "info", titulo: inv.porVencer === 1 ? "1 control de equipo esta semana" : `${inv.porVencer} controles de equipos esta semana`, detalle: "Vencen en los próximos 7 días.", fecha: hoy, link: "/inventario?filtro=semana" });
    }

    // Superadmin: accesos temporarios que vencen en los próximos 7 días.
    if (user.role === "superadmin") {
      const tope = addDaysIso(hoy, 7);
      const fmt = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");
      const cuentas = await db
        .select({ id: usersTable.id, name: usersTable.name, hasta: usersTable.accesoHasta })
        .from(usersTable)
        .where(and(eq(usersTable.active, true), gte(usersTable.accesoHasta, hoy), lte(usersTable.accesoHasta, tope)));
      for (const c of cuentas) {
        out.push({ id: `acc-${c.id}-${c.hasta}`, modulo: "sistema", nivel: c.hasta === hoy ? "alta" : "media", titulo: `Vence el acceso de ${c.name}`, detalle: `Puede entrar hasta el ${fmt(c.hasta!)}.`, fecha: c.hasta!, link: "/configuracion" });
      }
      const permisos = await db
        .select({ id: usersTable.id, name: usersTable.name, modulo: userModulesTable.moduleKey, hasta: userModulesTable.hasta })
        .from(userModulesTable)
        .innerJoin(usersTable, eq(usersTable.id, userModulesTable.userId))
        .where(and(eq(usersTable.active, true), gte(userModulesTable.hasta, hoy), lte(userModulesTable.hasta, tope)));
      const MOD: Record<string, string> = { administracion: "Administración", guardias: "Guardias Médicas", inventario: "Inventario", instructivos: "Instructivos", dashboard: "Inicio", liquidacion: "Liquidación" };
      for (const p of permisos) {
        out.push({ id: `perm-${p.id}-${p.modulo}-${p.hasta}`, modulo: "sistema", nivel: "media", titulo: `Vence un permiso de ${p.name}`, detalle: `${MOD[p.modulo] ?? p.modulo}: temporario hasta el ${fmt(p.hasta!)}.`, fecha: p.hasta!, link: "/configuracion" });
      }
    }

    const orden = { alta: 0, media: 1, info: 2 } as const;
    out.sort((a, b) => orden[a.nivel] - orden[b.nivel] || a.fecha.localeCompare(b.fecha));
    res.json(out.slice(0, 50));
  } catch (err) {
    console.error("[notificaciones]", err);
    res.status(500).json({ message: "No se pudieron cargar las notificaciones." });
  }
});

/** Datos para los gráficos del Resumen. */
router.get("/dashboard/graficos", requireAuth, async (req, res): Promise<void> => {
  try {
    const user = req.authUser!;
    const ahora = new Date();
    const hoy = isoLocal(ahora);
    const out: {
      guardiasPorSector?: { sector: string; activas: number; pasivas: number }[];
      cobertura7?: { fecha: string; etiqueta: string; porcentaje: number | null }[];
      vencimientos?: { semana: string; desde: string; pendientes: number; vencidos: number }[];
    } = {};

    if (hasModule(user, "guardias")) {
      const desde = isoLocal(new Date(ahora.getFullYear(), ahora.getMonth(), 1));
      const hasta = isoLocal(new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0));
      const vis = visibleSectorIds(user, "guardias");
      const sectores = (await sectoresDeGuardia()).filter((s) => !vis || vis.includes(s.sectorId));
      const guardias = await guardiasEntre(desde, addDaysIso(hoy, 7) > hasta ? addDaysIso(hoy, 7) : hasta);
      const nombre = new Map(sectores.map((s) => [s.sectorId, s.name]));
      const acc = new Map<number, { activas: number; pasivas: number }>();
      for (const g of guardias) {
        if (!nombre.has(g.sectorId)) continue;
        const h = horasEnRango(g, desde, hasta);
        const a = acc.get(g.sectorId) || { activas: 0, pasivas: 0 };
        if (g.modality === "pasiva") a.pasivas += h;
        else a.activas += h;
        acc.set(g.sectorId, a);
      }
      out.guardiasPorSector = sectores
        .map((s) => ({ sector: s.name, activas: Math.round(acc.get(s.sectorId)?.activas ?? 0), pasivas: Math.round(acc.get(s.sectorId)?.pasivas ?? 0) }))
        .filter((x) => x.activas + x.pasivas > 0)
        .sort((a, b) => b.activas + b.pasivas - (a.activas + a.pasivas));

      // % del horario requerido cubierto, hoy y 6 días más (solo sectores con horario fijo).
      const conHorario = sectores.filter((s) => s.cobertura.length > 0);
      const tope = await horizonte();
      out.cobertura7 = [];
      for (let i = 0; i < 7; i++) {
        const day = addDaysIso(hoy, i);
        const c = coberturaDia(guardias, day, conHorario);
        const req = c.reduce((a, x) => a + x.requeridoMin, 0);
        const cub = c.reduce((a, x) => a + x.cubiertoMin, 0);
        out.cobertura7.push({
          fecha: day,
          etiqueta: i === 0 ? "Hoy" : fechaCorta(day),
          porcentaje: req === 0 || !tope || day > tope ? null : Math.round((cub / req) * 100),
        });
      }
    }

    if (hasModule(user, "administracion")) {
      // Lunes de esta semana y 5 más.
      const base = new Date(ahora);
      base.setDate(base.getDate() - ((base.getDay() + 6) % 7));
      const lunes = isoLocal(base);
      const fin = addDaysIso(lunes, 6 * 7 - 1);
      const items = await db
        .select({ dueDate: admItemsTable.fecha })
        .from(admItemsTable)
        .where(and(lte(admItemsTable.fecha, fin), eq(admItemsTable.estado, "pendiente")));
      out.vencimientos = Array.from({ length: 6 }, (_, i) => {
        const desde = addDaysIso(lunes, i * 7);
        const hasta = addDaysIso(desde, 6);
        const [, m, d] = desde.split("-");
        const enSemana = items.filter((x) => x.dueDate >= desde && x.dueDate <= hasta);
        return {
          semana: i === 0 ? "Esta semana" : `${d}/${m}`,
          desde,
          pendientes: enSemana.filter((x) => x.dueDate >= hoy).length,
          // Los vencidos de semanas anteriores se suman a la primera.
          vencidos: (i === 0 ? items.filter((x) => x.dueDate < hoy) : []).length,
        };
      });
    }

    res.json(out);
  } catch (err) {
    console.error("[dashboard.graficos]", err);
    res.status(500).json({ message: "No se pudieron cargar los gráficos." });
  }
});

export default router;
