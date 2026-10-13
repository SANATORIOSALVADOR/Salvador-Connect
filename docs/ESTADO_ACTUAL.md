# Estado actual (octubre 2026)

## En uso real (prioridad)

- Login + sesión cookie
- Sidebar colapsable (248 / 72), fixed, offset de contenido
- **Administración (v2, oct-2026)**: resumen del día, agenda (lista + calendario), control fiscal mensual con calendario oficial cargado a mano (sin conexión a ARCA), cheques, documentos/contratos con renovación, tareas, vencimientos recurrentes, contactos, feriados e historial. Ver `.claude/skills/administracion/SKILL.md`.
- **Guardias Médicas**: calendario con cobertura por horario requerido, "de guardia ahora", carga, copiar semana/mes, historial de cambios, productividad por profesional y sector, configuración de sectores y profesionales
- **Configuración** (solo superadmin): Usuarios con permisos por módulo (Ver / Cargar y editar / Control total) y sectores a cargo; Sectores

## Transversal (oct-2026)

- **Apariencia** (Configuración): logo, nombre, colores, tema claro/oscuro/automático, textos del login.
- **Mi perfil**: datos, cambio de contraseña, permisos, tema y tamaño de texto por persona.
- **Campanita de notificaciones**: vencimientos, huecos de guardia de la semana, cambios en mis sectores.
- **Resumen con gráficos**: horas por sector, cobertura de 7 días, vencimientos por semana.
- **Búsqueda global (Ctrl + K)**, **plantillas de permisos**, **impresión con encabezado**, CSV con título.
- **App instalable (PWA)** con respaldo sin conexión para "De guardia ahora".
- **Migraciones automáticas** al arrancar la API y **backups diarios** (`docs/BACKUPS_Y_MIGRACIONES.md`).
- **CI con pruebas** (`docs/CI.md`). Web como proyecto Vite normal (sin el armado por parches).

## Código presente pero no prioritario

- Inventario (ABM activos) — no expandir sin definición de negocio
- Instructivos (metadatos) — idem
- Liquidación — placeholder

## Infra

- Repo: `https://github.com/SANATORIOSALVADOR/Salvador-Connect`
- Deploy prueba: Docker Compose en Linux (`db`, `api`, `web`)
- Próximo: mismo stack en **Proxmox** cuando el usuario lo indique
- DB formal (migraciones versionadas + backups): cuando el usuario dé OK

## Fiscal

- Catálogo de obligaciones editable (precargadas: SICORE, SUSS/F.931, IVA, IIBB Córdoba, pago a cuenta SICORE, agente de retención 1ª/2ª quincena).
- La fecha exacta sale del **calendario oficial** (ARCA / Rentas Córdoba) que se carga una vez al año en Fiscal → Calendario oficial (se puede pegar la fila copiada). Sin fecha oficial, se **estima** (día habitual + día hábil) y queda marcada.
- Verificación mensual: botón «Verificar fechas del mes». Prórrogas con resolución e historial.
- Los vencimientos del mes en curso y del siguiente se crean solos (al arrancar la API y cada hora).
- **No** hay integración ARCA online: la agenda pública de ARCA no responde a consultas automáticas (probado oct-2026).

## UI conocida / deuda controlada

- Layout reforzado con CSS `OFFSET FORZADO SIDEBAR` en `index.css` (en pantallas ≤ 900 px el contenido usa todo el ancho)
- Preferir estilos inline en grillas de calendario para evitar regresiones del build
