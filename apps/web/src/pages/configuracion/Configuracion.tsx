import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Boxes, Building2, Grid3x3, History, Palette, ShieldCheck, Tags, Users } from "lucide-react";
import { avisar } from "@/components/feedback";
import AparienciaConfig from "../shared/AparienciaConfig";
import type { Etiqueta } from "../guardias/compartido";
import type { SectorConfig } from "../guardias/logic";
import { api, type EstadoModulos, type Perfil, type Persona, type Sector } from "./api";
import { Auditoria } from "./Auditoria";
import { Etiquetas } from "./Etiquetas";
import { Matriz } from "./Matriz";
import { Modulos } from "./Modulos";
import { Perfiles } from "./Perfiles";
import { Personas } from "./Personas";
import { Sectores } from "./Sectores";

// Configuración (solo superadmin), organizada como los paneles de administración de accesos:
//  Accesos (Personas, Perfiles, Matriz) · Estructura (Sectores, Módulos) · Guardias (Etiquetas) · Sistema (Apariencia, Auditoría).

export type Seccion = "personas" | "perfiles" | "matriz" | "sectores" | "modulos" | "etiquetas" | "apariencia" | "auditoria";

/** Todo lo que necesitan las secciones; se carga una vez y se recarga después de cada cambio. */
export type Datos = {
  me: { id: number; role: string };
  personas: Persona[];
  perfiles: Perfil[];
  sectores: Sector[];
  guardiaCfg: SectorConfig[];
  etiquetas: Etiqueta[];
  modulos: EstadoModulos;
};

export type Nav = {
  ir: (s: Seccion, extra?: Record<string, string | number | null>) => void;
  param: (k: string) => string | null;
};

const MENU: { grupo: string; items: { s: Seccion; label: string; icono: typeof Users; cuenta?: (d: Datos) => number }[] }[] = [
  {
    grupo: "Accesos",
    items: [
      { s: "personas", label: "Personas", icono: Users, cuenta: (d) => d.personas.filter((p) => p.active).length },
      { s: "perfiles", label: "Perfiles", icono: ShieldCheck, cuenta: (d) => d.perfiles.length },
      { s: "matriz", label: "Matriz de accesos", icono: Grid3x3 },
    ],
  },
  {
    grupo: "Estructura",
    items: [
      { s: "sectores", label: "Sectores", icono: Building2, cuenta: (d) => d.sectores.filter((s) => s.active).length },
      { s: "modulos", label: "Módulos", icono: Boxes },
    ],
  },
  { grupo: "Guardias Médicas", items: [{ s: "etiquetas", label: "Etiquetas", icono: Tags, cuenta: (d) => d.etiquetas.filter((e) => e.activa).length }] },
  {
    grupo: "Sistema",
    items: [
      { s: "apariencia", label: "Apariencia", icono: Palette },
      { s: "auditoria", label: "Auditoría", icono: History },
    ],
  },
];
const SECCIONES = MENU.flatMap((g) => g.items.map((i) => i.s));
/** Nombres viejos de ?seccion= (enlaces guardados). */
const ALIAS: Record<string, Seccion> = { usuarios: "personas", historial: "auditoria" };

function leerSeccion(): Seccion {
  const q = new URLSearchParams(window.location.search).get("seccion") ?? "";
  const s = (ALIAS[q] ?? q) as Seccion;
  return SECCIONES.includes(s) ? s : "personas";
}

export default function ConfiguracionPage() {
  const [seccion, setSeccion] = useState<Seccion>(leerSeccion);
  const [, setVersion] = useState(0);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [noAutorizado, setNoAutorizado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    try {
      const me = await api<{ id: number; role: string }>("/auth/me");
      if (me.role !== "superadmin") {
        setNoAutorizado(true);
        return;
      }
      const [personas, sectores, perfiles, etiquetas, guardiaCfg, modulos] = await Promise.all([
        api<Persona[]>("/users"),
        api<Sector[]>("/sectores"),
        api<Perfil[]>("/users/perfiles").catch(() => [] as Perfil[]),
        api<Etiqueta[]>("/guardias/etiquetas").catch(() => [] as Etiqueta[]),
        api<SectorConfig[]>("/guardias/config").catch(() => [] as SectorConfig[]),
        api<EstadoModulos>("/modulos").catch(() => ({ desactivados: [], noDesactivables: ["dashboard"] })),
      ]);
      setDatos({ me, personas, sectores, perfiles, etiquetas, guardiaCfg, modulos });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la configuración.");
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  // La sección y lo que está abierto quedan en la dirección (se puede volver atrás y compartir el enlace).
  const nav: Nav = {
    ir: (s, extra = {}) => {
      const p = new URLSearchParams();
      p.set("seccion", s);
      for (const [k, v] of Object.entries(extra)) if (v !== null && v !== undefined && v !== "") p.set(k, String(v));
      window.history.pushState(null, "", `${window.location.pathname}?${p}`);
      setSeccion(s);
      setVersion((v) => v + 1);
    },
    param: (k) => new URLSearchParams(window.location.search).get(k),
  };
  useEffect(() => {
    const atras = () => {
      setSeccion(leerSeccion());
      setVersion((v) => v + 1);
    };
    window.addEventListener("popstate", atras);
    return () => window.removeEventListener("popstate", atras);
  }, []);

  if (noAutorizado)
    return (
      <div className="content-wrap" style={{ padding: "20px 22px" }}>
        <div className="eyebrow">Espacio / Configuración</div>
        <h1 className="page-title">Configuración</h1>
        <div className="card" style={{ padding: 16, borderRadius: 14, marginTop: 16, maxWidth: 520 }}>
          <strong>La configuración la administra el área de Sistemas.</strong>
          <p className="page-subtitle" style={{ marginTop: 6 }}>Si necesitás un acceso o un cambio de permisos, pedíselo al área de Sistemas.</p>
        </div>
      </div>
    );

  let contenido: ReactNode = <div className="skeleton" style={{ height: 320 }} />;
  if (datos) {
    const props = { datos, recargar, nav };
    contenido = {
      personas: <Personas {...props} />,
      perfiles: <Perfiles {...props} />,
      matriz: <Matriz {...props} />,
      sectores: <Sectores {...props} />,
      modulos: <Modulos {...props} />,
      etiquetas: <Etiquetas {...props} />,
      apariencia: <AparienciaConfig onNotice={(t) => avisar(t)} onError={(t) => avisar(t, "error")} />,
      auditoria: <Auditoria {...props} />,
    }[seccion];
  }

  return (
    <div className="content-wrap cfg-page">
      <header className="cfg-top">
        <div className="eyebrow">Espacio / Configuración</div>
        <h1 className="page-title">Configuración</h1>
        <p className="page-subtitle">Quién entra al sistema, qué puede hacer en cada módulo y cómo está organizado el sanatorio.</p>
      </header>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="cfg-layout">
        <nav className="cfg-nav" aria-label="Secciones de Configuración">
          {MENU.map((g) => (
            <div key={g.grupo} className="cfg-nav-grupo">
              <div className="cfg-nav-tit">{g.grupo}</div>
              {g.items.map((i) => (
                <button key={i.s} type="button" className={`cfg-nav-item${seccion === i.s ? " on" : ""}`} aria-current={seccion === i.s ? "page" : undefined} onClick={() => nav.ir(i.s)}>
                  <i.icono size={16} aria-hidden="true" />
                  <span>{i.label}</span>
                  {datos && i.cuenta && <span className="cfg-nav-n">{i.cuenta(datos)}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <main className="cfg-main">{contenido}</main>
      </div>
    </div>
  );
}
