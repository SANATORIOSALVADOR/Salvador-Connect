import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
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
  // Nivel en el módulo: ver | editar | total. Vacío = fila vieja (se deduce del rol del usuario).
  level: text("level").notNull().default(""),
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

/** Registro de migraciones aplicadas (lo maneja apps/api/src/lib/migrate.ts). */
export const schemaMigrationsTable = pgTable("schema_migrations", {
  id: text("id").primaryKey(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Configuración general del sistema (clave → valor JSON). Ej.: "apariencia". */
export const appSettingsTable = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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

// ===== Administración (v2, migración 0003) =====

/** Obligaciones fiscales y periódicas que el área tiene que cumplir (catálogo editable). */
export const admObligacionesTable = pgTable("adm_obligaciones", {
  id: serial("id").primaryKey(),
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
  organismo: text("organismo").notNull().default("arca"),
  periodicidad: text("periodicidad").notNull().default("mensual"),
  mesAnual: integer("mes_anual"),
  diaEstimado: integer("dia_estimado").notNull().default(20),
  desfasePeriodo: integer("desfase_periodo").notNull().default(-1),
  presentacion: boolean("presentacion").notNull().default(true),
  pago: boolean("pago").notNull().default(true),
  responsable: text("responsable").notNull().default(""),
  alertDays: integer("alert_days").notNull().default(7),
  referencia: text("referencia").notNull().default(""),
  notas: text("notas").notNull().default(""),
  activo: boolean("activo").notNull().default(true),
  orden: integer("orden").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Fechas oficiales (o prorrogadas) de cada obligación por mes, cargadas del calendario publicado. */
export const admCalendarioTable = pgTable(
  "adm_calendario",
  {
    id: serial("id").primaryKey(),
    obligacionId: integer("obligacion_id")
      .notNull()
      .references(() => admObligacionesTable.id, { onDelete: "cascade" }),
    anio: integer("anio").notNull(),
    mes: integer("mes").notNull(),
    fecha: date("fecha", { mode: "string" }).notNull(),
    origen: text("origen").notNull().default("oficial"),
    norma: text("norma").notNull().default(""),
    verificadoPor: integer("verificado_por").references(() => usersTable.id, { onDelete: "set null" }),
    verificadoAt: timestamp("verificado_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("adm_calendario_oblig_mes_uq").on(t.obligacionId, t.anio, t.mes)],
);

/** Feriados y días no laborables (para estimar fechas y mover al día hábil). */
export const admFeriadosTable = pgTable("adm_feriados", {
  fecha: date("fecha", { mode: "string" }).primaryKey(),
  nombre: text("nombre").notNull(),
  tipo: text("tipo").notNull().default("inamovible"),
});

/** Vencimientos que se repiten (servicios, alquileres, seguros, tareas fijas). */
export const admRecurrentesTable = pgTable("adm_recurrentes", {
  id: serial("id").primaryKey(),
  titulo: text("titulo").notNull(),
  tipo: text("tipo").notNull().default("pago"),
  descripcion: text("descripcion").notNull().default(""),
  frecuencia: text("frecuencia").notNull().default("mensual"),
  dia: integer("dia").notNull().default(10),
  desde: date("desde", { mode: "string" }).notNull(),
  hasta: date("hasta", { mode: "string" }),
  habiles: boolean("habiles").notNull().default(true),
  monto: text("monto").notNull().default(""),
  responsable: text("responsable").notNull().default(""),
  alertDays: integer("alert_days").notNull().default(3),
  omitidas: jsonb("omitidas").notNull().default([]),
  activo: boolean("activo").notNull().default(true),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Todo lo que tiene fecha en el área: fiscales, pagos, cheques, documentos, tareas y recordatorios. */
export const admItemsTable = pgTable(
  "adm_items",
  {
    id: serial("id").primaryKey(),
    tipo: text("tipo").notNull().default("recordatorio"),
    titulo: text("titulo").notNull(),
    descripcion: text("descripcion").notNull().default(""),
    fecha: date("fecha", { mode: "string" }).notNull(),
    hora: text("hora").notNull().default(""),
    estado: text("estado").notNull().default("pendiente"),
    prioridad: text("prioridad").notNull().default("normal"),
    responsable: text("responsable").notNull().default(""),
    monto: text("monto").notNull().default(""),
    alertDays: integer("alert_days").notNull().default(3),
    obligacionId: integer("obligacion_id").references(() => admObligacionesTable.id, { onDelete: "set null" }),
    periodo: text("periodo"),
    fechaOrigen: text("fecha_origen").notNull().default("manual"),
    recurrenteId: integer("recurrente_id").references(() => admRecurrentesTable.id, { onDelete: "set null" }),
    datos: jsonb("datos").notNull().default({}),
    presentado: boolean("presentado").notNull().default(false),
    pagado: boolean("pagado").notNull().default(false),
    cumplidoFecha: date("cumplido_fecha", { mode: "string" }),
    comprobante: text("comprobante").notNull().default(""),
    montoPagado: text("monto_pagado").notNull().default(""),
    cumplimientoNota: text("cumplimiento_nota").notNull().default(""),
    cumplidoPor: integer("cumplido_por").references(() => usersTable.id),
    legacyId: integer("legacy_id").unique(),
    createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("adm_items_fecha_idx").on(t.fecha),
    uniqueIndex("adm_items_fiscal_uq").on(t.obligacionId, t.periodo).where(sql`${t.obligacionId} IS NOT NULL`),
    uniqueIndex("adm_items_recurrente_uq").on(t.recurrenteId, t.fecha).where(sql`${t.recurrenteId} IS NOT NULL`),
  ],
);

/** Agenda de contactos del área (proveedores, bancos, aseguradoras, estudio contable...). */
export const admContactosTable = pgTable("adm_contactos", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  rubro: text("rubro").notNull().default(""),
  persona: text("persona").notNull().default(""),
  telefono: text("telefono").notNull().default(""),
  email: text("email").notNull().default(""),
  cuit: text("cuit").notNull().default(""),
  notas: text("notas").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Historial de cambios del módulo (quién hizo qué y cuándo). Sin FK: sobrevive a los borrados. */
export const admHistorialTable = pgTable(
  "adm_historial",
  {
    id: serial("id").primaryKey(),
    entidad: text("entidad").notNull(),
    entidadId: integer("entidad_id"),
    accion: text("accion").notNull(),
    detalle: text("detalle").notNull().default(""),
    userId: integer("user_id"),
    userName: text("user_name").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("adm_historial_entidad_idx").on(t.entidad, t.entidadId)],
);

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
