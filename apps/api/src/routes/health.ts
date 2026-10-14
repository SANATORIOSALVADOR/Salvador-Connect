import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@salvador/db";

const router: IRouter = Router();

/** Salud: el API responde y la base de datos contesta (lo usan Docker y las pantallas de estado). */
router.get("/health", async (_req, res) => {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, rechazar) => {
        timer = setTimeout(() => rechazar(new Error("timeout")), 2500);
      }),
    ]);
    res.json({ status: "ok", db: "ok" });
  } catch {
    res.status(503).json({ status: "error", db: "caida", message: "La base de datos no responde." });
  } finally {
    if (timer) clearTimeout(timer);
  }
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
