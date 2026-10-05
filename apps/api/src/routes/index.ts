import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import managementRouter from "./management";
import usersRouter from "./users";
import guardiasRouter from "./guardias";
import administracionRouter from "./administracion";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(managementRouter);
router.use(usersRouter);
router.use(guardiasRouter);
router.use(administracionRouter);

export default router;
