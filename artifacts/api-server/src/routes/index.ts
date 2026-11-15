import { Router, type IRouter } from "express";
import healthRouter from "./health";
import demoItemsRouter from "./demo-items";
import tapPaymentsRouter from "./tap-payments";
import stripePaymentsRouter from "./stripe-payments";

const router: IRouter = Router();

router.use(healthRouter);
router.use(demoItemsRouter);
router.use(tapPaymentsRouter);
router.use(stripePaymentsRouter);

export default router;
