export function hypeFeature(bot) {
  const posts = [
    "🔥 MIGGZY Poker is LIVE on Base → https://miggzy.com/poker.html #Base #MIGGZY #CryptoGaming",
    "🎟️ Send 100k $MIGGZY per ticket to enter the raffle. Winner picked on-chain.",
    "🐋 The Blue Hustler moves quiet. Join TG → https://t.me/miggzyonbase"
  ];
  bot.command('shill', ctx => {
    const pick = posts[Math.floor(Math.random()*posts.length)];
    ctx.reply(pick);
  });
  bot.command('raid', ctx => {
    const url = (ctx.message.text.split(' ')[1] || '').trim();
    if (!url) return ctx.reply("Usage: /raid <link>");
    ctx.reply(`🚨 RAID TIME 🚨\n${url}\nDrop screenshots below!`);
  });
}
