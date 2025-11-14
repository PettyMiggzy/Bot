import { ethers } from 'ethers';
import dayjs from 'dayjs';
import { nanoid } from 'nanoid';
import { createHash } from 'crypto';
import { db } from '../Bot/db.js';
import { CFG } from '../config.js';

const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

const FIRST_WINDOW = 4000;
const CHUNK_SIZE   = 2000;
const INTERVAL_MS  = 15000;
const RETRIES      = 3;
const BACKOFF_MS   = 1200;

function sha256Hex(bufOrStr) {
  return createHash('sha256').update(bufOrStr).digest('hex');
}

function buildSnapshotHash(ticketsMap = {}) {
  const entries = Object.entries(ticketsMap)
    .map(([w, c]) => [w.toLowerCase(), Number(c || 0)])
    .filter(([, c]) => c > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));
  const csv = ['wallet,tickets', ...entries.map(([w, c]) => `${w},${c}`)].join('\n');
  return sha256Hex(csv);
}

export function raffleFeature(bot, provider) {
  db.data.blocks  ||= { last: 0 };
  db.data.raffles ||= {};
  db.data.tickets ||= {};
  db.data.stats   ||= { wallets: {} };
  db.data.jackpot ||= { pot: "0", current: null };

  const OFFSET = Math.max(1, parseInt(process.env.ENTROPY_OFFSET_BLOCKS || '12', 10));
  const SECRET_SALT = process.env.SECRET_SALT || '';
  const JACKPOT_PCT = Math.max(0, Math.min(100, parseInt(process.env.JACKPOT_PERCENT || '10', 10)));

  async function isAdminCtx(ctx) {
    try {
      const m = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
      const s = m.status;
      if (s === 'creator' || s === 'administrator') return true;
    } catch {}
    return (CFG.ADMINS || []).includes(String(ctx.from.id));
  }

  bot.command('raffle_new', async ctx => {
    if (!(await isAdminCtx(ctx))) return;
    const id = nanoid(8);
    db.data.raffles.current = {
      id, startedAt: Date.now(),
      ticketPrice: CFG.TICKET_PRICE.toString(),
      entries: 0, closed: false, endBlock: 0,
      snapshotHash: null, saltCommit: null, saltReveal: null, entropy: null, winner: null
    };
    db.data.tickets[id] = {};
    await db.write();
    ctx.reply(
      `🎟️ New raffle *${id}*` +
      `\nTicket: ${Number((CFG.TICKET_PRICE/10n**18n).toString()).toLocaleString()} MIGGZY` +
      `\nSend MIGGZY → \`${CFG.RAFFLE_ADDR}\`` +
      `\n🧮 Fairness: future blockhash + commit&reveal snapshot` +
      (JACKPOT_PCT>0 ? `\n💰 ${JACKPOT_PCT}% of each ticket accrues to the Jackpot (accounting).` : ''),
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('raffle_status', async ctx => {
    const r = db.data.raffles.current;
    if (!r) return ctx.reply("No active raffle. Admins: /raffle_new");
    const tix = db.data.tickets[r.id] || {};
    const total = Object.values(tix).reduce((a,b)=>a+b,0);
    const pot = db.data.jackpot?.pot || "0";
    const pretty = (raw)=> {
      const n = BigInt(raw);
      const whole = (n / 10n**18n).toString();
      return Number(whole).toLocaleString();
    };
    ctx.reply(
      [
        `🎟️ Raffle *${r.id}*`,
        `Status: ${r.closed ? 'Closed' : 'Open'}`,
        `Tickets: ${total}`,
        `Started: ${dayjs(r.startedAt).format('YYYY-MM-DD HH:mm')}`,
        `Pay: ${CFG.RAFFLE_ADDR}`,
        r.closed ? `EndBlock: ${r.endBlock}` : '',
        r.snapshotHash ? `Snapshot: ${r.snapshotHash}` : '',
        r.saltCommit ? `SaltCommit: ${r.saltCommit}` : '',
        r.entropy ? `Entropy: ${r.entropy}` : '',
        `Jackpot pot (acct): ~${pretty(pot)} MIGGZY`
      ].filter(Boolean).join('\n')
    );
  });

  bot.command('raffle_export', async ctx => {
    const r = db.data.raffles.current;
    if (!r) return ctx.reply("No active raffle.");
    const tix = db.data.tickets[r.id] || {};
    const rows = ['wallet,tickets'];
    for (const [w,c] of Object.entries(tix).sort((a,b)=>a[0].localeCompare(b[0]))) {
      rows.push(`${w.toLowerCase()},${Number(c||0)}`);
    }
    const csv = rows.join('\n');
    await ctx.replyWithDocument({ source: Buffer.from(csv), filename: `raffle_${r.id}.csv` });
  });

  bot.command('raffle_close', async ctx => {
    if (!(await isAdminCtx(ctx))) return;
    const r = db.data.raffles.current;
    if (!r) return ctx.reply("No active raffle.");
    if (r.closed) return ctx.reply(`Already closed at block ${r.endBlock}. Use /raffle_pick when ready.`);
    if (!SECRET_SALT) return ctx.reply("Set SECRET_SALT in .env then restart the bot.");

    const latest = await provider.getBlockNumber();
    r.closed = true;
    r.endBlock = latest + OFFSET;

    const tix = db.data.tickets[r.id] || {};
    r.snapshotHash = buildSnapshotHash(tix);
    r.saltCommit = sha256Hex(SECRET_SALT);
    r.saltReveal = null; r.entropy = null; r.winner = null;
    await db.write();

    ctx.reply(
      [
        `🔒 Raffle closed.`,
        `EndBlock: ${r.endBlock} (current ${latest})`,
        `Snapshot: ${r.snapshotHash}`,
        `SaltCommit: ${r.saltCommit}`,
        `Use /raffle_pick after block ${r.endBlock} to reveal & pick.`
      ].join('\n')
    );
  });

  bot.command('raffle_pick', async ctx => {
    if (!(await isAdminCtx(ctx))) return;
    const r = db.data.raffles.current;
    if (!r) return ctx.reply("No active raffle.");
    if (!r.closed) return ctx.reply("First close the raffle with /raffle_close.");

    const latest = await provider.getBlockNumber();
    if (latest < r.endBlock) return ctx.reply(`Wait for block ${r.endBlock} (now ${latest}).`);

    const blk = await provider.getBlock(r.endBlock);
    if (!blk?.hash) return ctx.reply("Block not ready — try again very soon.");
    if (!SECRET_SALT) return ctx.reply("SECRET_SALT missing in .env — cannot reveal.");

    const saltReveal = SECRET_SALT;
    if (sha256Hex(saltReveal) !== r.saltCommit)
      return ctx.reply("Salt commit does not match SECRET_SALT (don’t change it mid-round).");

    const tix = db.data.tickets[r.id] || {};
    const entries = [];
    const sorted = Object.entries(tix)
      .map(([w,c]) => [w.toLowerCase(), Number(c||0)])
      .filter(([,c]) => c>0)
      .sort((a,b)=>a[0].localeCompare(b[0]));
    for (const [w, c] of sorted) for (let i=0;i<c;i++) entries.push(w);
    if (!entries.length) return ctx.reply("No entries.");

    const entropyHex = ethers.utils.keccak256(
      ethers.utils.concat([
        ethers.utils.arrayify(blk.hash),
        ethers.utils.toUtf8Bytes(saltReveal),
        ethers.utils.arrayify('0x' + r.snapshotHash)
      ])
    );
    const idx = ethers.BigNumber.from(entropyHex).mod(entries.length).toNumber();
    const winner = entries[idx];

    // NEW: record winner in stats
    db.data.stats.wallets[winner] ||= { tickets: 0, wins: 0, xp: 0 };
    db.data.stats.wallets[winner].wins += 1;

    r.saltReveal = saltReveal; r.entropy = entropyHex; r.winner = winner;
    await db.write();

    ctx.reply(
      [
        `🏆 Winner: ${winner}`,
        `Tickets: ${entries.length}`,
        `EndBlock: ${r.endBlock}`,
        `BlockHash: ${blk.hash}`,
        `SaltCommit: ${r.saltCommit}`,
        `SaltReveal: ${r.saltReveal}`,
        `Entropy: ${r.entropy}`,
        `Snapshot: ${r.snapshotHash}`
      ].join('\n')
    );
  });

  // ---- MIGGZY transfer watcher (UPDATED: stats + jackpot accounting)
  const token = new ethers.Contract(CFG.TOKEN_ADDR, ERC20_ABI, provider);

  async function getLogsChunk(fromBlock, toBlock) {
    const filter = token.filters.Transfer(null, CFG.RAFFLE_ADDR);
    let attempt = 0;
    while (true) {
      try {
        return await token.queryFilter(filter, fromBlock, toBlock);
      } catch (e) {
        const msg = String(e?.message || e);
        const retriable = /timeout|503|Server error|SERVER_ERROR|429|no backend/i.test(msg);
        if (retriable && attempt < RETRIES) {
          attempt++;
          await new Promise(r => setTimeout(r, BACKOFF_MS * attempt));
          continue;
        }
        console.error(`scan error chunk [${fromBlock}-${toBlock}]:`, msg);
        return [];
      }
    }
  }

  async function scan() {
    try {
      const current = await provider.getBlockNumber();
      let fromBlock = (typeof db.data.blocks.last === 'number' && db.data.blocks.last > 0)
        ? db.data.blocks.last
        : Math.max(0, current - FIRST_WINDOW);

      let cursor = fromBlock;
      while (cursor < current) {
        const end = Math.min(cursor + CHUNK_SIZE, current);
        const logs = await getLogsChunk(cursor, end);

        for (const log of logs) {
          const { args } = log;
          if (!args) continue;
          const from = args.from.toLowerCase();
          const value = BigInt(args.value.toString());
          const r = db.data.raffles.current;
          if (!r || r.closed) continue;
          if (current - log.blockNumber < CFG.CONFIRMATIONS) continue;

          const tickets = Number(value / CFG.TICKET_PRICE);
          if (tickets <= 0) continue;

          // track tickets for this raffle
          db.data.tickets[r.id] ||= {};
          db.data.tickets[r.id][from] = (db.data.tickets[r.id][from] || 0) + tickets;
          r.entries += tickets;

          // NEW: global stats per wallet
          db.data.stats.wallets[from] ||= { tickets: 0, wins: 0, xp: 0 };
          db.data.stats.wallets[from].tickets += tickets;

          // NEW: jackpot accounting
          if (JACKPOT_PCT > 0) {
            const add = (value * BigInt(JACKPOT_PCT)) / 100n; // raw units
            const potNow = BigInt(db.data.jackpot.pot || "0");
            db.data.jackpot.pot = (potNow + add).toString();
          }

          await db.write();
        }

        cursor = end;
      }

      db.data.blocks.last = Math.max(0, current - 1);
      await db.write();
    } catch (e) {
      console.error("scan error:", e?.message || e);
    }
  }

  setInterval(scan, INTERVAL_MS);
}

