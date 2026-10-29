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
- Bandeja: `apps/web/src/pages/cancelaciones/Cancelaciones.tsx` en `/cancelaciones` — KPIs, filtros por estado / período /
  excepcionales / «aceptadas sin informar a Central», detalle con acciones, historial, notas internas, otras solicitudes
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
- Seguimiento: constancia recibida; **Central de Turnos informada** (solo una vez aceptada).
- Firma del papel ⇒ casilla de declaración obligatoria. «Recibió Dirección Médica» ⇒ «Tomar para análisis».
- Número de trámite `CAN-0001` (= id). La consulta pública exige número **y** DNI; si no coinciden, 404 genérico.
  La vista pública no muestra DNI, notas internas ni quién resolvió.
- Límite por IP en memoria: 8 envíos por hora; 40 consultas cada 10 min.

## Permisos

Módulo `cancelaciones` (niveles Ver / Cargar y editar / Control total, sin sectores). Acciones:
`ver`, `exportar` (ver) · `resolver` (editar: análisis, aceptar, rechazar, reabrir, seguimiento, notas) · `eliminar` (total).
Avisos: campanita y Inicio muestran solicitudes sin resolver (alta si hay excepcionales) y aceptadas sin informar a Central.

## Pruebas

Sección «Medical → Cancelaciones Médicos» de `tests/api.sh`.
