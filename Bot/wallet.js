import { ethers } from 'ethers';
import { db } from './db.js';

export function walletFeature(bot) {
  bot.command('start', ctx => {
    ctx.reply(
      "👋 Welcome to the MIGGZY Bot (Base).\n\n" +
      "• /link — verify your wallet\n" +
      "• /profile — see your linked wallet\n" +
      "• /raffle_status — current raffle\n" +
      "• /shill — hype post\n" +
      "Admins: /raffle_new /raffle_pick /inactive_set_days /alerts_on"
    );
  });

  bot.command('link', async ctx => {
    const uid = String(ctx.from.id);
    const nonce = 'MIGGZY-' + Math.random().toString(36).slice(2);
    db.data.users[uid] ||= {};
    db.data.users[uid].nonce = nonce;
    await db.write();

    ctx.reply(
      "🔐 *Wallet Verify*\n" +
      "1) Sign this exact message in your wallet:\n" +
      "```\n" + nonce + "\n```\n" +
      "2) Paste address + signature:\n" +
      "`/verify 0xYourAddress 0xYourSignature`",
      { parse_mode: 'Markdown' }
    );
  });

  bot.hears(/^\/verify\s+(0x[a-fA-F0-9]{40})\s+(0x[0-9a-fA-F]+)$/i, async ctx => {
    const uid = String(ctx.from.id);
    const [, address, sig] = ctx.match;
    const u = db.data.users[uid];
    if (!u?.nonce) return ctx.reply("Start with /link first.");

    try {
      const recovered = ethers.utils.verifyMessage(u.nonce, sig);
      if (recovered.toLowerCase() !== address.toLowerCase())
        return ctx.reply("❌ Signature does not match address.");

      db.data.wallets[address.toLowerCase()] = { uid, ts: Date.now() };
      u.nonce = null;
      u.wallet = address.toLowerCase();
      await db.write();
      ctx.reply(`✅ Linked to ${address.slice(0,6)}…${address.slice(-4)}.`);
    } catch (e) {
      ctx.reply("❌ Verify failed: " + (e?.message || e));
    }
  });

  bot.command('profile', async ctx => {
    const uid = String(ctx.from.id);
    const u = db.data.users[uid];
    if (!u?.wallet) return ctx.reply("No wallet linked. Use /link");
    ctx.reply(`🧾 Profile\nWallet: ${u.wallet.slice(0,6)}…${u.wallet.slice(-4)}\nXP: (soon)`);
  });
}

