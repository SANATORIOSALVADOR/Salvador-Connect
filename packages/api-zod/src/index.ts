import { z } from "zod";

/** Schemas usados por el API (operativos; regenerables con Orval más adelante). */

export const HealthCheckResponse = z.object({ status: z.string() });

export const LoginBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const LoginResponse = z.object({
  user: z.object({
    id: z.number().int(),
    username: z.string(),
    name: z.string(),
    email: z.string().nullable(),
    role: z.string(),
    active: z.boolean(),
    mustChangePassword: z.boolean(),
    modules: z.array(z.string()),
    sectorIds: z.array(z.number().int()),
    sectors: z.array(
      z.object({
        id: z.number().int(),
        name: z.string(),
        shortName: z.string(),
      }),
    ),
  }),
});

export const ChangePasswordBody = z.object({
  newPassword: z.string().min(6),
});

export const GetDashboardSummaryResponse = z.object({
  upcomingReminders: z.number().int(),
  pendingGuardias: z.number().int(),
  lowStockItems: z.number().int(),
  recentActivityCount: z.number().int(),
  nextReminder: z.string().nullish(),
  nextReminderDate: z.string().nullish(),
});

export const GetRecentActivityQueryParams = z.object({
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

export const GetRecentActivityResponse = z.array(
  z.object({
    id: z.number().int(),
    title: z.string(),
    detail: z.string(),
    actor: z.string(),
    createdAt: z.coerce.date(),
    kind: z.enum(["agenda", "guardia", "inventario", "instructivo", "sistema"]),
  }),
);

export const ListSectorsResponse = z.array(
  z.object({
    id: z.number().int(),
    name: z.string(),
    shortName: z.string(),
    active: z.boolean().optional(),
  }),
);

export const GetCurrentUserResponse = z.object({
  id: z.number().int(),
  username: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  role: z.string(),
  active: z.boolean(),
  mustChangePassword: z.boolean(),
  modules: z.array(z.string()),
  sectors: z.array(
    z.object({
      id: z.number().int(),
      name: z.string(),
      shortName: z.string(),
    }),
  ),
});

export const ListAgendaItemsQueryParams = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
});

export const ListAgendaItemsResponse = z.array(z.any());
export const CreateAgendaItemBody = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.union([z.string(), z.coerce.date()]),
  type: z.string(),
  status: z.string().optional(),
  responsibleName: z.string(),
  sectorName: z.string().optional().nullable(),
});
export const CreateAgendaItemResponse = z.any();
export const UpdateAgendaItemParams = z.object({ id: z.coerce.number().int() });
export const UpdateAgendaItemBody = CreateAgendaItemBody.partial();
export const UpdateAgendaItemResponse = z.any();
export const DeleteAgendaItemParams = z.object({ id: z.coerce.number().int() });

export const ListUsersResponse = z.array(z.any());
export const CreateUserBody = z.object({
  username: z.string().min(1),
  name: z.string().min(1),
  email: z.string().optional().nullable(),
  password: z.string().min(6),
  role: z.string(),
  active: z.boolean().optional(),
  modules: z.array(z.string()).optional(),
  sectorIds: z.array(z.number().int()).optional(),
});
export const CreateUserResponse = z.any();
export const UpdateUserBody = z.object({
  username: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  email: z.string().optional().nullable(),
  role: z.string().optional(),
  active: z.boolean().optional(),
  modules: z.array(z.string()).optional(),
  sectorIds: z.array(z.number().int()).optional(),
});
export const UpdateUserResponse = z.any();
export const ResetUserPasswordBody = z.object({ password: z.string().min(6) });
export const ResetUserPasswordResponse = z.object({ ok: z.boolean() });
