const express = require('express');
const path = require('path');
const https = require('https');
const http = require('http');
const app = express();
const PORT = process.env.PORT || 3000;

// ─── Helper: server-side HTTP request (no CORS) ───────────────────────────────
function proxyRequest(url, res) {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'application/json,*/*',
            'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 8000,
    }, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => { data += chunk; });
        apiRes.on('end', () => {
            res.set('Content-Type', 'application/json');
            res.set('Access-Control-Allow-Origin', '*');
            try { res.json(JSON.parse(data)); }
            catch (e) { res.status(500).json({ error: 'Parse error', raw: data.slice(0, 200) }); }
        });
    });
    req.on('error', err => res.status(500).json({ error: err.message }));
    req.on('timeout', () => { req.destroy(); res.status(504).json({ error: 'Timeout' }); });
}

// ─── Generic proxy endpoint: GET /api/proxy?url=<encoded> ─────────────────────
// Used by app.js on localhost to bypass CORS for ANY Yahoo Finance URL
app.get('/api/proxy', (req, res) => {
    const target = req.query.url;
    if (!target) return res.status(400).json({ error: 'Missing url param' });
    // Whitelist: only allow Yahoo Finance and Twelve Data URLs
    if (!target.includes('yahoo.com') && !target.includes('twelvedata.com')) {
        return res.status(403).json({ error: 'Domain not allowed' });
    }
    proxyRequest(target, res);
});

// Serve static files
app.use(express.static(path.join(__dirname)));

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log('\n');
    console.log('  ╔═══════════════════════════════════╗');
    console.log('  ║   QuantEdge — Portfolio Intel     ║');
    console.log('  ╠═══════════════════════════════════╣');
    console.log(`  ║  🌐  http://localhost:${PORT}        ║`);
    console.log('  ║                                   ║');
    console.log('  ║  /api/proxy  → Yahoo Finance      ║');
    console.log('  ║  To share: npx ngrok http ' + PORT + '     ║');
    console.log('  ╚═══════════════════════════════════╝');
    console.log('\n  Press Ctrl+C to stop.\n');
});
