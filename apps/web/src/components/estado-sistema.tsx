import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, RefreshCw, Settings } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useApariencia } from "@/pages/shared/apariencia";
import { EVENTO_ESTADO, leerMantenimiento, sistemaResponde, textoHasta, type AvisoMantenimiento, type EstadoSistema } from "@/lib/estado-sistema";

/**
 * Pantalla completa de «sistema no disponible» o «mantenimiento» para quien ya está dentro del sistema.
 * Aparece cuando /api responde caído/mantenimiento (lib/estado-sistema.ts), se reintenta sola y desaparece
 * cuando todo vuelve, sin perder lo que estaba en pantalla.
 * Si se cae la red, permite seguir viendo la última copia de Guardias (la guarda la app instalable).
 */
const SIN_CONEXION = "sc-modo-sin-conexion";

export function EstadoSistemaHost() {
  const qc = useQueryClient();
  const { apariencia } = useApariencia();
  const [estado, setEstado] = useState<EstadoSistema | null>(null);
  const [aviso, setAviso] = useState<AvisoMantenimiento | null>(null);
  const [sinConexion, setSinConexion] = useState(() => {
    try {
      return sessionStorage.getItem(SIN_CONEXION) === "1";
    } catch {
      return false;
    }
  });
  const [quedan, setQuedan] = useState(10);
  const [probando, setProbando] = useState(false);
  const [hayCopia, setHayCopia] = useState(false);
  const estadoRef = useRef(estado);
  estadoRef.current = estado;
  const espera = useRef(10);

  const volvio = useCallback(() => {
    setEstado(null);
    setAviso(null);
    setSinConexion(false);
    espera.current = 10;
    try {
      sessionStorage.removeItem(SIN_CONEXION);
    } catch {}
    void qc.invalidateQueries();
  }, [qc]);

  /** Revisa si ya volvió todo (o si sigue el mantenimiento). */
  const revisar = useCallback(async () => {
    setProbando(true);
    const mant = await leerMantenimiento();
    const ok = await sistemaResponde();
    setProbando(false);
    if (mant) {
      setAviso(mant);
      setEstado("mantenimiento");
      return false;
    }
    if (ok) {
      volvio();
      return true;
    }
    if (estadoRef.current === "mantenimiento") setEstado("caido");
    espera.current = Math.min(espera.current + 5, 30);
    setQuedan(espera.current);
    return false;
  }, [volvio]);

  // Avisos que llegan de cualquier pedido a /api.
  useEffect(() => {
    const on = async (e: Event) => {
      const nuevo = (e as CustomEvent<EstadoSistema>).detail;
      if (estadoRef.current === nuevo) return;
      if (nuevo === "mantenimiento") {
        setAviso(await leerMantenimiento());
        setEstado("mantenimiento");
        return;
      }
      // Un corte de un segundo no amerita pantalla: se confirma con /api/health.
      if (estadoRef.current) return;
      if (await sistemaResponde()) return;
      setQuedan(10);
      espera.current = 10;
      setEstado("caido");
    };
    window.addEventListener(EVENTO_ESTADO, on);
    return () => window.removeEventListener(EVENTO_ESTADO, on);
  }, []);

  // Reintentos automáticos con cuenta regresiva (caído) o cada 15 s (mantenimiento / sin conexión).
  useEffect(() => {
    if (!estado && !sinConexion) return;
    const t = setInterval(() => {
      if (estado === "caido" && !sinConexion) {
        setQuedan((q) => {
          if (q <= 1) {
            void revisar();
            return espera.current;
          }
          return q - 1;
        });
      }
    }, 1000);
    const lento = estado === "mantenimiento" || sinConexion ? setInterval(() => void revisar(), 15000) : undefined;
    return () => {
      clearInterval(t);
      if (lento) clearInterval(lento);
    };
  }, [estado, sinConexion, revisar]);

  // ¿Hay copia guardada de Guardias para mirar sin conexión?
  useEffect(() => {
    if (estado !== "caido" || !("caches" in window)) return;
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith("sc-api-")).map((k) => caches.open(k).then((c) => c.keys()))))
      .then((listas) => setHayCopia(listas.flat().some((r) => new URL(r.url).pathname.startsWith("/api/guardias"))))
      .catch(() => setHayCopia(false));
  }, [estado]);

  function verCopia() {
    try {
      sessionStorage.setItem(SIN_CONEXION, "1");
    } catch {}
    setSinConexion(true);
    window.history.pushState(null, "", "/guardias");
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  // Modo «sin conexión»: barra fina arriba en lugar de la pantalla completa.
  if (sinConexion && estado !== "mantenimiento") {
    return (
      <div role="status" className="estado-barra no-print">
        <AlertTriangle size={16} aria-hidden="true" />
        <span>Sin conexión con el servidor: estás viendo la última copia guardada.</span>
        <button type="button" onClick={() => void revisar()} disabled={probando}>{probando ? "Probando…" : "Reintentar"}</button>
      </div>
    );
  }

  if (!estado) return null;
  const mant = estado === "mantenimiento";
  const hasta = textoHasta(aviso?.hasta);

  return (
    <div className="estado-pantalla no-print" role="alertdialog" aria-modal="true" aria-labelledby="estado-titulo" aria-describedby="estado-texto">
      <div className="estado-caja">
        <div className="estado-marca">
          <span className="estado-logo" aria-hidden="true">
            {apariencia.logo ? <img src={apariencia.logo} alt="" /> : <svg width="24" height="24" viewBox="0 0 180 180"><path d="M74 38h32v36h36v32h-36v36H74v-36H38V74h36z" fill="currentColor" /></svg>}
          </span>
          {apariencia.nombre}
        </div>
        <div className={`estado-icono ${mant ? "es-mant" : "es-caido"}`} aria-hidden="true">
          {mant ? <Settings size={44} /> : <AlertTriangle size={44} />}
        </div>
        <h1 id="estado-titulo">{mant ? "Estamos haciendo mantenimiento" : "El sistema no está disponible en este momento"}</h1>
        <p id="estado-texto">
          {mant ? (
            <>El área de Sistemas está trabajando en el sistema. <strong>No hace falta hacer nada</strong>: esta pantalla se cierra sola cuando termine y lo que tenías abierto sigue ahí.</>
          ) : (
            <>No pudimos conectarnos con el servidor. <strong>No cierres esta pantalla</strong>: vuelve sola apenas el sistema responda, y lo que tenías abierto sigue ahí.</>
          )}
        </p>
        {mant && (aviso?.mensaje || hasta) && (
          <div className="estado-aviso">
            <b>Aviso</b>
            {aviso?.mensaje}
            {aviso?.mensaje && hasta ? " " : ""}
            {hasta && `Vuelve aproximadamente ${hasta}.`.replace(/\.\.$/, ".")}
          </div>
        )}
        {mant ? (
          <div className="estado-barra-progreso" aria-hidden="true"><i /></div>
        ) : (
          <div className="estado-chip" role="status" aria-live="polite">
            <span className="estado-punto" aria-hidden="true" />
            {probando ? "Comprobando…" : `Reintentando en ${quedan} s…`}
          </div>
        )}
        <div className="estado-botones">
          <button type="button" className="estado-btn primario" onClick={() => void revisar()} disabled={probando}>
            <RefreshCw size={16} aria-hidden="true" /> {mant ? "Comprobar ahora" : "Reintentar ahora"}
          </button>
          {!mant && hayCopia && (
            <button type="button" className="estado-btn" onClick={verCopia}>Ver la última copia de Guardias</button>
          )}
        </div>
        <div className="estado-pie">{mant ? "Ante una urgencia" : "Si lleva más de unos minutos"}, comunicate con el <strong>área de Sistemas</strong>.</div>
      </div>
    </div>
  );
}
