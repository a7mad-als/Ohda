import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tapPaymentsRouter from "./tap-payments";
import stripePaymentsRouter from "./stripe-payments";
import supabaseConfigRouter from "./supabase-config";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tapPaymentsRouter);
router.use(stripePaymentsRouter);
router.use(supabaseConfigRouter);

export default router;
