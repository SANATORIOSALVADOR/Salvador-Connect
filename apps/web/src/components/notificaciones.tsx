import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useLocation } from "wouter";

// Campanita: vencimientos, huecos de guardia de la semana y cambios recientes en mis sectores.
// Lo leído se recuerda en este navegador (por usuario).

type Notificacion = {
  id: string;
  modulo: "administracion" | "guardias" | "inventario" | "sistema";
  nivel: "alta" | "media" | "info";
  titulo: string;
  detalle: string;
  fecha: string;
  link: string;
};

// Colores de estado (reservados) + etiqueta de texto: el color nunca va solo.
const NIVEL: Record<Notificacion["nivel"], { color: string; etiqueta: string }> = {
  alta: { color: "#d03b3b", etiqueta: "Urgente" },
  media: { color: "#ec835a", etiqueta: "Atención" },
  info: { color: "#2a78d6", etiqueta: "Info" },
};
const MODULO: Record<Notificacion["modulo"], string> = { administracion: "Administración", guardias: "Guardias", sistema: "Sistemas", inventario: "Inventario" };
const REFRESCO_MS = 2 * 60_000;

function leerLeidas(clave: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(clave) || "[]"));
  } catch {
    return new Set();
  }
}

export function Notificaciones({ usuario }: { usuario?: string }) {
  const clave = `sc-notif-leidas-${usuario || "anon"}`;
  const [items, setItems] = useState<Notificacion[]>([]);
  const [leidas, setLeidas] = useState<Set<string>>(() => leerLeidas(clave));
  const [abierto, setAbierto] = useState(false);
  const [, setLocation] = useLocation();
  const raiz = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/notificaciones", { credentials: "include" });
      if (r.ok) setItems(await r.json());
    } catch {
      /* sin conexión: se reintenta en el próximo ciclo */
    }
  }, []);

  useEffect(() => {
    void cargar();
    const t = window.setInterval(() => void cargar(), REFRESCO_MS);
    const foco = () => void cargar();
    window.addEventListener("focus", foco);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", foco);
    };
  }, [cargar]);

  useEffect(() => setLeidas(leerLeidas(clave)), [clave]);

  // Cerrar al hacer clic afuera o con Esc.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => !raiz.current?.contains(e.target as Node) && setAbierto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  function guardar(ids: Set<string>) {
    // Solo se guardan ids que siguen existiendo, para que la lista no crezca sin fin.
    const vigentes = new Set([...ids].filter((id) => items.some((n) => n.id === id)));
    setLeidas(vigentes);
    try {
      localStorage.setItem(clave, JSON.stringify([...vigentes]));
    } catch {
      /* sin almacenamiento */
    }
  }

  const noLeidas = items.filter((n) => !leidas.has(n.id));
  const urgentes = noLeidas.filter((n) => n.nivel === "alta").length;

  return (
    <div ref={raiz} style={{ position: "relative" }}>
      <button
        type="button"
        className="btn btn-quiet btn-icon"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label={noLeidas.length ? `Notificaciones: ${noLeidas.length} sin leer` : "Notificaciones"}
        title="Notificaciones"
        data-testid="button-notificaciones"
        style={{ width: 34, height: 34, position: "relative" }}
      >
        <Bell size={16} />
        {noLeidas.length > 0 && (
          <span style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, fontSize: 10, fontWeight: 700, lineHeight: "18px", textAlign: "center", color: "#fff", background: urgentes ? "#d03b3b" : "#2a78d6" }}>
            {noLeidas.length > 99 ? "99+" : noLeidas.length}
          </span>
        )}
      </button>

      {abierto && (
        <div role="dialog" aria-label="Notificaciones" className="card" style={{ position: "absolute", right: 0, top: 42, zIndex: 120, width: "min(380px, calc(100vw - 24px))", maxHeight: "70vh", overflowY: "auto", padding: 0, borderRadius: 14, boxShadow: "0 18px 50px rgba(15,23,42,.25)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid hsl(var(--border))", position: "sticky", top: 0, background: "hsl(var(--card))" }}>
            <strong style={{ fontSize: 14 }}>Notificaciones</strong>
            {noLeidas.length > 0 && (
              <button type="button" className="btn btn-quiet" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => guardar(new Set(items.map((n) => n.id)))}>
                Marcar todo como leído
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div style={{ padding: 20, fontSize: 13, color: "hsl(var(--muted-foreground))" }}>No hay novedades. Todo al día.</div>
          ) : (
            items.map((n) => {
              const leida = leidas.has(n.id);
              const nv = NIVEL[n.nivel];
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    guardar(new Set([...leidas, n.id]));
                    setAbierto(false);
                    setLocation(n.link);
                  }}
                  style={{ display: "flex", gap: 10, width: "100%", textAlign: "left", padding: "10px 14px", border: "none", borderBottom: "1px solid hsl(var(--border) / .6)", background: leida ? "transparent" : "hsl(var(--primary) / .06)", color: "inherit", font: "inherit", cursor: "pointer" }}
                >
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, marginTop: 6, flex: "0 0 auto", background: leida ? "transparent" : nv.color, border: `2px solid ${nv.color}` }} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "hsl(var(--muted-foreground))" }}>{nv.etiqueta} · {MODULO[n.modulo]}</span>
                    </span>
                    <span style={{ display: "block", fontSize: 13, fontWeight: leida ? 600 : 800, marginTop: 2 }}>{n.titulo}</span>
                    <span style={{ display: "block", fontSize: 12, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>{n.detalle}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
