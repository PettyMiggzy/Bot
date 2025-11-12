// Bot/db.js
import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'

const defaults = {
  blocks: { last: 0 },
  raffles: {},
  tickets: {},
  stats: { wallets: {} },
  jackpot: { pot: "0", current: null },
  // NEW:
  settings: { inactivityDays: 3, alerts: true },
  lastSeen: {} // { [chatId]: { [userId]: timestampMs } }
}

let dbInstance = null;

export async function initDB(file = 'data.json') {
  if (dbInstance) return dbInstance;
  const adapter = new JSONFile(file);
  const db = new Low(adapter, defaults);
  await db.read();
  db.data ||= { ...defaults };
  // ensure new keys exist if upgrading
  db.data.settings ||= { inactivityDays: 3, alerts: true };
  db.data.lastSeen ||= {};
  await db.write();
  dbInstance = db;
  return dbInstance;
}
