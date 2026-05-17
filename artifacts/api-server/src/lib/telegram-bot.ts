import TelegramBot from "node-telegram-bot-api";
import { whatsapp } from "./whatsapp.js";
import { broadcastManager } from "./broadcast.js";
import { csvStore } from "./csv-store.js";
import { logger } from "./logger.js";
import { parse } from "csv-parse/sync";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import https from "https";
import http from "http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APK_DIR = path.resolve(__dirname, "../../uploads/apk");

fs.mkdirSync(APK_DIR, { recursive: true });

interface BotSession {
  state:
    | "idle"
    | "awaiting_csv"
    | "awaiting_apk"
    | "awaiting_challan_no"
    | "awaiting_violation"
    | "awaiting_amount"
    | "ready_to_broadcast";
  csvSessionId?: string;
  csvTotal?: number;
  challanNumber?: string;
  violation?: string;
  amount?: string;
  apkFilename?: string;
}

const sessions = new Map<number, BotSession>();

function getSession(chatId: number): BotSession {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, { state: "idle" });
  }
  return sessions.get(chatId)!;
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith("https") ? https : http;
    protocol.get(url, (res) => {
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
    }).on("error", (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

export function startTelegramBot(token: string) {
  const bot = new TelegramBot(token, { polling: true });

  const send = (chatId: number, text: string, opts?: object) =>
    bot.sendMessage(chatId, text, { parse_mode: "Markdown", ...opts });

  // Forward WhatsApp status events to admin chats
  whatsapp.on("qr", async (dataUrl: string) => {
    // Convert data URL to buffer
    const base64 = dataUrl.split(",")[1];
    if (!base64) return;
    const buf = Buffer.from(base64, "base64");
    for (const [chatId] of sessions) {
      try {
        await bot.sendPhoto(chatId, buf, { caption: "📱 Scan this QR code to connect WhatsApp" });
      } catch {
        // ignore
      }
    }
  });

  whatsapp.on("connected", (phone: string) => {
    for (const [chatId] of sessions) {
      send(chatId, `✅ WhatsApp connected! Phone: *${phone}*`);
    }
  });

  whatsapp.on("disconnected", () => {
    for (const [chatId] of sessions) {
      send(chatId, "⚠️ WhatsApp disconnected. Use /connect to reconnect.");
    }
  });

  // Forward broadcast progress
  broadcastManager.on("status_update", (status) => {
    if (!status.active && status.status !== "idle") return;
    if (status.active && status.sent % 5 === 0 && status.sent > 0) {
      for (const [chatId] of sessions) {
        send(
          chatId,
          `📤 Broadcasting... ${status.sent}/${status.total} sent, ${status.failed} failed`
        );
      }
    }
    if (!status.active && status.status === "idle" && status.sent === 0) return;
  });

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    getSession(chatId);
    await send(
      chatId,
      `🚔 *E-Challan Broadcast Bot*\n\nWelcome! Use this bot to broadcast e-challans via WhatsApp.\n\n` +
      `*Commands:*\n` +
      `/status - Check WhatsApp connection\n` +
      `/connect - Connect WhatsApp\n` +
      `/disconnect - Disconnect WhatsApp\n` +
      `/upload_csv - Upload vehicle/mobile CSV\n` +
      `/upload_apk - Upload payment APK\n` +
      `/broadcast - Start a new broadcast\n` +
      `/stop - Stop current broadcast\n` +
      `/progress - Check broadcast progress\n` +
      `/history - View broadcast history\n` +
      `/cancel - Cancel current operation`
    );
  });

  bot.onText(/\/status/, async (msg) => {
    const status = whatsapp.getStatus();
    const icon = status.connected ? "🟢" : "🔴";
    const phoneText = status.phone ? `\nPhone: *${status.phone}*` : "";
    await send(msg.chat.id, `${icon} WhatsApp Status: *${status.status}*${phoneText}`);
  });

  bot.onText(/\/connect/, async (msg) => {
    await send(msg.chat.id, "⏳ Connecting to WhatsApp...");
    await whatsapp.connect();
    const qr = whatsapp.getQr();
    if (qr.qr) {
      const base64 = qr.qr.split(",")[1];
      if (base64) {
        const buf = Buffer.from(base64, "base64");
        await bot.sendPhoto(msg.chat.id, buf, { caption: "📱 Scan this QR code to connect WhatsApp" });
      }
    } else {
      const status = whatsapp.getStatus();
      await send(msg.chat.id, `Status: *${status.status}*`);
    }
  });

  bot.onText(/\/disconnect/, async (msg) => {
    await whatsapp.disconnect();
    await send(msg.chat.id, "✅ WhatsApp disconnected.");
  });

  bot.onText(/\/upload_csv/, async (msg) => {
    const session = getSession(msg.chat.id);
    session.state = "awaiting_csv";
    await send(msg.chat.id, "📂 Please send your CSV file now.\n\nThe CSV should have columns: `vehicle_no` (or car number) and `mobile`.");
  });

  bot.onText(/\/upload_apk/, async (msg) => {
    const session = getSession(msg.chat.id);
    session.state = "awaiting_apk";
    await send(msg.chat.id, "📦 Please send your APK file now.");
  });

  bot.onText(/\/broadcast/, async (msg) => {
    const session = getSession(msg.chat.id);

    if (!whatsapp.isConnected()) {
      await send(msg.chat.id, "❌ WhatsApp is not connected. Use /connect first.");
      return;
    }

    if (!session.csvSessionId) {
      await send(msg.chat.id, "❌ No CSV uploaded. Use /upload_csv first.");
      return;
    }

    session.state = "awaiting_challan_no";
    await send(msg.chat.id, `📋 Starting broadcast setup for *${session.csvTotal}* vehicles.\n\nStep 1/3: Enter the *Challan Number*:`);
  });

  bot.onText(/\/stop/, async (msg) => {
    const status = broadcastManager.getStatus();
    if (!status.active) {
      await send(msg.chat.id, "ℹ️ No broadcast is currently running.");
      return;
    }
    broadcastManager.stop();
    await send(msg.chat.id, "🛑 Stop signal sent. Finishing current message...");
  });

  bot.onText(/\/progress/, async (msg) => {
    const status = broadcastManager.getStatus();
    if (!status.active) {
      await send(msg.chat.id, "ℹ️ No broadcast is currently running.");
      return;
    }
    const pct = status.total > 0 ? Math.round((status.sent / status.total) * 100) : 0;
    await send(
      msg.chat.id,
      `📊 *Broadcast Progress*\n\n` +
      `Status: *${status.status}*\n` +
      `Sent: *${status.sent}* / ${status.total} (${pct}%)\n` +
      `Failed: *${status.failed}*\n` +
      `Current: ${status.currentNumber ?? "—"}`
    );
  });

  bot.onText(/\/history/, async (msg) => {
    const history = broadcastManager.getHistory();
    if (history.length === 0) {
      await send(msg.chat.id, "📭 No broadcast history yet.");
      return;
    }

    const lines = history.slice(0, 5).map((h, i) => {
      const date = new Date(h.startedAt).toLocaleString();
      return `${i + 1}. *${h.violation}* — ₹${h.amount}\n   ${date} | ${h.sent}/${h.total} sent | ${h.status}`;
    });

    await send(msg.chat.id, `📜 *Recent Broadcasts:*\n\n${lines.join("\n\n")}`);
  });

  bot.onText(/\/cancel/, async (msg) => {
    const session = getSession(msg.chat.id);
    session.state = "idle";
    session.csvSessionId = undefined;
    session.challanNumber = undefined;
    session.violation = undefined;
    session.amount = undefined;
    await send(msg.chat.id, "✅ Cancelled. Use /broadcast to start again.");
  });

  // Handle file uploads (CSV and APK)
  bot.on("document", async (msg) => {
    const chatId = msg.chat.id;
    const session = getSession(chatId);
    const doc = msg.document;

    if (!doc) return;

    if (session.state === "awaiting_csv") {
      try {
        await send(chatId, "⏳ Downloading and parsing CSV...");
        const fileInfo = await bot.getFile(doc.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${token}/${fileInfo.file_path}`;

        const response = await fetch(fileUrl);
        const text = await response.text();

        const rows = parse(text, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        }) as Record<string, string>[];

        const records = rows.map((row) => {
          const keys = Object.keys(row).map((k) => k.toLowerCase().trim());
          const vehicleKey = keys.find((k) => k.includes("vehicle") || k.includes("car") || k === "vehicle_no" || k === "vehicleno");
          const mobileKey = keys.find((k) => k.includes("mobile") || k.includes("phone") || k.includes("number") || k === "mob");
          const originalKeys = Object.keys(row);
          const vKey = originalKeys[keys.indexOf(vehicleKey ?? "")] ?? originalKeys[0];
          const mKey = originalKeys[keys.indexOf(mobileKey ?? "")] ?? originalKeys[1];
          return {
            vehicleNo: (row[vKey] ?? "").trim(),
            mobile: (row[mKey] ?? "").replace(/\D/g, ""),
          };
        }).filter((r) => r.vehicleNo && r.mobile && r.mobile.length >= 10);

        const sessionId = uuidv4();
        csvStore.save(sessionId, records);

        session.csvSessionId = sessionId;
        session.csvTotal = records.length;
        session.state = "idle";

        const preview = records.slice(0, 3).map((r) => `• ${r.vehicleNo} → ${r.mobile}`).join("\n");
        await send(
          chatId,
          `✅ *CSV loaded!*\n\n` +
          `Total records: *${records.length}*\n\nPreview:\n${preview}\n\n` +
          `Use /broadcast to start sending.`
        );
      } catch (err) {
        logger.error({ err }, "Telegram CSV parse error");
        session.state = "idle";
        await send(chatId, "❌ Failed to parse CSV. Make sure it has vehicle_no and mobile columns.");
      }

    } else if (session.state === "awaiting_apk") {
      try {
        await send(chatId, "⏳ Downloading APK...");
        const fileInfo = await bot.getFile(doc.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${token}/${fileInfo.file_path}`;
        const filename = `challan_${Date.now()}_${doc.file_name ?? "payment.apk"}`;
        const dest = path.join(APK_DIR, filename);

        // Clear old APKs
        try {
          const files = fs.readdirSync(APK_DIR);
          files.forEach((f) => fs.unlinkSync(path.join(APK_DIR, f)));
        } catch {
          // ignore
        }

        await downloadFile(fileUrl, dest);
        session.apkFilename = doc.file_name ?? "payment.apk";
        session.state = "idle";

        await send(chatId, `✅ *APK uploaded!*\n\nFilename: \`${doc.file_name}\`\n\nUse /broadcast to start sending.`);
      } catch (err) {
        logger.error({ err }, "Telegram APK download error");
        session.state = "idle";
        await send(chatId, "❌ Failed to download APK.");
      }
    } else {
      await send(chatId, "ℹ️ Use /upload_csv or /upload_apk first.");
    }
  });

  // Handle text input for broadcast config wizard
  bot.on("message", async (msg) => {
    if (!msg.text || msg.text.startsWith("/")) return;

    const chatId = msg.chat.id;
    const session = getSession(chatId);
    const text = msg.text.trim();

    if (session.state === "awaiting_challan_no") {
      session.challanNumber = text;
      session.state = "awaiting_violation";
      await send(chatId, `✅ Challan Number: *${text}*\n\nStep 2/3: Enter the *Violation* (e.g., "Over Speeding", "Signal Jumping"):`);

    } else if (session.state === "awaiting_violation") {
      session.violation = text;
      session.state = "awaiting_amount";
      await send(chatId, `✅ Violation: *${text}*\n\nStep 3/3: Enter the *Fine Amount* (numbers only, e.g., 500):`);

    } else if (session.state === "awaiting_amount") {
      session.amount = text;
      session.state = "ready_to_broadcast";

      const apkStatus = session.apkFilename ? `APK: ✅ ${session.apkFilename}` : "APK: ⚠️ Not uploaded (no APK will be attached)";

      await send(
        chatId,
        `📋 *Broadcast Summary*\n\n` +
        `Recipients: *${session.csvTotal}* vehicles\n` +
        `Challan No: *${session.challanNumber}*\n` +
        `Violation: *${session.violation}*\n` +
        `Fine Amount: *₹${session.amount}*\n` +
        `${apkStatus}\n\n` +
        `Reply *YES* to confirm and start broadcasting, or /cancel to abort.`
      );

    } else if (session.state === "ready_to_broadcast" && text.toUpperCase() === "YES") {
      if (!session.csvSessionId) {
        await send(chatId, "❌ CSV session expired. Use /upload_csv again.");
        session.state = "idle";
        return;
      }

      const records = csvStore.get(session.csvSessionId);
      if (!records) {
        await send(chatId, "❌ CSV data not found. Please re-upload.");
        session.state = "idle";
        return;
      }

      // Find APK path
      let apkPath: string | undefined;
      let apkFilename: string | undefined;
      try {
        const files = fs.readdirSync(APK_DIR);
        if (files.length > 0) {
          const latest = files.sort().pop()!;
          apkPath = path.join(APK_DIR, latest);
          apkFilename = session.apkFilename ?? latest;
        }
      } catch {
        // ignore
      }

      const result = await broadcastManager.start(records, {
        challanNumber: session.challanNumber!,
        violation: session.violation!,
        amount: session.amount!,
        apkPath,
        apkFilename,
      });

      session.state = "idle";

      await send(
        chatId,
        `🚀 *Broadcast Started!*\n\n` +
        `Session ID: \`${result.id}\`\n` +
        `Total: *${result.total}* messages\n\n` +
        `Use /progress to check status or /stop to cancel.`
      );
    }
  });

  bot.on("polling_error", (err) => {
    logger.error({ err }, "Telegram polling error");
  });

  logger.info("Telegram bot started");
  return bot;
}
