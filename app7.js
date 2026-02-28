// =============================================
// APP7.JS — S&P Benchmark Simulation
// Compare portfolio projection vs S&P 500 benchmark
// Uses sidebar inputs: initial amount, recurring, risk, horizon
// =============================================

let simChart = null;

// ── S&P 500 Historical Average Return ────────────────────────────────────────
const SP500_AVG_RETURN = 0.1026;  // ~10.26% annualized (historical average)
const SP500_VOLATILITY = 0.157;   // ~15.7% annual std deviation

// ── Risk-to-Return mapping ───────────────────────────────────────────────────
function getExpectedReturn(riskLevel) {
    const returns = {
        1: 0.03, 2: 0.045, 3: 0.06, 4: 0.075, 5: 0.085,
        6: 0.10, 7: 0.115, 8: 0.13, 9: 0.15, 10: 0.18
    };
    return returns[riskLevel] || 0.085;
}

function getPortfolioVolatility(riskLevel) {
    const vols = {
        1: 0.04, 2: 0.06, 3: 0.09, 4: 0.12, 5: 0.15,
        6: 0.18, 7: 0.21, 8: 0.24, 9: 0.28, 10: 0.32
    };
    return vols[riskLevel] || 0.15;
}

// ── Read sidebar inputs ──────────────────────────────────────────────────────
function getSimInputs() {
    const initial = parseFloat(document.getElementById('initAmount')?.value) || 10000;
    const recur = parseFloat(document.getElementById('recurAmount')?.value) || 500;
    const isMonthly = document.getElementById('freqMonthly')?.classList.contains('active');
    const risk = parseInt(document.getElementById('riskSlider')?.value || document.getElementById('riskInput')?.value) || 4;
    const horizon = state.horizon || 2;
    return { initial, recur, isMonthly, risk, horizon };
}

// ── Generate projection data ─────────────────────────────────────────────────
function generateProjection(initial, monthlyContrib, annualReturn, months) {
    const monthlyReturn = Math.pow(1 + annualReturn, 1 / 12) - 1;
    const data = [initial];
    let balance = initial;
    for (let m = 1; m <= months; m++) {
        balance = balance * (1 + monthlyReturn) + monthlyContrib;
        data.push(Math.round(balance * 100) / 100);
    }
    return data;
}

// ── Generate labels ──────────────────────────────────────────────────────────
function generateLabels(months) {
    const labels = [];
    const now = new Date();
    for (let m = 0; m <= months; m++) {
        const d = new Date(now.getFullYear(), now.getMonth() + m, 1);
        if (m === 0 || m % Math.max(1, Math.floor(months / 12)) === 0 || m === months) {
            labels.push(d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
        } else {
            labels.push('');
        }
    }
    return labels;
}

// ── Format currency ──────────────────────────────────────────────────────────
function fmtCurrency(v) {
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
    return '$' + v.toFixed(0);
}

// ── Render simulation chart ──────────────────────────────────────────────────
function renderSimulation() {
    const canvas = document.getElementById('simChart');
    if (!canvas) return;

    const { initial, recur, isMonthly, risk, horizon } = getSimInputs();
    const months = Math.round(horizon * 12);
    const monthlyContrib = isMonthly ? recur : recur / 12;

    // Portfolio projection
    const portfolioReturn = getExpectedReturn(risk);
    const portfolioData = generateProjection(initial, monthlyContrib, portfolioReturn, months);

    // S&P 500 projection
    const sp500Data = generateProjection(initial, monthlyContrib, SP500_AVG_RETURN, months);

    // Conservative (bonds) projection
    const bondReturn = 0.04;
    const bondData = generateProjection(initial, monthlyContrib, bondReturn, months);

    // Labels
    const labels = generateLabels(months);

    // Calculate summary stats
    const portfolioFinal = portfolioData[portfolioData.length - 1];
    const sp500Final = sp500Data[sp500Data.length - 1];
    const bondFinal = bondData[bondData.length - 1];
    const totalContrib = initial + monthlyContrib * months;
    const portfolioGain = portfolioFinal - totalContrib;
    const sp500Gain = sp500Final - totalContrib;

    // Update stats cards
    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('simPortfolioFinal', fmtCurrency(portfolioFinal));
    el('simSP500Final', fmtCurrency(sp500Final));
    el('simBondFinal', fmtCurrency(bondFinal));
    el('simTotalContrib', fmtCurrency(totalContrib));
    el('simPortfolioGain', (portfolioGain >= 0 ? '+' : '') + fmtCurrency(Math.abs(portfolioGain)));
    el('simSP500Gain', (sp500Gain >= 0 ? '+' : '') + fmtCurrency(Math.abs(sp500Gain)));

    const portfolioGainPct = ((portfolioFinal / totalContrib - 1) * 100).toFixed(1);
    const sp500GainPct = ((sp500Final / totalContrib - 1) * 100).toFixed(1);
    el('simPortfolioGainPct', portfolioGainPct + '%');
    el('simSP500GainPct', sp500GainPct + '%');

    // Color the gain values
    const pgEl = document.getElementById('simPortfolioGain');
    const sgEl = document.getElementById('simSP500Gain');
    if (pgEl) pgEl.className = portfolioGain >= 0 ? 'pos' : 'neg';
    if (sgEl) sgEl.className = sp500Gain >= 0 ? 'pos' : 'neg';

    const pgpEl = document.getElementById('simPortfolioGainPct');
    const sgpEl = document.getElementById('simSP500GainPct');
    if (pgpEl) pgpEl.className = portfolioGain >= 0 ? 'pos' : 'neg';
    if (sgpEl) sgpEl.className = sp500Gain >= 0 ? 'pos' : 'neg';

    // Risk label
    const riskNames = { 1: 'Very Conservative', 2: 'Conservative', 3: 'Moderate-Low', 4: 'Moderate', 5: 'Balanced', 6: 'Growth', 7: 'Aggressive Growth', 8: 'Aggressive', 9: 'Very Aggressive', 10: 'Maximum Risk' };
    el('simRiskName', riskNames[risk] || 'Moderate');
    el('simExpReturn', (portfolioReturn * 100).toFixed(1) + '%');
    el('simHorizonLabel', horizon >= 1 ? horizon + 'Y' : (horizon * 12) + 'M');

    // Destroy old chart
    if (simChart) { simChart.destroy(); simChart = null; }

    // Create chart
    const ctx = canvas.getContext('2d');

    // Gradient for portfolio line
    const gradPortfolio = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradPortfolio.addColorStop(0, 'rgba(212, 168, 67, 0.3)');
    gradPortfolio.addColorStop(1, 'rgba(212, 168, 67, 0.02)');

    const gradSP500 = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradSP500.addColorStop(0, 'rgba(0, 212, 177, 0.2)');
    gradSP500.addColorStop(1, 'rgba(0, 212, 177, 0.02)');

    simChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Your Portfolio',
                    data: portfolioData,
                    borderColor: '#d4a843',
                    backgroundColor: gradPortfolio,
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    pointHoverBackgroundColor: '#d4a843',
                },
                {
                    label: 'S&P 500',
                    data: sp500Data,
                    borderColor: '#00d4b1',
                    backgroundColor: gradSP500,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    pointHoverBackgroundColor: '#00d4b1',
                },
                {
                    label: 'Bonds (4%)',
                    data: bondData,
                    borderColor: 'rgba(170, 183, 184, 0.5)',
                    borderWidth: 1.5,
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    pointHoverBackgroundColor: '#aab7b8',
                },
                {
                    label: 'Total Contributed',
                    data: Array.from({ length: months + 1 }, (_, m) => initial + monthlyContrib * m),
                    borderColor: 'rgba(255, 77, 109, 0.4)',
                    borderWidth: 1,
                    borderDash: [3, 3],
                    fill: false,
                    tension: 0,
                    pointRadius: 0,
                    pointHoverRadius: 3,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: 'rgba(200,210,220,0.8)',
                        font: { family: "'Space Mono', monospace", size: 10 },
                        boxWidth: 14,
                        boxHeight: 2,
                        padding: 16,
                        usePointStyle: false,
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(10,20,40,0.95)',
                    titleFont: { family: "'Syne', sans-serif", size: 12 },
                    bodyFont: { family: "'Space Mono', monospace", size: 11 },
                    borderColor: 'rgba(212,168,67,0.3)',
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: $${ctx.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
                    }
                },
            },
            scales: {
                x: {
                    grid: { color: 'rgba(30,50,80,0.3)', drawBorder: false },
                    ticks: { color: 'rgba(120,140,160,0.7)', font: { family: "'Space Mono', monospace", size: 9 }, maxTicksLimit: 12, maxRotation: 0 },
                },
                y: {
                    grid: { color: 'rgba(30,50,80,0.3)', drawBorder: false },
                    ticks: {
                        color: 'rgba(120,140,160,0.7)',
                        font: { family: "'Space Mono', monospace", size: 10 },
                        callback: v => fmtCurrency(v)
                    },
                    beginAtZero: false,
                }
            },
            animation: { duration: 800, easing: 'easeOutQuart' },
        }
    });
}

// ── Milestone table ──────────────────────────────────────────────────────────
function renderMilestoneTable() {
    const tbody = document.getElementById('simMilestoneBody');
    if (!tbody) return;

    const { initial, recur, isMonthly, risk, horizon } = getSimInputs();
    const monthlyContrib = isMonthly ? recur : recur / 12;
    const portfolioReturn = getExpectedReturn(risk);
    const months = Math.round(horizon * 12);

    const portfolioData = generateProjection(initial, monthlyContrib, portfolioReturn, months);
    const sp500Data = generateProjection(initial, monthlyContrib, SP500_AVG_RETURN, months);

    // Milestones at key years
    const milestones = [];
    const intervals = horizon <= 1 ? [3, 6, 9, 12] : horizon <= 3 ? [6, 12, 24, 36] : [12, 24, 36, 60, 120];
    intervals.forEach(m => {
        if (m <= months) {
            const contrib = initial + monthlyContrib * m;
            const pVal = portfolioData[m];
            const sVal = sp500Data[m];
            const label = m < 12 ? m + 'M' : (m / 12) + 'Y';
            milestones.push({ label, contrib, pVal, sVal, diff: pVal - sVal });
        }
    });
    // Always add final
    const finalM = months;
    const finalContrib = initial + monthlyContrib * finalM;
    milestones.push({
        label: horizon >= 1 ? horizon + 'Y' : (horizon * 12) + 'M',
        contrib: finalContrib,
        pVal: portfolioData[finalM],
        sVal: sp500Data[finalM],
        diff: portfolioData[finalM] - sp500Data[finalM],
    });

    // Deduplicate by label
    const seen = new Set();
    const unique = milestones.filter(m => { if (seen.has(m.label)) return false; seen.add(m.label); return true; });

    tbody.innerHTML = unique.map(m => {
        const diffCls = m.diff >= 0 ? 'pos' : 'neg';
        const diffSign = m.diff >= 0 ? '+' : '';
        return `<tr>
            <td style="font-weight:700;color:var(--gold)">${m.label}</td>
            <td class="mono">${fmtCurrency(m.contrib)}</td>
            <td class="mono" style="color:#d4a843;font-weight:700">${fmtCurrency(m.pVal)}</td>
            <td class="mono" style="color:#00d4b1;font-weight:700">${fmtCurrency(m.sVal)}</td>
            <td class="mono ${diffCls}" style="font-weight:700">${diffSign}${fmtCurrency(Math.abs(m.diff))}</td>
        </tr>`;
    }).join('');
}

// ── Run simulation ───────────────────────────────────────────────────────────
function runSimulation() {
    renderSimulation();
    renderMilestoneTable();
}
