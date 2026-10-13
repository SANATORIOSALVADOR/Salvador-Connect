---
name: guardias-medicas
description: Módulo Guardias Médicas — calendario de cobertura y carga de guardias por sector (activa/pasiva, inicio/fin). Usar al tocar GuardiasMedicas.tsx, routes/guardias.ts o tabla guardias.
---

# Skill — Guardias Médicas

## Objetivo

Ver quién está de guardia por día/sector y cargar registros con horario.

## Archivos

- UI: `apps/web/src/pages/GuardiasMedicas.tsx`
- API: `apps/api/src/routes/guardias.ts`
- Schema: `guardias` en `packages/db`

## Campos de carga (vigentes)

- **Sector:** Guardia Central, UTI Neo, UTI UCO, Piso Gineco, Piso Clínica Médica, Residentes
- **Fecha:** dd/mm/yyyy
- **Inicio / Fin:** hora
- **Modalidad:** activa | pasiva
- Profesional / observaciones según API

**No** reintroducir en UI los campos **turno** ni **tipo**.

## Vistas

1. **Calendario** — mes con chips por día; detalle del día seleccionado
2. **Carga / registro** — formulario + listado

Grilla del mes: 7 columnas (inline styles preferidos).

## Permisos

- Carga/edición: `superadmin` o `responsable`
- Responsable con sectores asignados: solo carga/edita/borra en esos sectores (sin sectores asignados = todos)

## Reglas de datos

- Si la hora de fin es menor o igual a la de inicio con la misma fecha, la guardia termina el día siguiente (API y UI lo ajustan solos).
- Profesionales se comparan sin tildes ni mayúsculas; al guardar se reutiliza la grafía ya cargada.
- Estadísticas del mes cuentan solo las horas dentro del mes.
- Cobertura del calendario: rojo si algún sector de guardia no tiene a nadie ese día.

## Checklist

- [ ] Alta con sector + fechas/horas + modalidad
- [ ] Calendario muestra guardias del mes
- [ ] Nombre del módulo en nav: **Guardias Médicas**
