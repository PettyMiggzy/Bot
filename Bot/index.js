// Bot/index.js
import dotenv from 'dotenv';
dotenv.config();

import { Telegraf } from 'telegraf';
import { ethers } from 'ethers';
import { initDB } from './db.js';
import { raffleFeature } from './raffle.js';

console.log('ethers version =>', ethers.version); // should log 5.7.2

/* ---------- Boot ---------- */
if (!process.env.BOT_TOKEN) {
  console.error('Missing BOT_TOKEN in env');
  process.exit(1);
}
const bot = new Telegraf(process.env.BOT_TOKEN);

// Provider (Base mainnet)
const RPC = process.env.BASE_RPC || 'https://mainnet.base.org';
const provider = new ethers.providers.JsonRpcProvider(RPC);

// DB first, then features get the instance
const db = await initDB(process.env.DB_FILE || 'data.json');

// Minimal health/ping
bot.command('ping', (ctx) => ctx.reply('pong ✅'));

/* ---------- Features ---------- */
raffleFeature(bot, provider, db);

/* ---------- Start ---------- */
const PORT = process.env.PORT || 10000;
bot.launch().then(() => {
  console.log('🐉 Miggzy Bot live');
}).catch(err => {
  console.error('Launch error:', err);
});

// optional tiny HTTP keep-alive for Render
import http from 'http';
http.createServer((_, res) => res.end('ok')).listen(PORT, () =>
  console.log(`Keep-alive on :${PORT}`)
);

// Graceful stop
process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
console.log('Starting Miggzy Bot...');



