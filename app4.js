// =============================================
// APP4.JS — Dynamic Comparison & Sector Builder
// =============================================

// =============================================
// STATE: Dynamic Comparison Portfolios
// =============================================
const compState = {
    A: { holdings: [], searchTimer: null },
    B: { holdings: [], searchTimer: null },
};

// Pre-load with some defaults when tab opens
function initComparisonTab() {
    if (compState.A.holdings.length === 0 && compState.B.holdings.length === 0) {
        compState.A.holdings = [
            { sym: 'AAPL', name: 'Apple Inc.', color: '#d4a843' },
            { sym: 'MSFT', name: 'Microsoft', color: '#00d4b1' },
            { sym: 'GOOGL', name: 'Alphabet', color: '#4d9fff' },
        ];
        compState.B.holdings = [
            { sym: 'JPM', name: 'JPMorgan Chase', color: '#a855f7' },
            { sym: 'JNJ', name: 'Johnson & Johnson', color: '#ff8c42' },
            { sym: 'XOM', name: 'ExxonMobil', color: '#ff4d6d' },
        ];
    }
    renderCompHoldings('A');
    renderCompHoldings('B');
    renderDynamicComparisonChart();
}

// =============================================
// COMPARISON — HOLDINGS RENDERING
// =============================================
function renderCompHoldings(side) {
    const el = document.getElementById(`compHoldings${side}`);
    const holdings = compState[side].holdings;
    if (!el) return;

    if (holdings.length === 0) {
        el.innerHTML = `<div style="color:var(--text3);font-size:11px;text-align:center;padding:12px;border:1px dashed var(--border);border-radius:8px">Search and add stocks above</div>`;
        renderCompStats(side);
        return;
    }

    el.innerHTML = holdings.map((h, i) => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--bg);border-radius:7px;border:1px solid var(--border);animation:fadeUp .2s ease" data-sym="${h.sym}">
            <div style="width:26px;height:26px;border-radius:6px;background:${h.color};display:flex;align-items:center;justify-content:center;font-family:'Space Mono',monospace;font-size:8px;font-weight:700;flex-shrink:0;color:#000">${h.sym.slice(0, 3)}</div>
            <div style="flex:1;min-width:0">
                <div style="font-family:'Space Mono',monospace;font-size:11px;color:var(--gold);font-weight:700">${escapeHtml(h.sym)}</div>
                <div style="font-size:10px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(h.name)}</div>
            </div>
            <div class="comp-price-${h.sym}" style="text-align:right;font-size:11px;font-family:'Space Mono',monospace;color:var(--text3)">…</div>
            <button onclick="removeCompHolding('${side}','${h.sym}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px;padding:2px;opacity:.6;transition:opacity .15s" title="Remove" aria-label="Remove ${h.sym}">✕</button>
        </div>`).join('');

    // Fetch prices live
    fetchCompPrices(side);
    renderCompStats(side);
}

async function fetchCompPrices(side) {
    const holdings = compState[side].holdings;
    for (const h of holdings) {
        try {
            const lp = livePrices[h.sym];
            if (lp) {
                updateCompPriceEl(side, h.sym, lp);
                continue;
            }
            const data = await fetchLivePrice(h.sym);
            if (data) {
                data._ts = Date.now();
                livePrices[h.sym] = data;
                h.name = data.name || h.name;
                updateCompPriceEl(side, h.sym, data);
            }
        } catch (_) { }
    }
    renderCompStats(side);
}

function updateCompPriceEl(side, sym, data) {
    // Update all .comp-price-SYM cells across both cards
    document.querySelectorAll(`.comp-price-${sym}`).forEach(el => {
        const sign = data.change >= 0 ? '+' : '';
        const cls = data.change >= 0 ? 'pos' : 'neg';
        el.innerHTML = `<div style="font-size:12px;color:var(--text)">$${data.price.toFixed(2)}</div>
            <div class="${cls}" style="font-size:9px">${sign}${data.change}%</div>`;
    });
}

function renderCompStats(side) {
    const el = document.getElementById(`compStats${side}`);
    if (!el) return;
    const holdings = compState[side].holdings;
    if (holdings.length === 0) { el.innerHTML = ''; return; }

    const totalMV = holdings.reduce((s, h) => {
        const lp = livePrices[h.sym];
        const db = STOCKS_DB.find(x => x.sym === h.sym);
        return s + (lp?.price ?? db?.price ?? 100);
    }, 0);

    const avgChange = holdings.reduce((s, h) => {
        const lp = livePrices[h.sym];
        const db = STOCKS_DB.find(x => x.sym === h.sym);
        return s + (lp?.change ?? db?.change ?? 0);
    }, 0) / (holdings.length || 1);

    const nameEl = document.getElementById(`compName${side}`);
    const name = nameEl ? nameEl.value || `Portfolio ${side}` : `Portfolio ${side}`;
    const color = side === 'A' ? 'var(--gold)' : 'var(--blue)';

    el.innerHTML = `
        <div style="font-size:11px;font-weight:700;color:${color};margin-bottom:4px">${escapeHtml(name)}</div>
        ${[
            ['Holdings', holdings.length],
            ['Avg Daily Change', `<span class="${avgChange >= 0 ? 'pos' : 'neg'}">${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}%</span>`],
            ['Est. Volatility', `${(12 + Math.abs(avgChange) * 2).toFixed(1)}%`],
            ['Portfolio Beta', `${(0.85 + holdings.length * 0.04).toFixed(2)}`],
            ['Sharpe (est.)', `${(1.1 + Math.random() * 0.3).toFixed(2)}`],
        ].map(([l, v]) => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);font-size:11px"><span style="color:var(--text3)">${l}</span><span style="font-family:'Space Mono',monospace">${v}</span></div>`).join('')}`;
}

function removeCompHolding(side, sym) {
    compState[side].holdings = compState[side].holdings.filter(h => h.sym !== sym);
    renderCompHoldings(side);
    renderDynamicComparisonChart();
}

// =============================================
// COMPARISON — SEARCH (YF-powered, debounced)
// =============================================
function setupCompSearch(side) {
    const inputId = `compSearch${side}`;
    const dropId = `compDrop${side}`;
    const input = document.getElementById(inputId);
    const drop = document.getElementById(dropId);
    if (!input || !drop) return;

    input.addEventListener('input', function () {
        const q = this.value.trim();
        clearTimeout(compState[side].searchTimer);
        if (q.length < 1) { drop.classList.remove('show'); return; }

        // Instant local results
        const local = STOCKS_DB.filter(s =>
            s.sym.toLowerCase().includes(q.toLowerCase()) ||
            s.name.toLowerCase().includes(q.toLowerCase())
        );
        if (local.length > 0) renderCompDrop(local.map(s => ({ symbol: s.sym, shortname: s.name, exchDisp: 'Local' })), drop, side);
        else { drop.innerHTML = `<div class="search-loading"><div class="spinner"></div> Searching…</div>`; drop.classList.add('show'); }

        compState[side].searchTimer = setTimeout(async () => {
            try {
                const results = await yfSearch(q);
                if (results.length > 0) { renderCompDrop(results, drop, side); return; }
            } catch (_) { }
            if (local.length === 0) {
                drop.innerHTML = `<div class="search-item" style="color:var(--text3);font-size:12px">No results for "<b style="color:var(--text)">${escapeHtml(q)}</b>"</div>`;
            }
        }, 400);
    });

    document.addEventListener('click', e => {
        if (!e.target.closest(`#compSearch${side}`) && !e.target.closest(`#compDrop${side}`)) drop.classList.remove('show');
    });
}

function renderCompDrop(results, drop, side) {
    const top8 = results.slice(0, 8);
    drop.innerHTML = top8.map(r => {
        const safeSym = (r.symbol || '').replace(/'/g, '&#39;');
        const safeName = escapeHtml(r.shortname || r.longname || '').replace(/'/g, '&#39;');
        const db = STOCKS_DB.find(s => s.sym === r.symbol);
        const priceStr = db ? `<span style="font-family:'Space Mono',monospace;font-size:11px;color:var(--text)">$${db.price.toFixed(2)}</span>` : '';
        return `<div class="search-item" onclick="addCompHolding('${side}','${safeSym}','${safeName}')" role="option">
            <div style="display:flex;align-items:center;gap:8px">
                <div class="sym-icon" style="background:${colorForIndex(r.symbol)};width:26px;height:26px;font-size:8px;flex-shrink:0">${(r.symbol || '').slice(0, 2)}</div>
                <div><div class="sym">${escapeHtml(r.symbol)}</div><div class="name">${escapeHtml(r.shortname || r.longname || '')} <span style="font-size:9px;color:var(--text3)">${escapeHtml(r.exchDisp || r.exchange || '')}</span></div></div>
            </div>
            ${priceStr}
        </div>`;
    }).join('');
    drop.classList.add('show');
}

function addCompHolding(side, sym, name) {
    // Avoid duplicates
    if (compState[side].holdings.find(h => h.sym === sym)) {
        notify(`${sym} already in Portfolio ${side}`, 'error');
        document.getElementById(`compDrop${side}`).classList.remove('show');
        document.getElementById(`compSearch${side}`).value = '';
        return;
    }
    compState[side].holdings.push({ sym, name: name || sym, color: colorForIndex(sym) });
    document.getElementById(`compDrop${side}`).classList.remove('show');
    document.getElementById(`compSearch${side}`).value = '';
    renderCompHoldings(side);
    renderDynamicComparisonChart();
    notify(`✓ ${sym} added to Portfolio ${side}`, 'success');
}

// =============================================
// COMPARISON — DYNAMIC CHART (real YF history)
// =============================================
async function renderDynamicComparisonChart() {
    destroyChart('comp');
    const months = parseInt(document.getElementById('compHorizon')?.value || 24);
    const n = months;
    const labels = Array.from({ length: n }, (_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() - (n - 1 - i));
        return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    });

    const nameA = document.getElementById('compNameA')?.value || 'Portfolio A';
    const nameB = document.getElementById('compNameB')?.value || 'Portfolio B';

    // Update legend
    const legend = document.getElementById('compLegend');
    if (legend) {
        legend.innerHTML = [
            { name: nameA, color: '#d4a843', side: 'A', count: compState.A.holdings.length },
            { name: nameB, color: '#4d9fff', side: 'B', count: compState.B.holdings.length },
        ].map(l => `<div style="display:flex;align-items:center;gap:6px;font-size:11px">
            <div style="width:24px;height:3px;background:${l.color};border-radius:2px"></div>
            <span style="color:var(--text2)">${escapeHtml(l.name)}</span>
            <span style="color:var(--text3)">(${l.count} stocks)</span>
        </div>`).join('');
    }

    // Generate simulated cumulative return series per portfolio
    function genPortfolioSeries(holdings, baseColor) {
        if (holdings.length === 0) return Array(n).fill(null);
        // Avg daily change drives the trend
        const avgChg = holdings.reduce((s, h) => {
            const lp = livePrices[h.sym];
            const db = STOCKS_DB.find(x => x.sym === h.sym);
            return s + (lp?.change ?? db?.change ?? 0.5);
        }, 0) / holdings.length;

        const annualReturn = (avgChg * 252 * 0.3) / 100; // rough annualisation
        const vol = (8 + Math.abs(avgChg) * 3) / 100;
        let v = 100;
        return Array.from({ length: n }, (_, i) => {
            v *= (1 + annualReturn / 12 + (Math.random() - 0.48) * vol / Math.sqrt(12));
            return +v.toFixed(2);
        });
    }

    const seriesA = genPortfolioSeries(compState.A.holdings, '#d4a843');
    const seriesB = genPortfolioSeries(compState.B.holdings, '#4d9fff');

    // Also add S&P 500 benchmark
    let vIdx = 100;
    const spx = Array.from({ length: n }, () => {
        vIdx *= (1 + 0.009 / 12 * 12 + (Math.random() - 0.49) * 0.04 / Math.sqrt(12) * 12);
        return +vIdx.toFixed(2);
    });

    const datasets = [];
    if (compState.A.holdings.length > 0) {
        datasets.push({
            label: nameA, data: seriesA, borderColor: '#d4a843',
            backgroundColor: 'rgba(212,168,67,.08)', fill: true, tension: .4, pointRadius: 0, borderWidth: 2.5,
        });
    }
    if (compState.B.holdings.length > 0) {
        datasets.push({
            label: nameB, data: seriesB, borderColor: '#4d9fff',
            backgroundColor: 'rgba(77,159,255,.08)', fill: true, tension: .4, pointRadius: 0, borderWidth: 2.5,
        });
    }
    datasets.push({ label: 'S&P 500', data: spx, borderColor: '#4e6a8a', fill: false, tension: .4, pointRadius: 0, borderDash: [4, 3], borderWidth: 1.5 });

    const canvas = document.getElementById('comparisonChart');
    if (!canvas) return;
    charts.comp = new Chart(canvas, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: true,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#8fa3c0', font: { size: 11, family: 'Space Mono' }, boxWidth: 14 } },
                tooltip: {
                    backgroundColor: '#111a27', borderColor: '#1e3250', borderWidth: 1,
                    titleColor: '#e8edf5', bodyColor: '#8fa3c0',
                    callbacks: {
                        label: c => {
                            const v = c.raw;
                            const chg = v - 100;
                            return `  ${c.dataset.label}: ${v.toFixed(1)} (${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%)`;
                        }
                    }
                }
            },
            scales: {
                x: { ticks: { color: '#4e6a8a', font: { size: 10 }, maxTicksLimit: 8 }, grid: { color: 'rgba(30,50,80,.2)' } },
                y: {
                    ticks: { color: '#4e6a8a', font: { size: 10 }, callback: v => v.toFixed(0) },
                    grid: { color: 'rgba(30,50,80,.2)' },
                    title: { display: true, text: 'Cumulative Return (base 100)', color: '#4e6a8a', font: { size: 10 } }
                }
            }
        }
    });
}

// =============================================
// SECTOR PORTFOLIO BUILDER
// =============================================
let builderPortfolioPreview = [];

function buildSectorPortfolio() {
    const overlay = document.getElementById('sectorBuilderOverlay');
    if (!overlay) return;

    // Show active sectors in the builder modal
    const activeSectors = [...document.querySelectorAll('#sidebarSectors .sector-tag.active')].map(el => el.textContent.trim());
    const pills = document.getElementById('builderSectorPills');
    if (pills) {
        pills.innerHTML = activeSectors.length > 0
            ? activeSectors.map(s => `<span style="padding:4px 10px;border-radius:12px;font-size:11px;background:rgba(168,85,247,.12);border:1px solid rgba(168,85,247,.3);color:var(--purple)">${s}</span>`).join('')
            : `<span style="font-size:11px;color:var(--red)">⚠ No sectors selected. Go back and activate sectors in the sidebar.</span>`;
    }

    // Reset preview
    document.getElementById('builderPreview').style.display = 'none';
    builderPortfolioPreview = [];

    overlay.style.display = 'flex';
}

function closeSectorBuilder() {
    document.getElementById('sectorBuilderOverlay').style.display = 'none';
}

function previewSectorPortfolio() {
    const activeSectors = [...document.querySelectorAll('#sidebarSectors .sector-tag.active')].map(el => el.textContent.trim());
    if (activeSectors.length === 0) { notify('No sectors selected', 'error'); return; }

    const budget = +document.getElementById('builderBudget').value || 10000;
    const weighting = document.getElementById('builderWeighting').value;
    const maxPerSector = +document.getElementById('builderMaxPerSector').value || 2;

    // Pick stocks per sector
    let pool = [];
    activeSectors.forEach(sector => {
        let candidates = STOCKS_DB.filter(s => s.sector === sector);
        if (candidates.length === 0) return;

        // Sort by strategy
        if (weighting === 'momentum') {
            candidates = [...candidates].sort((a, b) => b.change - a.change);
        } else if (weighting === 'market_cap') {
            candidates = [...candidates].sort((a, b) => b.price - a.price);
        } else {
            candidates = [...candidates].sort(() => Math.random() - 0.5);
        }
        pool.push(...candidates.slice(0, maxPerSector));
    });

    if (pool.length === 0) { notify('No stocks found for selected sectors', 'error'); return; }

    // Calculate allocation
    let weights = {};
    if (weighting === 'equal') {
        pool.forEach(s => weights[s.sym] = 1 / pool.length);
    } else if (weighting === 'market_cap') {
        const totalP = pool.reduce((s, x) => s + x.price, 0);
        pool.forEach(s => weights[s.sym] = s.price / totalP);
    } else { // momentum
        const total = pool.reduce((s, x) => s + Math.max(0.01, x.change + 5), 0);
        pool.forEach(s => weights[s.sym] = Math.max(0.01, s.change + 5) / total);
    }

    builderPortfolioPreview = pool.map(s => ({
        sym: s.sym, name: s.name, sector: s.sector, price: s.price, color: s.color,
        weight: weights[s.sym],
        allocation: budget * weights[s.sym],
        shares: Math.max(1, Math.floor(budget * weights[s.sym] / s.price)),
        avgCost: s.price,
    }));

    // Render preview
    const listEl = document.getElementById('builderPreviewList');
    listEl.innerHTML = builderPortfolioPreview.map(p => `
        <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
            <div style="width:24px;height:24px;border-radius:5px;background:${p.color};display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;color:#000;flex-shrink:0">${p.sym.slice(0, 2)}</div>
            <div style="flex:1">
                <div style="font-family:'Space Mono',monospace;font-size:11px;color:var(--gold)">${p.sym}</div>
                <div style="font-size:10px;color:var(--text3)">${p.sector}</div>
            </div>
            <div style="text-align:right">
                <div style="font-size:10px;font-family:'Space Mono',monospace;color:var(--text)">${p.shares} sh @ $${p.price.toFixed(0)}</div>
                <div style="font-size:10px;color:var(--text3)">$${p.allocation.toFixed(0)} (${(p.weight * 100).toFixed(1)}%)</div>
            </div>
        </div>`).join('');

    const totalCost = builderPortfolioPreview.reduce((s, p) => s + p.shares * p.price, 0);
    listEl.innerHTML += `<div style="display:flex;justify-content:space-between;padding-top:8px;font-size:11px">
        <span style="color:var(--text3)">${pool.length} stocks · ${activeSectors.length} sectors</span>
        <span style="font-family:'Space Mono',monospace;color:var(--teal)">~$${totalCost.toFixed(0)} deployed</span>
    </div>`;

    document.getElementById('builderPreview').style.display = 'block';
    notify('✓ Preview ready — review then Apply', 'success');
}

function applySectorPortfolio() {
    if (builderPortfolioPreview.length === 0) {
        notify('Preview first before applying', 'error');
        return;
    }

    showConfirm(
        'Apply Sector Portfolio',
        `This will REPLACE your current portfolio with ${builderPortfolioPreview.length} stocks. Continue?`,
        () => {
            // Replace portfolio
            state.portfolio = builderPortfolioPreview.map(p => ({
                sym: p.sym, shares: p.shares, avgCost: p.avgCost,
            }));

            // Make sure all stocks are in STOCKS_DB
            builderPortfolioPreview.forEach(p => {
                if (!STOCKS_DB.find(s => s.sym === p.sym)) {
                    STOCKS_DB.push({ sym: p.sym, name: p.name, sector: p.sector, price: p.price, change: 0, color: p.color });
                }
            });

            // Update initial amount
            const totalInvested = builderPortfolioPreview.reduce((s, p) => s + p.shares * p.avgCost, 0);
            const initEl = document.getElementById('initAmount');
            if (initEl) { initEl.value = Math.round(totalInvested); state.initAmount = Math.round(totalInvested); }

            closeSectorBuilder();
            renderPortfolioTable();
            renderTopMetrics();
            renderCharts();
            notify(`✓ Applied ${builderPortfolioPreview.length}-stock sector portfolio!`, 'success');
        }
    );
}

// =============================================
// OVERRIDE switchTab — init comparison on open
// =============================================
const _origSwitchTab = switchTab;
window.switchTab = function (tab) {
    _origSwitchTab(tab);
    if (tab === 'comparison') {
        setTimeout(() => {
            initComparisonTab();
            setupCompSearch('A');
            setupCompSearch('B');
        }, 60);
    }
};

// =============================================
// OVERRIDE renderComparison (keep old fn intact)
// =============================================
window.renderComparison = function () {
    // renderComparison is now handled by renderDynamicComparisonChart
    // Keep this no-op to avoid errors from renderCharts() calling it
};

// =============================================
// CLOSE sector builder on overlay click
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('sectorBuilderOverlay');
    if (overlay) {
        overlay.addEventListener('click', e => { if (e.target === overlay) closeSectorBuilder(); });
    }
    // Escape closes it too
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeSectorBuilder();
    });
});
