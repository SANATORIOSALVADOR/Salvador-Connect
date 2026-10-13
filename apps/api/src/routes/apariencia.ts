import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { appSettingsTable, db } from "@salvador/db";
import { requireAuth, requireSuperadmin } from "../lib/auth";

// Apariencia del sistema: logo, nombre, colores, tema y textos del login.
// GET es público (lo necesita la pantalla de login); PUT solo superadmin.

const router: IRouter = Router();

const KEY = "apariencia";
const HEX_RE = /^#[0-9a-f]{6}$/i;
const LOGO_RE = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const MAX_LOGO_CHARS = 400_000; // ≈ 300 KB de imagen

export type Apariencia = {
  nombre: string;
  subtitulo: string;
  logo: string | null;
  colorPrimario: string;
  colorMenu: string;
  temaPorDefecto: "claro" | "oscuro" | "sistema";
  tituloLogin: string;
  mensajeLogin: string;
};

export const APARIENCIA_DEFAULT: Apariencia = {
  nombre: "Sanatorio del Salvador",
  subtitulo: "Sistema interno",
  logo: null,
  colorPrimario: "#208379",
  colorMenu: "#103b4c",
  temaPorDefecto: "claro",
  tituloLogin: "Una forma más serena de trabajar.",
  mensajeLogin: "",
};

function text(value: unknown, max: number, fallback: string): string {
  const s = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return s || fallback;
}

async function leer(): Promise<Apariencia> {
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, KEY)).limit(1);
  return { ...APARIENCIA_DEFAULT, ...((row?.value as Partial<Apariencia>) ?? {}) };
}

router.get("/apariencia", async (_req, res): Promise<void> => {
  try {
    res.setHeader("Cache-Control", "no-cache");
    res.json(await leer());
  } catch (err) {
    // Sin la tabla (falta migración) el sistema igual tiene que poder mostrarse.
    console.error("[apariencia.get]", err);
    res.json(APARIENCIA_DEFAULT);
  }
});

router.put("/apariencia", requireAuth, requireSuperadmin, async (req, res): Promise<void> => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const actual = await leer();
    let logo = actual.logo;
    if (b.logo === null || b.logo === "") logo = null;
    else if (typeof b.logo === "string") {
      if (!LOGO_RE.test(b.logo)) {
        res.status(400).json({ message: "El logo tiene que ser una imagen PNG, JPG, WEBP o SVG." });
        return;
      }
      if (b.logo.length > MAX_LOGO_CHARS) {
        res.status(400).json({ message: "El logo es muy pesado: usá una imagen de hasta 300 KB." });
        return;
      }
      logo = b.logo;
    }
    const tema = String(b.temaPorDefecto ?? actual.temaPorDefecto);
    const nuevo: Apariencia = {
      nombre: text(b.nombre ?? actual.nombre, 60, APARIENCIA_DEFAULT.nombre),
      subtitulo: text(b.subtitulo ?? actual.subtitulo, 60, ""),
      logo,
      colorPrimario: HEX_RE.test(String(b.colorPrimario)) ? String(b.colorPrimario) : actual.colorPrimario,
      colorMenu: HEX_RE.test(String(b.colorMenu)) ? String(b.colorMenu) : actual.colorMenu,
      temaPorDefecto: tema === "oscuro" || tema === "sistema" ? tema : "claro",
      tituloLogin: text(b.tituloLogin ?? actual.tituloLogin, 90, APARIENCIA_DEFAULT.tituloLogin),
      mensajeLogin: text(b.mensajeLogin ?? actual.mensajeLogin, 240, ""),
    };
    await db
      .insert(appSettingsTable)
      .values({ key: KEY, value: nuevo })
      .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: nuevo, updatedAt: new Date() } });
    res.json(nuevo);
  } catch (err) {
    console.error("[apariencia.put]", err);
    res.status(500).json({ message: "No se pudo guardar la apariencia." });
  }
});

export default router;
