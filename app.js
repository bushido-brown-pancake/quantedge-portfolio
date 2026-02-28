// =============================================
// DATA & STATE
// =============================================
const SECTORS = ['Tech', 'Healthcare', 'Finance', 'Energy', 'Consumer', 'Real Estate', 'Industrials', 'Materials', 'Utilities'];
const COLORS = ['#d4a843', '#00d4b1', '#4d9fff', '#a855f7', '#ff4d6d', '#ff8c42', '#58d68d', '#85c1e9', '#f1948a'];

const STOCKS_DB = [
    { sym: 'AAPL', name: 'Apple Inc.', sector: 'Tech', price: 182.5, change: 1.2, color: '#d4a843', pe: 28.5, pb: 45.2, ps: 7.5, ev: 22.1, roe: 156.0, roa: 22.5, margin: 25.3, de: 1.4, cr: 0.99, fcf: 4.2, div: 0.5, beta: 1.28 },
    { sym: 'MSFT', name: 'Microsoft Corp.', sector: 'Tech', price: 378.9, change: 0.8, color: '#00d4b1', pe: 35.2, pb: 12.5, ps: 12.1, ev: 24.3, roe: 39.1, roa: 19.4, margin: 36.2, de: 0.4, cr: 1.2, fcf: 3.8, div: 0.7, beta: 0.90 },
    { sym: 'NVDA', name: 'NVIDIA Corp.', sector: 'Tech', price: 495.2, change: 3.1, color: '#4d9fff', pe: 75.4, pb: 32.1, ps: 28.5, ev: 55.2, roe: 75.3, roa: 35.1, margin: 42.1, de: 0.2, cr: 3.5, fcf: 1.5, div: 0.05, beta: 1.70 },
    { sym: 'GOOGL', name: 'Alphabet Inc.', sector: 'Tech', price: 140.3, change: -0.4, color: '#a855f7', pe: 25.1, pb: 6.5, ps: 6.2, ev: 16.5, roe: 27.5, roa: 18.2, margin: 24.1, de: 0.1, cr: 2.1, fcf: 4.5, div: 0.0, beta: 1.05 },
    { sym: 'META', name: 'Meta Platforms', sector: 'Tech', price: 352.1, change: 2.1, color: '#ff8c42', pe: 32.1, pb: 7.1, ps: 8.2, ev: 20.1, roe: 24.3, roa: 16.7, margin: 28.4, de: 0.1, cr: 2.5, fcf: 5.1, div: 0.0, beta: 1.20 },
    { sym: 'TSLA', name: 'Tesla Inc.', sector: 'Tech', price: 245.8, change: -1.8, color: '#ff4d6d', pe: 65.2, pb: 11.2, ps: 7.5, ev: 45.1, roe: 22.5, roa: 12.1, margin: 11.5, de: 0.1, cr: 1.7, fcf: 1.2, div: 0.0, beta: 2.10 },
    { sym: 'AMZN', name: 'Amazon.com', sector: 'Consumer', price: 178.2, change: 0.6, color: '#58d68d', pe: 58.1, pb: 8.5, ps: 3.1, ev: 25.4, roe: 14.2, roa: 5.5, margin: 5.2, de: 0.8, cr: 1.0, fcf: 2.1, div: 0.0, beta: 1.15 },
    { sym: 'JPM', name: 'JPMorgan Chase', sector: 'Finance', price: 192.4, change: 0.3, color: '#85c1e9', pe: 11.5, pb: 1.7, ps: 3.2, ev: 8.5, roe: 15.5, roa: 1.2, margin: 32.1, de: 2.5, cr: 1.0, fcf: 0.0, div: 2.5, beta: 1.10 },
    { sym: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare', price: 158.7, change: -0.2, color: '#f1948a', pe: 32.1, pb: 5.2, ps: 4.5, ev: 15.2, roe: 25.1, roa: 12.5, margin: 16.5, de: 0.5, cr: 1.1, fcf: 4.5, div: 3.0, beta: 0.55 },
    { sym: 'XOM', name: 'ExxonMobil', sector: 'Energy', price: 108.3, change: 1.4, color: '#d4a843', pe: 10.5, pb: 2.1, ps: 1.2, ev: 6.5, roe: 22.1, roa: 11.5, margin: 11.2, de: 0.2, cr: 1.5, fcf: 8.5, div: 3.5, beta: 1.15 },
    { sym: 'WMT', name: 'Walmart Inc.', sector: 'Consumer', price: 167.9, change: 0.5, color: '#00d4b1', pe: 25.4, pb: 5.5, ps: 0.7, ev: 12.5, roe: 18.5, roa: 7.2, margin: 2.5, de: 0.8, cr: 0.8, fcf: 4.1, div: 1.4, beta: 0.50 },
    { sym: 'BAC', name: 'Bank of America', sector: 'Finance', price: 34.2, change: -0.7, color: '#4d9fff', pe: 10.2, pb: 1.1, ps: 2.5, ev: 8.1, roe: 10.5, roa: 0.9, margin: 28.5, de: 2.1, cr: 1.0, fcf: 0.0, div: 2.8, beta: 1.35 },
    { sym: 'UNH', name: 'UnitedHealth Group', sector: 'Healthcare', price: 527.3, change: 0.9, color: '#a855f7', pe: 21.5, pb: 5.8, ps: 1.3, ev: 14.5, roe: 28.5, roa: 8.5, margin: 6.1, de: 0.7, cr: 0.8, fcf: 5.5, div: 1.5, beta: 0.70 },
    { sym: 'PG', name: "Procter & Gamble", sector: 'Consumer', price: 152.8, change: 0.1, color: '#ff8c42', pe: 25.1, pb: 8.2, ps: 4.5, ev: 18.5, roe: 32.5, roa: 12.5, margin: 17.5, de: 0.6, cr: 0.6, fcf: 4.8, div: 2.5, beta: 0.45 },
    { sym: 'HD', name: 'Home Depot', sector: 'Real Estate', price: 342.5, change: 1.2, color: '#ff4d6d', pe: 22.5, pb: 210.5, ps: 2.5, ev: 16.5, roe: 1500.5, roa: 22.5, margin: 10.5, de: 35.1, cr: 1.3, fcf: 5.2, div: 2.5, beta: 0.95 },
    { sym: 'V', name: 'Visa Inc.', sector: 'Finance', price: 268.4, change: 0.7, color: '#58d68d', pe: 31.5, pb: 15.2, ps: 16.5, ev: 25.5, roe: 45.2, roa: 22.5, margin: 52.5, de: 0.5, cr: 1.5, fcf: 4.5, div: 0.7, beta: 0.95 },
    { sym: 'MA', name: 'Mastercard', sector: 'Finance', price: 434.7, change: 0.4, color: '#85c1e9', pe: 35.5, pb: 65.2, ps: 18.5, ev: 28.5, roe: 155.2, roa: 28.5, margin: 45.5, de: 2.5, cr: 1.2, fcf: 3.5, div: 0.5, beta: 1.10 },
    { sym: 'DIS', name: 'Walt Disney Co.', sector: 'Consumer', price: 92.3, change: -0.8, color: '#f1948a', pe: 45.5, pb: 1.8, ps: 2.1, ev: 15.5, roe: 4.5, roa: 2.5, margin: 4.5, de: 0.5, cr: 1.0, fcf: 2.5, div: 1.2, beta: 1.30 },
];

let state = {
    portfolio: [
        { sym: 'AAPL', shares: 10, avgCost: 165.0 },
        { sym: 'MSFT', shares: 5, avgCost: 340.0 },
        { sym: 'NVDA', shares: 8, avgCost: 410.0 },
    ],
    initAmount: 10000, recurAmount: 500, frequency: 'monthly',
    riskLevel: 4, horizon: 2, horizonLabel: '2Y',
    sectors: ['Tech', 'Finance'], modalStock: null, finTab: 'income',
};

let charts = {};
const livePrices = {};
const liveCache = {};
const ratioCache = {};  // populated by app6.js + refreshLivePrices
let notifStack = 0;
let pendingConfirm = null;

// =============================================
// INIT
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    clearOldCache();
    buildSectorChips(); buildSidebarSectors(); buildTickerTape();
    renderPortfolioTable(); renderTopMetrics(); renderCharts();
    renderNews(); renderRatios(); renderFinancials('income'); renderComparison(); updateStockComparison();
    setTimeout(() => refreshLivePrices().catch(() => updateLivePrices()), 2000);
    setInterval(() => refreshLivePrices().catch(() => updateLivePrices()), 60000);
    setInterval(updateLivePrices, 8000);
    // Close modal on Escape
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') { closeModal(); closeConfirm(); }
    });
    // Close modal on overlay click
    document.getElementById('addModal').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeModal();
    });
});

// =============================================
// SIDEBAR TOGGLE (mobile)
// =============================================
function toggleSidebar() {
    const s = document.getElementById('sidebar');
    const o = document.getElementById('sidebarOverlay');
    s.classList.toggle('open');
    o.classList.toggle('show');
}

// =============================================
// CONFIRM DIALOG
// =============================================
function showConfirm(title, msg, cb) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMsg').textContent = msg;
    pendingConfirm = cb;
    document.getElementById('confirmOverlay').classList.add('show');
}
function closeConfirm() {
    document.getElementById('confirmOverlay').classList.remove('show');
    pendingConfirm = null;
}
function confirmAction() {
    if (pendingConfirm) pendingConfirm();
    closeConfirm();
}

// =============================================
// NOTIFICATIONS — stacked
// =============================================
function notify(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = `notif ${type}`;
    el.textContent = msg;
    el.style.bottom = (20 + notifStack * 52) + 'px';
    document.body.appendChild(el);
    notifStack++;
    setTimeout(() => { el.remove(); notifStack = Math.max(0, notifStack - 1); }, 3000);
}

// =============================================
// TICKER TAPE
// =============================================
function buildTickerTape() {
    const inner = document.getElementById('tickerInner');
    const items = [...STOCKS_DB, ...STOCKS_DB];
    inner.innerHTML = items.map(s => `
    <span class="tick-item">
      <span class="tick-sym">${s.sym}</span>
      <span class="tick-price">$${s.price.toFixed(2)}</span>
      <span class="tick-chg ${s.change >= 0 ? 'pos' : 'neg'}">${s.change >= 0 ? '+' : ''}${s.change}%</span>
    </span>
  `).join('');
}

function updateLivePrices() {
    STOCKS_DB.forEach(s => {
        s.price *= (1 + (Math.random() - 0.5) * 0.005);
        s.change = +(Math.random() * 6 - 3).toFixed(2);
        s.price = +s.price.toFixed(2);
    });
    buildTickerTape(); renderTopMetrics(); renderPortfolioTable();
}

// =============================================
// SECTOR CHIPS
// =============================================
function buildSectorChips() {
    document.getElementById('sectorChips').innerHTML = ['All', ...SECTORS].map(s => `
    <div class="chip ${s === 'All' ? 'active' : ''}" onclick="filterBySector('${s}',this)" role="button" tabindex="0">${s}</div>
  `).join('');
}
function filterBySector(sector, el) {
    document.querySelectorAll('#sectorChips .chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    notify(`Filtering: ${sector}`, 'success');
}
function buildSidebarSectors() {
    document.getElementById('sidebarSectors').innerHTML = SECTORS.map((s, i) => `
    <div class="sector-tag" onclick="toggleSector('${s}',this)">${s}</div>
  `).join('');
    const tags = document.getElementById('sidebarSectors').querySelectorAll('.sector-tag');
    tags[0].classList.add('active'); tags[2].classList.add('active');
}
function toggleSector(s, el) {
    el.classList.toggle('active');
    if (el.classList.contains('active')) state.sectors.push(s);
    else state.sectors = state.sectors.filter(x => x !== s);
}

// =============================================
// RISK / FREQUENCY / HORIZON
// =============================================
function syncRisk(v) {
    state.riskLevel = +v;
    document.getElementById('riskInput').value = v;
    document.getElementById('riskVal').textContent = v;
    const labels = ['', 'Min Risk', 'Conservative', 'Conservative', 'Moderate', 'Moderate', 'Balanced', 'Growth', 'Aggressive', 'High Risk', 'Max Risk'];
    const returns = [0, 4.5, 5.5, 6.5, 8.5, 9.5, 11, 13, 16, 20, 25];
    document.getElementById('riskLabel').textContent = labels[v] || 'Moderate';
    document.getElementById('riskReturn').textContent = returns[v] + '%';
    const el = document.getElementById('riskLabel');
    if (v <= 2) el.style.color = 'var(--teal)';
    else if (v <= 5) el.style.color = 'var(--gold)';
    else el.style.color = 'var(--red)';
}
function syncRiskInput(v) {
    v = Math.min(10, Math.max(1, +v));
    document.getElementById('riskSlider').value = v;
    syncRisk(v);
}
function setFreq(f) {
    state.frequency = f;
    document.getElementById('freqMonthly').classList.toggle('active', f === 'monthly');
    document.getElementById('freqAnnual').classList.toggle('active', f === 'annually');
}
function setHorizon(y, label, el) {
    state.horizon = y; state.horizonLabel = label;
    document.querySelectorAll('.h-btn').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
}

function colorForIndex(sym) {
    const palette = ['#d4a843', '#00d4b1', '#4d9fff', '#a855f7', '#ff8c42', '#ff4d6d', '#58d68d', '#85c1e9', '#f1948a', '#aab7b8'];
    let hash = 0;
    for (let c of sym) hash = c.charCodeAt(0) + ((hash << 5) - hash);
    return palette[Math.abs(hash) % palette.length];
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// =============================================
// LOCALSTORAGE CACHE  (survives page reloads)
// =============================================
const LS_PREFIX = 'qe4_';           // bump version to clear all old stale data
const TTL_PRICE = 2 * 60 * 1000;   // 2 min — live prices (fresher)
const TTL_SUMMARY = 60 * 60 * 1000;  // 1 hour — fundamentals / ratios

function lsSet(key, data) {
    try { localStorage.setItem(LS_PREFIX + key, JSON.stringify({ d: data, t: Date.now() })); } catch (_) { }
}
function lsGet(key, ttl) {
    try {
        const raw = localStorage.getItem(LS_PREFIX + key);
        if (!raw) return null;
        const { d, t } = JSON.parse(raw);
        if (Date.now() - t > ttl) return null;
        return d;
    } catch (_) { return null; }
}
// Remove any keys from old cache versions on startup
function clearOldCache() {
    try {
        const oldPrefixes = ['qe_', 'qe2_'];
        Object.keys(localStorage)
            .filter(k => oldPrefixes.some(p => k.startsWith(p)))
            .forEach(k => localStorage.removeItem(k));
    } catch (_) { }
}

// =============================================
// YAHOO FINANCE API — FAST
// =============================================
const YF_BASE = 'https://query1.finance.yahoo.com';
const YF_BASE2 = 'https://query2.finance.yahoo.com';

// Three proxies — we race them, fastest wins
const CORS_PROXIES = [
    url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];
let workingProxyIdx = 0;

async function fetchWithProxy(targetUrl, ttl = 0) {
    // 1) Check localStorage cache first
    if (ttl > 0) {
        const cached = lsGet('url_' + btoa(targetUrl.slice(-80)), ttl);
        if (cached) return cached;
    }

    // 2) Try direct fetch first (works when hosted, skips proxies entirely)
    try {
        const res = await fetch(targetUrl, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
            const data = await res.json();
            if (ttl > 0) lsSet('url_' + btoa(targetUrl.slice(-80)), data);
            return data;
        }
    } catch (_) { }

    // 3) Race the last-known working proxy against the others
    const order = [workingProxyIdx,
        ...[0, 1, 2].filter(i => i !== workingProxyIdx)];

    for (const idx of order) {
        try {
            const res = await fetch(CORS_PROXIES[idx](targetUrl),
                { signal: AbortSignal.timeout(4000) });
            if (!res.ok) continue;
            const text = await res.text();
            if (!text || text.length < 10) continue;
            const data = JSON.parse(text);
            workingProxyIdx = idx;
            if (ttl > 0) lsSet('url_' + btoa(targetUrl.slice(-80)), data);
            return data;
        } catch (_) { continue; }
    }
    throw new Error('All proxies failed');
}

// ── BATCH live prices for ALL portfolio symbols in ONE request ───────────────
async function refreshLivePrices() {
    const syms = [...new Set(state.portfolio.map(p => p.sym))];
    if (!syms.length) return;

    // Load fresh-enough values from localStorage immediately (instant display)
    // IMPORTANT: stamp _ts so renderPortfolioTable doesn't treat them as stale
    syms.forEach(s => {
        const c = lsGet('price_' + s, TTL_PRICE);
        if (c) {
            livePrices[s] = { ...c, _ts: Date.now() };
            const db = STOCKS_DB.find(x => x.sym === s);
            if (db) { db.price = c.price; db.change = c.change; }
        }
    });
    applyLivePrices();

    // Only network-fetch symbols whose cache is stale
    const stale = syms.filter(s => !lsGet('price_' + s, TTL_PRICE));
    if (!stale.length) return;

    try {
        const url = `${YF_BASE2}/v7/finance/quote?symbols=${stale.join(',')}&fields=regularMarketPrice,regularMarketPreviousClose,regularMarketChangePercent,regularMarketChange,shortName,currency`;
        const data = await fetchWithProxy(url);
        const results = data?.quoteResponse?.result || [];
        results.forEach(q => {
            const resolvedPrice = q.regularMarketPrice || q.regularMarketPreviousClose;
            const lp = {
                price: resolvedPrice,
                change: +(q.regularMarketChangePercent || 0).toFixed(2),
                changeAmt: +(q.regularMarketChange || 0).toFixed(2),
                name: q.shortName || q.symbol,
                currency: q.currency || 'USD',
                _ts: Date.now(),   // ← stamp so table doesn't re-fetch
            };
            livePrices[q.symbol] = lp;
            lsSet('price_' + q.symbol, lp);
            const db = STOCKS_DB.find(s => s.sym === q.symbol);
            if (db) { db.price = lp.price; db.change = lp.change; }
        });
        applyLivePrices();
    } catch (_) {
        // ALL proxies failed — seed livePrices from STOCKS_DB so UI never spins
        syms.forEach(s => {
            if (!livePrices[s]) {
                const db = STOCKS_DB.find(x => x.sym === s);
                if (db) {
                    livePrices[s] = { price: db.price, change: db.change, changeAmt: 0, name: db.name, currency: 'USD', _ts: Date.now(), _offline: true };
                }
            }
        });
        applyLivePrices();
    }
}

function applyLivePrices() {
    buildTickerTape(); renderTopMetrics(); renderPortfolioTable();
}

// ── Single symbol price (comparison / search) ────────────────────────────────
async function fetchLivePrice(sym) {
    const cached = lsGet('price_' + sym, TTL_PRICE);
    if (cached) return cached;
    // Add regularMarketPreviousClose as a fallback for when the market is closed
    const url = `${YF_BASE2}/v7/finance/quote?symbols=${sym}&fields=regularMarketPrice,regularMarketPreviousClose,regularMarketChangePercent,regularMarketChange,shortName,currency`;
    try {
        const data = await fetchWithProxy(url, TTL_PRICE);
        const q = data?.quoteResponse?.result?.[0];
        if (q) {
            // Use previous close if regular market price is unavailable (e.g., market is closed)
            const resolvedPrice = q.regularMarketPrice || q.regularMarketPreviousClose;
            const lp = { price: resolvedPrice, change: +(q.regularMarketChangePercent || 0).toFixed(2), changeAmt: +(q.regularMarketChange || 0).toFixed(2), name: q.shortName || sym, currency: q.currency || 'USD' };
            lsSet('price_' + sym, lp);
            return lp;
        }
    } catch (_) { }
    return null;
}

// ── Search ───────────────────────────────────────────────────────────────────
async function yfSearch(query) {
    const url = `${YF_BASE}/v1/finance/search?q=${encodeURIComponent(query)}&lang=en-US&region=US&quotesCount=15&newsCount=0&enableFuzzyQuery=true`;
    const data = await fetchWithProxy(url, 60 * 1000);
    return (data.quotes || []).filter(q => ['EQUITY', 'ETF', 'MUTUALFUND'].includes(q.quoteType));
}

// ── Chart data ───────────────────────────────────────────────────────────────
async function yfQuote(sym) {
    const url = `${YF_BASE2}/v8/finance/chart/${sym}?interval=1d&range=1y&includePrePost=false`;
    const data = await fetchWithProxy(url, TTL_SUMMARY);
    const chart = data?.chart?.result?.[0];
    if (!chart) return null;
    return { meta: chart.meta, closes: chart.indicators?.quote?.[0]?.close || [], timestamps: chart.timestamp || [] };
}

// ── Fundamentals / Ratios summary ────────────────────────────────────────────
async function yfSummary(sym) {
    const cached = lsGet('summary_' + sym, TTL_SUMMARY);
    if (cached) return cached;
    const modules = 'summaryDetail,financialData,defaultKeyStatistics,price,assetProfile';
    const url = `${YF_BASE}/v10/finance/quoteSummary/${sym}?modules=${modules}`;
    const data = await fetchWithProxy(url);
    const result = data?.quoteSummary?.result?.[0] || null;
    if (result) lsSet('summary_' + sym, result);
    return result;
}

