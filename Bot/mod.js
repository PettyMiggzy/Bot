// Simple moderation (no external packages)
const PROFANE = [
  "fuck","shit","bitch","cunt","faggot","retard","scam","honeypot","nigger","nigga","whore","slut"
];

function isProfane(text="") {
  const t = " " + text.toLowerCase() + " ";
  return PROFANE.some(w => t.includes(" " + w + " "));
}

export function modFeature(bot, admins) {
  const isAdmin = (id) => admins.includes(String(id));

  bot.on('message', async (ctx, next) => {
    try {
      const userId = String(ctx.from?.id || "");
      const text = ctx.message?.text || "";

      // Block link spam from non-admins
      const hasLink = /(https?:\/\/|t\.me\/|discord\.gg|dexscreener\.com|basescan\.org\/|etherscan\.io\/|four\.meme\/)/i.test(text);
      if (hasLink && !isAdmin(userId)) { try { await ctx.deleteMessage(); } catch {} return; }

      // Profanity filter for non-admins
      if (isProfane(text) && !isAdmin(userId)) { try { await ctx.deleteMessage(); } catch {} return; }
    } catch {}
    return next();
  });

  bot.command('warn', async ctx => {
    if (!isAdmin(ctx.from.id)) return;
    const u = ctx.message?.reply_to_message?.from;
    if (!u) return ctx.reply("Reply to a user's message then /warn");
    ctx.reply(`⚠️ @${u.username || u.id} warning issued.`);
  });

  bot.command('mute', async ctx => {
    if (!isAdmin(ctx.from.id)) return;
    const chatId = ctx.chat.id;
    const u = ctx.message?.reply_to_message?.from;
    if (!u) return ctx.reply("Reply then /mute");
    try { await ctx.telegram.restrictChatMember(chatId, u.id, { can_send_messages: false }); ctx.reply(`🔇 Muted @${u.username || u.id}`); }
    catch(e){ ctx.reply("Mute failed: " + (e?.message || e)); }
  });

  bot.command('ban', async ctx => {
    if (!isAdmin(ctx.from.id)) return;
    const chatId = ctx.chat.id;
    const u = ctx.message?.reply_to_message?.from;
    if (!u) return ctx.reply("Reply then /ban");
    try { await ctx.telegram.kickChatMember(chatId, u.id); ctx.reply(`⛔ Banned @${u.username || u.id}`); }
    catch(e){ ctx.reply("Ban failed: " + (e?.message || e)); }
  });

  bot.command('clean', async ctx => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.reply("🧹 Manual clean triggered.");
  });
}
