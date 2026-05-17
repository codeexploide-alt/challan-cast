import { whatsapp } from "./whatsapp.js";
import { logger } from "./logger.js";
import { EventEmitter } from "events";
import fs from "fs";

export interface VehicleRecord {
  vehicleNo: string;
  mobile: string;
}

export interface BroadcastConfig {
  challanNumber: string;
  violation: string;
  amount: string;
  apkPath?: string;
  apkFilename?: string;
}

export type BroadcastState = "idle" | "running" | "stopped" | "completed";

export interface BroadcastStatus {
  active: boolean;
  id: string | null;
  total: number;
  sent: number;
  failed: number;
  status: BroadcastState;
  currentNumber: string | null;
  startedAt: string | null;
}

export interface BroadcastRecord {
  id: string;
  startedAt: string;
  endedAt: string | null;
  total: number;
  sent: number;
  failed: number;
  status: string;
  violation: string;
  amount: string;
}

// Anti-ban: 2 minutes base ± 15 seconds random jitter
const BASE_DELAY_MS = 2 * 60 * 1000;
const JITTER_MS     = 15 * 1000;

function randomDelay(): number {
  const jitter = (Math.random() * 2 - 1) * JITTER_MS;
  return Math.max(60_000, BASE_DELAY_MS + jitter);
}

// Random violation pool — picked per-message for realistic variation
const VIOLATIONS = [
  "Signal Jumping",
  "Over Speeding",
  "Wrong Side Driving",
  "Driving Without Helmet",
  "Use of Mobile Phone While Driving",
  "Triple Riding",
  "No Seat Belt",
  "Parking in No Parking Zone",
  "Driving Without License",
  "Improper Lane Driving",
  "Jumping Red Light",
  "Overloading",
  "Driving Without Insurance",
  "Drunk Driving",
  "No PUC Certificate",
];

// Random fine amounts in ₹ — picked per-message
const AMOUNTS = [
  "500", "1000", "1500", "2000", "2500",
  "3000", "5000", "7500", "10000",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

class BroadcastManager extends EventEmitter {
  private current: BroadcastStatus = {
    active: false,
    id: null,
    total: 0,
    sent: 0,
    failed: 0,
    status: "idle",
    currentNumber: null,
    startedAt: null,
  };

  private history: BroadcastRecord[] = [];
  private stopFlag = false;

  getStatus(): BroadcastStatus {
    return { ...this.current };
  }

  getHistory(): BroadcastRecord[] {
    return [...this.history];
  }

  async start(
    records: VehicleRecord[],
    config: BroadcastConfig
  ): Promise<{ id: string; total: number; status: string }> {
    if (this.current.active) {
      throw new Error("Broadcast already running");
    }

    const id = `bc_${Date.now()}`;
    this.stopFlag = false;

    this.current = {
      active: true,
      id,
      total: records.length,
      sent: 0,
      failed: 0,
      status: "running",
      currentNumber: null,
      startedAt: new Date().toISOString(),
    };

    this.emit("status_update", this.current);
    logger.info({ id, total: records.length, delayMs: BASE_DELAY_MS }, "Broadcast started");

    this.runBroadcast(id, records, config).catch((err) => {
      logger.error({ err, id }, "Broadcast error");
    });

    return { id, total: records.length, status: "running" };
  }

  stop() {
    this.stopFlag = true;
    logger.info({ id: this.current.id }, "Broadcast stop requested");
  }

  private buildMessage(
    vehicleNo: string,
    config: BroadcastConfig,
    violation: string,
    amount: string
  ): string {
    return [
      `Dear Vehicle Owner,`,
      ``,
      `An e-challan has been issued against your vehicle:`,
      ``,
      `🚗 Vehicle No: *${vehicleNo}*`,
      `📋 Challan No: *${config.challanNumber}*`,
      `⚠️ Violation: *${violation}*`,
      `💰 Fine Amount: *₹${amount}*`,
      ``,
      `Please pay your fine immediately using the attached ChallanPay app to avoid further penalties.`,
      ``,
      `— Traffic Enforcement Authority`,
    ].join("\n");
  }

  private async runBroadcast(
    id: string,
    records: VehicleRecord[],
    config: BroadcastConfig
  ) {
    let apkBuffer: Buffer | undefined;

    if (config.apkPath && fs.existsSync(config.apkPath)) {
      try {
        apkBuffer = fs.readFileSync(config.apkPath);
      } catch (err) {
        logger.warn({ err }, "Could not read APK file");
      }
    }

    for (let i = 0; i < records.length; i++) {
      if (this.stopFlag) break;

      const record = records[i];
      this.current.currentNumber = record.mobile;
      this.emit("status_update", this.current);

      // Pick a fresh random violation + amount for every single message
      const violation = pickRandom(VIOLATIONS);
      const amount    = pickRandom(AMOUNTS);

      try {
        const msg = this.buildMessage(record.vehicleNo, config, violation, amount);

        if (apkBuffer && config.apkFilename) {
          await whatsapp.sendMessage(record.mobile, msg, {
            data: apkBuffer,
            filename: config.apkFilename,
            mimetype: "application/vnd.android.package-archive",
          });
        } else {
          await whatsapp.sendMessage(record.mobile, msg);
        }

        this.current.sent++;
        logger.info(
          { mobile: record.mobile, vehicleNo: record.vehicleNo, violation, amount },
          "Message sent"
        );
      } catch (err) {
        this.current.failed++;
        logger.warn({ err, mobile: record.mobile }, "Failed to send message");
      }

      this.emit("status_update", this.current);

      // Anti-ban delay between messages (skip after last message)
      if (i < records.length - 1 && !this.stopFlag) {
        const delay = randomDelay();
        logger.info({ delayMs: delay, nextIndex: i + 1 }, "Anti-ban delay before next message");
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    const endedAt = new Date().toISOString();
    const finalStatus: BroadcastState = this.stopFlag ? "stopped" : "completed";

    this.history.unshift({
      id,
      startedAt: this.current.startedAt!,
      endedAt,
      total: this.current.total,
      sent: this.current.sent,
      failed: this.current.failed,
      status: finalStatus,
      violation: config.violation,
      amount: config.amount,
    });

    this.current = {
      active: false,
      id: null,
      total: 0,
      sent: 0,
      failed: 0,
      status: "idle",
      currentNumber: null,
      startedAt: null,
    };

    this.stopFlag = false;
    this.emit("status_update", this.current);
    logger.info({ id, finalStatus }, "Broadcast finished");
  }
}

export const broadcastManager = new BroadcastManager();
