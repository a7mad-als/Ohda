import { Router, type IRouter } from "express";
import healthRouter from "./health";
import demoItemsRouter from "./demo-items";

const router: IRouter = Router();

router.use(healthRouter);
router.use(demoItemsRouter);

export default router;
