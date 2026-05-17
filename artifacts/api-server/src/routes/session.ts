import { Router } from "express";
import { whatsapp } from "../lib/whatsapp.js";

const router = Router();

router.get("/session/status", (_req, res) => {
  res.json(whatsapp.getStatus());
});

router.get("/session/qr", (_req, res) => {
  res.json(whatsapp.getQr());
});

router.post("/session/disconnect", async (_req, res) => {
  await whatsapp.disconnect();
  res.json({ success: true, message: "Disconnected" });
});

export default router;
