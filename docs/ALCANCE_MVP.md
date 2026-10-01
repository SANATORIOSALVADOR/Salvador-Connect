# Documento de Alcance — MVP

**Sanatorio del Salvador — Sistema Interno**  
Versión 1.0 — MVP · Octubre 2026

## Objetivos principales

- Reemplazar calendarios y listas en papel para recordatorios y vencimientos.
- Centralizar el registro de guardias del personal por sector, con control de cobertura.
- Llevar inventario controlado de activos fijos por sector.
- Repositorio ordenado de instructivos formales en PDF por área.
- Base modular para futuras integraciones (ARCA, SQL Server, páginas públicas de fechas).

## Módulos incluidos en el MVP

### 1. Administración (Agenda y Recordatorios)
- Crear / editar / cancelar eventos con título, descripción, fecha de vencimiento y tipo.
- Tipos: Cheque, Seguro, Pago, Auditoría, Renovación, Otro.
- Asignación a persona o sector.
- Estados: Pendiente / Realizado / Cancelado.
- Recordatorio configurable (default 2 días antes).
- Notificaciones internas (campanita) + listado de próximos vencimientos.
- Vista de calendario mensual.

**Fuera del MVP:** Kanban, email/WhatsApp, recurrencia automática, subtareas, adjuntos.

### 2. Guardias
- Carga por sector (solo Responsable o Admin).
- Campos: Sector, Fecha, Tipo de turno, Profesional, Modalidad (Presencial / Retención), Observaciones.
- Tipos de turno: Mañana, Tarde, Noche, Pasiva, Otro.
- Vista listado + calendario mensual por sector.
- Alerta visual cuando un sector no tiene guardia en un día.

**Fuera del MVP:** Solicitudes de reemplazo, rotaciones automáticas complejas, notificaciones proactivas, export PDF/Excel, integración RRHH.

### 3. Inventario
- Alta, edición y baja lógica de activos fijos.
- Datos: nombre, categoría, marca, modelo, n° de serie, fecha de compra, estado (Operativo / En reparación / Fuera de servicio).
- Asignación permanente a un Sector. El cambio genera historial.
- Historial de movimientos (origen, destino, motivo, usuario, fecha).
- Fechas de garantía y próximo mantenimiento + alerta visual simple.
- Filtros por sector, categoría y estado.

**Fuera del MVP:** Mantenimientos detallados, QR/código de barras, consumibles, fotos, reportes avanzados.

### 4. Instructivos
- Subida de PDFs.
- Metadatos: Título, Sector, Descripción, Versión, Fecha.
- Listado filtrable y buscable.
- Descarga del PDF.
- Permisos de creación: Responsable de Sector, Sistemas o permiso especial.

**Fuera del MVP:** Versionado avanzado, visor integrado, flujo de aprobación, comentarios.

### 5. Liquidación
- Solo pantalla placeholder: “Módulo en desarrollo”.

### 6. Configuración
- ABM Usuarios, Sectores, asignación usuario-sector, Roles básicos, catálogos de tipos de evento y tipos de turno.

## Criterios de éxito del MVP

1. Un responsable de sector carga las guardias de su área en menos de 2 minutos y ve el calendario del mes.
2. El sistema muestra claramente los días sin cobertura de guardia.
3. Se pueden registrar activos y moverlos de sector con historial disponible.
4. Los usuarios reciben recordatorios de vencimientos 2 días antes dentro del sistema.
5. Los instructivos PDF están organizados por sector y son descargables.
6. Un usuario común no ve ni edita información de sectores a los que no pertenece.

## Restricciones

- Sin integraciones externas en el MVP (ARCA, SQL Server, etc.).
- Web responsive (sin app móvil nativa).
- Auth inicial: usuario + contraseña (SSO a futuro).
- PDFs de instructivos almacenados en el servidor de la aplicación.
