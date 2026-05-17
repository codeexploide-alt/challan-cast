import { Router } from "express";
import { broadcastManager } from "../lib/broadcast.js";
import { csvStore } from "../lib/csv-store.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APK_DIR = path.resolve(__dirname, "../../uploads/apk");

const router = Router();

router.post("/broadcast/start", async (req, res) => {
  const { challanNumber, violation, amount, csvSessionId } = req.body as {
    challanNumber: string;
    violation: string;
    amount: string;
    csvSessionId: string;
  };

  if (!challanNumber || !violation || !amount || !csvSessionId) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const records = csvStore.get(csvSessionId);
  if (!records || records.length === 0) {
    res.status(404).json({ error: "CSV session not found or empty" });
    return;
  }

  // Find current APK
  let apkPath: string | undefined;
  let apkFilename: string | undefined;
  try {
    const files = fs.readdirSync(APK_DIR);
    if (files.length > 0) {
      const latest = files.sort().pop()!;
      apkPath = path.join(APK_DIR, latest);
      apkFilename = latest;
    }
  } catch {
    // no APK dir yet
  }

  const result = await broadcastManager.start(records, {
    challanNumber,
    violation,
    amount,
    apkPath,
    apkFilename,
  });

  res.json(result);
});

router.post("/broadcast/stop", (_req, res) => {
  broadcastManager.stop();
  res.json({ success: true, message: "Stop signal sent" });
});

router.get("/broadcast/status", (_req, res) => {
  res.json(broadcastManager.getStatus());
});

router.get("/broadcast/history", (_req, res) => {
  res.json(broadcastManager.getHistory());
});

export default router;
