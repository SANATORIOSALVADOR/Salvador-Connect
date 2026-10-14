import { Router, type IRouter } from "express";
import healthRouter from "./health";
import aparienciaRouter from "./apariencia";
import notificacionesRouter from "./notificaciones";
import buscarRouter from "./buscar";
import authRouter from "./auth";
import managementRouter from "./management";
import usersRouter from "./users";
import guardiasRouter from "./guardias";
import administracionRouter from "./administracion";
import inicioRouter from "./inicio";
import inventarioRouter from "./inventario";
import instructivosRouter from "./instructivos";
import sectoresRouter from "./sectores";

const router: IRouter = Router();

router.use(healthRouter);
router.use(aparienciaRouter);
router.use(notificacionesRouter);
router.use(buscarRouter);
router.use(authRouter);
router.use(managementRouter);
router.use(usersRouter);
router.use(guardiasRouter);
router.use(administracionRouter);
router.use(inicioRouter);
router.use(inventarioRouter);
router.use(instructivosRouter);
router.use(sectoresRouter);

export default router;
