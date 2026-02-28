// =============================================
// APP6.JS — Interactive Portfolio Ratios (FAST)
// Renders immediately from local data, then
// patches each card as YF data streams in.
// =============================================

const RATIO_DEFS = {
    pe: { label: 'P/E Ratio', unit: 'x', group: 'Valuation', icon: '💹', good: 'low', desc: 'Price / Earnings. Lower = cheaper vs earnings.' },
    pb: { label: 'P/B Ratio', unit: 'x', group: 'Valuation', icon: '📖', good: 'low', desc: 'Price / Book Value. < 1 may signal undervaluation.' },
    ps: { label: 'P/S Ratio', unit: 'x', group: 'Valuation', icon: '📊', good: 'low', desc: 'Price / Sales. Useful for high-growth cos.' },
    ev: { label: 'EV/EBITDA', unit: 'x', group: 'Valuation', icon: '🏢', good: 'low', desc: 'Enterprise Value / EBITDA. M&A valuation metric.' },
    roe: { label: 'ROE', unit: '%', group: 'Profitability', icon: '🏆', good: 'high', desc: 'Return on Equity — efficiency of shareholder capital.' },
    roa: { label: 'ROA', unit: '%', group: 'Profitability', icon: '🌱', good: 'high', desc: 'Return on Assets — profitability vs total assets.' },
    margin: { label: 'Net Margin', unit: '%', group: 'Profitability', icon: '📈', good: 'high', desc: 'Net income as % of revenue.' },
    de: { label: 'Debt/Equity', unit: 'x', group: 'Financial Health', icon: '⚖️', good: 'low', desc: 'Total Debt / Equity. Higher = more leveraged.' },
    cr: { label: 'Current Ratio', unit: 'x', group: 'Financial Health', icon: '💧', good: 'high', desc: '> 1 means current assets cover short-term liabilities.' },
    fcf: { label: 'FCF Yield', unit: '%', group: 'Cash', icon: '💵', good: 'high', desc: 'Free Cash Flow / Market Cap.' },
    div: { label: 'Div Yield', unit: '%', group: 'Income', icon: '🎁', good: 'high', desc: 'Annual dividend / stock price.' },
    beta: { label: 'Beta', unit: '', group: 'Risk', icon: '📉', good: 'low', desc: '< 1 less volatile than market. > 1 more volatile.' },
};

const RATIO_THRESHOLDS = {
    pe: { good: [0, 20], bad: [40, Infinity] },
    pb: { good: [0, 2], bad: [5, Infinity] },
    ps: { good: [0, 3], bad: [10, Infinity] },
    ev: { good: [0, 12], bad: [25, Infinity] },
    roe: { good: [15, Infinity], bad: [0, 5] },
    roa: { good: [8, Infinity], bad: [0, 2] },
    margin: { good: [15, Infinity], bad: [0, 5] },
    de: { good: [0, 0.5], bad: [2, Infinity] },
    cr: { good: [1.5, Infinity], bad: [0, 1] },
    fcf: { good: [4, Infinity], bad: [0, 1] },
    div: { good: [2, 6], bad: [0, 0.5] },
    beta: { good: [0, 0.8], bad: [1.5, Infinity] },
};

const RATIO_SCALES = { pe: [0, 60], pb: [0, 10], ps: [0, 20], ev: [0, 40], roe: [0, 50], roa: [0, 25], margin: [0, 50], de: [0, 3], cr: [0, 4], fcf: [0, 10], div: [0, 8], beta: [0, 2.5] };

const CACHE_TTL = 5 * 60 * 1000;

// ──────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────
function getActiveRatios() {
    return [...document.querySelectorAll('.check-grid input[type="checkbox"]:checked')]
        .map(cb => cb.value).filter(v => RATIO_DEFS[v]);
}

function formatRatioVal(val, unit) {
    if (val === null || val === undefined || isNaN(val)) return '—';
    const n = +val;
    if (unit === '%') return n.toFixed(2) + '%';
    if (unit === 'x') return n.toFixed(2) + 'x';
    return n.toFixed(2);
}

function scoreRatio(key, val) {
    if (val === null || isNaN(val)) return 'neu';
    const th = RATIO_THRESHOLDS[key]; if (!th) return 'neu';
    if (val >= th.good[0] && val <= th.good[1]) return 'good';
    if (val >= th.bad[0] && val <= th.bad[1]) return 'bad';
    return 'neu';
}

function clampBar(key, val) {
    if (val === null || isNaN(val)) return 0;
    const [min, max] = RATIO_SCALES[key] || [0, 100];
    return Math.min(100, Math.max(0, ((val - min) / (max - min)) * 100));
}

// ──────────────────────────────────────────────
// EXTRACT RATIOS FROM YF SUMMARY
// ──────────────────────────────────────────────
function extractRatios(sym, summary, lp) {
    const kv = summary?.defaultKeyStatistics || {};
    const fd = summary?.financialData || {};
    const sd = summary?.summaryDetail || {};
    const pr = summary?.price || {};
    const r = v => v?.raw ?? null;
    const pct = v => v?.raw != null ? +(v.raw * 100).toFixed(2) : null;
    const mktCap = r(pr.marketCap) ?? r(sd.marketCap);
    return {
        pe: r(kv.trailingPE) ?? r(sd.trailingPE),
        pb: r(kv.priceToBook),
        ps: r(kv.priceToSalesTrailing12Months),
        ev: r(kv.enterpriseToEbitda),
        roe: pct(fd.returnOnEquity),
        roa: pct(fd.returnOnAssets),
        margin: pct(fd.profitMargins),
        de: r(fd.debtToEquity),
        cr: r(fd.currentRatio),
        fcf: mktCap && r(fd.freeCashflow) ? +((r(fd.freeCashflow) / mktCap) * 100).toFixed(2) : null,
        div: pct(sd.dividendYield) ?? pct(sd.trailingAnnualDividendYield),
        beta: r(sd.beta) ?? r(kv.beta),
        _name: pr.shortName || pr.longName || sym,
        _sector: summary?.assetProfile?.sector || '',
        _ts: Date.now(),
    };
}

// ──────────────────────────────────────────────
// BUILD ONE RATIO ROW (reused for cards + patches)
// ──────────────────────────────────────────────
function buildRatioRow(key, val, loaded) {
    const def = RATIO_DEFS[key];
    const fmt = formatRatioVal(val, def.unit);
    const rat = val !== null ? scoreRatio(key, val) : 'neu';
    const rc = rat === 'good' ? 'var(--teal)' : rat === 'bad' ? 'var(--red)' : 'var(--text3)';
    const rl = rat === 'good' ? '▲ Good' : rat === 'bad' ? '▼ Weak' : '— Avg';
    const barW = val !== null ? clampBar(key, val) : 0;
    const spin = `<span class="spinner" style="width:10px;height:10px;border-width:1.5px;display:inline-block"></span>`;
    return `<div class="rrow-${key}" style="padding:6px 0;border-bottom:1px solid rgba(30,50,80,.3)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <div style="display:flex;align-items:center;gap:5px">
                <span>${def.icon}</span><span style="font-size:11px;color:var(--text2)">${def.label}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
                <span style="font-family:'Space Mono',monospace;font-size:12px;font-weight:700;color:${val !== null ? 'var(--text)' : 'var(--text3)'}">
                    ${loaded ? fmt : spin}
                </span>
                <span style="font-size:9px;font-family:'Space Mono',monospace;color:${rc}">${loaded && val !== null ? rl : ''}</span>
            </div>
        </div>
        <div style="height:3px;background:var(--border);border-radius:2px;overflow:hidden">
            <div style="height:100%;width:${barW}%;background:${loaded && val !== null ? (rat === 'good' ? 'var(--teal)' : rat === 'bad' ? 'var(--red)' : 'var(--text3)') : 'var(--border2)'};border-radius:2px;transition:width 1s ease"></div>
        </div>
        <div style="font-size:9px;color:var(--text3);margin-top:2px;line-height:1.3">${def.desc}</div>
    </div>`;
}

// ──────────────────────────────────────────────
// BUILD STOCK CARD SHELL (instant, local data)
// ──────────────────────────────────────────────
function buildStockCard(sym, active) {
    const db = STOCKS_DB.find(s => s.sym === sym);
    const lp = livePrices[sym];
    const p = state.portfolio.find(x => x.sym === sym);
    const cached = ratioCache[sym];
    const color = db?.color || colorForIndex(sym);
    const name = cached?._name || db?.name || sym;
    const price = lp?.price ?? db?.price ?? p?.avgCost ?? 0;
    const chg = lp?.change ?? db?.change ?? 0;
    const sector = cached?._sector || db?.sector || '';
    const loaded = !!cached;

    const rows = active.map(key => buildRatioRow(key, loaded ? cached[key] : null, loaded)).join('');

    return `<div id="rcard-${sym}" style="background:var(--bg-glass2);border:1px solid var(--border);border-radius:var(--radius);padding:16px;backdrop-filter:blur(8px);transition:border-color var(--transition);animation:fadeUp .3s ease"
        onmouseover="this.style.borderColor='${color}50'" onmouseout="this.style.borderColor='rgba(30,50,80,.45)'">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border)">
            <div style="width:36px;height:36px;border-radius:8px;background:${color};display:flex;align-items:center;justify-content:center;font-family:'Space Mono',monospace;font-size:10px;font-weight:700;flex-shrink:0;color:#000">${sym.slice(0, 2)}</div>
            <div style="flex:1;min-width:0">
                <div style="font-family:'Syne',sans-serif;font-size:14px;font-weight:700;color:${color}">${escapeHtml(sym)}</div>
                <div id="rname-${sym}" style="font-size:10px;color:var(--text3)">${escapeHtml(name)}</div>
                <div id="rsector-${sym}" style="font-size:9px;color:var(--text3);margin-top:1px">${escapeHtml(sector)}</div>
            </div>
            <div style="text-align:right;flex-shrink:0">
                <div style="font-family:'Space Mono',monospace;font-size:13px;font-weight:700;color:var(--text)">$${price.toFixed(2)}</div>
                <div style="font-size:10px;font-family:'Space Mono',monospace" class="${chg >= 0 ? 'pos' : 'neg'}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</div>
            </div>
        </div>
        <div id="rrows-${sym}">${rows}</div>
        <div id="rloading-${sym}" style="text-align:center;padding:6px;font-size:10px;color:var(--text3);${loaded ? 'display:none' : ''}">
            <div class="spinner" style="width:12px;height:12px;border-width:2px;margin:0 auto 3px"></div>Fetching live ratios…
        </div>
    </div>`;
}

// ──────────────────────────────────────────────
// PATCH A CARD IN-PLACE after YF data arrives
// ──────────────────────────────────────────────
function patchStockCard(sym, active) {
    const cached = ratioCache[sym];
    if (!cached) return;

    // Hide loading indicator
    const loadEl = document.getElementById(`rloading-${sym}`);
    if (loadEl) loadEl.style.display = 'none';

    // Update name/sector
    const nameEl = document.getElementById(`rname-${sym}`);
    const secEl = document.getElementById(`rsector-${sym}`);
    if (nameEl) nameEl.textContent = cached._name || sym;
    if (secEl) secEl.textContent = cached._sector || '';

    // Patch each ratio row inside the card
    const rowsEl = document.getElementById(`rrows-${sym}`);
    if (!rowsEl) return;
    active.forEach(key => {
        const existing = rowsEl.querySelector(`.rrow-${key}`);
        const newRow = document.createElement('div');
        newRow.innerHTML = buildRatioRow(key, cached[key], true);
        const built = newRow.firstElementChild;
        if (existing) existing.replaceWith(built);
        else rowsEl.appendChild(built);
    });

    // Refresh comparison table
    const syms = [...new Set(state.portfolio.map(p => p.sym))];
    renderRatioTable(syms);
}

// ──────────────────────────────────────────────
// FETCH RATIOS via v7/quote (same endpoint as prices — works on GitHub Pages!)
// ──────────────────────────────────────────────
const RATIO_FIELDS = [
    'regularMarketPrice', 'regularMarketChangePercent',
    'shortName', 'sector',
    'trailingPE', 'priceToBook', 'priceToSalesTrailing12Months', 'enterpriseToEbitda',
    'returnOnEquity', 'returnOnAssets', 'profitMargins',
    'debtToEquity', 'currentRatio',
    'trailingAnnualDividendYield', 'dividendYield', 'beta',
].join(',');

async function fetchBatchRatios(syms) {
    if (!syms.length) return;

    // 1) Check localStorage cache first
    syms.forEach(s => {
        const c = lsGet('qratio_' + s, CACHE_TTL);
        if (c) ratioCache[s] = c;
    });

    const stale = syms.filter(s => !ratioCache[s]);
    if (!stale.length) return;

    // 2) ONE batch request with ratio fields
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${stale.join(',')}&fields=${RATIO_FIELDS}`;
    try {
        const data = await fetchWithProxy(url);
        const results = data?.quoteResponse?.result || [];
        results.forEach(q => {
            const sym = q.symbol;
            const r = {
                pe: q.trailingPE ?? null,
                pb: q.priceToBook ?? null,
                ps: q.priceToSalesTrailing12Months ?? null,
                ev: q.enterpriseToEbitda ?? null,
                roe: q.returnOnEquity != null ? +(q.returnOnEquity * 100).toFixed(2) : null,
                roa: q.returnOnAssets != null ? +(q.returnOnAssets * 100).toFixed(2) : null,
                margin: q.profitMargins != null ? +(q.profitMargins * 100).toFixed(2) : null,
                de: q.debtToEquity ?? null,
                cr: q.currentRatio ?? null,
                fcf: null,
                div: (q.trailingAnnualDividendYield ?? q.dividendYield) != null
                    ? +((q.trailingAnnualDividendYield ?? q.dividendYield) * 100).toFixed(2)
                    : null,
                beta: q.beta ?? null,
                _name: q.shortName || sym,
                _sector: q.sector || '',
                _ts: Date.now(),
            };
            ratioCache[sym] = r;
            lsSet('qratio_' + sym, r);
        });
    } catch (_) {
        // API failed — mark missing stocks so cards show dashes instead of spinning
        stale.forEach(s => {
            if (!ratioCache[s]) {
                const db = STOCKS_DB.find(x => x.sym === s);
                ratioCache[s] = {
                    pe: db?.pe ?? null, pb: db?.pb ?? null, ps: db?.ps ?? null,
                    ev: db?.ev ?? null, roe: db?.roe ?? null, roa: db?.roa ?? null,
                    margin: db?.margin ?? null, de: db?.de ?? null, cr: db?.cr ?? null,
                    fcf: db?.fcf ?? null, div: db?.div ?? null, beta: db?.beta ?? null,
                    _name: db?.name || s, _sector: db?.sector || '', _ts: Date.now()
                };
                lsSet('qratio_' + s, ratioCache[s]);
            }
        });
    }
}

// ──────────────────────────────────────────────
// MAIN ENTRY — fetch ratios then render cards
// ──────────────────────────────────────────────
async function fetchAndRenderRatios() {
    const grid = document.getElementById('ratioCardsGrid');
    const ts = document.getElementById('ratioTimestamp');
    if (!grid) return;

    const syms = [...new Set(state.portfolio.map(p => p.sym))];
    const active = getActiveRatios();

    if (syms.length === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1;padding:24px;text-align:center;color:var(--text3);font-size:13px;border:1px dashed var(--border);border-radius:var(--radius)">No stocks in portfolio. Add stocks to see ratios.</div>`;
        document.getElementById('ratioTableWrap').style.display = 'none';
        return;
    }

    renderRatioChips();

    // ① Show skeleton cards immediately
    grid.innerHTML = syms.map(sym => buildStockCard(sym, active)).join('');
    renderRatioTable(syms);

    // ② Fetch ratios via v7/quote batch (same endpoint as prices — works on GH Pages)
    if (ts) ts.textContent = 'Fetching ratios…';
    await fetchBatchRatios(syms);

    // ③ Patch all cards with the real data
    syms.forEach(sym => patchStockCard(sym, active));
    renderRatioTable(syms);

    if (ts) {
        const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        ts.textContent = `Updated ${now}`;
    }
}



// ──────────────────────────────────────────────
// RENDER COMPARISON TABLE
// ──────────────────────────────────────────────
function renderRatioTable(syms) {
    const wrap = document.getElementById('ratioTableWrap');
    const thead = document.getElementById('ratioTableHead');
    const tbody = document.getElementById('ratioTableBody');
    const active = getActiveRatios();
    if (!wrap || !thead || !tbody || active.length === 0 || syms.length < 2) {
        if (wrap) wrap.style.display = 'none'; return;
    }
    wrap.style.display = 'block';
    thead.innerHTML = `<tr><th style="width:130px;text-align:left">Ratio</th>${syms.map(sym => {
        const c = STOCKS_DB.find(s => s.sym === sym)?.color || colorForIndex(sym);
        return `<th style="text-align:center"><div style="display:flex;align-items:center;justify-content:center;gap:4px"><div style="width:8px;height:8px;border-radius:2px;background:${c}"></div>${escapeHtml(sym)}</div></th>`;
    }).join('')}</tr>`;

    tbody.innerHTML = active.map(key => {
        const def = RATIO_DEFS[key];
        const vals = syms.map(sym => ratioCache[sym]?.[key] ?? null);
        const valid = vals.filter(v => v !== null);
        const best = valid.length ? (def.good === 'high' ? Math.max(...valid) : Math.min(...valid)) : null;
        return `<tr>
            <td style="color:var(--text2);font-size:11px"><span style="margin-right:4px">${def.icon}</span>${def.label}</td>
            ${syms.map((sym, i) => {
            const val = vals[i];
            const fmt = formatRatioVal(val, def.unit);
            const isBest = best !== null && val !== null && val === best && valid.length > 1;
            const rat = val !== null ? scoreRatio(key, val) : 'neu';
            const clr = rat === 'good' ? 'var(--teal)' : rat === 'bad' ? 'var(--red)' : 'var(--text2)';
            return `<td style="text-align:center;font-family:'Space Mono',monospace;font-size:11px;font-weight:${isBest ? 700 : 400};color:${clr};${isBest ? `background:${clr}12;` : ''}">
                    ${ratioCache[sym] ? fmt : '<span style="color:var(--text3)">…</span>'}
                    ${isBest ? '<span style="font-size:8px;margin-left:2px">★</span>' : ''}
                </td>`;
        }).join('')}
        </tr>`;
    }).join('');
}

// ──────────────────────────────────────────────
// FILTER CHIPS
// ──────────────────────────────────────────────
function renderRatioChips() {
    const el = document.getElementById('ratioFilterChips');
    if (!el) return;
    const active = getActiveRatios();
    const groups = {};
    active.forEach(k => { const g = RATIO_DEFS[k]?.group || 'Other'; (groups[g] = groups[g] || []).push(k); });
    const GC = {
        'Valuation': 'rgba(212,168,67,.12)|rgba(212,168,67,.3)|var(--gold)',
        'Profitability': 'rgba(0,212,177,.1)|rgba(0,212,177,.3)|var(--teal)',
        'Financial Health': 'rgba(77,159,255,.1)|rgba(77,159,255,.3)|var(--blue)',
        'Cash': 'rgba(168,85,247,.1)|rgba(168,85,247,.3)|var(--purple)',
        'Income': 'rgba(255,140,66,.1)|rgba(255,140,66,.3)|#ff8c42',
        'Risk': 'rgba(255,77,109,.1)|rgba(255,77,109,.3)|var(--red)',
    };
    el.innerHTML = Object.entries(groups).map(([g, keys]) => {
        const [bg, bd, clr] = (GC[g] || 'rgba(78,106,138,.1)|rgba(78,106,138,.3)|var(--text2)').split('|');
        return `<div style="display:flex;align-items:center;gap:5px;padding:4px 6px;border-radius:8px;background:${bg};border:1px solid ${bd}">
            <span style="font-size:10px;font-weight:700;color:${clr};font-family:'Syne',sans-serif">${g}</span>
            ${keys.map(k => `<span style="padding:2px 7px;border-radius:5px;background:${bg};color:${clr};font-size:10px;font-family:'Space Mono',monospace">${RATIO_DEFS[k].label}</span>`).join('')}
        </div>`;
    }).join('');
}

// ──────────────────────────────────────────────
// CHECKBOX CHANGE — re-render without refetching
// ──────────────────────────────────────────────
function onRatioChange() {
    if (!document.getElementById('tab-financials')?.classList.contains('active')) return;
    const syms = [...new Set(state.portfolio.map(p => p.sym))];
    const active = getActiveRatios();
    const grid = document.getElementById('ratioCardsGrid');
    renderRatioChips();
    if (grid) grid.innerHTML = syms.map(sym => buildStockCard(sym, active)).join('');
    renderRatioTable(syms);
    // Fetch only what we don't have yet
    syms.filter(sym => !ratioCache[sym]).forEach(async sym => {
        try {
            const summary = await yfSummary(sym);
            if (summary) { ratioCache[sym] = { ...extractRatios(sym, summary, livePrices[sym]), _ts: Date.now() }; patchStockCard(sym, active); }
        } catch (_) { }
    });
}

// ──────────────────────────────────────────────
// TAB HOOK
// ──────────────────────────────────────────────
(function () {
    const _prev = window.switchTab;
    window.switchTab = function (tab) {
        _prev(tab);
        if (tab === 'financials') setTimeout(fetchAndRenderRatios, 60);
    };
})();
