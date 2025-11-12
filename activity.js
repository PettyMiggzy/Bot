// Bot/activity.js
import dayjs from 'dayjs'

const CFG = {
  ADMINS: (process.env.ADMINS || '').split(',').map(s => s.trim()).filter(Boolean),
};

// helper: admin check (creator/admin in chat OR in ADMINS env)
async function isAdminCtx(ctx) {
  try {
    const m = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
    const s = m.status;
    if (s === 'creator' || s === 'administrator') return true;
  } catch {}
  return (CFG.ADMINS || []).includes(String(ctx.from.id));
}

export function activityFeature(bot, db) {
  // ensure structures
  db.data.settings ||= { inactivityDays: 3, alerts: true };
  db.data.lastSeen ||= {};

  // --- PUBLIC: show current settings
  bot.command('help', (ctx) => ctx.reply(
`Available:
/start - Welcome and basic info
/help - Show all commands
/ping - Check bot status
/whoami - Show your Telegram ID
/chatid - Show this chat ID

Admin:
/inactive_set_days <N> - Set inactivity limit in days
/inactive_scan - Kick users inactive beyond limit
/alerts_on - Enable group alerts
/alerts_off - Disable group alerts`, { disable_web_page_preview: true }));

  bot.command('start', (ctx) => ctx.reply(
    `Welcome to Miggzy Bot 💙\n` +
    `Use /help for commands. Admins can configure inactivity and alerts.`
  ));

  bot.command('whoami', (ctx) => ctx.reply(`Your ID: ${ctx.from?.id}`));
  bot.command('chatid', (ctx) => ctx.reply(`Chat ID: ${ctx.chat?.id}`));

  // --- ADMIN: set inactivity days
  bot.command('inactive_set_days', async (ctx) => {
    if (!(await isAdminCtx(ctx))) return;
    const parts = (ctx.message?.text || '').trim().split(/\s+/);
    const val = Number(parts[1]);
    if (!val || val < 1 || !Number.isFinite(val)) {
      return ctx.reply(`Usage: /inactive_set_days <days>\nCurrent: ${db.data.settings.inactivityDays} days`);
    }
    db.data.settings.inactivityDays = Math.max(1, Math.floor(val));
    await db.write();
    ctx.reply(`✅ Inactivity limit set to ${db.data.settings.inactivityDays} day(s).`);
  });

  // --- ADMIN: scan & kick inactive
  bot.command('inactive_scan', async (ctx) => {
    if (!(await isAdminCtx(ctx))) return;
    const chatId = ctx.chat?.id;
    if (!chatId) return ctx.reply('No chat id detected.');

    // Require admin ban permissions
    try {
      const me = await ctx.telegram.getChatMember(chatId, (await ctx.telegram.getMe()).id);
      const canBan = me?.can_restrict_members || me?.status === 'creator';
      if (!canBan) {
        return ctx.reply('❌ I need permission to ban members to kick inactive users. Make me an admin with “Ban users”.');
      }
    } catch {}

    const days = db.data.settings.inactivityDays || 3;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    db.data.lastSeen[chatId] ||= {};
    const seenMap = db.data.lastSeen[chatId];

    let kicked = 0;
    let checked = 0;

    // We only know users who sent messages while bot was present.
    // Iterate through tracked users for this chat.
    for (const userId of Object.keys(seenMap)) {
      checked++;
      const last = seenMap[userId] || 0;
      if (last && last < cutoff) {
        try {
          // kick = ban then unban to allow rejoin
          await ctx.telegram.banChatMember(chatId, Number(userId));
          await ctx.telegram.unbanChatMember(chatId, Number(userId));
          kicked++;
          // optionally remove from map
          delete seenMap[userId];
        } catch (e) {
          // ignore per-user errors, continue
          console.warn('kick failed', userId, e?.message || e);
        }
      }
    }

    await db.write();
    ctx.reply(`🧹 Inactivity scan complete.\nChecked: ${checked}\nKicked: ${kicked}\nCutoff: ${dayjs(cutoff).format('YYYY-MM-DD HH:mm')}`);
  });

  // --- ADMIN: alerts toggle
  bot.command('alerts_on', async (ctx) => {
    if (!(await isAdminCtx(ctx))) return;
    db.data.settings.alerts = true;
    await db.write();
    ctx.reply('🔔 Alerts enabled for this group.');
  });

  bot.command('alerts_off', async (ctx) => {
    if (!(await isAdminCtx(ctx))) return;
    db.data.settings.alerts = false;
    await db.write();
    ctx.reply('🔕 Alerts disabled for this group.');
  });

  // --- MIDDLEWARE: track lastSeen on any message in groups
  bot.on('message', async (ctx, next) => {
    try {
      const chatId = ctx.chat?.id;
      const userId = ctx.from?.id;
      if (chatId && userId && chatId < 0) { // group/supergroup
        db.data.lastSeen[chatId] ||= {};
        db.data.lastSeen[chatId][userId] = Date.now();
        await db.write();
      }
    } catch {}
    return next();
  });
}
