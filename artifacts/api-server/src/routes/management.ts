import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db, agendaItemsTable, sectorsTable } from "@workspace/db";
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
} from "@workspace/api-zod";

const router: IRouter = Router();

function calendarDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

const activity = [
  {
    id: 1,
    title: "Agenda actualizada",
    detail: "Se agregó el vencimiento de seguros de abril",
    actor: "María González",
    createdAt: new Date("2026-09-17T08:42:00Z"),
    kind: "agenda" as const,
  },
  {
    id: 2,
    title: "Guardia confirmada",
    detail: "Turno noche del sector Internación",
    actor: "Julián Rodríguez",
    createdAt: new Date("2026-09-16T16:18:00Z"),
    kind: "guardia" as const,
  },
  {
    id: 3,
    title: "Movimiento de inventario",
    detail: "Ingreso de descartables registrado",
    actor: "Carla López",
    createdAt: new Date("2026-09-16T11:04:00Z"),
    kind: "inventario" as const,
  },
  {
    id: 4,
    title: "Instructivo actualizado",
    detail: "Protocolo de recepción de proveedores · v2.1",
    actor: "María González",
    createdAt: new Date("2026-09-15T13:55:00Z"),
    kind: "instructivo" as const,
  },
];

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const items = await db
    .select()
    .from(agendaItemsTable)
    .where(eq(agendaItemsTable.status, "pendiente"))
    .orderBy(asc(agendaItemsTable.dueDate));
  const next = items[0];
  res.json(
    GetDashboardSummaryResponse.parse({
      upcomingReminders: items.length,
      pendingGuardias: 3,
      lowStockItems: 4,
      recentActivityCount: activity.length,
      nextReminder: next?.title ?? null,
      nextReminderDate: next?.dueDate ?? null,
    }),
  );
});

router.get("/dashboard/activity", async (req, res): Promise<void> => {
  const parsed = GetRecentActivityQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 6) : 6;
  res.json(GetRecentActivityResponse.parse(activity.slice(0, limit)));
});

router.get("/sectors", async (_req, res): Promise<void> => {
  const sectors = await db.select().from(sectorsTable).orderBy(asc(sectorsTable.name));
  res.json(ListSectorsResponse.parse(sectors));
});

router.get("/me", async (_req, res): Promise<void> => {
  const sectors = await db.select().from(sectorsTable).orderBy(asc(sectorsTable.name));
  res.json(
    GetCurrentUserResponse.parse({
      id: 1,
      name: "María González",
      email: "maria.gonzalez@sanatoriosalvador.com.ar",
      role: "Administrador General",
      sectors,
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
  const reminderDate = new Date(`${dueDate}T00:00:00Z`);
  reminderDate.setUTCDate(reminderDate.getUTCDate() - 2);
  const [item] = await db
    .insert(agendaItemsTable)
    .values({
      title: parsed.data.title,
      description: parsed.data.description ?? "",
      dueDate,
      type: parsed.data.type,
      status: parsed.data.status ?? "pendiente",
      responsibleName: parsed.data.responsibleName,
      sectorName: parsed.data.sectorName ?? null,
      reminderDate: reminderDate.toISOString().slice(0, 10),
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
  if (parsed.data.description !== undefined) {
    changes.description = parsed.data.description;
  }
  if (parsed.data.type !== undefined) changes.type = parsed.data.type;
  if (parsed.data.status !== undefined) changes.status = parsed.data.status;
  if (parsed.data.responsibleName !== undefined) {
    changes.responsibleName = parsed.data.responsibleName;
  }
  if (parsed.data.sectorName !== undefined) {
    changes.sectorName = parsed.data.sectorName;
  }
  if (parsed.data.dueDate) {
    const dueDate = calendarDate(parsed.data.dueDate);
    const reminderDate = new Date(`${dueDate}T00:00:00Z`);
    reminderDate.setUTCDate(reminderDate.getUTCDate() - 2);
    changes.dueDate = dueDate;
    Object.assign(changes, {
      reminderDate: reminderDate.toISOString().slice(0, 10),
    });
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