import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  Database,
  ListTodo,
  Plus,
  Settings2,
  ShieldCheck,
  Stethoscope,
  Users,
  Wrench,
} from "lucide-react";

const DashboardGraficos = lazy(() => import("@/components/dashboard-graficos").then((m) => ({ default: m.DashboardGraficos })));

/**
 * Inicio: cada persona ve lo de su día según los módulos que puede usar (GET /api/inicio).
 * Administración, Guardias y Sistemas aparecen solo si corresponde.
 */

type ItemMin = { id: number; tipo: string; titulo: string; fecha: string; hora: string; responsable: string; prioridad: string };
type Datos = {
  hoy: string;
  usuario: { nombre: string; rol: string };
  accesos: { administracion: string | null; guardias: string | null; superadmin: boolean };
  administracion?: {
    vencidos: number;
    hoy: number;
    semana: number;
    misPendientes: ItemMin[];
    misPendientesTotal: number;
    proximos: ItemMin[];
    fiscal: { total: number; cumplidos: number; vencidos: number; obligaciones: number; verificadas: number };
  };
  guardias?: {
    sectores: number;
    todosLosSectores: boolean;
    ahora: { sector: string; profesional: string; modalidad: string; hasta: string }[];
    sinGuardiaAhora: string[];
    huecosHoy: { sector: string; texto: string }[];
    diasConHuecos: number;
    planificadoHasta: string | null;
    puedeCargar: boolean;
  };
  sistema?: {
    db: "ok" | "error";
    mantenimiento: boolean;
    usuariosHoy: number;
    usuariosActivos: number;
  };
};
type Actividad = { id: number; title: string; detail: string; actor: string; createdAt: string };

function saludo(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? "Buen día" : h < 20 ? "Buenas tardes" : "Buenas noches";
}
function diasHasta(hoy: string, f: string) {
  const [a, b, c] = hoy.split("-").map(Number);
  const [x, y, z] = f.split("-").map(Number);
  return Math.round((Date.UTC(x, y - 1, z) - Date.UTC(a, b - 1, c)) / 86400000);
}
function cuando(hoy: string, f: string) {
  const d = diasHasta(hoy, f);
  if (d < 0) return { txt: d === -1 ? "Venció ayer" : `Vencido hace ${-d} días`, tono: "mal" };
  if (d === 0) return { txt: "Hoy", tono: "hoy" };
  if (d === 1) return { txt: "Mañana", tono: "pronto" };
  return { txt: `En ${d} días`, tono: d <= 3 ? "pronto" : "normal" };
}
function hace(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `hace ${Math.max(1, min)} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
}
function plural(n: number, s: string, p = `${s}s`) {
  return `${n} ${n === 1 ? s : p}`;
}

/** Frase de arriba: lo importante del día en una línea. */
function fraseDelDia(d: Datos): string {
  const partes: string[] = [];
  const a = d.administracion;
  const g = d.guardias;
  if (a) {
    if (a.vencidos) partes.push(`${plural(a.vencidos, "vencimiento atrasado", "vencimientos atrasados")}`);
    if (a.hoy) partes.push(`${plural(a.hoy, "vencimiento", "vencimientos")} para hoy`);
    if (a.misPendientesTotal) partes.push(`${plural(a.misPendientesTotal, "pendiente")} a tu cargo`);
  }
  if (g) {
    if (g.sinGuardiaAhora.length) partes.push(`${plural(g.sinGuardiaAhora.length, "sector", "sectores")} sin guardia en este momento`);
    else if (g.huecosHoy.length) partes.push(`${plural(g.huecosHoy.length, "sector", "sectores")} con huecos de guardia hoy`);
  }
  if (!partes.length) return d.administracion || d.guardias ? "Todo en orden por ahora: no hay nada urgente." : "Bienvenido al sistema.";
  const ult = partes.pop()!;
  return `Tenés ${partes.length ? `${partes.join(", ")} y ${ult}` : ult}.`;
}

export default function Inicio() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actividad, setActividad] = useState<Actividad[]>([]);

  useEffect(() => {
    let vivo = true;
    const cargar = () =>
      fetch("/api/inicio", { credentials: "include" })
        .then(async (r) => {
          if (!r.ok) throw new Error((await r.json().catch(() => null))?.message || "No se pudo cargar el inicio.");
          return r.json();
        })
        .then((d: Datos) => vivo && (setDatos(d), setError(null)))
        .catch((e) => vivo && setError((e as Error).message));
    void cargar();
    fetch("/api/dashboard/activity?limit=6", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((a: Actividad[]) => vivo && setActividad(Array.isArray(a) ? a : []))
      .catch(() => undefined);
    const t = setInterval(cargar, 60_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, []);

  const ahora = new Date();
  const nombre = datos?.usuario.nombre.split(" ")[0] ?? "";
  const ac = datos?.accesos;
  const puedeAdm = ac?.administracion === "editar" || ac?.administracion === "total" || ac?.superadmin;

  return (
    <main className="content-wrap ini">
      <header className="ini-cab">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow" style={{ textTransform: "capitalize" }}>{ahora.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}</div>
          <h1 className="page-title">{saludo(ahora)}{nombre ? `, ${nombre}` : ""}.</h1>
          <p className="ini-frase">{datos ? fraseDelDia(datos) : error ? "" : "Armando tu día…"}</p>
        </div>
        {datos && (
          <div className="ini-acciones">
            {datos.guardias?.puedeCargar && <Accion href="/guardias?nueva=1" icon={<CalendarPlus size={16} />} texto="Cargar guardia" />}
            {puedeAdm && <Accion href="/administracion?nuevo=1" icon={<Plus size={16} />} texto="Nuevo vencimiento" primaria />}
            {puedeAdm && <Accion href="/administracion?tab=tareas" icon={<ListTodo size={16} />} texto="Tareas" />}
            {ac?.superadmin && <Accion href="/configuracion" icon={<Users size={16} />} texto="Usuarios" />}
          </div>
        )}
      </header>

      {error && <div className="form-error">{error}</div>}
      {!datos && !error && <div className="ini-grid">{[1, 2, 3].map((n) => <div key={n} className="card skeleton" style={{ height: 220 }} />)}</div>}

      {datos && !datos.administracion && !datos.guardias && !datos.sistema && (
        <section className="card ini-card ini-vacio">
          <ShieldCheck size={26} aria-hidden="true" />
          <h2>Todavía no tenés módulos asignados</h2>
          <p>Pedile al área de Sistemas que te dé acceso a los módulos que usás en tu trabajo.</p>
        </section>
      )}

      {datos && (
        <div className="ini-grid">
          {datos.administracion && <BloqueAdministracion a={datos.administracion} hoy={datos.hoy} />}
          {datos.guardias && <BloqueGuardias g={datos.guardias} />}
          {datos.sistema && <BloqueSistema s={datos.sistema} />}
          {actividad.length > 0 && (
            <section className="card ini-card">
              <Cabecera icono={<Activity size={17} />} titulo="Actividad reciente" sub="Últimos movimientos en tus módulos" />
              <ul className="ini-lista">
                {actividad.map((a) => (
                  <li key={`${a.id}-${a.createdAt}`} className="ini-act">
                    <span className="ini-act-punto" aria-hidden="true" />
                    <span style={{ minWidth: 0 }}>
                      <b>{a.title}</b>
                      <small>{a.detail} · {a.actor} · {hace(a.createdAt)}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {datos && (datos.administracion || datos.guardias) && (
        <Suspense fallback={null}>
          <DashboardGraficos />
        </Suspense>
      )}
    </main>
  );
}

function Accion({ href, icon, texto, primaria }: { href: string; icon: ReactNode; texto: string; primaria?: boolean }) {
  return (
    <Link href={href} className={`btn ${primaria ? "btn-primary" : "btn-quiet"} ini-accion`}>
      {icon}
      {texto}
    </Link>
  );
}

function Cabecera({ icono, titulo, sub, href, linkTxt }: { icono: ReactNode; titulo: string; sub?: string; href?: string; linkTxt?: string }) {
  return (
    <div className="ini-card-cab">
      <span className="ini-card-ico" aria-hidden="true">{icono}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <h2>{titulo}</h2>
        {sub && <small>{sub}</small>}
      </div>
      {href && <Link href={href} className="ini-ver">{linkTxt ?? "Abrir"} <ArrowUpRight size={14} /></Link>}
    </div>
  );
}

function Kpi({ valor, label, tono, href }: { valor: number; label: string; tono?: "mal" | "hoy" | "ok"; href: string }) {
  return (
    <Link href={href} className={`ini-kpi ${tono ?? ""}`}>
      <b>{valor}</b>
      <span>{label}</span>
    </Link>
  );
}

function FilaItem({ it, hoy }: { it: ItemMin; hoy: string }) {
  const c = cuando(hoy, it.fecha);
  return (
    <li>
      <Link href={`/administracion?item=${it.id}`} className="ini-item">
        <span className={`ini-item-tipo t-${it.tipo}`} aria-hidden="true" />
        <span className="ini-item-txt">
          <b>{it.prioridad === "alta" && <span className="ini-alta" title="Prioridad alta">● </span>}{it.titulo}</b>
          {it.responsable && <small>{it.responsable}{it.hora ? ` · ${it.hora}` : ""}</small>}
        </span>
        <span className={`ini-cuando ${c.tono}`}>{c.txt}</span>
      </Link>
    </li>
  );
}

function BloqueAdministracion({ a, hoy }: { a: NonNullable<Datos["administracion"]>; hoy: string }) {
  const lista = a.misPendientes.length ? a.misPendientes : a.proximos;
  const pct = a.fiscal.total ? Math.round((a.fiscal.cumplidos / a.fiscal.total) * 100) : 0;
  return (
    <section className="card ini-card">
      <Cabecera icono={<ClipboardList size={17} />} titulo="Administración" sub="Vencimientos, pagos y tareas" href="/administracion" />
      <div className="ini-kpis">
        <Kpi valor={a.vencidos} label="Atrasados" tono={a.vencidos ? "mal" : "ok"} href="/administracion?tab=agenda" />
        <Kpi valor={a.hoy} label="Para hoy" tono={a.hoy ? "hoy" : undefined} href="/administracion?tab=agenda" />
        <Kpi valor={a.semana} label="Esta semana" href="/administracion?tab=agenda" />
      </div>
      <div className="ini-sub">{a.misPendientes.length ? `A tu cargo (${a.misPendientesTotal})` : "Lo próximo del área"}</div>
      {lista.length ? (
        <ul className="ini-lista">{lista.map((it) => <FilaItem key={it.id} it={it} hoy={hoy} />)}</ul>
      ) : (
        <div className="ini-ok"><CheckCircle2 size={16} aria-hidden="true" /> Nada pendiente para esta semana.</div>
      )}
      {a.fiscal.obligaciones > 0 && (
        <Link href="/administracion?tab=fiscal" className="ini-fiscal">
          <span>Control fiscal del mes</span>
          <span className="ini-barra" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
          <small>
            {a.fiscal.cumplidos}/{a.fiscal.total} cumplidos{a.fiscal.vencidos ? ` · ${a.fiscal.vencidos} vencidos` : ""}
            {a.fiscal.verificadas < a.fiscal.obligaciones ? ` · ${a.fiscal.obligaciones - a.fiscal.verificadas} fechas sin verificar` : ""}
          </small>
        </Link>
      )}
    </section>
  );
}

function BloqueGuardias({ g }: { g: NonNullable<Datos["guardias"]> }) {
  return (
    <section className="card ini-card">
      <Cabecera icono={<Stethoscope size={17} />} titulo="De guardia ahora" sub={g.todosLosSectores ? `Todos los sectores (${g.sectores})` : g.sectores ? `${plural(g.sectores, "sector", "sectores")} a tu cargo` : "Guardias Médicas"} href="/guardias" linkTxt="Calendario" />
      {g.ahora.length ? (
        <ul className="ini-lista">
          {g.ahora.map((x, i) => (
            <li key={i} className="ini-guardia">
              <span className="ini-guardia-sector">{x.sector}</span>
              <span className="ini-guardia-prof">{x.profesional}</span>
              <span className={`ini-modalidad ${x.modalidad}`}>{x.modalidad === "pasiva" ? "Pasiva" : "Activa"} · hasta {x.hasta}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="ini-ok mal"><AlertTriangle size={16} aria-hidden="true" /> No hay nadie de guardia cargado en este momento.</div>
      )}
      {g.sinGuardiaAhora.length > 0 && g.ahora.length > 0 && (
        <div className="ini-alerta"><AlertTriangle size={15} aria-hidden="true" /> Sin guardia ahora: {g.sinGuardiaAhora.join(", ")}</div>
      )}
      <div className="ini-sub">Cobertura</div>
      {g.huecosHoy.length ? (
        <ul className="ini-huecos">{g.huecosHoy.map((h) => <li key={h.sector}><b>{h.sector}</b> {h.texto}</li>)}</ul>
      ) : (
        <div className="ini-ok"><CheckCircle2 size={16} aria-hidden="true" /> {g.planificadoHasta ? "Hoy está todo cubierto." : "Todavía no hay guardias cargadas."}</div>
      )}
      {g.diasConHuecos > 0 && <div className="ini-nota"><CalendarDays size={14} aria-hidden="true" /> {plural(g.diasConHuecos, "día", "días")} con huecos en los próximos 7 días.</div>}
    </section>
  );
}

function BloqueSistema({ s }: { s: NonNullable<Datos["sistema"]> }) {
  return (
    <section className="card ini-card">
      <Cabecera icono={<Settings2 size={17} />} titulo="Sistemas" sub="Solo lo ve el superadministrador" href="/configuracion" linkTxt="Configuración" />
      <ul className="ini-servicios">
        <li><span><Database size={15} aria-hidden="true" /> Base de datos</span><b className={s.db === "ok" ? "ok" : "mal"}>{s.db === "ok" ? "Operativa" : "Con problemas"}</b></li>
        <li><span><Wrench size={15} aria-hidden="true" /> Mantenimiento</span><b className={s.mantenimiento ? "aviso" : "ok"}>{s.mantenimiento ? "Prendido" : "Apagado"}</b></li>
        <li><span><Users size={15} aria-hidden="true" /> Usuarios</span><b>{s.usuariosHoy} entraron hoy · {s.usuariosActivos} activos</b></li>
      </ul>
    </section>
  );
}
