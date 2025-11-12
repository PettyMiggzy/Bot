import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { CFG } from './config.js';
import { initDB } from './db.js';
import './health.js';

import { raffleFeature }      from './features/raffle.js';
import { walletFeature }      from './features/wallet.js';
import { modFeature }         from './features/mod.js';
import { hypeFeature }        from './features/hype.js';
import { inactivityFeature }  from './features/inactivity.js';
import { holdersFeature }     from './features/holders.js';
import { buysFeature }        from './features/buys.js';
import { balancesFeature }    from './features/balances.js';
import { leaderboardFeature } from './features/leaderboard.js';
import { jackpotFeature }     from './features/jackpot.js';
import { questsFeature }      from './features/quests.js';

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
await initDB();

bot.command('ping', (ctx) => ctx.reply('pong'));

raffleFeature(bot);
walletFeature(bot);
modFeature(bot);
hypeFeature(bot);
inactivityFeature(bot);
holdersFeature(bot);
buysFeature(bot);
balancesFeature(bot);
leaderboardFeature(bot);
jackpotFeature(bot);
questsFeature(bot);

bot.launch();
console.log('✅ MIGGZY bot running');
