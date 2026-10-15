import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  Database,
  FileClock,
  ListTodo,
  Plus,
  Settings2,
  ShieldCheck,
  Siren,
  Stethoscope,
  UserCheck,
  Users,
  Wrench,
} from "lucide-react";

const DashboardGraficos = lazy(() => import("@/components/dashboard-graficos").then((m) => ({ default: m.DashboardGraficos })));

/**
 * Inicio: cada persona ve lo de su día según los módulos que puede usar (GET /api/inicio).
 * Arriba lo urgente y la semana; después cada módulo; al final los indicadores.
 * Animaciones suaves (entrada escalonada, números que cuentan, barras que se llenan); se apagan con «reducir movimiento».
 */

type ItemMin = { id: number; tipo: string; titulo: string; fecha: string; hora: string; responsable: string; prioridad: string; monto: string; direccion: string | null; categoria: string | null };
type Suma = { total: number; cantidad: number; sinMonto: number };
type Urgente = { nivel: "alta" | "media" | "baja"; modulo: "administracion" | "guardias" | "sistema"; titulo: string; detalle: string; link: string };
type Dia = { fecha: string; vencimientos: number | null; cobertura: number | null; huecos: number | null };
type Sector = {
  sector: string;
  ahora: { profesional: string; modalidad: string; desde: string; hasta: string; avance: number }[];
  sigue: { profesional: string; desde: string; modalidad: string; empalma: boolean } | null;
};
type Datos = {
  hoy: string;
  usuario: { nombre: string; rol: string };
  accesos: { administracion: string | null; guardias: string | null; superadmin: boolean };
  urgente: Urgente[];
  urgenteTotal: number;
  semana: Dia[];
  administracion?: {
    vencidos: number;
    hoy: number;
    semana: number;
    misPendientes: ItemMin[];
    misPendientesTotal: number;
    proximos: ItemMin[];
    dinero: { chequesPagar: Suma; chequesCobrar: Suma; pagos: Suma; proximosPagos: ItemMin[] };
    documentos: ItemMin[];
    documentosTotal: number;
    tareas: { abiertas: number; atrasadas: number; mias: number };
    fiscal: { total: number; cumplidos: number; vencidos: number; obligaciones: number; verificadas: number };
  };
  guardias?: {
    sectores: number;
    todosLosSectores: boolean;
    porSector: Sector[];
    sinGuardiaAhora: string[];
    huecosHoy: { sector: string; texto: string }[];
    diasConHuecos: number;
    planificadoHasta: string | null;
    puedeCargar: boolean;
  };
  sistema?: { db: "ok" | "error"; mantenimiento: boolean; usuariosHoy: number; usuariosActivos: number; usuariosSinEntrar: number };
};
type Actividad = { id: number; title: string; detail: string; actor: string; createdAt: string };

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

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
  if (d < 0) return { txt: d === -1 ? "Venció ayer" : `Hace ${-d} días`, tono: "mal" };
  if (d === 0) return { txt: "Hoy", tono: "hoy" };
  if (d === 1) return { txt: "Mañana", tono: "pronto" };
  return { txt: `En ${d} días`, tono: d <= 3 ? "pronto" : "normal" };
}
function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}
function restante(iso: string) {
  const min = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
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
function plata(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

/** Frase de arriba: lo importante del día en una línea. */
function fraseDelDia(d: Datos): string {
  const partes: string[] = [];
  const a = d.administracion;
  const g = d.guardias;
  if (g?.sinGuardiaAhora.length) partes.push(`${plural(g.sinGuardiaAhora.length, "sector", "sectores")} sin guardia ahora`);
  if (a?.vencidos) partes.push(`${plural(a.vencidos, "vencimiento atrasado", "vencimientos atrasados")}`);
  if (a?.hoy) partes.push(`${plural(a.hoy, "vencimiento", "vencimientos")} para hoy`);
  if (g && !g.sinGuardiaAhora.length && g.huecosHoy.length) partes.push(`${plural(g.huecosHoy.length, "hueco", "huecos")} de guardia hoy`);
  if (!partes.length) return d.administracion || d.guardias ? "Todo en orden: no hay nada urgente por ahora." : "Bienvenido al sistema.";
  const ult = partes.pop()!;
  return `Hay ${partes.length ? `${partes.join(", ")} y ${ult}` : ult}.`;
}

/** Número que cuenta desde 0 (suave, solo la primera vez). */
function Contador({ valor, formato }: { valor: number; formato?: (n: number) => string }) {
  const [n, setN] = useState(0);
  const hecho = useRef(false);
  useEffect(() => {
    const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reducido || hecho.current || valor === 0) {
      setN(valor);
      return;
    }
    hecho.current = true;
    let raf = 0;
    const t0 = performance.now();
    const paso = (t: number) => {
      const p = Math.min(1, (t - t0) / 700);
      setN(Math.round(valor * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [valor]);
  return <>{formato ? formato(n) : n}</>;
}

/** Barra que se llena al aparecer. */
function Barra({ pct, tono }: { pct: number; tono?: string }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setW(Math.max(0, Math.min(100, pct))));
    return () => cancelAnimationFrame(t);
  }, [pct]);
  return <span className={`ini-barra ${tono ?? ""}`} aria-hidden="true"><i style={{ width: `${w}%` }} /></span>;
}

const entrada = (i: number): CSSProperties => ({ ["--i" as string]: i });

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
    fetch("/api/dashboard/activity?limit=5", { credentials: "include" })
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
  let i = 0;

  return (
    <main className="content-wrap ini">
      <header className="ini-cab ini-entrar" style={entrada(i++)}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow" style={{ textTransform: "capitalize" }}>{ahora.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}</div>
          <h1 className="page-title">{saludo(ahora)}{nombre ? `, ${nombre}` : ""}.</h1>
          <p className="ini-frase">{datos ? fraseDelDia(datos) : error ? "" : "Armando tu día…"}</p>
        </div>
        <div className="ini-cab-der">
          {datos && (
            <div className="ini-acciones">
              {puedeAdm && <Accion href="/administracion?nuevo=1" icon={<Plus size={16} />} texto="Nuevo vencimiento" primaria />}
              {datos.guardias?.puedeCargar && <Accion href="/guardias?nueva=1" icon={<CalendarPlus size={16} />} texto="Cargar guardia" />}
              {puedeAdm && <Accion href="/administracion?tab=tareas" icon={<ListTodo size={16} />} texto="Tareas" />}
              {ac?.superadmin && <Accion href="/configuracion" icon={<Users size={16} />} texto="Usuarios" />}
            </div>
          )}
        </div>
      </header>

      {error && <div className="form-error">{error}</div>}
      {!datos && !error && (
        <div className="ini-fila-2">{[1, 2].map((n) => <div key={n} className="card skeleton" style={{ height: 260 }} />)}</div>
      )}

      {datos && !datos.administracion && !datos.guardias && !datos.sistema && (
        <section className="card ini-card ini-vacio ini-entrar" style={entrada(i++)}>
          <ShieldCheck size={26} aria-hidden="true" />
          <h2>Todavía no tenés módulos asignados</h2>
          <p>Pedile al área de Sistemas que te dé acceso a los módulos que usás en tu trabajo.</p>
        </section>
      )}

      {datos && (datos.administracion || datos.guardias) && (
        <section className="ini-semana ini-entrar" style={entrada(i++)} aria-label="Tu semana">
          {datos.semana.map((d, k) => {
            const [y, m, dd] = d.fecha.split("-").map(Number);
            const dow = DIAS[new Date(y, m - 1, dd, 12).getDay()];
            const cob = d.cobertura;
            const tono = cob === null ? "" : cob >= 100 ? "ok" : cob >= 80 ? "medio" : "mal";
            return (
              <Link key={d.fecha} href={datos.administracion ? `/administracion?tab=agenda` : "/guardias"} className={`ini-dia ${k === 0 ? "hoy" : ""}`}>
                <span className="ini-dia-cab"><b>{k === 0 ? "Hoy" : k === 1 ? "Mañana" : dow}</b><small>{dd}/{String(m).padStart(2, "0")}</small></span>
                {d.vencimientos !== null && (
                  <span className={`ini-dia-venc ${d.vencimientos ? "hay" : ""}`}>{d.vencimientos ? plural(d.vencimientos, "vencimiento", "vencimientos") : "Sin vencimientos"}</span>
                )}
                {datos.guardias && (
                  <span className="ini-dia-cob">
                    <Barra pct={cob ?? 0} tono={tono} />
                    <small>{cob === null ? "Sin guardias cargadas" : cob >= 100 ? "Guardias cubiertas" : `Cobertura ${cob} %`}</small>
                  </span>
                )}
              </Link>
            );
          })}
        </section>
      )}

      {datos && (datos.urgente.length > 0 || datos.guardias) && (
        <div className="ini-fila-2">
          <section className="card ini-card ini-entrar" style={entrada(i++)}>
            <Cabecera icono={<Siren size={17} />} titulo="Lo urgente" sub={datos.urgenteTotal ? `${plural(datos.urgenteTotal, "cosa", "cosas")} para atender` : "Lo que necesita atención"} />
            {datos.urgente.length ? (
              <ul className="ini-lista">
                {datos.urgente.map((u, k) => (
                  <li key={k}>
                    <Link href={u.link} className={`ini-urg ${u.nivel}`}>
                      <span className="ini-urg-ico" aria-hidden="true">{u.modulo === "guardias" ? <Stethoscope size={15} /> : u.modulo === "sistema" ? <Settings2 size={15} /> : <ClipboardList size={15} />}</span>
                      <span className="ini-item-txt"><b>{u.titulo}</b><small>{u.detalle}</small></span>
                      <ArrowRight size={16} className="ini-urg-ir" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="ini-todo-ok"><CheckCircle2 size={34} aria-hidden="true" /><b>Nada urgente</b><span>No hay vencimientos atrasados ni sectores sin guardia.</span></div>
            )}
          </section>
          {datos.guardias ? <BloqueGuardias g={datos.guardias} i={i++} /> : datos.administracion ? <BloqueMios a={datos.administracion} hoy={datos.hoy} i={i++} /> : null}
        </div>
      )}

      {datos?.administracion && (
        <div className="ini-fila-3">
          {datos.guardias && <BloqueMios a={datos.administracion} hoy={datos.hoy} i={i++} />}
          <BloquePlata a={datos.administracion} hoy={datos.hoy} i={i++} />
          <div className="ini-col">
            <BloqueDocumentos a={datos.administracion} hoy={datos.hoy} i={i++} />
            <BloqueFiscal a={datos.administracion} i={i++} />
          </div>
        </div>
      )}

      {datos && (datos.sistema || actividad.length > 0) && (
        <div className="ini-fila-1">
          {datos.sistema && <BloqueSistema s={datos.sistema} i={i++} />}
          {actividad.length > 0 && (
            <section className="card ini-card ini-entrar" style={entrada(i++)}>
              <Cabecera icono={<UserCheck size={17} />} titulo="Actividad reciente" sub="Últimos movimientos en tus módulos" />
              <ul className="ini-lista ini-act-grilla">
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
        <section className="ini-indicadores ini-entrar" style={entrada(i++)}>
          <h2 className="ini-titulo-seccion">Indicadores</h2>
          <Suspense fallback={null}>
            <DashboardGraficos />
          </Suspense>
        </section>
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

function Cabecera({ icono, titulo, sub, href, linkTxt, extra }: { icono: ReactNode; titulo: string; sub?: string; href?: string; linkTxt?: string; extra?: ReactNode }) {
  return (
    <div className="ini-card-cab">
      <span className="ini-card-ico" aria-hidden="true">{icono}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <h2>{titulo}</h2>
        {sub && <small>{sub}</small>}
      </div>
      {extra}
      {href && <Link href={href} className="ini-ver">{linkTxt ?? "Abrir"} <ArrowUpRight size={14} /></Link>}
    </div>
  );
}

function FilaItem({ it, hoy, derecha }: { it: ItemMin; hoy: string; derecha?: ReactNode }) {
  const c = cuando(hoy, it.fecha);
  return (
    <li>
      <Link href={`/administracion?item=${it.id}`} className="ini-item">
        <span className={`ini-item-tipo t-${it.tipo}`} aria-hidden="true" />
        <span className="ini-item-txt">
          <b>{it.prioridad === "alta" && <span className="ini-alta" title="Prioridad alta">● </span>}{it.titulo}</b>
          {(it.responsable || it.categoria) && <small>{[it.categoria, it.responsable].filter(Boolean).join(" · ")}{it.hora ? ` · ${it.hora}` : ""}</small>}
        </span>
        {derecha}
        <span className={`ini-cuando ${c.tono}`}>{c.txt}</span>
      </Link>
    </li>
  );
}

function BloqueGuardias({ g, i }: { g: NonNullable<Datos["guardias"]>; i: number }) {
  return (
    <section className="card ini-card ini-entrar" style={entrada(i)}>
      <Cabecera
        icono={<Stethoscope size={17} />}
        titulo="De guardia ahora"
        sub={g.todosLosSectores ? `Todos los sectores (${g.sectores})` : `${plural(g.sectores, "sector", "sectores")} a tu cargo`}
        extra={<span className="ini-vivo"><i aria-hidden="true" />En vivo</span>}
        href="/guardias"
        linkTxt="Calendario"
      />
      {g.porSector.length === 0 ? (
        <div className="ini-ok">Todavía no hay sectores de guardia configurados.</div>
      ) : (
        <ul className="ini-lista ini-sectores">
          {g.porSector.map((s) => (
            <li key={s.sector} className={`ini-sector ${s.ahora.length ? "" : "vacio"}`}>
              <div className="ini-sector-cab">
                <span className="ini-guardia-sector">{s.sector}</span>
                {s.ahora[0] && <span className={`ini-modalidad ${s.ahora[0].modalidad}`}>{s.ahora[0].modalidad === "pasiva" ? "Pasiva" : "Activa"}</span>}
              </div>
              {s.ahora.length ? (
                s.ahora.map((a, k) => (
                  <div key={k} className="ini-sector-ahora">
                    <b>{a.profesional}</b>
                    <Barra pct={a.avance} />
                    <small>{hora(a.desde)}–{hora(a.hasta)} · quedan {restante(a.hasta)}</small>
                  </div>
                ))
              ) : (
                <div className="ini-sector-ahora"><b className="ini-sin">Sin guardia ahora</b></div>
              )}
              {s.sigue && (
                <div className={`ini-sigue ${s.sigue.empalma ? "" : "corte"}`}>
                  Sigue <b>{s.sigue.profesional}</b> a las {hora(s.sigue.desde)}
                  {!s.sigue.empalma && s.ahora.length > 0 && <span> · hay un corte antes</span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {g.diasConHuecos > 0 && <div className="ini-nota"><AlertTriangle size={14} aria-hidden="true" /> {plural(g.diasConHuecos, "día", "días")} con huecos en los próximos 7 días.</div>}
    </section>
  );
}

function BloqueMios({ a, hoy, i }: { a: NonNullable<Datos["administracion"]>; hoy: string; i: number }) {
  const lista = a.misPendientes.length ? a.misPendientes : a.proximos;
  return (
    <section className="card ini-card ini-entrar" style={entrada(i)}>
      <Cabecera icono={<ClipboardList size={17} />} titulo={a.misPendientes.length ? "A tu cargo" : "Lo próximo del área"} sub={a.misPendientes.length ? `${plural(a.misPendientesTotal, "pendiente")} con tu nombre` : "Próximos 7 días"} href="/administracion?tab=agenda" linkTxt="Agenda" />
      <div className="ini-kpis">
        <Kpi valor={a.vencidos} label="Atrasados" tono={a.vencidos ? "mal" : "ok"} href="/administracion?tab=agenda" />
        <Kpi valor={a.hoy} label="Para hoy" tono={a.hoy ? "hoy" : undefined} href="/administracion?tab=agenda" />
        <Kpi valor={a.tareas.abiertas} label={a.tareas.atrasadas ? `Tareas · ${a.tareas.atrasadas} atrasadas` : "Tareas abiertas"} tono={a.tareas.atrasadas ? "hoy" : undefined} href="/administracion?tab=tareas" />
      </div>
      {lista.length ? (
        <ul className="ini-lista">{lista.map((it) => <FilaItem key={it.id} it={it} hoy={hoy} />)}</ul>
      ) : (
        <div className="ini-ok"><CheckCircle2 size={16} aria-hidden="true" /> Nada pendiente para esta semana.</div>
      )}
    </section>
  );
}

function BloquePlata({ a, hoy, i }: { a: NonNullable<Datos["administracion"]>; hoy: string; i: number }) {
  const d = a.dinero;
  const hay = d.chequesPagar.cantidad + d.chequesCobrar.cantidad + d.pagos.cantidad;
  return (
    <section className="card ini-card ini-entrar" style={entrada(i)}>
      <Cabecera icono={<Banknote size={17} />} titulo="Plata de la semana" sub="Próximos 7 días (incluye lo atrasado)" href="/administracion?tab=cheques" linkTxt="Cheques" />
      <div className="ini-plata">
        <div><small>Cheques a pagar</small><b className="mal"><Contador valor={d.chequesPagar.total} formato={plata} /></b><span>{plural(d.chequesPagar.cantidad, "cheque")}</span></div>
        <div><small>Pagos</small><b><Contador valor={d.pagos.total} formato={plata} /></b><span>{plural(d.pagos.cantidad, "pago")}</span></div>
        <div><small>A cobrar</small><b className="ok"><Contador valor={d.chequesCobrar.total} formato={plata} /></b><span>{plural(d.chequesCobrar.cantidad, "cheque")}</span></div>
      </div>
      {hay ? (
        <ul className="ini-lista">{d.proximosPagos.map((it) => <FilaItem key={it.id} it={it} hoy={hoy} derecha={it.monto ? <span className="ini-monto">$ {it.monto}</span> : null} />)}</ul>
      ) : (
        <div className="ini-ok"><CheckCircle2 size={16} aria-hidden="true" /> No hay pagos ni cheques esta semana.</div>
      )}
      {(d.chequesPagar.sinMonto + d.pagos.sinMonto) > 0 && <div className="ini-nota">Hay {plural(d.chequesPagar.sinMonto + d.pagos.sinMonto, "ítem", "ítems")} sin monto cargado.</div>}
    </section>
  );
}

function BloqueDocumentos({ a, hoy, i }: { a: NonNullable<Datos["administracion"]>; hoy: string; i: number }) {
  return (
    <section className="card ini-card ini-entrar" style={entrada(i)}>
      <Cabecera icono={<FileClock size={17} />} titulo="Documentos por vencer" sub="Pólizas, habilitaciones y contratos (45 días)" href="/administracion?tab=documentos" linkTxt="Ver todos" />
      {a.documentos.length ? (
        <ul className="ini-lista">{a.documentos.map((it) => <FilaItem key={it.id} it={it} hoy={hoy} />)}</ul>
      ) : (
        <div className="ini-ok"><CheckCircle2 size={16} aria-hidden="true" /> Ningún documento vence en los próximos 45 días.</div>
      )}
      {a.documentosTotal > a.documentos.length && <div className="ini-nota">y {a.documentosTotal - a.documentos.length} más.</div>}
    </section>
  );
}

function BloqueFiscalMini({ a }: { a: NonNullable<Datos["administracion"]> }) {
  const pct = a.fiscal.total ? Math.round((a.fiscal.cumplidos / a.fiscal.total) * 100) : 0;
  return (
    <Link href="/administracion?tab=fiscal" className="ini-fiscal">
      <span>Avance del mes <b>{a.fiscal.cumplidos}/{a.fiscal.total} · {pct} %</b></span>
      <Barra pct={pct} tono="ok" />
      <small>
        
        {a.fiscal.verificadas < a.fiscal.obligaciones ? `${a.fiscal.obligaciones - a.fiscal.verificadas} fechas sin verificar` : "Fechas verificadas"}
      </small>
    </Link>
  );
}

function BloqueFiscal({ a, i }: { a: NonNullable<Datos["administracion"]>; i: number }) {
  if (!a.fiscal.obligaciones) return null;
  return (
    <section className="card ini-card ini-entrar" style={entrada(i)}>
      <Cabecera icono={<ClipboardList size={17} />} titulo="Control fiscal del mes" sub="Obligaciones de este mes" href="/administracion?tab=fiscal" linkTxt="Fiscal" />
      <div className="ini-kpis">
        <Kpi valor={a.fiscal.cumplidos} label="Cumplidos" tono="ok" href="/administracion?tab=fiscal" />
        <Kpi valor={Math.max(0, a.fiscal.total - a.fiscal.cumplidos - a.fiscal.vencidos)} label="Pendientes" href="/administracion?tab=fiscal" />
        <Kpi valor={a.fiscal.vencidos} label="Vencidos" tono={a.fiscal.vencidos ? "mal" : undefined} href="/administracion?tab=fiscal" />
      </div>
      <div className="ini-relleno" />
      <BloqueFiscalMini a={a} />
    </section>
  );
}

function Kpi({ valor, label, tono, href }: { valor: number; label: string; tono?: "mal" | "hoy" | "ok"; href: string }) {
  return (
    <Link href={href} className={`ini-kpi ${tono ?? ""}`}>
      <b><Contador valor={valor} /></b>
      <span>{label}</span>
    </Link>
  );
}

function BloqueSistema({ s, i }: { s: NonNullable<Datos["sistema"]>; i: number }) {
  return (
    <section className="card ini-card ini-entrar" style={entrada(i)}>
      <Cabecera icono={<Settings2 size={17} />} titulo="Sistemas" sub="Solo lo ve el superadministrador" href="/configuracion" linkTxt="Usuarios" />
      <ul className="ini-servicios">
        <li><span><Database size={15} aria-hidden="true" /> Base de datos</span><b className={s.db === "ok" ? "ok" : "mal"}>{s.db === "ok" ? "Operativa" : "Con problemas"}</b></li>
        <li><span><Wrench size={15} aria-hidden="true" /> Mantenimiento</span><b className={s.mantenimiento ? "aviso" : "ok"}>{s.mantenimiento ? "Prendido" : "Apagado"}</b></li>
        <li><span><Users size={15} aria-hidden="true" /> Usuarios</span><b><Contador valor={s.usuariosHoy} /> entraron hoy · {s.usuariosActivos} activos</b></li>
        {s.usuariosSinEntrar > 0 && <li><span><UserCheck size={15} aria-hidden="true" /> Nunca entraron</span><b className="aviso">{plural(s.usuariosSinEntrar, "usuario")}</b></li>}
      </ul>
    </section>
  );
}
