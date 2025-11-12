// Bot/index.js
import dotenv from 'dotenv'; dotenv.config();
import http from 'http';
import { Telegraf } from 'telegraf';
import { ethers } from 'ethers';

import { initDB } from './db.js';
import { raffleFeature } from './raffle.js';
import { activityFeature } from './activity.js';

const PORT = Number(process.env.PORT || 10000);
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) { console.error('❌ Missing BOT_TOKEN'); process.exit(1); }

// -------- RPC picker (Base mainnet, static) --------
const RPC_LIST = (process.env.BASE_RPC || 'https://mainnet.base.org')
  .split(',').map(s => s.trim()).filter(Boolean);
const net = { chainId: 8453, name: 'base' };

async function pickProvider() {
  for (const url of RPC_LIST) {
    try {
      const p = new ethers.providers.StaticJsonRpcProvider({ url, timeout: 25000 }, net);
      const bn = await p.getBlockNumber();
      console.log(`✅ Using RPC: ${url} (block ${bn})`);
      return p;
    } catch (e) {
      console.warn(`RPC failed: ${url} -> ${e?.code || ''} ${e?.message || e}`);
    }
  }
  throw new Error('No working RPC from BASE_RPC list');
}

const provider = await pickProvider();
const db = await initDB(process.env.DB_FILE || 'data.json');

// ---- create bot FIRST
const bot = new Telegraf(BOT_TOKEN);

// ensure polling (clear any webhook)
try {
  await bot.telegram.deleteWebhook({ drop_pending_updates: false });
  console.log('🔌 Webhook cleared; using long polling');
} catch (e) {
  console.log('Webhook clear warn:', e?.message || e);
}

// debug logger
bot.use(async (ctx, next) => {
  const chatId = ctx.chat?.id;
  const fromId = ctx.from?.id;
  const txt = ctx.message?.text || ctx.updateType;
  console.log(`📩 update chat=${chatId} from=${fromId} text=${txt}`);
  return next();
});

// basic tests
bot.command('ping', (ctx) => ctx.reply('pong ✅'));
bot.command('hello', (ctx) => ctx.reply('👋 Hello from Miggzy!'));

// ---- wire features AFTER bot is created
activityFeature(bot, db);
raffleFeature(bot, provider, db);

// global error handler
bot.catch((err, ctx) => {
  console.error('Bot error for update', ctx.update, err);
  try { ctx.reply('❌ Oops, command failed. Check server logs.'); } catch {}
});

// health server for Render
http.createServer(async (_req, res) => {
  try {
    const bn = await provider.getBlockNumber();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, block: bn }));
  } catch {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false }));
  }
}).listen(PORT, () => console.log(`🌐 Health on :${PORT}`));

// launch
bot.launch().then(() => {
  console.log('🐉 Miggzy Bot live');
}).catch(err => {
  console.error('Launch error:', err);
  process.exit(1);
});

// graceful stop
process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
