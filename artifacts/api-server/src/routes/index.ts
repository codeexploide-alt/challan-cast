import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import sessionRouter from "./session.js";
import broadcastRouter from "./broadcast.js";
import uploadRouter from "./upload.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionRouter);
router.use(broadcastRouter);
router.use(uploadRouter);

export default router;
