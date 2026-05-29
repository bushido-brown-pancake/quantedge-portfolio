// Charge .env AVANT tout le reste pour que process.env soit hydraté
try { require('dotenv').config(); }
catch (e) { /* dotenv absent = OK, on lit juste process.env tel quel */ }

const express = require('express');
const path = require('path');
const https = require('https');
const http = require('http');
const app = express();
const PORT = process.env.PORT || 3000;
const ML_SERVICE = process.env.ML_SERVICE || 'http://127.0.0.1:8000';

// ─── Clés API (chargées depuis .env) ──────────────────────────────────────
const FINNHUB_KEY = process.env.FINNHUB_KEY || '';
const FRED_KEY = process.env.FRED_KEY || '';
const MARKETSTACK_KEY = process.env.MARKETSTACK_KEY || '';
const ALPHAVANTAGE_KEY = process.env.ALPHAVANTAGE_KEY || '';
const SEC_USER_AGENT = process.env.SEC_USER_AGENT || 'QuantEdge (contact: user@example.com)';
const RDP_APP_KEY   = process.env.RDP_APP_KEY   || '';
const RDP_USERNAME  = process.env.RDP_USERNAME  || '';
const RDP_PASSWORD  = process.env.RDP_PASSWORD  || '';

function _hasKey(name, k) {
    if (!k) console.warn(`[env] ${name} manquante — les endpoints associés renverront 503 jusqu'à ce que tu la mettes dans .env`);
    return !!k;
}
_hasKey('FINNHUB_KEY', FINNHUB_KEY);
_hasKey('FRED_KEY', FRED_KEY);
_hasKey('MARKETSTACK_KEY', MARKETSTACK_KEY);
_hasKey('ALPHAVANTAGE_KEY', ALPHAVANTAGE_KEY);

// JSON body pour le proxy ML
app.use(express.json({ limit: '4mb' }));

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
    // Whitelist: only allow Yahoo Finance, Twelve Data, and Refinitiv URLs
    if (!target.includes('yahoo.com') && !target.includes('twelvedata.com') && !target.includes('refinitiv.com') && !target.includes('lseg.com')) {
        return res.status(403).json({ error: 'Domain not allowed' });
    }
    proxyRequest(target, res);
});

// ─── Proxy vers le microservice Python ML ─────────────────────────────────
// GET  /api/ml/health               → FastAPI /health
// POST /api/ml/forecast/volatility  → FastAPI /forecast/volatility
// POST /api/ml/sentiment            → FastAPI /sentiment
function forwardToML(method, pathSuffix, body, res) {
    const url = new URL(ML_SERVICE);
    const client = url.protocol === 'https:' ? https : http;
    const bodyStr = body ? JSON.stringify(body) : null;
    const req = client.request({
        hostname: url.hostname,
        port: url.port,
        path: pathSuffix,
        method,
        headers: bodyStr ? {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyStr),
        } : {},
        timeout: 30000,
    }, (apiRes) => {
        let data = '';
        apiRes.on('data', c => { data += c; });
        apiRes.on('end', () => {
            res.status(apiRes.statusCode || 200);
            res.set('Content-Type', 'application/json');
            res.set('Access-Control-Allow-Origin', '*');
            res.send(data);
        });
    });
    req.on('error', err => res.status(503).json({
        error: 'ML service unreachable',
        details: err.message,
        hint: 'Démarre le microservice : cd ml-service && ./run.sh',
    }));
    req.on('timeout', () => { req.destroy(); res.status(504).json({ error: 'ML timeout' }); });
    if (bodyStr) req.write(bodyStr);
    req.end();
}
app.get('/api/ml/health', (_req, res) => forwardToML('GET', '/health', null, res));
app.post('/api/ml/forecast/volatility',
    (req, res) => forwardToML('POST', '/forecast/volatility', req.body, res));
app.post('/api/ml/sentiment',
    (req, res) => forwardToML('POST', '/sentiment', req.body, res));

// ─── Yahoo Finance crumb-based endpoints (ratios + financials) ────────────
// Yahoo a fermé l'accès anonyme à v10/quoteSummary depuis 2023. Il faut :
//   1) GET https://fc.yahoo.com/  → récupérer cookies A1/A3
//   2) GET getcrumb avec ces cookies → token
//   3) GET quoteSummary?crumb=…  avec Cookie header
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
let _yfCrumb = null;
let _yfCookie = null;
let _yfCrumbExpiry = 0;
const _yfSummaryCache = new Map();   // sym → { data, expiry }
const SUMMARY_TTL = 10 * 60 * 1000;  // 10 min

function httpRequest({ url, method = 'GET', headers = {}, timeout = 8000 }) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const client = u.protocol === 'https:' ? https : http;
        const req = client.request({
            hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: u.pathname + u.search, method,
            headers: { 'User-Agent': UA, 'Accept': '*/*', ...headers },
            timeout,
        }, (resp) => {
            let body = '';
            resp.on('data', c => body += c);
            resp.on('end', () => resolve({
                status: resp.statusCode, headers: resp.headers, body,
            }));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.end();
    });
}

async function getYFCrumb() {
    if (_yfCrumb && _yfCookie && Date.now() < _yfCrumbExpiry) {
        return { crumb: _yfCrumb, cookie: _yfCookie };
    }
    // Step 1 — try multiple cookie sources (Yahoo changes auth flow periodically)
    const cookieSources = [
        'https://finance.yahoo.com/',
        'https://fc.yahoo.com/',
        'https://query2.finance.yahoo.com/',
    ];
    let cookieHeader = null;
    for (const src of cookieSources) {
        try {
            const r1 = await httpRequest({
                url: src, timeout: 8000,
                headers: { 'Accept': 'text/html,application/xhtml+xml,*/*', 'Accept-Language': 'en-US,en;q=0.9' },
            });
            const setCookies = r1.headers['set-cookie'] || [];
            const cands = setCookies.map(c => c.split(';')[0]).join('; ');
            if (cands && cands.length > 2) { cookieHeader = cands; break; }
        } catch (_) {}
    }
    if (!cookieHeader) throw new Error('No cookies from Yahoo Finance');

    // Step 2 — try both crumb endpoints
    const crumbUrls = [
        'https://query2.finance.yahoo.com/v1/test/getcrumb',
        'https://query1.finance.yahoo.com/v1/test/getcrumb',
    ];
    for (const crumbUrl of crumbUrls) {
        try {
            const r2 = await httpRequest({
                url: crumbUrl, timeout: 8000,
                headers: { 'Cookie': cookieHeader, 'Referer': 'https://finance.yahoo.com/', 'Accept': '*/*', 'Accept-Language': 'en-US,en;q=0.9' },
            });
            const crumb = r2.body?.trim();
            if (r2.status === 200 && crumb && !crumb.includes('<') && crumb.length > 1) {
                _yfCrumb = crumb;
                _yfCookie = cookieHeader;
                _yfCrumbExpiry = Date.now() + 30 * 60 * 1000;
                return { crumb: _yfCrumb, cookie: _yfCookie };
            }
        } catch (_) {}
    }
    throw new Error('YF crumb unavailable — all sources rate-limited');
}

async function fetchQuoteSummary(ticker, modules) {
    const { crumb, cookie } = await getYFCrumb();
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`;
    const r = await httpRequest({ url, headers: { 'Cookie': cookie }, timeout: 8000 });
    if (r.status !== 200) throw new Error(`quoteSummary HTTP ${r.status}`);
    return JSON.parse(r.body);
}

// GET /api/yfsummary/AAPL → ratios (P/E, P/B, ROE, D/E, ...) + meta
app.get('/api/yfsummary/:ticker', async (req, res) => {
    const sym = req.params.ticker.toUpperCase();
    const cached = _yfSummaryCache.get(sym);
    if (cached && Date.now() < cached.expiry) {
        return res.json({ ...cached.data, _cached: true });
    }

    // Primary: Yahoo Finance (crumb-based)
    try {
        const modules = 'defaultKeyStatistics,financialData,summaryDetail,price,assetProfile';
        const data = await fetchQuoteSummary(sym, modules);
        const summary = data?.quoteSummary?.result?.[0];
        if (!summary) throw new Error('Empty result');
        _yfSummaryCache.set(sym, { data: summary, expiry: Date.now() + SUMMARY_TTL });
        return res.json(summary);
    } catch (_yfErr) { /* fall through to Alpha Vantage */ }

    // Fallback: Alpha Vantage OVERVIEW (9/12 ratios, 25 req/day on free tier)
    if (ALPHAVANTAGE_KEY) {
        try {
            const r = await httpRequest({
                url: `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${sym}&apikey=${ALPHAVANTAGE_KEY}`,
                timeout: 10000,
            });
            if (r.status === 200) {
                const av = JSON.parse(r.body);
                if (av.Symbol && !av.Note && !av.Information) {
                    const n = (v) => ({ raw: v && v !== 'None' && v !== '-' ? +v : null });
                    const summary = {
                        defaultKeyStatistics: {
                            trailingPE: n(av.TrailingPE),
                            priceToBook: n(av.PriceToBookRatio),
                            priceToSalesTrailing12Months: n(av.PriceToSalesRatioTTM),
                            enterpriseToEbitda: n(av.EVToEBITDA),
                            beta: n(av.Beta),
                        },
                        financialData: {
                            returnOnEquity: n(av.ReturnOnEquityTTM),
                            returnOnAssets: n(av.ReturnOnAssetsTTM),
                            profitMargins: n(av.ProfitMargin),
                            debtToEquity: { raw: null },
                            currentRatio: { raw: null },
                            freeCashflow: { raw: null },
                        },
                        summaryDetail: {
                            dividendYield: n(av.DividendYield),
                            beta: n(av.Beta),
                            trailingPE: n(av.TrailingPE),
                        },
                        price: { shortName: av.Name, longName: av.Name },
                        assetProfile: { sector: av.Sector },
                        _source: 'alphavantage',
                    };
                    _yfSummaryCache.set(sym, { data: summary, expiry: Date.now() + SUMMARY_TTL * 6 });
                    return res.json(summary);
                }
            }
        } catch (_avErr) { /* fall through */ }
    }

    res.status(502).json({ error: 'YF summary failed', ticker: sym, details: 'All sources unavailable' });
});

// GET /api/yffinancials/AAPL → income/balance/cashflow sur 4-5 ans
app.get('/api/yffinancials/:ticker', async (req, res) => {
    const sym = req.params.ticker.toUpperCase();
    const cacheKey = 'fin_' + sym;
    const cached = _yfSummaryCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) {
        return res.json({ ...cached.data, _cached: true });
    }
    try {
        const modules = 'incomeStatementHistory,balanceSheetHistory,cashflowStatementHistory,price';
        const data = await fetchQuoteSummary(sym, modules);
        const r = data?.quoteSummary?.result?.[0];
        if (!r) throw new Error('Empty result');

        // Normalisation : on ne renvoie que ce dont le front a besoin
        const num = (v) => v?.raw ?? null;
        const yearOf = (s) => {
            const ts = s?.endDate?.raw;
            return ts ? new Date(ts * 1000).getFullYear() : null;
        };
        const income = (r.incomeStatementHistory?.incomeStatementHistory || []).map(s => ({
            year: yearOf(s),
            revenue: num(s.totalRevenue),
            grossProfit: num(s.grossProfit),
            operatingIncome: num(s.operatingIncome),
            netIncome: num(s.netIncome),
        })).reverse();
        const balance = (r.balanceSheetHistory?.balanceSheetStatements || []).map(s => ({
            year: yearOf(s),
            totalAssets: num(s.totalAssets),
            totalLiab: num(s.totalLiab),
            equity: num(s.totalStockholderEquity),
        })).reverse();
        const cashflow = (r.cashflowStatementHistory?.cashflowStatements || []).map(s => ({
            year: yearOf(s),
            operating: num(s.totalCashFromOperatingActivities),
            investing: num(s.totalCashflowsFromInvestingActivities),
            financing: num(s.totalCashFromFinancingActivities),
        })).reverse();

        const out = { ticker: sym, name: r.price?.longName || r.price?.shortName || sym, income, balance, cashflow };
        _yfSummaryCache.set(cacheKey, { data: out, expiry: Date.now() + SUMMARY_TTL });
        res.json(out);
    } catch (e) {
        res.status(502).json({ error: 'YF financials failed', ticker: sym, details: e.message });
    }
});

// ═════════════════════════════════════════════════════════════════════════
// SEC EDGAR — financial statements (no key needed, but User-Agent obligatoire)
// ═════════════════════════════════════════════════════════════════════════
const SEC_UA_HEADERS = {
    'User-Agent': SEC_USER_AGENT,
    'Accept-Encoding': 'gzip, deflate',
    'Host': 'data.sec.gov',
};
let _secTickerMap = null;         // { AAPL: '0000320193', ... }
let _secTickerMapExpiry = 0;
const _secFactsCache = new Map(); // CIK → { data, expiry }
const SEC_FACTS_TTL = 24 * 60 * 60 * 1000; // 24 h

async function getSECTickerMap() {
    if (_secTickerMap && Date.now() < _secTickerMapExpiry) return _secTickerMap;
    const r = await httpRequest({
        url: 'https://www.sec.gov/files/company_tickers.json',
        headers: { 'User-Agent': SEC_USER_AGENT },
        timeout: 10000,
    });
    if (r.status !== 200) throw new Error(`SEC tickers HTTP ${r.status}`);
    const raw = JSON.parse(r.body);
    const map = {};
    Object.values(raw).forEach(row => {
        if (row && row.ticker && row.cik_str != null) {
            map[row.ticker.toUpperCase()] = String(row.cik_str).padStart(10, '0');
        }
    });
    _secTickerMap = map;
    _secTickerMapExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 jours
    return map;
}

// XBRL concept names → (statement, field)
const SEC_CONCEPTS = {
    income: [
        ['Revenues', 'revenue'],
        ['RevenueFromContractWithCustomerExcludingAssessedTax', 'revenue'],
        ['SalesRevenueNet', 'revenue'],
        ['GrossProfit', 'grossProfit'],
        ['OperatingIncomeLoss', 'operatingIncome'],
        ['NetIncomeLoss', 'netIncome'],
    ],
    balance: [
        ['Assets', 'totalAssets'],
        ['Liabilities', 'totalLiab'],
        ['StockholdersEquity', 'equity'],
    ],
    cashflow: [
        ['NetCashProvidedByUsedInOperatingActivities', 'operating'],
        ['NetCashProvidedByUsedInInvestingActivities', 'investing'],
        ['NetCashProvidedByUsedInFinancingActivities', 'financing'],
    ],
};

async function getSECCompanyFacts(cik) {
    const cached = _secFactsCache.get(cik);
    if (cached && Date.now() < cached.expiry) return cached.data;
    const r = await httpRequest({
        url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
        headers: SEC_UA_HEADERS,
        timeout: 15000,
    });
    if (r.status !== 200) throw new Error(`SEC companyfacts HTTP ${r.status}`);
    const data = JSON.parse(r.body);
    _secFactsCache.set(cik, { data, expiry: Date.now() + SEC_FACTS_TTL });
    return data;
}

// Extrait les valeurs annuelles (FY 10-K) d'un concept XBRL us-gaap.
// Return: { year: value } dict, latest 5 years
function _extractAnnualFromConcept(facts, concepts) {
    for (const [conceptName] of [concepts].flat().map(c => Array.isArray(c) ? c : [c, null])) {
        const node = facts?.facts?.['us-gaap']?.[conceptName];
        if (!node || !node.units) continue;
        // On préfère USD
        const entries = node.units.USD || Object.values(node.units)[0] || [];
        if (!entries.length) continue;
        const byYear = {};
        entries.forEach(e => {
            // On garde seulement les 10-K annuels complets (fp=FY, form commence par 10-K)
            if (e.fp === 'FY' && typeof e.form === 'string' && e.form.startsWith('10-K') && e.fy && e.val != null) {
                // Priorité : on remplace seulement si on a un `end` plus récent pour le même fy
                const existing = byYear[e.fy];
                if (!existing || (e.end && (!existing.end || e.end > existing.end))) {
                    byYear[e.fy] = { val: e.val, end: e.end };
                }
            }
        });
        const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
        if (years.length === 0) continue;
        const out = {};
        years.slice(0, 5).reverse().forEach(y => { out[y] = byYear[y].val; });
        return out;
    }
    return {};
}

function buildStatementsFromSEC(facts) {
    const extract = (conceptList) => {
        // Try each concept name in order, use the first with data
        for (const [cn, field] of conceptList) {
            const byYear = _extractAnnualFromConcept(facts, cn);
            if (Object.keys(byYear).length) return { field, byYear };
        }
        return null;
    };

    // Collect per-statement
    const incomeMap = {}; const balanceMap = {}; const cashflowMap = {};
    const yearSet = new Set();

    // For each concept group with the same target field, use the first that returns data
    const pickByField = (conceptList, targetMap) => {
        const fieldResults = {};
        conceptList.forEach(([cn, field]) => {
            if (fieldResults[field]) return;   // already populated
            const byYear = _extractAnnualFromConcept(facts, cn);
            if (Object.keys(byYear).length) fieldResults[field] = byYear;
        });
        Object.entries(fieldResults).forEach(([field, byYear]) => {
            Object.entries(byYear).forEach(([y, v]) => {
                targetMap[y] = targetMap[y] || { year: +y };
                targetMap[y][field] = v;
                yearSet.add(+y);
            });
        });
    };
    pickByField(SEC_CONCEPTS.income, incomeMap);
    pickByField(SEC_CONCEPTS.balance, balanceMap);
    pickByField(SEC_CONCEPTS.cashflow, cashflowMap);

    const years = [...yearSet].sort((a, b) => a - b).slice(-5);
    const asArr = (map) => years.map(y => map[y] || { year: y });
    return {
        income: asArr(incomeMap),
        balance: asArr(balanceMap),
        cashflow: asArr(cashflowMap),
    };
}

// GET /api/sec/financials/:ticker → same shape as /api/yffinancials but from SEC EDGAR
app.get('/api/sec/financials/:ticker', async (req, res) => {
    const sym = req.params.ticker.toUpperCase();
    try {
        const map = await getSECTickerMap();
        const cik = map[sym];
        if (!cik) return res.status(404).json({ error: 'Ticker not found in SEC EDGAR', ticker: sym });

        const facts = await getSECCompanyFacts(cik);
        const stmts = buildStatementsFromSEC(facts);
        if (!stmts.income.length) throw new Error('No annual 10-K data available');

        res.json({
            ticker: sym,
            cik,
            name: facts.entityName || sym,
            source: 'sec-edgar',
            ...stmts,
        });
    } catch (e) {
        res.status(502).json({ error: 'SEC EDGAR failed', ticker: sym, details: e.message });
    }
});

// ═════════════════════════════════════════════════════════════════════════
// FRED — série économique (10Y UST par défaut pour le risk-free rate)
// ═════════════════════════════════════════════════════════════════════════
const _fredCache = new Map();
const FRED_TTL = 60 * 60 * 1000; // 1 h

// GET /api/fred/series/DGS10 → { id, latest: { date, value }, series: [...] }
app.get('/api/fred/series/:id', async (req, res) => {
    if (!FRED_KEY) return res.status(503).json({ error: 'FRED_KEY not configured in .env' });
    const id = req.params.id.toUpperCase();
    const cached = _fredCache.get(id);
    if (cached && Date.now() < cached.expiry) return res.json({ ...cached.data, _cached: true });
    try {
        // fredgraph endpoint returns a simple JSON (no signups needed beyond free key)
        const url = `https://fred.stlouisfed.org/graph/fredgraph.json?id=${encodeURIComponent(id)}&api_key=${FRED_KEY}&file_type=json`;
        const r = await httpRequest({ url, timeout: 10000 });
        if (r.status !== 200) throw new Error(`FRED HTTP ${r.status}`);
        const raw = JSON.parse(r.body);
        // fredgraph returns { observations: [{date, value}, ...] } OR a compact shape.
        const obs = raw?.observations || raw?.data || [];
        const series = obs
            .map(o => ({ date: o.date, value: o.value === '.' ? null : parseFloat(o.value) }))
            .filter(o => o.value != null);
        const latest = series[series.length - 1] || null;
        const out = { id, latest, series: series.slice(-260), source: 'fred' };
        _fredCache.set(id, { data: out, expiry: Date.now() + FRED_TTL });
        res.json(out);
    } catch (e) {
        res.status(502).json({ error: 'FRED failed', id, details: e.message });
    }
});

// ═════════════════════════════════════════════════════════════════════════
// Finnhub — news par ticker, news-sentiment, news général
// ═════════════════════════════════════════════════════════════════════════
const _finnhubCache = new Map();
const FINNHUB_TTL = 10 * 60 * 1000; // 10 min

async function _finnhubGet(pathAndQuery) {
    if (!FINNHUB_KEY) throw new Error('FINNHUB_KEY not configured');
    const url = `https://finnhub.io/api/v1${pathAndQuery}${pathAndQuery.includes('?') ? '&' : '?'}token=${FINNHUB_KEY}`;
    const r = await httpRequest({ url, timeout: 10000 });
    if (r.status !== 200) throw new Error(`Finnhub HTTP ${r.status} — ${r.body.slice(0, 100)}`);
    return JSON.parse(r.body);
}

// GET /api/finnhub/news/:ticker?days=7
app.get('/api/finnhub/news/:ticker', async (req, res) => {
    if (!FINNHUB_KEY) return res.status(503).json({ error: 'FINNHUB_KEY not configured in .env' });
    const sym = req.params.ticker.toUpperCase();
    const days = Math.max(1, Math.min(30, +req.query.days || 7));
    const cacheKey = `news_${sym}_${days}`;
    const cached = _finnhubCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) return res.json({ items: cached.data, _cached: true });
    try {
        const to = new Date().toISOString().slice(0, 10);
        const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
        const raw = await _finnhubGet(`/company-news?symbol=${encodeURIComponent(sym)}&from=${from}&to=${to}`);
        const items = (Array.isArray(raw) ? raw : []).slice(0, 20).map(n => ({
            id: n.id, sym, headline: n.headline, summary: n.summary,
            source: n.source, url: n.url, datetime: n.datetime, image: n.image,
            category: n.category,
        }));
        _finnhubCache.set(cacheKey, { data: items, expiry: Date.now() + FINNHUB_TTL });
        res.json({ items, source: 'finnhub' });
    } catch (e) {
        res.status(502).json({ error: 'Finnhub company-news failed', ticker: sym, details: e.message });
    }
});

// GET /api/finnhub/news-sentiment/:ticker
app.get('/api/finnhub/news-sentiment/:ticker', async (req, res) => {
    if (!FINNHUB_KEY) return res.status(503).json({ error: 'FINNHUB_KEY not configured in .env' });
    const sym = req.params.ticker.toUpperCase();
    const cacheKey = `sent_${sym}`;
    const cached = _finnhubCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) return res.json({ ...cached.data, _cached: true });
    try {
        const raw = await _finnhubGet(`/news-sentiment?symbol=${encodeURIComponent(sym)}`);
        const out = {
            ticker: sym,
            bullish_percent: raw?.sentiment?.bullishPercent ?? null,
            bearish_percent: raw?.sentiment?.bearishPercent ?? null,
            companyNewsScore: raw?.companyNewsScore ?? null,
            sectorAverageNewsScore: raw?.sectorAverageNewsScore ?? null,
            buzz_articles: raw?.buzz?.articlesInLastWeek ?? null,
            buzz_weeklyAverage: raw?.buzz?.weeklyAverage ?? null,
            source: 'finnhub',
        };
        _finnhubCache.set(cacheKey, { data: out, expiry: Date.now() + FINNHUB_TTL });
        res.json(out);
    } catch (e) {
        res.status(502).json({ error: 'Finnhub sentiment failed', ticker: sym, details: e.message });
    }
});

// GET /api/finnhub/news/general?category=general
app.get('/api/finnhub/news-general', async (req, res) => {
    if (!FINNHUB_KEY) return res.status(503).json({ error: 'FINNHUB_KEY not configured in .env' });
    const category = (req.query.category || 'general').toString();
    const cacheKey = `gen_${category}`;
    const cached = _finnhubCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) return res.json({ items: cached.data, _cached: true });
    try {
        const raw = await _finnhubGet(`/news?category=${encodeURIComponent(category)}`);
        const items = (Array.isArray(raw) ? raw : []).slice(0, 30).map(n => ({
            id: n.id, headline: n.headline, summary: n.summary,
            source: n.source, url: n.url, datetime: n.datetime, image: n.image,
            category: n.category,
        }));
        _finnhubCache.set(cacheKey, { data: items, expiry: Date.now() + FINNHUB_TTL });
        res.json({ items, source: 'finnhub' });
    } catch (e) {
        res.status(502).json({ error: 'Finnhub general-news failed', details: e.message });
    }
});

// ═════════════════════════════════════════════════════════════════════════
// Marketstack — EOD prix (fallback pour la volatilité historique)
// ═════════════════════════════════════════════════════════════════════════
const _marketstackCache = new Map();
const MARKETSTACK_TTL = 60 * 60 * 1000; // 1 h

// GET /api/marketstack/eod/:ticker?limit=252
app.get('/api/marketstack/eod/:ticker', async (req, res) => {
    if (!MARKETSTACK_KEY) return res.status(503).json({ error: 'MARKETSTACK_KEY not configured in .env' });
    const sym = req.params.ticker.toUpperCase();
    const limit = Math.max(1, Math.min(1000, +req.query.limit || 252));
    const cacheKey = `${sym}_${limit}`;
    const cached = _marketstackCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) return res.json({ ...cached.data, _cached: true });
    try {
        // Marketstack est en HTTP (pas HTTPS sur le plan free) — on gère les deux
        const url = `http://api.marketstack.com/v1/eod?access_key=${MARKETSTACK_KEY}&symbols=${encodeURIComponent(sym)}&limit=${limit}`;
        const r = await httpRequest({ url, timeout: 12000 });
        if (r.status !== 200) throw new Error(`Marketstack HTTP ${r.status}`);
        const raw = JSON.parse(r.body);
        const rows = (raw?.data || []).map(d => ({
            date: d.date?.slice(0, 10), close: d.close, open: d.open, high: d.high, low: d.low, volume: d.volume,
        })).reverse(); // chronological
        const out = { ticker: sym, rows, source: 'marketstack' };
        _marketstackCache.set(cacheKey, { data: out, expiry: Date.now() + MARKETSTACK_TTL });
        res.json(out);
    } catch (e) {
        res.status(502).json({ error: 'Marketstack failed', ticker: sym, details: e.message });
    }
});

// ═════════════════════════════════════════════════════════════════════════
// Alpha Vantage — polyvalent : EOD, financials, treasury yield, sentiment
// Plan gratuit: 25 requêtes/jour + 5/min → cache agressif (6h pour data stable)
// ═════════════════════════════════════════════════════════════════════════
const _alphaCache = new Map();
const ALPHA_TTL_LONG = 6 * 60 * 60 * 1000;   // 6h (financials, treasury)
const ALPHA_TTL_SHORT = 15 * 60 * 1000;      // 15 min (news, intraday)
const ALPHA_BASE = 'https://www.alphavantage.co/query';

async function _alphaGet(params, cacheKey, ttl) {
    if (!ALPHAVANTAGE_KEY) throw new Error('ALPHAVANTAGE_KEY not configured');
    const cached = _alphaCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) return { data: cached.data, cached: true };
    const qs = new URLSearchParams({ ...params, apikey: ALPHAVANTAGE_KEY }).toString();
    const r = await httpRequest({ url: `${ALPHA_BASE}?${qs}`, timeout: 12000 });
    if (r.status !== 200) throw new Error(`AlphaVantage HTTP ${r.status}`);
    const data = JSON.parse(r.body);
    // Alpha Vantage renvoie 200 OK même quand le rate limit est atteint — détecter
    if (data.Note || data.Information) {
        const msg = data.Note || data.Information;
        if (/rate limit|call frequency|premium/i.test(msg)) {
            throw new Error(`AlphaVantage rate limit: ${msg.slice(0, 120)}`);
        }
    }
    _alphaCache.set(cacheKey, { data, expiry: Date.now() + ttl });
    return { data, cached: false };
}

// GET /api/alpha/eod/:ticker → historique EOD (compact = 100 jours)
app.get('/api/alpha/eod/:ticker', async (req, res) => {
    if (!ALPHAVANTAGE_KEY) return res.status(503).json({ error: 'ALPHAVANTAGE_KEY not configured in .env' });
    const sym = req.params.ticker.toUpperCase();
    const outputsize = req.query.full === '1' ? 'full' : 'compact';
    try {
        const { data, cached } = await _alphaGet(
            { function: 'TIME_SERIES_DAILY', symbol: sym, outputsize },
            `eod_${sym}_${outputsize}`, ALPHA_TTL_LONG
        );
        const series = data['Time Series (Daily)'] || {};
        const rows = Object.entries(series).map(([date, v]) => ({
            date,
            open: +v['1. open'], high: +v['2. high'], low: +v['3. low'],
            close: +v['4. close'], volume: +v['5. volume'],
        })).sort((a, b) => a.date.localeCompare(b.date));
        res.json({ ticker: sym, rows, source: 'alphavantage', _cached: cached });
    } catch (e) {
        res.status(502).json({ error: 'AlphaVantage EOD failed', ticker: sym, details: e.message });
    }
});

// GET /api/alpha/overview/:ticker → ratios (P/E, P/B, ROE, etc.)
app.get('/api/alpha/overview/:ticker', async (req, res) => {
    if (!ALPHAVANTAGE_KEY) return res.status(503).json({ error: 'ALPHAVANTAGE_KEY not configured in .env' });
    const sym = req.params.ticker.toUpperCase();
    try {
        const { data, cached } = await _alphaGet(
            { function: 'OVERVIEW', symbol: sym },
            `ov_${sym}`, ALPHA_TTL_LONG
        );
        if (!data.Symbol) return res.status(404).json({ error: 'ticker not found', ticker: sym });
        const num = x => { const v = parseFloat(x); return isFinite(v) ? v : null; };
        const out = {
            ticker: sym,
            name: data.Name, sector: data.Sector, industry: data.Industry,
            peRatio: num(data.PERatio), pegRatio: num(data.PEGRatio), pbRatio: num(data.PriceToBookRatio),
            priceToSales: num(data.PriceToSalesRatioTTM),
            dividendYield: num(data.DividendYield), dividendPerShare: num(data.DividendPerShare),
            beta: num(data.Beta), eps: num(data.EPS),
            profitMargin: num(data.ProfitMargin), operatingMargin: num(data.OperatingMarginTTM),
            roa: num(data.ReturnOnAssetsTTM), roe: num(data.ReturnOnEquityTTM),
            revenue: num(data.RevenueTTM), grossProfit: num(data.GrossProfitTTM),
            marketCap: num(data.MarketCapitalization), bookValue: num(data.BookValue),
            week52High: num(data['52WeekHigh']), week52Low: num(data['52WeekLow']),
            analystTargetPrice: num(data.AnalystTargetPrice),
            source: 'alphavantage', _cached: cached,
        };
        res.json(out);
    } catch (e) {
        res.status(502).json({ error: 'AlphaVantage overview failed', ticker: sym, details: e.message });
    }
});

// GET /api/alpha/financials/:ticker → income/balance/cashflow (fallback SEC/Yahoo)
app.get('/api/alpha/financials/:ticker', async (req, res) => {
    if (!ALPHAVANTAGE_KEY) return res.status(503).json({ error: 'ALPHAVANTAGE_KEY not configured in .env' });
    const sym = req.params.ticker.toUpperCase();
    try {
        const [{ data: inc }, { data: bal }, { data: cf }] = await Promise.all([
            _alphaGet({ function: 'INCOME_STATEMENT', symbol: sym }, `inc_${sym}`, ALPHA_TTL_LONG),
            _alphaGet({ function: 'BALANCE_SHEET', symbol: sym }, `bal_${sym}`, ALPHA_TTL_LONG),
            _alphaGet({ function: 'CASH_FLOW', symbol: sym }, `cf_${sym}`, ALPHA_TTL_LONG),
        ]);
        const num = x => { const v = parseFloat(x); return isFinite(v) ? v : null; };
        const yr = row => (row?.fiscalDateEnding || '').slice(0, 4);
        const pick = (arr, n = 5) => (arr || []).slice(0, n);
        const income = pick(inc?.annualReports).map(r => ({
            year: yr(r),
            revenue: num(r.totalRevenue),
            grossProfit: num(r.grossProfit),
            operatingIncome: num(r.operatingIncome),
            netIncome: num(r.netIncome),
            eps: num(r.reportedEPS) || null,
        }));
        const balance = pick(bal?.annualReports).map(r => ({
            year: yr(r),
            totalAssets: num(r.totalAssets),
            totalLiab: num(r.totalLiabilities),
            equity: num(r.totalShareholderEquity),
        }));
        const cashflow = pick(cf?.annualReports).map(r => ({
            year: yr(r),
            operating: num(r.operatingCashflow),
            investing: num(r.cashflowFromInvestment),
            financing: num(r.cashflowFromFinancing),
        }));
        res.json({ ticker: sym, income, balance, cashflow, source: 'alphavantage' });
    } catch (e) {
        res.status(502).json({ error: 'AlphaVantage financials failed', ticker: sym, details: e.message });
    }
});

// GET /api/alpha/treasury?maturity=10year → taux UST (fallback FRED DGS10)
app.get('/api/alpha/treasury', async (req, res) => {
    if (!ALPHAVANTAGE_KEY) return res.status(503).json({ error: 'ALPHAVANTAGE_KEY not configured in .env' });
    const maturity = (req.query.maturity || '10year').toString();
    try {
        const { data, cached } = await _alphaGet(
            { function: 'TREASURY_YIELD', interval: 'daily', maturity },
            `treas_${maturity}`, ALPHA_TTL_LONG
        );
        const rows = (data.data || []).filter(d => d.value !== '.').map(d => ({
            date: d.date, value: +d.value,
        }));
        const latest = rows[0] || null;
        res.json({ maturity, latest, rows: rows.slice(0, 30), source: 'alphavantage', _cached: cached });
    } catch (e) {
        res.status(502).json({ error: 'AlphaVantage treasury failed', details: e.message });
    }
});

// GET /api/alpha/news-sentiment?tickers=AAPL,MSFT → news + sentiment agrégé
app.get('/api/alpha/news-sentiment', async (req, res) => {
    if (!ALPHAVANTAGE_KEY) return res.status(503).json({ error: 'ALPHAVANTAGE_KEY not configured in .env' });
    const tickers = (req.query.tickers || '').toString().toUpperCase();
    const topics = (req.query.topics || '').toString();
    if (!tickers && !topics) return res.status(400).json({ error: 'tickers or topics required' });
    const params = { function: 'NEWS_SENTIMENT', limit: '50' };
    if (tickers) params.tickers = tickers;
    if (topics) params.topics = topics;
    try {
        const { data, cached } = await _alphaGet(
            params, `news_${tickers}_${topics}`, ALPHA_TTL_SHORT
        );
        const items = (data.feed || []).slice(0, 30).map(n => ({
            title: n.title, url: n.url, source: n.source, time_published: n.time_published,
            summary: n.summary, overall_sentiment_score: +n.overall_sentiment_score,
            overall_sentiment_label: n.overall_sentiment_label,
            ticker_sentiment: (n.ticker_sentiment || []).map(t => ({
                ticker: t.ticker, score: +t.ticker_sentiment_score, label: t.ticker_sentiment_label,
                relevance: +t.relevance_score,
            })),
        }));
        res.json({ items, sentiment_score_definition: data.sentiment_score_definition, source: 'alphavantage', _cached: cached });
    } catch (e) {
        res.status(502).json({ error: 'AlphaVantage news-sentiment failed', details: e.message });
    }
});

// ═════════════════════════════════════════════════════════════════════════
// REFINITIV / LSEG DATA PLATFORM (RDP) — Données temps réel + fondamentaux
// Docs: https://developers.lseg.com/en/api-catalog/refinitiv-data-platform
// Auth: OAuth2 V1 (Password Grant) avec App Key + username + password
// ═════════════════════════════════════════════════════════════════════════
const RDP_BASE   = 'https://api.refinitiv.com';
const RDP_AUTH   = `${RDP_BASE}/auth/oauth2/v1/token`;

// ── Token cache ─────────────────────────────────────────────────────────
let _rdpToken       = null;
let _rdpTokenExpiry = 0;
let _rdpRefreshToken = null;

async function getRDPToken() {
    if (_rdpToken && Date.now() < _rdpTokenExpiry - 30000) return _rdpToken;

    if (!RDP_APP_KEY || !RDP_USERNAME || !RDP_PASSWORD)
        throw new Error('RDP credentials not configured in .env (RDP_APP_KEY, RDP_USERNAME, RDP_PASSWORD required)');

    let bodyParams;
    if (_rdpRefreshToken) {
        bodyParams = new URLSearchParams({
            grant_type:    'refresh_token',
            refresh_token: _rdpRefreshToken,
            client_id:     RDP_APP_KEY,
        });
    } else {
        bodyParams = new URLSearchParams({
            grant_type: 'password',
            scope:      'trapi',
            username:   RDP_USERNAME,
            password:   RDP_PASSWORD,
            client_id:  RDP_APP_KEY,
            takeExclusiveSignOnControl: 'true',
        });
    }

    const r = await _httpRDP({
        url: RDP_AUTH,
        method: 'POST',
        headers: {
            'Content-Type':  'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(`${RDP_APP_KEY}:`).toString('base64'),
        },
        body: bodyParams.toString(),
        timeout: 12000,
    });

    if (r.status !== 200) {
        // If refresh token expired, clear it and retry with password
        if (_rdpRefreshToken && r.status === 400) {
            _rdpRefreshToken = null;
            return getRDPToken();
        }
        const errBody = (() => { try { return JSON.parse(r.body); } catch { return { raw: r.body?.slice(0,200) }; } })();
        throw new Error(`RDP auth failed (${r.status}): ${errBody.error_description || errBody.error || JSON.stringify(errBody)}`);
    }

    const tok = JSON.parse(r.body);
    _rdpToken        = tok.access_token;
    _rdpRefreshToken = tok.refresh_token || null;
    // expires_in is in seconds; default to 300s if missing
    _rdpTokenExpiry  = Date.now() + ((tok.expires_in || 300) * 1000);
    console.log(`[RDP] Token refreshed ✓  expires in ${tok.expires_in || '?'}s`);
    return _rdpToken;
}

// Patch httpRequest to support POST with body
const _origHttpRequest = httpRequest;
async function httpRequestExt({ url, method = 'GET', headers = {}, body = null, timeout = 10000 }) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const client = u.protocol === 'https:' ? https : http;
        const bodyBuf = body ? Buffer.from(body, 'utf8') : null;
        const req = client.request({
            hostname: u.hostname,
            port:     u.port || (u.protocol === 'https:' ? 443 : 80),
            path:     u.pathname + u.search,
            method,
            headers: {
                'User-Agent': UA,
                'Accept':     'application/json',
                ...(bodyBuf ? { 'Content-Length': bodyBuf.length } : {}),
                ...headers,
            },
            timeout,
        }, (resp) => {
            let data = '';
            resp.on('data', c => data += c);
            resp.on('end', () => resolve({ status: resp.statusCode, headers: resp.headers, body: data }));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        if (bodyBuf) req.write(bodyBuf);
        req.end();
    });
}
// Override httpRequest for RDP use
const _httpRDP = httpRequestExt;

// ── Ticker → RIC mapper ─────────────────────────────────────────────────
const _NASDAQ = new Set(['AAPL','MSFT','AMZN','GOOGL','GOOG','META','NVDA','TSLA','AMD','AVGO',
    'INTC','QCOM','CSCO','ADBE','NFLX','COST','ISRG','REGN','VRTX','PYPL','SBUX','LRCX','KLAC',
    'SNPS','CDNS','MRVL','FTNT','PANW','CRWD','ZS','MDB','DDOG','SNOW','NET','PLTR','COIN','ABNB',
    'BIIB','ILMN','IDXX','ALGN','CTSH','FISV','PAYX','FAST','ODFL','CSGP','CTAS','MCHP','AMAT',
    'ASML','TXN','ORCL','CRM','NOW','WDAY','TEAM','ZM','DOCU','TWLO','HUBS','OKTA','SPLK','MU',
    'WDC','STX','NXPI','SWKS','QRVO','XLNX','MPWR','ENPH','SEDG','FSLR','POWI','WOLF','ON',
    'SMCI','AMBA','SLAB','SIMO','CRUS','MTSI','FORM','ACLS','COHU','ICHR','KLIC','RMBS','CEVA',
    'POWI','TTMI','VIAV','VCTR','DIOD','LYTS','MCRI','MRAM','PLAB','PRGS','SIFY']);
const _NYSE   = new Set(['JNJ','UNH','PFE','ABBV','BMY','MRK','LLY','CVX','XOM','COP','SLB','HAL',
    'BAC','JPM','GS','MS','WFC','C','V','MA','AXP','BLK','SPGI','MCO','ICE','CME','UPS','FDX',
    'UNP','CSX','NSC','DE','CAT','MMM','GE','HON','RTX','LMT','BA','NOC','GD','AEP','DUK','SO',
    'NEE','D','EXC','NKE','VFC','RL','TJX','HD','LOW','WMT','TGT','KO','PEP','PG','CL','KMB',
    'GIS','K','HSY','MO','PM','WBA','CVS','HCA','ELV','EQIX','AMT','PLD','SPG','T','VZ','IBM',
    'WM','RSG','ECL','APD','LIN','PPG','SHW','EMR','ETN','ITW','PH','GWW','ROP','AME','FTV',
    'CARR','OTIS','TT','IR','XYL','AWK','AEE','DTE','FE','PPL','BRK.B','WMB','OKE','KMI','EP',
    'PSX','VLO','MPC','HES','DVN','FANG','EOG','PXD','APA','OXY','CF','MOS','NUE','STLD','RS']);

function tickerToRIC(ticker) {
    const t = ticker.toUpperCase();
    if (t.includes('.')) return t;
    if (_NASDAQ.has(t)) return t + '.O';
    if (_NYSE.has(t))   return t + '.N';
    return t + '.O'; // défaut NASDAQ pour les US techs non répertoriés
}

// ── RDP POST helper (pour les endpoints qui exigent POST) ────────────────
async function rdpPost(path, body, cacheKey, ttl) {
    const cached = _rdpCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) return { data: cached.data, _cached: true };

    const token = await getRDPToken();
    const raw   = JSON.stringify(body);

    async function doPost(tok) {
        return _httpRDP({
            url: `${RDP_BASE}${path}`,
            method: 'POST',
            headers: {
                'Authorization':    `Bearer ${tok}`,
                'Content-Type':     'application/json',
                'Content-Length':   Buffer.byteLength(raw),
                'x-tr-applicationid': RDP_APP_KEY,
            },
            body: raw,
            timeout: 12000,
        });
    }

    let r = await doPost(token);
    if (r.status === 401) {
        _rdpToken = null;
        const tok2 = await getRDPToken();
        r = await doPost(tok2);
    }
    if (r.status !== 200) throw new Error(`RDP POST ${r.status}: ${r.body?.slice(0, 200)}`);
    const data = JSON.parse(r.body);
    _rdpCache.set(cacheKey, { data, expiry: Date.now() + ttl });
    return { data, _cached: false };
}

// ── RDP GET helper — for interday-summaries (GET returns full range, POST returns 1 point) ─
async function rdpGet(path, queryParams, cacheKey, ttl) {
    const cached = _rdpCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) return { data: cached.data, _cached: true };

    const token = await getRDPToken();
    const qs = new URLSearchParams(queryParams).toString();

    async function doGet(tok) {
        return _httpRDP({
            url: `${RDP_BASE}${path}?${qs}`,
            method: 'GET',
            headers: {
                'Authorization':      `Bearer ${tok}`,
                'x-tr-applicationid': RDP_APP_KEY,
            },
            timeout: 15000,
        });
    }

    let r = await doGet(token);
    if (r.status === 401) {
        _rdpToken = null;
        r = await doGet(await getRDPToken());
    }
    if (r.status !== 200) throw new Error(`RDP GET ${r.status}: ${r.body?.slice(0, 200)}`);
    const data = JSON.parse(r.body);
    _rdpCache.set(cacheKey, { data, expiry: Date.now() + ttl });
    return { data, _cached: false };
}

// ── RDP Cache ───────────────────────────────────────────────────────────
const _rdpCache = new Map();
const RDP_TTL_QUOTE  = 60  * 1000;        // 1 min — quotes (dernier close J ou J-1)



// ── Helpers ─────────────────────────────────────────────────────────────
function rdpErr(res, sym, err) {
    console.error(`[RDP] Error for ${sym}:`, err.message);
    // Return 200 with error + empty data so front-end can fallback gracefully
    res.status(502).json({
        error:  'RDP failed',
        ticker: sym,
        details: err.message,
        hint: err.message.includes('credentials') || err.message.includes('auth')
            ? 'Ajoute RDP_USERNAME et RDP_PASSWORD dans .env'
            : 'Vérifie que ton App Key est valide et actif.',
    });
}

// ── GET /api/rdp/status — check credentials ─────────────────────────────
app.get('/api/rdp/status', async (req, res) => {
    const hasKey  = !!RDP_APP_KEY;
    const hasCred = !!(RDP_APP_KEY && RDP_USERNAME && RDP_PASSWORD);
    let tokenOk = false;
    let tokenErr = null;
    if (hasKey) {
        try { await getRDPToken(); tokenOk = true; } catch (e) { tokenErr = e.message; }
    }
    res.json({
        source:        'refinitiv-rdp',
        app_key_set:   hasKey,
        credentials_set: hasCred,
        token_ok:      tokenOk,
        token_error:   tokenErr,
        cached_token:  !!(_rdpToken && Date.now() < _rdpTokenExpiry),
    });
});

// ── Helper: parse interday-summaries response ────────────────────────────
function _parseInterdayRows(respArray) {
    const universe = (Array.isArray(respArray) ? respArray : [])[0] || {};
    const headers  = (universe.headers || []).map(h => h.name);
    const rows     = universe.data || [];
    const idx = f => headers.indexOf(f);
    const iDate = idx('DATE'), iClose = idx('TRDPRC_1'), iOpen = idx('OPEN_PRC');
    const iHigh = idx('HIGH_1'), iLow = idx('LOW_1'), iVol = idx('ACVOL_UNS');
    const iBid  = idx('BID'),    iAsk  = idx('ASK');

    // already chronological (oldest first) from API
    const sorted = [...rows].sort((a, b) => new Date(a[iDate] || 0) - new Date(b[iDate] || 0));

    const pick = (row, i) => i >= 0 && row[i] != null ? +row[i] : null;
    const closes     = sorted.map(r => pick(r, iClose)).filter(v => v !== null);
    const opens      = sorted.map(r => pick(r, iOpen)).filter(v => v !== null);
    const highs      = sorted.map(r => pick(r, iHigh)).filter(v => v !== null);
    const lows       = sorted.map(r => pick(r, iLow)).filter(v => v !== null);
    const volumes    = sorted.map(r => pick(r, iVol)).filter(v => v !== null);
    const bids       = sorted.map(r => pick(r, iBid)).filter(v => v !== null);
    const asks       = sorted.map(r => pick(r, iAsk)).filter(v => v !== null);
    const timestamps = sorted.map(r => iDate >= 0 && r[iDate] ? Math.floor(new Date(r[iDate]).getTime() / 1000) : null).filter(v => v !== null);
    return { closes, opens, highs, lows, volumes, bids, asks, timestamps, rows: sorted, headers };
}

// ── GET /api/rdp/quote/:ticker ───────────────────────────────────────────
// Dernier prix disponible via l'historique interday (données du jour ou J-1)
app.get('/api/rdp/quote/:ticker', async (req, res) => {
    if (!RDP_APP_KEY) return res.status(503).json({ error: 'RDP_APP_KEY not configured' });
    const sym = req.params.ticker.toUpperCase();
    const ric = tickerToRIC(sym);
    const today    = new Date().toISOString().slice(0, 10);
    const weekAgo  = new Date(Date.now() - 8 * 86400000).toISOString().slice(0, 10);
    try {
        const { data, _cached } = await rdpGet(
            `/data/historical-pricing/v1/views/interday-summaries/${encodeURIComponent(ric)}`,
            { interval: 'P1D', start: weekAgo, end: today,
              fields: 'DATE,TRDPRC_1,OPEN_PRC,HIGH_1,LOW_1,ACVOL_UNS,BID,ASK' },
            `rdp_q_${ric}`, RDP_TTL_QUOTE
        );
        const parsed = _parseInterdayRows(data);
        const n = parsed.closes.length;
        if (n === 0) throw new Error('No price data returned');

        const last     = parsed.closes[n - 1];
        const prevClose = n > 1 ? parsed.closes[n - 2] : last;
        const chgAmt   = +(last - prevClose).toFixed(4);
        const chgPct   = prevClose ? +((chgAmt / prevClose) * 100).toFixed(4) : 0;
        const lastDate = parsed.timestamps.length ? new Date(parsed.timestamps[n - 1] * 1000).toISOString().slice(0, 10) : today;

        res.json({
            ticker: sym, ric, source: 'refinitiv-rdp', _cached,
            last, close: last, open: parsed.opens[n - 1] || null,
            high: parsed.highs[n - 1] || null, low: parsed.lows[n - 1] || null,
            volume: parsed.volumes[n - 1] || null,
            bid: parsed.bids[n - 1] || null, ask: parsed.asks[n - 1] || null,
            change: chgAmt, changePct: chgPct,
            previousClose: prevClose, date: lastDate,
        });
    } catch (e) { rdpErr(res, sym, e); }
});

// ── GET /api/rdp/fundamentals/:ticker ───────────────────────────────────
// Non accessible sur ce tier LSEG — fallback Yahoo Finance géré côté client
app.get('/api/rdp/fundamentals/:ticker', async (req, res) => {
    res.status(503).json({
        error: 'RDP fundamentals not available on this subscription tier',
        ticker: req.params.ticker.toUpperCase(),
        hint: 'Le plan LSEG académique ne donne pas accès à /fundamental-and-reference — Yahoo Finance sera utilisé en fallback.',
    });
});

// ── GET /api/rdp/esg/:ticker  (non accessible sur ce tier) ───────────────
app.get('/api/rdp/esg/:ticker', (_req, res) =>
    res.status(503).json({ error: 'RDP ESG not available on this subscription tier' })
);

// ── GET /api/rdp/estimates/:ticker  (non accessible sur ce tier) ─────────
app.get('/api/rdp/estimates/:ticker', (_req, res) =>
    res.status(503).json({ error: 'RDP estimates not available on this subscription tier' })
);

// ── GET /api/rdp/historical/:ticker ─────────────────────────────────────
// Historique de prix journalier — 10 ans par défaut (≈2520 séances)
app.get('/api/rdp/historical/:ticker', async (req, res) => {
    if (!RDP_APP_KEY) return res.status(503).json({ error: 'RDP_APP_KEY not configured' });
    const sym   = req.params.ticker.toUpperCase();
    const ric   = tickerToRIC(sym);
    const years = Math.min(parseInt(req.query.years) || 10, 30);
    const TTL_HIST = 4 * 60 * 60 * 1000; // 4 h
    const today    = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - years * 365.25 * 86400000).toISOString().slice(0, 10);
    try {
        const { data, _cached } = await rdpGet(
            `/data/historical-pricing/v1/views/interday-summaries/${encodeURIComponent(ric)}`,
            { interval: 'P1D', start: startDate, end: today,
              fields: 'DATE,TRDPRC_1,OPEN_PRC,HIGH_1,LOW_1,ACVOL_UNS' },
            `rdp_hist_${ric}_${years}y`, TTL_HIST
        );
        const parsed = _parseInterdayRows(data);
        res.json({
            ticker: sym, ric, source: 'refinitiv-rdp', _cached,
            years, count: parsed.closes.length,
            closes: parsed.closes, opens: parsed.opens, highs: parsed.highs,
            lows: parsed.lows, volumes: parsed.volumes, timestamps: parsed.timestamps,
        });
    } catch (e) { rdpErr(res, sym, e); }
});

// ── GET /api/rdp/search?q=Apple ─────────────────────────────────────────
// Recherche de RIC / ticker via EquityQuotes view (retourne le RIC)
app.get('/api/rdp/search', async (req, res) => {
    if (!RDP_APP_KEY) return res.status(503).json({ error: 'RDP_APP_KEY not configured' });
    const q = (req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Missing q parameter' });
    try {
        const { data, _cached } = await rdpPost(
            '/discovery/search/v1/',
            { View: 'EquityQuotes', Query: q, Top: 10 },
            `rdp_search_${q.toLowerCase()}`, 5 * 60 * 1000
        );
        const hits = (data?.Hits || []).map(h => ({
            ric:        h.RIC,
            ticker:     h.RIC?.replace(/\.[A-Z]+$/, '') || h.RIC,
            name:       h.DocumentTitle || h.CompanyName || '',
            exchange:   h.ExchangeName || '',
            assetClass: h.AssetClass || 'Equity',
            currency:   h.Currency || '',
        })).filter(h => h.ric);
        res.json({ query: q, hits, source: 'refinitiv-rdp', _cached });
    } catch (e) { rdpErr(res, q, e); }
});

// ── GET /api/rdp/metrics/:ticker ────────────────────────────────────────
// Ratios quantitatifs calculés depuis les prix historiques Refinitiv (1 an)
// Beta, volatilité, Sharpe, max drawdown, momentum, 52W high/low
app.get('/api/rdp/metrics/:ticker', async (req, res) => {
    if (!RDP_APP_KEY) return res.status(503).json({ error: 'RDP_APP_KEY not configured' });
    const sym  = req.params.ticker.toUpperCase();
    const ric  = tickerToRIC(sym);
    const TTL  = 60 * 60 * 1000; // 1 h
    const today   = new Date().toISOString().slice(0, 10);
    const yr1     = new Date(Date.now() - 366 * 86400000).toISOString().slice(0, 10);
    const cacheKey = `rdp_metrics_${ric}`;
    const cached = _rdpCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) return res.json({ ...cached.data, _cached: true });

    try {
        // Fetch stock + S&P 500 (SPY.N) in parallel — GET returns full date range, POST only returns 1 point
        const histParams = { interval: 'P1D', start: yr1, end: today, fields: 'DATE,TRDPRC_1' };
        const [stockRes, mktRes] = await Promise.all([
            rdpGet(`/data/historical-pricing/v1/views/interday-summaries/${encodeURIComponent(ric)}`, histParams, `_tmp_s_${ric}`, 3600000),
            rdpGet('/data/historical-pricing/v1/views/interday-summaries/SPY.N', histParams, '_tmp_spy', 3600000),
        ]);

        const getCloses = (d) => {
            const univ = (Array.isArray(d) ? d : [])[0] || {};
            const hi = (univ.headers||[]).findIndex(h=>h.name==='TRDPRC_1');
            const di = (univ.headers||[]).findIndex(h=>h.name==='DATE');
            return [...(univ.data||[])].sort((a,b)=>new Date(a[di])-new Date(b[di])).map(r=>+r[hi]).filter(v=>v>0);
        };

        const stockPx = getCloses(stockRes.data);
        const mktPx   = getCloses(mktRes.data);
        if (stockPx.length < 20) throw new Error('Not enough price data');

        const logRet = (px) => px.slice(1).map((p,i)=>Math.log(p/px[i]));
        const sRet   = logRet(stockPx);
        const DAYS   = 252;

        // ── Volatilité annualisée (1Y)
        const mean = (a) => a.reduce((s,v)=>s+v,0)/a.length;
        const std  = (a) => { const m=mean(a); return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/(a.length-1)); };
        const vol1y = std(sRet) * Math.sqrt(DAYS) * 100;

        // ── Beta vs S&P 500
        let beta = null;
        const mRet = logRet(mktPx);
        const n = Math.min(sRet.length, mRet.length);
        if (n >= 20) {
            const sr = sRet.slice(-n), mr = mRet.slice(-n);
            const ms = mean(sr), mm = mean(mr);
            const cov = sr.reduce((s,v,i)=>s+(v-ms)*(mr[i]-mm),0)/(n-1);
            const varM = mr.reduce((s,v)=>s+(v-mm)**2,0)/(n-1);
            beta = varM > 0 ? +(cov/varM).toFixed(4) : null;
        }

        // ── Max Drawdown (1Y)
        let peak = stockPx[0], maxDD = 0;
        for (const p of stockPx) {
            if (p > peak) peak = p;
            const dd = (peak - p) / peak;
            if (dd > maxDD) maxDD = dd;
        }

        // ── Sharpe (1Y, rf=4%)
        const rf    = 0.04 / DAYS;
        const excess = sRet.map(r => r - rf);
        const sharpe = std(excess) > 0 ? +(mean(excess) / std(excess) * Math.sqrt(DAYS)).toFixed(4) : null;

        // ── Momentum (retours cumulatifs)
        const cumRet = (days) => {
            const slice = sRet.slice(-Math.min(days, sRet.length));
            return +(slice.reduce((s,v)=>s+v,0)*100).toFixed(2);
        };

        // ── 52W High / Low
        const w52 = stockPx.slice(-DAYS);
        const high52 = +Math.max(...w52).toFixed(4);
        const low52  = +Math.min(...w52).toFixed(4);

        const result = {
            ticker: sym, ric, source: 'refinitiv-rdp-computed',
            priceCount: stockPx.length,
            vol1y: +vol1y.toFixed(2),
            beta,
            maxDrawdown: +(maxDD*100).toFixed(2),
            sharpe1y: sharpe,
            momentum1m:  cumRet(21),
            momentum3m:  cumRet(63),
            momentum6m:  cumRet(126),
            momentum12m: cumRet(252),
            high52w: high52,
            low52w:  low52,
            lastClose: stockPx[stockPx.length-1],
        };
        _rdpCache.set(cacheKey, { data: result, expiry: Date.now() + TTL });
        res.json(result);
    } catch (e) { rdpErr(res, sym, e); }
});

// ── GET /api/rdp/combined/:ticker ───────────────────────────────────────
// Quote + historique en un seul appel
app.get('/api/rdp/combined/:ticker', async (req, res) => {
    if (!RDP_APP_KEY) return res.status(503).json({ error: 'RDP_APP_KEY not configured' });
    const sym = req.params.ticker.toUpperCase();
    const safeGet = async (url) => {
        try { const r = await fetch(`http://localhost:${PORT}${url}`); return await r.json(); }
        catch { return null; }
    };
    const [quote, historical] = await Promise.allSettled([
        safeGet(`/api/rdp/quote/${sym}`),
        safeGet(`/api/rdp/historical/${sym}`),
    ]);
    res.json({ ticker: sym, source: 'refinitiv-rdp', quote: quote.value, historical: historical.value });
});

// ═════════════════════════════════════════════════════════════════════════
// SCREENER — Dynamic stock discovery by sector via Yahoo Finance
// ═════════════════════════════════════════════════════════════════════════
const _screenerCache = new Map();
const SCREENER_TTL = 60 * 60 * 1000; // 1h

// Normalize sector names (sidebar uses short names, API uses full names)
const SECTOR_ALIASES = {
    'tech': 'Technology', 'technology': 'Technology',
    'healthcare': 'Healthcare', 'health': 'Healthcare',
    'finance': 'Finance', 'financial': 'Finance', 'financials': 'Finance', 'financial services': 'Finance',
    'energy': 'Energy',
    'consumer': 'Consumer', 'consumer cyclical': 'Consumer', 'consumer defensive': 'Consumer',
    'real estate': 'Real Estate', 'realestate': 'Real Estate',
    'industrials': 'Industrials', 'industrial': 'Industrials',
    'materials': 'Materials', 'basic materials': 'Materials',
    'utilities': 'Utilities',
    'communication': 'Technology', 'communication services': 'Technology',
};

function normalizeSector(raw) {
    if (!raw) return raw;
    const key = raw.trim().toLowerCase();
    return SECTOR_ALIASES[key] || raw;
}

// Sector → Yahoo screener query mapping
const SECTOR_QUERIES = {
    'Technology':   ['technology stocks', 'software stocks', 'semiconductor stocks'],
    'Healthcare':   ['healthcare stocks', 'pharmaceutical stocks', 'biotech stocks'],
    'Finance':      ['financial stocks', 'banking stocks', 'insurance stocks'],
    'Energy':       ['energy stocks', 'oil gas stocks'],
    'Consumer':     ['consumer stocks', 'retail stocks', 'consumer staples stocks'],
    'Real Estate':  ['real estate stocks', 'REIT stocks'],
    'Industrials':  ['industrial stocks', 'aerospace defense stocks'],
    'Materials':    ['materials stocks', 'mining stocks', 'chemicals stocks'],
    'Utilities':    ['utilities stocks', 'electric utilities stocks'],
};

// Sector ETF tickers for constituent discovery
const SECTOR_ETFS = {
    'Technology': 'XLK', 'Healthcare': 'XLV', 'Finance': 'XLF',
    'Energy': 'XLE', 'Consumer': 'XLY', 'Real Estate': 'XLRE',
    'Industrials': 'XLI', 'Materials': 'XLB', 'Utilities': 'XLU',
};

app.get('/api/screener/:sector', async (req, res) => {
    const rawSector = decodeURIComponent(req.params.sector);
    const sector = normalizeSector(rawSector);
    const limit = Math.min(parseInt(req.query.limit) || 60, 100);
    const cacheKey = `scr_${sector}_${limit}`;
    const cached = _screenerCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) return res.json({ ...cached.data, _cached: true });

    const queries = SECTOR_QUERIES[sector] || [`${sector} stocks`];
    const seen = new Set();
    const results = [];

    // Strategy 1: Yahoo Finance search for sector stocks
    for (const q of queries) {
        if (results.length >= limit) break;
        try {
            const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=25&newsCount=0&lang=en-US&region=US`;
            const r = await httpRequest({ url, timeout: 6000 });
            if (r.status === 200) {
                const data = JSON.parse(r.body);
                (data.quotes || []).forEach(q => {
                    if (q.quoteType === 'EQUITY' && q.symbol && !seen.has(q.symbol) && !q.symbol.includes('.')) {
                        seen.add(q.symbol);
                        results.push({
                            sym: q.symbol, name: q.shortname || q.longname || q.symbol,
                            exchange: q.exchDisp || q.exchange || '', sector,
                        });
                    }
                });
            }
        } catch (_) {}
    }

    // Strategy 2: Get ETF holdings via YF quote for the sector ETF
    const etf = SECTOR_ETFS[sector];
    if (etf && results.length < limit) {
        try {
            const { crumb, cookie } = await getYFCrumb();
            const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${etf}?modules=topHoldings&crumb=${encodeURIComponent(crumb)}`;
            const r = await httpRequest({ url, headers: { 'Cookie': cookie }, timeout: 8000 });
            if (r.status === 200) {
                const data = JSON.parse(r.body);
                const holdings = data?.quoteSummary?.result?.[0]?.topHoldings?.holdings || [];
                holdings.forEach(h => {
                    const sym = h.symbol;
                    if (sym && !seen.has(sym) && !sym.includes('.')) {
                        seen.add(sym);
                        results.push({ sym, name: h.holdingName || sym, exchange: '', sector });
                    }
                });
            }
        } catch (_) {}
    }

    // Strategy 3: Add well-known stocks from a curated list per sector
    const SECTOR_TICKERS = {
        'Technology': ['AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','AMD','AVGO','CRM','ADBE','INTC','ORCL','CSCO','QCOM','TXN','NOW','INTU','AMAT','MU','LRCX','KLAC','SNPS','CDNS','PANW','CRWD','FTNT','NET','PLTR','SNOW','DDOG','MDB','ZS','TEAM','WDAY','SQ','SHOP','MRVL','NXPI','ON','SMCI'],
        'Healthcare': ['UNH','JNJ','LLY','PFE','ABBV','MRK','TMO','ABT','MDT','DHR','BMY','AMGN','GILD','ISRG','VRTX','REGN','SYK','BDX','ZTS','EW','IQV','HUM','CI','CVS','HCA','IDXX','DXCM','MRNA','BIIB','ALGN'],
        'Finance': ['JPM','BAC','WFC','GS','MS','BLK','SPGI','C','AXP','MCO','ICE','CME','SCHW','USB','PNC','TFC','BK','AIG','MET','PRU','TRV','AON','MMC','COIN','V','MA','FIS','FISV','PYPL','SQ'],
        'Energy': ['XOM','CVX','COP','SLB','EOG','PXD','MPC','VLO','PSX','OXY','DVN','HAL','FANG','HES','WMB','KMI','OKE','LNG','BKR','TRGP'],
        'Consumer': ['WMT','HD','COST','NKE','MCD','SBUX','TGT','LOW','TJX','AMZN','BKNG','CMG','YUM','DPZ','LULU','ROST','DG','DLTR','BBY','KO','PEP','PG','CL','KMB','GIS','K','HSY','MO','PM','EL'],
        'Real Estate': ['PLD','AMT','EQIX','CCI','PSA','SPG','O','DLR','WELL','VICI','ARE','MAA','UDR','AVB','EQR','ESS','SUI','PEAK','KIM','REG'],
        'Industrials': ['GE','CAT','HON','UNP','UPS','RTX','LMT','BA','DE','MMM','GD','NOC','ITW','EMR','ETN','PH','ROK','FDX','CSX','NSC','WM','RSG','CARR','OTIS','TT','IR','AME','GWW'],
        'Materials': ['LIN','APD','SHW','ECL','DD','NEM','FCX','NUE','STLD','CF','MOS','PPG','VMC','MLM','IFF','ALB','CE','EMN','SEE','IP'],
        'Utilities': ['NEE','SO','DUK','D','AEP','EXC','SRE','ED','WEC','XEL','ES','AEE','CMS','DTE','PPL','FE','AWK','ATO','NI','PNW'],
    };
    const curated = SECTOR_TICKERS[sector] || [];
    curated.forEach(sym => {
        if (!seen.has(sym)) { seen.add(sym); results.push({ sym, name: sym, exchange: '', sector }); }
    });

    const output = { sector, count: results.length, stocks: results.slice(0, limit), source: 'yahoo-search+curated' };
    _screenerCache.set(cacheKey, { data: output, expiry: Date.now() + SCREENER_TTL });
    res.json(output);
});

// ═════════════════════════════════════════════════════════════════════════
// BATCH FUNDAMENTALS — Score stocks by ratios
// ═════════════════════════════════════════════════════════════════════════
app.post('/api/screen/fundamentals', async (req, res) => {
    const { symbols = [], strategy = 'balanced' } = req.body || {};
    if (!symbols.length) return res.status(400).json({ error: 'No symbols provided' });
    const batch = symbols.slice(0, 80); // max 80 at a time
    const results = [];

    // Pre-warm YF crumb once before the batch
    try { await getYFCrumb(); } catch (e) { console.warn('[screen] Crumb warm-up failed:', e.message); }

    // Fetch fundamentals in parallel batches of 4
    for (let i = 0; i < batch.length; i += 4) {
        const chunk = batch.slice(i, i + 4);
        const settled = await Promise.allSettled(chunk.map(async sym => {
            // Check cache first
            const cached = _yfSummaryCache.get(sym);
            if (cached && Date.now() < cached.expiry) return { sym, data: cached.data };

            // Try Yahoo Finance
            try {
                const modules = 'defaultKeyStatistics,financialData,summaryDetail,price,assetProfile';
                const d = await fetchQuoteSummary(sym, modules);
                const s = d?.quoteSummary?.result?.[0];
                if (s) { _yfSummaryCache.set(sym, { data: s, expiry: Date.now() + SUMMARY_TTL }); return { sym, data: s }; }
            } catch (e) { console.warn(`[screen] YF failed for ${sym}:`, e.message); }

            // Fallback: Alpha Vantage
            if (ALPHAVANTAGE_KEY) {
                try {
                    const r = await httpRequest({
                        url: `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${sym}&apikey=${ALPHAVANTAGE_KEY}`,
                        timeout: 8000,
                    });
                    if (r.status === 200) {
                        const av = JSON.parse(r.body);
                        if (av.Symbol && !av.Note && !av.Information) {
                            const n = (v) => ({ raw: v && v !== 'None' && v !== '-' ? +v : null });
                            const summary = {
                                defaultKeyStatistics: { trailingPE: n(av.TrailingPE), priceToBook: n(av.PriceToBookRatio), enterpriseToEbitda: n(av.EVToEBITDA), beta: n(av.Beta), fiftyTwoWeekChange: n(av['52WeekChange']) },
                                financialData: { returnOnEquity: n(av.ReturnOnEquityTTM), returnOnAssets: n(av.ReturnOnAssetsTTM), profitMargins: n(av.ProfitMargin) },
                                summaryDetail: { dividendYield: n(av.DividendYield), trailingPE: n(av.TrailingPE), beta: n(av.Beta), fiftyTwoWeekHigh: n(av['52WeekHigh']) },
                                price: { shortName: av.Name, longName: av.Name, regularMarketPrice: n(av.AnalystTargetPrice || av.BookValue), regularMarketChangePercent: { raw: 0 } },
                                assetProfile: { sector: av.Sector, industry: av.Industry },
                                _source: 'alphavantage',
                            };
                            _yfSummaryCache.set(sym, { data: summary, expiry: Date.now() + SUMMARY_TTL * 6 });
                            return { sym, data: summary };
                        }
                    }
                } catch (_) {}
            }

            return { sym, data: null };
        }));
        settled.forEach(r => { if (r.status === 'fulfilled' && r.value.data) results.push(r.value); });
        if (i + 4 < batch.length) await new Promise(r => setTimeout(r, 600));
    }
    console.log(`[screen] Got fundamentals for ${results.length}/${batch.length} symbols`);

    // Extract ratios and compute scores
    const scored = results.map(({ sym, data }) => {
        const kv = data?.defaultKeyStatistics || {};
        const fd = data?.financialData || {};
        const sd = data?.summaryDetail || {};
        const pr = data?.price || {};
        const ap = data?.assetProfile || {};
        const r = v => v?.raw ?? null;
        const pct = v => v?.raw != null ? +(v.raw * 100).toFixed(2) : null;
        const mktCap = r(pr.marketCap) ?? r(sd.marketCap);

        const ratios = {
            pe: r(kv.trailingPE) ?? r(sd.trailingPE), pb: r(kv.priceToBook),
            ev: r(kv.enterpriseToEbitda), roe: pct(fd.returnOnEquity),
            roa: pct(fd.returnOnAssets), margin: pct(fd.profitMargins),
            de: r(fd.debtToEquity), cr: r(fd.currentRatio),
            fcf: mktCap && r(fd.freeCashflow) ? +((r(fd.freeCashflow) / mktCap) * 100).toFixed(2) : null,
            div: pct(sd.dividendYield), beta: r(sd.beta) ?? r(kv.beta),
        };

        // Compute scores (0-100 scale)
        const norm = (val, low, high, invert) => {
            if (val == null) return 50;
            const clamped = Math.max(low, Math.min(high, val));
            const pctVal = (clamped - low) / (high - low);
            return invert ? (1 - pctVal) * 100 : pctVal * 100;
        };

        const quality = (
            norm(ratios.roe, 0, 40, false) * 0.3 +
            norm(ratios.margin, 0, 40, false) * 0.25 +
            norm(ratios.cr, 0, 4, false) * 0.15 +
            norm(ratios.de, 0, 3, true) * 0.15 +
            norm(ratios.fcf, 0, 10, false) * 0.15
        );
        const value = (
            norm(ratios.pe, 0, 60, true) * 0.30 +
            norm(ratios.pb, 0, 10, true) * 0.25 +
            norm(ratios.ev, 0, 40, true) * 0.25 +
            norm(ratios.div, 0, 6, false) * 0.20
        );

        // Momentum from Yahoo price data
        const dayChange = r(pr.regularMarketChangePercent);
        const w52Change = r(kv.fiftyTwoWeekChange) ?? r(sd['52WeekChange']);
        const w52HighRatio = r(pr.regularMarketPrice) && r(sd.fiftyTwoWeekHigh)
            ? (r(pr.regularMarketPrice) / r(sd.fiftyTwoWeekHigh)) * 100 : null;
        const momentum = (
            norm(dayChange, -5, 5, false) * 0.15 +
            norm(w52Change != null ? w52Change * 100 : null, -30, 60, false) * 0.40 +
            norm(w52HighRatio, 60, 100, false) * 0.25 +
            norm(ratios.beta, 0, 2, true) * 0.20
        );

        let composite;
        if (strategy === 'quality') composite = quality * 0.7 + value * 0.2 + momentum * 0.1;
        else if (strategy === 'value') composite = quality * 0.2 + value * 0.7 + momentum * 0.1;
        else if (strategy === 'momentum') composite = quality * 0.2 + value * 0.1 + momentum * 0.7;
        else composite = quality * 0.4 + value * 0.35 + momentum * 0.25;

        return {
            sym, name: pr.shortName || pr.longName || sym,
            sector: ap.sector || '', industry: ap.industry || '',
            price: r(pr.regularMarketPrice) ?? r(sd.regularMarketPrice),
            marketCap: mktCap, currency: pr.currency || 'USD',
            ratios, scores: { quality: +quality.toFixed(1), value: +value.toFixed(1), momentum: +momentum.toFixed(1), composite: +composite.toFixed(1) },
        };
    });

    scored.sort((a, b) => b.scores.composite - a.scores.composite);
    res.json({ strategy, count: scored.length, stocks: scored });
});

// ═════════════════════════════════════════════════════════════════════════
// RSS NEWS AGGREGATOR — Multi-source financial news
// ═════════════════════════════════════════════════════════════════════════
const _rssCache = new Map();
const RSS_TTL = 10 * 60 * 1000; // 10 min

function parseXMLItems(xml, source) {
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
        const block = match[1];
        const get = tag => { const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`)); return m ? (m[1] || m[2] || '').trim() : ''; };
        const title = get('title').replace(/<[^>]+>/g, '');
        const link = get('link');
        const pubDate = get('pubDate');
        const desc = get('description').replace(/<[^>]+>/g, '').slice(0, 200);
        // Extract tickers from title/description
        const tickerMatch = (title + ' ' + desc).match(/\b[A-Z]{1,5}\b/g) || [];
        const tickers = [...new Set(tickerMatch.filter(t => t.length >= 2 && t.length <= 5 && !['THE','AND','FOR','WITH','FROM','THIS','THAT','WILL','HAVE','BEEN','MORE','ALSO','THAN','INTO','OVER','JUST','NEW','CEO','IPO','ETF','USD','GDP','SEC'].includes(t)))].slice(0, 3);
        if (title && link) {
            items.push({ title, link, description: desc, pubDate, source, tickers, providerPublishTime: pubDate ? Math.floor(new Date(pubDate).getTime() / 1000) : 0 });
        }
    }
    return items;
}

app.get('/api/rss/news', async (req, res) => {
    const ticker = (req.query.ticker || '').toUpperCase();
    const source = req.query.source || 'all';
    const cacheKey = `rss_${source}_${ticker}`;
    const cached = _rssCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) return res.json({ ...cached.data, _cached: true });

    const feeds = [];
    // Per-ticker Yahoo RSS
    if (ticker) {
        feeds.push({ url: `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${ticker}&region=US&lang=en-US`, source: 'Yahoo Finance' });
    }
    // General feeds
    if (source === 'all' || source === 'yahoo') {
        feeds.push({ url: 'https://finance.yahoo.com/news/rssindex', source: 'Yahoo Finance' });
    }
    if (source === 'all' || source === 'cnbc') {
        feeds.push({ url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', source: 'CNBC' });
    }
    if (source === 'all' || source === 'marketwatch') {
        feeds.push({ url: 'https://feeds.marketwatch.com/marketwatch/topstories/', source: 'MarketWatch' });
    }

    const allArticles = [];
    const seen = new Set();
    await Promise.allSettled(feeds.map(async feed => {
        try {
            const r = await httpRequest({ url: feed.url, timeout: 8000, headers: { 'Accept': 'application/rss+xml,application/xml,text/xml,*/*' } });
            if (r.status === 200) {
                const items = parseXMLItems(r.body, feed.source);
                items.forEach(item => { if (!seen.has(item.title)) { seen.add(item.title); allArticles.push(item); } });
            }
        } catch (_) {}
    }));

    allArticles.sort((a, b) => (b.providerPublishTime || 0) - (a.providerPublishTime || 0));
    const output = { articles: allArticles.slice(0, 30), count: allArticles.length, sources: [...new Set(allArticles.map(a => a.source))] };
    _rssCache.set(cacheKey, { data: output, expiry: Date.now() + RSS_TTL });
    res.json(output);
});

// ═════════════════════════════════════════════════════════════════════════
// Status endpoint — quelles sources sont configurées
// ═════════════════════════════════════════════════════════════════════════
app.get('/api/sources/status', (_req, res) => {
    res.json({
        sec_edgar: !!SEC_USER_AGENT && SEC_USER_AGENT !== 'QuantEdge (contact: user@example.com)',
        fred: !!FRED_KEY,
        finnhub: !!FINNHUB_KEY,
        marketstack: !!MARKETSTACK_KEY,
        alphavantage: !!ALPHAVANTAGE_KEY,
        yahoo: true,
        refinitiv: !!RDP_APP_KEY,
    });
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
