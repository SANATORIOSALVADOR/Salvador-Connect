import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  date,
  integer,
  jsonb,
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
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  name: text("name").notNull(),
  email: text("email").unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("usuario"),
  active: boolean("active").notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userModulesTable = pgTable("user_modules", {
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  moduleKey: text("module_key").notNull(),
});

export const sessionsTable = pgTable("sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
  type: text("type").notNull().default("tarea"),
  status: text("status").notNull().default("pendiente"),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  responsibleName: text("responsible_name").notNull().default(""),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const remindersTable = pgTable("reminders", {
  id: serial("id").primaryKey(),
  agendaItemId: integer("agenda_item_id").references(() => agendaItemsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  done: boolean("done").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Profesionales que hacen guardias (se crean solos al cargar un nombre nuevo). */
export const profesionalesTable = pgTable("profesionales", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // Nombre normalizado (sin tildes, minúsculas) para no duplicar "Pérez" / "perez".
  nameKey: text("name_key").notNull().unique(),
  matricula: text("matricula").notNull().default(""),
  especialidad: text("especialidad").notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const guardiasTable = pgTable("guardias", {
  id: serial("id").primaryKey(),
  sectorId: integer("sector_id")
    .notNull()
    .references(() => sectorsTable.id),
  // date = fecha de inicio; endDate = fecha de fin (puede ser el día siguiente)
  date: date("date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }),
  shift: text("shift").notNull().default(""),
  startTime: text("start_time").notNull().default("08:00"),
  endTime: text("end_time").notNull().default("16:00"),
  modality: text("modality").notNull().default("activa"),
  type: text("type").notNull().default(""),
  professionalName: text("professional_name").notNull(),
  professionalId: integer("professional_id").references(() => profesionalesTable.id),
  observations: text("observations").notNull().default(""),
  // Etiqueta opcional (ej. GUARDIA EXTRA) + color
  tagLabel: text("tag_label").notNull().default(""),
  tagColor: text("tag_color").notNull().default(""),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Franja horaria que un sector necesita cubierta. dow: 0 = domingo … 6 = sábado. */
export type CoberturaFranja = { dow: number; start: string; end: string };

/** Sectores que participan de Guardias y su horario de cobertura requerido. */
export const guardiaSectoresTable = pgTable("guardia_sectores", {
  sectorId: integer("sector_id")
    .primaryKey()
    .references(() => sectorsTable.id, { onDelete: "cascade" }),
  active: boolean("active").notNull().default(true),
  cobertura: jsonb("cobertura").$type<CoberturaFranja[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Registro de altas, cambios y bajas de guardias (quién y qué). */
export const guardiasAuditoriaTable = pgTable("guardias_auditoria", {
  id: serial("id").primaryKey(),
  guardiaId: integer("guardia_id"),
  action: text("action").notNull(), // alta | modificacion | baja | copia
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  userName: text("user_name").notNull().default(""),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const liquidacionItemsTable = pgTable("liquidacion_items", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  itemType: text("item_type").notNull().default("vencimiento"),
  status: text("status").notNull().default("pendiente"),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  amount: text("amount").notNull().default(""),
  responsibleName: text("responsible_name").notNull().default(""),
  notes: text("notes").notNull().default(""),
  alertDays: integer("alert_days").notNull().default(3),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inventoryItemsTable = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull().default("general"),
  serialNumber: text("serial_number"),
  status: text("status").notNull().default("activo"),
  sectorId: integer("sector_id").references(() => sectorsTable.id),
  locationNote: text("location_note").notNull().default(""),
  acquiredAt: date("acquired_at", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inventoryMovementsTable = pgTable("inventory_movements", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id")
    .notNull()
    .references(() => inventoryItemsTable.id, { onDelete: "cascade" }),
  fromSectorId: integer("from_sector_id").references(() => sectorsTable.id),
  toSectorId: integer("to_sector_id").references(() => sectorsTable.id),
  note: text("note").notNull().default(""),
  movedAt: timestamp("moved_at", { withTimezone: true }).notNull().defaultNow(),
  movedByUserId: integer("moved_by_user_id").references(() => usersTable.id),
});

export const instructivosTable = pgTable("instructivos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  sectorId: integer("sector_id").references(() => sectorsTable.id),
  filePath: text("file_path").notNull(),
  version: text("version").notNull().default("1.0"),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
});

export const insertSectorSchema = createInsertSchema(sectorsTable).omit({
  id: true,
  createdAt: true,
});

export const insertAgendaItemSchema = createInsertSchema(agendaItemsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Sector = typeof sectorsTable.$inferSelect;
export type User = typeof usersTable.$inferSelect;
export type AgendaItem = typeof agendaItemsTable.$inferSelect;
export type Guardia = typeof guardiasTable.$inferSelect;
export type Profesional = typeof profesionalesTable.$inferSelect;
export type GuardiaSector = typeof guardiaSectoresTable.$inferSelect;
export type LiquidacionItem = typeof liquidacionItemsTable.$inferSelect;
