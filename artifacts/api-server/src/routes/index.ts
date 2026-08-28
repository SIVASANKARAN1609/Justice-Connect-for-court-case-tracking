import { Router, type IRouter } from "express";
import healthRouter from "./health";
import justiceRouter from "./justice";

const router: IRouter = Router();

router.use(healthRouter);
router.use(justiceRouter);

export default router;
