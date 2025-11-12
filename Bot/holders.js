import { ethers } from 'ethers';
import { CFG } from '../config.js';
import { db } from '../db.js';

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

export function holdersFeature(bot, provider) {
  const token = new ethers.Contract(CFG.TOKEN_ADDR, ERC20_ABI, provider);
  const MIN = BigInt((process.env.MIN_HOLD_TOKENS || '100000')) * 10n ** 18n;

  bot.command('holder', async (ctx) => {
    try {
      const uid = String(ctx.from.id);
      const arg = (ctx.message.text.split(/\s+/)[1] || '').trim();
      const addr = arg || db.data?.users?.[uid]?.wallet;
      if (!addr) return ctx.reply("Usage: `/holder 0xYourAddress` or link wallet with /link then run `/holder`", { parse_mode:'Markdown' });

      const a = addr.toLowerCase();
      const bal = await token.balanceOf(a);
      const isHolder = BigInt(bal.toString()) >= MIN;

      const pretty = (n) => {
        const s = BigInt(n.toString());
        const whole = (s / 10n**18n).toString();
        const frac = (s % 10n**18n).toString().padStart(18,'0').slice(0,4);
        return `${Number(whole).toLocaleString()}.${frac}`;
      };

      ctx.reply(
        `💠 Holder Check\n` +
        `Address: ${a.slice(0,6)}…${a.slice(-4)}\n` +
        `Balance: ${pretty(bal)} MIGGZY\n` +
        `Status: ${isHolder ? '✅ Holder' : '❌ Not a holder'} (min ${Number((MIN/10n**18n).toString()).toLocaleString()} MIGGZY)`
      );

      db.data.whitelist ||= {};
      const chatId = String(ctx.chat.id || '');
      if (chatId && isHolder) {
        db.data.whitelist[chatId] ||= {};
        db.data.whitelist[chatId][uid] = true;
        await db.write();
      }
    } catch (e) {
      ctx.reply("Holder check failed: " + (e?.message || e));
    }
  });
}
