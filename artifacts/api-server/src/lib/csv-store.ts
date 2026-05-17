import { VehicleRecord } from "./broadcast.js";

class CsvStore {
  private sessions = new Map<string, VehicleRecord[]>();

  save(sessionId: string, records: VehicleRecord[]) {
    this.sessions.set(sessionId, records);
  }

  get(sessionId: string): VehicleRecord[] | undefined {
    return this.sessions.get(sessionId);
  }

  delete(sessionId: string) {
    this.sessions.delete(sessionId);
  }
}

export const csvStore = new CsvStore();
