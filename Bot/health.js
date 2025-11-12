// src/health.js — lightweight health server + self-ping for Render
import express from 'express';
import https from 'https';

const app = express();
const PORT = process.env.PORT || 10000;

// Simple health routes
app.get('/', (_req, res) => res.send('Miggzy Bot running ✅'));
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// Start server
app.listen(PORT, () => {
  console.log(`🌐 Health server on :${PORT}`);
});

// Self-ping (Render exposes RENDER_EXTERNAL_URL). Fallback to KEEPALIVE_URL if you set it.
const target =
  process.env.RENDER_EXTERNAL_URL?.replace(/\/$/, '') ||
  process.env.KEEPALIVE_URL?.replace(/\/$/, '');

if (target) {
  const url = `${target}/healthz`;
  console.log(`⏱️ Keep-alive enabled → ${url}`);
  setInterval(() => {
    try {
      https.get(url, (r) => {
        // Drain response to finish socket
        r.on('data', () => {});
      }).on('error', () => {});
    } catch {}
  }, 4 * 60 * 1000); // every 4 minutes
} else {
  console.log('ℹ️ Keep-alive disabled (no RENDER_EXTERNAL_URL or KEEPALIVE_URL env set).');
  console.log('   Tip: add KEEPALIVE_URL=https://your-service.onrender.com');
}
