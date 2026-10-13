import { Router, type IRouter } from "express";
import { and, asc, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import {
  db,
  agendaItemsTable,
  guardiasTable,
  inventoryItemsTable,
  liquidacionItemsTable,
  sectorsTable,
  usersTable,
} from "@salvador/db";
import {
  CreateAgendaItemBody,
  CreateAgendaItemResponse,
  DeleteAgendaItemParams,
  GetCurrentUserResponse,
  GetDashboardSummaryResponse,
  GetRecentActivityQueryParams,
  GetRecentActivityResponse,
  ListAgendaItemsQueryParams,
  ListAgendaItemsResponse,
  ListSectorsResponse,
  UpdateAgendaItemBody,
  UpdateAgendaItemParams,
  UpdateAgendaItemResponse,
} from "@salvador/api-zod";
import { hasModule, requireAuth, type AuthUser } from "../lib/auth";

const router: IRouter = Router();
router.use(["/dashboard", "/sectors", "/me", "/agenda"], requireAuth);

function calendarDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const ACTIVITY_DAYS = 7;

type ActivityEntry = {
  id: number;
  title: string;
  detail: string;
  actor: string;
  createdAt: Date;
  kind: "agenda" | "guardia" | "inventario" | "instructivo" | "sistema";
};

/** Últimos movimientos reales (guardias y administración) de los módulos que el usuario puede ver. */
async function recentActivity(user: AuthUser, limit: number): Promise<ActivityEntry[]> {
  const since = new Date(Date.now() - ACTIVITY_DAYS * 24 * 60 * 60 * 1000);
  const entries: ActivityEntry[] = [];

  if (hasModule(user, "guardias")) {
    const rows = await db
      .select({ g: guardiasTable, sectorName: sectorsTable.name, actor: usersTable.name })
      .from(guardiasTable)
      .leftJoin(sectorsTable, eq(guardiasTable.sectorId, sectorsTable.id))
      .leftJoin(usersTable, eq(guardiasTable.createdByUserId, usersTable.id))
      .where(gte(guardiasTable.createdAt, since))
      .orderBy(desc(guardiasTable.createdAt))
      .limit(limit);
    for (const r of rows) {
      const [y, m, d] = r.g.date.split("-");
      entries.push({
        id: r.g.id * 2,
        title: "Guardia cargada",
        detail: `${r.g.professionalName} · ${r.sectorName ?? "Sector"} · ${d}/${m}/${y} ${r.g.startTime}`,
        actor: r.actor ?? "Sistema",
        createdAt: r.g.createdAt,
        kind: "guardia",
      });
    }
  }

  if (hasModule(user, "administracion")) {
    const rows = await db
      .select({ a: liquidacionItemsTable, actor: usersTable.name })
      .from(liquidacionItemsTable)
      .leftJoin(usersTable, eq(liquidacionItemsTable.createdByUserId, usersTable.id))
      .where(gte(liquidacionItemsTable.updatedAt, since))
      .orderBy(desc(liquidacionItemsTable.updatedAt))
      .limit(limit);
    for (const r of rows) {
      const isNew = Math.abs(r.a.updatedAt.getTime() - r.a.createdAt.getTime()) < 1000;
      entries.push({
        id: r.a.id * 2 + 1,
        title: isNew ? "Ítem de administración creado" : "Ítem de administración actualizado",
        detail: r.a.title,
        actor: r.actor ?? "Sistema",
        createdAt: r.a.updatedAt,
        kind: "agenda",
      });
    }
  }

  return entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  try {
    const user = req.authUser!;
    const today = isoLocal(new Date());
    const in7 = new Date();
    in7.setDate(in7.getDate() + 7);

    let upcomingReminders = 0;
    let nextReminder: string | null = null;
    let nextReminderDate: string | null = null;
    if (hasModule(user, "administracion")) {
      // Pendientes vencidos + los de los próximos 7 días.
      const pending = await db
        .select({ title: liquidacionItemsTable.title, dueDate: liquidacionItemsTable.dueDate })
        .from(liquidacionItemsTable)
        .where(and(eq(liquidacionItemsTable.status, "pendiente"), lte(liquidacionItemsTable.dueDate, isoLocal(in7))))
        .orderBy(asc(liquidacionItemsTable.dueDate));
      upcomingReminders = pending.length;
      nextReminder = pending[0]?.title ?? null;
      nextReminderDate = pending[0]?.dueDate ?? null;
    }

    // Guardias que tocan el día de hoy (incluye nocturnas que empezaron ayer).
    let pendingGuardias = 0;
    if (hasModule(user, "guardias")) {
      const [row] = await db
        .select({ n: count() })
        .from(guardiasTable)
        .where(and(lte(guardiasTable.date, today), sql`coalesce(${guardiasTable.endDate}, ${guardiasTable.date}) >= ${today}`));
      pendingGuardias = Number(row?.n ?? 0);
    }

    // Equipos en reparación (el inventario no maneja stock).
    let lowStockItems = 0;
    if (hasModule(user, "inventario")) {
      const [row] = await db
        .select({ n: count() })
        .from(inventoryItemsTable)
        .where(eq(inventoryItemsTable.status, "en_reparacion"));
      lowStockItems = Number(row?.n ?? 0);
    }

    const activity = await recentActivity(user, 20);

    res.json(
      GetDashboardSummaryResponse.parse({
        upcomingReminders,
        pendingGuardias,
        lowStockItems,
        recentActivityCount: activity.length,
        nextReminder,
        nextReminderDate,
      }),
    );
  } catch (err) {
    console.error("[dashboard.summary]", err);
    res.status(500).json({ message: "No se pudo cargar el resumen." });
  }
});

router.get("/dashboard/activity", async (req, res): Promise<void> => {
  try {
    const parsed = GetRecentActivityQueryParams.safeParse(req.query);
    const limit = parsed.success ? (parsed.data.limit ?? 6) : 6;
    res.json(GetRecentActivityResponse.parse(await recentActivity(req.authUser!, limit)));
  } catch (err) {
    console.error("[dashboard.activity]", err);
    res.status(500).json({ message: "No se pudo cargar la actividad." });
  }
});

router.get("/sectors", async (_req, res): Promise<void> => {
  const sectors = await db.select().from(sectorsTable).orderBy(asc(sectorsTable.name));
  res.json(ListSectorsResponse.parse(sectors));
});

router.get("/me", async (_req, res): Promise<void> => {
  const currentUser = _req.authUser!;
  const sectors = await db.select().from(sectorsTable).orderBy(asc(sectorsTable.name));
  res.json(
    GetCurrentUserResponse.parse({
      id: currentUser.id,
      username: currentUser.username,
      name: currentUser.name,
      email: currentUser.email,
      role: currentUser.role,
      active: currentUser.active,
      mustChangePassword: currentUser.mustChangePassword,
      modules: currentUser.modules,
      sectors: sectors.filter(
        (sector) => currentUser.role === "superadmin" || currentUser.sectorIds.includes(sector.id),
      ),
    }),
  );
});

router.get("/agenda", async (req, res): Promise<void> => {
  const parsed = ListAgendaItemsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { from, to, type, status } = parsed.data;
  const filters = [
    from ? gte(agendaItemsTable.dueDate, calendarDate(from)) : undefined,
    to ? lte(agendaItemsTable.dueDate, calendarDate(to)) : undefined,
    type ? eq(agendaItemsTable.type, type) : undefined,
    status ? eq(agendaItemsTable.status, status) : undefined,
  ].filter(Boolean);
  const items = await db
    .select()
    .from(agendaItemsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(agendaItemsTable.dueDate), desc(agendaItemsTable.createdAt));
  res.json(ListAgendaItemsResponse.parse(items));
});

router.post("/agenda", async (req, res): Promise<void> => {
  const parsed = CreateAgendaItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const dueDate = calendarDate(parsed.data.dueDate);
  const [item] = await db
    .insert(agendaItemsTable)
    .values({
      title: parsed.data.title,
      description: parsed.data.description ?? "",
      dueDate,
      type: parsed.data.type,
      status: parsed.data.status ?? "pendiente",
      responsibleName: parsed.data.responsibleName,
    })
    .returning();
  res.status(201).json(CreateAgendaItemResponse.parse(item));
});

router.patch("/agenda/:id", async (req, res): Promise<void> => {
  const params = UpdateAgendaItemParams.safeParse(req.params);
  const parsed = UpdateAgendaItemBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const changes: Partial<typeof agendaItemsTable.$inferInsert> = {};
  if (parsed.data.title !== undefined) changes.title = parsed.data.title;
  if (parsed.data.description !== undefined) changes.description = parsed.data.description;
  if (parsed.data.type !== undefined) changes.type = parsed.data.type;
  if (parsed.data.status !== undefined) changes.status = parsed.data.status;
  if (parsed.data.responsibleName !== undefined) changes.responsibleName = parsed.data.responsibleName;
  if (parsed.data.dueDate) {
    const dueDate = calendarDate(parsed.data.dueDate);
    changes.dueDate = dueDate;
  }
  const [item] = await db
    .update(agendaItemsTable)
    .set(changes)
    .where(eq(agendaItemsTable.id, params.data.id))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Agenda item not found" });
    return;
  }
  res.json(UpdateAgendaItemResponse.parse(item));
});

router.delete("/agenda/:id", async (req, res): Promise<void> => {
  const params = DeleteAgendaItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [item] = await db
    .delete(agendaItemsTable)
    .where(eq(agendaItemsTable.id, params.data.id))
    .returning({ id: agendaItemsTable.id });
  if (!item) {
    res.status(404).json({ error: "Agenda item not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
