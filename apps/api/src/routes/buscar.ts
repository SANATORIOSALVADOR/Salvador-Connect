import { Router, type IRouter } from "express";
import { asc, desc, eq } from "drizzle-orm";
import { admContactosTable, admItemsTable, db, profesionalesTable, sectorsTable, usersTable } from "@salvador/db";
import { hasModule, requireAuth } from "../lib/auth";

// Búsqueda global (Ctrl + K): profesionales, vencimientos, usuarios y sectores según los permisos.

const router: IRouter = Router();

/** Sin tildes ni mayúsculas, para que "perez" encuentre "Pérez". */
function clave(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

type Resultado = { tipo: "profesional" | "vencimiento" | "contacto" | "usuario" | "sector"; titulo: string; detalle: string; link: string };

router.get("/buscar", requireAuth, async (req, res): Promise<void> => {
  const q = clave(String(req.query.q ?? "").trim()).slice(0, 60);
  if (q.length < 2) {
    res.json([]);
    return;
  }
  const user = req.authUser!;
  const coincide = (...campos: (string | null | undefined)[]) => campos.some((c) => clave(c ?? "").includes(q));
  const out: Resultado[] = [];
  try {
    if (hasModule(user, "guardias")) {
      const profs = await db.select().from(profesionalesTable).orderBy(asc(profesionalesTable.name));
      for (const p of profs.filter((p) => coincide(p.name, p.matricula, p.especialidad)).slice(0, 6)) {
        out.push({
          tipo: "profesional",
          titulo: p.name,
          detalle: [p.especialidad, p.matricula, p.active ? "" : "inactivo"].filter(Boolean).join(" · ") || "Profesional de guardia",
          link: `/guardias?buscar=${encodeURIComponent(p.name)}`,
        });
      }
    }
    if (hasModule(user, "administracion")) {
      const items = await db.select().from(admItemsTable).orderBy(desc(admItemsTable.fecha)).limit(3000);
      for (const it of items.filter((i) => coincide(i.titulo, i.responsable, i.descripcion, i.comprobante)).slice(0, 6)) {
        const [y, m, d] = it.fecha.split("-");
        out.push({ tipo: "vencimiento", titulo: it.titulo, detalle: `${d}/${m}/${y} · ${it.estado}`, link: `/administracion?item=${it.id}` });
      }
      const contactos = await db.select().from(admContactosTable).limit(1000);
      for (const c of contactos.filter((x) => coincide(x.nombre, x.rubro, x.persona, x.cuit)).slice(0, 4)) {
        out.push({ tipo: "contacto", titulo: c.nombre, detalle: [c.rubro, c.telefono].filter(Boolean).join(" · ") || "Contacto", link: `/administracion?tab=contactos&buscar=${encodeURIComponent(c.nombre)}` });
      }
    }
    if (user.role === "superadmin") {
      const users = await db.select().from(usersTable).orderBy(asc(usersTable.name));
      for (const u of users.filter((u) => coincide(u.name, u.username, u.email)).slice(0, 5)) {
        out.push({ tipo: "usuario", titulo: u.name, detalle: `@${u.username}${u.active ? "" : " · inactivo"}`, link: "/configuracion" });
      }
    }
    const sectores = await db.select().from(sectorsTable).where(eq(sectorsTable.active, true));
    for (const s of sectores.filter((s) => coincide(s.name, s.shortName)).slice(0, 4)) {
      out.push({ tipo: "sector", titulo: s.name, detalle: s.shortName, link: hasModule(user, "guardias") ? `/guardias?sector=${s.id}` : "/dashboard" });
    }
    res.json(out);
  } catch (err) {
    console.error("[buscar]", err);
    res.status(500).json({ message: "No se pudo buscar." });
  }
});

export default router;
