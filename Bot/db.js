// Bot/db.js
import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'

const defaults = {
  blocks: { last: 0 },
  raffles: {},
  tickets: {},
  stats: { wallets: {} },
  jackpot: { pot: "0", current: null }
}

let dbInstance = null;

export async function initDB(file = 'data.json') {
  if (dbInstance) return dbInstance;
  const adapter = new JSONFile(file);
  const db = new Low(adapter, defaults);
  await db.read();
  db.data ||= { ...defaults };
  await db.write();
  dbInstance = db;
  return dbInstance;
}
