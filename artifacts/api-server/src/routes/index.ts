import { Router, type IRouter } from "express";
import healthRouter from "./health";
import demoItemsRouter from "./demo-items";
import tapPaymentsRouter from "./tap-payments";

const router: IRouter = Router();

router.use(healthRouter);
router.use(demoItemsRouter);
router.use(tapPaymentsRouter);

export default router;
