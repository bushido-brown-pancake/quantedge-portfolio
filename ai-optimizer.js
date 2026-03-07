// ═══════════════════════════════════════════════════════════════
// AI PORTFOLIO OPTIMIZER — QuantEdge Module
// Self-contained: math, 6 optimizers, ensemble, AI, UI
// ═══════════════════════════════════════════════════════════════
(function () {
    'use strict';

    const RF = 0.04; // risk-free rate 4%
    const AIO_PROXY = '/api/claude';

    // ── Matrix Utilities ──────────────────────────────────────────
    function matTranspose(A) {
        const m = A.length, n = A[0].length, T = [];
        for (let j = 0; j < n; j++) { T[j] = []; for (let i = 0; i < m; i++) T[j][i] = A[i][j]; }
        return T;
    }
    function matMul(A, B) {
        const m = A.length, n = B[0].length, p = B.length, C = [];
        for (let i = 0; i < m; i++) { C[i] = []; for (let j = 0; j < n; j++) { let s = 0; for (let k = 0; k < p; k++) s += A[i][k] * B[k][j]; C[i][j] = s; } }
        return C;
    }
    function matVecMul(A, v) {
        return A.map(row => row.reduce((s, a, j) => s + a * v[j], 0));
    }
    function vecDot(a, b) { return a.reduce((s, v, i) => s + v * b[i], 0); }

    function choleskyDecomp(A) {
        const n = A.length, L = Array.from({ length: n }, () => new Array(n).fill(0));
        for (let i = 0; i < n; i++) {
            for (let j = 0; j <= i; j++) {
                let s = 0;
                for (let k = 0; k < j; k++) s += L[i][k] * L[j][k];
                if (i === j) { const v = A[i][i] - s; L[i][j] = v > 0 ? Math.sqrt(v) : 1e-10; }
                else L[i][j] = (A[i][j] - s) / (L[j][j] || 1e-10);
            }
        }
        return L;
    }
    function choleskyInvert(A) {
        const n = A.length, L = choleskyDecomp(A);
        // Invert L
        const Li = Array.from({ length: n }, () => new Array(n).fill(0));
        for (let i = 0; i < n; i++) {
            Li[i][i] = 1 / (L[i][i] || 1e-10);
            for (let j = i + 1; j < n; j++) {
                let s = 0; for (let k = i; k < j; k++) s += L[j][k] * Li[k][i];
                Li[j][i] = -s / (L[j][j] || 1e-10);
            }
        }
        // A^-1 = Li' * Li
        const LiT = matTranspose(Li);
        return matMul(LiT, Li);
    }
    function ledoitWolfShrink(S, delta) {
        delta = delta || 0.2;
        const n = S.length, mu = S.reduce((s, r, i) => s + r[i], 0) / n;
        const F = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? mu : 0));
        return S.map((row, i) => row.map((v, j) => (1 - delta) * v + delta * F[i][j]));
    }

    // ── Covariance & Returns from historical data ─────────────────
    function computeReturns(closes) {
        const r = [];
        for (let i = 1; i < closes.length; i++) {
            const prev = closes[i - 1];
            r.push(prev > 0 ? (closes[i] - prev) / prev : 0);
        }
        return r;
    }
    function computeCovMatrix(returnArrays) {
        const n = returnArrays.length;
        const T = Math.min(...returnArrays.map(r => r.length));
        if (T < 5) {
            // fallback: diagonal with assumed vol
            return Array.from({ length: n }, (_, i) =>
                Array.from({ length: n }, (_, j) => i === j ? 0.04 : 0.01)
            );
        }
        const means = returnArrays.map(r => r.slice(0, T).reduce((a, b) => a + b, 0) / T);
        const cov = Array.from({ length: n }, () => new Array(n).fill(0));
        for (let i = 0; i < n; i++) {
            for (let j = i; j < n; j++) {
                let s = 0;
                for (let t = 0; t < T; t++) s += (returnArrays[i][t] - means[i]) * (returnArrays[j][t] - means[j]);
                cov[i][j] = cov[j][i] = s / (T - 1);
            }
        }
        return cov;
    }
    function corrMatrix(cov) {
        const n = cov.length;
        const std = cov.map((_, i) => Math.sqrt(Math.max(cov[i][i], 1e-12)));
        return cov.map((row, i) => row.map((v, j) => v / (std[i] * std[j] || 1)));
    }

    // ── Optimization Methods ──────────────────────────────────────

    // 1. Equal Weight
    function equalWeight(n) { return new Array(n).fill(1 / n); }

    // 2. Minimum Variance
    function minVariance(cov) {
        const S = ledoitWolfShrink(cov, 0.2);
        const Si = choleskyInvert(S);
        const ones = new Array(S.length).fill(1);
        const Sio = matVecMul(Si, ones);
        const denom = vecDot(ones, Sio);
        return Sio.map(v => v / (denom || 1));
    }

    // 3. Maximum Sharpe (Tangency)
    function maxSharpe(cov, mu) {
        const S = ledoitWolfShrink(cov, 0.2);
        const Si = choleskyInvert(S);
        const excess = mu.map(m => m - RF / 252);
        const Siex = matVecMul(Si, excess);
        const ones = new Array(S.length).fill(1);
        const denom = vecDot(ones, Siex);
        if (Math.abs(denom) < 1e-12) return equalWeight(mu.length);
        return Siex.map(v => v / denom);
    }

    // 4. Risk Parity
    function riskParity(cov) {
        const n = cov.length;
        let w = new Array(n).fill(1 / n);
        for (let iter = 0; iter < 1000; iter++) {
            const Sw = matVecMul(cov, w);
            const sigP = Math.sqrt(Math.max(vecDot(w, Sw), 1e-12));
            const rc = w.map((wi, i) => wi * Sw[i] / sigP);
            const target = sigP / n;
            const newW = w.map((wi, i) => {
                const adj = rc[i] > 0 ? target / rc[i] : 1;
                return wi * Math.pow(adj, 0.5);
            });
            const s = newW.reduce((a, b) => a + b, 0);
            w = newW.map(v => v / (s || 1));
        }
        return w;
    }

    // 5. Hierarchical Risk Parity (López de Prado)
    function hrp(cov) {
        const n = cov.length;
        if (n <= 1) return [1];
        const corr = corrMatrix(cov);
        // Distance matrix
        const dist = Array.from({ length: n }, (_, i) =>
            Array.from({ length: n }, (_, j) => Math.sqrt(Math.max(0, 0.5 * (1 - corr[i][j]))))
        );
        // Agglomerative clustering (average linkage)
        let clusters = Array.from({ length: n }, (_, i) => [i]);
        const active = new Set(Array.from({ length: n }, (_, i) => i));
        while (active.size > 1) {
            let minD = Infinity, a = -1, b = -1;
            const arr = [...active];
            for (let ii = 0; ii < arr.length; ii++) {
                for (let jj = ii + 1; jj < arr.length; jj++) {
                    let s = 0, cnt = 0;
                    for (const ci of clusters[arr[ii]]) {
                        for (const cj of clusters[arr[jj]]) { s += dist[ci][cj]; cnt++; }
                    }
                    const d = cnt > 0 ? s / cnt : Infinity;
                    if (d < minD) { minD = d; a = arr[ii]; b = arr[jj]; }
                }
            }
            clusters.push([...clusters[a], ...clusters[b]]);
            active.delete(a); active.delete(b);
            active.add(clusters.length - 1);
        }
        // Recursive bisection
        const w = new Array(n).fill(1);
        function clusterVar(items) {
            if (items.length === 1) return Math.max(cov[items[0]][items[0]], 1e-12);
            const cW = equalWeight(items.length);
            let v = 0;
            for (let i = 0; i < items.length; i++)
                for (let j = 0; j < items.length; j++)
                    v += cW[i] * cW[j] * cov[items[i]][items[j]];
            return Math.max(v, 1e-12);
        }
        function bisect(items) {
            if (items.length <= 1) return;
            const mid = Math.ceil(items.length / 2);
            const left = items.slice(0, mid), right = items.slice(mid);
            const vL = clusterVar(left), vR = clusterVar(right);
            const alpha = 1 - vL / (vL + vR);
            left.forEach(i => w[i] *= alpha);
            right.forEach(i => w[i] *= (1 - alpha));
            bisect(left); bisect(right);
        }
        const root = clusters[clusters.length - 1];
        bisect(root);
        const s = w.reduce((a, b) => a + b, 0);
        return w.map(v => v / (s || 1));
    }

    // 6. CVaR Optimization
    function cvarOptimize(cov, mu) {
        const n = mu.length, nSim = 5000, nCandidates = 300;
        const L = choleskyDecomp(ledoitWolfShrink(cov, 0.2));
        function simulate(w) {
            const returns = [];
            for (let s = 0; s < nSim; s++) {
                const z = Array.from({ length: n }, () => {
                    let u, v, s2;
                    do { u = Math.random() * 2 - 1; v = Math.random() * 2 - 1; s2 = u * u + v * v; } while (s2 >= 1 || s2 === 0);
                    return u * Math.sqrt(-2 * Math.log(s2) / s2);
                });
                const corZ = matVecMul(L, z);
                let portR = 0;
                for (let i = 0; i < n; i++) portR += w[i] * (mu[i] + corZ[i] * Math.sqrt(Math.max(cov[i][i], 0)));
                returns.push(portR);
            }
            returns.sort((a, b) => a - b);
            const idx5 = Math.floor(nSim * 0.05);
            const cvar = -returns.slice(0, idx5).reduce((a, b) => a + b, 0) / (idx5 || 1);
            const expR = returns.reduce((a, b) => a + b, 0) / nSim;
            return { cvar, expR };
        }
        // Generate candidates
        const candidates = [];
        // Seed: min-var, max-sharpe, equal-weight
        candidates.push(minVariance(cov), maxSharpe(cov, mu), equalWeight(n));
        for (let c = 0; c < nCandidates - 3; c++) {
            const raw = Array.from({ length: n }, () => Math.random());
            const s = raw.reduce((a, b) => a + b, 0);
            candidates.push(raw.map(v => v / s));
        }
        let bestW = candidates[0], bestScore = -Infinity;
        for (const w of candidates) {
            const { cvar, expR } = simulate(w);
            const score = expR * 252 - 0.5 * cvar * Math.sqrt(252);
            if (score > bestScore) { bestScore = score; bestW = w; }
        }
        return bestW;
    }

    // ── Portfolio Metrics ─────────────────────────────────────────
    function portfolioMetrics(w, cov, mu) {
        const Sw = matVecMul(cov, w);
        const portVar = vecDot(w, Sw);
        const dailyVol = Math.sqrt(Math.max(portVar, 0));
        const vol = dailyVol * Math.sqrt(252);
        const dailyRet = vecDot(w, mu);
        const ret = dailyRet * 252;
        const sharpe = vol > 0 ? (ret - RF) / vol : 0;
        const maxDD = vol * Math.sqrt(1) * 1.5;
        const rc = w.map((wi, i) => wi * Sw[i] / (dailyVol || 1));
        const wVol = w.map((wi, i) => Math.sqrt(Math.max(cov[i][i], 0)));
        const sumWVol = vecDot(w.map(Math.abs), wVol);
        const divRatio = sumWVol / (dailyVol || 1);
        return { ret, vol, sharpe, maxDD, rc, divRatio };
    }

    // ── Ensemble Aggregation ──────────────────────────────────────
    function ensembleOptimize(cov, mu, nAssets) {
        const methods = [
            { name: 'Equal Weight', fn: () => equalWeight(nAssets) },
            { name: 'Min Variance', fn: () => minVariance(cov) },
            { name: 'Max Sharpe', fn: () => maxSharpe(cov, mu) },
            { name: 'Risk Parity', fn: () => riskParity(cov) },
            { name: 'HRP', fn: () => hrp(cov) },
            { name: 'CVaR', fn: () => cvarOptimize(cov, mu) },
        ];
        const results = methods.map(m => {
            let w;
            try { w = m.fn(); } catch (_) { w = equalWeight(nAssets); }
            // Clip negatives, renormalize
            w = w.map(v => Math.max(v, 0));
            const s = w.reduce((a, b) => a + b, 0);
            w = w.map(v => v / (s || 1));
            const met = portfolioMetrics(w, cov, mu);
            const score = 0.7 * Math.max(0, met.sharpe) + 0.3 * Math.max(0, met.divRatio);
            return { name: m.name, weights: w, metrics: met, score };
        });
        // Weighted average
        const totalScore = results.reduce((s, r) => s + r.score, 0) || 1;
        const ensW = new Array(nAssets).fill(0);
        results.forEach(r => {
            const frac = r.score / totalScore;
            r.ensembleWeight = frac;
            r.weights.forEach((wi, i) => ensW[i] += wi * frac);
        });
        // Apply constraints: min 2%, max 30%
        let constrained = ensW.map(v => Math.max(0.02, Math.min(0.30, v)));
        let cs = constrained.reduce((a, b) => a + b, 0);
        constrained = constrained.map(v => v / (cs || 1));
        return { weights: constrained, methods: results };
    }

    // ── Sector constraint ─────────────────────────────────────────
    function applySectorConstraint(weights, tickers, maxSector) {
        maxSector = maxSector || 0.40;
        const sectorMap = {};
        tickers.forEach((t, i) => {
            const db = (typeof STOCKS_DB !== 'undefined' ? STOCKS_DB : []).find(s => s.sym === t);
            const sec = db ? db.sector : 'Unknown';
            if (!sectorMap[sec]) sectorMap[sec] = [];
            sectorMap[sec].push(i);
        });
        let w = [...weights];
        for (const sec of Object.keys(sectorMap)) {
            const idxs = sectorMap[sec];
            const total = idxs.reduce((s, i) => s + w[i], 0);
            if (total > maxSector) {
                const scale = maxSector / total;
                idxs.forEach(i => w[i] *= scale);
            }
        }
        const s = w.reduce((a, b) => a + b, 0);
        return w.map(v => v / (s || 1));
    }

    // ── Efficient Frontier ────────────────────────────────────────
    function efficientFrontier(cov, mu, nPoints) {
        nPoints = nPoints || 50;
        const n = mu.length;
        const wMV = minVariance(cov);
        const maxRetIdx = mu.indexOf(Math.max(...mu));
        const wMax = new Array(n).fill(0); wMax[maxRetIdx] = 1;
        const points = [];
        for (let i = 0; i < nPoints; i++) {
            const t = i / (nPoints - 1);
            let w = wMV.map((v, j) => (1 - t) * v + t * wMax[j]);
            w = w.map(v => Math.max(v, 0));
            const s = w.reduce((a, b) => a + b, 0);
            w = w.map(v => v / (s || 1));
            const m = portfolioMetrics(w, cov, mu);
            points.push({ vol: m.vol, ret: m.ret });
        }
        return points;
    }

    // ── DOM Readers ───────────────────────────────────────────────
    function readPortfolioData() {
        const holdings = (typeof state !== 'undefined' && state.portfolio) ? state.portfolio : [];
        if (!holdings.length) return null;
        const tickers = holdings.map(h => h.sym);
        const prices = tickers.map(t => {
            if (typeof livePrices !== 'undefined' && livePrices[t]) return livePrices[t].price;
            const db = (typeof STOCKS_DB !== 'undefined' ? STOCKS_DB : []).find(s => s.sym === t);
            return db ? db.price : 100;
        });
        const shares = holdings.map(h => h.shares);
        const capital = +(document.getElementById('initAmount')?.value || 10000);
        const risk = typeof state !== 'undefined' ? state.riskLevel : 4;
        const horizon = typeof state !== 'undefined' ? state.horizon : 2;
        // Get historical closes from liveCache or generate synthetic
        const allCloses = tickers.map(t => {
            if (typeof liveCache !== 'undefined' && liveCache[t]?.closes) return liveCache[t].closes;
            // Synthetic: 252 daily returns around the price
            const p = prices[tickers.indexOf(t)];
            const closes = [p];
            for (let i = 1; i < 252; i++) closes.unshift(p * (1 + (Math.random() - 0.505) * 0.02));
            return closes;
        });
        // Fundamental data
        const fundamentals = tickers.map(t => {
            const db = (typeof STOCKS_DB !== 'undefined' ? STOCKS_DB : []).find(s => s.sym === t);
            const rc = typeof ratioCache !== 'undefined' ? ratioCache[t] : null;
            return { ...(db || {}), ...(rc || {}) };
        });
        return { tickers, prices, shares, capital, risk, horizon, allCloses, fundamentals };
    }

    // ── AI Integration ────────────────────────────────────────────
    async function callClaudeAI(portfolioData) {
        const systemPrompt = `Tu es un gestionnaire quantitatif senior avec 15 ans d'expérience en allocation d'actifs institutionnelle.

L'utilisateur te fournit un panier d'actions. Tu dois analyser chaque action sur 3 axes et retourner un JSON structuré :

PILIER 1 — FONDAMENTAL (score 1-10) :
P/E vs secteur, P/B, croissance CA YoY, marge nette, Debt/EBITDA, FCF Yield, ROE, Current Ratio

PILIER 2 — QUANTITATIF (score 1-10) :
Momentum 6M/12M, volatilité relative, beta, mean reversion (RSI proxy), corrélations inter-actifs

PILIER 3 — SENTIMENT (-1 à +1) :
News récentes, catalyseurs à venir, risques spécifiques, consensus analystes

FORMAT DE SORTIE — JSON uniquement, sans backticks :
{"analysis_date":"YYYY-MM-DD","market_regime":"bull|bear|neutral|volatile","stocks":[{"ticker":"AAPL","fundamental_score":8,"fundamental_detail":"...","quant_score":7,"momentum":"positive|negative|neutral","volatility_regime":"high|medium|low","beta_estimate":1.15,"sentiment_score":0.6,"sentiment_detail":"...","catalysts":["..."],"risks":["..."],"expected_return_adjustment":0.02,"confidence":0.7,"conviction":"HIGH|MEDIUM|LOW"}],"portfolio_recommendation":{"strategy_name":"...","strategy_rationale":"...","suggested_weights":{"AAPL":0.15},"suggested_method_priority":"hrp|risk_parity|max_sharpe","rebalance_frequency":"monthly|quarterly","key_risks":["..."],"stress_scenarios":[{"scenario":"Tech selloff -20%","estimated_portfolio_impact":"-12%"}]}}`;

        const userPrompt = `Analyse ce portefeuille:

Tickers: ${portfolioData.tickers.join(', ')}
Capital: $${portfolioData.capital}
Risk Level: ${portfolioData.risk}/10
Horizon: ${portfolioData.horizon} ans

Données par action:
${portfolioData.tickers.map((t, i) => {
            const f = portfolioData.fundamentals[i] || {};
            return `${t}: Prix=$${portfolioData.prices[i]?.toFixed(2)}, P/E=${f.pe || 'N/A'}, P/B=${f.pb || 'N/A'}, ROE=${f.roe || 'N/A'}%, Beta=${f.beta || 'N/A'}, Margin=${f.margin || 'N/A'}%, D/E=${f.de || 'N/A'}`;
        }).join('\n')}

Retourne le JSON d'analyse.`;

        try {
            const IS_LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
            const proxyUrl = IS_LOCAL ? `http://${location.host}${AIO_PROXY}` : AIO_PROXY;
            const res = await fetch(proxyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 4096,
                    system: systemPrompt,
                    messages: [{ role: 'user', content: userPrompt }]
                }),
                signal: AbortSignal.timeout(30000)
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const text = data.content?.[0]?.text || '';
            return JSON.parse(text);
        } catch (e) {
            console.warn('[AIO] AI call failed:', e.message);
            return null;
        }
    }

    // ── Blend Quant + AI ──────────────────────────────────────────
    function blendWeights(quantW, aiWeights, tickers, blendRatio) {
        if (!aiWeights) return quantW;
        const aiW = tickers.map(t => aiWeights[t] || 0);
        const aiSum = aiW.reduce((a, b) => a + b, 0);
        if (aiSum < 0.01) return quantW;
        const normalizedAI = aiW.map(v => v / aiSum);
        return quantW.map((qw, i) => (1 - blendRatio) * qw + blendRatio * normalizedAI[i]);
    }

    // ═══════════════════════════════════════════════════════════════
    // UI MODULE
    // ═══════════════════════════════════════════════════════════════
    let aioState = {
        aiEnabled: false,
        blendRatio: 0.5,
        results: null,
        aiResults: null,
        activeTab: 'weights',
        frontierChart: null,
        isRunning: false,
    };

    function injectPanel() {
        const analysisTab = document.getElementById('tab-analysis');
        if (!analysisTab || document.getElementById('aio-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'aio-panel';
        panel.className = 'aio-panel';
        panel.innerHTML = buildPanelHTML();
        analysisTab.appendChild(panel);
        bindEvents();
    }

    function buildPanelHTML() {
        return `
    <div class="aio-header">
      <div class="aio-title">
        <h3>🧠 AI Portfolio Optimizer</h3>
        <span class="aio-badge">QUANT + AI</span>
      </div>
      <div class="aio-controls">
        <div class="aio-blend-row">
          <span>Quant</span>
          <input type="range" id="aioBlend" min="0" max="100" value="50" title="Blend ratio">
          <span>AI</span>
        </div>
        <div class="aio-toggle" id="aioToggle" title="Enable AI analysis">
          <span>AI</span>
          <div class="aio-toggle-track" id="aioToggleTrack">
            <div class="aio-toggle-thumb"></div>
          </div>
        </div>
        <button class="aio-btn-optimize" id="aioBtnOptimize">⚡ Optimize</button>
      </div>
    </div>
    <div class="aio-body" id="aioBody">
      <div class="aio-empty">
        <div class="aio-empty-icon">📊</div>
        <div>Click <b>⚡ Optimize</b> to run portfolio optimization</div>
        <div style="margin-top:6px;font-size:11px;color:var(--text3)">6 methods • Ensemble scoring • Efficient frontier</div>
      </div>
    </div>`;
    }

    function bindEvents() {
        document.getElementById('aioToggle')?.addEventListener('click', () => {
            aioState.aiEnabled = !aioState.aiEnabled;
            document.getElementById('aioToggleTrack')?.classList.toggle('on', aioState.aiEnabled);
        });
        document.getElementById('aioBlend')?.addEventListener('input', (e) => {
            aioState.blendRatio = e.target.value / 100;
        });
        document.getElementById('aioBtnOptimize')?.addEventListener('click', () => runOptimizer());
    }

    // ── Run Optimizer ─────────────────────────────────────────────
    async function runOptimizer() {
        if (aioState.isRunning) return;
        aioState.isRunning = true;
        const btn = document.getElementById('aioBtnOptimize');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Running...'; }
        const body = document.getElementById('aioBody');

        try {
            showLoading(body, 'Reading portfolio data...');
            const data = readPortfolioData();
            if (!data || data.tickers.length < 2) {
                showError(body, 'Need at least 2 stocks in portfolio');
                return;
            }

            showLoading(body, 'Computing returns & covariance...');
            await sleep(50);
            const retArrays = data.allCloses.map(computeReturns);
            const cov = computeCovMatrix(retArrays);
            const mu = retArrays.map(r => r.length > 0 ? r.reduce((a, b) => a + b, 0) / r.length : 0);

            showLoading(body, 'Running 6 optimization methods...');
            await sleep(50);
            const { weights, methods } = ensembleOptimize(cov, mu, data.tickers.length);
            const finalW = applySectorConstraint(weights, data.tickers, 0.40);
            const metrics = portfolioMetrics(finalW, cov, mu);

            showLoading(body, 'Computing efficient frontier...');
            await sleep(50);
            const frontier = efficientFrontier(cov, mu, 50);

            let aiData = null;
            let blendedW = finalW;
            if (aioState.aiEnabled) {
                showLoading(body, 'Calling AI analysis (Claude)...');
                aiData = await callClaudeAI(data);
                if (aiData?.portfolio_recommendation?.suggested_weights) {
                    blendedW = blendWeights(finalW, aiData.portfolio_recommendation.suggested_weights, data.tickers, aioState.blendRatio);
                    const bs = blendedW.reduce((a, b) => a + b, 0);
                    blendedW = blendedW.map(v => v / (bs || 1));
                }
            }

            const finalMetrics = portfolioMetrics(blendedW, cov, mu);
            aioState.results = { weights: blendedW, methods, metrics: finalMetrics, frontier, data, mu, cov };
            aioState.aiResults = aiData;

            renderResults(body);
        } catch (e) {
            console.error('[AIO] Error:', e);
            showError(body, e.message);
        } finally {
            aioState.isRunning = false;
            if (btn) { btn.disabled = false; btn.textContent = '⚡ Optimize'; }
        }
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function showLoading(el, step) {
        el.innerHTML = `<div class="aio-loading"><div class="aio-spinner"></div><div class="aio-loading-text">Optimizing portfolio...</div><div class="aio-loading-step">${step}</div></div>`;
    }
    function showError(el, msg) {
        el.innerHTML = `<div class="aio-error"><div class="aio-error-icon">⚠️</div><div class="aio-error-msg">${msg}</div><button class="aio-btn-retry" onclick="document.getElementById('aioBtnOptimize')?.click()">Retry</button></div>`;
    }

    // ── Render Results ────────────────────────────────────────────
    function renderResults(body) {
        const r = aioState.results;
        if (!r) return;
        const m = r.metrics;
        body.innerHTML = `
      <div class="aio-kpis">
        <div class="aio-kpi gold"><div class="aio-kpi-label">Expected Return</div><div class="aio-kpi-value">${(m.ret * 100).toFixed(1)}%</div><div class="aio-kpi-sub">Annualized</div></div>
        <div class="aio-kpi teal"><div class="aio-kpi-label">Volatility</div><div class="aio-kpi-value">${(m.vol * 100).toFixed(1)}%</div><div class="aio-kpi-sub">Annual σ</div></div>
        <div class="aio-kpi blue"><div class="aio-kpi-label">Sharpe Ratio</div><div class="aio-kpi-value">${m.sharpe.toFixed(2)}</div><div class="aio-kpi-sub">rf = ${(RF * 100).toFixed(0)}%</div></div>
        <div class="aio-kpi red"><div class="aio-kpi-label">Max Drawdown</div><div class="aio-kpi-value">-${(m.maxDD * 100).toFixed(1)}%</div><div class="aio-kpi-sub">Estimated</div></div>
      </div>
      <div class="aio-tabs" id="aioTabs">
        <div class="aio-tab active" data-tab="weights">Weights</div>
        <div class="aio-tab" data-tab="methods">Methods</div>
        <div class="aio-tab" data-tab="alloc">Allocation €</div>
        <div class="aio-tab" data-tab="insight">AI Insight</div>
      </div>
      <div class="aio-tab-pane active" id="aio-pane-weights">${renderWeightsTab()}</div>
      <div class="aio-tab-pane" id="aio-pane-methods">${renderMethodsTab()}</div>
      <div class="aio-tab-pane" id="aio-pane-alloc">${renderAllocTab()}</div>
      <div class="aio-tab-pane" id="aio-pane-insight">${renderInsightTab()}</div>
      <div class="aio-frontier-wrap"><h4>Efficient Frontier</h4><p>Risk-return tradeoff across 50 portfolio combinations</p><canvas id="aioFrontierChart"></canvas></div>
    `;
        bindTabs();
        renderFrontierChart();
    }

    function bindTabs() {
        document.querySelectorAll('#aioTabs .aio-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('#aioTabs .aio-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.querySelectorAll('.aio-tab-pane').forEach(p => p.classList.remove('active'));
                document.getElementById('aio-pane-' + tab.dataset.tab)?.classList.add('active');
            });
        });
    }

    function renderWeightsTab() {
        const r = aioState.results;
        const rows = r.data.tickers.map((t, i) => {
            const pct = (r.weights[i] * 100).toFixed(1);
            const rcPct = (r.metrics.rc[i] / r.metrics.rc.reduce((a, b) => a + Math.abs(b), 0) * 100 || 0).toFixed(1);
            return `<tr>
        <td><span class="aio-sym-tag">${t}</span></td>
        <td class="aio-mono">${pct}%</td>
        <td><div class="aio-weight-bar-wrap"><div class="aio-weight-bar" style="width:${Math.min(pct, 100)}%"></div></div></td>
        <td class="aio-mono">${rcPct}%</td>
        <td><div class="aio-weight-bar-wrap"><div class="aio-risk-bar" style="width:${Math.min(rcPct, 100)}%"></div></div></td>
      </tr>`;
        }).join('');
        return `<table class="aio-weights-table"><thead><tr><th>Ticker</th><th>Weight</th><th></th><th>Risk Contrib</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    function renderMethodsTab() {
        const r = aioState.results;
        const best = r.methods.reduce((a, b) => a.score > b.score ? a : b);
        return `<div class="aio-methods-grid">${r.methods.map(m => {
            const isBest = m === best;
            return `<div class="aio-method-card ${isBest ? 'best' : ''}">
        <div class="aio-method-name">${m.name}</div>
        <div class="aio-method-stat"><span>Return</span><span class="${m.metrics.ret >= 0 ? 'pos' : 'neg'}">${(m.metrics.ret * 100).toFixed(1)}%</span></div>
        <div class="aio-method-stat"><span>Volatility</span><span>${(m.metrics.vol * 100).toFixed(1)}%</span></div>
        <div class="aio-method-stat"><span>Sharpe</span><span>${m.metrics.sharpe.toFixed(2)}</span></div>
        <div class="aio-method-weight">Ensemble: ${(m.ensembleWeight * 100).toFixed(0)}%</div>
      </div>`;
        }).join('')}</div>`;
    }

    function renderAllocTab() {
        const r = aioState.results;
        return `<div class="aio-alloc-grid">${r.data.tickers.map((t, i) => {
            const amt = r.weights[i] * r.data.capital;
            const shrs = r.data.prices[i] > 0 ? amt / r.data.prices[i] : 0;
            return `<div class="aio-alloc-card">
        <div class="aio-alloc-sym">${t}</div>
        <div class="aio-alloc-amount">$${amt.toFixed(0)}</div>
        <div class="aio-alloc-pct">${(r.weights[i] * 100).toFixed(1)}%</div>
        <div class="aio-alloc-shares">≈ ${shrs.toFixed(2)} shares</div>
      </div>`;
        }).join('')}</div>`;
    }

    function renderInsightTab() {
        const ai = aioState.aiResults;
        if (!ai) {
            return `<div class="aio-empty"><div class="aio-empty-icon">🤖</div><div>Enable the AI toggle and re-optimize to get AI insights</div><div style="margin-top:6px;font-size:11px;color:var(--text3)">Requires backend proxy with Anthropic API key</div></div>`;
        }
        const regime = ai.market_regime || 'neutral';
        const rec = ai.portfolio_recommendation || {};
        const stocks = ai.stocks || [];
        const stressHTML = (rec.stress_scenarios || []).map(s =>
            `<tr><td>${s.scenario}</td><td class="aio-mono neg">${s.estimated_portfolio_impact}</td></tr>`
        ).join('') || '<tr><td colspan="2" style="color:var(--text3)">No stress data</td></tr>';
        const scoresHTML = stocks.map(s => `
      <div class="aio-score-card">
        <div class="aio-score-header">
          <span class="aio-score-sym">${s.ticker}</span>
          <span class="aio-conviction ${(s.conviction || '').toLowerCase()}">${s.conviction || 'N/A'}</span>
        </div>
        <div class="aio-score-row"><span>Fundamental</span><span>${s.fundamental_score || '-'}/10</span></div>
        <div class="aio-score-row"><span>Quantitative</span><span>${s.quant_score || '-'}/10</span></div>
        <div class="aio-score-row"><span>Sentiment</span><span>${s.sentiment_score >= 0 ? '+' : ''}${s.sentiment_score || '-'}</span></div>
        <div class="aio-score-row"><span>Momentum</span><span>${s.momentum || '-'}</span></div>
      </div>`).join('');

        return `
      <div class="aio-insight-header">
        <span class="aio-regime-badge ${regime}">📊 ${regime.toUpperCase()} MARKET</span>
        <span style="font-size:10px;color:var(--text3);font-family:'Space Mono',monospace">${ai.analysis_date || ''}</span>
      </div>
      <div class="aio-strategy-box">
        <div class="aio-strategy-name">${rec.strategy_name || 'N/A'}</div>
        <div class="aio-strategy-rationale">${rec.strategy_rationale || ''}</div>
      </div>
      <div class="aio-risks-grid">
        <div class="aio-risk-tile"><h5>🚨 Key Risks</h5><ul>${(rec.key_risks || ['No data']).map(r => `<li>${r}</li>`).join('')}</ul></div>
        <div class="aio-risk-tile"><h5>📈 Stress Tests</h5><table class="aio-stress-table"><thead><tr><th>Scenario</th><th>Impact</th></tr></thead><tbody>${stressHTML}</tbody></table></div>
      </div>
      <div style="margin-top:14px"><div style="font-family:'Syne',sans-serif;font-size:12px;font-weight:700;margin-bottom:10px">Stock Analysis</div><div class="aio-scores-grid">${scoresHTML || '<div style="color:var(--text3)">No stock data</div>'}</div></div>
    `;
    }

    function renderFrontierChart() {
        const r = aioState.results;
        if (!r || !r.frontier.length) return;
        const canvas = document.getElementById('aioFrontierChart');
        if (!canvas) return;
        if (aioState.frontierChart) { aioState.frontierChart.destroy(); aioState.frontierChart = null; }
        const ctx = canvas.getContext('2d');
        aioState.frontierChart = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [
                    {
                        label: 'Efficient Frontier',
                        data: r.frontier.map(p => ({ x: +(p.vol * 100).toFixed(2), y: +(p.ret * 100).toFixed(2) })),
                        borderColor: '#d4a843',
                        backgroundColor: 'rgba(212,168,67,.15)',
                        showLine: true,
                        pointRadius: 2,
                        borderWidth: 2,
                        tension: 0.4,
                        fill: false,
                    },
                    {
                        label: 'Current Portfolio',
                        data: [{ x: +(r.metrics.vol * 100).toFixed(2), y: +(r.metrics.ret * 100).toFixed(2) }],
                        backgroundColor: '#00d4b1',
                        borderColor: '#00d4b1',
                        pointRadius: 8,
                        pointStyle: 'star',
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: true, labels: { color: '#8fa3c0', font: { family: 'Space Mono', size: 10 } } },
                    tooltip: {
                        backgroundColor: 'rgba(12,18,25,.9)',
                        borderColor: 'rgba(30,50,80,.5)',
                        borderWidth: 1,
                        titleFont: { family: 'Space Mono', size: 11 },
                        bodyFont: { family: 'DM Sans', size: 11 },
                        callbacks: {
                            label: (ctx) => `Vol: ${ctx.parsed.x}% | Ret: ${ctx.parsed.y}%`
                        }
                    }
                },
                scales: {
                    x: { title: { display: true, text: 'Volatility (%)', color: '#4e6a8a', font: { family: 'Space Mono', size: 10 } }, ticks: { color: '#4e6a8a', font: { family: 'Space Mono', size: 10 } }, grid: { color: 'rgba(30,50,80,.25)' } },
                    y: { title: { display: true, text: 'Return (%)', color: '#4e6a8a', font: { family: 'Space Mono', size: 10 } }, ticks: { color: '#4e6a8a', font: { family: 'Space Mono', size: 10 } }, grid: { color: 'rgba(30,50,80,.25)' } }
                }
            }
        });
    }

    // ── Init ──────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectPanel);
    } else {
        injectPanel();
    }
})();
