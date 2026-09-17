import { createInsertSchema } from "drizzle-zod";
import {
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const sectorsTable = pgTable("sectors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  members: integer("members").notNull().default(0),
});

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  clerkId: text("clerk_id").unique(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("Usuario"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userSectorsTable = pgTable("user_sectors", {
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  sectorId: integer("sector_id")
    .notNull()
    .references(() => sectorsTable.id, { onDelete: "cascade" }),
});

export const agendaItemsTable = pgTable("agenda_items", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  type: text("type").notNull().default("tarea"),
  status: text("status").notNull().default("pendiente"),
  responsibleName: text("responsible_name").notNull(),
  sectorName: text("sector_name"),
  reminderDate: date("reminder_date", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const remindersTable = pgTable("reminders", {
  id: serial("id").primaryKey(),
  agendaItemId: integer("agenda_item_id")
    .notNull()
    .references(() => agendaItemsTable.id, { onDelete: "cascade" }),
  remindAt: timestamp("remind_at", { withTimezone: true }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

export const guardiasTable = pgTable("guardias", {
  id: serial("id").primaryKey(),
  sectorId: integer("sector_id").references(() => sectorsTable.id),
  date: date("date", { mode: "string" }).notNull(),
  shift: text("shift").notNull(),
  professionalName: text("professional_name").notNull(),
  observations: text("observations").notNull().default(""),
});

export const inventoryItemsTable = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  currentStock: integer("current_stock").notNull().default(0),
  minimumStock: integer("minimum_stock").notNull().default(0),
  unit: text("unit").notNull(),
  sectorId: integer("sector_id").references(() => sectorsTable.id),
  lastMovementDate: date("last_movement_date", { mode: "string" }),
});

export const inventoryMovementsTable = pgTable("inventory_movements", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id")
    .notNull()
    .references(() => inventoryItemsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  quantity: integer("quantity").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const instructivosTable = pgTable("instructivos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  sectorId: integer("sector_id").references(() => sectorsTable.id),
  content: text("content").notNull().default(""),
  version: text("version").notNull().default("1.0"),
  attachmentPath: text("attachment_path"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertSectorSchema = createInsertSchema(sectorsTable).omit({
  id: true,
});
export const insertAgendaItemSchema = createInsertSchema(agendaItemsTable).omit(
  { id: true, createdAt: true, updatedAt: true },
);

export type Sector = typeof sectorsTable.$inferSelect;
export type AgendaItem = typeof agendaItemsTable.$inferSelect;
export type InsertAgendaItem = z.infer<typeof insertAgendaItemSchema>;