import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ClipboardCheck, Download, FileSpreadsheet, Plus, Search, SlidersHorizontal, Upload, X } from "lucide-react";
import { avisar } from "@/components/feedback";
import { Kpi, Pill, S, Seccion, SegControl, Vacio } from "../administracion/ui";
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
import { RondaModal } from "./controles";

type Me = { id: number; name: string; role: string; acciones?: Record<string, string[]>; scopes?: Record<string, { alcance: string; sectorIds: number[] }> };
type Sector = { id: number; name: string; shortName?: string; active?: boolean };
type Tab = "equipos" | "controles" | "ajustes";
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
  const [tab, setTab] = useState<Tab>("equipos");
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
            ["controles", `Controles${kpi.vencidos ? ` (${kpi.vencidos} vencidos)` : ""}`],
            ...(permisos.configurar ? [["ajustes", "Plan y catálogos"]] : []),
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
            <Kpi label="Con falla" valor={kpi.falla} tono={kpi.falla ? "alerta" : undefined} onClick={() => { limpiar(); setEstado("con_falla"); }} />
            <Kpi label="En reparación" valor={kpi.reparacion} nota="o fuera de servicio" onClick={() => { limpiar(); setEstado("atencion"); }} />
            <Kpi label="Controles vencidos" valor={kpi.vencidos} tono={kpi.vencidos ? "alerta" : undefined} onClick={() => { limpiar(); setControl("vencido"); }} />
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
          planes={catalogos?.planes ?? []}
          permisos={permisos}
          puedeEscribir={puedeEscribir}
          onAbrir={setDetalle}
          onRegistrar={(equipos, tipo) => setRegistro({ equipos, tipo: tipo ?? "control" })}
          onRonda={setRonda}
        />
      )}

      {tab === "ajustes" && permisos.configurar && <Ajustes catalogos={catalogos} onChanged={refrescar} />}

      {detalle !== null && (
        <EquipoDetalleModal
          id={detalle}
          permisos={permisos}
          puedeEscribir={puedeEscribir}
          onClose={() => setDetalle(null)}
          onEditar={(e) => setForm({ equipo: e })}
          onRegistrar={(e, tipo) => setRegistro({ equipos: [e], tipo })}
          onChanged={refrescar}
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

// ---------- Controles: ronda, cumplimiento, agenda, reparaciones y registro ----------

function semanaDe(iso: string, hoy: string): string {
  const d = diasEntre(hoy, iso);
  if (d <= 7) return "Esta semana";
  if (d <= 14) return "La semana que viene";
  if (d <= 21) return "En 2 semanas";
  return "En 3 a 4 semanas";
}

function Controles({
  items,
  hoy,
  planes,
  permisos,
  puedeEscribir,
  onAbrir,
  onRegistrar,
  onRonda,
}: {
  items: Equipo[];
  hoy: string;
  planes: Plan[];
  permisos: Permisos;
  puedeEscribir: (sectorId: number) => boolean;
  onAbrir: (id: number) => void;
  onRegistrar: (e: Equipo[], tipo?: DatosRegistro["tipo"]) => void;
  onRonda: (e: Equipo[]) => void;
}) {
  const [registros, setRegistros] = useState<Registro[] | null>(null);
  const [envios, setEnvios] = useState<Map<number, Registro>>(new Map());
  const [desde, setDesde] = useState(() => sumarDias(hoyIso(), -90));
  const [tipo, setTipo] = useState("control,falla,envio,reparacion");
  const [planta, setPlanta] = useState("");
  const [sectorId, setSectorId] = useState("");
  useEffect(() => {
    setRegistros(null);
    inv
      .registros({ desde, tipo })
      .then(setRegistros)
      .catch(() => setRegistros([]));
  }, [desde, tipo, items]);
  // Último envío a reparación de cada equipo (para saber desde cuándo y a quién).
  useEffect(() => {
    inv
      .registros({ tipo: "envio", limit: 5000 })
      .then((rs) => {
        const m = new Map<number, Registro>();
        for (const r of rs) if (!m.has(r.itemId)) m.set(r.itemId, r);
        setEnvios(m);
      })
      .catch(() => setEnvios(new Map()));
  }, [items]);

  const activos = items.filter((e) => e.estado !== "baja" && (!planta || e.planta === planta) && (!sectorId || e.sectorId === Number(sectorId)));
  const conControl = activos.filter((e) => e.proximoControl);
  const vencidos = conControl.filter((e) => situacion(e, hoy) === "vencido").sort((a, b) => (a.proximoControl ?? "").localeCompare(b.proximoControl ?? ""));
  const proximos = conControl.filter((e) => ["semana", "mes"].includes(situacion(e, hoy))).sort((a, b) => (a.proximoControl ?? "").localeCompare(b.proximoControl ?? ""));
  const enReparacion = activos.filter((e) => e.estado === "en_reparacion");
  const conFalla = activos.filter((e) => e.estado === "con_falla" || e.estado === "fuera_servicio");
  const alDia = conControl.length ? Math.round(((conControl.length - vencidos.length) / conControl.length) * 100) : null;
  const plantas = [...new Set(items.filter((e) => e.estado !== "baja").map((e) => e.planta))].filter(Boolean).sort((a, b) => a.localeCompare(b, "es"));
  const sectores = [...new Map(items.filter((e) => e.estado !== "baja").map((e) => [e.sectorId, e.sectorName ?? ""])).entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));

  const porSector = useMemo(() => {
    const m = new Map<number, { nombre: string; total: number; vencidos: number; falla: number }>();
    for (const e of conControl) {
      const x = m.get(e.sectorId) ?? { nombre: e.sectorName ?? "—", total: 0, vencidos: 0, falla: 0 };
      x.total++;
      if (situacion(e, hoy) === "vencido") x.vencidos++;
      m.set(e.sectorId, x);
    }
    for (const e of activos) if (e.estado !== "operativo") {
      const x = m.get(e.sectorId);
      if (x) x.falla++;
    }
    return [...m.entries()].map(([id, v]) => ({ id, ...v, pct: Math.round(((v.total - v.vencidos) / v.total) * 100) })).sort((a, b) => a.pct - b.pct || a.nombre.localeCompare(b.nombre, "es"));
  }, [conControl, activos, hoy]);

  const pendientesRonda = [...vencidos, ...proximos.filter((e) => situacion(e, hoy) === "semana")].filter((e) => puedeEscribir(e.sectorId));
  const puede = (e: Equipo) => permisos.controlar && puedeEscribir(e.sectorId);

  const filaEquipo = (e: Equipo, extra?: ReactNode, accion?: ReactNode) => (
    <div key={e.id} className="inv-fila">
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

  const agenda = new Map<string, Equipo[]>();
  for (const e of proximos) {
    const k = semanaDe(e.proximoControl!, hoy);
    agenda.set(k, [...(agenda.get(k) ?? []), e]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section className="card inv-ctrl-cab">
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
            <span style={S.label}>Con falla / en reparación</span>
            <strong style={{ color: conFalla.length + enReparacion.length ? "#b91c1c" : undefined }}>{conFalla.length + enReparacion.length}</strong>
          </div>
        </div>
        {permisos.controlar && (
          <div className="inv-ronda-cta">
            <div style={{ minWidth: 0 }}>
              <strong>Ronda de control</strong>
              <span style={S.small}>Recorré los equipos uno por uno y registrá cada control en segundos{pendientesRonda.length ? ` · ${pendientesRonda.length} pendientes (vencidos y de esta semana)` : ""}.</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-primary" disabled={!pendientesRonda.length} onClick={() => onRonda(pendientesRonda)}>
                <ClipboardCheck size={15} /> Ronda de pendientes ({pendientesRonda.length})
              </button>
              <button type="button" className="btn btn-quiet" disabled={!activos.some((e) => puedeEscribir(e.sectorId))} onClick={() => onRonda(activos.filter((e) => puedeEscribir(e.sectorId)).sort((a, b) => a.planta.localeCompare(b.planta, "es") || (a.sectorName ?? "").localeCompare(b.sectorName ?? "", "es") || a.id - b.id))}>
                Ronda completa ({activos.filter((e) => puedeEscribir(e.sectorId)).length})
              </button>
            </div>
          </div>
        )}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 16, alignItems: "start" }}>
        <Seccion
          titulo={`Controles vencidos (${vencidos.length})`}
          extra={
            vencidos.some(puede) ? (
              <button type="button" className="btn btn-quiet" style={{ fontSize: 12.5 }} onClick={() => onRonda(vencidos.filter(puede))}>
                Ronda de vencidos
              </button>
            ) : undefined
          }
        >
          {vencidos.length === 0 ? (
            <div style={S.small}>No hay controles vencidos.</div>
          ) : (
            <div className="inv-lista-scroll">
              {vencidos.slice(0, 300).map((e) =>
                filaEquipo(e, <ControlPill e={e} hoy={hoy} />, puede(e) ? <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => onRegistrar([e])}>Controlar</button> : undefined),
              )}
            </div>
          )}
        </Seccion>
        <Seccion titulo={`Agenda · próximos 30 días (${proximos.length})`}>
          {proximos.length === 0 ? (
            <div style={S.small}>Nada que controlar en los próximos 30 días.</div>
          ) : (
            <div className="inv-lista-scroll">
              {[...agenda.entries()].map(([semana, eqs]) => (
                <div key={semana} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div className="inv-semana">
                    {semana} <span>{eqs.length}</span>
                  </div>
                  {eqs.map((e) => filaEquipo(e, <span style={{ ...S.small, whiteSpace: "nowrap" }}>{fechaAr(e.proximoControl)}</span>, puede(e) ? <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => onRegistrar([e])}>Controlar</button> : undefined))}
                </div>
              ))}
            </div>
          )}
        </Seccion>
      </div>

      {(conFalla.length > 0 || enReparacion.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 16, alignItems: "start" }}>
          <Seccion titulo={`Con falla, sin enviar a reparar (${conFalla.length})`}>
            {conFalla.length === 0 ? (
              <div style={S.small}>Ninguno.</div>
            ) : (
              <div className="inv-lista-scroll">
                {conFalla.map((e) =>
                  filaEquipo(
                    e,
                    <EstadoPill estado={e.estado} />,
                    puede(e) ? (
                      <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => onRegistrar([e], "envio")}>
                        Enviar a reparar
                      </button>
                    ) : undefined,
                  ),
                )}
              </div>
            )}
          </Seccion>
          <Seccion titulo={`En reparación (${enReparacion.length})`}>
            {enReparacion.length === 0 ? (
              <div style={S.small}>Ninguno.</div>
            ) : (
              <div className="inv-lista-scroll">
                {enReparacion
                  .map((e) => ({ e, envio: envios.get(e.id) }))
                  .sort((a, b) => (a.envio?.fecha ?? "9").localeCompare(b.envio?.fecha ?? "9"))
                  .map(({ e, envio }) =>
                    filaEquipo(
                      e,
                      <span style={{ ...S.small, textAlign: "right" }}>
                        {envio ? (
                          <>
                            <strong style={{ color: diasEntre(envio.fecha, hoy) > 30 ? "#b91c1c" : "hsl(var(--foreground))" }}>{diasEntre(envio.fecha, hoy)} días</strong>
                            {envio.proveedor && <><br />{envio.proveedor}</>}
                          </>
                        ) : (
                          "En reparación"
                        )}
                      </span>,
                      puede(e) ? (
                        <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => onRegistrar([e], "reparacion")}>
                          Reparado
                        </button>
                      ) : undefined,
                    ),
                  )}
              </div>
            )}
          </Seccion>
        </div>
      )}

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
                  {s.falla ? ` · ${s.falla} con problema` : ""}
                </span>
              </button>
            ))}
          </div>
        </Seccion>
      )}

      <Seccion
        titulo="Registro de controles"
        extra={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
            {permisos.exportar && registros && registros.length > 0 && (
              <button type="button" className="btn btn-quiet" style={{ fontSize: 12.5 }} onClick={() => void exportar(registros.map(filaRegistro), `inventario-registro-${hoyIso()}`, "xlsx", "Registro")}>
                <Download size={14} /> Excel
              </button>
            )}
          </div>
        }
      >
        {registros === null ? (
          <div className="skeleton" style={{ height: 160 }} />
        ) : registros.length === 0 ? (
          <div style={S.small}>No hay registros en ese período.</div>
        ) : (
          <div className="inv-tabla-wrap" style={{ maxHeight: 460 }}>
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
                {registros
                  .filter((r) => (!planta || r.item?.planta === planta) && (!sectorId || items.find((e) => e.id === r.itemId)?.sectorId === Number(sectorId)))
                  .slice(0, 1000)
                  .map((r) => {
                    const malo = r.tipo === "falla" || r.resultado === "falla";
                    const c = malo ? ["#fde2e2", "#8f1d1d"] : r.tipo === "envio" ? ["#ede9fe", "#4c1d95"] : r.tipo === "reparacion" ? ["#dbeafe", "#1e3a8a"] : r.resultado === "observacion" ? ["#fdf0d5", "#7a4a06"] : r.tipo === "control" ? ["#dcf3dc", "#155c15"] : ["hsl(var(--muted))", "hsl(var(--foreground))"];
                    const fallas = (r.checklist ?? []).filter((p) => p.estado !== "ok");
                    return (
                      <tr key={r.id} onClick={() => onAbrir(r.itemId)}>
                        <td style={{ whiteSpace: "nowrap" }}>{fechaAr(r.fecha)}</td>
                        <td>
                          <Pill style={{ background: c[0], color: c[1] }}>
                            {TIPO_REGISTRO[r.tipo]}
                            {r.resultado ? ` · ${RESULTADO[r.resultado]}` : ""}
                          </Pill>
                          {r.checklist && r.checklist.length > 0 && <div style={{ ...S.small, marginTop: 3 }}>{r.checklist.length - fallas.length}/{r.checklist.length} puntos OK</div>}
                        </td>
                        <td className="inv-desc">
                          {r.item?.descripcion} <span style={S.small}>Nº {r.itemId}</span>
                        </td>
                        <td>{r.item?.sectorName}</td>
                        <td className="inv-desc" style={{ fontSize: 12.5 }}>
                          {r.detalle || fallas.map((p) => `${p.item}${p.nota ? `: ${p.nota}` : ""}`).join(" · ")}
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
    </div>
  );
}

// ---------- Plan de controles y catálogos ----------

function Ajustes({ catalogos, onChanged }: { catalogos: Catalogos | null; onChanged: () => void }) {
  const [editando, setEditando] = useState<{ tipo: string; dias: string; aplicar: "sin_frecuencia" | "todos" | "ninguno"; lista: string } | null>(null);
  const guardarPlan = async () => {
    if (!editando) return;
    try {
      const lista = editando.lista.split("\n").map((x) => x.trim()).filter(Boolean);
      const r = await inv.plan(editando.tipo, editando.dias ? Number(editando.dias) : null, editando.aplicar, lista);
      avisar(`Plan de «${editando.tipo}» guardado${r.actualizados ? ` · ${r.actualizados} equipo${r.actualizados === 1 ? "" : "s"} actualizado${r.actualizados === 1 ? "" : "s"}` : ""}.`);
      setEditando(null);
      onChanged();
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };
  const renombrar = async (campo: "planta" | "rubro" | "tipo", de: string) => {
    const a = window.prompt(`Nuevo nombre para «${de}» (si ya existe, se unifican):`, de);
    if (!a || a.trim() === de) return;
    try {
      const r = await inv.renombrar(campo, de, a.trim());
      avisar(`${r.actualizados} equipo${r.actualizados === 1 ? "" : "s"} actualizado${r.actualizados === 1 ? "" : "s"}.`);
      onChanged();
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };
  if (!catalogos) return <div className="skeleton" style={{ height: 240 }} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Seccion titulo="Plan de controles por tipo de equipo">
        <p style={{ ...S.small, marginTop: -4, marginBottom: 12 }}>
          Para cada tipo: cada cuánto se controla y qué puntos se revisan (lista de verificación). Al registrar un control de ese tipo, se marca cada punto como OK, observación o falla.
        </p>
        {catalogos.tipos.length === 0 ? (
          <div style={S.small}>Todavía no hay equipos cargados.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {catalogos.tipos.map((t) => {
              const plan = planDe(catalogos.planes, t.valor);
              const ed = editando?.tipo === t.valor ? editando : null;
              return (
                <div key={t.valor} className={`inv-plan${ed ? " is-ed" : ""}`}>
                  <div className="inv-plan-cab">
                    <div style={{ minWidth: 0 }}>
                      <strong>{t.valor}</strong>
                      <span style={S.small}>
                        {t.n} equipo{t.n === 1 ? "" : "s"} · {frecuenciaTexto(plan?.frecuenciaDias)} · {plan?.checklist.length ? `${plan.checklist.length} puntos a revisar` : "sin lista de verificación"}
                      </span>
                    </div>
                    {!ed && (
                      <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => setEditando({ tipo: t.valor, dias: String(plan?.frecuenciaDias ?? ""), aplicar: "sin_frecuencia", lista: (plan?.checklist ?? []).join("\n") })}>
                        {plan ? "Editar plan" : "Definir plan"}
                      </button>
                    )}
                  </div>
                  {!ed && plan && plan.checklist.length > 0 && (
                    <div className="inv-plan-puntos">
                      {plan.checklist.map((p) => <span key={p}>{p}</span>)}
                    </div>
                  )}
                  {ed && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 12, marginTop: 10 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          <span className="field-label">Control periódico</span>
                          <select className="select" value={ed.dias} onChange={(e) => setEditando({ ...ed, dias: e.target.value })}>
                            <option value="">Sin control periódico</option>
                            {FRECUENCIAS.map((f) => <option key={f.dias} value={f.dias}>{f.label}</option>)}
                          </select>
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          <span className="field-label">Equipos ya cargados</span>
                          <select className="select" value={ed.aplicar} onChange={(e) => setEditando({ ...ed, aplicar: e.target.value as typeof ed.aplicar })}>
                            <option value="sin_frecuencia">Aplicar la frecuencia a los que no tienen</option>
                            <option value="todos">Aplicar la frecuencia a todos los de este tipo</option>
                            <option value="ninguno">No tocar los ya cargados</option>
                          </select>
                        </label>
                      </div>
                      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        <span className="field-label">Puntos a revisar (uno por renglón)</span>
                        <textarea className="input" rows={6} value={ed.lista} onChange={(e) => setEditando({ ...ed, lista: e.target.value })} placeholder={"Ej.:\nPresión en zona verde\nPrecinto y seguro\nSeñalización visible\nCarga vigente"} />
                      </label>
                      <div style={{ display: "flex", gap: 8, gridColumn: "1 / -1", justifyContent: "flex-end" }}>
                        <button type="button" className="btn btn-quiet" onClick={() => setEditando(null)}>Cancelar</button>
                        <button type="button" className="btn btn-primary" onClick={() => void guardarPlan()}>Guardar plan</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Seccion>
      <Seccion titulo="Unificar nombres">
        <p style={{ ...S.small, marginTop: -4, marginBottom: 12 }}>
          Si un mismo valor está escrito de distintas formas (ej. «PB» y «Planta baja»), renombralo y quedan unificados en todos los equipos.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 14 }}>
          {(
            [
              ["planta", "Plantas", catalogos.plantas],
              ["rubro", "Rubros", catalogos.rubros],
              ["tipo", "Tipos", catalogos.tipos],
            ] as const
          ).map(([campo, titulo, vals]) => (
            <div key={campo}>
              <div style={{ ...S.label, marginBottom: 6 }}>{titulo}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 300, overflow: "auto" }}>
                {vals.map((v) => (
                  <div key={v.valor} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 8, border: "1px solid hsl(var(--border))" }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>{v.valor}</span>
                    <span style={S.small}>{v.n}</span>
                    <button type="button" className="btn btn-quiet" style={{ fontSize: 11.5, padding: "3px 8px" }} onClick={() => void renombrar(campo, v.valor)}>Renombrar</button>
                  </div>
                ))}
                {!vals.length && <span style={S.small}>—</span>}
              </div>
            </div>
          ))}
        </div>
      </Seccion>
    </div>
  );
}
