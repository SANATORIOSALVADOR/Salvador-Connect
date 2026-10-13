import { useApariencia } from "@/pages/shared/apariencia";

/**
 * Encabezado y pie que solo aparecen al imprimir (logo, nombre del sistema, fecha y quién imprimió).
 * Se monta una vez en el Shell; el estilo está en index.css (@media print).
 */
export function PrintHeader({ usuario }: { usuario?: string }) {
  const { apariencia } = useApariencia();
  const ahora = new Date().toLocaleString("es-AR", { dateStyle: "long", timeStyle: "short" });
  return (
    <>
      <div className="print-only print-header" aria-hidden="true">
        {apariencia.logo && <img src={apariencia.logo} alt="" />}
        <div>
          <div className="print-nombre">{apariencia.nombre}</div>
          {apariencia.subtitulo && <div className="print-sub">{apariencia.subtitulo}</div>}
        </div>
        <div className="print-meta">
          Impreso el {ahora}
          {usuario ? <><br />por {usuario}</> : null}
        </div>
      </div>
      <div className="print-only print-footer" aria-hidden="true">
        {apariencia.nombre} · Documento interno
      </div>
    </>
  );
}

/** Imprime la página actual (el CSS de impresión oculta menú, botones y filtros). */
export function imprimir() {
  window.print();
}
