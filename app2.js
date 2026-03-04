// =============================================
// SEARCH — debounced, with YF + TD fallback + auto-refresh
// =============================================
let searchTimer = null;
let searchRefreshTimer = null;  // periodic price refresh for open dropdown
let _lastSearchResults = [];   // remember last results for auto-refresh

document.getElementById('stockSearch').addEventListener('input', function () {
    const q = this.value.trim();
    const dd = document.getElementById('searchDropdown');
    clearTimeout(searchTimer);
    if (q.length < 1) { dd.classList.remove('show'); stopSearchRefresh(); return; }

    const localMatches = STOCKS_DB.filter(s =>
        s.sym.toLowerCase().includes(q.toLowerCase()) ||
        s.name.toLowerCase().includes(q.toLowerCase())
    );
    if (localMatches.length > 0) {
        renderSearchResults(localMatches.map(s => ({
            symbol: s.sym, shortname: s.name, exchDisp: 'NYSE/NASDAQ', quoteType: 'EQUITY'
        })), dd, 'local');
    } else {
        dd.innerHTML = `<div class="search-loading"><div class="spinner"></div> Searching...</div>`;
        dd.classList.add('show');
    }

    searchTimer = setTimeout(async () => {
        // 1) Try Yahoo Finance
        let results = [];
        try { results = await yfSearch(q); } catch (_) { }

        // 2) Fallback to Twelve Data
        if (results.length === 0) {
            try { results = await tdSearch(q); } catch (_) { }
        }

        if (results.length > 0) {
            renderSearchResults(results, dd, 'yf');
            return;
        }
        if (localMatches.length === 0) {
            dd.innerHTML = `<div class="search-item" style="color:var(--text3);justify-content:center;font-size:12px">
        No results for "<b style="color:var(--text)">${escapeHtml(q)}</b>"
      </div>`;
        }
    }, 400);
});

function renderSearchResults(results, dd, source = 'yf') {
    _lastSearchResults = results;  // save for auto-refresh
    const badges = {
        yf: `<div style="padding:6px 14px;font-size:9px;color:var(--teal);letter-spacing:1.2px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:5px"><span style="width:5px;height:5px;border-radius:50%;background:var(--teal);display:inline-block;animation:pulse 1.5s infinite"></span> LIVE DATA</div>`,
        local: `<div style="padding:6px 14px;font-size:9px;color:var(--text3);letter-spacing:1.2px;border-bottom:1px solid var(--border)">LOCAL DATABASE</div>`,
    };
    const top10 = results.slice(0, 10);
    dd.innerHTML = (badges[source] || '') + top10.map(r => {
        const local = STOCKS_DB.find(s => s.sym === r.symbol);
        const safeSym = (r.symbol || '').replace(/'/g, '&#39;');
        const safeName = escapeHtml(r.shortname || r.longname || '').replace(/'/g, '&#39;');
        const priceHtml = local
            ? `<div class="res-price" data-sym="${r.symbol}">
           <div style="font-family:'Space Mono',monospace;font-size:13px;font-weight:700;color:var(--text)">$${local.price.toFixed(2)}</div>
           <div class="${local.change >= 0 ? 'pos' : 'neg'}" style="font-size:10px;font-family:'Space Mono',monospace">${local.change >= 0 ? '+' : ''}${local.change}%</div>
         </div>`
            : `<div class="res-price" data-sym="${r.symbol}"><div style="display:flex;align-items:center;gap:4px"><div class="spinner"></div><span style="font-size:10px;color:var(--text3)">Loading...</span></div></div>`;
        return `<div class="search-item" onclick="openStockModal('${safeSym}','${safeName}')" role="option">
      <div style="display:flex;align-items:center;gap:8px">
        <div class="sym-icon" style="background:${colorForIndex(r.symbol)};width:30px;height:30px;font-size:9px;flex-shrink:0">${escapeHtml((r.symbol || '').slice(0, 2))}</div>
        <div>
          <div class="sym">${escapeHtml(r.symbol)}</div>
          <div class="name">${escapeHtml(r.shortname || r.longname || '')} <span style="font-size:9px;color:var(--text3)">${escapeHtml(r.exchDisp || r.exchange || '')}</span></div>
        </div>
      </div>
      ${priceHtml}
    </div>`;
    }).join('');
    dd.classList.add('show');
    // Fetch prices for stocks not in local DB
    const needsFetch = top10.filter(r => !STOCKS_DB.find(s => s.sym === r.symbol));
    if (needsFetch.length > 0) fetchBatchPrices(needsFetch.map(r => r.symbol), dd);
    // Always refresh local-DB prices too (they may be stale)
    const hasLocal = top10.filter(r => STOCKS_DB.find(s => s.sym === r.symbol));
    if (hasLocal.length > 0) fetchBatchPrices(hasLocal.map(r => r.symbol), dd, true);

    startSearchRefresh();  // begin periodic auto-refresh
}

// Auto-refresh prices in the open dropdown every 30 seconds
function startSearchRefresh() {
    stopSearchRefresh();
    searchRefreshTimer = setInterval(() => {
        const dd = document.getElementById('searchDropdown');
        if (!dd.classList.contains('show') || _lastSearchResults.length === 0) { stopSearchRefresh(); return; }
        // Invalidate price cache for visible symbols so fetchBatchPrices re-fetches
        _lastSearchResults.slice(0, 10).forEach(r => {
            try { localStorage.removeItem('qe5_price_' + r.symbol); } catch (_) { }
        });
        fetchBatchPrices(_lastSearchResults.slice(0, 10).map(r => r.symbol), dd, true);
    }, 30000);
}
function stopSearchRefresh() {
    clearInterval(searchRefreshTimer);
    searchRefreshTimer = null;
}

async function fetchBatchPrices(symbols, dd, updateExisting = false) {
    if (!symbols.length) return;

    // ── Strategy 1: ONE batch Yahoo request for all symbols ───────────────────
    try {
        const url = `${YF_BASE2}/v7/finance/quote?symbols=${symbols.join(',')}&fields=regularMarketPrice,regularMarketPreviousClose,regularMarketChangePercent,regularMarketChange,shortName,currency,marketState`;
        const data = await fetchWithProxy(url, TTL_PRICE);
        const results = data?.quoteResponse?.result || [];
        if (results.length > 0) {
            results.forEach(q => applyPriceToCell(q.symbol, {
                price: q.regularMarketPrice || q.regularMarketPreviousClose,
                previousClose: q.regularMarketPreviousClose,
                change: +(q.regularMarketChangePercent || 0).toFixed(2),
                changeAmt: +(q.regularMarketChange || 0).toFixed(2),
                name: q.shortName || q.symbol,
                currency: q.currency || 'USD',
                marketClosed: !q.regularMarketPrice || ['CLOSED', 'PRE', 'PREPRE', 'POST', 'POSTPOST'].includes(q.marketState),
            }, dd, updateExisting));
            // show OFFLINE for symbols that received no data
            const found = new Set(results.map(q => q.symbol));
            symbols.filter(s => !found.has(s)).forEach(s => showOffline(s, dd));
            return;
        }
    } catch (_) { }

    // ── Strategy 2: Individual relay calls (parallel) as fallback ─────────────
    await Promise.all(symbols.map(async sym => {
        try {
            const data = await fetchLivePrice(sym);
            if (data && data.price) { applyPriceToCell(sym, data, dd, updateExisting); }
            else { showOffline(sym, dd); }
        } catch (_) { showOffline(sym, dd); }
    }));
}

function applyPriceToCell(sym, data, dd, updateExisting) {
    if (!data || !data.price) { showOffline(sym, dd); return; }
    let db = STOCKS_DB.find(s => s.sym === sym);
    if (!db) {
        db = { sym, name: data.name || sym, sector: 'Unknown', price: data.price, change: data.change || 0, color: colorForIndex(sym) };
        STOCKS_DB.push(db);
    } else if (updateExisting) {
        db.price = data.price; db.change = data.change || 0;
    }
    liveCache[sym] = { ...(liveCache[sym] || {}), ...data, sym };
    lsSet('price_' + sym, data);
    const cell = dd.querySelector(`.res-price[data-sym="${sym}"]`);
    if (!cell) return;
    const cls = (data.change || 0) >= 0 ? 'pos' : 'neg';
    const sign = (data.change || 0) >= 0 ? '+' : '';
    const prefix = data.currency && data.currency !== 'USD' ? data.currency + ' ' : '$';
    const changeRow = data.marketClosed
        ? `<div style="font-size:9px;color:var(--text3);letter-spacing:.5px">LAST CLOSE</div>`
        : `<div class="${cls}" style="font-size:10px;font-family:'Space Mono',monospace">${sign}${(data.changeAmt || 0).toFixed(2)} (${sign}${(data.change || 0).toFixed(2)}%)</div>`;
    cell.innerHTML = `<div style="font-family:'Space Mono',monospace;font-size:13px;font-weight:700;color:var(--text);animation:fadeIn .3s ease">${prefix}${data.price.toFixed(2)}</div>${changeRow}`;
}

function showOffline(sym, dd) {
    const cell = dd.querySelector(`.res-price[data-sym="${sym}"]`);
    if (!cell) return;
    const fallback = STOCKS_DB.find(s => s.sym === sym);
    if (fallback) {
        cell.innerHTML = `<div style="font-family:'Space Mono',monospace;font-size:13px;font-weight:700;color:var(--text)">$${fallback.price.toFixed(2)}</div><div style="font-size:9px;color:var(--text3);letter-spacing:.5px">OFFLINE</div>`;
    } else {
        cell.innerHTML = `<div style="font-size:10px;color:var(--text3)">—</div>`;
    }
}


document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrap')) {
        document.getElementById('searchDropdown').classList.remove('show');
        stopSearchRefresh();
    }
});
function openAddFromSearch() { document.getElementById('stockSearch').focus(); }

// =============================================
// MODAL
// =============================================
async function openStockModal(sym, name) {
    document.getElementById('searchDropdown').classList.remove('show');
    document.getElementById('stockSearch').value = '';
    const cached = liveCache[sym];
    const localDb = STOCKS_DB.find(s => s.sym === sym);
    const knownPrice = cached?.price || localDb?.price || null;
    state.modalStock = { sym, name, price: knownPrice, color: colorForIndex(sym) };
    document.getElementById('modalSymbol').textContent = sym;
    document.getElementById('modalShares').value = '';
    document.getElementById('modalCost').value = knownPrice ? knownPrice.toFixed(2) : '';
    document.getElementById('modalYFData').innerHTML = renderModalSkeleton(knownPrice, cached);
    document.getElementById('addModal').classList.add('show');
    updateModalTotal();
    try {
        const [quoteData, summaryData] = await Promise.all([yfQuote(sym), yfSummary(sym)]);
        const meta = quoteData?.meta || {};
        const price = meta.regularMarketPrice || 0;
        const prevClose = meta.previousClose || meta.chartPreviousClose || price;
        const chgAmt = price - prevClose;
        const chgPct = prevClose ? (chgAmt / prevClose * 100) : 0;
        const entry = {
            sym, name: summaryData?.price?.shortName || name,
            price, change: +chgPct.toFixed(2), changeAmt: +chgAmt.toFixed(2),
            color: colorForIndex(sym), sector: summaryData?.assetProfile?.sector || 'Unknown',
            industry: summaryData?.assetProfile?.industry || '', currency: meta.currency || 'USD',
            closes: quoteData?.closes || [], timestamps: quoteData?.timestamps || [], summary: summaryData,
        };
        liveCache[sym] = entry; state.modalStock = entry;
        document.getElementById('modalCost').value = price ? price.toFixed(2) : '';
        document.getElementById('modalYFData').innerHTML = renderModalFundamentals(entry, summaryData);
        drawSparkline(quoteData?.closes || []);
        notify(`✓ ${sym} loaded`, 'success');
    } catch (e) {
        const local = STOCKS_DB.find(s => s.sym === sym);
        if (local) { state.modalStock = { ...local }; document.getElementById('modalCost').value = local.price.toFixed(2); }
        document.getElementById('modalYFData').innerHTML = `<div style="color:var(--text3);font-size:11px;padding:8px 0">⚠ Using local data (Yahoo Finance unavailable)</div>`;
    }
}

function renderModalSkeleton(knownPrice = null, cached = null) {
    const priceBlock = knownPrice
        ? `<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:6px;animation:fadeIn .3s ease">
        <span style="font-family:'Space Mono',monospace;font-size:24px;font-weight:700;color:var(--text)">${cached?.currency && cached.currency !== 'USD' ? cached.currency + ' ' : '$'}${knownPrice.toFixed(2)}</span>
        ${cached?.change != null ? `<span class="${cached.change >= 0 ? 'pos' : 'neg'}" style="font-family:'Space Mono',monospace;font-size:13px">${cached.change >= 0 ? '+' : ''}${cached.changeAmt?.toFixed(2) || ''} (${cached.change >= 0 ? '+' : ''}${cached.change}%)</span>` : ''}</div>`
        : `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><div class="spinner"></div><span style="font-size:12px;color:var(--text3)">Fetching live price...</span></div>`;
    // Use background-image + background-size so the shimmer animation works correctly
    const shimmerStyle = 'background-image:linear-gradient(90deg,var(--border) 0%,var(--border2) 50%,var(--border) 100%);background-size:800px 11px;background-repeat:no-repeat;border-radius:4px;animation:shimmer 1.5s infinite linear;';
    return `<div style="margin:8px 0">${priceBlock}
    <div style="display:flex;flex-direction:column;gap:6px">${Array(5).fill(0).map(() => `<div style="${shimmerStyle}height:11px;width:${55 + Math.random() * 40}%"></div>`).join('')}</div>
    <canvas id="sparklineCanvas" height="50" style="margin-top:10px;width:100%;border-radius:6px;${knownPrice ? '' : 'opacity:.2'}"></canvas></div>`;
}

function renderModalFundamentals(entry, s) {
    if (!s) return '';
    const fd = s.financialData || {}, kv = s.defaultKeyStatistics || {}, sd = s.summaryDetail || {};
    const fmt = (v, pre = '', suf = '') => v?.raw != null ? `${pre}${Number(v.raw).toLocaleString(undefined, { maximumFractionDigits: 2 })}${suf}` : (v?.fmt || '—');
    const fmtB = v => v?.raw != null ? `$${(v.raw / 1e9).toFixed(2)}B` : '—';
    const rows = [
        ['Market Cap', fmtB(s.price?.marketCap)], ['P/E Ratio', fmt(kv.trailingPE, '', 'x')], ['Forward P/E', fmt(kv.forwardPE, '', 'x')],
        ['EPS (TTM)', fmt(kv.trailingEps, '$')], ['Revenue (TTM)', fmtB(fd.totalRevenue)],
        ['Net Margin', fd.profitMargins?.raw != null ? (fd.profitMargins.raw * 100).toFixed(1) + '%' : '—'],
        ['ROE', fd.returnOnEquity?.raw != null ? (fd.returnOnEquity.raw * 100).toFixed(1) + '%' : '—'],
        ['Debt/Equity', fmt(fd.debtToEquity, '', 'x')], ['Free Cash Flow', fmtB(fd.freeCashflow)],
        ['52W High', fmt(sd.fiftyTwoWeekHigh, '$')], ['52W Low', fmt(sd.fiftyTwoWeekLow, '$')],
        ['Dividend Yield', sd.dividendYield?.raw != null ? (sd.dividendYield.raw * 100).toFixed(2) + '%' : 'None'],
        ['Beta', fmt(sd.beta)], ['Volume', sd.volume?.raw != null ? Number(sd.volume.raw).toLocaleString() : '—'],
    ];
    return `<div style="margin:10px 0 6px">
    <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:4px">
      <span style="font-family:'Space Mono',monospace;font-size:22px;font-weight:700;color:var(--text)">${entry.price ? '$' + entry.price.toFixed(2) : '—'}</span>
      <span class="${entry.change >= 0 ? 'pos' : 'neg'}" style="font-family:'Space Mono',monospace;font-size:13px">${entry.change >= 0 ? '+' : ''}${entry.changeAmt?.toFixed(2)} (${entry.change >= 0 ? '+' : ''}${entry.change}%)</span>
      <span style="font-size:10px;color:var(--text3)">${entry.currency || ''}</span></div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:8px">${escapeHtml(entry.sector)}${entry.industry ? ' · ' + escapeHtml(entry.industry) : ''}</div>
    <canvas id="sparklineCanvas" height="50" style="width:100%;margin-bottom:10px;border-radius:6px"></canvas>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
      ${rows.map(([l, v]) => `<div style="display:flex;justify-content:space-between;padding:5px 8px;background:var(--bg);border-radius:5px;border:1px solid var(--border)"><span style="font-size:10px;color:var(--text3)">${l}</span><span style="font-size:10px;font-family:'Space Mono',monospace;color:var(--text)">${v}</span></div>`).join('')}
    </div></div>`;
}

function drawSparkline(closes) {
    setTimeout(() => {
        const canvas = document.getElementById('sparklineCanvas');
        if (!canvas || closes.length < 2) return;
        const valid = closes.filter(v => v != null);
        if (valid.length < 2) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.offsetWidth || 320;
        canvas.width = w; canvas.height = 50;
        const min = Math.min(...valid), max = Math.max(...valid), range = max - min || 1;
        const color = valid[valid.length - 1] >= valid[0] ? '#00d4b1' : '#ff4d6d';
        const grad = ctx.createLinearGradient(0, 0, 0, 50);
        grad.addColorStop(0, color + '30'); grad.addColorStop(1, 'transparent');
        ctx.beginPath(); ctx.moveTo(0, 50 - ((valid[0] - min) / range) * 48);
        valid.forEach((v, i) => { ctx.lineTo((i / (valid.length - 1)) * w, 50 - ((v - min) / range) * 48); });
        ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.lineTo(w, 50); ctx.lineTo(0, 50); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    }, 80);
}

function closeModal() { document.getElementById('addModal').classList.remove('show'); }

function confirmAddStock() {
    const shares = +document.getElementById('modalShares').value;
    const cost = +document.getElementById('modalCost').value;
    if (!shares || !cost) { notify('Please fill all fields', 'error'); return; }
    if (!state.modalStock) return;
    const sym = state.modalStock.sym;
    const existing = state.portfolio.find(p => p.sym === sym);
    if (existing) {
        const tc = existing.shares * existing.avgCost + shares * cost;
        existing.shares += shares; existing.avgCost = tc / existing.shares;
    } else {
        state.portfolio.push({ sym, shares, avgCost: cost });
        if (!STOCKS_DB.find(s => s.sym === sym)) {
            const entry = liveCache[sym] || state.modalStock;
            STOCKS_DB.push({ sym, name: entry.name || sym, sector: entry.sector || 'Unknown', price: entry.price || cost, change: entry.change || 0, color: colorForIndex(sym) });
        }
    }
    if (liveCache[sym]) {
        const db = STOCKS_DB.find(s => s.sym === sym);
        if (db) { db.price = liveCache[sym].price || db.price; db.change = liveCache[sym].change || db.change; db.name = liveCache[sym].name || db.name; }
    }
    closeModal();
    if (state.modalStock?.price && !livePrices[sym]) {
        livePrices[sym] = { price: state.modalStock.price, change: state.modalStock.change ?? 0, changeAmt: state.modalStock.changeAmt ?? 0, currency: state.modalStock.currency ?? 'USD', _ts: Date.now() };
    }
    renderPortfolioTable(); renderTopMetrics(); fetchAndUpdateRow(sym);
    notify(`✓ Added ${shares} shares of ${sym}`, 'success');
}

function updateModalTotal() {
    const shares = +document.getElementById('modalShares').value || 0;
    const cost = +document.getElementById('modalCost').value || 0;
    const el = document.getElementById('modalTotalCost');
    if (el) el.textContent = shares && cost ? '$' + (shares * cost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
}
document.addEventListener('input', e => {
    if (e.target.id === 'modalShares' || e.target.id === 'modalCost') updateModalTotal();
});

// =============================================
// PORTFOLIO TABLE
// =============================================
function buildTableRow(p, liveData, totalValue) {
    const s = STOCKS_DB.find(x => x.sym === p.sym) || { sym: p.sym, name: p.sym, color: colorForIndex(p.sym) };
    const price = liveData?.price ?? p.avgCost;
    const change = liveData?.change ?? 0;
    const changeAmt = liveData?.changeAmt ?? 0;
    const currency = liveData?.currency ?? 'USD';
    const prefix = currency === 'USD' ? '$' : currency + ' ';
    const mv = price * p.shares;
    const gl = (price - p.avgCost) * p.shares;
    const glPct = p.avgCost > 0 ? (price - p.avgCost) / p.avgCost * 100 : 0;
    const weight = totalValue > 0 ? (mv / totalValue * 100).toFixed(1) : '0.0';
    const isLoading = !liveData;
    return `<tr data-sym="${p.sym}" style="animation:fadeUp .3s ease">
    <td><div class="sym-cell">
      <div class="sym-icon" style="background:${s.color}">${(p.sym || '').slice(0, 2)}</div>
      <div><div class="sym-ticker">${p.sym}</div><div class="sym-name">${escapeHtml(s.name || p.sym)}</div></div>
    </div></td>
    <td class="mono">${p.shares.toLocaleString()}</td>
    <td class="mono">${prefix}${p.avgCost.toFixed(2)}</td>
    <td class="live-price-cell" data-sym="${p.sym}">
      ${isLoading
            ? `<div style="display:flex;align-items:center;gap:5px"><div class="spinner"></div><span style="font-size:11px;color:var(--text3)">Loading...</span></div>`
            : `<div style="animation:fadeIn .4s ease">
           <div class="mono" style="font-weight:700">${prefix}${price.toFixed(2)}</div>
           <div style="font-size:10px;font-family:'Space Mono',monospace" class="${change >= 0 ? 'pos' : 'neg'}">${change >= 0 ? '+' : ''}${changeAmt.toFixed(2)} (${change >= 0 ? '+' : ''}${change.toFixed(2)}%)</div>
         </div>`}
    </td>
    <td class="mono">${isLoading ? '<span style="color:var(--text3)">—</span>' : prefix + mv.toFixed(2)}</td>
    <td>${isLoading ? '—' : `<span class="badge ${gl >= 0 ? 'pos' : 'neg'}">${gl >= 0 ? '+' : ''}${prefix}${Math.abs(gl).toFixed(0)} (${glPct >= 0 ? '+' : ''}${glPct.toFixed(1)}%)</span>`}</td>
    <td>
      <div style="width:80px">
        <div class="progress-bar" style="height:6px;background:var(--border);border-radius:3px;overflow:hidden">
          <div style="height:100%;border-radius:3px;width:${isLoading ? 0 : weight}%;background:${s.color};transition:width 1s ease"></div>
        </div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">${isLoading ? '…' : weight + '%'}</div>
      </div>
    </td>
    <td><button class="add-btn" style="font-size:10px;padding:4px 8px;color:var(--red);border-color:rgba(255,77,109,.3)" onclick="removeStock('${p.sym}')" aria-label="Remove ${p.sym}">✕</button></td>
  </tr>`;
}

function renderPortfolioTable() {
    const body = document.getElementById('portfolioBody');
    if (!body) return;

    // For each stock, use livePrices if available, else use STOCKS_DB data as fallback
    // (NEVER show infinite "Loading..." — always show some price)
    const getPrice = (sym) => {
        if (livePrices[sym]) return livePrices[sym];
        const db = STOCKS_DB.find(s => s.sym === sym);
        if (db) return { price: db.price, change: db.change, changeAmt: 0, name: db.name, currency: 'USD', _ts: 0, _offline: true };
        return null; // truly unknown stock
    };

    const totalValue = state.portfolio.reduce((sum, p) => {
        const lp = getPrice(p.sym);
        return sum + (lp ? lp.price * p.shares : p.avgCost * p.shares);
    }, 0);

    body.innerHTML = state.portfolio.map(p => buildTableRow(p, getPrice(p.sym), totalValue)).join('');

    // Try to fetch live prices in the background (once, non-blocking)
    const missing = state.portfolio.filter(p => !livePrices[p.sym]);
    if (missing.length > 0) {
        missing.forEach(p => fetchAndUpdateRow(p.sym));
    }
}

async function fetchAndUpdateRow(sym) {
    try {
        const data = await fetchLivePrice(sym);
        if (!data || !data.price) {
            // API failed — use STOCKS_DB as fallback (mark as _offline)
            const db = STOCKS_DB.find(s => s.sym === sym);
            if (db && !livePrices[sym]) {
                livePrices[sym] = { price: db.price, change: db.change, changeAmt: 0, name: db.name, currency: 'USD', _ts: Date.now(), _offline: true };
            }
            return;
        }
        data._ts = Date.now();
        livePrices[sym] = data;
        let db = STOCKS_DB.find(s => s.sym === sym);
        if (db) {
            db.price = data.price; db.change = data.change;
            if (data.name && data.name !== sym) db.name = data.name;
        } else {
            STOCKS_DB.push({ sym, name: data.name || sym, sector: 'Unknown', price: data.price, change: data.change, color: colorForIndex(sym) });
        }
    } catch (_) {
        // On error, use STOCKS_DB as fallback
        const db = STOCKS_DB.find(s => s.sym === sym);
        if (db && !livePrices[sym]) {
            livePrices[sym] = { price: db.price, change: db.change, changeAmt: 0, name: db.name, currency: 'USD', _ts: Date.now(), _offline: true };
        }
    }

    // Re-render the row
    const totalValue = state.portfolio.reduce((sum, p) => {
        const lp = livePrices[p.sym];
        return sum + (lp ? lp.price * p.shares : p.avgCost * p.shares);
    }, 0);
    const row = document.querySelector(`tr[data-sym="${sym}"]`);
    if (row) {
        const holding = state.portfolio.find(p => p.sym === sym);
        if (holding) {
            const nr = document.createElement('tbody');
            nr.innerHTML = buildTableRow(holding, livePrices[sym], totalValue);
            row.replaceWith(nr.firstElementChild);
        }
    }
    renderTopMetrics();
}

function removeStock(sym) {
    showConfirm('Remove Stock', `Remove ${sym} from your portfolio?`, () => {
        state.portfolio = state.portfolio.filter(p => p.sym !== sym);
        renderPortfolioTable(); renderTopMetrics();
        notify(`Removed ${sym}`, 'error');
    });
}
