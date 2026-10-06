import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import managementRouter from "./management";
import usersRouter from "./users";
import guardiasRouter from "./guardias";
import administracionRouter from "./administracion";
import inventarioRouter from "./inventario";
import instructivosRouter from "./instructivos";
import sectoresRouter from "./sectores";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(managementRouter);
router.use(usersRouter);
router.use(guardiasRouter);
router.use(administracionRouter);
router.use(inventarioRouter);
router.use(instructivosRouter);
router.use(sectoresRouter);

export default router;
