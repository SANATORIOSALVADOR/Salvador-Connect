import { createRoot } from "react-dom/client";
// Tipografías incluidas en el sistema (no dependen de Google ni de internet).
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
