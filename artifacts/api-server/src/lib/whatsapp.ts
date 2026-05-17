import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { logger } from "./logger.js";
import QRCode from "qrcode";
import { EventEmitter } from "events";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_DIR = path.resolve(__dirname, "../../sessions");

export type SessionState = "disconnected" | "connecting" | "qr_ready" | "connected";

interface WAState {
  status: SessionState;
  phone: string | null;
  qrDataUrl: string | null;
  socket: WASocket | null;
}

/** Delete all files inside the sessions directory so Baileys starts fresh. */
function clearSessionFiles() {
  try {
    if (!fs.existsSync(SESSION_DIR)) return;
    for (const f of fs.readdirSync(SESSION_DIR)) {
      try {
        fs.rmSync(path.join(SESSION_DIR, f), { recursive: true, force: true });
      } catch { /* ignore individual file errors */ }
    }
    logger.info("Session files cleared");
  } catch (err) {
    logger.warn({ err }, "Could not clear session files");
  }
}

class WhatsAppManager extends EventEmitter {
  private state: WAState = {
    status: "disconnected",
    phone: null,
    qrDataUrl: null,
    socket: null,
  };

  // Prevent overlapping connect attempts
  private reconnecting = false;

  getStatus() {
    return {
      connected: this.state.status === "connected",
      phone: this.state.phone,
      status: this.state.status,
    };
  }

  getQr() {
    return {
      qr: this.state.qrDataUrl,
      status: this.state.status,
    };
  }

  async connect() {
    if (this.state.status === "connected" || this.reconnecting) {
      return;
    }

    this.reconnecting = true;

    try {
      const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
      const { version } = await fetchLatestBaileysVersion();

      // Only flip to "connecting" if we have no QR already visible
      if (this.state.status !== "qr_ready") {
        this.setState({ status: "connecting" });
      }

      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: logger.child({ module: "baileys" }) as any,
        generateHighQualityLinkPreview: false,
        markOnlineOnConnect: false,
        connectTimeoutMs: 60_000,
        defaultQueryTimeoutMs: 60_000,
        retryRequestDelayMs: 250,
        maxMsgRetryCount: 3,
        browser: ["ChallanCast", "Chrome", "120.0.0"],
      });

      this.state.socket = sock;
      this.reconnecting = false;

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            const dataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
            this.setState({ status: "qr_ready", qrDataUrl: dataUrl });
            this.emit("qr", dataUrl);
            logger.info("QR code generated");
          } catch (err) {
            logger.error({ err }, "Failed to generate QR code");
          }
        }

        if (connection === "close") {
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const isQrTimeout  = statusCode === 408;
          const isLoggedOut  = statusCode === DisconnectReason.loggedOut;

          logger.info({ statusCode, isQrTimeout, isLoggedOut }, "Connection closed");

          this.state.socket = null;

          if (isLoggedOut) {
            // WhatsApp server confirmed logout — clear session files and reconnect
            // so the user immediately sees a fresh QR without any server restart
            this.setState({ status: "disconnected", phone: null, qrDataUrl: null });
            this.emit("disconnected");
            clearSessionFiles();
            logger.info("Logged out — will reconnect to show fresh QR in 1s");
            setTimeout(() => this.connect(), 1000);
          } else if (isQrTimeout) {
            // QR expired — keep the last QR visible and silently refresh
            logger.info("QR expired, silently reconnecting to get new QR...");
            setTimeout(() => this.connect(), 500);
          } else {
            // Network/server error
            const hadQr = this.state.status === "qr_ready";
            if (!hadQr) {
              this.setState({ status: "disconnected", phone: null, qrDataUrl: null });
              this.emit("disconnected");
            }
            setTimeout(() => this.connect(), 4000);
          }
        }

        if (connection === "open") {
          const phone = sock.user?.id?.split(":")[0] ?? null;
          this.setState({ status: "connected", phone, qrDataUrl: null });
          this.emit("connected", phone);
          logger.info({ phone }, "WhatsApp connected");
        }
      });

      sock.ev.on("creds.update", saveCreds);
    } catch (err) {
      this.reconnecting = false;
      logger.error({ err }, "Failed to connect WhatsApp");
      this.setState({ status: "disconnected" });
      setTimeout(() => this.connect(), 5000);
    }
  }

  async disconnect() {
    // Reset the flag first so connect() can run again immediately after
    this.reconnecting = false;

    if (this.state.socket) {
      try {
        await this.state.socket.logout();
      } catch {
        // logout() itself triggers the connection.update → isLoggedOut path,
        // which calls clearSessionFiles + reconnect.
        // If it throws we handle it below.
      }
      this.state.socket = null;
    }

    // If logout() didn't fire the connection.update event (e.g. already offline),
    // clean up manually and start a fresh QR session ourselves.
    if (this.state.status !== "connecting" && this.state.status !== "qr_ready") {
      this.setState({ status: "disconnected", phone: null, qrDataUrl: null });
      this.emit("disconnected");
      clearSessionFiles();
      logger.info("WhatsApp disconnected — reconnecting for fresh QR");
      setTimeout(() => this.connect(), 1000);
    }
  }

  async sendMessage(
    to: string,
    text: string,
    document?: { data: Buffer; filename: string; mimetype: string }
  ) {
    if (!this.state.socket || this.state.status !== "connected") {
      throw new Error("WhatsApp not connected");
    }

    // Normalize to full international JID
    let normalized = to.replace(/\D/g, "");
    if (normalized.length === 10) {
      normalized = `91${normalized}`;
    } else if (normalized.startsWith("0") && normalized.length === 11) {
      normalized = `91${normalized.slice(1)}`;
    }
    const jid = to.includes("@") ? to : `${normalized}@s.whatsapp.net`;

    if (document) {
      await this.state.socket.sendMessage(jid, {
        document: document.data,
        fileName: document.filename,
        mimetype: document.mimetype,
        caption: text,
      });
    } else {
      await this.state.socket.sendMessage(jid, { text });
    }
  }

  isConnected() {
    return this.state.status === "connected";
  }

  private setState(partial: Partial<WAState>) {
    this.state = { ...this.state, ...partial };
    this.emit("state_change", this.state.status);
  }
}

export const whatsapp = new WhatsAppManager();

// Auto-connect on startup
whatsapp.connect().catch((err) => {
  logger.error({ err }, "Initial WhatsApp connect failed");
});
