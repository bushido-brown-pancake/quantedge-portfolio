// =============================================
// APP8.JS — Portfolio Analysis Module
// Health score, radar chart, per-stock signals,
// recommendations, correlation matrix
// =============================================

// ── Analysis State ───────────────────────────
let _analysisRendered = false;

// ── Compute Portfolio Health Score ────────────
function computePortfolioHealth() {
    const syms = [...new Set(state.portfolio.map(p => p.sym))];
    if (syms.length === 0) return { score: 0, dimensions: {}, signals: [], recommendations: [] };

    // Diversification (0-100): based on sector count and concentration
    const sectors = {};
    syms.forEach(sym => {
        const db = STOCKS_DB.find(s => s.sym === sym);
        const rc = ratioCache[sym];
        const sector = rc?._sector || db?.sector || 'Unknown';
        sectors[sector] = (sectors[sector] || 0) + 1;
    });
    const sectorCount = Object.keys(sectors).length;
    const maxConcentration = Math.max(...Object.values(sectors)) / syms.length;
    const diversification = Math.min(100, sectorCount * 15 + (1 - maxConcentration) * 40);

    // Quality (0-100): average ROE, margins
    let qualityVals = [];
    syms.forEach(sym => {
        const rc = ratioCache[sym];
        if (rc) {
            let q = 50;
            if (rc.roe != null) q += (rc.roe > 15 ? 15 : rc.roe > 5 ? 5 : -10);
            if (rc.margin != null) q += (rc.margin > 15 ? 10 : rc.margin > 5 ? 5 : -5);
            if (rc.cr != null) q += (rc.cr > 1.5 ? 5 : rc.cr > 1 ? 0 : -10);
            qualityVals.push(Math.max(0, Math.min(100, q)));
        }
    });
    const quality = qualityVals.length > 0 ? qualityVals.reduce((a, b) => a + b, 0) / qualityVals.length : 50;

    // Value (0-100): average P/E, P/B
    let valueVals = [];
    syms.forEach(sym => {
        const rc = ratioCache[sym];
        if (rc) {
            let v = 50;
            if (rc.pe != null) v += (rc.pe < 15 ? 20 : rc.pe < 25 ? 10 : rc.pe > 50 ? -15 : 0);
            if (rc.pb != null) v += (rc.pb < 2 ? 10 : rc.pb < 4 ? 5 : -5);
            valueVals.push(Math.max(0, Math.min(100, v)));
        }
    });
    const value = valueVals.length > 0 ? valueVals.reduce((a, b) => a + b, 0) / valueVals.length : 50;

    // Momentum (0-100)
    let momentumVals = [];
    syms.forEach(sym => {
        const rc = ratioCache[sym];
        if (rc) {
            let m = 50;
            if (rc.mom3m != null) m += (rc.mom3m > 5 ? 15 : rc.mom3m > 0 ? 5 : -10);
            if (rc.mom12m != null) m += (rc.mom12m > 10 ? 10 : rc.mom12m > 0 ? 5 : -10);
            momentumVals.push(Math.max(0, Math.min(100, m)));
        }
    });
    const momentum = momentumVals.length > 0 ? momentumVals.reduce((a, b) => a + b, 0) / momentumVals.length : 50;

    // Risk (0-100, higher = lower risk = better)
    let riskVals = [];
    syms.forEach(sym => {
        const rc = ratioCache[sym];
        if (rc) {
            let r = 60;
            if (rc.beta != null) r += (rc.beta < 0.8 ? 15 : rc.beta < 1.2 ? 5 : -15);
            if (rc.vol != null) r += (rc.vol < 20 ? 10 : rc.vol > 35 ? -15 : 0);
            if (rc.de != null) r += (rc.de < 0.5 ? 10 : rc.de > 2 ? -15 : 0);
            riskVals.push(Math.max(0, Math.min(100, r)));
        }
    });
    const risk = riskVals.length > 0 ? riskVals.reduce((a, b) => a + b, 0) / riskVals.length : 50;

    const overall = (diversification * 0.2 + quality * 0.25 + value * 0.2 + momentum * 0.15 + risk * 0.2);
    const dimensions = { diversification: +diversification.toFixed(0), quality: +quality.toFixed(0), value: +value.toFixed(0), momentum: +momentum.toFixed(0), risk: +risk.toFixed(0) };

    // Generate signals per stock
    const signals = [];
    syms.forEach(sym => {
        const rc = ratioCache[sym];
        const db = STOCKS_DB.find(s => s.sym === sym);
        const name = rc?._name || db?.name || sym;
        if (!rc) return;

        if (rc.roe != null && rc.roe > 25) signals.push({ sym, type: 'strength', msg: `${sym}: ROE of ${rc.roe.toFixed(1)}% — excellent capital efficiency` });
        if (rc.pe != null && rc.pe > 50) signals.push({ sym, type: 'warning', msg: `${sym}: P/E of ${rc.pe.toFixed(1)}x — expensive valuation` });
        if (rc.pe != null && rc.pe < 12 && rc.pe > 0) signals.push({ sym, type: 'strength', msg: `${sym}: P/E of ${rc.pe.toFixed(1)}x — attractive valuation` });
        if (rc.de != null && rc.de > 2) signals.push({ sym, type: 'red_flag', msg: `${sym}: Debt/Equity of ${rc.de.toFixed(2)}x — high leverage risk` });
        if (rc.margin != null && rc.margin > 20) signals.push({ sym, type: 'strength', msg: `${sym}: Net margin of ${rc.margin.toFixed(1)}% — strong profitability` });
        if (rc.margin != null && rc.margin < 0) signals.push({ sym, type: 'red_flag', msg: `${sym}: Negative net margin — company is losing money` });
        if (rc.fcf != null && rc.fcf > 5) signals.push({ sym, type: 'strength', msg: `${sym}: FCF Yield of ${rc.fcf.toFixed(1)}% — excellent cash generation` });
        if (rc.div != null && rc.div > 3) signals.push({ sym, type: 'strength', msg: `${sym}: Dividend yield of ${rc.div.toFixed(1)}% — good income` });
        if (rc.maxdd != null && rc.maxdd > 30) signals.push({ sym, type: 'warning', msg: `${sym}: Max drawdown of ${rc.maxdd.toFixed(1)}% — high volatility risk` });
    });

    // Recommendations
    const recommendations = [];
    if (sectorCount <= 2) recommendations.push({ icon: '🎯', msg: `Add diversification — portfolio concentrated in ${sectorCount} sector(s). Consider Healthcare, Utilities, or Real Estate.` });
    if (maxConcentration > 0.5) recommendations.push({ icon: '⚖️', msg: `Reduce concentration — one sector represents ${(maxConcentration * 100).toFixed(0)}% of holdings.` });
    if (syms.length < 5) recommendations.push({ icon: '📊', msg: `Expand portfolio — only ${syms.length} stocks. Consider 8-15 for better risk management.` });
    const avgDiv = syms.map(s => ratioCache[s]?.div || 0).reduce((a, b) => a + b, 0) / syms.length;
    if (avgDiv < 1) recommendations.push({ icon: '💰', msg: 'Consider adding dividend stocks for passive income (KO, JNJ, PG, O).' });
    const avgBeta = syms.map(s => ratioCache[s]?.beta || 1).reduce((a, b) => a + b, 0) / syms.length;
    if (avgBeta > 1.3) recommendations.push({ icon: '🛡️', msg: `Portfolio beta is ${avgBeta.toFixed(2)} — consider defensive stocks to reduce volatility.` });
    if (overall > 70) recommendations.push({ icon: '✅', msg: 'Portfolio is well-balanced. Keep monitoring quarterly earnings.' });

    return { score: +overall.toFixed(0), dimensions, signals, recommendations };
}

// ── Render Radar Chart ───────────────────────
let _radarChart = null;

function renderRadarChart(dimensions) {
    const canvas = document.getElementById('analysisRadarChart');
    if (!canvas) return;
    if (_radarChart) { _radarChart.destroy(); _radarChart = null; }

    const labels = ['Quality', 'Value', 'Momentum', 'Risk Mgmt', 'Diversity'];
    const values = [dimensions.quality, dimensions.value, dimensions.momentum, dimensions.risk, dimensions.diversification];

    _radarChart = new Chart(canvas, {
        type: 'radar',
        data: {
            labels,
            datasets: [{
                label: 'Your Portfolio',
                data: values,
                borderColor: '#d4a843',
                backgroundColor: 'rgba(212,168,67,.15)',
                borderWidth: 2,
                pointBackgroundColor: '#d4a843',
                pointRadius: 4,
            }, {
                label: 'Benchmark (avg)',
                data: [50, 50, 50, 50, 50],
                borderColor: 'rgba(78,106,138,.4)',
                backgroundColor: 'rgba(78,106,138,.05)',
                borderWidth: 1,
                borderDash: [4, 4],
                pointRadius: 0,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: true,
            scales: {
                r: {
                    beginAtZero: true, max: 100,
                    grid: { color: 'rgba(30,50,80,.3)' },
                    angleLines: { color: 'rgba(30,50,80,.3)' },
                    pointLabels: { color: '#8fa3c0', font: { size: 11, family: "'Syne', sans-serif", weight: '700' } },
                    ticks: { display: false },
                }
            },
            plugins: {
                legend: { labels: { color: '#8fa3c0', font: { size: 10, family: "'Space Mono', monospace" }, boxWidth: 14 } },
                tooltip: { backgroundColor: '#111a27', borderColor: '#1e3250', borderWidth: 1 },
            },
        },
    });
}

// ── Render Analysis Tab Content ──────────────
function renderPortfolioAnalysis() {
    const container = document.getElementById('analysisContent');
    if (!container) return;

    const syms = [...new Set(state.portfolio.map(p => p.sym))];
    if (syms.length === 0) {
        container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px;border:1px dashed var(--border);border-radius:var(--radius)">
            No stocks in portfolio. Add stocks to see analysis.
        </div>`;
        return;
    }

    const health = computePortfolioHealth();
    const scoreColor = health.score >= 70 ? 'var(--teal)' : health.score >= 45 ? 'var(--gold)' : 'var(--red)';
    const scoreLabel = health.score >= 80 ? 'Excellent' : health.score >= 65 ? 'Good' : health.score >= 45 ? 'Fair' : 'Needs Improvement';

    container.innerHTML = `
        <!-- Health Score + Radar -->
        <div style="display:grid;grid-template-columns:280px 1fr;gap:16px;margin-bottom:20px">
            <!-- Score Card -->
            <div style="background:var(--bg-glass2);border:1px solid var(--border);border-radius:var(--radius);padding:24px;text-align:center;backdrop-filter:blur(8px)">
                <div style="font-family:'Syne',sans-serif;font-size:12px;color:var(--text3);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">Portfolio Health Score</div>
                <div style="font-size:56px;font-weight:700;font-family:'Space Mono',monospace;color:${scoreColor};line-height:1">${health.score}</div>
                <div style="font-size:13px;color:${scoreColor};font-family:'Syne',sans-serif;font-weight:700;margin-top:4px">${scoreLabel}</div>
                <div style="margin-top:16px;display:flex;flex-direction:column;gap:6px">
                    ${Object.entries(health.dimensions).map(([key, val]) => {
                        const color = val >= 65 ? 'var(--teal)' : val >= 45 ? 'var(--gold)' : 'var(--red)';
                        const label = key.charAt(0).toUpperCase() + key.slice(1);
                        return `<div>
                            <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px">
                                <span style="color:var(--text3)">${label}</span>
                                <span style="font-family:'Space Mono',monospace;color:${color}">${val}/100</span>
                            </div>
                            <div style="height:3px;background:var(--border);border-radius:2px;overflow:hidden">
                                <div style="height:100%;width:${val}%;background:${color};border-radius:2px;transition:width 1s ease"></div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>
            <!-- Radar Chart -->
            <div style="background:var(--bg-glass2);border:1px solid var(--border);border-radius:var(--radius);padding:16px;backdrop-filter:blur(8px)">
                <canvas id="analysisRadarChart" style="max-height:280px"></canvas>
            </div>
        </div>

        <!-- Signals -->
        <div style="margin-bottom:20px">
            <div class="section-label" style="margin-bottom:10px">📊 Stock Signals</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:8px">
                ${health.signals.length > 0 ? health.signals.slice(0, 12).map(s => {
                    const icon = s.type === 'strength' ? '✅' : s.type === 'warning' ? '⚠️' : '❌';
                    const bgColor = s.type === 'strength' ? 'rgba(0,212,177,.06)' : s.type === 'warning' ? 'rgba(212,168,67,.06)' : 'rgba(255,77,109,.06)';
                    const borderColor = s.type === 'strength' ? 'rgba(0,212,177,.2)' : s.type === 'warning' ? 'rgba(212,168,67,.2)' : 'rgba(255,77,109,.2)';
                    return `<div style="padding:8px 12px;background:${bgColor};border:1px solid ${borderColor};border-radius:8px;font-size:11px;color:var(--text2);display:flex;align-items:center;gap:8px">
                        <span>${icon}</span> ${escapeHtml(s.msg)}
                    </div>`;
                }).join('') : '<div style="color:var(--text3);font-size:12px;padding:12px">Loading signals… switch to Financials tab first to load ratios.</div>'}
            </div>
        </div>

        <!-- Recommendations -->
        <div style="margin-bottom:20px">
            <div class="section-label" style="margin-bottom:10px">💡 Recommendations</div>
            <div style="display:flex;flex-direction:column;gap:8px">
                ${health.recommendations.map(r =>
                    `<div style="padding:10px 14px;background:var(--bg-glass2);border:1px solid var(--border);border-radius:8px;font-size:12px;color:var(--text2);display:flex;align-items:center;gap:10px;backdrop-filter:blur(4px)">
                        <span style="font-size:18px;flex-shrink:0">${r.icon}</span>
                        <span>${escapeHtml(r.msg)}</span>
                    </div>`
                ).join('') || '<div style="color:var(--text3);font-size:12px;padding:12px">No recommendations yet.</div>'}
            </div>
        </div>

        <!-- Sector Breakdown -->
        <div>
            <div class="section-label" style="margin-bottom:10px">🏭 Sector Breakdown</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px">
                ${(() => {
                    const sectors = {};
                    syms.forEach(sym => {
                        const db = STOCKS_DB.find(s => s.sym === sym);
                        const rc = ratioCache[sym];
                        const sector = rc?._sector || db?.sector || 'Unknown';
                        if (!sectors[sector]) sectors[sector] = [];
                        sectors[sector].push(sym);
                    });
                    return Object.entries(sectors).map(([sector, stocks]) => {
                        const pct = ((stocks.length / syms.length) * 100).toFixed(0);
                        return `<div style="padding:8px 12px;background:var(--bg-glass2);border:1px solid var(--border);border-radius:8px;min-width:120px">
                            <div style="font-size:12px;font-family:'Syne',sans-serif;font-weight:700;color:var(--text)">${sector}</div>
                            <div style="font-size:10px;color:var(--text3);margin-top:2px">${stocks.length} stock(s) · ${pct}%</div>
                            <div style="font-size:9px;color:var(--gold);font-family:'Space Mono',monospace;margin-top:3px">${stocks.join(', ')}</div>
                        </div>`;
                    }).join('');
                })()}
            </div>
        </div>
    `;

    // Render radar chart after DOM is ready
    setTimeout(() => renderRadarChart(health.dimensions), 100);
    _analysisRendered = true;
}

// ── Hook into Analysis tab ───────────────────
(function () {
    const _prev = window.switchTab;
    window.switchTab = function (tab) {
        _prev(tab);
        if (tab === 'analysis') {
            setTimeout(renderPortfolioAnalysis, 100);
        }
    };
})();
