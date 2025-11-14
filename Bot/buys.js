// src/features/buys.js — clean, de-duped pool watcher
import { ethers } from 'ethers';
import { CFG } from './config.js';
import { db } from './db.js';

const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

export function buysFeature(bot, provider) {
  const token = new ethers.Contract(CFG.TOKEN_ADDR, ERC20_ABI, provider);

  const POOL = (process.env.POOL_ADDR || '').toLowerCase();
  const MIN  = BigInt((process.env.ALERT_MIN_TOKENS || '50000')) * 10n ** 18n;
  const FIXED_CHAT = (process.env.ALERT_CHAT_ID || '').trim();

  // ensure structures
  db.data.settings ||= {};
  db.data.settings.alertChats ||= [];
  db.data.settings.lastAlerts ||= {};
  db.data.settings.seenTx ||= {};       // <— persists txHash we've already posted

  function targets() {
    if (FIXED_CHAT) return [FIXED_CHAT];
    return db.data.settings.alertChats;
  }

  const short = a => a ? a.slice(0,6) + "…" + a.slice(-4) : a;
  const pretty = (n) => {
    const s = BigInt(n.toString());
    const whole = (s / 10n**18n).toString();
    return Number(whole).toLocaleString();
  };

  async function scan() {
    try {
      if (!POOL || POOL === '0x') return; // safety

      const current = await provider.getBlockNumber();
      const fromBlock = Math.max(0, current - 1000);
      const toBlock = current;

      // Pull recent Transfer logs
      const filter = token.filters.Transfer();
      const logs = await token.queryFilter(filter, fromBlock, toBlock);

      // Process newest last so UI reads top→down
      for (const log of logs.slice(-400)) {
        const txh = log.transactionHash.toLowerCase();
        if (db.data.settings.seenTx[txh]) continue;      // <— hard dedupe per tx

        const { args } = log;
        if (!args) continue;

        const from = args.from.toLowerCase();
        const to   = args.to.toLowerCase();
        const value = BigInt(args.value.toString());
        if (value < MIN) continue;

        // Strict pool classification:
        // buy  = from == POOL && to != POOL
        // sell = to   == POOL && from != POOL
        let kind = null;
        if (from === POOL && to !== POOL) kind = 'buy';
        else if (to === POOL && from !== POOL) kind = 'sell';
        else continue; // ignore generic transfers to stop duplicates

        // mark tx as posted BEFORE sending (avoids race)
        db.data.settings.seenTx[txh] = Date.now();
        // trim memory (keep last ~5k txs)
        const keys = Object.keys(db.data.settings.seenTx);
        if (keys.length > 5000) {
          for (const k of keys.slice(0, keys.length - 5000)) delete db.data.settings.seenTx[k];
        }
        await db.write();

        const msg = kind === 'buy'
          ? `🔥 New Buy: +${pretty(value)} MIGGZY\nFrom: ${short(from)}\nTo: ${short(to)}\nTx: https://base.blockscout.com/tx/${txh}`
          : `⚠️ Sell: -${pretty(value)} MIGGZY\nFrom: ${short(from)}\nTo: ${short(to)}\nTx: https://base.blockscout.com/tx/${txh}`;

        for (const chatId of targets()) {
          try { await bot.telegram.sendMessage(chatId, msg); } catch {}
        }
      }
    } catch (e) {
      console.error('buys scan error:', e?.message || e);
    }
  }

  // Run every 20s
  setInterval(scan, 20000);
}

