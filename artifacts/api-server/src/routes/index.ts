import { Router, type IRouter } from "express";
import healthRouter from "./health";
import aiRouter from "./ai";
import visitorsRouter from "./visitors";

const router: IRouter = Router();

router.use(healthRouter);
router.use(visitorsRouter);
router.use(aiRouter);

export default router;
