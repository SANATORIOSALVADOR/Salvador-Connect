import { createRoot } from "react-dom/client";
// Tipografías incluidas en el sistema (no dependen de Google ni de internet).
import "@fontsource-variable/inter";
import App from "./App";
import "./index.css";
import { vigilarEstadoSistema } from "./lib/estado-sistema";

// Pantallas de «sistema no disponible» y «mantenimiento» (components/estado-sistema.tsx).
vigilarEstadoSistema();

createRoot(document.getElementById("root")!).render(<App />);

// App instalable (PWA): solo en producción, para no interferir con la recarga en vivo de desarrollo.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
