import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import managementRouter from "./management";
import usersRouter from "./users";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(managementRouter);
router.use(usersRouter);

export default router;
