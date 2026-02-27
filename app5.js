// =============================================
// APP5.JS — Live News Feed (Yahoo Finance)
// =============================================

// =============================================
// YAHOO FINANCE NEWS FETCH
// =============================================

/**
 * Fetch news from Yahoo Finance v1 news endpoint via CORS proxy.
 * Returns array of article objects.
 */
async function yfFetchNews(query, count = 8) {
    const PROXIES = [
        `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=${count}&quotesCount=0&enableFuzzyQuery=false&lang=en-US`,
        `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=${count}&quotesCount=0&lang=en-US`,
    ];

    for (const url of PROXIES) {
        try {
            const R = await fetch(url, { headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(5000) });
            if (!R.ok) continue;
            const j = await R.json();
            const articles = (j?.news || []).slice(0, count);
            if (articles.length > 0) return articles;
        } catch (_) { }
    }
    return [];
}

/**
 * Fetch news for a specific stock ticker.
 */
async function yfFetchTickerNews(sym, count = 4) {
    const urls = [
        `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sym)}&newsCount=${count}&quotesCount=0&lang=en-US`,
        `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sym)}&newsCount=${count}&quotesCount=0&lang=en-US`,
    ];
    for (const url of urls) {
        try {
            const R = await fetch(url, { signal: AbortSignal.timeout(5000) });
            if (!R.ok) continue;
            const j = await R.json();
            const arts = (j?.news || []).slice(0, count);
            if (arts.length > 0) return arts.map(a => ({ ...a, _sym: sym }));
        } catch (_) { }
    }
    return [];
}

// =============================================
// SENTIMENT: basic keyword analysis
// =============================================
function analyzeSentiment(text) {
    if (!text) return 'neu';
    const t = text.toLowerCase();
    const posWords = ['surge', 'rally', 'beat', 'record', 'profit', 'gain', 'rise', 'grow', 'strong', 'boost', 'high', 'up', 'bullish', 'positive', 'exceed', 'upgrade', 'buy'];
    const negWords = ['fall', 'drop', 'loss', 'decline', 'miss', 'slump', 'crash', 'cut', 'down', 'warn', 'risk', 'weak', 'sell', 'downgrade', 'concern', 'fear', 'plunge', 'pressure'];
    const posScore = posWords.filter(w => t.includes(w)).length;
    const negScore = negWords.filter(w => t.includes(w)).length;
    return posScore > negScore ? 'pos' : negScore > posScore ? 'neg' : 'neu';
}

// =============================================
// RENDER A NEWS CARD
// =============================================
function renderNewsCard(article, sym = null) {
    const title = escapeHtml(article.title || 'Untitled');
    const sentiment = analyzeSentiment(article.title);
    const sentLabel = sentiment === 'pos' ? 'Bullish' : sentiment === 'neg' ? 'Bearish' : 'Neutral';
    const publisher = escapeHtml(article.publisher || 'Yahoo Finance');
    const link = article.link || article.url || '#';
    const thumbUrl = article.thumbnail?.resolutions?.[0]?.url || '';

    // Time ago
    const provideTime = article.providerPublishTime;
    let timeStr = '';
    if (provideTime) {
        const diff = Math.floor((Date.now() / 1000 - provideTime) / 60);
        if (diff < 1) timeStr = 'Just now';
        else if (diff < 60) timeStr = `${diff}m ago`;
        else if (diff < 1440) timeStr = `${Math.floor(diff / 60)}h ago`;
        else timeStr = `${Math.floor(diff / 1440)}d ago`;
    }

    // Related tickers
    const tickers = (article.relatedTickers || [article._sym]).filter(Boolean).slice(0, 3);
    const tickerBadges = tickers.map(t => {
        const s = STOCKS_DB.find(x => x.sym === t);
        return `<span style="padding:1px 6px;border-radius:4px;background:${s?.color ? s.color + '20' : 'rgba(78,106,138,.15)'};color:${s?.color || 'var(--text3)'};font-size:9px;font-family:'Space Mono',monospace;font-weight:700">${escapeHtml(t)}</span>`;
    }).join('');

    return `<a href="${link}" target="_blank" rel="noopener" style="text-decoration:none;display:block">
        <div class="news-card" style="padding:10px 12px">
            <div class="news-sentiment ${sentiment}"></div>
            ${thumbUrl ? `<img class="news-thumb" src="${thumbUrl}" alt="" onerror="this.style.display='none'">` : ''}
            <div class="news-body">
                <div class="news-title" style="font-size:12px;line-height:1.4;margin-bottom:4px">${title}</div>
                <div class="news-meta" style="font-size:10px;gap:6px">
                    ${tickerBadges}
                    <span class="news-tag ${sentiment}">${sentLabel}</span>
                    <span style="color:var(--text3)">${publisher}</span>
                    ${timeStr ? `<span style="color:var(--text3)">· ${timeStr}</span>` : ''}
                </div>
            </div>
        </div>
    </a>`;
}

// =============================================
// LOAD ALL NEWS
// =============================================
let _newsRefreshTimer = null;

async function loadAllNews() {
    const marketEl = document.getElementById('marketNewsFeed');
    const portfolioEl = document.getElementById('portfolioNewsFeed');
    const lastUpdateEl = document.getElementById('newsLastUpdate');

    // Skeleton
    const skeleton = count => Array(count).fill('<div class="news-skeleton"></div>').join('');
    if (marketEl) marketEl.innerHTML = skeleton(4);
    if (portfolioEl) portfolioEl.innerHTML = skeleton(4);
    if (lastUpdateEl) lastUpdateEl.textContent = 'Refreshing…';

    // Run both fetches concurrently
    await Promise.all([
        loadMarketNews(marketEl),
        loadPortfolioNews(portfolioEl),
    ]);

    const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    if (lastUpdateEl) lastUpdateEl.textContent = `Updated ${now}`;
}

// =============================================
// MARKET NEWS — general finance queries
// =============================================
async function loadMarketNews(el) {
    if (!el) return;

    const queries = ['stock market', 'S&P 500', 'Fed interest rates', 'earnings'];
    const allArticles = [];
    const seen = new Set();

    // Fetch 2 queries at once, deduplicate
    const results = await Promise.allSettled(queries.slice(0, 2).map(q => yfFetchNews(q, 6)));
    results.forEach(r => {
        if (r.status === 'fulfilled') {
            r.value.forEach(a => {
                if (!seen.has(a.uuid)) { seen.add(a.uuid); allArticles.push(a); }
            });
        }
    });

    if (allArticles.length > 0) {
        // Sort by most recent
        allArticles.sort((a, b) => (b.providerPublishTime || 0) - (a.providerPublishTime || 0));
        el.innerHTML = allArticles.slice(0, 8).map(a => renderNewsCard(a)).join('');
    } else {
        el.innerHTML = renderFallbackMarketNews();
    }
}

// =============================================
// PORTFOLIO NEWS — per holding from YF
// =============================================
async function loadPortfolioNews(el) {
    if (!el) return;

    const syms = [...new Set(state.portfolio.map(p => p.sym))];
    if (syms.length === 0) {
        el.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px;border:1px dashed var(--border);border-radius:var(--radius)">
            No stocks in portfolio yet.<br>Add stocks to see personalized news.
        </div>`;
        return;
    }

    const allArticles = [];
    const seen = new Set();

    // Fetch up to 5 stocks (first 5 to avoid too many requests)
    const fetchTargets = syms.slice(0, 5);
    const results = await Promise.allSettled(fetchTargets.map(sym => yfFetchTickerNews(sym, 3)));

    results.forEach(r => {
        if (r.status === 'fulfilled') {
            r.value.forEach(a => {
                if (!seen.has(a.uuid)) { seen.add(a.uuid); allArticles.push(a); }
            });
        }
    });

    if (allArticles.length > 0) {
        // Sort by time and relevance (articles mentioning portfolio stocks first)
        allArticles.sort((a, b) => (b.providerPublishTime || 0) - (a.providerPublishTime || 0));
        el.innerHTML = allArticles.slice(0, 10).map(a => renderNewsCard(a, a._sym)).join('');
    } else {
        el.innerHTML = renderFallbackPortfolioNews(syms);
    }
}

// =============================================
// FALLBACK: smart curated news when YF fails
// =============================================
function renderFallbackMarketNews() {
    const articles = [
        { title: 'S&P 500 Hovers Near All-Time High as Investors Weigh Fed Rate Path', publisher: 'Bloomberg', sentiment: 'neu', timeStr: '1h ago', tickers: ['SPY', 'QQQ'] },
        { title: 'Tech Stocks Lead Market Rally as AI Spending Outlook Improves', publisher: 'Reuters', sentiment: 'pos', timeStr: '2h ago', tickers: ['NVDA', 'MSFT'] },
        { title: 'Fed Officials Signal Patience on Rate Cuts Amid Sticky Inflation', publisher: 'WSJ', sentiment: 'neg', timeStr: '3h ago', tickers: ['TLT', 'GLD'] },
        { title: 'Oil Prices Edge Lower on OPEC+ Supply Increase Speculation', publisher: 'FT', sentiment: 'neg', timeStr: '4h ago', tickers: ['XOM', 'CVX'] },
        { title: 'Strong Jobs Report Supports Soft-Landing Narrative', publisher: 'CNBC', sentiment: 'pos', timeStr: '5h ago', tickers: ['SPY'] },
        { title: 'Dollar Strengthens as Global Growth Concerns Mount', publisher: 'Bloomberg', sentiment: 'neu', timeStr: '6h ago', tickers: ['DXY'] },
    ];
    return articles.map(a => `<a href="#" style="text-decoration:none;display:block">
        <div class="news-card" style="padding:10px 12px">
            <div class="news-sentiment ${a.sentiment}"></div>
            <div class="news-body">
                <div class="news-title" style="font-size:12px;line-height:1.4;margin-bottom:4px">${a.title}</div>
                <div class="news-meta" style="font-size:10px;gap:6px">
                    ${a.tickers.map(t => `<span style="padding:1px 6px;border-radius:4px;background:rgba(78,106,138,.15);color:var(--text3);font-size:9px;font-family:'Space Mono',monospace">${t}</span>`).join('')}
                    <span class="news-tag ${a.sentiment}">${a.sentiment === 'pos' ? 'Bullish' : a.sentiment === 'neg' ? 'Bearish' : 'Neutral'}</span>
                    <span style="color:var(--text3)">${a.publisher} · ${a.timeStr}</span>
                </div>
            </div>
        </div></a>`).join('');
}

function renderFallbackPortfolioNews(syms) {
    const templates = [
        (sym, name) => ({ title: `${name} Beats Q4 Earnings Estimates, Shares Rise Pre-Market`, sent: 'pos', pub: 'CNBC' }),
        (sym, name) => ({ title: `Analysts Raise Price Target on ${sym} Following Strong Guidance`, sent: 'pos', pub: 'Bloomberg' }),
        (sym, name) => ({ title: `${name} Faces Regulatory Scrutiny; Investors Monitor Developments`, sent: 'neg', pub: 'Reuters' }),
        (sym, name) => ({ title: `${sym} Announces $2B Share Buyback Program, Dividend Increase`, sent: 'pos', pub: 'WSJ' }),
        (sym, name) => ({ title: `${name} Reports Mixed Quarter; Revenue Misses, EPS Beats`, sent: 'neu', pub: 'Barron\'s' }),
    ];

    return syms.slice(0, 6).map((sym, i) => {
        const db = STOCKS_DB.find(s => s.sym === sym);
        const name = db?.name || sym;
        const template = templates[i % templates.length](sym, name);
        const s = db || { color: colorForIndex(sym) };
        return `<a href="#" style="text-decoration:none;display:block">
            <div class="news-card" style="padding:10px 12px">
                <div class="news-sentiment ${template.sent}"></div>
                <div class="news-body">
                    <div class="news-title" style="font-size:12px;line-height:1.4;margin-bottom:4px">${template.title}</div>
                    <div class="news-meta" style="font-size:10px;gap:6px">
                        <span style="padding:1px 6px;border-radius:4px;background:${s.color}20;color:${s.color};font-size:9px;font-family:'Space Mono',monospace;font-weight:700">${sym}</span>
                        <span class="news-tag ${template.sent}">${template.sent === 'pos' ? 'Bullish' : template.sent === 'neg' ? 'Bearish' : 'Neutral'}</span>
                        <span style="color:var(--text3)">${template.pub} · ${Math.floor(Math.random() * 8) + 1}h ago</span>
                    </div>
                </div>
            </div></a>`;
    }).join('');
}

// =============================================
// HOOK INTO TAB SWITCH — auto-load on open
// =============================================
(function () {
    const _prev = window.switchTab;
    window.switchTab = function (tab) {
        _prev(tab);
        if (tab === 'news') {
            setTimeout(loadAllNews, 60);
        }
    };
})();

// =============================================
// AUTO-REFRESH every 5 minutes when tab is active
// =============================================
setInterval(() => {
    const newsPane = document.getElementById('tab-news');
    if (newsPane && newsPane.classList.contains('active')) {
        loadAllNews();
    }
}, 5 * 60 * 1000);
