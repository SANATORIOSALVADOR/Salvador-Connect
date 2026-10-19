---
name: usuarios
description: Configuración → Usuarios y Sectores del Sanatorio del Salvador — ABM de usuarios, permisos por módulo con niveles (Ver / Cargar y editar / Control total), sectores a cargo, reset de contraseña. Usar al tocar Configuracion.tsx, Usuarios.tsx, routes/users.ts o los controles de permisos de lib/auth.ts.
---

# Skill — Usuarios, permisos y sectores (Configuración)

## Archivos

- UI: `apps/web/src/pages/Configuracion.tsx` (secciones **Usuarios**, **Sectores**, **Etiquetas** y **Apariencia**;
  `?seccion=sectores|etiquetas` abre directo esa solapa).
  `Usuarios.tsx` solo re-exporta Configuración (la ruta `/usuarios` sigue funcionando).
- API: `apps/api/src/routes/users.ts` (todo requiere `superadmin`), `routes/sectores.ts`.
- Permisos: `apps/api/src/lib/auth.ts` → `PERMISSION_MODULES`, `requireModuleAccess`, `requireLevel`, `hasLevel`.
- Tablas: `users`, `user_modules (user_id, module_key, level)`, `user_sectors`.

## Modelo

- Tipo de cuenta: `superadmin` (todo + administra usuarios y sectores) o `usuario`.
- Usuario: un nivel por módulo. Sin fila = sin acceso.

| Nivel | API | Ejemplos |
|-------|-----|----------|
| `ver` | GET | ver listados, calendario, estadísticas, exportar |
| `editar` (Cargar y editar) | POST / PUT / PATCH | crear, modificar, marcar cumplido, copiar guardias |
| `total` (Control total) | DELETE + acciones de configuración | eliminar, generar vencimientos fiscales, horarios de sectores y profesionales de Guardias |

- `dashboard` y `liquidacion` solo admiten `ver` (un nivel mayor se recorta).
- Filas viejas sin `level`: rol `responsable`/`nivel2`/`nivel3` → `total`; resto → `ver`.
- Sectores a cargo: en Guardias limitan dónde carga/modifica. Ninguno = todos.
- Las descripciones de cada nivel por módulo están en `MODULES` de `Configuracion.tsx`;
  si cambia un control en la API, actualizar ese texto.

## Reglas de seguridad (API)

- No podés desactivarte, quitarte superadmin ni eliminarte.
- No se puede dejar el sistema sin un superadmin activo.
- Desactivar o resetear clave cierra las sesiones del usuario.
- Eliminar un usuario con registros cargados devuelve 409: desactivarlo.

## Sectores y Guardias

Regla: **crear** sectores y etiquetas = solo superadmin, desde Configuración. Lo que se hace dentro de cada módulo
depende del nivel del usuario en ese módulo (y de sus sectores a cargo).

- En el formulario de sector: "Participa de Guardias Médicas" + horario requerido (`CoberturaEditor`, en
  `pages/guardias/compartido.tsx`). Se guarda con `PUT /api/guardias/config/:sectorId`
  (`requireLevel("guardias", "total")` + sectores a cargo: también lo usa Guardias → Configuración).
- Etiquetas: tabla `guardia_etiquetas` (migración `0005`). API `GET /api/guardias/etiquetas` (cualquiera con Guardias),
  `POST / PATCH / DELETE` solo superadmin. Renombrar o cambiar el color actualiza `guardias.tag_label/tag_color`;
  eliminar solo si ninguna guardia la usa (409 → desactivar).

## Menú

`apps/web/src/App.tsx` (Shell): el menú filtra por `user.modules`; "Usuarios" no aparece (vive en Configuración)
y "Configuración" solo para superadmin.

## Checklist

- [ ] Crear con permisos y sectores; copiar permisos de otro usuario
- [ ] Cada nivel bloquea lo que corresponde (pruebas en `D:\dev\_pgtest\api-test.sh`)
- [ ] El menú y los botones reflejan los permisos al volver a cargar la página
