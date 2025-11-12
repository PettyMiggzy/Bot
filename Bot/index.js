// Bot/index.js
import dotenv from 'dotenv'; dotenv.config();
import http from 'http';
import { Telegraf } from 'telegraf';
import { ethers } from 'ethers';

import { initDB } from './db.js';
import { raffleFeature } from './raffle.js';
import { activityFeature } from './activity.js';

// ... after creating bot, provider, db
activityFeature(bot, db);
raffleFeature(bot, provider, db);
// ----- CONFIG -----
const PORT = Number(process.env.PORT || 10000);
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) { console.error('❌ Missing BOT_TOKEN'); process.exit(1); }

// Accept a comma-separated list of RPCs, we’ll try them in order
const RPC_LIST = (process.env.BASE_RPC || 'https://mainnet.base.org')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Build a Static provider so ethers doesn’t “detect network”
async function pickProvider() {
  const net = { chainId: 8453, name: 'base' };
  for (const url of RPC_LIST) {
    try {
      const p = new ethers.providers.StaticJsonRpcProvider({ url, timeout: 15000 }, net);
      const n = await p.getBlockNumber(); // quick health test
      console.log(`✅ Using RPC: ${url} (latest block: ${n})`);
      return p;
    } catch (e) {
      console.warn(`RPC failed: ${url} -> ${e?.code || ''} ${e?.message || e}`);
    }
  }
  throw new Error('No working RPC from BASE_RPC list');
}

const provider = await pickProvider();
const db = await initDB(process.env.DB_FILE || 'data.json');

const bot = new Telegraf(BOT_TOKEN);
bot.command('ping', (ctx) => ctx.reply('pong ✅'));

// Wire features
raffleFeature(bot, provider, db);

// Keep-alive HTTP (Render health)
http.createServer(async (_req, res) => {
  try {
    const bn = await provider.getBlockNumber();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, block: bn }));
  } catch {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false }));
  }
}).listen(PORT, () => console.log(`🌐 Health server on :${PORT}`));

bot.launch()
  .then(() => console.log('🐉 Miggzy Bot live'))
  .catch(err => { console.error('Launch error:', err); process.exit(1); });

process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

