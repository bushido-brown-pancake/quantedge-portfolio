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
    const riskFree = (typeof macroState !== 'undefined' && macroState.riskFreeRate) ? macroState.riskFreeRate : 4.5;
    const _rfSrc = (typeof macroState !== 'undefined') ? macroState.riskFreeSource : 'default';
    const rfSource = _rfSrc === 'fred' ? 'FRED · DGS10'
                   : _rfSrc === 'alphavantage' ? 'Alpha Vantage · 10Y'
                   : '10Y UST (default)';
    const retAnnual = 8.5 + (state.riskLevel - 1) * 1.8;
    const sharpe = ((retAnnual - riskFree) / (8 + state.riskLevel * 1.5)).toFixed(2);
    const fmt = n => n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    document.getElementById('topMetrics').innerHTML = `
    <div class="metric-card gold"><div class="metric-label">Total Portfolio Value</div><div class="metric-value">$${fmt(totalValue)}</div><div class="metric-change ${gl >= 0 ? 'pos' : 'neg'}">${gl >= 0 ? '+' : ''}$${fmt(Math.abs(gl))} (${glPct >= 0 ? '+' : ''}${glPct.toFixed(1)}%)</div></div>
    <div class="metric-card teal"><div class="metric-label">Expected Annual Return</div><div class="metric-value">${retAnnual.toFixed(1)}%</div><div class="metric-sub">Risk-adjusted est.</div></div>
    <div class="metric-card blue"><div class="metric-label">Sharpe Ratio</div><div class="metric-value">${sharpe}</div><div class="metric-sub">Risk-free: ${riskFree.toFixed(2)}% (${rfSource})</div></div>
    <div class="metric-card purple"><div class="metric-label">Portfolio Beta</div><div class="metric-value">${(0.8 + state.riskLevel * 0.08).toFixed(2)}</div><div class="metric-sub">vs S&P 500</div></div>
    <div class="metric-card red"><div class="metric-label">Max Drawdown</div><div class="metric-value">-${(8 + state.riskLevel * 2.5).toFixed(1)}%</div><div class="metric-sub">Worst case scenario</div></div>
    <div class="metric-card gold"><div class="metric-label">10Y Bond Yield</div><div class="metric-value">${riskFree.toFixed(2)}%</div><div class="metric-sub">${_rfSrc === 'fred' ? '✓ Live from FRED' : _rfSrc === 'alphavantage' ? '✓ Live from Alpha Vantage' : 'Risk-free baseline'}</div></div>`;
}

// =============================================
// CALCULATE
// =============================================
function calculatePortfolio() {
    state.initAmount = +document.getElementById('initAmount').value || 10000;
    state.recurAmount = +document.getElementById('recurAmount').value || 0;
    notify('⚡ Fetching live prices...', 'success');
    // Use the main refreshLivePrices from app.js (fetches real market data)
    refreshLivePrices().then(() => {
        renderCharts(); renderProjection();
        updateTickerTape();
        notify('✓ Portfolio updated with live prices!', 'success');
    });
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
        updateTickerTape();
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

function _getPortfolioStats() {
    // Compute real portfolio value and volatility from live data
    const port = state.portfolio || [];
    let totalValue = 0;
    const closes = [];
    port.forEach(p => {
        const db = STOCKS_DB.find(x => x.sym === p.sym);
        const price = (typeof livePrices !== 'undefined' && livePrices[p.sym]?.price) || db?.price || 100;
        totalValue += price * p.shares;
        const c = (typeof liveCache !== 'undefined' && liveCache[p.sym]?.closes) || null;
        if (c && c.length > 5) closes.push({ closes: c, weight: price * p.shares });
    });
    // Compute weighted portfolio daily returns
    let annualVol = 0.15, annualRet = 0.08;
    if (closes.length > 0 && totalValue > 0) {
        const weights = closes.map(c => c.weight / totalValue);
        const minLen = Math.min(...closes.map(c => c.closes.length));
        const portReturns = [];
        for (let i = 1; i < minLen; i++) {
            let dayRet = 0;
            closes.forEach((c, j) => {
                const r = (c.closes[i] - c.closes[i - 1]) / c.closes[i - 1];
                dayRet += r * weights[j];
            });
            portReturns.push(dayRet);
        }
        if (portReturns.length > 10) {
            const mean = portReturns.reduce((a, b) => a + b, 0) / portReturns.length;
            const variance = portReturns.reduce((a, r) => a + (r - mean) ** 2, 0) / (portReturns.length - 1);
            annualVol = Math.sqrt(variance * 252);
            annualRet = mean * 252;
        }
    }
    // Get largest holding for B-S
    let largestSym = port[0]?.sym || 'AAPL', largestPrice = 100;
    port.forEach(p => {
        const db = STOCKS_DB.find(x => x.sym === p.sym);
        const price = (typeof livePrices !== 'undefined' && livePrices[p.sym]?.price) || db?.price || 100;
        if (price * p.shares > largestPrice * (port.find(q => q.sym === largestSym)?.shares || 1)) {
            largestSym = p.sym; largestPrice = price;
        } else if (p.sym === largestSym) { largestPrice = price; }
    });
    return { totalValue: totalValue || 10000, annualVol, annualRet, largestSym, largestPrice, closes };
}

function renderMonteCarloChart() {
    destroyChart('mc');
    const { totalValue, annualVol, annualRet } = _getPortfolioStats();
    const n = 60, labels = Array.from({ length: n + 1 }, (_, i) => i === 0 ? 'Now' : `M${i}`);
    const sims = 200, init = totalValue;
    const monthlyRet = annualRet / 12, monthlyVol = annualVol / Math.sqrt(12);
    // GBM simulation
    const paths = Array.from({ length: sims }, () => {
        let v = init;
        return [v, ...Array.from({ length: n }, () => {
            const z = Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random());
            v *= Math.exp((monthlyRet - monthlyVol ** 2 / 2) + monthlyVol * z);
            return +v.toFixed(0);
        })];
    });
    const pct = (p) => paths[0].map((_, i) => Math.round(paths.map(x => x[i]).sort((a, b) => a - b)[Math.floor(sims * p)]));
    const p5 = pct(.05), p25 = pct(.25), p50 = pct(.5), p75 = pct(.75), p95 = pct(.95);
    const ds = paths.slice(0, 15).map(p => ({ data: p, borderColor: 'rgba(77,159,255,0.04)', pointRadius: 0, tension: .3, borderWidth: 1, fill: false }));
    ds.push({ label: '95th pct', data: p95, borderColor: '#00d4b1', pointRadius: 0, tension: .3, borderWidth: 2, fill: false });
    ds.push({ label: '75th pct', data: p75, borderColor: 'rgba(0,212,177,.4)', pointRadius: 0, tension: .3, borderWidth: 1.5, borderDash: [3,3], fill: false });
    ds.push({ label: 'Median', data: p50, borderColor: '#d4a843', pointRadius: 0, tension: .3, borderWidth: 2.5, fill: false });
    ds.push({ label: '25th pct', data: p25, borderColor: 'rgba(255,77,109,.4)', pointRadius: 0, tension: .3, borderWidth: 1.5, borderDash: [3,3], fill: false });
    ds.push({ label: '5th pct', data: p5, borderColor: '#ff4d6d', pointRadius: 0, tension: .3, borderWidth: 2, fill: false });
    // Update chart title with real data
    const canvas = document.getElementById('monteCarloChart');
    const header = canvas?.closest('.chart-panel')?.querySelector('p');
    if (header) header.textContent = `${sims} paths · σ=${(annualVol*100).toFixed(1)}% · μ=${(annualRet*100).toFixed(1)}% · Start=$${init.toLocaleString()}`;
    charts.mc = new Chart(canvas, { type: 'line', data: { labels, datasets: ds }, options: defaultChartOptions('$') });
}

function renderBlackScholesChart() {
    destroyChart('bs');
    const { largestPrice, annualVol, largestSym } = _getPortfolioStats();
    const S0 = Math.round(largestPrice), K = S0, sigma = Math.max(0.1, annualVol), T = 1;
    const rf = (typeof macroState !== 'undefined' && macroState.riskFreeRate) ? macroState.riskFreeRate / 100 : 0.045;
    const norm = x => { const a1=.254829592,a2=-.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=.3275911; const sign=x<0?-1:1; x=Math.abs(x)/Math.sqrt(2); const t=1/(1+p*x); const y=1-((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t*Math.exp(-x*x); return .5*(1+sign*y); };
    const bs = S => { const d1=(Math.log(S/K)+(rf+sigma**2/2)*T)/(sigma*Math.sqrt(T)); const d2=d1-sigma*Math.sqrt(T); return { call: S*norm(d1)-K*Math.exp(-rf*T)*norm(d2), put: K*Math.exp(-rf*T)*norm(-d2)-S*norm(-d1) }; };
    const range = Math.max(20, Math.round(S0 * 0.15));
    const prices = Array.from({ length: 41 }, (_, i) => S0 - range + Math.round(i * range * 2 / 40));
    const canvas = document.getElementById('blackScholesChart');
    const header = canvas?.closest('.chart-panel')?.querySelector('p');
    if (header) header.textContent = `${largestSym} · S₀=$${S0} · K=$${K} · σ=${(sigma*100).toFixed(0)}% · rf=${(rf*100).toFixed(1)}%`;
    charts.bs = new Chart(canvas, {
        type: 'line', data: {
            labels: prices, datasets: [
                { label: 'Call', data: prices.map(s => +bs(s).call.toFixed(2)), borderColor: '#00d4b1', fill: false, tension: .4, pointRadius: 0, borderWidth: 2 },
                { label: 'Put', data: prices.map(s => +bs(s).put.toFixed(2)), borderColor: '#ff4d6d', fill: false, tension: .4, pointRadius: 0, borderWidth: 2 },
                { label: 'Intrinsic Call', data: prices.map(s => Math.max(0, s - K)), borderColor: 'rgba(0,212,177,.3)', borderDash: [5,5], fill: false, tension: 0, pointRadius: 0, borderWidth: 1 },
            ]
        }, options: { ...defaultChartOptions('$'), scales: { x: { title: { display: true, text: `${largestSym} Price ($)`, color: '#4e6a8a' }, ticks: { color: '#4e6a8a' }, grid: { color: 'rgba(30,50,80,.2)' } }, y: { ticks: { color: '#4e6a8a', callback: v => `$${v}` }, grid: { color: 'rgba(30,50,80,.2)' } } } }
    });
}

function renderARIMAChart() {
    destroyChart('arima');
    const { closes, totalValue } = _getPortfolioStats();
    // Build portfolio equity curve from real closes
    let histPrices = [];
    if (closes.length > 0 && totalValue > 0) {
        const weights = closes.map(c => c.weight / totalValue);
        const minLen = Math.min(...closes.map(c => c.closes.length));
        for (let i = 0; i < minLen; i++) {
            let val = 0;
            closes.forEach((c, j) => val += (c.closes[i] / c.closes[minLen - 1]) * weights[j] * totalValue);
            histPrices.push(+val.toFixed(2));
        }
    }
    if (histPrices.length < 10) {
        // Fallback: synthetic
        histPrices = Array.from({ length: 60 }, (_, i) => +(totalValue * (0.85 + i * 0.0025 + Math.sin(i * 0.3) * 0.02)).toFixed(2));
    }
    // Use last 60 points max
    const hist = histPrices.slice(-60);
    const lastVal = hist[hist.length - 1];
    // Simple AR(1) forecast
    const returns = []; for (let i = 1; i < hist.length; i++) returns.push((hist[i] - hist[i-1]) / hist[i-1]);
    const avgRet = returns.length > 0 ? returns.reduce((a,b) => a+b, 0) / returns.length : 0.001;
    const stdRet = returns.length > 1 ? Math.sqrt(returns.reduce((a,r) => a + (r - avgRet)**2, 0) / (returns.length - 1)) : 0.01;
    const forecast = [lastVal]; for (let i = 1; i <= 12; i++) forecast.push(+(forecast[i-1] * (1 + avgRet)).toFixed(2));
    const upper = forecast.map((v, i) => +(v * (1 + stdRet * Math.sqrt(i) * 1.96)).toFixed(2));
    const lower = forecast.map((v, i) => +(v * (1 - stdRet * Math.sqrt(i) * 1.96)).toFixed(2));
    const nH = hist.length, nF = forecast.length;
    const labels = [...hist.map((_, i) => i === 0 ? 'Start' : (i % 10 === 0 ? `D${i}` : '')), ...forecast.slice(1).map((_, i) => `F${i+1}`)];
    const hF = [...hist, ...Array(nF - 1).fill(null)];
    const fF = [...Array(nH - 1).fill(null), lastVal, ...forecast.slice(1)];
    const uF = [...Array(nH - 1).fill(null), lastVal, ...upper.slice(1)];
    const lF = [...Array(nH - 1).fill(null), lastVal, ...lower.slice(1)];
    const canvas = document.getElementById('arimaChart');
    const header = canvas?.closest('.chart-panel')?.querySelector('p');
    if (header) header.textContent = `AR(1) · μ=${(avgRet*25200).toFixed(1)}%/yr · σ=${(stdRet*Math.sqrt(252)*100).toFixed(1)}% · 12-day forecast`;
    charts.arima = new Chart(canvas, {
        type: 'line', data: {
            labels, datasets: [
                { label: 'Historical', data: hF, borderColor: '#d4a843', pointRadius: 0, tension: .3, borderWidth: 2, fill: false },
                { label: 'Forecast', data: fF, borderColor: '#4d9fff', pointRadius: 0, tension: .3, borderWidth: 2, borderDash: [5,3], fill: false },
                { label: 'Upper 95% CI', data: uF, borderColor: 'rgba(77,159,255,.3)', pointRadius: 0, tension: .3, borderWidth: 1, fill: false },
                { label: 'Lower 95% CI', data: lF, borderColor: 'rgba(77,159,255,.3)', pointRadius: 0, tension: .3, borderWidth: 1, fill: '+2', backgroundColor: 'rgba(77,159,255,.06)' },
            ]
        }, options: defaultChartOptions('$')
    });
}

function renderVolatilityChart() {
    destroyChart('vol');
    // Compute realized volatility at different lookback windows for portfolio stocks
    const port = state.portfolio || [];
    const windows = [5, 10, 21, 42, 63, 126, 252]; // 1w, 2w, 1m, 2m, 3m, 6m, 1y
    const windowLabels = ['1W', '2W', '1M', '2M', '3M', '6M', '1Y'];
    const topStocks = port.slice(0, 4);
    const datasets = [];
    const colors = ['#ff4d6d', '#d4a843', '#4d9fff', '#00d4b1'];
    topStocks.forEach((p, idx) => {
        const c = (typeof liveCache !== 'undefined' && liveCache[p.sym]?.closes) || null;
        if (!c || c.length < 10) return;
        const vols = windows.map(w => {
            const slice = c.slice(-Math.min(w + 1, c.length));
            if (slice.length < 3) return null;
            const rets = []; for (let i = 1; i < slice.length; i++) rets.push((slice[i] - slice[i-1]) / slice[i-1]);
            const mean = rets.reduce((a,b) => a+b, 0) / rets.length;
            const variance = rets.reduce((a,r) => a + (r - mean)**2, 0) / (rets.length - 1);
            return +(Math.sqrt(variance * 252) * 100).toFixed(1);
        });
        datasets.push({ label: p.sym, data: vols, borderColor: colors[idx % 4], pointRadius: 4, tension: .4, borderWidth: 2 });
    });
    if (datasets.length === 0) {
        // Fallback
        datasets.push({ label: 'No data', data: windows.map(() => 20), borderColor: '#888', pointRadius: 3, tension: .4, borderWidth: 1, borderDash: [5,5] });
    }
    const canvas = document.getElementById('volatilityChart');
    const header = canvas?.closest('.chart-panel')?.querySelector('p');
    if (header) header.textContent = `Realized volatility (annualized) across lookback windows`;
    charts.vol = new Chart(canvas, {
        type: 'line', data: { labels: windowLabels, datasets },
        options: { ...defaultChartOptions('%'), scales: { x: { title: { display: true, text: 'Lookback Window', color: '#4e6a8a' }, ticks: { color: '#4e6a8a' }, grid: { color: 'rgba(30,50,80,.2)' } }, y: { title: { display: true, text: 'Realized Vol %', color: '#4e6a8a' }, ticks: { color: '#4e6a8a', callback: v => v + '%' }, grid: { color: 'rgba(30,50,80,.2)' } } } }
    });
}

// =============================================
// FINANCIAL STATEMENTS — real per-ticker data via /api/yffinancials/:sym
// =============================================

// Fallback hardcoded data (AAPL-ish shape) — used only when the API is
// unreachable. Scaled by sector so numbers aren't absurd for small caps.
const FIN_FALLBACK_BASE = {
    years: [2020, 2021, 2022, 2023, 2024],
    income: { revenue: [274, 365, 394, 383, 391], grossProfit: [105, 153, 170, 169, 178], operatingIncome: [66, 109, 119, 114, 120], netIncome: [57, 95, 100, 97, 101] },
    balance: { totalAssets: [323, 351, 352, 352, 365], totalLiab: [258, 287, 302, 290, 295], equity: [65, 64, 50, 62, 70] },
    cashflow: { operating: [80, 104, 122, 114, 120], investing: [-34, -14, -23, -21, -25], financing: [-87, -93, -109, -107, -115] },
};

function _finScaleFactor(sym) {
    // Approximative scale based on market cap buckets so a mid-cap fallback
    // doesn't show $391B revenue. Purely cosmetic.
    const db = (typeof STOCKS_DB !== 'undefined') ? STOCKS_DB.find(s => s.sym === sym) : null;
    const price = db?.price || 100;
    if (price > 400) return 1.0;        // mega-cap
    if (price > 200) return 0.5;
    if (price > 100) return 0.25;
    if (price > 50) return 0.10;
    return 0.05;
}

function _buildFinFallback(sym) {
    const k = _finScaleFactor(sym);
    const scale = arr => arr.map(v => +(v * k).toFixed(1));
    return {
        ticker: sym,
        name: sym,
        _isFallback: true,
        income: FIN_FALLBACK_BASE.years.map((y, i) => ({
            year: y, revenue: scale(FIN_FALLBACK_BASE.income.revenue)[i] * 1e9,
            grossProfit: scale(FIN_FALLBACK_BASE.income.grossProfit)[i] * 1e9,
            operatingIncome: scale(FIN_FALLBACK_BASE.income.operatingIncome)[i] * 1e9,
            netIncome: scale(FIN_FALLBACK_BASE.income.netIncome)[i] * 1e9,
        })),
        balance: FIN_FALLBACK_BASE.years.map((y, i) => ({
            year: y, totalAssets: scale(FIN_FALLBACK_BASE.balance.totalAssets)[i] * 1e9,
            totalLiab: scale(FIN_FALLBACK_BASE.balance.totalLiab)[i] * 1e9,
            equity: scale(FIN_FALLBACK_BASE.balance.equity)[i] * 1e9,
        })),
        cashflow: FIN_FALLBACK_BASE.years.map((y, i) => ({
            year: y, operating: scale(FIN_FALLBACK_BASE.cashflow.operating)[i] * 1e9,
            investing: scale(FIN_FALLBACK_BASE.cashflow.investing)[i] * 1e9,
            financing: scale(FIN_FALLBACK_BASE.cashflow.financing)[i] * 1e9,
        })),
    };
}

// Convert a raw dollar value to billions (or millions) with appropriate rounding.
function _toB(v) { return v == null ? null : +(v / 1e9).toFixed(2); }

// Source priority chain: SEC EDGAR (5 ans, officiel) → Yahoo Finance → fallback
async function fetchFinancials(sym, { force = false } = {}) {
    if (!force && finCache[sym] && (Date.now() - finCache[sym]._timestamp) < 10 * 60 * 1000) {
        return finCache[sym];
    }

    // 1. Try SEC EDGAR first (official, 5+ years, no rate limit)
    try {
        const r = await fetch(`/api/sec/financials/${encodeURIComponent(sym)}`, { cache: 'no-store' });
        if (r.ok) {
            const data = await r.json();
            if (Array.isArray(data.income) && data.income.length > 0) {
                data._isFallback = false;
                data._source = 'sec-edgar';
                data._timestamp = Date.now();
                finCache[sym] = data;
                return data;
            }
        }
    } catch (e) { /* fallthrough to Yahoo */ }

    // 2. Fallback to Yahoo Finance (4 years typical)
    try {
        const r = await fetch(`/api/yffinancials/${encodeURIComponent(sym)}`, { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        if (!Array.isArray(data.income) || data.income.length === 0) throw new Error('Empty statements');
        data._isFallback = false;
        data._source = 'yahoo';
        data._timestamp = Date.now();
        finCache[sym] = data;
        return data;
    } catch (e) { /* fallthrough to Alpha Vantage */ }

    // 3. Fallback to Alpha Vantage (25 req/jour, donc en dernier)
    try {
        const r = await fetch(`/api/alpha/financials/${encodeURIComponent(sym)}`, { cache: 'no-store' });
        if (r.ok) {
            const data = await r.json();
            if (Array.isArray(data.income) && data.income.length > 0) {
                data._isFallback = false;
                data._source = 'alphavantage';
                data._timestamp = Date.now();
                finCache[sym] = data;
                return data;
            }
        }
    } catch (e) { /* fallthrough to static estimate */ }

    // 4. Dernière carte : estimation sectorielle
    console.warn('[fin] all live sources failed for', sym, '— using sector estimate');
    const fb = _buildFinFallback(sym);
    fb._source = 'sector-estimate';
    fb._timestamp = Date.now();
    finCache[sym] = fb;
    return fb;
}

function _currentFinTicker() {
    if (state.finTicker) {
        // Still valid if present in portfolio (or default anyway)
        return state.finTicker;
    }
    return state.portfolio?.[0]?.sym || 'AAPL';
}

function populateFinTickerSelect() {
    const sel = document.getElementById('finTickerSelect');
    if (!sel) return;
    const syms = [...new Set(state.portfolio.map(p => p.sym))];
    if (!syms.length) syms.push('AAPL');
    const current = _currentFinTicker();
    sel.innerHTML = syms.map(s => `<option value="${s}"${s === current ? ' selected' : ''}>${s}</option>`).join('');
    state.finTicker = sel.value;
}

function setFinTicker(sym) {
    state.finTicker = sym;
    renderFinancials(state.finTab || 'income');
    renderRevIncomeChart();
    renderMarginsChart();
}

function refreshFinancials() {
    const sym = _currentFinTicker();
    delete finCache[sym];
    renderFinancials(state.finTab || 'income');
    renderRevIncomeChart();
    renderMarginsChart();
}

function _updateFinBadge(data) {
    const el = document.getElementById('finSourceBadge');
    if (!el) return;
    const src = data._source || (data._isFallback ? 'sector-estimate' : 'yahoo');
    const labels = {
        'sec-edgar':       { text: '✓ SEC EDGAR',      bg: 'rgba(63,179,127,.15)', fg: '#3fb37f', title: 'Données officielles SEC (10-K annuels)' },
        'yahoo':           { text: '✓ Yahoo Finance',  bg: 'rgba(0,212,177,.12)',  fg: '#00d4b1', title: 'Yahoo Finance — quoteSummary' },
        'alphavantage':    { text: '✓ Alpha Vantage',  bg: 'rgba(103,133,255,.15)', fg: '#6785ff', title: 'Alpha Vantage — INCOME_STATEMENT / BALANCE_SHEET / CASH_FLOW' },
        'sector-estimate': { text: '⚠ Estimation',     bg: 'rgba(224,169,59,.15)', fg: '#e0a93b', title: 'Aucune source réelle accessible — valeurs illustratives' },
    };
    const info = labels[src] || labels['sector-estimate'];
    el.textContent = info.text;
    el.title = `${info.title} — ${data.name || data.ticker}`;
    el.style.background = info.bg;
    el.style.color = info.fg;
}

async function renderFinancials(type) {
    destroyChart('fin'); state.finTab = type;
    const sym = _currentFinTicker();
    const canvas = document.getElementById('financialsChart');
    if (!canvas) return;

    const data = await fetchFinancials(sym);
    _updateFinBadge(data);

    // Figure out scale (B vs M) from max value
    const allVals = [];
    data.income.forEach(r => allVals.push(r.revenue || 0, r.grossProfit || 0, r.operatingIncome || 0, r.netIncome || 0));
    data.balance.forEach(r => allVals.push(r.totalAssets || 0, r.totalLiab || 0, r.equity || 0));
    data.cashflow.forEach(r => allVals.push(Math.abs(r.operating || 0), Math.abs(r.investing || 0), Math.abs(r.financing || 0)));
    const maxVal = Math.max(...allVals.map(v => Math.abs(v)), 1);
    const useB = maxVal >= 1e9;
    const divisor = useB ? 1e9 : 1e6;
    const unit = useB ? 'B' : 'M';
    const conv = v => v == null ? null : +(v / divisor).toFixed(2);

    const years = (data[type] || []).map(r => String(r.year || ''));
    let datasets;
    if (type === 'income') {
        datasets = [
            { label: `Revenue ($${unit})`, data: data.income.map(r => conv(r.revenue)), backgroundColor: '#d4a84399' },
            { label: `Gross Profit ($${unit})`, data: data.income.map(r => conv(r.grossProfit)), backgroundColor: '#00d4b199' },
            { label: `Op Income ($${unit})`, data: data.income.map(r => conv(r.operatingIncome)), backgroundColor: '#4d9fff99' },
            { label: `Net Income ($${unit})`, data: data.income.map(r => conv(r.netIncome)), backgroundColor: '#a855f799' },
        ];
    } else if (type === 'balance') {
        datasets = [
            { label: `Total Assets ($${unit})`, data: data.balance.map(r => conv(r.totalAssets)), backgroundColor: '#d4a84399' },
            { label: `Total Liabilities ($${unit})`, data: data.balance.map(r => conv(r.totalLiab)), backgroundColor: '#ff4d6d99' },
            { label: `Equity ($${unit})`, data: data.balance.map(r => conv(r.equity)), backgroundColor: '#00d4b199' },
        ];
    } else {
        datasets = [
            { label: `Operating CF ($${unit})`, data: data.cashflow.map(r => conv(r.operating)), backgroundColor: '#00d4b199' },
            { label: `Investing CF ($${unit})`, data: data.cashflow.map(r => conv(r.investing)), backgroundColor: '#ff4d6d99' },
            { label: `Financing CF ($${unit})`, data: data.cashflow.map(r => conv(r.financing)), backgroundColor: '#a855f799' },
        ];
    }

    charts.fin = new Chart(canvas, {
        type: 'bar',
        data: { labels: years, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#8fa3c0', font: { size: 11 } } },
                title: {
                    display: true,
                    text: `${data.name || sym} — ${type[0].toUpperCase() + type.slice(1)} (${years[0] || ''}–${years[years.length - 1] || ''})`,
                    color: '#8fa3c0', font: { size: 12, family: 'Syne', weight: '700' }
                },
            },
            scales: {
                x: { ticks: { color: '#4e6a8a' }, grid: { color: 'rgba(30,50,80,.2)' } },
                y: { ticks: { color: '#4e6a8a' }, grid: { color: 'rgba(30,50,80,.2)' } },
            },
        },
    });
}

function setFinTab(type, el) {
    document.querySelectorAll('.fin-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    renderFinancials(type);
}

async function renderRevIncomeChart() {
    destroyChart('rev');
    const canvas = document.getElementById('revIncomeChart');
    if (!canvas) return;
    const sym = _currentFinTicker();
    const data = await fetchFinancials(sym);
    const maxVal = Math.max(...data.income.map(r => Math.abs(r.revenue || 0)), 1);
    const useB = maxVal >= 1e9;
    const unit = useB ? 'B' : 'M', div = useB ? 1e9 : 1e6;
    const years = data.income.map(r => String(r.year));
    charts.rev = new Chart(canvas, {
        type: 'line',
        data: {
            labels: years, datasets: [
                { label: `Revenue ($${unit})`, data: data.income.map(r => r.revenue == null ? null : +(r.revenue / div).toFixed(2)), borderColor: '#d4a843', tension: .4, fill: false, borderWidth: 2 },
                { label: `Net Income ($${unit})`, data: data.income.map(r => r.netIncome == null ? null : +(r.netIncome / div).toFixed(2)), borderColor: '#00d4b1', tension: .4, fill: false, borderWidth: 2 },
            ]
        },
        options: defaultChartOptions(unit)
    });
}

async function renderMarginsChart() {
    destroyChart('margin');
    const canvas = document.getElementById('marginsChart');
    if (!canvas) return;
    const sym = _currentFinTicker();
    const data = await fetchFinancials(sym);
    const pct = (num, den) => (num != null && den) ? +(num / den * 100).toFixed(1) : null;
    const years = data.income.map(r => String(r.year));
    charts.margin = new Chart(canvas, {
        type: 'line',
        data: {
            labels: years, datasets: [
                { label: 'Gross', data: data.income.map(r => pct(r.grossProfit, r.revenue)), borderColor: '#d4a843', tension: .4, fill: false, borderWidth: 2 },
                { label: 'Operating', data: data.income.map(r => pct(r.operatingIncome, r.revenue)), borderColor: '#4d9fff', tension: .4, fill: false, borderWidth: 2 },
                { label: 'Net', data: data.income.map(r => pct(r.netIncome, r.revenue)), borderColor: '#00d4b1', tension: .4, fill: false, borderWidth: 2 },
            ]
        },
        options: { ...defaultChartOptions('%'), scales: { x: { ticks: { color: '#4e6a8a' }, grid: { color: 'rgba(30,50,80,.2)' } }, y: { ticks: { color: '#4e6a8a', callback: v => v + '%' }, grid: { color: 'rgba(30,50,80,.2)' } } } }
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
// NEWS — Finnhub (real) → hardcoded fallback
// =============================================
const NEWS_FALLBACK = [
    { sym: 'AAPL', title: 'Apple Reports Record Q1 Revenue Driven by iPhone 15 Pro Demand', time: '2h ago', source: 'Reuters', sent: 'pos' },
    { sym: 'NVDA', title: 'NVIDIA Shares Surge 4% as AI Data Center Revenue Exceeds $18B', time: '3h ago', source: 'Bloomberg', sent: 'pos' },
    { sym: 'MSFT', title: 'Microsoft Integrates GPT-5 Across Office Suite', time: '5h ago', source: 'WSJ', sent: 'pos' },
    { sym: 'TSLA', title: 'Tesla Faces Margin Pressure as EV Competition Intensifies in China', time: '6h ago', source: 'FT', sent: 'neg' },
    { sym: 'META', title: 'Meta Unveils New AR Glasses With 8-Hour Battery Life', time: '8h ago', source: 'TechCrunch', sent: 'pos' },
    { sym: 'JPM', title: 'Fed Signals Rate Cuts May Begin Q3 2025, Financials React', time: '10h ago', source: 'CNBC', sent: 'pos' },
    { sym: 'XOM', title: 'Oil Prices Dip on OPEC+ Supply Increase Plans', time: '12h ago', source: 'Bloomberg', sent: 'neg' },
    { sym: 'GOOGL', title: 'Alphabet Faces EU Antitrust Scrutiny Over Search AI', time: '14h ago', source: 'Reuters', sent: 'neg' },
];

function _relativeTime(unixSeconds) {
    if (!unixSeconds) return '';
    const diff = (Date.now() / 1000) - unixSeconds;
    if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function _renderNewsCards(items, isLive) {
    const banner = isLive
        ? `<div style="grid-column:1/-1;font-size:10px;color:#3fb37f;margin-bottom:4px;letter-spacing:.5px">✓ Live feed · Finnhub</div>`
        : `<div style="grid-column:1/-1;font-size:10px;color:#e0a93b;margin-bottom:4px;letter-spacing:.5px">⚠ Finnhub indisponible — exemples statiques</div>`;
    document.getElementById('newsFeed').innerHTML = banner + items.map(n => {
        const sent = n.sent || 'pos';
        const url = n.url || '';
        const titleHtml = url ? `<a href="${url}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">${n.title}</a>` : n.title;
        return `
        <div class="news-card"><div class="news-sentiment ${sent}"></div><div class="news-body">
          <div class="news-title">${titleHtml}</div>
          <div class="news-meta">
            <span class="news-sym">${n.sym || ''}</span>
            <span class="news-tag ${sent}">${sent === 'pos' ? 'Bullish' : sent === 'neg' ? 'Bearish' : 'Neutral'}</span>
            <span>${n.source || ''}</span><span>${n.time || ''}</span>
          </div>
        </div></div>`;
    }).join('');
}

// Heuristic sentiment tag from headline text (used only if Finnhub doesn't label)
function _heuristicSent(headline) {
    const s = (headline || '').toLowerCase();
    const pos = /\b(surge|soar|beat|record|gain|rally|upgrade|outperform|strong|expand|grew|boost|approve)\b/;
    const neg = /\b(drop|plunge|fall|miss|downgrade|underperform|weak|lawsuit|probe|recall|layoff|cut|slump|warn)\b/;
    if (pos.test(s)) return 'pos';
    if (neg.test(s)) return 'neg';
    return 'pos';
}

async function renderNews() {
    const feedEl = document.getElementById('newsFeed');
    if (!feedEl) return;
    feedEl.innerHTML = `<div style="grid-column:1/-1;color:var(--text3);font-size:11px;padding:12px">Loading news…</div>`;

    const portfolioSyms = [...new Set(state.portfolio.map(p => p.sym))].slice(0, 5);
    const tickers = portfolioSyms.length ? portfolioSyms : ['AAPL', 'MSFT', 'NVDA'];

    try {
        const results = await Promise.allSettled(
            tickers.map(sym => fetch(`/api/finnhub/news/${encodeURIComponent(sym)}?days=7`, { cache: 'no-store' })
                .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
        );

        // Flatten + keep up to 12 most recent, interleaved
        const all = [];
        results.forEach((res, i) => {
            if (res.status !== 'fulfilled') return;
            const items = res.value?.items || [];
            items.slice(0, 4).forEach(n => {
                all.push({
                    sym: tickers[i],
                    title: n.headline || '',
                    url: n.url,
                    source: n.source || 'Finnhub',
                    time: _relativeTime(n.datetime),
                    sent: _heuristicSent(n.headline),
                    datetime: n.datetime || 0,
                });
            });
        });

        if (all.length === 0) throw new Error('no items');
        all.sort((a, b) => b.datetime - a.datetime);
        _renderNewsCards(all.slice(0, 12), true);
    } catch (e) {
        console.warn('[news] Finnhub fallback —', e.message);
        _renderNewsCards(NEWS_FALLBACK, false);
    }
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
    const tabs = ['holdings', 'overview', 'analysis', 'financials', 'comparison', 'news', 'simulation', 'optimizer', 'risk'];
    document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', tabs[i] === tab));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');
    setTimeout(() => {
        if (tab === 'overview') { renderAllocationChart(); renderRiskReturnChart(); renderHistoricalChart(); }
        if (tab === 'analysis') { renderMonteCarloChart(); renderBlackScholesChart(); renderARIMAChart(); renderVolatilityChart(); }
        if (tab === 'financials') { populateFinTickerSelect(); renderFinancials(state.finTab); renderRevIncomeChart(); renderMarginsChart(); }
        if (tab === 'comparison') { renderComparisonChart(); updateStockComparison(); }
        if (tab === 'holdings') { renderProjectionChart(); }
        if (tab === 'simulation') { if (typeof runSimulation === 'function') runSimulation(); }
        if (tab === 'risk') { if (typeof renderRiskAnalytics === 'function') renderRiskAnalytics(); }
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
