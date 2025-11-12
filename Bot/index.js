// Bot/index.js — single-folder setup
import { Telegraf } from 'telegraf';

// ---- env (Render injects) ----
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN missing'); process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// --- core commands ---
bot.command('ping', (ctx) => ctx.reply(process.env.PING_REPLY || 'Pong 🐉'));

// ---- feature imports (same folder as this file) ----
// ⬇️ IMPORTANT: no "./features/..." here.
import { raffleFeature }      from './raffle.js';
import { buysFeature }        from './buys.js';
import { walletFeature }      from './wallet.js';
import { modFeature }         from './mod.js';
import { hypeFeature }        from './hype.js';
import { inactivityFeature }  from './inactivity.js';
import { holdersFeature }     from './holders.js';
import { balancesFeature }    from './balances.js';
import { leaderboardFeature } from './leaderboard.js';
import { jackpotFeature }     from './jackpot.js';
import { questsFeature }      from './quests.js';

// ---- register features (each must export the listed function) ----
raffleFeature?.(bot);
buysFeature?.(bot);
walletFeature?.(bot);
modFeature?.(bot);
hypeFeature?.(bot);
inactivityFeature?.(bot);
holdersFeature?.(bot);
balancesFeature?.(bot);
leaderboardFeature?.(bot);
jackpotFeature?.(bot);
questsFeature?.(bot);

// ---- launch ----
bot.launch().then(() => {
  console.log('🚀 Miggzy Bot live (Bot/index.js, same-folder imports)');
}).catch(err => {
  console.error('Boot error:', err);
  process.exit(1);
});

// graceful stop for Render
process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
