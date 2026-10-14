import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { EVENTO_ESTADO, leerMantenimiento, sistemaResponde, type EstadoSistema } from "@/lib/estado-sistema";

/**
 * Pantalla completa de «sistema no disponible» o «mantenimiento» para quien ya está dentro del sistema.
 * Muestra las mismas páginas que da el servidor (public/estado/*.html) en un marco encima de lo abierto:
 * ellas se reintentan solas y avisan con postMessage cuando todo volvió (o si piden ver la copia de Guardias).
 */
const SIN_CONEXION = "sc-modo-sin-conexion";

type Mensaje = { sc?: string; evento?: "recuperado" | "ver-copia" };

export function EstadoSistemaHost() {
  const qc = useQueryClient();
  const [estado, setEstado] = useState<EstadoSistema | null>(null);
  const [sinConexion, setSinConexion] = useState(() => {
    try {
      return sessionStorage.getItem(SIN_CONEXION) === "1";
    } catch {
      return false;
    }
  });
  const [hayCopia, setHayCopia] = useState(false);
  const [probando, setProbando] = useState(false);
  const estadoRef = useRef(estado);
  estadoRef.current = estado;
  const marco = useRef<HTMLIFrameElement>(null);

  const volvio = useCallback(() => {
    setEstado(null);
    setSinConexion(false);
    try {
      sessionStorage.removeItem(SIN_CONEXION);
    } catch {}
    void qc.invalidateQueries();
  }, [qc]);

  // Avisos que llegan de cualquier pedido a /api (lib/estado-sistema.ts).
  useEffect(() => {
    const on = async (e: Event) => {
      const nuevo = (e as CustomEvent<EstadoSistema>).detail;
      if (estadoRef.current === nuevo) return;
      if (nuevo === "mantenimiento") {
        setEstado("mantenimiento");
        return;
      }
      if (estadoRef.current) return;
      // Un corte de un segundo no amerita pantalla: se confirma con /api/health.
      if (await sistemaResponde()) return;
      setEstado("caido");
    };
    window.addEventListener(EVENTO_ESTADO, on);
    return () => window.removeEventListener(EVENTO_ESTADO, on);
  }, []);

  // Mensajes de la página de estado (solo del mismo origen).
  useEffect(() => {
    const on = (e: MessageEvent<Mensaje>) => {
      if (e.origin !== window.location.origin || e.data?.sc !== "estado") return;
      if (e.data.evento === "recuperado") volvio();
      if (e.data.evento === "ver-copia") {
        try {
          sessionStorage.setItem(SIN_CONEXION, "1");
        } catch {}
        setSinConexion(true);
        setEstado(null);
        window.history.pushState(null, "", "/guardias");
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, [volvio]);

  // ¿Hay copia guardada de Guardias para mirar sin conexión? (la guarda la app instalable)
  useEffect(() => {
    if (estado !== "caido" || !("caches" in window)) return;
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith("sc-api-")).map((k) => caches.open(k).then((c) => c.keys()))))
      .then((listas) => setHayCopia(listas.flat().some((r) => new URL(r.url).pathname.startsWith("/api/guardias"))))
      .catch(() => setHayCopia(false));
  }, [estado]);

  // Con el marco abierto, el foco va adentro y la página de atrás queda inerte.
  useEffect(() => {
    if (!estado) return;
    const raiz = document.getElementById("root");
    raiz?.setAttribute("inert", "");
    const t = setTimeout(() => marco.current?.focus(), 50);
    return () => {
      clearTimeout(t);
      raiz?.removeAttribute("inert");
    };
  }, [estado]);

  // Modo «sin conexión»: barra fina arriba; se reintenta cada 15 s.
  useEffect(() => {
    if (!sinConexion) return;
    const t = setInterval(async () => {
      if ((await leerMantenimiento()) === null && (await sistemaResponde())) volvio();
    }, 15000);
    return () => clearInterval(t);
  }, [sinConexion, volvio]);

  if (sinConexion && !estado) {
    return (
      <div role="status" className="estado-barra no-print">
        <AlertTriangle size={16} aria-hidden="true" />
        <span>Sin conexión con el servidor: estás viendo la última copia guardada.</span>
        <button
          type="button"
          disabled={probando}
          onClick={async () => {
            setProbando(true);
            const ok = await sistemaResponde();
            setProbando(false);
            if (ok) volvio();
          }}
        >
          {probando ? "Probando…" : "Reintentar"}
        </button>
      </div>
    );
  }

  if (!estado) return null;
  const src = estado === "mantenimiento" ? "/estado/mantenimiento.html?embebido=1" : `/estado/caido.html?embebido=1${hayCopia ? "&copia=1" : ""}`;
  return (
    <iframe
      ref={marco}
      key={src}
      src={src}
      title={estado === "mantenimiento" ? "Mantenimiento del sistema" : "Sistema no disponible"}
      className="estado-marco no-print"
    />
  );
}
