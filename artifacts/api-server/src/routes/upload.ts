import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { csvStore } from "../lib/csv-store.js";
import { logger } from "../lib/logger.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_DIR = path.resolve(__dirname, "../../uploads/csv");
const APK_DIR = path.resolve(__dirname, "../../uploads/apk");

fs.mkdirSync(CSV_DIR, { recursive: true });
fs.mkdirSync(APK_DIR, { recursive: true });

const csvUpload = multer({ storage: multer.memoryStorage() });
const apkUpload = multer({
  storage: multer.diskStorage({
    destination: APK_DIR,
    filename: (_req, file, cb) => {
      cb(null, `challan_${Date.now()}_${file.originalname}`);
    },
  }),
});

const router = Router();

// State for current APK info
let currentApk: { filename: string; url: string; uploadedAt: string } | null = null;

/**
 * Detect CSV delimiter by sampling the first line.
 * Tries comma, semicolon, tab, pipe in order and picks whichever splits the most columns.
 */
function detectDelimiter(content: string): string {
  const firstLine = content.split("\n")[0] ?? "";
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = 0;
  for (const d of candidates) {
    const count = firstLine.split(d).length;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

/**
 * Strip UTF-8 BOM (EF BB BF) that Excel/Windows often adds to CSV files.
 */
function stripBom(text: string): string {
  return text.startsWith("\uFEFF") ? text.slice(1) : text;
}

/**
 * Find the column in a row that most likely represents the vehicle number.
 * Returns the ORIGINAL (un-lowercased) key.
 */
function findVehicleKey(row: Record<string, string>): string | undefined {
  const VEHICLE_PATTERNS = [
    "vehicle_no", "vehicleno", "vehicle no", "veh_no", "vehno",
    "reg_no", "regno", "reg no", "registration",
    "car_no", "carno", "number_plate", "plate",
    "vehicle",
  ];
  const original = Object.keys(row);
  const lower = original.map((k) => k.toLowerCase().replace(/[\s_\-\.]+/g, ""));

  // Exact match first
  for (const pat of VEHICLE_PATTERNS) {
    const norm = pat.replace(/[\s_\-\.]+/g, "");
    const idx = lower.indexOf(norm);
    if (idx !== -1) return original[idx];
  }

  // Partial match
  const idx = lower.findIndex((k) => k.includes("vehicle") || k.includes("car") || k.includes("reg") || k.includes("plate"));
  return idx !== -1 ? original[idx] : undefined;
}

/**
 * Find the column that most likely represents the mobile/phone number.
 */
function findMobileKey(row: Record<string, string>): string | undefined {
  const MOBILE_PATTERNS = [
    "mobile_no", "mobileno", "mobile no", "mob_no", "mobno",
    "phone_no", "phoneno", "phone no",
    "contact_no", "contactno", "contact",
    "mobile", "phone", "mob", "cell",
    "whatsapp", "number",
  ];
  const original = Object.keys(row);
  const lower = original.map((k) => k.toLowerCase().replace(/[\s_\-\.]+/g, ""));

  for (const pat of MOBILE_PATTERNS) {
    const norm = pat.replace(/[\s_\-\.]+/g, "");
    const idx = lower.indexOf(norm);
    if (idx !== -1) return original[idx];
  }

  const idx = lower.findIndex((k) =>
    k.includes("mobile") || k.includes("phone") || k.includes("mob") || k.includes("cell") || k.includes("whatsapp")
  );
  return idx !== -1 ? original[idx] : undefined;
}

/**
 * Normalize a mobile number: strip spaces, dashes, dots, parentheses, leading +91/0.
 * Returns the last 10 digits as a string, or empty string if invalid.
 */
function normalizeMobile(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  // Remove leading country code for India (+91) or leading 0
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  return digits.length >= 10 ? digits.slice(-10) : "";
}

router.post("/upload/csv", csvUpload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  try {
    const rawContent = req.file.buffer.toString("utf-8");
    const content = stripBom(rawContent);
    const delimiter = detectDelimiter(content);

    const rows = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter,
      relax_column_count: true,
      bom: true,
    }) as Record<string, string>[];

    if (rows.length === 0) {
      res.status(400).json({ error: "CSV file is empty or has no data rows" });
      return;
    }

    // Detect column keys from the first non-empty row
    const sampleRow = rows[0];
    const vehicleKey = findVehicleKey(sampleRow);
    const mobileKey = findMobileKey(sampleRow);

    if (!vehicleKey) {
      const cols = Object.keys(sampleRow).join(", ");
      res.status(400).json({
        error: `Could not find a vehicle number column. Columns found: ${cols}. Expected a column with a name like "vehicle_no", "reg_no", "car_no", etc.`,
      });
      return;
    }

    if (!mobileKey) {
      const cols = Object.keys(sampleRow).join(", ");
      res.status(400).json({
        error: `Could not find a mobile number column. Columns found: ${cols}. Expected a column with a name like "mobile", "phone", "mob", etc.`,
      });
      return;
    }

    const records = rows
      .map((row) => ({
        vehicleNo: (row[vehicleKey] ?? "").trim().toUpperCase(),
        mobile: normalizeMobile(row[mobileKey] ?? ""),
      }))
      .filter((r) => r.vehicleNo && r.mobile);

    if (records.length === 0) {
      res.status(400).json({ error: "No valid records found after parsing. Check that vehicle numbers and mobile numbers are filled in." });
      return;
    }

    const sessionId = uuidv4();
    csvStore.save(sessionId, records);

    logger.info({ sessionId, total: records.length, vehicleKey, mobileKey, delimiter }, "CSV uploaded");

    res.json({
      sessionId,
      total: records.length,
      preview: records.slice(0, 5),
    });
  } catch (err) {
    logger.error({ err }, "CSV parse error");
    res.status(400).json({ error: "Failed to parse CSV file. Make sure it is a valid CSV." });
  }
});

router.post("/upload/apk", apkUpload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  // Remove old APK files
  try {
    const files = fs.readdirSync(APK_DIR);
    files.forEach((f) => {
      if (f !== req.file!.filename) {
        fs.unlinkSync(path.join(APK_DIR, f));
      }
    });
  } catch {
    // ignore
  }

  currentApk = {
    filename: req.file.originalname,
    url: `/api/upload/apk/file/${req.file.filename}`,
    uploadedAt: new Date().toISOString(),
  };

  logger.info({ filename: req.file.originalname }, "APK uploaded");

  res.json(currentApk);
});

router.get("/upload/apk/current", (_req, res) => {
  if (!currentApk) {
    res.json({ filename: null, url: null, uploadedAt: null });
    return;
  }
  res.json(currentApk);
});

router.get("/upload/apk/file/:filename", (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(APK_DIR, filename);
  if (!fs.existsSync(filepath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  res.download(filepath);
});

export default router;
