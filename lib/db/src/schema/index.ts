import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Core: sectores, usuarios, permisos, sesiones
// ---------------------------------------------------------------------------

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
  /** superadmin | responsable_sector | usuario */
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
  tokenHash: text("token_hash").notNull().unique(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
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

// ---------------------------------------------------------------------------
// Administración: agenda + recordatorios
// ---------------------------------------------------------------------------

export const agendaItemsTable = pgTable("agenda_items", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  /** cheque | seguro | pago | auditoria | renovacion | otro */
  type: text("type").notNull().default("otro"),
  /** pendiente | realizado | cancelado */
  status: text("status").notNull().default("pendiente"),
  responsibleName: text("responsible_name").notNull().default(""),
  sectorId: integer("sector_id").references(() => sectorsTable.id),
  reminderDate: date("reminder_date", { mode: "string" }),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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

// ---------------------------------------------------------------------------
// Guardias
// ---------------------------------------------------------------------------

export const guardiasTable = pgTable("guardias", {
  id: serial("id").primaryKey(),
  sectorId: integer("sector_id")
    .notNull()
    .references(() => sectorsTable.id),
  date: date("date", { mode: "string" }).notNull(),
  /** manana | tarde | noche | pasiva | otro */
  shift: text("shift").notNull(),
  /** presencial | retencion */
  modality: text("modality").notNull().default("presencial"),
  professionalName: text("professional_name").notNull(),
  observations: text("observations").notNull().default(""),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Inventario: activos fijos (no consumibles en MVP)
// ---------------------------------------------------------------------------

export const inventoryItemsTable = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull().default("general"),
  brand: text("brand"),
  model: text("model"),
  serialNumber: text("serial_number"),
  purchaseDate: date("purchase_date", { mode: "string" }),
  /** operativo | en_reparacion | fuera_de_servicio */
  status: text("status").notNull().default("operativo"),
  sectorId: integer("sector_id").references(() => sectorsTable.id),
  warrantyUntil: date("warranty_until", { mode: "string" }),
  nextMaintenanceDate: date("next_maintenance_date", { mode: "string" }),
  notes: text("notes").notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const inventoryMovementsTable = pgTable("inventory_movements", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id")
    .notNull()
    .references(() => inventoryItemsTable.id, { onDelete: "cascade" }),
  fromSectorId: integer("from_sector_id").references(() => sectorsTable.id),
  toSectorId: integer("to_sector_id").references(() => sectorsTable.id),
  reason: text("reason").notNull().default(""),
  movedByUserId: integer("moved_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Instructivos (PDF por sector)
// ---------------------------------------------------------------------------

export const instructivosTable = pgTable("instructivos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  sectorId: integer("sector_id").references(() => sectorsTable.id),
  version: text("version").notNull().default("1.0"),
  attachmentPath: text("attachment_path"),
  uploadedByUserId: integer("uploaded_by_user_id").references(() => usersTable.id),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Zod helpers / types
// ---------------------------------------------------------------------------

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
export type InventoryItem = typeof inventoryItemsTable.$inferSelect;
export type InventoryMovement = typeof inventoryMovementsTable.$inferSelect;
export type Instructivo = typeof instructivosTable.$inferSelect;
export type InsertAgendaItem = z.infer<typeof insertAgendaItemSchema>;
