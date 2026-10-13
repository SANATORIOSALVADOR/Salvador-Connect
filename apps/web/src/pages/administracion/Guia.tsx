import type { CSSProperties, ReactNode } from "react";
import { useAdm } from "./contexto";
import { TIPOS } from "./logic";
import { OrigenPill, S } from "./ui";

/** Guía de uso del módulo: qué es cada cosa, rutinas diaria / mensual / anual y preguntas frecuentes. */

const SECCIONES = [
  { id: "que-es", titulo: "Qué es este módulo" },
  { id: "primeros-pasos", titulo: "Primeros pasos" },
  { id: "rutinas", titulo: "Rutinas: día, mes y año" },
  { id: "pestanas", titulo: "Las pestañas" },
  { id: "fiscal", titulo: "Fiscal y fechas de ARCA" },
  { id: "agenda-anual", titulo: "Cargar el calendario del año" },
  { id: "tipos", titulo: "Tipos de ítem" },
  { id: "estados", titulo: "Estados, avisos y colores" },
  { id: "permisos", titulo: "Quién puede hacer qué" },
  { id: "faq", titulo: "Preguntas frecuentes" },
  { id: "glosario", titulo: "Glosario" },
];

const P: CSSProperties = { margin: "0 0 10px", fontSize: 14, lineHeight: 1.6 };
const LI: CSSProperties = { marginBottom: 6, fontSize: 14, lineHeight: 1.55 };

function Bloque({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section id={`guia-${id}`} className="card" style={{ ...S.card, padding: "18px 20px", scrollMarginTop: 80 }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 700 }}>{titulo}</h2>
      {children}
    </section>
  );
}

function Paso({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
      <div aria-hidden="true" style={{ flex: "0 0 28px", height: 28, borderRadius: 999, background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 13 }}>{n}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 2 }}>{titulo}</div>
        <div style={{ fontSize: 14, lineHeight: 1.55 }}>{children}</div>
      </div>
    </div>
  );
}

function Ir({ tab, children }: { tab: string; children: ReactNode }) {
  const { irA } = useAdm();
  return (
    <button type="button" onClick={() => irA(tab)} style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "hsl(var(--primary))", fontWeight: 600, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}>
      {children}
    </button>
  );
}

function Pregunta({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details style={{ borderBottom: "1px solid hsl(var(--border))", padding: "10px 0" }}>
      <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>{q}</summary>
      <div style={{ fontSize: 14, lineHeight: 1.6, marginTop: 8 }}>{children}</div>
    </details>
  );
}

export default function Guia() {
  return (
    <div className="adm-prosa" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
      <nav aria-label="Índice de la guía" className="card no-print" style={{ ...S.card, flex: "1 1 220px", maxWidth: 280, position: "sticky", top: 12 }}>
        <div style={{ ...S.label, marginBottom: 8 }}>Contenido</div>
        <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
          {SECCIONES.map((s) => (
            <li key={s.id} style={{ fontSize: 13.5 }}>
              <a href={`#guia-${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`guia-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }} style={{ color: "inherit" }}>
                {s.titulo}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div style={{ flex: "4 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
        <Bloque id="que-es" titulo="Qué es este módulo">
          <p style={P}>
            Administración reemplaza el cuaderno y las planillas del área: reúne en un solo lugar <strong>todo lo que tiene fecha</strong> —
            impuestos, pagos, cheques, pólizas y contratos, tareas y recordatorios— y avisa antes de que venza.
          </p>
          <p style={P}>
            Además deja registrado <strong>cómo se cumplió</strong> cada cosa (fecha, comprobante o VEP, monto y quién lo hizo), así cualquiera del área puede saber en qué está cada tema.
          </p>
          <p style={{ ...P, marginBottom: 0 }}>
            Lo que más se usa todos los días es el <Ir tab="resumen">Resumen</Ir>: muestra lo vencido, lo de hoy y lo de la semana.
          </p>
        </Bloque>

        <Bloque id="primeros-pasos" titulo="Primeros pasos (una sola vez)">
          <Paso n={1} titulo="Revisar la lista de impuestos con el contador">
            En <Ir tab="fiscal">Fiscal</Ir> → <em>Obligaciones</em> están los impuestos que el sistema controla. Agregá los que falten (por ejemplo anticipos de Ganancias o Bienes Personales) y desactivá los que no correspondan. Asigná un <strong>responsable</strong> a cada uno.
          </Paso>
          <Paso n={2} titulo="Cargar el calendario oficial del año">
            En <Ir tab="fiscal">Fiscal</Ir> → <em>Calendario oficial</em> → <strong>Pegar agenda completa</strong>. Está explicado paso a paso en <a href="#guia-agenda-anual" onClick={(e) => { e.preventDefault(); document.getElementById("guia-agenda-anual")?.scrollIntoView({ behavior: "smooth" }); }}>Cargar el calendario del año</a>.
          </Paso>
          <Paso n={3} titulo="Revisar los feriados">
            En <Ir tab="ajustes">Ajustes</Ir> están los feriados del año. El botón «Traer feriados oficiales» los baja de internet; si hay un asueto provincial o local, agregalo a mano.
          </Paso>
          <Paso n={4} titulo="Cargar lo que se repite">
            En <Ir tab="recurrentes">Recurrentes</Ir>: luz, agua, alquiler, internet, sueldos, aportes sindicales, controles de matafuegos… Se cargan una vez y el sistema crea cada vencimiento solo.
          </Paso>
          <Paso n={5} titulo="Cargar documentos, cheques y contactos">
            Pólizas, habilitaciones y contratos en <Ir tab="documentos">Documentos</Ir>; cheques en cartera en <Ir tab="cheques">Cheques</Ir>; teléfonos útiles en <Ir tab="contactos">Contactos</Ir>.
          </Paso>
        </Bloque>

        <Bloque id="rutinas" titulo="Rutinas: día, mes y año">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {[
              { t: "Cada día (2 minutos)", l: ["Abrir el Resumen: primero lo vencido, después lo de hoy.", "Marcar lo que se hizo con el cuadradito (o «Registrar» en los impuestos).", "Anotar tareas nuevas en Tareas con la carga rápida."] },
              { t: "Cada mes (5–10 minutos)", l: ["El primer día hábil aparece la tarea «Verificar fechas fiscales del mes».", "En Fiscal → Control del mes, comparar las fechas con la agenda de ARCA y Rentas.", "Tocar «Verificar fechas del mes»: la tarea se cierra sola.", "Al pagar cada impuesto, cargar el N° de VEP."] },
              { t: "Cada año (15–20 minutos)", l: ["En diciembre aparece la tarea «Cargar el calendario fiscal oficial».", "Pegar la agenda completa del año nuevo (ARCA + Rentas).", "Traer los feriados del año nuevo en Ajustes.", "Revisar con el contador si cambió algún impuesto."] },
            ].map((c) => (
              <div key={c.t} style={{ padding: 14, borderRadius: 12, background: "hsl(var(--muted) / .6)" }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>{c.t}</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>{c.l.map((x) => <li key={x} style={LI}>{x}</li>)}</ul>
              </div>
            ))}
          </div>
        </Bloque>

        <Bloque id="pestanas" titulo="Las pestañas">
          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "minmax(110px, max-content) 1fr", gap: "8px 16px", fontSize: 14, lineHeight: 1.55 }}>
            {[
              ["Resumen", "La foto del día: avisos, vencidos, hoy, la semana, el avance fiscal del mes, cheques y tareas."],
              ["Agenda", "Todo junto, en lista (agrupado por fecha) o en calendario de mes. Filtros por tipo, estado, período y responsable. Exporta a Excel e imprime."],
              ["Fiscal", "Control del mes (qué impuesto vence, si está presentado y pagado), el calendario oficial del año y el catálogo de obligaciones."],
              ["Cheques", "Emitidos (a pagar) y recibidos (a cobrar), con totales de los próximos 7 días. «Debitado» / «Cobrado» los cierra."],
              ["Documentos", "Pólizas, contratos, habilitaciones, certificados y licencias. «Renovado» agenda el próximo vencimiento."],
              ["Tareas", "Pendientes del día a día en un tablero: atrasadas y hoy, esta semana, más adelante y hechas. Pueden tener pasos."],
              ["Recurrentes", "Lo que se repite cada semana, mes, trimestre o año. Si una fecha cae feriado, pasa al día hábil siguiente."],
              ["Contactos", "Teléfonos, mails y CUIT del estudio contable, bancos, aseguradoras y proveedores."],
              ["Ajustes", "Feriados del año e historial de todos los cambios del módulo."],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt style={{ fontWeight: 700 }}>{k}</dt>
                <dd style={{ margin: 0 }}>{v}</dd>
              </div>
            ))}
          </dl>
          <p style={{ ...P, marginTop: 12, marginBottom: 0 }}>
            El botón verde <strong>+ Nuevo</strong> (arriba a la derecha) crea cualquier tipo de ítem; la flechita al lado deja elegir cuál. Tocando cualquier ítem se abre su ficha con todas las acciones y su historial.
          </p>
        </Bloque>

        <Bloque id="fiscal" titulo="Fiscal y fechas de ARCA: cómo funciona">
          <p style={P}>
            El sistema <strong>no se conecta con ARCA</strong> ni necesita clave fiscal. Las fechas salen del <strong>calendario oficial</strong> que ARCA y Rentas Córdoba
            publican cada año. En ese calendario la fecha de cada impuesto depende del <strong>último dígito del CUIT</strong>: el del sanatorio
            (30-68976794-<strong>6</strong>) termina en <strong>6</strong>, así que se usa siempre la columna de la terminación 6.
          </p>
          <p style={P}>Cada fecha muestra de dónde salió:</p>
          <ul style={{ margin: "0 0 10px", paddingLeft: 20 }}>
            <li style={LI}><OrigenPill origen="oficial" /> cargada desde el calendario publicado y verificada. Es la exacta.</li>
            <li style={LI}><OrigenPill origen="prorroga" /> ARCA o Rentas la corrió por una resolución; se anota cuál.</li>
            <li style={LI}><OrigenPill origen="estimada" /> todavía no hay fecha oficial cargada; el sistema la calcula con el «día habitual» del impuesto y la pasa al siguiente día hábil si cae feriado. <em>Puede no coincidir</em>: hay que verificarla.</li>
            <li style={LI}><strong>Manual</strong>: alguien cambió la fecha de ese vencimiento a mano; el sistema ya no la toca.</li>
          </ul>
          <p style={P}>
            Los vencimientos fiscales del <strong>mes en curso y del siguiente se crean solos</strong>. Si después se carga o corrige una fecha del calendario, los vencimientos pendientes se actualizan solos.
          </p>
          <p style={{ ...P, marginBottom: 0 }}>
            Al registrar un impuesto se marcan por separado <strong>«Declaración presentada»</strong> y <strong>«Pagado»</strong>: si falta una de las dos, queda pendiente y se ve «Falta pagar» o «Falta presentar». Conviene cargar el <strong>N° de VEP</strong>: además sirve de control, porque el VEP trae la fecha de vencimiento.
          </p>
        </Bloque>

        <Bloque id="agenda-anual" titulo="Cargar el calendario del año (paso a paso)">
          <Paso n={1} titulo="Abrir la agenda de ARCA">
            Desde <Ir tab="fiscal">Fiscal</Ir> → <em>Calendario oficial</em> → <strong>Pegar agenda completa</strong> (el enlace a ARCA está en la ventana).
          </Paso>
          <Paso n={2} titulo="Filtrar">
            Fechas del 01/01 al 31/12 del año, terminación de CUIT <strong>6</strong>, impuestos: Valor Agregado, Ganancias y Seguridad Social. Tocar <em>Buscar</em>.
          </Paso>
          <Paso n={3} titulo="Copiar y pegar">
            Seleccionar toda la tabla de resultados, Ctrl + C, y pegarla en la ventana del sistema (Ctrl + V). Se puede sumar el calendario de Rentas Córdoba en el mismo texto.
          </Paso>
          <Paso n={4} titulo="Revisar">
            El sistema muestra cada renglón con su fecha y el impuesto que reconoció. Si alguno quedó mal o «sin asignar», elegí el correcto en la lista. Con «Recordar mis correcciones», el año que viene lo reconoce solo.
          </Paso>
          <Paso n={5} titulo="Guardar">
            Todas las fechas quedan como <strong>oficiales</strong>. La tarea «Cargar el calendario fiscal oficial» se cierra sola.
          </Paso>
          <p style={{ ...P, marginBottom: 0 }}>
            También se puede cargar una sola obligación (botón de pegar de cada fila) o tocar una fecha para corregirla o registrar una <strong>prórroga</strong> con su resolución.
          </p>
        </Bloque>

        <Bloque id="tipos" titulo="Tipos de ítem">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10 }}>
            {TIPOS.map((t) => (
              <div key={t.value} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 10, borderRadius: 10, border: "1px solid hsl(var(--border))", borderLeft: `4px solid ${t.color}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{t.label}</div>
                  <div style={{ ...S.small, fontSize: 12.5, lineHeight: 1.45 }}>
                    {{
                      fiscal: "Impuestos y declaraciones. Se generan solos desde el catálogo de obligaciones.",
                      pago: "Pagos a proveedores, servicios, honorarios.",
                      cheque: "Cheques emitidos o recibidos, con número, banco y fecha de pago o cobro.",
                      documento: "Pólizas, contratos, habilitaciones, certificados. Se renuevan.",
                      tarea: "Pendientes del día a día, con pasos opcionales.",
                      vencimiento: "Cualquier otra fecha límite (facturas, trámites).",
                      recordatorio: "Avisos simples: reuniones, llamados.",
                    }[t.value]}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Bloque>

        <Bloque id="estados" titulo="Estados, avisos y colores">
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li style={LI}><strong>Pendiente</strong>: falta hacerlo. <strong>Cumplido</strong>: hecho, con su fecha y comprobante. <strong>Cancelado</strong>: no corresponde (queda el motivo en el historial).</li>
            <li style={LI}>Etiquetas de urgencia: <span style={{ color: "var(--adm-danger)", fontWeight: 700 }}>Vencido</span>, <span style={{ color: "var(--adm-hot)", fontWeight: 700 }}>Vence hoy</span>, «Mañana», «En N días».</li>
            <li style={LI}>Cada ítem tiene <strong>«Avisar»</strong> (por ejemplo 7 días antes): desde ese día aparece en la campanita de arriba y en el Resumen.</li>
            <li style={LI}>El punto rojo ● al lado del título es <strong>prioridad alta</strong>.</li>
            <li style={LI}>La barra de color a la izquierda de cada ítem indica su tipo (ver «Tipos de ítem»).</li>
          </ul>
        </Bloque>

        <Bloque id="permisos" titulo="Quién puede hacer qué">
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li style={LI}><strong>Ver</strong>: consulta todo, exporta e imprime.</li>
            <li style={LI}><strong>Cargar y editar</strong>: además crea y edita, registra presentaciones y pagos, cancela, carga recurrentes y contactos y toca «Verificar fechas del mes».</li>
            <li style={LI}><strong>Control total</strong>: además elimina, edita el catálogo de obligaciones, carga el calendario oficial y las prórrogas, y los feriados.</li>
          </ul>
          <p style={{ ...P, marginTop: 8, marginBottom: 0 }}>Los permisos se asignan en Configuración → Usuarios (solo el superadmin).</p>
        </Bloque>

        <Bloque id="faq" titulo="Preguntas frecuentes">
          <Pregunta q="Un impuesto no corresponde este mes, ¿lo borro?">
            No: abrilo y tocá <strong>«Cancelar ítem»</strong> con el motivo. Los fiscales no se pueden borrar porque el sistema los volvería a crear. Si no corresponde nunca más, desactivá la obligación en Fiscal → Obligaciones.
          </Pregunta>
          <Pregunta q="ARCA prorrogó un vencimiento, ¿qué hago?">
            Fiscal → Calendario oficial → tocá la fecha → elegí <strong>Prórroga</strong>, poné la nueva fecha y el número de resolución. El vencimiento pendiente se corre solo.
          </Pregunta>
          <Pregunta q="Cambié la fecha de un impuesto a mano y ahora dice «Manual».">
            Es a propósito: el sistema no pisa una fecha cambiada a mano. Si querés que vuelva a seguir el calendario, corregí la fecha en el calendario oficial y volvé a poner esa misma fecha en el vencimiento.
          </Pregunta>
          <Pregunta q="Borré una fecha de un recurrente, ¿vuelve a aparecer?">
            No, esa fecha queda omitida. Las siguientes siguen apareciendo. Para pausarlo entero, editá el recurrente y destildá «Activo».
          </Pregunta>
          <Pregunta q="Marqué algo como cumplido por error.">
            Abrilo y tocá <strong>«Reabrir»</strong>: vuelve a pendiente y queda anotado en el historial.
          </Pregunta>
          <Pregunta q="¿Qué pasa si no cargo el calendario oficial?">
            El sistema sigue funcionando con fechas <strong>estimadas</strong>, pero pueden diferir en uno o dos días de las reales. Por eso conviene cargarlo una vez al año y verificar cada mes.
          </Pregunta>
          <Pregunta q="¿El sistema manda mails o WhatsApp?">
            Por ahora no: los avisos aparecen en la campanita y en el Resumen al entrar al sistema.
          </Pregunta>
          <Pregunta q="¿Dónde veo quién cambió algo?">
            En la ficha de cada ítem (Historial) y en Ajustes → «Últimos cambios del módulo».
          </Pregunta>
        </Bloque>

        <Bloque id="glosario" titulo="Glosario">
          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "minmax(110px, max-content) 1fr", gap: "8px 16px", fontSize: 14, lineHeight: 1.55 }}>
            {[
              ["ARCA", "Agencia de Recaudación y Control Aduanero (ex AFIP)."],
              ["Rentas Córdoba", "Dirección General de Rentas de la provincia: Ingresos Brutos."],
              ["DJ", "Declaración jurada: lo que se presenta informando el impuesto del período."],
              ["VEP", "Volante electrónico de pago: el comprobante con el que se paga a ARCA."],
              ["F.931 / SUSS", "Declaración de cargas sociales del personal (seguridad social)."],
              ["SICORE", "Sistema de retenciones y percepciones de Ganancias e IVA."],
              ["IIBB", "Impuesto sobre los Ingresos Brutos (provincial)."],
              ["Terminación de CUIT", "Último dígito del CUIT; define qué día vence cada impuesto. El del sanatorio es 6."],
              ["Prórroga", "Cambio de fecha dispuesto por resolución después de publicado el calendario."],
              ["Período", "Mes que se declara (por ejemplo, el IVA de septiembre vence en octubre)."],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt style={{ fontWeight: 700 }}>{k}</dt>
                <dd style={{ margin: 0 }}>{v}</dd>
              </div>
            ))}
          </dl>
        </Bloque>
      </div>
    </div>
  );
}
