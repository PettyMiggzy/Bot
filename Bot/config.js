import 'dotenv/config';

export const CFG = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  ADMINS: (process.env.ADMINS || '').split(',').map(s => s.trim()).filter(Boolean),

  BASE_RPC: process.env.BASE_RPC || 'https://mainnet.base.org',
  CHAIN_ID: 8453,

  TOKEN_ADDR: (process.env.TOKEN_ADDR || '').toLowerCase(),
  RAFFLE_ADDR: (process.env.RAFFLE_ADDR || '').toLowerCase(),
  HOUSE_WALLET: (process.env.HOUSE_WALLET || '').toLowerCase(),

  TICKET_PRICE: BigInt((process.env.TICKET_PRICE || '100000')) * 10n ** 18n,
  CONFIRMATIONS: parseInt(process.env.CONFIRMATIONS || '2', 10)
};
