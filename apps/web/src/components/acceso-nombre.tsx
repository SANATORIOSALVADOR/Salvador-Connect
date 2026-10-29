import { useCallback, useEffect, useState } from "react";
import { Download, Monitor, X } from "lucide-react";
import { avisar } from "@/components/feedback";
import { debeOfrecer, generarBat, probarNombre, type AccesoConfig } from "@/lib/acceso";

/**
 * Quien entra por IP desde una PC con Windows:
 *  - si la PC ya tiene el nombre (instalado antes) → en la pantalla de ingreso se lo lleva solo al nombre;
 *    con la sesión abierta, muestra un botón para pasarse;
 *  - si no lo tiene → ofrece descargar el instalador (una sola vez por PC).
 * Los navegadores no permiten instalar nada sin que la persona lo ejecute: por eso es un botón.
 */
const NO_MOSTRAR = "sc-acceso-nombre-no";
const AHORA_NO = "sc-acceso-nombre-ahora-no";

function leer(store: Storage | undefined, k: string) {
  try {
    return store?.getItem(k) ?? null;
  } catch {
    return null;
  }
}
function guardar(store: Storage | undefined, k: string) {
  try {
    store?.setItem(k, "1");
  } catch {}
}

export function AccesoNombre() {
  const [cfg, setCfg] = useState<AccesoConfig | null>(null);
  const [estado, setEstado] = useState<"nada" | "instalar" | "descargado" | "listo">("nada");
  const [probando, setProbando] = useState(false);

  const enIngreso = () => ["/", "/sign-in"].includes(window.location.pathname);
  const irAlNombre = useCallback((c: AccesoConfig) => {
    window.location.replace(`${c.siteUrl}${window.location.pathname}${window.location.search}`);
  }, []);

  useEffect(() => {
    let vivo = true;
    // El formulario del QR lo abren médicos desde el celular: ahí no se ofrece nada.
    if (window.location.pathname.endsWith("/cancelar-agenda")) return;
    fetch("/api/acceso", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then(async (c: AccesoConfig | null) => {
        if (!vivo || !c || !debeOfrecer(c, window.location.hostname, navigator.userAgent)) return;
        setCfg(c);
        if (await probarNombre(c.siteUrl!)) {
          if (!vivo) return;
          if (enIngreso()) irAlNombre(c);
          else setEstado("listo");
          return;
        }
        if (leer(window.localStorage, NO_MOSTRAR) || leer(window.sessionStorage, AHORA_NO)) return;
        if (vivo) setEstado("instalar");
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [irAlNombre]);

  if (!cfg || estado === "nada") return null;

  function descargar() {
    const blob = new Blob([generarBat({ ip: cfg!.ip!, nombre: cfg!.nombre!, siteUrl: cfg!.siteUrl! })], { type: "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "acceso-sanatorio.bat";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    setEstado("descargado");
  }

  async function probar() {
    setProbando(true);
    const ok = await probarNombre(cfg!.siteUrl!);
    setProbando(false);
    if (ok) irAlNombre(cfg!);
    else avisar("Esta PC todavía no encuentra el nombre. Ejecutá el archivo descargado (doble clic → Sí) y volvé a probar.", "info", 8000);
  }

  const cerrar = (siempre: boolean) => {
    guardar(siempre ? window.localStorage : window.sessionStorage, siempre ? NO_MOSTRAR : AHORA_NO);
    setEstado("nada");
  };

  const caja: React.CSSProperties = {
    position: "fixed",
    right: 16,
    bottom: 16,
    zIndex: 70,
    width: "min(420px, calc(100vw - 32px))",
    background: "hsl(var(--card))",
    color: "hsl(var(--foreground))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 14,
    boxShadow: "0 18px 40px rgba(0,0,0,.18)",
    padding: 16,
    fontSize: 13.5,
  };

  if (estado === "listo") {
    return (
      <div role="status" style={caja} className="no-print">
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <Monitor size={20} style={{ color: "hsl(var(--primary))", flex: "0 0 auto", marginTop: 2 }} aria-hidden="true" />
          <div style={{ flex: 1 }}>
            <strong>Esta PC ya puede entrar por nombre.</strong>
            <div style={{ color: "hsl(var(--muted-foreground))", marginTop: 2 }}>Usá <strong>{cfg.nombre}</strong> en lugar de la IP. Vas a tener que ingresar de nuevo una sola vez.</div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button type="button" className="btn btn-primary" style={{ fontSize: 12.5, padding: "6px 12px" }} onClick={() => irAlNombre(cfg)}>Ir a {cfg.nombre}</button>
              <button type="button" className="btn btn-quiet" style={{ fontSize: 12.5, padding: "6px 12px" }} onClick={() => setEstado("nada")}>Ahora no</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div role="dialog" aria-label="Acceso por nombre" style={caja} className="no-print">
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Monitor size={20} style={{ color: "hsl(var(--primary))", flex: "0 0 auto", marginTop: 2 }} aria-hidden="true" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <strong>Entrá con el nombre, sin la IP</strong>
            <button type="button" onClick={() => cerrar(false)} aria-label="Cerrar" style={{ background: "none", border: "none", cursor: "pointer", color: "hsl(var(--muted-foreground))", padding: 0 }}>
              <X size={16} />
            </button>
          </div>
          {estado === "instalar" ? (
            <>
              <div style={{ color: "hsl(var(--muted-foreground))", marginTop: 4, lineHeight: 1.5 }}>
                Instalá el acceso en esta PC (una sola vez): después el sistema se abre con <strong style={{ color: "hsl(var(--foreground))" }}>{cfg.nombre}</strong> y queda un ícono en el escritorio.
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-primary" style={{ fontSize: 12.5, padding: "7px 12px" }} onClick={descargar}>
                  <Download size={15} /> Descargar instalador
                </button>
                <button type="button" className="btn btn-quiet" style={{ fontSize: 12.5, padding: "7px 12px" }} onClick={() => cerrar(true)}>No mostrar más en esta PC</button>
              </div>
            </>
          ) : (
            <>
              <ol style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.55, listStyle: "decimal" }}>
                <li>Abrí el archivo descargado <strong>acceso-sanatorio.bat</strong> (doble clic).</li>
                <li>Si Windows avisa, tocá <strong>Más información → Ejecutar de todas formas</strong>.</li>
                <li>Aceptá el permiso de administrador (<strong>Sí</strong>).</li>
              </ol>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-primary" style={{ fontSize: 12.5, padding: "7px 12px" }} onClick={probar} disabled={probando}>
                  {probando ? "Probando…" : "Ya lo ejecuté: ir al nombre"}
                </button>
                <button type="button" className="btn btn-quiet" style={{ fontSize: 12.5, padding: "7px 12px" }} onClick={descargar}>Descargar de nuevo</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
