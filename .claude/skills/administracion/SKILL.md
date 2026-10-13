---
name: administracion
description: Módulo Administración del Sanatorio del Salvador (v2) — agenda, control fiscal con calendario oficial cargado a mano, cheques, documentos/contratos, tareas, recurrentes, contactos, feriados e historial. Usar al tocar Administracion.tsx, pages/administracion/*, routes/administracion.ts o lib/administracion.ts.
---

# Skill — Administración (v2, oct-2026)

## Objetivo

Que el área no se olvide de nada: vencimientos fiscales con fechas exactas (sin conexión a ARCA), pagos, cheques,
documentos que vencen y tareas del día a día, con avisos y registro de cómo se cumplió cada cosa.

## Archivos

- UI: `apps/web/src/pages/Administracion.tsx` (encabezado, pestañas, modales globales) y `apps/web/src/pages/administracion/`
  - `logic.ts` (puro, probado en `tests/web-logic.test.mjs`), `api.ts`, `contexto.tsx` (`useAdm`, `useDatos`), `ui.tsx`, `modales.tsx`
  - Pestañas: `Resumen`, `Agenda` (lista + calendario 7 col.), `Fiscal` (control del mes / calendario oficial / obligaciones),
    `Cheques`, `Documentos`, `Tareas`, `Recurrentes`, `Contactos`, `Ajustes` (feriados + historial)
- API: `apps/api/src/routes/administracion.ts`
- Lógica de fechas y automatización: `apps/api/src/lib/administracion.ts`
- Schema: tablas `adm_*` en `packages/db/src/schema/index.ts`; migración `packages/db/migrations/0003_administracion.sql`
  (copió los datos de `liquidacion_items`, que quedó intacta)

## Modelo

| Tabla | Qué guarda |
|-------|-----------|
| `adm_items` | Todo lo que tiene fecha. `tipo`: fiscal, vencimiento, pago, cheque, documento, tarea, recordatorio. Datos propios en `datos` (jsonb: cheque, documento, subtareas). Cumplimiento: `presentado`, `pagado`, `cumplido_fecha`, `comprobante`, `monto_pagado` |
| `adm_obligaciones` | Catálogo fiscal (organismo, mensual/anual, día habitual, período que se declara, presentar/pagar) |
| `adm_calendario` | Fecha oficial o prórroga por obligación + año + mes (+ verificada por / cuándo) |
| `adm_feriados` | Feriados del año (si un año no tiene, se calculan por ley sin puentes) |
| `adm_recurrentes` | Pagos/tareas que se repiten; `omitidas` = fechas borradas a propósito |
| `adm_contactos` | Agenda del área |
| `adm_historial` | Quién hizo qué (sin FK: sobrevive a borrados) |

## Reglas

- Fiscal: único por (`obligacion_id`, `periodo` = mes de vencimiento). Fecha = calendario oficial; si no hay, **estimada**.
- Automatización (`automatizarAdministracion`): al arrancar la API y cada hora crea fiscales del mes actual y el siguiente y los recurrentes a 62 días.
- Si cambia el calendario o los feriados, se actualizan los fiscales **pendientes** salvo los de `fecha_origen = manual`.
- Un fiscal generado no se borra (409): se **cancela** con motivo. Un recurrente borrado no vuelve (queda en `omitidas`).
- Cumplir un fiscal pide presentación y/o pago según la obligación; con uno solo queda pendiente ("Falta pagar").
- Documento renovado → crea el próximo vencimiento (`renovarFecha`).
- **No** hay cliente ARCA/AFIP: la agenda pública (seti.afip.gob.ar) no responde a consultas automáticas. No implementarlo sin pedido.

## Permisos

- Ver: todo GET. Cargar y editar: crear/editar/cumplir/cancelar ítems, recurrentes, contactos, generar mes, «Verificar fechas del mes».
- Control total: eliminar, catálogo de obligaciones, calendario oficial (fechas, prórrogas, pegar), feriados.

## Checklist

- [ ] `bash tests/api.sh` (sección Administración) y `node tests/web-logic.test.mjs`
- [ ] Generar el mismo mes dos veces no duplica
- [ ] Cambiar una fecha del calendario mueve el vencimiento pendiente
- [ ] Calendario 7 columnas; sin desborde a 390 px
