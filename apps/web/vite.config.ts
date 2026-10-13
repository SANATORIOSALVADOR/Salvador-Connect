import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "/",
  root: dir,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(dir, "src") },
    dedupe: ["react", "react-dom"],
  },
  // En desarrollo (`pnpm dev:web`) /api va a la API local, como hace nginx en producción.
  server: {
    port: 5173,
    proxy: { "/api": { target: process.env.API_URL || "http://localhost:5000", changeOrigin: false } },
  },
  build: {
    outDir: path.resolve(dir, "dist"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
});
