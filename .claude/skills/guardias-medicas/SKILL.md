---
name: guardias-medicas
description: Módulo Guardias Médicas — calendario de cobertura y carga de guardias por sector (activa/pasiva, inicio/fin). Usar al tocar GuardiasMedicas.tsx, routes/guardias.ts o tabla guardias.
---

# Skill — Guardias Médicas

## Objetivo

Ver quién está de guardia por día/sector y cargar registros con horario.

## Archivos

- UI: `apps/web/src/pages/GuardiasMedicas.tsx`
- Lógica pura (fechas, cobertura, estadísticas): `apps/web/src/pages/guardias/logic.ts`
- API: `apps/api/src/routes/guardias.ts`
- Schema: `guardias`, `profesionales`, `guardia_sectores`, `guardias_auditoria` en `packages/db`

## Campos de carga (vigentes)

- **Sector:** Guardia Central, UTI Neo, UTI UCO, Piso Gineco, Piso Clínica Médica, Residentes
- **Fecha:** dd/mm/yyyy
- **Inicio / Fin:** hora
- **Modalidad:** activa | pasiva
- Profesional / observaciones según API

**No** reintroducir en UI los campos **turno** ni **tipo**.

## Vistas

1. **Calendario** — panel "De guardia ahora", mes de 7 columnas (lista en celular), cobertura por sector y detalle del día con huecos
2. **Carga nueva** — formulario; mantiene sector y horario para cargar la siguiente
3. **Registro** — tabla del mes, CSV, copiar semana / mes anterior, historial de cambios
4. **Estadísticas** — productividad: horas activas / pasivas, nocturnas, extras, reemplazos, % del horario requerido cubierto
5. **Configuración** (Control total) — sectores que participan y su horario requerido (solo en sus sectores a cargo)
   y datos de profesionales. **Crear** sectores y etiquetas es del superadmin, en Configuración del sistema.

Estilos de estado en línea: el CSS del build fija `background` / `border` de `.gm-cell` con `!important`
(por eso el color de cobertura usa `box-shadow` inline).

## Permisos

- Nivel en el módulo (Ver / Cargar y editar / Control total) + **alcance por sector** del permiso de Guardias:
  todos · ve todo y trabaja en sus sectores · solo sus sectores (no ve nada de otros sectores).
- Profesionales: la lista de nombres es común (se necesita para cargar); el contador de guardias cuenta solo lo visible y
  no se puede renombrar a alguien que hace guardias fuera de los sectores propios.
- Solape con una guardia de un sector que no ve: avisa "en otro sector" sin dar el detalle.

## Reglas de datos

- Si la hora de fin es menor o igual a la de inicio con la misma fecha, la guardia termina el día siguiente (API y UI lo ajustan solos).
- Profesionales se comparan sin tildes ni mayúsculas; al guardar se reutiliza la grafía ya cargada.
- Estadísticas del mes cuentan solo las horas dentro del mes.
- Cobertura: cada sector de guardia tiene un horario requerido por día de la semana (`guardia_sectores.cobertura`).
  Amarillo = falta cubrir parte de ese horario; rojo = ningún sector tiene a nadie. Sin horario fijo: se marca si nadie ese día.
  Solo se evalúa hasta el último día ya planificado (los meses vacíos a futuro no se pintan).
- Las guardias activas y pasivas cuentan como cobertura; en estadísticas se separan.
- Profesionales: tabla propia; se crean solos al cargar un nombre nuevo; renombrar actualiza sus guardias.
- Copiar período: omite lo que se solapa con guardias del mismo profesional (no duplica si se copia dos veces).
- Toda alta / modificación / baja / copia queda en `guardias_auditoria`.
- Etiquetas: solo del catálogo `guardia_etiquetas` (activas). La API guarda nombre y color del catálogo; al editar una guardia
  se conserva la etiqueta que ya tenía aunque hoy esté desactivada. Sin texto libre en la UI.

## Checklist

- [ ] Alta con sector + fechas/horas + modalidad
- [ ] Calendario muestra guardias del mes
- [ ] Nombre del módulo en nav: **Guardias Médicas**
