import { nanoid } from 'nanoid';
import { db } from '../db.js';
import { CFG } from '../config.js';

export function questsFeature(bot) {
  const DEFAULT_XP = parseInt(process.env.QUEST_DEFAULT_XP || '25', 10);
  const REVIEW = (process.env.QUEST_REVIEW_CHAT_ID || '').trim();

  function isAdminId(id){ return CFG.ADMINS.includes(String(id)); }

  // Admin: create a quest  /quest_new <title> | <url> | <xp>
  bot.command('quest_new', async (ctx) => {
    if (!isAdminId(ctx.from.id)) return;
    const rest = ctx.message.text.replace(/^\/quest_new\s*/,'');
    const [title='', url='', xpStr=''] = rest.split('|').map(s=>s.trim());
    if (!title || !url) return ctx.reply('Usage: /quest_new <title> | <url> | <xp>');
    const xp = parseInt(xpStr || String(DEFAULT_XP), 10) || DEFAULT_XP;

    const id = 'Q-' + nanoid(6);
    db.data.quests.list[id] = { id, title, url, xp, open: true, createdAt: Date.now() };
    await db.write();
    ctx.reply(`🗒️ Quest *${id}* created: ${title}\nURL: ${url}\nXP: ${xp}\nUsers submit with: /quest_submit ${id} <proof-link>`, { parse_mode:'Markdown' });
  });

  // Users: submit proof  /quest_submit <id> <proof-link>
  bot.hears(/^\/quest_submit\s+(\S+)\s+(\S+)/i, async (ctx) => {
    const [, qid, proof] = ctx.match;
    const q = db.data.quests.list[qid];
    if (!q || !q.open) return ctx.reply('Quest not found or closed.');
    const uid = String(ctx.from.id);
    db.data.quests.submits[qid] ||= {};
    db.data.quests.submits[qid][uid] = { uid, proof, ts: Date.now(), approved: false, wallet: null };
    await db.write();
    ctx.reply(`✅ Submitted for ${qid}. Mods will review soon.`);
    if (REVIEW) {
      try {
        await ctx.telegram.sendMessage(REVIEW, `📝 Review needed\nQuest: ${qid} (${q.title})\nUser: ${uid}\nProof: ${proof}\nApprove with: /quest_approve ${qid} ${uid} 0xWALLET`);
      } catch {}
    }
  });

  // Admin: approve  /quest_approve <id> <telegramId> <wallet>
  bot.hears(/^\/quest_approve\s+(\S+)\s+(\d+)\s+(0x[a-fA-F0-9]{40})/i, async (ctx) => {
    if (!isAdminId(ctx.from.id)) return;
    const [, qid, uid, wallet] = ctx.match;
    const q = db.data.quests.list[qid];
    if (!q) return ctx.reply('Quest not found.');
    db.data.quests.submits[qid] ||= {};
    const sub = db.data.quests.submits[qid][uid];
    if (!sub) return ctx.reply('Submission not found.');
    if (sub.approved) return ctx.reply('Already approved.');

    sub.approved = true;
    sub.wallet = wallet.toLowerCase();
    db.data.stats.wallets[wallet.toLowerCase()] ||= { tickets: 0, wins: 0, xp: 0 };
    db.data.stats.wallets[wallet.toLowerCase()].xp += (q.xp || DEFAULT_XP);
    await db.write();

    ctx.reply(`👍 Approved quest ${qid} for user ${uid} → ${wallet} (+${q.xp||DEFAULT_XP} xp).`);
    try { await ctx.telegram.sendMessage(uid, `🎖️ Quest ${qid} approved! +${q.xp||DEFAULT_XP} xp`); } catch {}
  });

  // Admin: close quest
  bot.command('quest_close', async (ctx) => {
    if (!isAdminId(ctx.from.id)) return;
    const qid = (ctx.message.text.split(/\s+/)[1] || '').trim();
    const q = db.data.quests.list[qid];
    if (!q) return ctx.reply('Quest not found.');
    q.open = false; await db.write();
    ctx.reply(`🛑 Quest ${qid} closed.`);
  });

  // List quests
  bot.command('quests', (ctx) => {
    const open = Object.values(db.data.quests.list).filter(q => q.open);
    if (!open.length) return ctx.reply('No open quests.');
    const out = open.map(q => `• ${q.id}: ${q.title} (${q.xp} xp) → ${q.url}`).join('\n');
    ctx.reply(`📋 Open Quests\n${out}`);
  });
}
