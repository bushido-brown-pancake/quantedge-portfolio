// ═══════════════════════════════════════════════════════════════
// API PROXY — Backend for Anthropic Claude API
// Deploy separately (Render, Railway, etc.)
// ═══════════════════════════════════════════════════════════════
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
const PORT = process.env.PROXY_PORT || 3001;

// ── CORS ────────────────────────────────────────────────────────
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'https://bushido-brown-pancake.github.io',
    ],
    methods: ['GET', 'POST'],
}));
app.use(express.json({ limit: '50kb' }));

// ── Rate Limiting (in-memory) ───────────────────────────────────
const rateMap = new Map();
function rateLimit(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const window = 60000; // 1 minute
    const max = 10;
    if (!rateMap.has(ip)) rateMap.set(ip, []);
    const hits = rateMap.get(ip).filter(t => now - t < window);
    if (hits.length >= max) {
        return res.status(429).json({ error: 'Rate limit exceeded. Max 10 req/min.' });
    }
    hits.push(now);
    rateMap.set(ip, hits);
    next();
}

// ── Health Check ────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        hasApiKey: !!process.env.ANTHROPIC_API_KEY,
    });
});

// ── Claude Proxy ────────────────────────────────────────────────
app.post('/api/claude', rateLimit, (req, res) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }

    const body = JSON.stringify(req.body);
    const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Length': Buffer.byteLength(body),
        },
        timeout: 30000,
    };

    const proxyReq = https.request(options, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => { data += chunk; });
        apiRes.on('end', () => {
            res.status(apiRes.statusCode).set('Content-Type', 'application/json').send(data);
        });
    });

    proxyReq.on('error', (err) => {
        res.status(502).json({ error: 'Proxy error: ' + err.message });
    });
    proxyReq.on('timeout', () => {
        proxyReq.destroy();
        res.status(504).json({ error: 'Anthropic API timeout' });
    });

    proxyReq.write(body);
    proxyReq.end();
});

// ── Start ───────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log('\n');
    console.log('  ╔═══════════════════════════════════╗');
    console.log('  ║  AI Proxy — Anthropic Claude      ║');
    console.log('  ╠═══════════════════════════════════╣');
    console.log(`  ║  🌐  http://localhost:${PORT}        ║`);
    console.log('  ║                                   ║');
    console.log(`  ║  API Key: ${process.env.ANTHROPIC_API_KEY ? '✓ Loaded' : '✗ Missing'}             ║`);
    console.log('  ║  POST /api/claude → Anthropic     ║');
    console.log('  ║  GET  /api/health → Status        ║');
    console.log('  ╚═══════════════════════════════════╝');
    console.log('\n');
});
