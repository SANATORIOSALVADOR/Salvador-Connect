import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useLocation } from "wouter";
import { guardarTema, temaEfectivo } from "@/pages/shared/apariencia";

// Búsqueda global: Ctrl + K (o ⌘ K). Pantallas, acciones rápidas y datos (profesionales,
// vencimientos, usuarios, sectores). Todo con teclado: ↑ ↓ para moverse, Enter para abrir, Esc para cerrar.

type Item = { grupo: string; titulo: string; detalle?: string; accion: () => void; clave: string };
type Resultado = { tipo: "profesional" | "vencimiento" | "contacto" | "usuario" | "sector" | "equipo"; titulo: string; detalle: string; link: string };

const GRUPO_DATO: Record<Resultado["tipo"], string> = { profesional: "Profesionales", vencimiento: "Vencimientos", contacto: "Contactos", usuario: "Usuarios", sector: "Sectores", equipo: "Equipos (inventario)" };

function normal(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function Buscador({ pantallas, esSuperadmin }: { pantallas: { href: string; label: string }[]; esSuperadmin: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [datos, setDatos] = useState<Resultado[]>([]);
  const [sel, setSel] = useState(0);
  const [, setLocation] = useLocation();
  const input = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLDivElement>(null);

  // Atajo global.
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAbierto((v) => !v);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  useEffect(() => {
    if (abierto) {
      setQ("");
      setDatos([]);
      setSel(0);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [abierto]);

  // Datos del servidor, con una pequeña espera para no buscar en cada tecla.
  useEffect(() => {
    if (!abierto || q.trim().length < 2) {
      setDatos([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/buscar?q=${encodeURIComponent(q.trim())}`, { credentials: "include", signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then(setDatos)
        .catch(() => undefined);
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, abierto]);

  const ir = (link: string) => () => {
    setAbierto(false);
    setLocation(link);
  };

  const items = useMemo<Item[]>(() => {
    const k = normal(q.trim());
    const fijas: Item[] = [
      ...pantallas.map((p) => ({ grupo: "Pantallas", titulo: p.label, accion: ir(p.href), clave: `p${p.href}` })),
      { grupo: "Pantallas", titulo: "Mi perfil", accion: ir("/perfil"), clave: "p/perfil" },
      ...(esSuperadmin ? [{ grupo: "Pantallas", titulo: "Configuración", accion: ir("/configuracion"), clave: "p/configuracion" }] : []),
      { grupo: "Acciones", titulo: "Cargar una guardia", detalle: "Guardias → Carga nueva", accion: ir("/guardias?nueva=1"), clave: "a-guardia" },
      { grupo: "Acciones", titulo: "Nuevo vencimiento", detalle: "Administración → Nuevo", accion: ir("/administracion?nuevo=1"), clave: "a-venc" },
      {
        grupo: "Acciones",
        titulo: temaEfectivo() === "oscuro" ? "Pasar a modo claro" : "Pasar a modo oscuro",
        accion: () => {
          guardarTema(temaEfectivo() === "oscuro" ? "claro" : "oscuro");
          setAbierto(false);
        },
        clave: "a-tema",
      },
    ];
    const filtradas = k ? fijas.filter((i) => normal(`${i.titulo} ${i.detalle ?? ""}`).includes(k)) : fijas;
    return [...filtradas, ...datos.map((d, n) => ({ grupo: GRUPO_DATO[d.tipo], titulo: d.titulo, detalle: d.detalle, accion: ir(d.link), clave: `d${n}${d.link}` }))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, datos, pantallas, esSuperadmin]);

  useEffect(() => setSel(0), [q, datos]);
  useEffect(() => {
    lista.current?.querySelector(`[data-idx="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  function teclas(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(items.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[sel]?.accion();
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  }

  const esMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);

  return (
    <>
      <button type="button" className="btn btn-quiet" onClick={() => setAbierto(true)} aria-label="Buscar (Ctrl + K)" data-testid="button-buscar" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, padding: "6px 10px", color: "hsl(var(--muted-foreground))" }}>
        <Search size={14} />
        <span className="buscar-texto">Buscar</span>
        <kbd className="buscar-texto" style={{ fontSize: 10, padding: "1px 5px", borderRadius: 5, border: "1px solid hsl(var(--border))", fontFamily: "var(--app-font-mono)" }}>{esMac ? "⌘K" : "Ctrl K"}</kbd>
      </button>

      {abierto && (
        <div role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setAbierto(false)} style={{ position: "fixed", inset: 0, zIndex: 190, background: "rgba(15,23,42,.45)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "10vh 16px 16px" }}>
          <div role="dialog" aria-modal="true" aria-label="Buscar en el sistema" className="card" style={{ width: "min(620px, 100%)", borderRadius: 16, overflow: "hidden", boxShadow: "0 24px 70px rgba(15,23,42,.35)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid hsl(var(--border))" }}>
              <Search size={18} aria-hidden="true" />
              <input
                ref={input}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={teclas}
                placeholder="Buscar pantallas, profesionales, vencimientos…"
                aria-label="Buscar"
                aria-controls="buscador-resultados"
                aria-activedescendant={items[sel] ? `buscador-${sel}` : undefined}
                role="combobox"
                aria-expanded="true"
                style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 15, color: "inherit", font: "inherit" }}
              />
              <kbd style={{ fontSize: 10, padding: "1px 5px", borderRadius: 5, border: "1px solid hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>Esc</kbd>
            </div>
            <div ref={lista} id="buscador-resultados" role="listbox" style={{ maxHeight: "55vh", overflowY: "auto", padding: 6 }}>
              {items.length === 0 ? (
                <div style={{ padding: 18, fontSize: 13, color: "hsl(var(--muted-foreground))" }}>{q.trim().length < 2 ? "Escribí al menos 2 letras." : "Sin resultados."}</div>
              ) : (
                items.map((it, i) => (
                  <div key={it.clave}>
                    {(i === 0 || items[i - 1].grupo !== it.grupo) && (
                      <div style={{ padding: "8px 10px 4px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "hsl(var(--muted-foreground))" }}>{it.grupo}</div>
                    )}
                    <div
                      id={`buscador-${i}`}
                      data-idx={i}
                      role="option"
                      aria-selected={i === sel}
                      onMouseEnter={() => setSel(i)}
                      onClick={it.accion}
                      style={{ padding: "8px 10px", borderRadius: 10, cursor: "pointer", background: i === sel ? "hsl(var(--primary) / .12)" : "transparent", display: "flex", justifyContent: "space-between", gap: 10 }}
                    >
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{it.titulo}</span>
                      {it.detalle && <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", textAlign: "right" }}>{it.detalle}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div style={{ display: "flex", gap: 14, padding: "8px 14px", borderTop: "1px solid hsl(var(--border))", fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
              <span>↑ ↓ moverse</span>
              <span>Enter abrir</span>
              <span>Esc cerrar</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
