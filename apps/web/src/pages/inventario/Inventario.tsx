import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ClipboardCheck, Download, FileSpreadsheet, Plus, Search, SlidersHorizontal, Upload, X } from "lucide-react";
import { avisar } from "@/components/feedback";
import { Kpi, Modal, Pill, S, Seccion, Vacio } from "../administracion/ui";
import {
  ESTADOS,
  FRECUENCIAS,
  RESULTADO,
  TIPO_REGISTRO,
  clave,
  diasEntre,
  estadoMeta,
  fechaAr,
  frecuenciaTexto,
  hoyIso,
  inv,
  planDe,
  situacion,
  sumarDias,
  textoProximo,
  type Catalogos,
  type DatosRegistro,
  type Equipo,
  type Plan,
  type Registro,
  type Situacion,
} from "./api";
import { exportar } from "./excel";
import { ImportarModal } from "./Importar";
import { ControlPill, EquipoDetalleModal, EquipoForm, EstadoPill, LoteForm, RegistroForm, type Permisos } from "./modales";
import { ComoSeControlaModal, RondaModal } from "./controles";

type Me = { id: number; name: string; role: string; acciones?: Record<string, string[]>; scopes?: Record<string, { alcance: string; sectorIds: number[] }> };
type Sector = { id: number; name: string; shortName?: string; active?: boolean };
type Tab = "equipos" | "controles" | "fallas" | "historial";
type Orden = { campo: "id" | "planta" | "sector" | "rubro" | "tipo" | "descripcion" | "marca" | "codigoSerie" | "estado" | "proximo"; dir: 1 | -1 };

const POR_PAGINA = 50;
const param = (k: string) => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get(k) : null);

/** Fila para exportar (mismos encabezados que la importación: se puede editar y volver a subir). */
function filaExport(e: Equipo) {
  return {
    "Nº": e.id,
    PLANTA: e.planta,
    SECTOR: e.sectorName ?? "",
    RUBRO: e.rubro,
    TIPO: e.tipo,
    DESCRIPCION: e.descripcion,
    MARCA: e.marca,
    "CODIGO DE SERIE": e.codigoSerie,
    ESTADO: estadoMeta(e.estado).label,
    "FRECUENCIA DE CONTROL": e.frecuenciaDias ? frecuenciaTexto(e.frecuenciaDias) : "",
    "ULTIMO CONTROL": e.ultimoControl ? fechaAr(e.ultimoControl) : "",
    "PROXIMO CONTROL": e.proximoControl && e.estado !== "baja" ? fechaAr(e.proximoControl) : "",
    OBSERVACIONES: e.observaciones,
  };
}

function filaRegistro(r: Registro) {
  return {
    FECHA: fechaAr(r.fecha),
    REGISTRO: TIPO_REGISTRO[r.tipo] ?? r.tipo,
    RESULTADO: r.resultado ? RESULTADO[r.resultado] : "",
    DETALLE: r.detalle,
    RESPONSABLE: r.responsable,
    "ESTADO QUE QUEDÓ": r.estadoNuevo ? estadoMeta(r.estadoNuevo).label : "",
    "Nº EQUIPO": r.item?.id ?? r.itemId,
    DESCRIPCION: r.item?.descripcion ?? "",
    PLANTA: r.item?.planta ?? "",
    SECTOR: r.item?.sectorName ?? "",
    "CODIGO DE SERIE": r.item?.codigoSerie ?? "",
    CARGÓ: r.userNombre,
  };
}

export default function Inventario() {
  const [me, setMe] = useState<Me | null>(null);
  const [sectores, setSectores] = useState<Sector[]>([]);
  const [items, setItems] = useState<Equipo[] | null>(null);
  const [catalogos, setCatalogos] = useState<Catalogos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(() => (param("filtro") === "falla" ? "fallas" : param("filtro") === "vencidos" ? "controles" : "equipos"));
  const [conBajas, setConBajas] = useState(false);

  // filtros
  const [q, setQ] = useState(() => param("buscar") ?? "");
  const [planta, setPlanta] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [rubro, setRubro] = useState("");
  const [tipo, setTipo] = useState("");
  const [estado, setEstado] = useState(() => (param("filtro") === "falla" ? "con_falla" : ""));
  const [control, setControl] = useState<"" | Situacion>(() => (param("filtro") === "vencidos" ? "vencido" : param("filtro") === "semana" ? "semana" : ""));
  const [orden, setOrden] = useState<Orden>({ campo: "id", dir: 1 });
  const [pagina, setPagina] = useState(0);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [verFiltros, setVerFiltros] = useState(true);

  // ventanas
  const [detalle, setDetalle] = useState<number | null>(() => Number(param("item")) || null);
  const [form, setForm] = useState<{ equipo?: Equipo } | null>(null);
  const [registro, setRegistro] = useState<{ equipos: Equipo[]; tipo: DatosRegistro["tipo"] } | null>(null);
  const [lote, setLote] = useState(false);
  const [ronda, setRonda] = useState<Equipo[] | null>(null);
  const [planEq, setPlanEq] = useState<Equipo | null>(null);
  const [elegir, setElegir] = useState(false);
  const [importar, setImportar] = useState(false);
  const [menuExport, setMenuExport] = useState(false);

  const hoy = hoyIso();

  const cargar = useCallback(async () => {
    try {
      setItems(await inv.items(conBajas));
      setCatalogos(await inv.catalogos().catch(() => null));
    } catch (e) {
      setError((e as Error).message);
      setItems([]);
    }
  }, [conBajas]);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => setMe(null));
    fetch("/api/sectors", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((s) => setSectores(Array.isArray(s) ? s : []))
      .catch(() => setSectores([]));
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  // ---------- permisos ----------
  const acc = useMemo(() => {
    if (!me) return [] as string[];
    if (me.role === "superadmin") return ["ver", "exportar", "controlar", "cargar", "importar", "eliminar", "configurar"];
    return me.acciones?.inventario ?? [];
  }, [me]);
  const permisos: Permisos = {
    cargar: acc.includes("cargar"),
    controlar: acc.includes("controlar"),
    eliminar: acc.includes("eliminar"),
    importar: acc.includes("importar"),
    exportar: acc.includes("exportar"),
    configurar: acc.includes("configurar"),
  };
  const propios = useMemo(() => {
    const sc = me?.role === "superadmin" ? undefined : me?.scopes?.inventario;
    return sc && sc.alcance !== "todos" ? sc.sectorIds : null;
  }, [me]);
  const puedeEscribir = useCallback((id: number) => !propios || propios.includes(id), [propios]);
  const sectoresEscribibles = useMemo(() => sectores.filter((s) => s.active !== false && puedeEscribir(s.id)).sort((a, b) => a.name.localeCompare(b.name, "es")), [sectores, puedeEscribir]);
  const sectoresVistos = useMemo(() => {
    const ids = new Set((items ?? []).map((i) => i.sectorId));
    return sectores.filter((s) => ids.has(s.id)).sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [items, sectores]);

  // ---------- filtros ----------
  const filtrados = useMemo(() => {
    const t = clave(q.trim());
    const palabras = t.split(/\s+/).filter(Boolean);
    const lista = (items ?? []).filter((e) => {
      if (planta && e.planta !== planta) return false;
      if (sectorId && e.sectorId !== Number(sectorId)) return false;
      if (rubro && e.rubro !== rubro) return false;
      if (tipo && e.tipo !== tipo) return false;
      if (estado === "atencion" ? !["con_falla", "en_reparacion", "fuera_servicio"].includes(e.estado) : estado && e.estado !== estado) return false;
      if (control && situacion(e, hoy) !== control) return false;
      if (palabras.length) {
        const txt = clave(`${e.id} ${e.planta} ${e.sectorName ?? ""} ${e.rubro} ${e.tipo} ${e.descripcion} ${e.marca} ${e.codigoSerie} ${e.observaciones}`);
        if (!palabras.every((p) => txt.includes(p))) return false;
      }
      return true;
    });
    const valor = (e: Equipo): string | number => {
      switch (orden.campo) {
        case "id":
          return e.id;
        case "sector":
          return clave(e.sectorName ?? "");
        case "estado":
          return ESTADOS.findIndex((x) => x.value === e.estado);
        case "proximo":
          return e.proximoControl && e.estado !== "baja" ? e.proximoControl : "9999";
        default:
          return clave(String(e[orden.campo] ?? ""));
      }
    };
    return lista.sort((a, b) => {
      const va = valor(a);
      const vb = valor(b);
      return (va < vb ? -1 : va > vb ? 1 : a.id - b.id) * orden.dir;
    });
  }, [items, q, planta, sectorId, rubro, tipo, estado, control, orden, hoy]);

  useEffect(() => setPagina(0), [q, planta, sectorId, rubro, tipo, estado, control, orden]);

  const hayFiltros = Boolean(q || planta || sectorId || rubro || tipo || estado || control);
  const limpiar = () => {
    setQ("");
    setPlanta("");
    setSectorId("");
    setRubro("");
    setTipo("");
    setEstado("");
    setControl("");
  };

  const kpi = useMemo(() => {
    const act = (items ?? []).filter((e) => e.estado !== "baja");
    return {
      total: act.length,
      operativos: act.filter((e) => e.estado === "operativo").length,
      falla: act.filter((e) => e.estado === "con_falla").length,
      reparacion: act.filter((e) => e.estado === "en_reparacion" || e.estado === "fuera_servicio").length,
      vencidos: act.filter((e) => situacion(e, hoy) === "vencido").length,
      semana: act.filter((e) => situacion(e, hoy) === "semana").length,
    };
  }, [items, hoy]);

  const pagina0 = filtrados.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const seleccionados = (items ?? []).filter((e) => sel.has(e.id));
  const todosPagina = pagina0.length > 0 && pagina0.every((e) => sel.has(e.id));

  const toggleSel = (id: number) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const refrescar = () => {
    void cargar();
  };

  const exportarLista = async (formato: "xlsx" | "csv", lista: Equipo[]) => {
    setMenuExport(false);
    if (!lista.length) {
      avisar("No hay equipos para exportar.", "error");
      return;
    }
    await exportar(lista.map(filaExport), `inventario-${hoy}`, formato);
  };

  const th = (campo: Orden["campo"], label: string, style?: CSSProperties) => (
    <th style={{ ...S.th, cursor: "pointer", ...style }} onClick={() => setOrden((o) => ({ campo, dir: o.campo === campo ? ((o.dir * -1) as 1 | -1) : 1 }))} aria-sort={orden.campo === campo ? (orden.dir === 1 ? "ascending" : "descending") : "none"}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
        {label}
        {orden.campo === campo && (orden.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </span>
    </th>
  );

  const selectFiltro = (label: string, value: string, set: (v: string) => void, opciones: { value: string; label: string }[]) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={S.label}>{label}</span>
      <select className="select" value={value} onChange={(e) => set(e.target.value)} style={{ fontSize: 13 }}>
        <option value="">Todos</option>
        {opciones.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );

  return (
    <div className="content-wrap inv-page" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">Operación / Inventario</div>
          <h1 className="page-title">Inventario</h1>
          <p className="page-subtitle">Equipos y bienes por planta y sector, con su registro de controles, fallas y reparaciones.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} className="no-print">
          {permisos.importar && (
            <button type="button" className="btn btn-quiet" onClick={() => setImportar(true)}>
              <Upload size={15} /> Importar
            </button>
          )}
          {permisos.exportar && (
            <div style={{ position: "relative" }}>
              <button type="button" className="btn btn-quiet" onClick={() => setMenuExport((v) => !v)} aria-expanded={menuExport}>
                <Download size={15} /> Exportar
              </button>
              {menuExport && (
                <div role="menu" className="card" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 30, padding: 6, minWidth: 250, borderRadius: 12, boxShadow: "0 12px 30px rgba(0,0,0,.18)" }}>
                  {[
                    ["xlsx", `Excel · lo que estás viendo (${filtrados.length})`, filtrados],
                    ["csv", `CSV · lo que estás viendo (${filtrados.length})`, filtrados],
                    ["xlsx", `Excel · todo el inventario (${(items ?? []).length})`, items ?? []],
                  ].map(([f, label, lista], i) => (
                    <button key={i} type="button" role="menuitem" className="inv-menu-item" onClick={() => void exportarLista(f as "xlsx" | "csv", lista as Equipo[])}>
                      <FileSpreadsheet size={15} /> {label as string}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {permisos.cargar && sectoresEscribibles.length > 0 && (
            <button type="button" className="btn btn-primary" onClick={() => setForm({})}>
              <Plus size={16} /> Nuevo equipo
            </button>
          )}
        </div>
      </header>

      <div className="gm-tabs no-print" role="tablist" style={{ alignSelf: "flex-start", flexWrap: "wrap" }}>
        {(
          [
            ["equipos", "Equipos"],
            ["controles", `Controles${kpi.vencidos ? ` · ${kpi.vencidos} vencidos` : ""}`],
            ["fallas", `Fallas${kpi.falla + kpi.reparacion ? ` · ${kpi.falla + kpi.reparacion}` : ""}`],
            ["historial", "Historial"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`gm-tab${tab === id ? " is-active" : ""}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {error && <div className="form-error">{error}</div>}

      {tab === "equipos" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            <Kpi label="Equipos" valor={kpi.total} nota="activos (sin bajas)" onClick={limpiar} />
            <Kpi label="Operativos" valor={kpi.operativos} tono="ok" onClick={() => { limpiar(); setEstado("operativo"); }} />
            <Kpi label="Con falla" valor={kpi.falla} tono={kpi.falla ? "alerta" : undefined} onClick={() => setTab("fallas")} />
            <Kpi label="En reparación" valor={kpi.reparacion} nota="o fuera de servicio" onClick={() => setTab("fallas")} />
            <Kpi label="Controles vencidos" valor={kpi.vencidos} tono={kpi.vencidos ? "alerta" : undefined} onClick={() => setTab("controles")} />
            <Kpi label="Controles esta semana" valor={kpi.semana} onClick={() => { limpiar(); setControl("semana"); }} />
          </div>

          <section className="card" style={{ ...S.card, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ position: "relative", flex: "1 1 320px" }}>
                <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.55 }} aria-hidden="true" />
                <input className="input" style={{ paddingLeft: 36 }} placeholder="Buscar por descripción, marca, código de serie, Nº, sector…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar en el inventario" />
              </div>
              <button type="button" className="btn btn-quiet" onClick={() => setVerFiltros((v) => !v)} aria-expanded={verFiltros}>
                <SlidersHorizontal size={15} /> Filtros
              </button>
              {hayFiltros && (
                <button type="button" className="btn btn-quiet" onClick={limpiar}>
                  <X size={15} /> Limpiar
                </button>
              )}
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, marginLeft: "auto" }}>
                <input type="checkbox" checked={conBajas} onChange={(e) => setConBajas(e.target.checked)} /> Incluir dados de baja
              </label>
            </div>
            {verFiltros && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                {selectFiltro("Planta", planta, setPlanta, (catalogos?.plantas ?? []).map((p) => ({ value: p.valor, label: `${p.valor} (${p.n})` })))}
                {selectFiltro("Sector", sectorId, setSectorId, sectoresVistos.map((s) => ({ value: String(s.id), label: s.name })))}
                {selectFiltro("Rubro", rubro, setRubro, (catalogos?.rubros ?? []).map((p) => ({ value: p.valor, label: `${p.valor} (${p.n})` })))}
                {selectFiltro("Tipo", tipo, setTipo, (catalogos?.tipos ?? []).map((p) => ({ value: p.valor, label: `${p.valor} (${p.n})` })))}
                {selectFiltro("Estado", estado, setEstado, [...ESTADOS.filter((x) => conBajas || x.value !== "baja").map((x) => ({ value: x.value as string, label: x.label })), { value: "atencion", label: "Necesita atención (falla / reparación / fuera)" }])}
                {selectFiltro("Control", control, (v) => setControl(v as "" | Situacion), [
                  { value: "vencido", label: "Vencido" },
                  { value: "semana", label: "Vence esta semana" },
                  { value: "mes", label: "Vence este mes" },
                  { value: "aldia", label: "Al día" },
                  { value: "sin", label: "Sin control periódico" },
                ])}
              </div>
            )}

            {sel.size > 0 && (
              <div className="inv-lote no-print">
                <strong>{sel.size} seleccionado{sel.size === 1 ? "" : "s"}</strong>
                {permisos.controlar && (
                  <button type="button" className="btn btn-primary" style={{ fontSize: 12.5 }} onClick={() => setRegistro({ equipos: seleccionados.filter((e) => e.estado !== "baja" && puedeEscribir(e.sectorId)), tipo: "control" })}>
                    <ClipboardCheck size={14} /> Registrar control
                  </button>
                )}
                {permisos.cargar && <button type="button" className="btn btn-quiet" style={{ fontSize: 12.5 }} onClick={() => setLote(true)}>Cambiar datos…</button>}
                {permisos.exportar && <button type="button" className="btn btn-quiet" style={{ fontSize: 12.5 }} onClick={() => void exportarLista("xlsx", seleccionados)}>Exportar selección</button>}
                <button type="button" className="btn btn-quiet" style={{ fontSize: 12.5 }} onClick={() => setSel(new Set())}>Quitar selección</button>
                {filtrados.length > sel.size && (
                  <button type="button" className="btn btn-quiet" style={{ fontSize: 12.5 }} onClick={() => setSel(new Set(filtrados.map((e) => e.id)))}>Seleccionar los {filtrados.length} filtrados</button>
                )}
              </div>
            )}

            {items === null ? (
              <div className="skeleton" style={{ height: 320 }} />
            ) : !items.length ? (
              <Vacio
                titulo="Todavía no hay equipos cargados"
                texto={permisos.importar ? "Podés cargarlos de a uno o importar tu planilla de Excel con las columnas PLANTA, SECTOR, RUBRO, TIPO, DESCRIPCION, MARCA y CODIGO DE SERIE." : "Cuando se carguen equipos de tus sectores, van a aparecer acá."}
                accion={
                  permisos.importar ? (
                    <button type="button" className="btn btn-primary" onClick={() => setImportar(true)}>
                      <Upload size={15} /> Importar desde Excel
                    </button>
                  ) : undefined
                }
              />
            ) : !filtrados.length ? (
              <Vacio titulo="Ningún equipo coincide con la búsqueda" accion={<button type="button" className="btn btn-quiet" onClick={limpiar}>Limpiar filtros</button>} />
            ) : (
              <>
                <div style={S.small}>
                  {filtrados.length === items.length ? `${items.length} equipos` : `${filtrados.length} de ${items.length} equipos`} · tocá un equipo para ver su historia
                </div>
                <div className="inv-tabla-wrap">
                  <table className="inv-tabla">
                    <thead>
                      <tr>
                        <th style={{ ...S.th, width: 34 }}>
                          <input
                            type="checkbox"
                            aria-label="Seleccionar la página"
                            checked={todosPagina}
                            onChange={(e) =>
                              setSel((s) => {
                                const n = new Set(s);
                                for (const it of pagina0) {
                                  if (e.target.checked) n.add(it.id);
                                  else n.delete(it.id);
                                }
                                return n;
                              })
                            }
                          />
                        </th>
                        {th("id", "Nº")}
                        {th("planta", "Planta")}
                        {th("sector", "Sector")}
                        {th("rubro", "Rubro")}
                        {th("tipo", "Tipo")}
                        {th("descripcion", "Descripción")}
                        {th("marca", "Marca")}
                        {th("codigoSerie", "Código de serie")}
                        {th("estado", "Estado")}
                        {th("proximo", "Próximo control")}
                      </tr>
                    </thead>
                    <tbody>
                      {pagina0.map((e) => (
                        <tr key={e.id} className={sel.has(e.id) ? "is-sel" : undefined} onClick={() => setDetalle(e.id)} style={{ opacity: e.estado === "baja" ? 0.6 : 1 }}>
                          <td onClick={(ev) => ev.stopPropagation()} style={{ width: 34 }}>
                            <input type="checkbox" checked={sel.has(e.id)} onChange={() => toggleSel(e.id)} aria-label={`Seleccionar Nº ${e.id}`} />
                          </td>
                          <td className="inv-num">{e.id}</td>
                          <td>{e.planta}</td>
                          <td>{e.sectorName}</td>
                          <td>{e.rubro}</td>
                          <td>{e.tipo}</td>
                          <td className="inv-desc">{e.descripcion}</td>
                          <td>{e.marca || <span style={S.small}>—</span>}</td>
                          <td className="inv-serie">{e.codigoSerie || <span style={S.small}>—</span>}</td>
                          <td><EstadoPill estado={e.estado} /></td>
                          <td><ControlPill e={e} hoy={hoy} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {paginas > 1 && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <span style={S.small}>
                      {pagina * POR_PAGINA + 1}–{Math.min(filtrados.length, (pagina + 1) * POR_PAGINA)} de {filtrados.length}
                    </span>
                    <button type="button" className="btn btn-quiet" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>← Anterior</button>
                    <button type="button" className="btn btn-quiet" disabled={pagina >= paginas - 1} onClick={() => setPagina((p) => p + 1)}>Siguiente →</button>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}

      {tab === "controles" && items && (
        <Controles
          items={items}
          hoy={hoy}
          permisos={permisos}
          puedeEscribir={puedeEscribir}
          onAbrir={setDetalle}
          onRegistrar={(equipos, tipo) => setRegistro({ equipos, tipo: tipo ?? "control" })}
          onRonda={setRonda}
        />
      )}
      {tab === "fallas" && items && (
        <Fallas
          items={items}
          hoy={hoy}
          permisos={permisos}
          puedeEscribir={puedeEscribir}
          onAbrir={setDetalle}
          onRegistrar={(equipos, tipo) => setRegistro({ equipos, tipo })}
          onReportar={() => setElegir(true)}
        />
      )}
      {tab === "historial" && items && <Historial items={items} permisos={permisos} onAbrir={setDetalle} />}

      {detalle !== null && (
        <EquipoDetalleModal
          id={detalle}
          permisos={permisos}
          puedeEscribir={puedeEscribir}
          onClose={() => setDetalle(null)}
          onEditar={(e) => setForm({ equipo: e })}
          onRegistrar={(e, tipo) => setRegistro({ equipos: [e], tipo })}
          onPlan={setPlanEq}
          planes={catalogos?.planes ?? []}
          onChanged={refrescar}
        />
      )}
      {planEq && (
        <ComoSeControlaModal
          equipo={planEq}
          planes={catalogos?.planes ?? []}
          mismoTipo={(items ?? []).filter((x) => x.estado !== "baja" && clave(x.tipo) === clave(planEq.tipo)).length}
          puedeLista={permisos.configurar}
          onClose={() => setPlanEq(null)}
          onSaved={() => {
            setPlanEq(null);
            refrescar();
            if (detalle !== null) {
              const d = detalle;
              setDetalle(null);
              setTimeout(() => setDetalle(d), 0);
            }
          }}
        />
      )}
      {elegir && items && (
        <ElegirEquipoModal
          items={items}
          puedeEscribir={puedeEscribir}
          onClose={() => setElegir(false)}
          onElegir={(e) => {
            setElegir(false);
            setRegistro({ equipos: [e], tipo: "falla" });
          }}
        />
      )}
      {form && (
        <EquipoForm
          equipo={form.equipo}
          sectores={sectoresEscribibles}
          catalogos={catalogos}
          onClose={() => setForm(null)}
          onSaved={(e) => {
            setForm(null);
            refrescar();
            const nuevo = !form.equipo;
            setDetalle(null);
            setTimeout(() => setDetalle(e.id), 0);
            if (nuevo) setQ("");
          }}
        />
      )}
      {registro && registro.equipos.length > 0 && (
        <RegistroForm
          equipos={registro.equipos}
          planes={catalogos?.planes ?? []}
          tipoInicial={registro.tipo}
          responsable={me?.name ?? ""}
          onClose={() => setRegistro(null)}
          onSaved={() => {
            setRegistro(null);
            setSel(new Set());
            refrescar();
            if (detalle !== null) {
              const d = detalle;
              setDetalle(null);
              setTimeout(() => setDetalle(d), 0);
            }
          }}
        />
      )}
      {ronda && ronda.length > 0 && (
        <RondaModal equipos={ronda} planes={catalogos?.planes ?? []} responsable={me?.name ?? ""} onClose={() => setRonda(null)} onDone={refrescar} />
      )}
      {lote && (
        <LoteForm
          equipos={seleccionados}
          sectores={sectoresEscribibles}
          catalogos={catalogos}
          onClose={() => setLote(false)}
          onSaved={() => {
            setLote(false);
            setSel(new Set());
            refrescar();
          }}
        />
      )}
      {importar && (
        <ImportarModal
          sectores={sectoresEscribibles.map((s) => s.name)}
          onClose={() => setImportar(false)}
          onDone={() => {
            setImportar(false);
            refrescar();
          }}
        />
      )}
    </div>
  );
}

// ---------- Controles (mantenimiento preventivo): qué toca controlar, ronda y cumplimiento ----------

function semanaDe(iso: string, hoy: string): string {
  const d = diasEntre(hoy, iso);
  if (d <= 7) return "Esta semana";
  if (d <= 14) return "La semana que viene";
  if (d <= 21) return "En 2 semanas";
  return "En 3 a 4 semanas";
}

function FiltroPlantaSector({ items, planta, setPlanta, sectorId, setSectorId }: { items: Equipo[]; planta: string; setPlanta: (v: string) => void; sectorId: string; setSectorId: (v: string) => void }) {
  const activos = items.filter((e) => e.estado !== "baja");
  const plantas = [...new Set(activos.map((e) => e.planta))].filter(Boolean).sort((a, b) => a.localeCompare(b, "es"));
  const sectores = [...new Map(activos.map((e) => [e.sectorId, e.sectorName ?? ""])).entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  return (
    <div className="inv-ctrl-filtros">
      <label>
        <span style={S.label}>Planta</span>
        <select className="select" value={planta} onChange={(e) => setPlanta(e.target.value)}>
          <option value="">Todas</option>
          {plantas.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <label>
        <span style={S.label}>Sector</span>
        <select className="select" value={sectorId} onChange={(e) => setSectorId(e.target.value)}>
          <option value="">Todos</option>
          {sectores.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
      </label>
    </div>
  );
}

function FilaEquipo({ e, onAbrir, extra, accion }: { e: Equipo; onAbrir: (id: number) => void; extra?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="inv-fila">
      <button type="button" className="inv-fila-main" onClick={() => onAbrir(e.id)}>
        <span style={{ fontWeight: 600 }}>{e.descripcion}</span>
        <span style={S.small}>
          Nº {e.id} · {e.tipo} · {e.sectorName} · {e.planta}
        </span>
      </button>
      {extra}
      {accion}
    </div>
  );
}

function Controles({
  items,
  hoy,
  permisos,
  puedeEscribir,
  onAbrir,
  onRegistrar,
  onRonda,
}: {
  items: Equipo[];
  hoy: string;
  permisos: Permisos;
  puedeEscribir: (sectorId: number) => boolean;
  onAbrir: (id: number) => void;
  onRegistrar: (e: Equipo[], tipo?: DatosRegistro["tipo"]) => void;
  onRonda: (e: Equipo[]) => void;
}) {
  const [planta, setPlanta] = useState("");
  const [sectorId, setSectorId] = useState("");
  const activos = items.filter((e) => e.estado !== "baja" && (!planta || e.planta === planta) && (!sectorId || e.sectorId === Number(sectorId)));
  const conControl = activos.filter((e) => e.proximoControl);
  const sinControl = activos.filter((e) => !e.frecuenciaDias).length;
  const vencidos = conControl.filter((e) => situacion(e, hoy) === "vencido").sort((a, b) => (a.proximoControl ?? "").localeCompare(b.proximoControl ?? ""));
  const proximos = conControl.filter((e) => ["semana", "mes"].includes(situacion(e, hoy))).sort((a, b) => (a.proximoControl ?? "").localeCompare(b.proximoControl ?? ""));
  const alDia = conControl.length ? Math.round(((conControl.length - vencidos.length) / conControl.length) * 100) : null;
  const puede = (e: Equipo) => permisos.controlar && puedeEscribir(e.sectorId);
  const pendientes = [...vencidos, ...proximos.filter((e) => situacion(e, hoy) === "semana")].filter(puede);

  const porSector = useMemo(() => {
    const m = new Map<number, { nombre: string; total: number; vencidos: number }>();
    for (const e of conControl) {
      const x = m.get(e.sectorId) ?? { nombre: e.sectorName ?? "—", total: 0, vencidos: 0 };
      x.total++;
      if (situacion(e, hoy) === "vencido") x.vencidos++;
      m.set(e.sectorId, x);
    }
    return [...m.entries()].map(([id, v]) => ({ id, ...v, pct: Math.round(((v.total - v.vencidos) / v.total) * 100) })).sort((a, b) => a.pct - b.pct || a.nombre.localeCompare(b.nombre, "es"));
  }, [conControl, hoy]);

  const agenda = new Map<string, Equipo[]>();
  for (const e of proximos) {
    const k = semanaDe(e.proximoControl!, hoy);
    agenda.set(k, [...(agenda.get(k) ?? []), e]);
  }
  const btnControlar = (e: Equipo) =>
    puede(e) ? (
      <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => onRegistrar([e])}>
        Controlar
      </button>
    ) : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section className="card inv-ctrl-cab">
        <FiltroPlantaSector items={items} planta={planta} setPlanta={setPlanta} sectorId={sectorId} setSectorId={setSectorId} />
        <div className="inv-ctrl-kpis">
          <div>
            <span style={S.label}>Controles al día</span>
            <strong style={{ color: alDia === null ? undefined : alDia >= 90 ? "#15803d" : alDia >= 70 ? "#b45309" : "#b91c1c" }}>{alDia === null ? "—" : `${alDia} %`}</strong>
            <span style={S.small}>{conControl.length} equipos con control periódico</span>
          </div>
          <div>
            <span style={S.label}>Vencidos</span>
            <strong style={{ color: vencidos.length ? "#b91c1c" : undefined }}>{vencidos.length}</strong>
          </div>
          <div>
            <span style={S.label}>Próximos 30 días</span>
            <strong>{proximos.length}</strong>
          </div>
          <div>
            <span style={S.label}>Sin control definido</span>
            <strong>{sinControl}</strong>
            <span style={S.small}>Se define en la ficha del equipo</span>
          </div>
        </div>
        {permisos.controlar && (
          <div className="inv-ronda-cta">
            <div style={{ minWidth: 0 }}>
              <strong>Ronda de control</strong>
              <span style={S.small}>Recorré los equipos uno por uno y registrá cada control en segundos{pendientes.length ? ` · ${pendientes.length} pendientes (vencidos y de esta semana)` : ""}.</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-primary" disabled={!pendientes.length} onClick={() => onRonda(pendientes)}>
                <ClipboardCheck size={15} /> Ronda de pendientes ({pendientes.length})
              </button>
              <button
                type="button"
                className="btn btn-quiet"
                disabled={!activos.some(puede)}
                onClick={() => onRonda(activos.filter(puede).sort((a, b) => a.planta.localeCompare(b.planta, "es") || (a.sectorName ?? "").localeCompare(b.sectorName ?? "", "es") || a.id - b.id))}
              >
                Ronda completa ({activos.filter(puede).length})
              </button>
            </div>
          </div>
        )}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 16, alignItems: "start" }}>
        <Seccion titulo={`Vencidos (${vencidos.length})`}>
          {vencidos.length === 0 ? (
            <div style={S.small}>No hay controles vencidos.</div>
          ) : (
            <div className="inv-lista-scroll">
              {vencidos.slice(0, 300).map((e) => <FilaEquipo key={e.id} e={e} onAbrir={onAbrir} extra={<ControlPill e={e} hoy={hoy} />} accion={btnControlar(e)} />)}
            </div>
          )}
        </Seccion>
        <Seccion titulo={`Próximos 30 días (${proximos.length})`}>
          {proximos.length === 0 ? (
            <div style={S.small}>Nada que controlar en los próximos 30 días.</div>
          ) : (
            <div className="inv-lista-scroll">
              {[...agenda.entries()].map(([semana, eqs]) => (
                <div key={semana} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div className="inv-semana">
                    {semana} <span>{eqs.length}</span>
                  </div>
                  {eqs.map((e) => <FilaEquipo key={e.id} e={e} onAbrir={onAbrir} extra={<span style={{ ...S.small, whiteSpace: "nowrap" }}>{fechaAr(e.proximoControl)}</span>} accion={btnControlar(e)} />)}
                </div>
              ))}
            </div>
          )}
        </Seccion>
      </div>

      {porSector.length > 0 && (
        <Seccion titulo="Cumplimiento por sector">
          <div className="inv-cumplimiento">
            {porSector.map((s) => (
              <button key={s.id} type="button" className="inv-cumpl-fila" onClick={() => setSectorId(String(s.id))} title={`Ver ${s.nombre}`}>
                <span className="inv-cumpl-nombre">{s.nombre}</span>
                <span className="inv-cumpl-barra" aria-hidden="true">
                  <i style={{ width: `${s.pct}%`, background: s.pct >= 90 ? "#16a34a" : s.pct >= 70 ? "#d97706" : "#dc2626" }} />
                </span>
                <span className="inv-cumpl-num">{s.pct} %</span>
                <span style={S.small}>
                  {s.vencidos ? `${s.vencidos} vencido${s.vencidos === 1 ? "" : "s"}` : "al día"} de {s.total}
                </span>
              </button>
            ))}
          </div>
        </Seccion>
      )}
    </div>
  );
}

// ---------- Fallas (mantenimiento correctivo): reportadas → en reparación → resueltas ----------

function Fallas({
  items,
  hoy,
  permisos,
  puedeEscribir,
  onAbrir,
  onRegistrar,
  onReportar,
}: {
  items: Equipo[];
  hoy: string;
  permisos: Permisos;
  puedeEscribir: (sectorId: number) => boolean;
  onAbrir: (id: number) => void;
  onRegistrar: (e: Equipo[], tipo: DatosRegistro["tipo"]) => void;
  onReportar: () => void;
}) {
  const [regs, setRegs] = useState<Registro[] | null>(null);
  const [planta, setPlanta] = useState("");
  const [sectorId, setSectorId] = useState("");
  useEffect(() => {
    inv
      .registros({ desde: sumarDias(hoyIso(), -365), tipo: "falla,control,envio,reparacion", limit: 10000 })
      .then(setRegs)
      .catch(() => setRegs([]));
  }, [items]);

  const filtro = (e: Equipo) => (!planta || e.planta === planta) && (!sectorId || e.sectorId === Number(sectorId));
  const porItem = useMemo(() => {
    const falla = new Map<number, Registro>();
    const envio = new Map<number, Registro>();
    for (const r of regs ?? []) {
      if ((r.tipo === "falla" || r.resultado === "falla") && !falla.has(r.itemId)) falla.set(r.itemId, r);
      if (r.tipo === "envio" && !envio.has(r.itemId)) envio.set(r.itemId, r);
    }
    return { falla, envio };
  }, [regs]);

  const reportadas = items.filter((e) => (e.estado === "con_falla" || e.estado === "fuera_servicio") && filtro(e));
  const enReparacion = items.filter((e) => e.estado === "en_reparacion" && filtro(e));
  const resueltas = (regs ?? []).filter((r) => r.tipo === "reparacion" && diasEntre(r.fecha, hoy) <= 30).filter((r) => {
    const e = items.find((x) => x.id === r.itemId);
    return !e || filtro(e);
  });
  const puede = (e: Equipo) => permisos.controlar && puedeEscribir(e.sectorId);
  const dias = (iso?: string) => (iso ? diasEntre(iso, hoy) : null);

  const tarjeta = (e: Equipo, r: Registro | undefined, pie: ReactNode, extra?: ReactNode) => {
    const d = dias(r?.fecha);
    return (
      <div key={e.id} className="inv-falla">
        <button type="button" className="inv-falla-main" onClick={() => onAbrir(e.id)}>
          <span className="inv-falla-titulo">{e.descripcion}</span>
          <span style={S.small}>
            Nº {e.id} · {e.sectorName} · {e.planta}
          </span>
          {r?.detalle && <span className="inv-falla-detalle">{r.detalle}</span>}
          {extra}
          {d !== null && (
            <span style={{ ...S.small, color: d > 15 ? "#b91c1c" : undefined, fontWeight: d > 15 ? 700 : undefined }}>
              Hace {d} día{d === 1 ? "" : "s"} · {fechaAr(r!.fecha)}
            </span>
          )}
        </button>
        {pie && <div className="inv-falla-pie">{pie}</div>}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section className="card inv-ctrl-cab" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between" }}>
        <FiltroPlantaSector items={items} planta={planta} setPlanta={setPlanta} sectorId={sectorId} setSectorId={setSectorId} />
        {permisos.controlar && (
          <button type="button" className="btn btn-primary" onClick={onReportar}>
            <AlertTriangle size={15} /> Reportar falla
          </button>
        )}
      </section>
      {regs === null ? (
        <div className="skeleton" style={{ height: 260 }} />
      ) : (
        <div className="inv-tablero">
          <div className="inv-col">
            <div className="inv-col-cab es-rojo">
              Reportadas <span>{reportadas.length}</span>
            </div>
            <p style={S.small}>Equipos con falla o fuera de servicio, todavía sin enviar a reparar.</p>
            {reportadas.length === 0 && <div className="inv-col-vacia">Ninguna falla pendiente.</div>}
            {reportadas.map((e) =>
              tarjeta(
                e,
                porItem.falla.get(e.id),
                puede(e) ? (
                  <>
                    <button type="button" className="btn btn-quiet" onClick={() => onRegistrar([e], "envio")}>Enviar a reparar</button>
                    <button type="button" className="btn btn-quiet" onClick={() => onRegistrar([e], "reparacion")}>Ya está reparado</button>
                  </>
                ) : null,
                <EstadoPill estado={e.estado} />,
              ),
            )}
          </div>
          <div className="inv-col">
            <div className="inv-col-cab es-violeta">
              En reparación <span>{enReparacion.length}</span>
            </div>
            <p style={S.small}>Enviados al service o en arreglo.</p>
            {enReparacion.length === 0 && <div className="inv-col-vacia">Ningún equipo en reparación.</div>}
            {enReparacion
              .map((e) => ({ e, r: porItem.envio.get(e.id) }))
              .sort((a, b) => (a.r?.fecha ?? "9").localeCompare(b.r?.fecha ?? "9"))
              .map(({ e, r }) =>
                tarjeta(
                  e,
                  r,
                  puede(e) ? <button type="button" className="btn btn-primary" onClick={() => onRegistrar([e], "reparacion")}>Marcar reparado</button> : null,
                  r?.proveedor ? <span style={{ fontSize: 12.5, fontWeight: 600 }}>{r.proveedor}</span> : undefined,
                ),
              )}
          </div>
          <div className="inv-col">
            <div className="inv-col-cab es-verde">
              Resueltas · 30 días <span>{resueltas.length}</span>
            </div>
            <p style={S.small}>Reparaciones registradas en el último mes.</p>
            {resueltas.length === 0 && <div className="inv-col-vacia">Sin reparaciones en el último mes.</div>}
            {resueltas.map((r) => (
              <button key={r.id} type="button" className="inv-falla inv-falla-main" onClick={() => onAbrir(r.itemId)}>
                <span className="inv-falla-titulo">{r.item?.descripcion}</span>
                <span style={S.small}>
                  Nº {r.itemId} · {r.item?.sectorName} · {fechaAr(r.fecha)}
                </span>
                {r.detalle && <span className="inv-falla-detalle">{r.detalle}</span>}
                {r.proveedor && <span style={S.small}>{r.proveedor}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Historial: todo lo registrado ----------

function Historial({ items, permisos, onAbrir }: { items: Equipo[]; permisos: Permisos; onAbrir: (id: number) => void }) {
  const [registros, setRegistros] = useState<Registro[] | null>(null);
  const [desde, setDesde] = useState(() => sumarDias(hoyIso(), -90));
  const [tipo, setTipo] = useState("control,falla,envio,reparacion");
  const [q, setQ] = useState("");
  useEffect(() => {
    setRegistros(null);
    inv
      .registros({ desde, tipo })
      .then(setRegistros)
      .catch(() => setRegistros([]));
  }, [desde, tipo, items]);
  const t = clave(q.trim());
  const lista = (registros ?? []).filter((r) => !t || clave(`${r.itemId} ${r.item?.descripcion} ${r.item?.sectorName} ${r.item?.planta} ${r.item?.codigoSerie} ${r.detalle} ${r.responsable} ${r.proveedor}`).includes(t));
  return (
    <Seccion
      titulo="Historial de controles, fallas y reparaciones"
      extra={
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input className="input" style={{ width: 220 }} placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select" style={{ width: 230, fontSize: 13 }} value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Qué registros">
            <option value="control,falla,envio,reparacion">Controles, fallas y reparaciones</option>
            <option value="control">Solo controles</option>
            <option value="falla">Solo fallas</option>
            <option value="envio,reparacion">Envíos y reparaciones</option>
            <option value="">Todo (incluye altas y cambios)</option>
          </select>
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12.5 }}>
            Desde <input type="date" className="input" style={{ width: 150, padding: "5px 8px" }} value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          {permisos.exportar && lista.length > 0 && (
            <button type="button" className="btn btn-quiet" style={{ fontSize: 12.5 }} onClick={() => void exportar(lista.map(filaRegistro), `inventario-historial-${hoyIso()}`, "xlsx", "Historial")}>
              <Download size={14} /> Excel
            </button>
          )}
        </div>
      }
    >
      {registros === null ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : lista.length === 0 ? (
        <div style={S.small}>No hay registros con ese filtro.</div>
      ) : (
        <div className="inv-tabla-wrap">
          <table className="inv-tabla">
            <thead>
              <tr>
                <th style={S.th}>Fecha</th>
                <th style={S.th}>Registro</th>
                <th style={S.th}>Equipo</th>
                <th style={S.th}>Sector</th>
                <th style={S.th}>Detalle</th>
                <th style={S.th}>Responsable</th>
              </tr>
            </thead>
            <tbody>
              {lista.slice(0, 1500).map((r) => {
                const malo = r.tipo === "falla" || r.resultado === "falla";
                const c = malo ? ["#fde2e2", "#8f1d1d"] : r.tipo === "envio" ? ["#ede9fe", "#4c1d95"] : r.tipo === "reparacion" ? ["#dbeafe", "#1e3a8a"] : r.resultado === "observacion" ? ["#fdf0d5", "#7a4a06"] : r.tipo === "control" ? ["#dcf3dc", "#155c15"] : ["hsl(var(--muted))", "hsl(var(--foreground))"];
                const noOk = (r.checklist ?? []).filter((p) => p.estado !== "ok");
                return (
                  <tr key={r.id} onClick={() => onAbrir(r.itemId)}>
                    <td style={{ whiteSpace: "nowrap" }}>{fechaAr(r.fecha)}</td>
                    <td>
                      <Pill style={{ background: c[0], color: c[1] }}>
                        {TIPO_REGISTRO[r.tipo]}
                        {r.resultado ? ` · ${RESULTADO[r.resultado]}` : ""}
                      </Pill>
                      {r.checklist && r.checklist.length > 0 && <div style={{ ...S.small, marginTop: 3 }}>{r.checklist.length - noOk.length}/{r.checklist.length} puntos OK</div>}
                    </td>
                    <td className="inv-desc">
                      {r.item?.descripcion} <span style={S.small}>Nº {r.itemId}</span>
                    </td>
                    <td>{r.item?.sectorName}</td>
                    <td className="inv-desc" style={{ fontSize: 12.5 }}>
                      {r.detalle || noOk.map((p) => `${p.item}${p.nota ? `: ${p.nota}` : ""}`).join(" · ")}
                      {r.proveedor && <div style={S.small}>{r.proveedor}</div>}
                    </td>
                    <td>{r.responsable || r.userNombre}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Seccion>
  );
}

// ---------- elegir el equipo con falla ----------

function ElegirEquipoModal({ items, puedeEscribir, onClose, onElegir }: { items: Equipo[]; puedeEscribir: (sectorId: number) => boolean; onClose: () => void; onElegir: (e: Equipo) => void }) {
  const [q, setQ] = useState("");
  const t = clave(q.trim());
  const palabras = t.split(/\s+/).filter(Boolean);
  const lista = items
    .filter((e) => e.estado !== "baja" && puedeEscribir(e.sectorId))
    .filter((e) => !palabras.length || palabras.every((p) => clave(`${e.id} ${e.descripcion} ${e.tipo} ${e.marca} ${e.codigoSerie} ${e.sectorName} ${e.planta}`).includes(p)))
    .slice(0, 60);
  return (
    <Modal titulo="Reportar falla: ¿qué equipo?" onClose={onClose} ancho={620}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input className="input" autoFocus placeholder="Buscá por descripción, Nº, código de serie, sector…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 420, overflow: "auto" }}>
          {lista.map((e) => (
            <button key={e.id} type="button" className="inv-fila inv-fila-main" style={{ flexDirection: "row", alignItems: "center" }} onClick={() => onElegir(e)}>
              <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>{e.descripcion}</span>
                <span style={S.small}>
                  Nº {e.id} · {e.tipo} · {e.sectorName} · {e.planta}
                  {e.codigoSerie && ` · Serie ${e.codigoSerie}`}
                </span>
              </span>
              <EstadoPill estado={e.estado} />
            </button>
          ))}
          {!lista.length && <div style={S.small}>No hay equipos que coincidan.</div>}
        </div>
      </div>
    </Modal>
  );
}
