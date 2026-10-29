import { Router, type IRouter } from "express";
import { db, permisosHistorialTable } from "@salvador/db";
import { PERMISSION_MODULES, requireAuth, requireSuperadmin } from "../lib/auth";
import { NO_DESACTIVABLES, guardarDesactivados, modulosDesactivados } from "../lib/modulos";

// Configuración → Módulos: activar o desactivar un módulo para todo el sistema.

const router: IRouter = Router();

const NOMBRE: Record<string, string> = {
  dashboard: "Inicio",
  administracion: "Administración",
  guardias: "Guardias Médicas",
  cancelaciones: "Cancelaciones Médicos",
  inventario: "Inventario",
  instructivos: "Instructivos",
  liquidacion: "Liquidación",
};

router.get("/modulos", requireAuth, async (_req, res): Promise<void> => {
  res.json({ desactivados: [...(await modulosDesactivados())], noDesactivables: NO_DESACTIVABLES });
});

router.put("/modulos/:key", requireAuth, requireSuperadmin, async (req, res): Promise<void> => {
  const key = String(req.params.key);
  if (!PERMISSION_MODULES[key]) {
    res.status(404).json({ message: "Módulo desconocido." });
    return;
  }
  if (NO_DESACTIVABLES.includes(key)) {
    res.status(400).json({ message: "Inicio no se puede desactivar." });
    return;
  }
  if (typeof req.body?.activo !== "boolean") {
    res.status(400).json({ message: "Indicá si el módulo queda activo." });
    return;
  }
  try {
    const actual = await modulosDesactivados();
    const lista = new Set(actual);
    if (req.body.activo) lista.delete(key);
    else lista.add(key);
    const cambio = lista.size !== actual.size;
    const nuevos = await guardarDesactivados([...lista]);
    if (cambio) {
      await db
        .insert(permisosHistorialTable)
        .values({
          actorId: req.authUser!.id,
          actorNombre: req.authUser!.name,
          accion: "modulo",
          userNombre: NOMBRE[key] ?? key,
          detalle: req.body.activo ? `Módulo ${NOMBRE[key] ?? key} activado` : `Módulo ${NOMBRE[key] ?? key} desactivado para todos (salvo superadmin)`,
        })
        .catch((err) => console.error("[modulos.historial]", err));
    }
    res.json({ desactivados: [...nuevos], noDesactivables: NO_DESACTIVABLES });
  } catch (err) {
    console.error("[modulos]", err);
    res.status(500).json({ message: "No se pudo guardar el estado del módulo." });
  }
});

export default router;
