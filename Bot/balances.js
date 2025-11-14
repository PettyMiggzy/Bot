import { ethers } from 'ethers';
import { CFG } from '../config.js';
import { db } from '../db.js';

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)"
];

export function balancesFeature(bot, provider) {
  const token = new ethers.Contract(CFG.TOKEN_ADDR, ERC20_ABI, provider);

  const TREASURY = (process.env.TREASURY_WALLET || '').toLowerCase();
  const HOUSE = (CFG.HOUSE_WALLET || '').toLowerCase();

  const MIN_TREAS = BigInt((process.env.MIN_TREASURY_TOKENS || '1000000')) * 10n**18n;
  const MIN_HOUSE = BigInt((process.env.MIN_HOUSE_TOKENS || '1000000')) * 10n**18n;

  const INTERVAL = Math.max(1, parseInt(process.env.CHECK_BAL_INTERVAL_MIN || '5', 10)) * 60 * 1000;

  db.data.settings ||= {};
  db.data.settings.alertChats ||= [];
  db.data.settings.lastAlerts ||= {};

  function targets() {
    const fixed = (process.env.ALERT_CHAT_ID || '').trim();
    if (fixed) return [fixed];
    return db.data.settings.alertChats;
  }

  const pretty = (n) => {
    const s = BigInt(n.toString());
    const whole = (s / 10n**18n).toString();
    return Number(whole).toLocaleString();
  };

  async function check() {
    try {
      if (!TREASURY && !HOUSE) return;

      const tNow = Date.now();
      const alert = async (key, message) => {
        const last = db.data.settings.lastAlerts[key] || 0;
        if (tNow - last < 30 * 60 * 1000) return;
        db.data.settings.lastAlerts[key] = tNow;
        await db.write();
        for (const chatId of targets()) {
          try { await bot.telegram.sendMessage(chatId, message); } catch {}
        }
      };

      if (TREASURY) {
        const bal = await token.balanceOf(TREASURY);
        if (bal < MIN_TREAS) await alert('treasury_low',
          `💼 Treasury low: ${pretty(bal)} MIGGZY (< ${pretty(MIN_TREAS)})\nAddr: ${TREASURY}`);
      }

      if (HOUSE) {
        const bal = await token.balanceOf(HOUSE);
        if (bal < MIN_HOUSE) await alert('house_low',
          `🏠 House wallet low: ${pretty(bal)} MIGGZY (< ${pretty(MIN_HOUSE)})\nAddr: ${HOUSE}`);
      }
    } catch (e) {
      console.error('balances check error:', e?.message || e);
    }
  }

  setInterval(check, INTERVAL);
}
