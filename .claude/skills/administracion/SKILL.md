---
name: administracion
description: Módulo Administración del Sanatorio del Salvador — vencimientos, recordatorios, calendario mensual, generación de vencimientos fiscales locales (ARCA). Usar al tocar listado, avisos, generar fiscal, Administracion.tsx o routes/administracion.ts.
---

# Skill — Administración

## Objetivo

Reemplazo del control en papel: vencimientos, pagos, recordatorios y notas, con calendario y avisos por proximidad de fecha.

## Archivos canónicos

- UI: `apps/web/src/pages/Administracion.tsx`
- API: `apps/api/src/routes/administracion.ts`
- Schema: tablas de administración / agenda en `packages/db/src/schema/index.ts`

## UI esperada

- Tabs: **Listado** | **Calendario** | **+ Nuevo**
- Barra fiscal compacta: texto corto + botón **Generar vencimientos** (modal mes/año)
- Calendario: grilla 7 columnas; al elegir un día, **detalle a la derecha**
- Listado: urgencia, fecha, título, tipo, responsable, estado; sin basura `[FISCAL:...]` en preview de notas

## Fiscal (local)

- Endpoint generar fiscal con `year` + `month`
- Idempotencia por marca en notes tipo `[FISCAL:CODE:YYYY-MM]`
- CUIT de referencia del sanatorio en reglas locales
- **No** implementar cliente AFIP/ARCA real sin pedido explícito del usuario

## Permisos

- Escritura / generar fiscal / eliminar: `superadmin` o `responsable` (según API actual)

## Checklist

- [ ] Crear ítem manual funciona
- [ ] Generar mes no duplica el mismo CODE+periodo
- [ ] Calendario 7 columnas + panel derecho
- [ ] Sidebar no tapa títulos
