---
name: cancelaciones
description: Módulo Medical → Cancelaciones Médicos del Sanatorio del Salvador — pedidos de cancelación / reprogramación de agenda de consultorio que el médico envía desde un QR (formulario público, sin usuario), con número de trámite, regla de 15 días hábiles y bandeja del personal para aceptar o rechazar. Usar al tocar pages/cancelaciones/*, routes/cancelaciones.ts, lib/cancelaciones.ts o la tabla med_cancelaciones.
---

# Skill — Cancelaciones Médicos (grupo «Medical» del menú)

Versión digital de la «Planilla de reprogramación de agenda de consultorio — 1) Pedido de cancelación» en papel.

## Archivos

- Web pública (sin login): `apps/web/src/pages/cancelaciones/Publico.tsx` en la ruta **`/cancelar-agenda`**
  (fuera de `Protected` en `App.tsx`). Inicio con dos opciones: **Pedir cancelación de agenda** / **Ver mi solicitud**
  (número de trámite + DNI; `?n=CAN-0001` lo precarga). Guarda en `localStorage` los trámites hechos desde ese celular.
- Arriba, **barra de avance** (`Flujo`): Nuevas → En análisis → Por cancelar (Central) → Agenda cancelada, con cantidades;
  cada paso lleva a su solapa / filtro. Debajo, link a las cerradas (rechazadas / anuladas).
- Dirección Médica decide desde **tarjetas** (`Decision.tsx` → `TarjetaSolicitud`, `PanelDecision`): «Tomar para análisis»,
  «Rechazar» (motivo obligatorio) y **«Aceptar y enviar a Central»** (pasa sola a la solapa Central). El detalle muestra
  un recuadro **«Próximo paso»** con los mismos botones según el estado.
- Central puede **devolver a Dirección Médica** (`POST /:id/devolver`, motivo obligatorio → `en_analisis`, evento
  `devuelta`); la tarjeta de Dirección muestra «Central de Turnos la devolvió: …».
- **Eliminar** (acción `eliminar`): en tarjetas y detalle, con confirmación; borra del todo y deja una línea en el log
  del servidor (`[cancelaciones] CAN-000X … eliminada por usuario`).
- Pantalla `/cancelaciones` con tres solapas (`?vista=solicitudes|central|historial`):
  - **Solicitudes** (`Cancelaciones.tsx`): bandeja de Dirección Médica — KPIs, filtros por estado, búsqueda, servicio,
    motivo, período y excepcionales.
  - **Central de Turnos** (`Central.tsx`): las aceptadas, en tarjetas con prestador, agenda a cancelar (días y horario),
    motivo, pacientes agendados, colega y quién aceptó; urgencia por cercanía. Botón «Marcar agenda cancelada»
    (observación opcional). Vista «Agendas canceladas» = historial de Central (quién, cuándo, observación). Exporta Excel.
    Quien tiene `central` y no `resolver` entra directo a esta solapa.
  - **Historial** (`Historial.tsx`): todos los eventos de todas las solicitudes, filtros por tipo (médicos / Dirección
    Médica / Central / notas), persona, fechas y búsqueda; exporta Excel.
  - Piezas comunes (filtros, pills) en `compartido.tsx`. Se trae toda la lista una vez y cada solapa filtra en pantalla.
- Detalle (modal): avance Recibida → En análisis → Aceptada · en Central → Agenda cancelada, acciones, historial, notas internas, otras solicitudes
  del mismo médico, exportar Excel (una fila por día), **imprimir planilla** (formato del papel) y **QR del formulario**
  (librería `qrcode`; la URL usa la IP del servidor porque los celulares no conocen el nombre local; se puede editar).
- Tipos y textos: `apps/web/src/pages/cancelaciones/api.ts`. Estilos `.canp-*` (público) y `.can-*` (bandeja) en `index.css`.
- API: `apps/api/src/routes/cancelaciones.ts`; reglas en `apps/api/src/lib/cancelaciones.ts`.
- Tabla `med_cancelaciones` (migración `0012_cancelaciones.sql`, schema `medCancelacionesTable`).

## Reglas

- **Anticipación**: días hábiles (sin fines de semana ni feriados de `adm_feriados`, o los de ley si el año no tiene)
  entre mañana y el día anterior al primer día a cancelar (`habilesEntre`). Menos de **15** ⇒ `excepcional = true` y la
  **justificación es obligatoria** (reemplaza el «reverso» de la planilla). Se permite pedir para hoy.
- Motivos: `formacion` | `vacaciones` | `personales` | `licencia`. Formación y licencia piden constancia
  (inscripción / certificado) que se **presenta en Dirección Médica**: **no se suben archivos** (no hacerlo sin pedido).
- Estados: `pendiente` → `en_analisis` → `aceptada` | `rechazada` (rechazo exige motivo, que ve el médico);
  `anulada` = la anuló el médico mientras estaba abierta. Una resuelta se puede **reabrir** (vuelve a análisis).
- Aceptada ⇒ pasa sola a **Central de Turnos** (estado `aceptada` = «por cancelar»). Central la marca
  **`agenda_cancelada`** (`POST /:id/agenda-cancelada`, guarda `agenda_cancelada_at/por/por_id` y `central_nota`,
  migración 0013). Deshacer: `POST /:id/agenda-restituir` con motivo obligatorio (vuelve a `aceptada`).
  Dirección Médica no puede reabrir una con agenda cancelada. El médico ve «Aceptada · agenda cancelada».
- Seguimiento: constancia recibida. (Las columnas viejas `central_informada_*` quedaron sin uso.)
- Firma del papel ⇒ casilla de declaración obligatoria. «Recibió Dirección Médica» ⇒ «Tomar para análisis».
- Número de trámite `CAN-0001` (= id). La consulta pública exige número **y** DNI; si no coinciden, 404 genérico.
  La vista pública no muestra DNI, notas internas ni quién resolvió.
- Límite por IP en memoria: 8 envíos por hora; 40 consultas cada 10 min.

## Permisos

Módulo `cancelaciones` (niveles Ver / Cargar y editar / Control total, sin sectores). Acciones:
`ver`, `exportar` (ver) · `central` (editar: Central de Turnos, marcar / deshacer agenda cancelada, devolver a Dirección, notas) ·
`resolver` (editar: análisis, aceptar, rechazar, reabrir, seguimiento, notas) · `eliminar` (total).
Perfil típico de Central de Turnos: nivel Ver + acción `central`.
Avisos: campanita y Inicio muestran solicitudes sin resolver (alta si hay excepcionales) y, a quien tiene `central`,
agendas por cancelar (alta si alguna empieza en 3 días o menos).

## Pruebas

Sección «Medical → Cancelaciones Médicos» de `tests/api.sh`.
