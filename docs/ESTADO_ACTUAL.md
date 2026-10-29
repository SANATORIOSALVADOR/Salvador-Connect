# Estado actual (octubre 2026)

## En uso real (prioridad)

- Login + sesión cookie
- Sidebar colapsable (248 / 72), fixed, offset de contenido
- **Administración (v2, oct-2026)**: resumen del día, agenda (lista + calendario), control fiscal mensual con calendario oficial cargado a mano (sin conexión a ARCA), cheques, documentos/contratos con renovación, tareas, vencimientos recurrentes, contactos, feriados e historial. Ver `.claude/skills/administracion/SKILL.md`.
- **Guardias Médicas**: calendario con cobertura por horario requerido, "de guardia ahora", carga, copiar semana/mes, historial de cambios, productividad por profesional y sector, configuración de sectores y profesionales
- **Medical → Cancelaciones Médicos** (oct-2026): el médico escanea un QR (red interna, sin usuario) y pide la cancelación de su agenda de consultorio (datos de la planilla en papel) o consulta su trámite con número + DNI. 15 días hábiles de anticipación (con feriados); con menos queda **excepcional** y debe justificar. La bandeja permite tomar en análisis, aceptar, rechazar (con motivo que ve el médico), reabrir, marcar constancia recibida y Central de Turnos informada, notas internas, imprimir la planilla, exportar Excel e imprimir el cartel con el QR. Ver `.claude/skills/cancelaciones/SKILL.md`.
- **Cancelaciones → Central de Turnos** (oct-2026): la pantalla tiene tres solapas — Solicitudes (Dirección Médica), **Central de Turnos** y **Historial**. Al aceptar, la solicitud pasa sola a Central con los datos del prestador, la agenda a cancelar y el motivo; el personal de turnos la cancela en el sistema de agendas y la marca **«Agenda cancelada»** (con observación; se puede deshacer con motivo). Nueva acción de permiso `central` (perfil típico: Ver + Central). Filtros por búsqueda, servicio, motivo, período y estado en todas las solapas. Reemplaza la casilla «Central de Turnos informada». Migración 0013.
- **Configuración rediseñada (oct-2026)**: menú lateral (Accesos · Estructura · Guardias · Sistema); Personas con ficha (qué puede hacer, accesos, datos, actividad), alta guiada y acciones en lote; Perfiles; **Matriz de accesos**; **Módulos** (agrupados como el menú, activar/desactivar para todos); Auditoría.
- **Configuración** (solo superadmin): Usuarios con permisos por módulo (Ver / Cargar y editar / Control total) y sectores a cargo; Sectores
  **Accesos con vencimiento** (cuenta entera o un permiso puntual, con aviso 7 días antes) e **Historial** de cambios de permisos (quién cambió qué a quién, cambios de clave, perfiles y usos de «Ver como»).
  **Acciones concretas** por módulo (ej. en Guardias: estadísticas, exportar, cargar, copiar, historial, eliminar, horarios, profesionales; en Administración: cargar, cumplir, verificar, recurrentes, contactos, eliminar, calendario). El nivel marca las típicas y se pueden sumar o quitar por persona o por perfil.
  **Perfiles** de permisos vinculados (la persona hereda los cambios del perfil; lo que se le cambia a mano queda como excepción). Las plantillas viejas pasaron a ser perfiles. **Ver como**: el superadmin navega como otra persona, en solo lectura.
  Alcance por sector **en cada módulo** (Guardias, y los futuros Inventario / Instructivos): todos los sectores, "ve todo y trabaja en sus sectores" o "solo sus sectores" (no ve nada de otros sectores: calendario, Inicio, avisos, gráficos, buscador, historial).
  Sectores: crear / editar (solo superadmin); en el mismo formulario, si participa de Guardias Médicas y su horario requerido.
  Ese horario también lo ajusta desde Guardias → Configuración quien tenga Control total en Guardias (en sus sectores a cargo).
  **Etiquetas** de Guardias: catálogo (nombre + color) que se elige al cargar una guardia; renombrar o cambiar el color actualiza las guardias que la usan; desactivar la saca de la carga.

## Transversal (oct-2026)

- **Apariencia** (Configuración): logo, nombre, colores, tema claro/oscuro/automático, textos del login.
- **Mi perfil**: datos, cambio de contraseña, permisos, tema y tamaño de texto por persona.
- **Campanita de notificaciones**: vencimientos, huecos de guardia de la semana, cambios en mis sectores.
- **Resumen con gráficos**: horas por sector, cobertura de 7 días, vencimientos por semana.
- **Búsqueda global (Ctrl + K)**, **plantillas de permisos**, **impresión con encabezado**, CSV con título.
- **App instalable (PWA)** con respaldo sin conexión para "De guardia ahora".
- **Migraciones automáticas** al arrancar la API (`docs/MIGRACIONES.md`). Los backups los hace el área de Sistemas con su propio programa.
- **CI con pruebas** (`docs/CI.md`). Web como proyecto Vite normal (sin el armado por parches).

## Código presente pero no prioritario

- **Inventario** (activo): equipos y bienes por planta y sector (PLANTA, SECTOR, RUBRO, TIPO, DESCRIPCION, MARCA,
  CODIGO DE SERIE) con estado, plan de controles por tipo, registro de controles / fallas / reparaciones / traslados,
  importación desde Excel (xlsx, xls, ods, csv; vista previa con errores por fila) y exportación a Excel / CSV.
  Avisos de controles vencidos y equipos con falla en Inicio y notificaciones; respeta el alcance por sector.
- Instructivos y Liquidación se muestran como **«Próximamente»** (menú: grupo «Próximamente» con etiqueta
  «Pronto»; pantalla `apps/web/src/components/proximamente.tsx`). El código anterior de Instructivos sigue en `pages/`.
- **Inicio** (`pages/Inicio.tsx` + `GET /api/inicio`): se arma según los permisos de cada persona.
  Frase del día, accesos rápidos según permisos, bloque de Administración (atrasados / hoy / semana, «A tu cargo»
  por responsable, control fiscal), de Guardias (de guardia ahora y huecos en sus sectores), de Sistemas (solo superadmin:
  base de datos, mantenimiento, usuarios del día), actividad reciente y gráficos.

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
