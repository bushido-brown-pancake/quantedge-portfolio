// =============================================
// TOP METRICS
// =============================================
function renderTopMetrics() {
    const totalValue = state.portfolio.reduce((sum, p) => {
        const lp = livePrices[p.sym]; const s = STOCKS_DB.find(x => x.sym === p.sym);
        return sum + (lp?.price ?? s?.price ?? p.avgCost) * p.shares;
    }, 0);
    const totalCost = state.portfolio.reduce((sum, p) => sum + p.avgCost * p.shares, 0);
    const gl = totalValue - totalCost, glPct = totalCost > 0 ? gl / totalCost * 100 : 0;
    const riskFree = 4.5, retAnnual = 8.5 + (state.riskLevel - 1) * 1.8;
    const sharpe = ((retAnnual - riskFree) / (8 + state.riskLevel * 1.5)).toFixed(2);
    const fmt = n => n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    document.getElementById('topMetrics').innerHTML = `
    <div class="metric-card gold"><div class="metric-label">Total Portfolio Value</div><div class="metric-value">$${fmt(totalValue)}</div><div class="metric-change ${gl >= 0 ? 'pos' : 'neg'}">${gl >= 0 ? '+' : ''}$${fmt(Math.abs(gl))} (${glPct >= 0 ? '+' : ''}${glPct.toFixed(1)}%)</div></div>
    <div class="metric-card teal"><div class="metric-label">Expected Annual Return</div><div class="metric-value">${retAnnual.toFixed(1)}%</div><div class="metric-sub">Risk-adjusted est.</div></div>
    <div class="metric-card blue"><div class="metric-label">Sharpe Ratio</div><div class="metric-value">${sharpe}</div><div class="metric-sub">Risk-free: ${riskFree}% (10Y UST)</div></div>
    <div class="metric-card purple"><div class="metric-label">Portfolio Beta</div><div class="metric-value">${(0.8 + state.riskLevel * 0.08).toFixed(2)}</div><div class="metric-sub">vs S&P 500</div></div>
    <div class="metric-card red"><div class="metric-label">Max Drawdown</div><div class="metric-value">-${(8 + state.riskLevel * 2.5).toFixed(1)}%</div><div class="metric-sub">Worst case scenario</div></div>
    <div class="metric-card gold"><div class="metric-label">10Y Bond Yield</div><div class="metric-value">4.52%</div><div class="metric-sub">Risk-free rate baseline</div></div>`;
}

// =============================================
// CALCULATE
// =============================================
function calculatePortfolio() {
    state.initAmount = +document.getElementById('initAmount').value || 10000;
    state.recurAmount = +document.getElementById('recurAmount').value || 0;
    notify('⚡ Fetching live prices...', 'success');
    refreshLivePrices().then(() => { renderCharts(); renderProjection(); notify('✓ Portfolio updated!', 'success'); });
}
async function refreshLivePrices() {
    const syms = [...new Set(state.portfolio.map(p => p.sym))];
    await Promise.all(syms.map(sym => fetchAndUpdateRow(sym)));
    buildTickerTape();
}
function renderProjection() { renderProjectionChart(); }

// =============================================
// SYNC PORTFOLIO VALUE
// =============================================
async function syncPortfolioValue() {
    const btn = document.getElementById('syncValueBtn');
    const icon = document.getElementById('syncBtnIcon');
    const label = document.getElementById('syncBtnLabel');
    const resultEl = document.getElementById('syncResult');

    // Loading state
    icon.innerHTML = '<div class="spinner" style="width:12px;height:12px;border-width:2px;display:inline-block"></div>';
    label.textContent = 'Fetching live prices…';
    btn.style.opacity = '0.7';
    btn.style.pointerEvents = 'none';
    resultEl.style.display = 'none';

    try {
        // Fetch all live prices
        const syms = [...new Set(state.portfolio.map(p => p.sym))];
        await Promise.all(syms.map(sym => fetchAndUpdateRow(sym)));

        // Calculate real market value
        const breakdown = state.portfolio.map(p => {
            const lp = livePrices[p.sym];
            const s = STOCKS_DB.find(x => x.sym === p.sym);
            const price = lp?.price ?? s?.price ?? p.avgCost;
            const mv = price * p.shares;
            const gl = (price - p.avgCost) * p.shares;
            const glPct = p.avgCost > 0 ? (price - p.avgCost) / p.avgCost * 100 : 0;
            return { sym: p.sym, shares: p.shares, price, mv, gl, glPct };
        });

        const totalMV = breakdown.reduce((s, b) => s + b.mv, 0);

        // Update the Initial Amount field
        const initField = document.getElementById('initAmount');
        initField.value = Math.round(totalMV);
        state.initAmount = Math.round(totalMV);

        // Animate the input to show it was updated
        initField.style.transition = 'border-color .3s, box-shadow .3s';
        initField.style.borderColor = 'var(--teal)';
        initField.style.boxShadow = '0 0 0 3px var(--teal-glow)';
        setTimeout(() => { initField.style.borderColor = ''; initField.style.boxShadow = ''; }, 2000);

        // Show breakdown
        const fmtNum = n => Math.abs(n).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        resultEl.style.display = 'block';
        resultEl.innerHTML = `
            <div style="color:var(--gold);font-size:12px;font-weight:700;margin-bottom:6px">
                Total Market Value: $${fmtNum(totalMV)}
            </div>
            ${breakdown.map(b => `
                <div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid rgba(30,50,80,.3)">
                    <span style="color:var(--text2)">${b.sym} ×${b.shares}</span>
                    <span>$${fmtNum(b.mv)} <span style="font-size:9px" class="${b.gl >= 0 ? 'pos' : 'neg'}">${b.gl >= 0 ? '+' : ''}${b.glPct.toFixed(1)}%</span></span>
                </div>`).join('')}
            <div style="margin-top:6px;font-size:10px;color:var(--text3)">✓ Initial Amount updated · Recalculate to refresh projections</div>`;

        // Re-render charts with the new value
        renderCharts();
        renderTopMetrics();
        buildTickerTape();
        notify('✓ Portfolio value synced — $' + fmtNum(totalMV), 'success');

    } catch (e) {
        resultEl.style.display = 'block';
        resultEl.style.color = 'var(--red)';
        resultEl.style.borderColor = 'rgba(255,77,109,.2)';
        resultEl.style.background = 'rgba(255,77,109,.06)';
        resultEl.textContent = '⚠ Could not fetch live prices. Using local data.';

        // Fallback: use STOCKS_DB prices
        const totalMV = state.portfolio.reduce((sum, p) => {
            const s = STOCKS_DB.find(x => x.sym === p.sym);
            return sum + (s ? s.price * p.shares : p.avgCost * p.shares);
        }, 0);
        document.getElementById('initAmount').value = Math.round(totalMV);
        state.initAmount = Math.round(totalMV);
        renderCharts();
        notify('Portfolio synced with local prices', 'success');
    } finally {
        icon.textContent = '✓';
        label.textContent = 'Synced!';
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        setTimeout(() => { icon.textContent = '📊'; label.textContent = 'Sync Portfolio Value'; }, 3000);
    }
}

// =============================================
// CHART HELPERS
// =============================================
function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

function defaultChartOptions(unit = '') {
    return {
        responsive: true, maintainAspectRatio: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { labels: { color: '#8fa3c0', font: { size: 10, family: 'Space Mono' }, boxWidth: 12 } },
            tooltip: {
                backgroundColor: '#111a27', borderColor: '#1e3250', borderWidth: 1, titleColor: '#e8edf5', bodyColor: '#8fa3c0',
                callbacks: { label: c => `  ${c.dataset.label}: ${unit === '$' ? '$' : ''}${typeof c.raw === 'number' ? c.raw.toLocaleString() : c.raw}${unit === '%' ? '%' : unit === 'B' ? 'B' : ''}` }
            }
        },
        scales: {
            x: { ticks: { color: '#4e6a8a', font: { size: 10 }, maxTicksLimit: 8 }, grid: { color: 'rgba(30,50,80,.2)' } },
            y: { ticks: { color: '#4e6a8a', font: { size: 10 }, callback: v => unit === '$' ? `$${v >= 1000 ? Math.round(v / 1000) + 'k' : v}` : v + (unit === '%' ? '%' : unit === 'B' ? 'B' : '') }, grid: { color: 'rgba(30,50,80,.2)' } }
        }
    };
}

// =============================================
// ALL CHARTS
// =============================================
function renderCharts() {
    renderProjectionChart(); renderAllocationChart(); renderRiskReturnChart();
    renderHistoricalChart(); renderMonteCarloChart(); renderBlackScholesChart();
    renderARIMAChart(); renderVolatilityChart(); renderFinancials(state.finTab);
    renderRevIncomeChart(); renderMarginsChart(); renderComparisonChart(); updateStockComparison();
}

function renderProjectionChart() {
    destroyChart('proj');
    const months = Math.round(state.horizon * 12), labels = [];
    const conservative = [], base = [], optimistic = [];
    let v_c = state.initAmount, v_b = state.initAmount, v_o = state.initAmount;
    const r_c = (4.5 + state.riskLevel * 0.5) / 100 / 12, r_b = (6 + state.riskLevel * 1.5) / 100 / 12, r_o = (8 + state.riskLevel * 2.5) / 100 / 12;
    const monthly = state.frequency === 'monthly' ? state.recurAmount : state.recurAmount / 12;
    for (let i = 0; i <= months; i++) {
        labels.push(i === 0 ? 'Now' : `M${i}`);
        conservative.push(+v_c.toFixed(0)); base.push(+v_b.toFixed(0)); optimistic.push(+v_o.toFixed(0));
        v_c = v_c * (1 + r_c) + monthly; v_b = v_b * (1 + r_b) + monthly; v_o = v_o * (1 + r_o) + monthly;
    }
    document.getElementById('projectionSummary').innerHTML = `
    <div class="proj-row"><span>Conservative</span><span style="color:var(--text2)">$${conservative[conservative.length - 1].toLocaleString()}</span></div>
    <div class="proj-row"><span>Base Case</span><span>$${base[base.length - 1].toLocaleString()}</span></div>
    <div class="proj-row"><span>Optimistic</span><span style="color:var(--teal)">$${optimistic[optimistic.length - 1].toLocaleString()}</span></div>
    <div class="proj-row"><span>Total Contributions</span><span style="color:var(--blue)">$${(state.initAmount + monthly * months).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</span></div>`;
    const skip = months > 24 ? 3 : 1;
    const fLabels = labels.filter((_, i) => i % skip === 0);
    charts.proj = new Chart(document.getElementById('projectionChart'), {
        type: 'line', data: {
            labels: fLabels, datasets: [
                { label: 'Optimistic', data: optimistic.filter((_, i) => i % skip === 0), borderColor: '#00d4b1', backgroundColor: 'rgba(0,212,177,.05)', fill: true, tension: .4, pointRadius: 0 },
                { label: 'Base Case', data: base.filter((_, i) => i % skip === 0), borderColor: '#d4a843', backgroundColor: 'rgba(212,168,67,.08)', fill: true, tension: .4, pointRadius: 0, borderWidth: 2 },
                { label: 'Conservative', data: conservative.filter((_, i) => i % skip === 0), borderColor: '#4e6a8a', backgroundColor: 'rgba(78,106,138,.05)', fill: true, tension: .4, pointRadius: 0 },
            ]
        }, options: defaultChartOptions('$')
    });
}

function renderAllocationChart() {
    destroyChart('alloc');
    const tv = state.portfolio.reduce((s, p) => { const x = STOCKS_DB.find(y => y.sym === p.sym); return s + (x ? x.price * p.shares : 0); }, 0);
    const data = state.portfolio.map(p => { const s = STOCKS_DB.find(x => x.sym === p.sym); return { label: p.sym, value: s ? +(s.price * p.shares / tv * 100).toFixed(1) : 0, color: s?.color || '#fff' }; });
    charts.alloc = new Chart(document.getElementById('allocationChart'), {
        type: 'doughnut', data: { labels: data.map(d => d.label), datasets: [{ data: data.map(d => d.value), backgroundColor: data.map(d => d.color), borderColor: '#06090f', borderWidth: 3 }] },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { labels: { color: '#8fa3c0', font: { size: 11, family: 'Space Mono' } } }, tooltip: { callbacks: { label: c => `${c.label}: ${c.raw}%` } } } }
    });
}

function renderRiskReturnChart() {
    destroyChart('rr');
    const stocks = state.portfolio.map(p => { const s = STOCKS_DB.find(x => x.sym === p.sym); return { label: p.sym, x: +(Math.random() * 20 + 5).toFixed(1), y: +(Math.random() * 15 + 3).toFixed(1), r: Math.sqrt(s ? s.price * p.shares : 100) / 4, color: s?.color || '#fff' }; });
    charts.rr = new Chart(document.getElementById('riskReturnChart'), {
        type: 'bubble', data: { datasets: stocks.map(s => ({ label: s.label, data: [{ x: s.x, y: s.y, r: s.r }], backgroundColor: s.color + '99', borderColor: s.color })) },
        options: { responsive: true, maintainAspectRatio: true, scales: { x: { title: { display: true, text: 'Risk (Vol %)', color: '#4e6a8a' }, ticks: { color: '#4e6a8a' }, grid: { color: 'rgba(30,50,80,.2)' } }, y: { title: { display: true, text: 'Return %', color: '#4e6a8a' }, ticks: { color: '#4e6a8a' }, grid: { color: 'rgba(30,50,80,.2)' } } }, plugins: { legend: { labels: { color: '#8fa3c0', font: { size: 10 } } } } }
    });
}

function renderHistoricalChart() {
    destroyChart('hist');
    const n = 52, labels = Array.from({ length: n }, (_, i) => `W${i + 1}`);
    const gen = (start, vol, trend) => { let v = start; return Array.from({ length: n }, () => { v *= (1 + (Math.random() - .48) * vol + trend / n); return +v.toFixed(2); }); };
    charts.hist = new Chart(document.getElementById('historicalChart'), {
        type: 'line', data: {
            labels, datasets: [
                { label: 'Portfolio', data: gen(10000, .04, .18), borderColor: '#d4a843', backgroundColor: 'rgba(212,168,67,.08)', fill: true, tension: .3, pointRadius: 0, borderWidth: 2 },
                { label: 'S&P 500', data: gen(10000, .025, .12), borderColor: '#4d9fff', backgroundColor: 'transparent', tension: .3, pointRadius: 0 },
                { label: 'NASDAQ', data: gen(10000, .035, .15), borderColor: '#a855f7', backgroundColor: 'transparent', tension: .3, pointRadius: 0 },
                { label: 'Bond Index', data: gen(10000, .008, .045), borderColor: '#4e6a8a', backgroundColor: 'transparent', tension: .3, pointRadius: 0 },
            ]
        }, options: defaultChartOptions('$')
    });
}

function renderMonteCarloChart() {
    destroyChart('mc');
    const n = 60, labels = Array.from({ length: n + 1 }, (_, i) => i === 0 ? 'Today' : `M${i}`);
    const sims = 50, init = 10000, r = (4 + state.riskLevel * 1.5) / 100 / 12, vol = (5 + state.riskLevel * 2) / 100;
    const paths = Array.from({ length: sims }, () => { let v = init; return [v, ...Array.from({ length: n }, () => { v *= Math.exp((r - vol ** 2 / 2) + (vol * (Math.random() * 2 - 1) * .3)); return +v.toFixed(0); })]; });
    const pct = (p) => paths[0].map((_, i) => Math.round(paths.map(x => x[i]).sort((a, b) => a - b)[Math.floor(sims * p)]));
    const p10 = pct(.1), p50 = pct(.5), p90 = pct(.9);
    const ds = paths.slice(0, 20).map(p => ({ data: p, borderColor: 'rgba(77,159,255,0.06)', pointRadius: 0, tension: .3, borderWidth: 1, fill: false }));
    ds.push({ label: '90th', data: p90, borderColor: '#00d4b1', pointRadius: 0, tension: .3, borderWidth: 2.5, fill: false });
    ds.push({ label: 'Median', data: p50, borderColor: '#d4a843', pointRadius: 0, tension: .3, borderWidth: 2.5, fill: false });
    ds.push({ label: '10th', data: p10, borderColor: '#ff4d6d', pointRadius: 0, tension: .3, borderWidth: 2.5, fill: false });
    charts.mc = new Chart(document.getElementById('monteCarloChart'), { type: 'line', data: { labels, datasets: ds }, options: defaultChartOptions('$') });
}

function renderBlackScholesChart() {
    destroyChart('bs');
    const S0 = 150, K = 150, r = 0.045, sigma = 0.25, T = 1;
    const norm = x => { const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911; const sign = x < 0 ? -1 : 1; x = Math.abs(x) / Math.sqrt(2); const t = 1 / (1 + p * x); const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x); return 0.5 * (1 + sign * y); };
    const bs = S => { const d1 = (Math.log(S / K) + (r + sigma ** 2 / 2) * T) / (sigma * Math.sqrt(T)); const d2 = d1 - sigma * Math.sqrt(T); return { call: S * norm(d1) - K * Math.exp(-r * T) * norm(d2), put: K * Math.exp(-r * T) * norm(-d2) - S * norm(-d1) }; };
    const prices = Array.from({ length: 41 }, (_, i) => S0 - 20 + i);
    charts.bs = new Chart(document.getElementById('blackScholesChart'), {
        type: 'line', data: {
            labels: prices, datasets: [
                { label: 'Call', data: prices.map(s => +bs(s).call.toFixed(2)), borderColor: '#00d4b1', fill: false, tension: .4, pointRadius: 0, borderWidth: 2 },
                { label: 'Put', data: prices.map(s => +bs(s).put.toFixed(2)), borderColor: '#ff4d6d', fill: false, tension: .4, pointRadius: 0, borderWidth: 2 },
            ]
        }, options: { ...defaultChartOptions('$'), scales: { x: { title: { display: true, text: 'Underlying ($)', color: '#4e6a8a' }, ticks: { color: '#4e6a8a' }, grid: { color: 'rgba(30,50,80,.2)' } }, y: { ticks: { color: '#4e6a8a', callback: v => `$${v}` }, grid: { color: 'rgba(30,50,80,.2)' } } } }
    });
}

function renderARIMAChart() {
    destroyChart('arima');
    const hist = Array.from({ length: 24 }, (_, i) => +(180 + Math.sin(i * .5) * 8 + i * 1.2 + (Math.random() - .5) * 5).toFixed(2));
    const lastVal = hist[hist.length - 1];
    const forecast = Array.from({ length: 13 }, (_, i) => +(lastVal + i * 2.1 + (Math.random() - .5) * 3).toFixed(2));
    const upper = forecast.map((v, i) => +(v + i * 2.5).toFixed(2)), lower = forecast.map((v, i) => +(v - i * 2.5).toFixed(2));
    const labels = [...Array.from({ length: 24 }, (_, i) => `M${i + 1}`), ...Array.from({ length: 13 }, (_, i) => `F${i + 1}`)];
    const hF = [...hist, ...Array(13).fill(null)], fF = [...Array(23).fill(null), lastVal, ...forecast.slice(1)];
    const uF = [...Array(23).fill(null), lastVal, ...upper.slice(1)], lF = [...Array(23).fill(null), lastVal, ...lower.slice(1)];
    charts.arima = new Chart(document.getElementById('arimaChart'), {
        type: 'line', data: {
            labels, datasets: [
                { label: 'Historical', data: hF, borderColor: '#d4a843', pointRadius: 0, tension: .3, borderWidth: 2, fill: false },
                { label: 'Forecast', data: fF, borderColor: '#4d9fff', pointRadius: 0, tension: .3, borderWidth: 2, borderDash: [5, 3], fill: false },
                { label: 'Upper CI', data: uF, borderColor: 'rgba(77,159,255,.3)', pointRadius: 0, tension: .3, borderWidth: 1, fill: false },
                { label: 'Lower CI', data: lF, borderColor: 'rgba(77,159,255,.3)', pointRadius: 0, tension: .3, borderWidth: 1, fill: '+2' },
            ]
        }, options: defaultChartOptions('$')
    });
}

function renderVolatilityChart() {
    destroyChart('vol');
    const strikes = [80, 90, 100, 110, 120, 130, 140, 150, 160, 170];
    const iv = (k, b) => +(b + Math.abs(k - 130) * 0.12 + (Math.random() * 2)).toFixed(1);
    charts.vol = new Chart(document.getElementById('volatilityChart'), {
        type: 'line', data: {
            labels: strikes.map(k => `$${k}`), datasets: [
                { label: '1M', data: strikes.map(k => iv(k, 20)), borderColor: '#ff4d6d', pointRadius: 3, tension: .4, borderWidth: 2 },
                { label: '3M', data: strikes.map(k => iv(k, 22)), borderColor: '#d4a843', pointRadius: 3, tension: .4, borderWidth: 2 },
                { label: '6M', data: strikes.map(k => iv(k, 24)), borderColor: '#4d9fff', pointRadius: 3, tension: .4, borderWidth: 2 },
            ]
        }, options: { ...defaultChartOptions('%'), scales: { x: { title: { display: true, text: 'Strike', color: '#4e6a8a' }, ticks: { color: '#4e6a8a' }, grid: { color: 'rgba(30,50,80,.2)' } }, y: { title: { display: true, text: 'IV %', color: '#4e6a8a' }, ticks: { color: '#4e6a8a', callback: v => v + '%' }, grid: { color: 'rgba(30,50,80,.2)' } } } }
    });
}

function renderFinancials(type) {
    destroyChart('fin'); state.finTab = type;
    const years = ['2020', '2021', '2022', '2023', '2024'];
    const ds = {
        income: [{ label: 'Revenue ($B)', data: [274, 365, 394, 383, 391], backgroundColor: '#d4a84399' }, { label: 'Gross Profit ($B)', data: [105, 153, 170, 169, 178], backgroundColor: '#00d4b199' }, { label: 'Op Income ($B)', data: [66, 109, 119, 114, 120], backgroundColor: '#4d9fff99' }, { label: 'Net Income ($B)', data: [57, 95, 100, 97, 101], backgroundColor: '#a855f799' }],
        balance: [{ label: 'Total Assets ($B)', data: [323, 351, 352, 352, 365], backgroundColor: '#d4a84399' }, { label: 'Total Liabilities ($B)', data: [258, 287, 302, 290, 295], backgroundColor: '#ff4d6d99' }, { label: 'Equity ($B)', data: [65, 64, 50, 62, 70], backgroundColor: '#00d4b199' }],
        cashflow: [{ label: 'Operating CF ($B)', data: [80, 104, 122, 114, 120], backgroundColor: '#00d4b199' }, { label: 'Investing CF ($B)', data: [-34, -14, -23, -21, -25], backgroundColor: '#ff4d6d99' }, { label: 'Financing CF ($B)', data: [-87, -93, -109, -107, -115], backgroundColor: '#a855f799' }]
    };
    charts.fin = new Chart(document.getElementById('financialsChart'), { type: 'bar', data: { labels: years, datasets: ds[type] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#8fa3c0', font: { size: 11 } } } }, scales: { x: { ticks: { color: '#4e6a8a' }, grid: { color: 'rgba(30,50,80,.2)' } }, y: { ticks: { color: '#4e6a8a' }, grid: { color: 'rgba(30,50,80,.2)' } } } } });
}
function setFinTab(type, el) { document.querySelectorAll('.fin-tab').forEach(t => t.classList.remove('active')); el.classList.add('active'); renderFinancials(type); }

function renderRevIncomeChart() {
    destroyChart('rev');
    charts.rev = new Chart(document.getElementById('revIncomeChart'), {
        type: 'line', data: {
            labels: ['2020', '2021', '2022', '2023', '2024'], datasets: [
                { label: 'Revenue ($B)', data: [274, 365, 394, 383, 391], borderColor: '#d4a843', tension: .4, fill: false, borderWidth: 2 },
                { label: 'Net Income ($B)', data: [57, 95, 100, 97, 101], borderColor: '#00d4b1', tension: .4, fill: false, borderWidth: 2 },
            ]
        }, options: defaultChartOptions('B')
    });
}

function renderMarginsChart() {
    destroyChart('margin');
    charts.margin = new Chart(document.getElementById('marginsChart'), {
        type: 'line', data: {
            labels: ['2020', '2021', '2022', '2023', '2024'], datasets: [
                { label: 'Gross', data: [38.2, 41.8, 43.3, 44.1, 45.5], borderColor: '#d4a843', tension: .4, fill: false, borderWidth: 2 },
                { label: 'Operating', data: [24.1, 29.8, 30.3, 29.8, 30.7], borderColor: '#4d9fff', tension: .4, fill: false, borderWidth: 2 },
                { label: 'Net', data: [20.9, 26.0, 25.4, 25.3, 25.8], borderColor: '#00d4b1', tension: .4, fill: false, borderWidth: 2 },
            ]
        }, options: { ...defaultChartOptions('%'), scales: { x: { ticks: { color: '#4e6a8a' }, grid: { color: 'rgba(30,50,80,.2)' } }, y: { ticks: { color: '#4e6a8a', callback: v => v + '%' }, grid: { color: 'rgba(30,50,80,.2)' } } } }
    });
}

function renderComparisonChart() {
    destroyChart('comp');
    const n = 24, labels = Array.from({ length: n }, (_, i) => `M${i + 1}`);
    const gen = (s, t) => Array.from({ length: n }, (_, i) => +(s * (1 + t) ** ((i + 1) / 12) * (1 + (Math.random() - .49) * .04)).toFixed(0));
    charts.comp = new Chart(document.getElementById('comparisonChart'), {
        type: 'line', data: {
            labels, datasets: [
                { label: 'Portfolio A', data: gen(10000, .10), borderColor: '#d4a843', backgroundColor: 'rgba(212,168,67,.08)', fill: true, tension: .4, pointRadius: 0, borderWidth: 2 },
                { label: 'Portfolio B', data: gen(10000, .16), borderColor: '#4d9fff', backgroundColor: 'rgba(77,159,255,.08)', fill: true, tension: .4, pointRadius: 0, borderWidth: 2 },
                { label: 'S&P 500', data: gen(10000, .09), borderColor: '#4e6a8a', fill: false, tension: .4, pointRadius: 0, borderDash: [4, 2] },
            ]
        }, options: defaultChartOptions('$')
    });
}

function updateStockComparison() {
    destroyChart('stockcomp');
    const symA = document.getElementById('stockA')?.value || 'AAPL', symB = document.getElementById('stockB')?.value || 'MSFT';
    const sA = STOCKS_DB.find(s => s.sym === symA), sB = STOCKS_DB.find(s => s.sym === symB);
    const n = 52, labels = Array.from({ length: n }, (_, i) => `W${i + 1}`);
    const gen = s => { let v = s.price * .7; return Array.from({ length: n }, () => { v *= (1 + (Math.random() - .48) * .03); return +v.toFixed(2); }); };
    charts.stockcomp = new Chart(document.getElementById('stockCompChart'), {
        type: 'line', data: {
            labels, datasets: [
                { label: symA, data: gen(sA || { price: 150 }), borderColor: sA?.color || '#d4a843', fill: false, tension: .3, pointRadius: 0, borderWidth: 2 },
                { label: symB, data: gen(sB || { price: 200 }), borderColor: sB?.color || '#4d9fff', fill: false, tension: .3, pointRadius: 0, borderWidth: 2 },
            ]
        }, options: defaultChartOptions('$')
    });
}

// ── Ratio defaults per sector when no Yahoo data is cached ──────────────────
const SECTOR_RATIOS = {
    'Technology': { pe: 28, pb: 7.5, evEbitda: 20, deRatio: 0.4, roe: 32, roa: 16, fcfYield: 3.2, divYield: 0.6 },
    'Healthcare': { pe: 22, pb: 4.2, evEbitda: 17, deRatio: 0.5, roe: 18, roa: 10, fcfYield: 4.1, divYield: 1.8 },
    'Finance': { pe: 13, pb: 1.4, evEbitda: 11, deRatio: 2.8, roe: 12, roa: 1.2, fcfYield: 5.0, divYield: 2.5 },
    'Energy': { pe: 14, pb: 1.8, evEbitda: 8, deRatio: 0.7, roe: 14, roa: 7, fcfYield: 7.2, divYield: 3.8 },
    'Consumer': { pe: 20, pb: 3.5, evEbitda: 14, deRatio: 0.6, roe: 20, roa: 10, fcfYield: 4.5, divYield: 1.4 },
    'Industrial': { pe: 19, pb: 3.0, evEbitda: 13, deRatio: 0.8, roe: 16, roa: 8, fcfYield: 4.8, divYield: 1.9 },
    'Real Estate': { pe: 35, pb: 1.6, evEbitda: 18, deRatio: 1.2, roe: 8, roa: 3, fcfYield: 5.3, divYield: 4.5 },
    'Utilities': { pe: 18, pb: 1.8, evEbitda: 12, deRatio: 1.3, roe: 10, roa: 4, fcfYield: 5.8, divYield: 3.5 },
    'Unknown': { pe: 22, pb: 3.5, evEbitda: 15, deRatio: 0.7, roe: 18, roa: 9, fcfYield: 4.0, divYield: 1.5 },
};

function renderRatios() {
    const holdings = state.portfolio;
    if (!holdings.length) {
        document.getElementById('ratiosGrid').innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--text3);padding:24px">Add stocks to see portfolio ratios</div>`;
        return;
    }

    // Build per-holding market value weights
    const totalValue = holdings.reduce((s, p) => {
        const lp = livePrices[p.sym]; const db = STOCKS_DB.find(x => x.sym === p.sym);
        return s + (lp?.price ?? db?.price ?? p.avgCost) * p.shares;
    }, 0);

    let wPe = 0, wPb = 0, wEv = 0, wDe = 0, wRoe = 0, wRoa = 0, wFcf = 0, wDiv = 0;

    holdings.forEach(p => {
        const lp = livePrices[p.sym]; const db = STOCKS_DB.find(x => x.sym === p.sym);
        const price = lp?.price ?? db?.price ?? p.avgCost;
        const mv = price * p.shares;
        const weight = totalValue > 0 ? mv / totalValue : 1 / holdings.length;

        // Try to get real ratios from Yahoo Finance cached summary
        const cache = liveCache[p.sym];
        const summary = cache?.summary;
        const kstats = summary?.defaultKeyStatistics || {};
        const keyDets = summary?.summaryDetail || {};
        const fins = summary?.financialData || {};

        // Use real data if available, else sector fallback
        const sector = db?.sector || cache?.sector || 'Unknown';
        const sectorKey = Object.keys(SECTOR_RATIOS).find(k => sector.toLowerCase().includes(k.toLowerCase())) || 'Unknown';
        const def = SECTOR_RATIOS[sectorKey];

        const pe = keyDets.trailingPE?.raw || kstats.forwardPE?.raw || def.pe;
        const pb = kstats.priceToBook?.raw || def.pb;
        const ev = kstats.enterpriseToEbitda?.raw || def.evEbitda;
        const de = fins.debtToEquity?.raw != null ? fins.debtToEquity.raw / 100 : def.deRatio;
        const roe = fins.returnOnEquity?.raw != null ? fins.returnOnEquity.raw * 100 : def.roe;
        const roa = fins.returnOnAssets?.raw != null ? fins.returnOnAssets.raw * 100 : def.roa;
        const fcf = keyDets.fiveYearAvgDividendYield?.raw ? def.fcfYield : def.fcfYield;
        const div = keyDets.dividendYield?.raw != null ? keyDets.dividendYield.raw * 100 : def.divYield;

        wPe += pe * weight;
        wPb += pb * weight;
        wEv += ev * weight;
        wDe += de * weight;
        wRoe += roe * weight;
        wRoa += roa * weight;
        wFcf += fcf * weight;
        wDiv += div * weight;
    });

    // Safe rounding
    const r = (v, dec = 1) => isFinite(v) ? v.toFixed(dec) : '—';

    const ratios = [
        { name: 'P/E Ratio', val: `${r(wPe)}x`, bar: Math.min(wPe / 50 * 100, 100), color: '#d4a843', sub: `Industry avg: ${(wPe * 0.88).toFixed(1)}x` },
        { name: 'P/B Ratio', val: `${r(wPb)}x`, bar: Math.min(wPb / 10 * 100, 100), color: '#00d4b1', sub: 'Book value multiple' },
        { name: 'EV/EBITDA', val: `${r(wEv)}x`, bar: Math.min(wEv / 30 * 100, 100), color: '#4d9fff', sub: 'Enterprise multiple' },
        { name: 'Debt/Equity', val: r(wDe, 2), bar: Math.min(wDe / 3 * 100, 100), color: '#ff4d6d', sub: wDe < 0.5 ? 'Low leverage ✓' : wDe < 1.2 ? 'Moderate leverage' : 'High leverage ⚠' },
        { name: 'ROE', val: `${r(wRoe)}%`, bar: Math.min(wRoe / 40 * 100, 100), color: '#a855f7', sub: 'Return on equity' },
        { name: 'ROA', val: `${r(wRoa)}%`, bar: Math.min(wRoa / 20 * 100, 100), color: '#d4a843', sub: 'Asset efficiency' },
        { name: 'FCF Yield', val: `${r(wFcf)}%`, bar: Math.min(wFcf / 10 * 100, 100), color: '#00d4b1', sub: 'FCF / Market cap est.' },
        { name: 'Div Yield', val: `${r(wDiv, 2)}%`, bar: Math.min(wDiv / 6 * 100, 100), color: '#4e6a8a', sub: wDiv < 0.1 ? 'No dividend' : 'Annual dividend' },
    ];

    const holdingsLabel = `${holdings.length} holding${holdings.length !== 1 ? 's' : ''} · Portfolio-weighted`;
    document.getElementById('ratiosGrid').innerHTML =
        `<div style="grid-column:1/-1;font-size:10px;color:var(--text3);margin-bottom:4px;letter-spacing:.5px">⚡ ${holdingsLabel}</div>` +
        ratios.map(r => `
    <div class="ratio-card">
        <div class="ratio-name">${r.name}</div>
        <div class="ratio-val" style="color:${r.color}">${r.val}</div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:4px">${r.sub}</div>
        <div class="ratio-bar-wrap"><div class="ratio-bar" style="width:${r.bar.toFixed(1)}%;background:${r.color}"></div></div>
    </div>`).join('');
}


// =============================================
// NEWS
// =============================================
function renderNews() {
    const news = [
        { sym: 'AAPL', title: 'Apple Reports Record Q1 Revenue Driven by iPhone 15 Pro Demand', time: '2h ago', source: 'Reuters', sent: 'pos' },
        { sym: 'NVDA', title: 'NVIDIA Shares Surge 4% as AI Data Center Revenue Exceeds $18B', time: '3h ago', source: 'Bloomberg', sent: 'pos' },
        { sym: 'MSFT', title: 'Microsoft Integrates GPT-5 Across Office Suite', time: '5h ago', source: 'WSJ', sent: 'pos' },
        { sym: 'TSLA', title: 'Tesla Faces Margin Pressure as EV Competition Intensifies in China', time: '6h ago', source: 'FT', sent: 'neg' },
        { sym: 'META', title: 'Meta Unveils New AR Glasses With 8-Hour Battery Life', time: '8h ago', source: 'TechCrunch', sent: 'pos' },
        { sym: 'JPM', title: 'Fed Signals Rate Cuts May Begin Q3 2025, Financials React', time: '10h ago', source: 'CNBC', sent: 'pos' },
        { sym: 'XOM', title: 'Oil Prices Dip on OPEC+ Supply Increase Plans', time: '12h ago', source: 'Bloomberg', sent: 'neg' },
        { sym: 'GOOGL', title: 'Alphabet Faces EU Antitrust Scrutiny Over Search AI', time: '14h ago', source: 'Reuters', sent: 'neg' },
    ];
    document.getElementById('newsFeed').innerHTML = news.map(n => `
    <div class="news-card"><div class="news-sentiment ${n.sent}"></div><div class="news-body">
    <div class="news-title">${n.title}</div>
    <div class="news-meta"><span class="news-sym">${n.sym}</span><span class="news-tag ${n.sent}">${n.sent === 'pos' ? 'Bullish' : 'Bearish'}</span><span>${n.source}</span><span>${n.time}</span></div></div></div>
  `).join('');
}

// =============================================
// COMPARISON STATS
// =============================================
function renderComparison() {
    const mk = (stats, color = 'var(--text)') => stats.map(([l, v]) => `<div class="compare-stat"><span>${l}</span><span style="color:${color}">${v}</span></div>`).join('');
    document.getElementById('compareA').innerHTML = mk([['Annual Return', '10.2%'], ['Sharpe Ratio', '1.24'], ['Max Drawdown', '-12.3%'], ['Volatility', '11.2%'], ['Beta', '0.85'], ['Holdings', '12']]);
    document.getElementById('compareB').innerHTML = mk([['Annual Return', '16.8%'], ['Sharpe Ratio', '1.08'], ['Max Drawdown', '-24.1%'], ['Volatility', '21.5%'], ['Beta', '1.35'], ['Holdings', '8']], 'var(--blue)');
}

// =============================================
// TABS
// =============================================
function switchTab(tab) {
    const tabs = ['holdings', 'overview', 'analysis', 'financials', 'comparison', 'news', 'simulation', 'optimizer'];
    document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', tabs[i] === tab));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');
    setTimeout(() => {
        if (tab === 'overview') { renderAllocationChart(); renderRiskReturnChart(); renderHistoricalChart(); }
        if (tab === 'analysis') { renderMonteCarloChart(); renderBlackScholesChart(); renderARIMAChart(); renderVolatilityChart(); }
        if (tab === 'financials') { renderFinancials(state.finTab); renderRevIncomeChart(); renderMarginsChart(); }
        if (tab === 'comparison') { renderComparisonChart(); updateStockComparison(); }
        if (tab === 'holdings') { renderProjectionChart(); }
        if (tab === 'simulation') { if (typeof runSimulation === 'function') runSimulation(); }
    }, 50);
}

// =============================================
// EXPORT
// =============================================
function exportExcel() {
    const wb = XLSX.utils.book_new();
    const data = [['Symbol', 'Shares', 'Avg Cost', 'Current Price', 'Market Value', 'Gain/Loss']];
    state.portfolio.forEach(p => { const s = STOCKS_DB.find(x => x.sym === p.sym); if (s) { const mv = s.price * p.shares, gl = (s.price - p.avgCost) * p.shares; data.push([p.sym, p.shares, p.avgCost.toFixed(2), s.price.toFixed(2), mv.toFixed(2), gl.toFixed(2)]); } });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'Portfolio');
    XLSX.writeFile(wb, 'QuantEdge_Portfolio.xlsx');
    notify('✓ Excel exported!', 'success');
}

function exportPDF() {
    const { jsPDF } = window.jspdf; const doc = new jsPDF();
    doc.setFontSize(18); doc.setTextColor(212, 168, 67); doc.text('QuantEdge — Portfolio Report', 20, 20);
    doc.setFontSize(11); doc.setTextColor(200, 200, 200); doc.text(`Generated: ${new Date().toLocaleDateString()} | Risk: ${state.riskLevel} | Horizon: ${state.horizonLabel}`, 20, 30);
    doc.setLineWidth(0.3); doc.setDrawColor(30, 50, 80); doc.line(20, 33, 190, 33);
    let y = 42; doc.setFontSize(13); doc.setTextColor(212, 168, 67); doc.text('Holdings', 20, y); y += 8;
    doc.setFontSize(10); doc.setTextColor(180, 180, 180);
    state.portfolio.forEach(p => { const s = STOCKS_DB.find(x => x.sym === p.sym); if (s) { doc.text(`${p.sym} — ${p.shares}sh @ $${p.avgCost.toFixed(2)} | Now: $${s.price.toFixed(2)} | MV: $${(s.price * p.shares).toFixed(2)} | G/L: $${((s.price - p.avgCost) * p.shares).toFixed(2)}`, 20, y); y += 7; } });
    doc.save('QuantEdge_Portfolio.pdf');
    notify('✓ PDF exported!', 'success');
}

// =============================================
// INITIAL RENDER
// =============================================
window.addEventListener('load', () => { renderProjectionChart(); });
