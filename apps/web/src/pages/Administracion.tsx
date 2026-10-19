import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { AdmContext, type AdmCtx } from "./administracion/contexto";
import { adm } from "./administracion/api";
import { TIPOS, hoyIso, type Item, type Tipo } from "./administracion/logic";
import { CumplirModal, ItemDetalle, ItemForm, type Permisos } from "./administracion/modales";

const Resumen = lazy(() => import("./administracion/Resumen"));
const Agenda = lazy(() => import("./administracion/Agenda"));
const Fiscal = lazy(() => import("./administracion/Fiscal"));
const Cheques = lazy(() => import("./administracion/Cheques"));
const Documentos = lazy(() => import("./administracion/Documentos"));
const Tareas = lazy(() => import("./administracion/Tareas"));
const Recurrentes = lazy(() => import("./administracion/Recurrentes"));
const Contactos = lazy(() => import("./administracion/Contactos"));
const Ajustes = lazy(() => import("./administracion/Ajustes"));
const Guia = lazy(() => import("./administracion/Guia"));

const TABS = [
  { key: "resumen", label: "Resumen" },
  { key: "agenda", label: "Agenda" },
  { key: "fiscal", label: "Fiscal" },
  { key: "cheques", label: "Cheques" },
  { key: "documentos", label: "Documentos" },
  { key: "tareas", label: "Tareas" },
  { key: "recurrentes", label: "Recurrentes" },
  { key: "contactos", label: "Contactos" },
  { key: "ajustes", label: "Ajustes" },
  { key: "guia", label: "Guía de uso" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/** Acciones de la persona en el módulo según /auth/me (si la API es vieja, se deducen del nivel). */
function permisosDe(me: { role?: string; permissions?: Record<string, string>; acciones?: Record<string, string[]> } | null): Permisos {
  const de = (lista: string[]): Permisos => ({
    editar: lista.includes("cargar"),
    cumplir: lista.includes("cumplir"),
    verificar: lista.includes("verificar"),
    recurrentes: lista.includes("recurrentes"),
    contactos: lista.includes("contactos"),
    eliminar: lista.includes("eliminar"),
    calendario: lista.includes("calendario"),
  });
  if (!me) return de([]);
  if (me.role === "superadmin") return de(["cargar", "cumplir", "verificar", "recurrentes", "contactos", "eliminar", "calendario"]);
  if (me.acciones?.administracion) return de(me.acciones.administracion);
  const lvl = me.permissions?.administracion ?? "";
  const editar = lvl === "editar" || lvl === "total" ? ["cargar", "cumplir", "verificar", "recurrentes", "contactos"] : [];
  return de([...editar, ...(lvl === "total" ? ["eliminar", "calendario"] : [])]);
}

function leerParam(k: string): string | null {
  return typeof window !== "undefined" ? new URLSearchParams(window.location.search).get(k) : null;
}

export default function Administracion() {
  const [tab, setTabState] = useState<TabKey>(() => {
    const t = leerParam("tab");
    if (TABS.some((x) => x.key === t)) return t as TabKey;
    return leerParam("buscar") ? "agenda" : "resumen";
  });
  const [me, setMe] = useState<{ role?: string; permissions?: Record<string, string>; acciones?: Record<string, string[]> } | null>(null);
  const [responsables, setResponsables] = useState<string[]>([]);
  const [version, setVersion] = useState(0);
  const [hoy, setHoy] = useState(hoyIso);
  const [form, setForm] = useState<{ item: Item | null; tipo?: Tipo; fecha?: string } | null>(null);
  const [detalle, setDetalle] = useState<number | null>(() => Number(leerParam("item")) || null);
  const [cumplir, setCumplir] = useState<Item | null>(null);
  const [menuNuevo, setMenuNuevo] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const permisos = useMemo(() => permisosDe(me), [me]);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => setMe(null));
  }, []);
  useEffect(() => {
    adm.responsables().then(setResponsables).catch(() => undefined);
  }, [version]);
  // Si la pantalla queda abierta de un día para otro, "hoy" se actualiza.
  useEffect(() => {
    const t = setInterval(() => setHoy(hoyIso()), 60_000);
    return () => clearInterval(t);
  }, []);
  // ?nuevo=1 (botón del Resumen general) abre el alta directamente.
  useEffect(() => {
    if (leerParam("nuevo")) setForm({ item: null, tipo: "vencimiento" });
  }, []);
  useEffect(() => {
    if (!menuNuevo) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuNuevo(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuNuevo]);

  const setTab = useCallback((t: string) => {
    if (!TABS.some((x) => x.key === t)) return;
    setTabState(t as TabKey);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    url.searchParams.delete("item");
    url.searchParams.delete("nuevo");
    window.history.replaceState(null, "", url.toString());
  }, []);

  const refrescar = useCallback(() => setVersion((v) => v + 1), []);

  const ctx: AdmCtx = useMemo(
    () => ({
      permisos,
      hoy,
      responsables,
      version,
      refrescar,
      abrir: (id) => setDetalle(id),
      nuevo: (tipo, fecha) => setForm({ item: null, tipo, fecha }),
      editar: (item) => setForm({ item }),
      cumplir: (item) => setCumplir(item),
      irA: setTab,
    }),
    [permisos, hoy, responsables, version, refrescar, setTab],
  );

  return (
    <AdmContext.Provider value={ctx}>
      <div className="adm-page" style={{ padding: "20px 24px 40px", display: "flex", flexDirection: "column", gap: 16, maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}>
        <header style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 14, alignItems: "flex-end" }}>
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">Operación / Administración</div>
            <h1 className="page-title">Administración</h1>
            <p className="page-subtitle">Vencimientos fiscales, pagos, cheques, documentos y tareas del área en un solo lugar.</p>
          </div>
          {permisos.editar && (
            <div ref={menuRef} style={{ position: "relative" }} className="no-print">
              <div style={{ display: "inline-flex" }}>
                <button type="button" className="btn btn-primary" style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }} onClick={() => setForm({ item: null, tipo: tab === "cheques" ? "cheque" : tab === "documentos" ? "documento" : tab === "tareas" ? "tarea" : "recordatorio" })}>
                  <Plus size={16} /> Nuevo
                </button>
                <button type="button" className="btn btn-primary" style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeft: "1px solid rgba(255,255,255,.3)", padding: "0 10px" }} aria-label="Elegir qué crear" aria-expanded={menuNuevo} onClick={() => setMenuNuevo((v) => !v)}>
                  <ChevronDown size={16} />
                </button>
              </div>
              {menuNuevo && (
                <div role="menu" className="card" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 30, padding: 6, minWidth: 220, borderRadius: 12, boxShadow: "0 12px 30px rgba(0,0,0,.15)" }}>
                  {TIPOS.map((t) => (
                    <button
                      key={t.value}
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        setMenuNuevo(false);
                        setForm({ item: null, tipo: t.value });
                      }}
                      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px", border: "none", background: "none", borderRadius: 8, cursor: "pointer", font: "inherit", fontSize: 13.5, color: "inherit", textAlign: "left" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "hsl(var(--muted))")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                    >
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: t.color }} aria-hidden="true" />
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </header>

        <nav aria-label="Secciones de Administración" className="no-print" style={{ display: "flex", gap: 2, overflowX: "auto", overflowY: "hidden", borderBottom: "1px solid hsl(var(--border))", scrollbarWidth: "thin" }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-current={tab === t.key ? "page" : undefined}
              onClick={() => setTab(t.key)}
              style={{
                border: "none",
                background: "none",
                padding: "10px 12px",
                fontSize: 13.5,
                fontWeight: tab === t.key ? 700 : 500,
                color: tab === t.key ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                borderBottom: `2px solid ${tab === t.key ? "hsl(var(--primary))" : "transparent"}`,
                marginBottom: -1,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <Suspense fallback={<div style={{ color: "hsl(var(--muted-foreground))", padding: 20 }}>Cargando…</div>}>
          {tab === "resumen" && <Resumen />}
          {tab === "agenda" && <Agenda busquedaInicial={leerParam("buscar") ?? ""} />}
          {tab === "fiscal" && <Fiscal />}
          {tab === "cheques" && <Cheques />}
          {tab === "documentos" && <Documentos />}
          {tab === "tareas" && <Tareas />}
          {tab === "recurrentes" && <Recurrentes />}
          {tab === "contactos" && <Contactos busquedaInicial={tab === "contactos" ? leerParam("buscar") ?? "" : ""} />}
          {tab === "ajustes" && <Ajustes />}
          {tab === "guia" && <Guia />}
        </Suspense>
      </div>

      {form && (
        <ItemForm
          item={form.item}
          tipoInicial={form.tipo}
          fechaInicial={form.fecha}
          responsables={responsables}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            refrescar();
          }}
        />
      )}
      {detalle != null && !form && !cumplir && (
        <ItemDetalle
          id={detalle}
          permisos={permisos}
          hoy={hoy}
          onClose={() => {
            setDetalle(null);
            const url = new URL(window.location.href);
            if (url.searchParams.has("item")) {
              url.searchParams.delete("item");
              window.history.replaceState(null, "", url.toString());
            }
          }}
          onChanged={refrescar}
          onEdit={(it) => setForm({ item: it })}
          onCumplir={(it) => setCumplir(it)}
        />
      )}
      {cumplir && (
        <CumplirModal
          item={cumplir}
          onClose={() => setCumplir(null)}
          onDone={() => {
            setCumplir(null);
            refrescar();
          }}
        />
      )}
    </AdmContext.Provider>
  );
}
