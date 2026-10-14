import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

/**
 * Dirección por nombre del sistema (pública: la usa la pantalla de ingreso para ofrecer el acceso por nombre).
 * SITE_URL y SERVER_IP salen del .env (scripts/configurar-nombre.sh / configurar-nginx-host.sh).
 */
router.get("/acceso", (_req, res) => {
  const raw = (process.env.SITE_URL || "").trim().replace(/\/+$/, "");
  let siteUrl: string | null = null;
  let nombre: string | null = null;
  try {
    if (raw) {
      const u = new URL(raw);
      if (u.protocol === "http:" || u.protocol === "https:") {
        siteUrl = u.origin;
        nombre = u.hostname;
      }
    }
  } catch {
    siteUrl = null;
  }
  const ip = (process.env.SERVER_IP || "").trim();
  res.json({ siteUrl, nombre, ip: /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip : null });
});

export default router;
