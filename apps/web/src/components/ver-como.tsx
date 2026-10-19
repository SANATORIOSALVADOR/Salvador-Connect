import { useEffect, useState } from "react";
import { Eye } from "lucide-react";

// Franja fija mientras el superadmin está en "Ver como": muestra a quién está viendo y permite volver.
// La API ya trabaja como esa persona y rechaza cualquier cambio (solo lectura).

type VerComo = { id: number; name: string; de: string };

export function VerComoAviso() {
  const [vc, setVc] = useState<VerComo | null>(null);
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => vivo && setVc(d?.verComo ?? null))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  if (!vc) return null;

  const salir = async () => {
    setSaliendo(true);
    await fetch("/api/auth/ver-como", { method: "DELETE", credentials: "include" }).catch(() => undefined);
    window.location.href = "/configuracion";
  };

  return (
    <div className="ver-como" role="status">
      <div className="ver-como-in">
        <Eye size={17} aria-hidden="true" />
        <span>
          Estás viendo el sistema como <strong>{vc.name}</strong>: ves exactamente sus módulos y su información. <em>Solo lectura.</em>
        </span>
        <button type="button" className="btn" onClick={() => void salir()} disabled={saliendo}>
          {saliendo ? "Volviendo…" : `Volver a ${vc.de}`}
        </button>
      </div>
    </div>
  );
}
