const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Serve the entire portfolio directory as static files
app.use(express.static(path.join(__dirname)));

// Fallback: any unknown route returns index.html (SPA-like)
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
    console.log('  ║  To share with others:            ║');
    console.log('  ║  npx ngrok http ' + PORT + '              ║');
    console.log('  ╚═══════════════════════════════════╝');
    console.log('\n  Press Ctrl+C to stop.\n');
});
