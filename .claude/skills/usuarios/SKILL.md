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
- **Alcance por módulo** (solo módulos con sectores: `SECTOR_MODULES` = guardias, inventario, instructivos):
  `todos` | `carga` (ve todo, carga / modifica / elimina en sus sectores) | `sector` (ve y trabaja solo en sus sectores).
  Columnas `user_modules.alcance` y `user_modules.sector_ids` (migración `0006`). Sin sectores elegidos = `todos`.
  La API acepta `scopes: { modulo: { alcance, sectorIds } }`; por compatibilidad, `sectorIds: [..]` = `carga` en cada módulo con sectores.
  `user_sectors` queda solo como referencia (unión de todos los sectores a cargo).
- Helpers en `lib/auth.ts`: `visibleSectorIds` (qué ve; null = todo), `ownSectorIds` (dónde trabaja / "lo suyo"),
  `canSeeSector`, `canWriteSector`. Cualquier endpoint que devuelva datos con sector tiene que filtrar con `visibleSectorIds`
  (hoy: guardias, config, auditoría, profesionales/lista, Inicio, notificaciones, gráficos, actividad, buscador).
- No se puede eliminar un sector que está a cargo de alguien (409): si no, esa persona pasaría a ver todos.
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

## Acciones concretas

- Catálogo en `apps/api/src/lib/acciones.ts` (y `apps/web/src/lib/permisos.ts → ACCIONES` con los textos). Cada acción tiene el
  nivel desde el que viene "de fábrica". `accionesDeNivel(mod, nivel)` = el atajo.
- Se guardan solo si difieren del nivel: `user_modules.acciones` (null = las del nivel) y `perfiles.acciones` ({mod: [...]}).
  `efectivos()` devuelve `acciones` y la sesión (`AuthUser.acciones`, `/auth/me`) también.
- API: `can(user, mod, accion)` y `requireAccion(mod, accion)`. Guardias y Administración controlan cada ruta de escritura
  con su acción (router con `requireModuleAccess(mod, { porRuta: true })`). Inventario / Instructivos: por método (cargar / eliminar).
- Pantallas: Guardias usa `acciones.guardias`; Administración arma `Permisos` (editar = cargar, cumplir, verificar,
  recurrentes, contactos, eliminar, calendario) en `Administracion.tsx → permisosDe`.
- Estadísticas y exportar se controlan en pantalla (los datos son los mismos del calendario).

## Perfiles y "Ver como"

- Tabla `perfiles` (nombre, descripción, `permisos` {modulo: nivel}, `alcances` {modulo: alcance}); `users.perfil_id`.
  API bajo `/api/users/perfiles` (solo superadmin). Borrar un perfil deja a cada persona con los permisos que tenía (a medida).
- Con perfil, `user_modules` guarda solo lo propio: `level='perfil'` (hereda el nivel; guarda los sectores), `'ninguno'`
  (excepción sin acceso) o un nivel / alcance distinto (excepción). `efectivos()` en `lib/auth.ts` arma el resultado.
- Con perfil que trabaja por sector, la persona TIENE que tener sectores (400 si no); sin sectores no ve nada por sector.
- La pantalla manda siempre el estado completo (`perfilId`, `permissions`, `scopes`); la API calcula las excepciones.
- "Ver como": `POST /api/auth/ver-como {userId}` (superadmin) pone la cookie `sanatorio_ver_como`; `DELETE` la saca.
  En ese modo la API trabaja como esa persona y responde 403 `codigo: "ver_como"` a todo lo que no sea consultar.
  `GET /api/auth/me` devuelve `verComo` y la web muestra la franja (`components/ver-como.tsx`).

## Menú

`apps/web/src/App.tsx` (Shell): el menú filtra por `user.modules`; "Usuarios" no aparece (vive en Configuración)
y "Configuración" solo para superadmin.

## Checklist

- [ ] Crear con permisos y sectores; copiar permisos de otro usuario
- [ ] Cada nivel bloquea lo que corresponde (pruebas en `D:\dev\_pgtest\api-test.sh`)
- [ ] El menú y los botones reflejan los permisos al volver a cargar la página
