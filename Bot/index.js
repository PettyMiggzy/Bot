import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { CFG } from './config.js';
import { initDB } from './db.js';
import './health.js';
import { aiFeature } from './ai.js';

import { raffleFeature }      from './raffle.js';
import { walletFeature }      from './wallet.js';
import { modFeature }         from './mod.js';
import { hypeFeature }        from './hype.js';
import { inactivityFeature }  from './inactivity.js';
import { holdersFeature }     from './holders.js';
import { buysFeature }        from './buys.js';
import { balancesFeature }    from './balances.js';
import { leaderboardFeature } from './leaderboard.js';
import { jackpotFeature }     from './jackpot.js';
import { questsFeature }      from './quests.js';

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
