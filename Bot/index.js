// Bot/index.js
// Main entry for Miggzy Bot (Render-ready, with provider passed into features)

import dotenv from 'dotenv';
import { Telegraf } from 'telegraf';
import { ethers } from 'ethers';

import { CFG } from './config.js';
import { initDB } from './db.js';
import './health.js';

// feature modules
import { raffleFeature } from './raffle.js';
import { walletFeature } from './wallet.js';
import { modFeature } from './mod.js';
import { hypeFeature } from './hype.js';
import { inactivityFeature } from './inactivity.js';
import { holdersFeature } from './holders.js';
import { buysFeature } from './buys.js';
import { balancesFeature } from './balances.js';
import { leaderboardFeature } from './leaderboard.js';
import { jackpotFeature } from './jackpot.js';
import { questsFeature } from './quests.js';
import { aiFeature } from './ai.js';

dotenv.config();

// ------------------------
// BASIC ENV CHECKS
// ------------------------

if (!process.env.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN missing in environment');
  process.exit(1);
}

const TOKEN = process.env.BOT_TOKEN;

// ------------------------
// INIT TELEGRAM BOT & DB
// ------------------------

const bot = new Telegraf(TOKEN, {
  handlerTimeout: 90_000,
});

const db = await initDB();

// ------------------------
// INIT BASE PROVIDER
// ------------------------

// ---- Base RPC provider (with safe fallback, no hard crash) ----
const rawRPC =
  process.env.BASE_RPC ||
  (CFG.RPCS || '') ||
  '';

const rpcList = rawRPC
  .split(',')
  .map(r => r.trim())
  .filter(Boolean);

const FALLBACK_RPC = 'https://base-rpc.publicnode.com';

let provider = null;

for (const url of [...rpcList, FALLBACK_RPC]) {
  try {
    const p = new ethers.JsonRpcProvider(url);
    const block = await p.getBlockNumber();
    console.log(`✅ Using RPC: ${url} (block ${block})`);
    provider = p;
    break;
  } catch (err) {
    console.error('RPC failed:', url, String(err?.message || err));
  }
}

if (!provider) {
  console.error('⚠️ All RPCs failed health-check, using fallback without testing');
  provider = new ethers.JsonRpcProvider(FALLBACK_RPC);
}


// ------------------------
// CORE TEXT COMMANDS
// (keep it light – your feature files handle the heavy stuff)
// ------------------------

bot.start(ctx => {
  ctx.reply(
    '👋 Welcome to Miggzy Bot!\n' +
    'Type /help to see what I can do.'
  );
});

bot.help(ctx => {
  ctx.reply(
    [
      '🤖 *Miggzy Bot Commands*',
      '',
      '/start - Welcome & basics',
      '/help - Show this message',
      '/ping - Check if I\'m alive',
      '/whoami - Show your Telegram ID',
      '/chatid - Show this chat ID',
      '',
      'Raffle / Jackpot / Quests / Alerts etc are all available –',
      'just use the commands listed in the pinned bot message.',
    ].join('\n'),
    { parse_mode: 'Markdown' }
  );
});

bot.command('ping', ctx => ctx.reply('🏓 Miggzy online.'));
bot.command('whoami', ctx => ctx.reply(`🪪 Your Telegram ID: \`${ctx.from.id}\``, { parse_mode: 'Markdown' }));
bot.command('chatid', ctx => ctx.reply(`💬 Chat ID: \`${ctx.chat.id}\``, { parse_mode: 'Markdown' }));

// ------------------------
// WIRE FEATURES
// ------------------------

// IMPORTANT: these two now receive `provider`
raffleFeature(bot, provider);         // ✅ provider passed
buysFeature(bot, provider);           // ✅ provider passed

// rest keep their existing signatures
walletFeature(bot, db);
modFeature(bot);
hypeFeature(bot, db);
inactivityFeature(bot, db);
holdersFeature(bot, db, provider);
balancesFeature(bot, db, provider);
leaderboardFeature(bot, db);
jackpotFeature(bot, db, provider);
questsFeature(bot, db);
aiFeature(bot);                       // your new AI/chat/image stuff

// ------------------------
// LAUNCH (LONG POLLING)
// ------------------------

async function main() {
  try {
    // make sure no old webhook is set, then use polling
    await bot.telegram.deleteWebhook().catch(() => {});
    console.log('🔌 Webhook cleared; using long polling');

    await bot.launch({
      dropPendingUpdates: true,
    });

    console.log('🤖 Miggzy Bot is LIVE');
  } catch (err) {
    console.error('Launch error:', err);
    process.exit(1);
  }
}

main();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));



