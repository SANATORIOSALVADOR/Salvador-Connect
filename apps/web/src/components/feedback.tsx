import { useEffect, useRef, useState } from "react";

// Diálogo de confirmación y avisos flotantes con el estilo del sistema
// (reemplazan a window.confirm / alert). Se usan desde cualquier pantalla:
//   if (!(await confirmar({ titulo: "¿Eliminar?", accion: "Eliminar", peligro: true }))) return;
//   avisar("Guardado.");

type ConfirmOpts = {
  titulo: string;
  mensaje?: string;
  /** Texto del botón de confirmar (por defecto "Aceptar"). */
  accion?: string;
  /** Botón rojo para acciones que borran o no se pueden deshacer. */
  peligro?: boolean;
};

type Aviso = { id: number; texto: string; tipo: "ok" | "error" | "info"; ms: number };

let abrirConfirm: ((o: ConfirmOpts, resolve: (v: boolean) => void) => void) | null = null;
let agregarAviso: ((a: Omit<Aviso, "id">) => void) | null = null;

export function confirmar(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    if (abrirConfirm) abrirConfirm(opts, resolve);
    else resolve(window.confirm(opts.mensaje ? `${opts.titulo}\n\n${opts.mensaje}` : opts.titulo));
  });
}

export function avisar(texto: string, tipo: Aviso["tipo"] = "ok", ms = 5000) {
  agregarAviso?.({ texto, tipo, ms });
}

const AVISO_COLORES: Record<Aviso["tipo"], { bg: string; fg: string; borde: string }> = {
  ok: { bg: "#dcfce7", fg: "#14532d", borde: "#16a34a" },
  error: { bg: "#fee2e2", fg: "#7f1d1d", borde: "#dc2626" },
  info: { bg: "#e0f2fe", fg: "#0c4a6e", borde: "#0284c7" },
};

/** Se monta una sola vez en App. */
export function FeedbackHost() {
  const [pedido, setPedido] = useState<{ opts: ConfirmOpts; resolve: (v: boolean) => void } | null>(null);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const btnRef = useRef<HTMLButtonElement>(null);
  const previo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let seq = 0;
    abrirConfirm = (opts, resolve) => {
      previo.current = document.activeElement as HTMLElement | null;
      setPedido({ opts, resolve });
    };
    agregarAviso = (a) => {
      const id = ++seq;
      setAvisos((list) => [...list.slice(-3), { ...a, id }]);
      window.setTimeout(() => setAvisos((list) => list.filter((x) => x.id !== id)), a.ms);
    };
    return () => {
      abrirConfirm = null;
      agregarAviso = null;
    };
  }, []);

  useEffect(() => {
    if (pedido) btnRef.current?.focus();
  }, [pedido]);

  function cerrar(valor: boolean) {
    pedido?.resolve(valor);
    setPedido(null);
    previo.current?.focus?.();
  }

  return (
    <>
      {pedido && (
        <div
          role="presentation"
          onMouseDown={(e) => e.target === e.currentTarget && cerrar(false)}
          onKeyDown={(e) => e.key === "Escape" && cerrar(false)}
          style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(15,23,42,.45)", display: "grid", placeItems: "center", padding: 16 }}
        >
          <div role="alertdialog" aria-modal="true" aria-labelledby="sc-confirm-titulo" aria-describedby="sc-confirm-msg" className="card" style={{ width: "min(420px, 100%)", padding: 22, borderRadius: 16, boxShadow: "0 24px 60px rgba(15,23,42,.3)" }}>
            <h2 id="sc-confirm-titulo" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{pedido.opts.titulo}</h2>
            {pedido.opts.mensaje && <p id="sc-confirm-msg" className="page-subtitle" style={{ marginTop: 8 }}>{pedido.opts.mensaje}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button type="button" className="btn btn-quiet" onClick={() => cerrar(false)}>Cancelar</button>
              <button
                ref={btnRef}
                type="button"
                className="btn btn-primary"
                onClick={() => cerrar(true)}
                style={pedido.opts.peligro ? { background: "#dc2626", borderColor: "#dc2626", color: "#fff" } : undefined}
              >
                {pedido.opts.accion || "Aceptar"}
              </button>
            </div>
          </div>
        </div>
      )}
      <div aria-live="polite" style={{ position: "fixed", right: 16, bottom: 16, zIndex: 210, display: "flex", flexDirection: "column", gap: 8, maxWidth: "min(420px, calc(100vw - 32px))" }}>
        {avisos.map((a) => {
          const c = AVISO_COLORES[a.tipo];
          return (
            <div key={a.id} role={a.tipo === "error" ? "alert" : "status"} style={{ padding: "10px 14px", borderRadius: 12, background: c.bg, color: c.fg, borderLeft: `4px solid ${c.borde}`, boxShadow: "0 10px 30px rgba(15,23,42,.18)", fontSize: 13, fontWeight: 600, display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ flex: 1 }}>{a.texto}</span>
              <button type="button" aria-label="Cerrar aviso" onClick={() => setAvisos((l) => l.filter((x) => x.id !== a.id))} style={{ border: "none", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
            </div>
          );
        })}
      </div>
    </>
  );
}
