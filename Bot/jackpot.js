import { ethers } from 'ethers';
import { nanoid } from 'nanoid';
import { createHash } from 'crypto';
import dayjs from 'dayjs';
import { db } from './db.js';
import { CFG } from './config.js';

function sha256Hex(x){ return createHash('sha256').update(x).digest('hex'); }

export function jackpotFeature(bot, provider) {
  db.data.jackpot ||= { pot: "0", current: null };
  const MIN_POT = BigInt((process.env.JACKPOT_MIN_TICKETS || '1000000')) * 10n**18n;
  const SECRET_SALT = process.env.SECRET_SALT || '';
  const OFFSET = Math.max(6, parseInt(process.env.ENTROPY_OFFSET_BLOCKS || '12', 10));

  async function isAdminCtx(ctx) {
    try {
      const m = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
      const s = m.status;
      if (s === 'creator' || s === 'administrator') return true;
    } catch {}
    return (CFG.ADMINS || []).includes(String(ctx.from.id));
  }

  bot.command('jackpot_status', (ctx) => {
    const pot = BigInt(db.data.jackpot.pot || '0');
    const cur = db.data.jackpot.current;
    const pretty = (n)=> Number((BigInt(n)/10n**18n).toString()).toLocaleString();
    ctx.reply(
      [
        `💰 Jackpot Pot (acct): ~${pretty(pot)} MIGGZY`,
        cur ? `Round: ${cur.id} — ${cur.closed ? 'Closed' : 'Open'}` : 'Round: none'
      ].join('\n')
    );
  });

  // start a jackpot round (uses **all current pot** as prize; manual payout)
  bot.command('jackpot_new', async (ctx) => {
    if (!(await isAdminCtx(ctx))) return;
    if (!SECRET_SALT) return ctx.reply("Set SECRET_SALT in .env then restart.");
    if (db.data.jackpot.current && !db.data.jackpot.current.closed) {
      return ctx.reply("A jackpot round is already open. Close/pick it first.");
    }
    const id = 'JP-' + nanoid(6);
    db.data.jackpot.current = {
      id, startedAt: Date.now(), closed: false,
      endBlock: 0, saltCommit: null, saltReveal: null, snapshotHash: null, entropy: null, winner: null
    };
    await db.write();
    ctx.reply(`💰 New Jackpot round *${id}* started. Pot (acct) will be awarded when you /jackpot_close then /jackpot_pick.`, { parse_mode:'Markdown' });
  });

  // Close — freeze entrants = recent raffle ticket snapshot (simple union from last raffle)
  bot.command('jackpot_close', async (ctx) => {
    if (!(await isAdminCtx(ctx))) return;
    const jp = db.data.jackpot.current;
    if (!jp) return ctx.reply("No jackpot round. Use /jackpot_new.");
    if (jp.closed) return ctx.reply(`Already closed at block ${jp.endBlock}.`);
    if (!SECRET_SALT) return ctx.reply("SECRET_SALT missing.");

    const pot = BigInt(db.data.jackpot.pot || '0');
    if (pot < MIN_POT) {
      return ctx.reply(`Pot too small. Need at least ${Number((MIN_POT/10n**18n).toString()).toLocaleString()} MIGGZY (acct).`);
    }

    // Build entrants = wallets that bought at least 1 ticket in the *current* open raffle
    const r = db.data.raffles.current;
    const tickets = r ? (db.data.tickets[r.id] || {}) : {};
    const filtered = Object.entries(tickets).filter(([,c]) => c>0).map(([w]) => w.toLowerCase()).sort();
    if (!filtered.length) return ctx.reply("No eligible entrants (need ticket buyers in current raffle).");

    const csv = ['wallet'].concat(filtered).join('\n');
    const snap = sha256Hex(csv);

    const latest = await provider.getBlockNumber();
    jp.closed = true;
    jp.endBlock = latest + OFFSET;
    jp.saltCommit = sha256Hex(SECRET_SALT);
    jp.snapshotHash = snap;
    await db.write();

    ctx.reply(
      [
        `🔒 Jackpot closed.`,
        `EndBlock: ${jp.endBlock} (now ${latest})`,
        `Snapshot: ${jp.snapshotHash}`,
        `SaltCommit: ${jp.saltCommit}`,
        `Use /jackpot_pick after end block.`
      ].join('\n')
    );
  });

  // Pick winner (commit-reveal)
  bot.command('jackpot_pick', async (ctx) => {
    if (!(await isAdminCtx(ctx))) return;
    const jp = db.data.jackpot.current;
    if (!jp) return ctx.reply("No jackpot round.");
    if (!jp.closed) return ctx.reply("Close first with /jackpot_close.");

    const latest = await provider.getBlockNumber();
    if (latest < jp.endBlock) return ctx.reply(`Wait for block ${jp.endBlock} (now ${latest}).`);
    const blk = await provider.getBlock(jp.endBlock);
    if (!blk?.hash) return ctx.reply("Block not ready — try again soon.");
    if (sha256Hex(SECRET_SALT) !== jp.saltCommit) return ctx.reply("Salt mismatch; do not change .env mid-round.");

    // entrants again from current raffle
    const r = db.data.raffles.current;
    const tickets = r ? (db.data.tickets[r.id] || {}) : {};
    const entrants = Object.entries(tickets).filter(([,c]) => c>0).map(([w]) => w.toLowerCase()).sort();
    if (!entrants.length) return ctx.reply("No entrants.");

    const entropy = ethers.utils.keccak256(
      ethers.utils.concat([
        ethers.utils.arrayify(blk.hash),
        ethers.utils.toUtf8Bytes(SECRET_SALT),
        ethers.utils.arrayify('0x' + jp.snapshotHash)
      ])
    );
    const idx = ethers.BigNumber.from(entropy).mod(entrants.length).toNumber();
    const winner = entrants[idx];

    jp.saltReveal = SECRET_SALT; jp.entropy = entropy; jp.winner = winner;
    await db.write();

    const pot = BigInt(db.data.jackpot.pot || '0');
    const pretty = (n)=> Number((BigInt(n)/10n**18n).toString()).toLocaleString();

    // NOTE: accounting only; make the payout manually from RAFFLE_ADDR / Treasury on-chain
    ctx.reply(
      [
        `💥 JACKPOT WINNER: ${winner}`,
        `Estimated Pot (acct): ~${pretty(pot)} MIGGZY`,
        `EndBlock: ${jp.endBlock}`,
        `BlockHash: ${blk.hash}`,
        `SaltCommit: ${jp.saltCommit}`,
        `SaltReveal: ${jp.saltReveal}`,
        `Entropy: ${jp.entropy}`,
        `Snapshot: ${jp.snapshotHash}`,
        ``,
        `👉 Pay out manually from the treasury/raffle wallet, then reset pot with /jackpot_reset if desired.`
      ].join('\n')
    );
  });

  // Reset pot (after manual payout)
  bot.command('jackpot_reset', async (ctx) => {
    if (!(await isAdminCtx(ctx))) return;
    db.data.jackpot.pot = "0";
    db.data.jackpot.current = null;
    await db.write();
    ctx.reply('♻️ Jackpot pot reset and round cleared.');
  });
}

