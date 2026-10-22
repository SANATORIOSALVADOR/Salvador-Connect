---
name: inventario
description: Módulo Inventario del Sanatorio del Salvador — equipos y bienes por planta/sector (PLANTA, SECTOR, RUBRO, TIPO, DESCRIPCION, MARCA, CODIGO DE SERIE), registro de controles / fallas / reparaciones, plan de controles, importación y exportación Excel. Usar al tocar pages/inventario/*, routes/inventario.ts, lib/inventario.ts o las tablas inv_*.
---

# Skill — Inventario

## Archivos

- UI: `apps/web/src/pages/inventario/` — `Inventario.tsx` (solapas Equipos / Controles / Plan y catálogos),
  `modales.tsx` (alta-edición, control/falla/reparación, cambios en lote, detalle con historia), `Importar.tsx`,
  `excel.ts` (leer / plantilla / exportar), `api.ts` (tipos, llamadas, situación de controles).
- API: `apps/api/src/routes/inventario.ts`; resumen para Inicio / avisos / panel: `apps/api/src/lib/inventario.ts`.
- Tablas (migración `0010_inventario.sql`): `inv_items`, `inv_registros`, `inv_planes`.
  Las viejas `inventory_items` / `inventory_movements` quedan sin uso (sus datos con sector se pasaron a `inv_items`).

## Modelo

- Equipo: planta, sector (obligatorio, FK `sectors`), rubro, tipo, descripción, marca, código de serie (único si no está vacío,
  sin distinguir mayúsculas), estado (`operativo | con_falla | en_reparacion | fuera_servicio | baja`), `frecuencia_dias`,
  `ultimo_control`, `proximo_control` (= último control o hoy + frecuencia), observaciones. Nº = id.
- Planta / rubro / tipo son texto libre, pero se reutiliza la grafía existente (sin tildes ni mayúsculas) y se pueden unificar
  ("Plan y catálogos → Unificar nombres").
- `inv_registros`: `control` (resultado ok / observacion / falla) · `falla` · `reparacion` · `traslado` · `alta` · `cambio` ·
  `baja` · `importacion`. Todo cambio de un equipo deja registro.
- Control: actualiza último/próximo control. Falla (o control con falla) → `con_falla`; reparación → `operativo` (salvo que se elija otro).
- `inv_planes`: frecuencia por tipo; la toman las altas e importaciones sin frecuencia. Al definirla se puede aplicar a los existentes.

## Importación

- La pantalla lee el archivo con SheetJS (xlsx, xls, xlsm, xlsb, ods, csv), busca la hoja y la fila de encabezados y reconoce
  sinónimos ("Nº de serie", "Descripción"…). Columnas obligatorias: las 7; opcionales: ESTADO, FRECUENCIA DE CONTROL,
  ULTIMO CONTROL, OBSERVACIONES. Cada fila manda su `fila` real del Excel.
- `POST /api/inventario/importar { filas, modo: agregar|actualizar, simular }`: la API valida todo (sector existente y a cargo,
  obligatorios, serie repetida en archivo o en base) y devuelve el resultado por fila. Primero se simula (vista previa) y después
  se importa; las filas con error no se cargan. `actualizar` = mismo código de serie → actualiza.
- SheetJS se instala desde el CDN oficial (`https://cdn.sheetjs.com/xlsx-0.20.3/...`): la versión de npm es vieja.
- La exportación usa los mismos encabezados que la importación (se puede exportar, editar y volver a subir con "actualizar").

## Permisos

Acciones (`lib/acciones.ts`): ver · exportar (Ver) · controlar · cargar (Cargar y editar) · importar · eliminar · configurar
(Control total). Módulo con sectores: toda lectura filtra por `visibleSectorIds("inventario")` y toda escritura exige
`canWriteSector`. Unificar nombres y aplicar planes solo tocan los equipos de los sectores a cargo.

## Checklist

- [ ] Importar un Excel real (con título arriba, encabezados con otras grafías) y ver errores por fila
- [ ] Encargado de un sector: solo ve y toca sus equipos
- [ ] Registrar control / falla / reparación y ver la historia
- [ ] Pruebas en `tests/api.sh` (sección "== Inventario")
