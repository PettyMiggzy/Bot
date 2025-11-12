import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';

const adapter = new JSONFile('./data.json');
export const db = new Low(adapter, {});

function ensureShape() {
  const d = db.data || {};
  d.users     ||= {};
  d.wallets   ||= {};
  d.raffles   ||= {};
  d.tickets   ||= {};
  d.blocks    ||= { last: 0 };
  d.activity  ||= {};
  d.whitelist ||= {};
  d.settings  ||= { alertChats: [], lastAlerts: {} };

  // NEW in Phase 4:
  d.stats     ||= { wallets: {} };     // { wallet: { tickets: number, wins: number, xp: number } }
  d.jackpot   ||= { pot: "0", current: null }; // pot in raw token units (string), current round metadata
  d.quests    ||= { list: {}, submits: {} };   // quests + submissions
  db.data = d;
}

export async function initDB() {
  await db.read();
  ensureShape();
  await db.write();
}
