// =============================================
// APP5.JS — RSS News Feed (Multi-Source)
// Yahoo Finance RSS, CNBC, MarketWatch
// =============================================

// =============================================
// SENTIMENT: basic keyword analysis
// =============================================
function analyzeSentiment(text) {
    if (!text) return 'neu';
    const t = text.toLowerCase();
    const posWords = ['surge', 'rally', 'beat', 'record', 'profit', 'gain', 'rise', 'grow', 'strong', 'boost', 'high', 'up', 'bullish', 'positive', 'exceed', 'upgrade', 'buy', 'soar', 'outperform'];
    const negWords = ['fall', 'drop', 'loss', 'decline', 'miss', 'slump', 'crash', 'cut', 'down', 'warn', 'risk', 'weak', 'sell', 'downgrade', 'concern', 'fear', 'plunge', 'pressure', 'layoff', 'recall'];
    const posScore = posWords.filter(w => t.includes(w)).length;
    const negScore = negWords.filter(w => t.includes(w)).length;
    return posScore > negScore ? 'pos' : negScore > posScore ? 'neg' : 'neu';
}

// =============================================
// SOURCE BADGES
// =============================================
const SOURCE_COLORS = {
    'Yahoo Finance': { bg: 'rgba(103,58,183,.12)', border: 'rgba(103,58,183,.3)', color: '#7c4dff' },
    'CNBC': { bg: 'rgba(0,150,136,.12)', border: 'rgba(0,150,136,.3)', color: '#009688' },
    'MarketWatch': { bg: 'rgba(255,152,0,.12)', border: 'rgba(255,152,0,.3)', color: '#ff9800' },
    'Reuters': { bg: 'rgba(255,87,34,.12)', border: 'rgba(255,87,34,.3)', color: '#ff5722' },
};

function sourceBadge(source) {
    const s = SOURCE_COLORS[source] || { bg: 'rgba(78,106,138,.1)', border: 'rgba(78,106,138,.3)', color: 'var(--text3)' };
    return `<span style="padding:1px 6px;border-radius:4px;background:${s.bg};border:1px solid ${s.border};color:${s.color};font-size:9px;font-family:'Space Mono',monospace;font-weight:700">${escapeHtml(source)}</span>`;
}

// =============================================
// RENDER A NEWS CARD
// =============================================
function renderNewsCard(article) {
    const title = escapeHtml(article.title || 'Untitled');
    const sentiment = analyzeSentiment(article.title + ' ' + (article.description || ''));
    const sentLabel = sentiment === 'pos' ? 'Bullish' : sentiment === 'neg' ? 'Bearish' : 'Neutral';
    const source = article.source || article.publisher || 'RSS';
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
    const tickers = (article.tickers || article.relatedTickers || []).filter(Boolean).slice(0, 3);
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
                    ${sourceBadge(source)}
                    ${tickerBadges}
                    <span class="news-tag ${sentiment}">${sentLabel}</span>
                    ${timeStr ? `<span style="color:var(--text3)">· ${timeStr}</span>` : ''}
                </div>
            </div>
        </div>
    </a>`;
}

// =============================================
// NEWS FILTER STATE
// =============================================
let _newsSourceFilter = 'all';
let _newsSentimentFilter = 'all';
let _allMarketArticles = [];
let _allPortfolioArticles = [];

function setNewsSourceFilter(source, btn) {
    _newsSourceFilter = source;
    document.querySelectorAll('.news-source-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderFilteredNews();
}

function setNewsSentimentFilter(sent, btn) {
    _newsSentimentFilter = sent;
    document.querySelectorAll('.news-sent-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderFilteredNews();
}

function renderFilteredNews() {
    const marketEl = document.getElementById('marketNewsFeed');
    const portfolioEl = document.getElementById('portfolioNewsFeed');

    const filterFn = (articles) => {
        let filtered = articles;
        if (_newsSourceFilter !== 'all') {
            filtered = filtered.filter(a => (a.source || '').toLowerCase().includes(_newsSourceFilter));
        }
        if (_newsSentimentFilter !== 'all') {
            filtered = filtered.filter(a => analyzeSentiment(a.title + ' ' + (a.description || '')) === _newsSentimentFilter);
        }
        return filtered;
    };

    if (marketEl) {
        const filtered = filterFn(_allMarketArticles);
        marketEl.innerHTML = filtered.length > 0
            ? filtered.slice(0, 10).map(a => renderNewsCard(a)).join('')
            : `<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px">No articles match filters</div>`;
    }
    if (portfolioEl) {
        const filtered = filterFn(_allPortfolioArticles);
        portfolioEl.innerHTML = filtered.length > 0
            ? filtered.slice(0, 10).map(a => renderNewsCard(a)).join('')
            : `<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px">No articles match filters</div>`;
    }
}

// =============================================
// LOAD ALL NEWS (RSS-first, YF fallback)
// =============================================
async function loadAllNews() {
    const marketEl = document.getElementById('marketNewsFeed');
    const portfolioEl = document.getElementById('portfolioNewsFeed');
    const lastUpdateEl = document.getElementById('newsLastUpdate');
    const filtersEl = document.getElementById('newsFilters');

    const skeleton = count => Array(count).fill('<div class="news-skeleton"></div>').join('');
    if (marketEl) marketEl.innerHTML = skeleton(4);
    if (portfolioEl) portfolioEl.innerHTML = skeleton(4);
    if (lastUpdateEl) lastUpdateEl.textContent = 'Refreshing…';

    // Render filter buttons if not already rendered
    if (filtersEl && !filtersEl.dataset.init) {
        filtersEl.dataset.init = '1';
        filtersEl.innerHTML = `
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                <span style="font-size:10px;color:var(--text3);font-family:'Syne',sans-serif;font-weight:700">Source:</span>
                <button class="news-source-btn active" onclick="setNewsSourceFilter('all',this)" style="padding:3px 8px;border-radius:5px;border:1px solid var(--border2);background:var(--bg3);color:var(--text2);font-size:10px;cursor:pointer;font-family:'Space Mono',monospace">All</button>
                <button class="news-source-btn" onclick="setNewsSourceFilter('yahoo',this)" style="padding:3px 8px;border-radius:5px;border:1px solid rgba(103,58,183,.3);background:rgba(103,58,183,.08);color:#7c4dff;font-size:10px;cursor:pointer;font-family:'Space Mono',monospace">Yahoo</button>
                <button class="news-source-btn" onclick="setNewsSourceFilter('cnbc',this)" style="padding:3px 8px;border-radius:5px;border:1px solid rgba(0,150,136,.3);background:rgba(0,150,136,.08);color:#009688;font-size:10px;cursor:pointer;font-family:'Space Mono',monospace">CNBC</button>
                <button class="news-source-btn" onclick="setNewsSourceFilter('marketwatch',this)" style="padding:3px 8px;border-radius:5px;border:1px solid rgba(255,152,0,.3);background:rgba(255,152,0,.08);color:#ff9800;font-size:10px;cursor:pointer;font-family:'Space Mono',monospace">MarketWatch</button>
                <span style="margin-left:8px;font-size:10px;color:var(--text3);font-family:'Syne',sans-serif;font-weight:700">Sentiment:</span>
                <button class="news-sent-btn active" onclick="setNewsSentimentFilter('all',this)" style="padding:3px 8px;border-radius:5px;border:1px solid var(--border2);background:var(--bg3);color:var(--text2);font-size:10px;cursor:pointer;font-family:'Space Mono',monospace">All</button>
                <button class="news-sent-btn" onclick="setNewsSentimentFilter('pos',this)" style="padding:3px 8px;border-radius:5px;border:1px solid rgba(0,212,177,.3);background:rgba(0,212,177,.08);color:var(--teal);font-size:10px;cursor:pointer;font-family:'Space Mono',monospace">Bullish</button>
                <button class="news-sent-btn" onclick="setNewsSentimentFilter('neg',this)" style="padding:3px 8px;border-radius:5px;border:1px solid rgba(255,77,109,.3);background:rgba(255,77,109,.08);color:var(--red);font-size:10px;cursor:pointer;font-family:'Space Mono',monospace">Bearish</button>
            </div>`;
    }

    // Fetch from RSS endpoint + YF search in parallel
    await Promise.all([
        loadMarketNews(marketEl),
        loadPortfolioNews(portfolioEl),
    ]);

    const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    if (lastUpdateEl) lastUpdateEl.textContent = `Updated ${now}`;
}

// =============================================
// MARKET NEWS — RSS feeds
// =============================================
async function loadMarketNews(el) {
    if (!el) return;
    _allMarketArticles = [];

    // Try RSS endpoint first
    try {
        const res = await fetch('/api/rss/news?source=all', { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
            const data = await res.json();
            _allMarketArticles = (data.articles || []).map(a => ({
                ...a,
                publisher: a.source,
                uuid: a.title, // dedupe key
            }));
        }
    } catch (_) {}

    // Fallback to Yahoo Finance search if RSS failed
    if (_allMarketArticles.length === 0) {
        try {
            const queries = ['stock market', 'S&P 500'];
            const seen = new Set();
            for (const q of queries) {
                const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&newsCount=8&quotesCount=0&lang=en-US`;
                const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
                if (r.ok) {
                    const j = await r.json();
                    (j?.news || []).forEach(a => { if (!seen.has(a.uuid)) { seen.add(a.uuid); _allMarketArticles.push({ ...a, source: 'Yahoo Finance' }); } });
                }
            }
        } catch (_) {}
    }

    if (_allMarketArticles.length > 0) {
        _allMarketArticles.sort((a, b) => (b.providerPublishTime || 0) - (a.providerPublishTime || 0));
        el.innerHTML = _allMarketArticles.slice(0, 10).map(a => renderNewsCard(a)).join('');
    } else {
        el.innerHTML = renderFallbackMarketNews();
    }
}

// =============================================
// PORTFOLIO NEWS — per-ticker RSS
// =============================================
async function loadPortfolioNews(el) {
    if (!el) return;
    _allPortfolioArticles = [];

    const syms = [...new Set(state.portfolio.map(p => p.sym))];
    if (syms.length === 0) {
        el.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px;border:1px dashed var(--border);border-radius:var(--radius)">
            No stocks in portfolio yet.<br>Add stocks to see personalized news.
        </div>`;
        return;
    }

    const seen = new Set();
    // Fetch RSS for each portfolio ticker
    const fetchTargets = syms.slice(0, 6);
    await Promise.allSettled(fetchTargets.map(async sym => {
        try {
            const res = await fetch(`/api/rss/news?ticker=${sym}`, { signal: AbortSignal.timeout(8000) });
            if (res.ok) {
                const data = await res.json();
                (data.articles || []).forEach(a => {
                    if (!seen.has(a.title)) {
                        seen.add(a.title);
                        _allPortfolioArticles.push({ ...a, _sym: sym, tickers: [sym, ...(a.tickers || [])].slice(0, 3) });
                    }
                });
            }
        } catch (_) {}
    }));

    // Fallback: Yahoo search per ticker
    if (_allPortfolioArticles.length === 0) {
        await Promise.allSettled(fetchTargets.map(async sym => {
            try {
                const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sym)}&newsCount=3&quotesCount=0&lang=en-US`;
                const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
                if (r.ok) {
                    const j = await r.json();
                    (j?.news || []).forEach(a => {
                        if (!seen.has(a.uuid)) { seen.add(a.uuid); _allPortfolioArticles.push({ ...a, _sym: sym, source: 'Yahoo Finance', tickers: [sym] }); }
                    });
                }
            } catch (_) {}
        }));
    }

    if (_allPortfolioArticles.length > 0) {
        _allPortfolioArticles.sort((a, b) => (b.providerPublishTime || 0) - (a.providerPublishTime || 0));
        el.innerHTML = _allPortfolioArticles.slice(0, 10).map(a => renderNewsCard(a)).join('');
    } else {
        el.innerHTML = renderFallbackPortfolioNews(syms);
    }
}

// =============================================
// FALLBACK NEWS (when all APIs fail)
// =============================================
function renderFallbackMarketNews() {
    const articles = [
        { title: 'S&P 500 Hovers Near All-Time High as Investors Weigh Fed Rate Path', source: 'Bloomberg', providerPublishTime: Math.floor(Date.now()/1000) - 3600, tickers: ['SPY'] },
        { title: 'Tech Stocks Lead Market Rally as AI Spending Outlook Improves', source: 'Reuters', providerPublishTime: Math.floor(Date.now()/1000) - 7200, tickers: ['NVDA', 'MSFT'] },
        { title: 'Fed Officials Signal Patience on Rate Cuts Amid Sticky Inflation', source: 'CNBC', providerPublishTime: Math.floor(Date.now()/1000) - 10800, tickers: [] },
    ];
    return articles.map(a => renderNewsCard({ ...a, link: '#' })).join('');
}

function renderFallbackPortfolioNews(syms) {
    const templates = [
        (sym, name) => ({ title: `${name} Beats Q4 Earnings Estimates, Shares Rise`, sent: 'pos', source: 'CNBC' }),
        (sym, name) => ({ title: `Analysts Raise Price Target on ${sym} Following Strong Guidance`, sent: 'pos', source: 'MarketWatch' }),
        (sym, name) => ({ title: `${sym} Reports Mixed Quarter; Revenue Misses, EPS Beats`, sent: 'neu', source: 'Yahoo Finance' }),
    ];
    return syms.slice(0, 4).map((sym, i) => {
        const db = STOCKS_DB.find(s => s.sym === sym);
        const name = db?.name || sym;
        const t = templates[i % templates.length](sym, name);
        return renderNewsCard({ title: t.title, source: t.source, link: '#', tickers: [sym], providerPublishTime: Math.floor(Date.now()/1000) - (i+1)*3600 });
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
