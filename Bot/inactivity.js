import { db } from '../db.js';
import { CFG } from '../config.js';

export function inactivityFeature(bot) {
  const DAYS = parseInt(process.env.INACTIVITY_DAYS || '3', 10);
  const INTERVAL_MIN = parseInt(process.env.INACTIVITY_SCAN_MIN || '60', 10);

  db.data.activity ||= {};
  db.data.whitelist ||= {};
  db.data.settings ||= {};

  const isAdminId = (id) => CFG.ADMINS.includes(String(id));
  const assure = (chatId) => {
    if (!db.data.activity[chatId]) db.data.activity[chatId] = {};
    if (!db.data.whitelist[chatId]) db.data.whitelist[chatId] = {};
    if (!db.data.settings[chatId]) db.data.settings[chatId] = {};
  };

  bot.on('message', async (ctx, next) => {
    try {
      if (!ctx.chat || !ctx.from) return next();
      const chatId = String(ctx.chat.id);
      const userId = String(ctx.from.id);
      assure(chatId);
      db.data.activity[chatId][userId] = Date.now();
      await db.write();
    } catch {}
    return next();
  });

  bot.command('inactive_set_days', async ctx => {
    if (!isAdminId(ctx.from.id)) return;
    const chatId = String(ctx.chat.id);
    const days = parseInt(ctx.message.text.split(/\s+/)[1] || '', 10);
    if (!days || days < 1) return ctx.reply('Usage: /inactive_set_days <days>');
    assure(chatId);
    db.data.settings[chatId].days = days;
    await db.write();
    ctx.reply(`⏱️ Inactivity set to ${days} day(s).`);
  });

  bot.command('inactive_scan', async ctx => {
    if (!isAdminId(ctx.from.id)) return;
    const chatId = String(ctx.chat.id);
    const res = await scanChat(bot, chatId);
    ctx.reply(`🧹 Checked ${res.checked}, kicked ${res.kicked}.`);
  });

  async function scanChat(bot, chatId) {
    assure(chatId);
    const daysChat = db.data.settings[chatId]?.days || DAYS;
    const thresholdMs = daysChat * 24 * 60 * 60 * 1000;

    const activity = db.data.activity[chatId];
    const whitelist = db.data.whitelist[chatId];
    let checked = 0, kicked = 0;

    for (const [userId, lastSeen] of Object.entries(activity)) {
      checked++;
      if (isAdminId(userId) || whitelist[userId]) continue;

      let status = 'member';
      try { status = (await bot.telegram.getChatMember(chatId, userId)).status; }
      catch { status = 'left'; }
      if (status !== 'member') continue;
      if (status === 'administrator' || status === 'creator') continue;

      const idle = Date.now() - Number(lastSeen || 0);
      if (idle >= thresholdMs) {
        try {
          await bot.telegram.kickChatMember(chatId, userId);
          await bot.telegram.unbanChatMember(chatId, userId);
          delete activity[userId];
          kicked++;
          await db.write();
        } catch {}
      }
    }
    return { checked, kicked };
  }

  setInterval(async () => {
    const chats = Object.keys(db.data.activity || {});
    for (const chatId of chats) {
      try { await scanChat(bot, chatId); } catch(e){ console.error('inactivity scan:', e?.message || e); }
    }
  }, Math.max(1, INTERVAL_MIN) * 60 * 1000);
}
