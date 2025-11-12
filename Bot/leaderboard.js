import { db } from '../db.js';

export function leaderboardFeature(bot) {
  function topN(map, key, n=10) {
    return Object.entries(map || {})
      .sort((a,b) => (b[1][key]||0) - (a[1][key]||0))
      .slice(0, n);
  }
  function fmt(addr){ return addr.slice(0,6)+'…'+addr.slice(-4); }

  bot.command('lb_tickets', (ctx) => {
    const rows = topN(db.data.stats.wallets || {}, 'tickets', 10);
    if (!rows.length) return ctx.reply('No data yet.');
    const out = rows.map(([w,s],i)=>`${i+1}. ${fmt(w)} — ${s.tickets} tix`).join('\n');
    ctx.reply(`🏁 Top Tickets\n${out}`);
  });

  bot.command('lb_wins', (ctx) => {
    const rows = topN(db.data.stats.wallets || {}, 'wins', 10);
    if (!rows.length) return ctx.reply('No data yet.');
    const out = rows.map(([w,s],i)=>`${i+1}. ${fmt(w)} — ${s.wins} wins`).join('\n');
    ctx.reply(`🏆 Top Winners\n${out}`);
  });

  bot.command('lb_xp', (ctx) => {
    const rows = topN(db.data.stats.wallets || {}, 'xp', 10);
    if (!rows.length) return ctx.reply('No data yet.');
    const out = rows.map(([w,s],i)=>`${i+1}. ${fmt(w)} — ${s.xp} xp`).join('\n');
    ctx.reply(`📈 Top XP\n${out}`);
  });
}
