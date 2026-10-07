---
name: usuarios
description: ABM de usuarios y permisos del Sanatorio del Salvador — crear, editar, módulos visibles, roles, sectores, reset de contraseña. Usar al tocar Usuarios.tsx o routes/users.ts.
---

# Skill — Usuarios y permisos

## Archivos

- UI: `apps/web/src/pages/Usuarios.tsx`
- API: `apps/api/src/routes/users.ts` (requiere `superadmin`)
- Tablas: `users`, `user_modules`, `user_sectors`

## Formulario crear / editar

Debe verse **ordenado**, con secciones separadas (no texto pegado):

1. Nombre, usuario, contraseña, estado
2. **Rol:** Usuario | Responsable de sector
3. **Permisos rápidos** (presets opcionales)
4. **Módulos que puede ver** — checkboxes/cards por módulo
5. **Sectores asignados** — chips opcionales

Mismos campos en **crear** y **editar**. Reset password es modal aparte (solo contraseña).

## Módulos del catálogo

`dashboard`, `administracion`, `guardias`, `inventario`, `instructivos`, `liquidacion`

El menú lateral filtra por `user.modules` (superadmin ve todo).

## UI

Preferir **estilos inline** en el modal para que no dependa del CSS del Docker build (evita textos superpuestos).

## Checklist

- [ ] Crear con módulos y sectores
- [ ] Editar cambia módulos y se refleja en el menú al re-login o refresh de sesión
- [ ] Superadmin no se edita/borra desde la grilla
- [ ] Modal legible, sin labels pegados
