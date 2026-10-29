import { Router, type IRouter, type Request, type RequestHandler } from "express";
import { and, desc, eq, gte, ilike, inArray, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { db, medCancelacionesTable, type DiaCancelacion, type EventoCancelacion } from "@salvador/db";
import { hoyIso, requireAccion, requireAuth, requireModuleAccess } from "../lib/auth";
import { addDaysIso, Feriados } from "../lib/administracion";
import {
  ANTICIPACION_MINIMA,
  ESTADO_LABEL,
  ESTADOS,
  habilesEntre,
  idDeNumero,
  MOTIVO_LABEL,
  MOTIVOS,
  numeroTramite,
  PIDE_CONSTANCIA,
  primerDiaSinExcepcion,
  resumenCancelaciones,
  type Estado,
  type Motivo,
} from "../lib/cancelaciones";

// Medical → Cancelaciones Médicos.
//  - /publico/cancelaciones: formulario que el médico abre con el QR (sin usuario; solo red interna).
//    Pide el pedido y deja consultarlo con número de trámite + DNI.
//  - /cancelaciones: bandeja del personal con acceso al módulo (analizar, aceptar, rechazar).

const router: IRouter = Router();

type Fila = typeof medCancelacionesTable.$inferSelect;

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_DIAS = 62;

function limpio(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}
function textoLargo(v: unknown, max = 2000): string {
  return String(v ?? "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim().slice(0, max);
}
function fechaValida(v: unknown): string | null {
  const t = String(v ?? "").slice(0, 10);
  return FECHA_RE.test(t) && !Number.isNaN(Date.parse(t + "T12:00:00Z")) && new Date(t + "T12:00:00Z").toISOString().slice(0, 10) === t ? t : null;
}
const soloDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** Límite simple por IP (en memoria): evita que el formulario público se use para inundar la bandeja. */
function limite(max: number, ventanaMs: number, mensaje: string): RequestHandler {
  const hits = new Map<string, number[]>();
  return (req, res, next) => {
    const ip = req.ip || "?";
    const ahora = Date.now();
    const lista = (hits.get(ip) || []).filter((t) => ahora - t < ventanaMs);
    if (lista.length >= max) {
      res.status(429).json({ message: mensaje });
      return;
    }
    lista.push(ahora);
    hits.set(ip, lista);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => ahora - t < ventanaMs)) hits.delete(k);
    next();
  };
}

function evento(quien: string, accion: string, detalle?: string): EventoCancelacion {
  return { at: new Date().toISOString(), quien, accion, ...(detalle ? { detalle } : {}) };
}

/** Lo que ve el médico al consultar su trámite (sin notas internas ni quién lo resolvió). */
function vistaPublica(f: Fila) {
  return {
    numero: numeroTramite(f.id),
    estado: f.estado,
    estadoLabel: ESTADO_LABEL[f.estado as Estado] ?? f.estado,
    prestador: f.prestador,
    servicio: f.servicio,
    motivo: f.motivo,
    motivoLabel: MOTIVO_LABEL[f.motivo as Motivo] ?? f.motivo,
    dias: f.dias,
    fechaReprogramacion: f.fechaReprogramacion,
    excepcional: f.excepcional,
    anticipacionHabiles: f.anticipacionHabiles,
    pideConstancia: PIDE_CONSTANCIA.includes(f.motivo as Motivo),
    constanciaRecibida: f.constanciaRecibida,
    respuesta: f.estado === "aceptada" || f.estado === "rechazada" ? f.respuesta : "",
    resueltoAt: f.resueltoAt,
    createdAt: f.createdAt,
  };
}

function vistaInterna(f: Fila) {
  return {
    ...f,
    numero: numeroTramite(f.id),
    estadoLabel: ESTADO_LABEL[f.estado as Estado] ?? f.estado,
    motivoLabel: MOTIVO_LABEL[f.motivo as Motivo] ?? f.motivo,
    pideConstancia: PIDE_CONSTANCIA.includes(f.motivo as Motivo),
  };
}

/** Valida los días a cancelar: fecha válida desde hoy, horario desde < hasta, sin repetir. */
function leerDias(v: unknown, hoy: string): { dias: DiaCancelacion[] } | { error: string } {
  if (!Array.isArray(v) || v.length === 0) return { error: "Cargá al menos un día a cancelar." };
  if (v.length > MAX_DIAS) return { error: `Como máximo ${MAX_DIAS} días por solicitud.` };
  const tope = addDaysIso(hoy, 366);
  const out: DiaCancelacion[] = [];
  for (const [i, x] of v.entries()) {
    const o = (x ?? {}) as Record<string, unknown>;
    const fecha = fechaValida(o.fecha);
    const desde = String(o.desde ?? "").slice(0, 5);
    const hasta = String(o.hasta ?? "").slice(0, 5);
    const n = `Día ${i + 1}`;
    if (!fecha) return { error: `${n}: falta la fecha.` };
    if (fecha < hoy) return { error: `${n}: la fecha ya pasó.` };
    if (fecha > tope) return { error: `${n}: la fecha es de dentro de más de un año.` };
    if (!HORA_RE.test(desde) || !HORA_RE.test(hasta)) return { error: `${n}: completá el horario desde y hasta.` };
    if (desde >= hasta) return { error: `${n}: el horario «hasta» tiene que ser posterior a «desde».` };
    if (out.some((d) => d.fecha === fecha && d.desde < hasta && desde < d.hasta)) return { error: `${n}: se superpone con otro horario del mismo día.` };
    out.push({ fecha, desde, hasta });
  }
  out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.desde.localeCompare(b.desde));
  return { dias: out };
}

// =====================================================================
// Formulario público (QR)
// =====================================================================

/** Datos para armar el formulario: regla de anticipación y servicios ya usados (para sugerir). */
router.get("/publico/cancelaciones/reglas", async (_req, res): Promise<void> => {
  try {
    const hoy = hoyIso();
    const servicios = await db
      .selectDistinct({ s: medCancelacionesTable.servicio })
      .from(medCancelacionesTable)
      .where(eq(medCancelacionesTable.estado, "aceptada"))
      .limit(200);
    res.json({
      hoy,
      anticipacionMinima: ANTICIPACION_MINIMA,
      primerDiaSinExcepcion: await primerDiaSinExcepcion(hoy),
      motivos: MOTIVOS.map((k) => ({ key: k, label: MOTIVO_LABEL[k], pideConstancia: PIDE_CONSTANCIA.includes(k) })),
      servicios: servicios.map((r) => r.s).filter(Boolean).sort((a, b) => a.localeCompare(b, "es")),
    });
  } catch (err) {
    console.error("[cancelaciones reglas]", err);
    res.status(500).json({ message: "No se pudo abrir el formulario." });
  }
});

/** Calcula la anticipación de unas fechas (el formulario avisa antes de enviar si va a ser excepcional). */
router.post("/publico/cancelaciones/anticipacion", limite(120, 10 * 60_000, "Demasiadas consultas. Probá en unos minutos."), async (req, res): Promise<void> => {
  const primer = fechaValida(req.body?.fecha);
  if (!primer) {
    res.status(400).json({ message: "Fecha no válida." });
    return;
  }
  const hoy = hoyIso();
  const habiles = primer < hoy ? 0 : await habilesEntre(hoy, primer);
  res.json({ habiles, excepcional: habiles < ANTICIPACION_MINIMA });
});

router.post("/publico/cancelaciones", limite(8, 60 * 60_000, "Ya se enviaron varias solicitudes desde este equipo. Probá más tarde o comunicate con Dirección Médica."), async (req, res): Promise<void> => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const hoy = hoyIso();
    const prestador = limpio(b.prestador, 120);
    const matricula = limpio(b.matricula, 30);
    const dni = soloDigitos(b.dni);
    const servicio = limpio(b.servicio, 120);
    const telefono = limpio(b.telefono, 40);
    const motivo = String(b.motivo ?? "") as Motivo;
    const err = (message: string) => res.status(400).json({ message });

    if (prestador.length < 3) return void err("Completá tu nombre y apellido.");
    if (!matricula) return void err("Completá tu matrícula.");
    if (dni.length < 6 || dni.length > 9) return void err("El DNI tiene que tener entre 6 y 9 números.");
    if (!servicio) return void err("Completá el servicio.");
    if (typeof b.pacientesAgendados !== "boolean") return void err("Indicá si hay pacientes agendados en el período.");
    if (typeof b.hayColega !== "boolean") return void err("Indicá si hay un colega del servicio que pueda atender.");
    const colega = b.hayColega ? limpio(b.colega, 120) : "";
    if (b.hayColega && !colega) return void err("Indicá qué colega puede atender.");
    if (!MOTIVOS.includes(motivo)) return void err("Elegí el motivo.");
    const motivoDetalle = textoLargo(b.motivoDetalle, 1000);
    const leidos = leerDias(b.dias, hoy);
    if ("error" in leidos) return void err(leidos.error);
    const { dias } = leidos;
    const fechaReprogramacion = b.fechaReprogramacion ? fechaValida(b.fechaReprogramacion) : null;
    if (b.fechaReprogramacion && !fechaReprogramacion) return void err("La fecha de reprogramación no es válida.");
    if (b.declaracion !== true) return void err("Tenés que confirmar que los datos son correctos.");

    const anticipacion = await habilesEntre(hoy, dias[0].fecha);
    const excepcional = anticipacion < ANTICIPACION_MINIMA;
    const justificacion = textoLargo(b.justificacion, 2000);
    if (excepcional && justificacion.length < 10)
      return void err(`El pedido se hace con ${anticipacion} día${anticipacion === 1 ? "" : "s"} hábil${anticipacion === 1 ? "" : "es"} de anticipación (menos de ${ANTICIPACION_MINIMA}): explicá el motivo de la urgencia.`);

    const [fila] = await db
      .insert(medCancelacionesTable)
      .values({
        prestador,
        matricula,
        dni,
        servicio,
        telefono,
        pacientesAgendados: b.pacientesAgendados,
        hayColega: b.hayColega,
        colega,
        motivo,
        motivoDetalle,
        dias,
        fechaDesde: dias[0].fecha,
        fechaHasta: dias[dias.length - 1].fecha,
        fechaReprogramacion,
        anticipacionHabiles: anticipacion,
        excepcional,
        justificacion: excepcional ? justificacion : "",
        eventos: [evento(prestador, "creada", excepcional ? `Excepcional: ${anticipacion} días hábiles de anticipación` : undefined)],
      })
      .returning();
    res.status(201).json(vistaPublica(fila));
  } catch (err) {
    console.error("[cancelaciones alta]", err);
    res.status(500).json({ message: "No se pudo enviar la solicitud. Probá de nuevo." });
  }
});

/** Busca el trámite del médico: número + DNI (si no coinciden, el mismo "no encontrado"). */
async function tramiteDe(req: Request): Promise<Fila | null> {
  const id = idDeNumero(req.params.numero);
  const dni = soloDigitos(req.query.dni ?? req.body?.dni);
  if (!id || !dni) return null;
  const [f] = await db.select().from(medCancelacionesTable).where(and(eq(medCancelacionesTable.id, id), eq(medCancelacionesTable.dni, dni))).limit(1);
  return f ?? null;
}

const limiteConsulta = limite(40, 10 * 60_000, "Demasiadas consultas. Probá en unos minutos.");

router.get("/publico/cancelaciones/:numero", limiteConsulta, async (req, res): Promise<void> => {
  try {
    const f = await tramiteDe(req);
    if (!f) {
      res.status(404).json({ message: "No encontramos una solicitud con ese número y DNI." });
      return;
    }
    res.json(vistaPublica(f));
  } catch (err) {
    console.error("[cancelaciones consulta]", err);
    res.status(500).json({ message: "No se pudo consultar la solicitud." });
  }
});

/** El médico puede anular su pedido mientras nadie lo resolvió. */
router.post("/publico/cancelaciones/:numero/anular", limiteConsulta, async (req, res): Promise<void> => {
  try {
    const f = await tramiteDe(req);
    if (!f) {
      res.status(404).json({ message: "No encontramos una solicitud con ese número y DNI." });
      return;
    }
    if (f.estado !== "pendiente" && f.estado !== "en_analisis") {
      res.status(409).json({ message: "La solicitud ya fue resuelta: comunicate con Dirección Médica." });
      return;
    }
    const [act] = await db
      .update(medCancelacionesTable)
      .set({ estado: "anulada", updatedAt: new Date(), eventos: [...f.eventos, evento(f.prestador, "anulada", "La anuló el médico desde el formulario")] })
      .where(eq(medCancelacionesTable.id, f.id))
      .returning();
    res.json(vistaPublica(act));
  } catch (err) {
    console.error("[cancelaciones anular]", err);
    res.status(500).json({ message: "No se pudo anular la solicitud." });
  }
});

// =====================================================================
// Bandeja del personal
// =====================================================================

router.use("/cancelaciones", requireAuth, requireModuleAccess("cancelaciones", { porRuta: true }));

router.get("/cancelaciones", async (req, res): Promise<void> => {
  try {
    const conds: SQL[] = [];
    const estado = String(req.query.estado ?? "");
    if ((ESTADOS as readonly string[]).includes(estado)) conds.push(eq(medCancelacionesTable.estado, estado));
    else if (estado === "abiertas") conds.push(inArray(medCancelacionesTable.estado, ["pendiente", "en_analisis"]));
    const q = limpio(req.query.q, 80);
    if (q) {
      const like = `%${q}%`;
      const id = idDeNumero(q);
      conds.push(
        or(
          ilike(medCancelacionesTable.prestador, like),
          ilike(medCancelacionesTable.servicio, like),
          ilike(medCancelacionesTable.matricula, like),
          ilike(medCancelacionesTable.dni, like),
          ...(id ? [eq(medCancelacionesTable.id, id)] : []),
        )!,
      );
    }
    // Período: solicitudes con algún día a cancelar dentro del rango.
    const desde = fechaValida(req.query.desde);
    const hasta = fechaValida(req.query.hasta);
    if (desde) conds.push(gte(medCancelacionesTable.fechaHasta, desde));
    if (hasta) conds.push(lte(medCancelacionesTable.fechaDesde, hasta));
    if (req.query.excepcional === "1") conds.push(eq(medCancelacionesTable.excepcional, true));

    const filas = await db
      .select()
      .from(medCancelacionesTable)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(medCancelacionesTable.createdAt))
      .limit(1000);
    const cuenta = await db
      .select({ estado: medCancelacionesTable.estado, n: sql<number>`count(*)::int` })
      .from(medCancelacionesTable)
      .groupBy(medCancelacionesTable.estado);
    const porEstado = Object.fromEntries(ESTADOS.map((e) => [e, 0])) as Record<Estado, number>;
    for (const c of cuenta) if (c.estado in porEstado) porEstado[c.estado as Estado] = c.n;
    res.json({ filas: filas.map(vistaInterna), porEstado, resumen: await resumenCancelaciones(), anticipacionMinima: ANTICIPACION_MINIMA });
  } catch (err) {
    console.error("[cancelaciones lista]", err);
    res.status(500).json({ message: "No se pudieron listar las solicitudes." });
  }
});

router.get("/cancelaciones/:id", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [f] = Number.isInteger(id) ? await db.select().from(medCancelacionesTable).where(eq(medCancelacionesTable.id, id)).limit(1) : [];
    if (!f) {
      res.status(404).json({ message: "Solicitud no encontrada." });
      return;
    }
    // Otras solicitudes del mismo médico (mismo DNI o matrícula), para ver si es algo recurrente.
    const otras = await db
      .select()
      .from(medCancelacionesTable)
      .where(and(ne(medCancelacionesTable.id, f.id), or(eq(medCancelacionesTable.dni, f.dni), eq(medCancelacionesTable.matricula, f.matricula))))
      .orderBy(desc(medCancelacionesTable.createdAt))
      .limit(20);
    res.json({ ...vistaInterna(f), otras: otras.map(vistaInterna) });
  } catch (err) {
    console.error("[cancelaciones detalle]", err);
    res.status(500).json({ message: "No se pudo abrir la solicitud." });
  }
});

/** Carga la solicitud, aplica el cambio y suma el evento a la línea de tiempo. */
async function cambiar(
  req: Request,
  res: import("express").Response,
  fn: (f: Fila) => { error?: [number, string]; set?: Partial<typeof medCancelacionesTable.$inferInsert>; evento?: [string, string?] },
): Promise<void> {
  try {
    const id = Number(req.params.id);
    const [f] = Number.isInteger(id) ? await db.select().from(medCancelacionesTable).where(eq(medCancelacionesTable.id, id)).limit(1) : [];
    if (!f) {
      res.status(404).json({ message: "Solicitud no encontrada." });
      return;
    }
    const r = fn(f);
    if (r.error) {
      res.status(r.error[0]).json({ message: r.error[1] });
      return;
    }
    const quien = req.authUser!.name || req.authUser!.username;
    const [act] = await db
      .update(medCancelacionesTable)
      .set({ ...r.set, updatedAt: new Date(), eventos: r.evento ? [...f.eventos, evento(quien, ...r.evento)] : f.eventos })
      .where(eq(medCancelacionesTable.id, f.id))
      .returning();
    res.json(vistaInterna(act));
  } catch (err) {
    console.error("[cancelaciones cambio]", err);
    res.status(500).json({ message: "No se pudo guardar el cambio." });
  }
}

const ABIERTA = (f: Fila) => f.estado === "pendiente" || f.estado === "en_analisis";

router.post("/cancelaciones/:id/analisis", requireAccion("cancelaciones", "resolver"), (req, res) =>
  cambiar(req, res, (f) => (f.estado !== "pendiente" ? { error: [409, "Solo una solicitud pendiente pasa a análisis."] } : { set: { estado: "en_analisis" }, evento: ["en_analisis", "Recibida por Dirección Médica"] })),
);

router.post("/cancelaciones/:id/resolver", requireAccion("cancelaciones", "resolver"), (req, res) =>
  cambiar(req, res, (f) => {
    const decision = String(req.body?.decision ?? "");
    const respuesta = textoLargo(req.body?.respuesta, 1500);
    if (decision !== "aceptada" && decision !== "rechazada") return { error: [400, "Elegí aceptar o rechazar."] };
    if (!ABIERTA(f)) return { error: [409, "La solicitud ya está cerrada. Reabrila para cambiar la decisión."] };
    if (decision === "rechazada" && respuesta.length < 3) return { error: [400, "Indicá el motivo del rechazo: lo ve el médico."] };
    return {
      set: { estado: decision, respuesta, resueltoPorId: req.authUser!.id, resueltoPor: req.authUser!.name || req.authUser!.username, resueltoAt: new Date() },
      evento: [decision, respuesta || undefined],
    };
  }),
);

router.post("/cancelaciones/:id/reabrir", requireAccion("cancelaciones", "resolver"), (req, res) =>
  cambiar(req, res, (f) =>
    f.estado !== "aceptada" && f.estado !== "rechazada"
      ? { error: [409, "Solo se reabre una solicitud aceptada o rechazada."] }
      : { set: { estado: "en_analisis", respuesta: "", resueltoPorId: null, resueltoPor: "", resueltoAt: null }, evento: ["reabierta", limpio(req.body?.motivo, 300) || undefined] },
  ),
);

/** Seguimiento: constancia presentada en Dirección Médica / Central de Turnos informada. */
router.patch("/cancelaciones/:id/seguimiento", requireAccion("cancelaciones", "resolver"), (req, res) =>
  cambiar(req, res, (f) => {
    const b = req.body ?? {};
    if (typeof b.constanciaRecibida === "boolean") {
      return { set: { constanciaRecibida: b.constanciaRecibida }, evento: [b.constanciaRecibida ? "constancia" : "constancia_quitada"] };
    }
    if (typeof b.centralInformada === "boolean") {
      if (b.centralInformada && f.estado !== "aceptada") return { error: [409, "Se informa a Central de Turnos una vez aceptada la solicitud."] };
      const quien = req.authUser!.name || req.authUser!.username;
      return b.centralInformada
        ? { set: { centralInformadaAt: new Date(), centralInformadaPor: quien }, evento: ["central"] }
        : { set: { centralInformadaAt: null, centralInformadaPor: "" }, evento: ["central_quitada"] };
    }
    return { error: [400, "Nada para cambiar."] };
  }),
);

/** Nota interna en la línea de tiempo (no la ve el médico). */
router.post("/cancelaciones/:id/nota", requireAccion("cancelaciones", "resolver"), (req, res) =>
  cambiar(req, res, () => {
    const texto = textoLargo(req.body?.texto, 1000);
    return texto ? { evento: ["nota", texto] } : { error: [400, "Escribí la nota."] };
  }),
);

router.delete("/cancelaciones/:id", requireAccion("cancelaciones", "eliminar"), async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const borradas = Number.isInteger(id) ? await db.delete(medCancelacionesTable).where(eq(medCancelacionesTable.id, id)).returning({ id: medCancelacionesTable.id }) : [];
    if (!borradas.length) {
      res.status(404).json({ message: "Solicitud no encontrada." });
      return;
    }
    res.status(204).end();
  } catch (err) {
    console.error("[cancelaciones baja]", err);
    res.status(500).json({ message: "No se pudo eliminar la solicitud." });
  }
});

export default router;
