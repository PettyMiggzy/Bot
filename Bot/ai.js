// Bot/ai.js
// Conversational + art helper for @MiggzyBot
// - Reacts when people mention the bot
// - Answers basic MIGGZY questions
// - Can generate Miggzy-themed images
//
// Requires env vars:
//   OPENAI_API_KEY      - your OpenAI key
//   MIGGZY_ICON_URL     - tiny Miggzy avatar image URL (128x128-ish, optional)
//   MIGGZY_CA           - token contract address (optional, defaults below)
//   MIGGZY_TICKER       - e.g. "MIGGZY" (optional)
//   MIGGZY_MARKETCAP    - text like "$123,456" (you update manually, optional)
//
// This file does NOT touch raffle / jackpot / etc.

import { CFG } from './config.js';

// --------- PROJECT KNOWLEDGE (hard-coded MIGGZY facts) ---------

const MIGGZY_CA =
  process.env.MIGGZY_CA ||
  CFG.TOKEN_ADDR ||           // falls back to your config, if set
  '0x11d0b2013422ff2cf98f45e465fc1b060866564d'; // default from your contracts

const MIGGZY_TICKER = process.env.MIGGZY_TICKER || 'MIGGZY';
const MIGGZY_CHAIN  = 'Base mainnet';
const MIGGZY_DECIMALS = 18;
const MIGGZY_SITE   = 'https://miggzy.com';
const MIGGZY_TG     = 'https://t.me/MIGGZYONBASE';
const MIGGZY_X      = 'https://x.com/miggzyonbase';

// You can manually keep this roughly updated, or leave empty.
const MIGGZY_MARKETCAP = process.env.MIGGZY_MARKETCAP || 'changes all the time – check Dexscreener / Birdeye for the latest.';

// Small helper: build a short “project info” block we can reuse.
function buildProjectInfo() {
  return [
    `${MIGGZY_TICKER} is an on-chain poker + raffle ecosystem on ${MIGGZY_CHAIN}.`,
    `CA: ${MIGGZY_CA}`,
    `Site: ${MIGGZY_SITE}`,
    `TG: ${MIGGZY_TG}`,
    `X: ${MIGGZY_X}`,
    `Market cap: ${MIGGZY_MARKETCAP}`,
  ].join('\n');
}

// --------- OpenAI helpers (text + image) ---------

async function callChatGPT(userText) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // No key – fall back to a canned answer so the bot never crashes.
    return (
      "I’m Miggzy Bot, but my brain (OPENAI_API_KEY) isn’t set on the server yet.\n" +
      "Ask the dev to add it in Render so I can answer like a real AI.\n\n" +
      buildProjectInfo()
    );
  }

  const systemPrompt = [
    "You are Miggzy Bot, the official AI assistant for the MIGGZY token on Base.",
    "Tone: degen-friendly, helpful, but not cringe. Short answers for Telegram.",
    "Always assume questions are about crypto unless obviously not.",
    "If someone asks for:",
    "- CA / contract address → answer with the MIGGZY CA.",
    "- chain → say it’s on Base mainnet.",
    "- market cap → use the provided project info string, do NOT invent live numbers.",
    "- links → share site, TG and X.",
    "Important: Never make up prices or claim something is guaranteed profit.",
    "If they ask non-MIGGZY questions, you can still answer, but keep it brief.",
    "",
    "Project info:\n" + buildProjectInfo()
  ].join('\n');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ],
      temperature: 0.6,
      max_tokens: 300,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error('OpenAI chat error:', txt);
    return "My AI brain is having an issue right now. Try again in a minute gm 🤖";
  }

  const data = await res.json();
  const msg = data.choices?.[0]?.message?.content;
  return typeof msg === 'string' ? msg : (msg || "I’m not sure, but I’m cooking up some alpha soon.");
}

async function callImageGPT(userPrompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const fullPrompt = [
    "Ultra-clean 3D cartoon style, dark blue / neon blue palette.",
    "Character is Miggzy: a small blue crypto ninja wearing a hoodie and a gold chain with an X pendant.",
    "Style should match a Telegram bot mascot, no text in the image.",
    "Now follow this request exactly:",
    userPrompt,
  ].join(' ');

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: fullPrompt,
      size: '1024x1024',
      n: 1,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error('OpenAI image error:', txt);
    return null;
  }

  const data = await res.json();
  const url = data.data?.[0]?.url;
  return url || null;
}

// --------- Main feature: mention handler ---------

export function aiFeature(bot) {
  const iconUrl = process.env.MIGGZY_ICON_URL || null;

  bot.on('message', async (ctx, next) => {
    try {
      const msg = ctx.message;
      const text = msg?.text;
      if (!text) return next();         // ignore stickers, gifs, etc.

      // Ignore commands like /raffle_status
      if (text.startsWith('/')) return next();

      const lower = text.toLowerCase();

      // Only react when bot is actually mentioned
      const username = (ctx.botInfo && ctx.botInfo.username)
        ? ctx.botInfo.username.toLowerCase()
        : 'miggzybot';

      const mentioned =
        lower.includes(`@${username}`) ||
        lower.includes('miggzybot') ||
        lower.includes('miggzy bot');

      if (!mentioned) return next();

      // Decide if this is an art request or just chat
      const looksLikeArt =
        /draw|image|pic|picture|art|banner|logo|pfp|nft|meme|thumbnail/i.test(text);

      if (looksLikeArt) {
        await handleArtRequest(ctx, text, iconUrl);
      } else {
        await handleChatRequest(ctx, text);
      }
    } catch (err) {
      console.error('aiFeature error:', err);
      // Never crash the bot – just move on
      return next();
    }
  });
}

async function handleChatRequest(ctx, text) {
  const typing = ctx.replyWithChatAction('typing').catch(() => {});
  const answer = await callChatGPT(stripBotMention(text, ctx));
  await typing;
  await ctx.reply(answer, { disable_web_page_preview: true });
}

async function handleArtRequest(ctx, text, iconUrl) {
  // 1) Send the tiny Miggzy “cooking” message
  let waitingMessage;
  try {
    if (iconUrl) {
      waitingMessage = await ctx.replyWithPhoto(
        { url: iconUrl },
        { caption: '🖼 Cooking a fresh Miggzy image…' }
      );
    } else {
      waitingMessage = await ctx.reply('🖼 Cooking a fresh Miggzy image…');
    }
  } catch {
    waitingMessage = await ctx.reply('🖼 Cooking a fresh Miggzy image…');
  }

  // 2) Actually call the image API
  const cleaned = stripBotMention(text, ctx);
  const url = await callImageGPT(cleaned);

  // 3) Delete the “cooking” message if we can
  if (waitingMessage) {
    ctx.telegram
      .deleteMessage(waitingMessage.chat.id, waitingMessage.message_id)
      .catch(() => {});
  }

  if (!url) {
    await ctx.reply(
      "My art engine is having an issue right now. Tell the dev to check the OpenAI key or logs 🛠"
    );
    return;
  }

  await ctx.replyWithPhoto(
    { url },
    {
      caption: 'Here you go – fresh Miggzy art straight from the lab 🎨',
    }
  );
}

// Strip @miggzybot etc so the AI sees just the user request
function stripBotMention(text, ctx) {
  if (!text) return '';
  const username = (ctx.botInfo && ctx.botInfo.username)
    ? ctx.botInfo.username.toLowerCase()
    : 'miggzybot';
  return text
    .replace(new RegExp(`@${username}`, 'ig'), '')
    .replace(/miggzybot/ig, '')
    .trim();
}
