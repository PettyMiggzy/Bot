import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { CFG } from './config.js';
import { initDB } from './db.js';
import './health.js';

import { raffle }      from './raffle.js';
import { wallet }      from './wallet.js';
import { mod }         from './mod.js';
import { hype }        from './hype.js';
import { inactivity }  from './inactivity.js';
import { holders }     from './holders.js';
import { buys }        from './buys.js';
import { balances }    from './balances.js';
import { leaderboard } from './leaderboard.js';
import { jackpot }     from './jackpot.js';
import { quests }      from './quests.js';

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
await initDB();

bot.command('ping', (ctx) => ctx.reply('pong'));

raffle(bot);
wallet(bot);
mod(bot);
hype(bot);
inactivity(bot);
holders(bot);
buys(bot);
balances(bot);
leaderboard(bot);
jackpot(bot);
quests(bot);

bot.launch();
console.log('✅ MIGGZY bot running');

