# Estado actual (octubre 2026)

## En uso real (prioridad)

- Login + sesión cookie
- Sidebar colapsable (248 / 72), fixed, offset de contenido
- **Administración**: listado, avisos, calendario (detalle a la derecha), ABM ítems, **Generar vencimientos** (fiscal local CUIT)
- **Guardias Médicas**: calendario + carga (activa/pasiva, inicio/fin, sectores definidos)
- **Usuarios** + **Configuración** (sectores)

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

- Generación local según portal (SICORE, SUSS, IVA, IIBB Córdoba, agente retención)
- **No** hay integración ARCA online todavía (pendiente de producto)

## UI conocida / deuda controlada

- Layout reforzado con CSS `OFFSET FORZADO SIDEBAR` vía `patch-shell.mjs`
- Preferir estilos inline en grillas de calendario para evitar regresiones del build
