// ═══════════════════════════════════════════════════════════════════════════
// QUANTEDGE-ENGINE.JS — moteur de risque + allocation (JavaScript natif)
// ═══════════════════════════════════════════════════════════════════════════
// Expose window.QE avec :
//   - Metrics : vraie VaR/CVaR, vrai max drawdown (historique), Sortino,
//     Sharpe, beta/alpha, volatilité downside
//   - Stress tests paramétriques (shocks) et historiques si data dispo
//   - Allocator : Black-Litterman (complément à ai-optimizer.js)
//   - Rebalancer : bandes de tolérance, génération d'ordres avec coûts
//   - Alertes précoces : surveillance continue des seuils
//
// Conçu pour être chargé APRÈS app.js (accès à `state`, `liveCache`,
// `STOCKS_DB`, `yfQuote`) mais ne modifie rien à l'existant.
// ═══════════════════════════════════════════════════════════════════════════

(function (global) {
    'use strict';

    const QE = {};

    // ══════════ 1. UTILITAIRES MATRICE / STATS ═══════════════════════════
    const DAYS_PER_YEAR = 252;

    function mean(arr) { return arr.reduce((s, v) => s + v, 0) / arr.length; }
    function variance(arr) {
        const m = mean(arr);
        return arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1 || 1);
    }
    function std(arr) { return Math.sqrt(variance(arr)); }
    function percentile(arr, p) {
        const a = [...arr].sort((x, y) => x - y);
        const idx = (p / 100) * (a.length - 1);
        const lo = Math.floor(idx), hi = Math.ceil(idx);
        if (lo === hi) return a[lo];
        return a[lo] + (a[hi] - a[lo]) * (idx - lo);
    }
    function skewness(arr) {
        const m = mean(arr), s = std(arr);
        if (s === 0) return 0;
        const n = arr.length;
        const sum = arr.reduce((a, v) => a + ((v - m) / s) ** 3, 0);
        return (n / ((n - 1) * (n - 2))) * sum;
    }
    function kurtosis(arr) {
        // excess kurtosis
        const m = mean(arr), s = std(arr);
        if (s === 0) return 0;
        const n = arr.length;
        const sum = arr.reduce((a, v) => a + ((v - m) / s) ** 4, 0);
        return (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3)) * sum
            - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
    }
    function covMat(returnArrays) {
        const n = returnArrays.length;
        const T = Math.min(...returnArrays.map(r => r.length));
        if (T < 2) return Array.from({ length: n }, (_, i) =>
            Array.from({ length: n }, (_, j) => i === j ? 0.04 / DAYS_PER_YEAR : 0));
        const truncated = returnArrays.map(r => r.slice(-T));
        const means = truncated.map(mean);
        const cov = Array.from({ length: n }, () => new Array(n).fill(0));
        for (let i = 0; i < n; i++) {
            for (let j = i; j < n; j++) {
                let s = 0;
                for (let t = 0; t < T; t++) s += (truncated[i][t] - means[i]) * (truncated[j][t] - means[j]);
                cov[i][j] = cov[j][i] = s / (T - 1);
            }
        }
        return cov;
    }
    function corrMat(cov) {
        const n = cov.length;
        const sigma = cov.map((_, i) => Math.sqrt(Math.max(cov[i][i], 1e-12)));
        return cov.map((row, i) => row.map((v, j) => v / (sigma[i] * sigma[j] || 1)));
    }
    function closesToReturns(closes) {
        const r = [];
        for (let i = 1; i < closes.length; i++) {
            const p0 = closes[i - 1], p1 = closes[i];
            if (p0 > 0 && p1 > 0) r.push(Math.log(p1 / p0));
        }
        return r;
    }
    function alignSeries(arrays) {
        // tronque toutes les séries à la même longueur (à partir de la fin)
        const T = Math.min(...arrays.map(a => a.length));
        return arrays.map(a => a.slice(-T));
    }

    // ══════════ 2. SÉRIE DE VALEUR DU PORTEFEUILLE ═══════════════════════
    /**
     * Reconstruit la série de valeur du portefeuille à partir des prix
     * historiques par ticker et des poids actuels.
     * Hypothèse : poids maintenus constants (rééquilibrage quotidien).
     */
    function portfolioEquityCurve(closesPerTicker, weights, base = 100) {
        const aligned = alignSeries(closesPerTicker);
        const T = aligned[0].length;
        const n = aligned.length;
        // Rendements daily par actif
        const rets = aligned.map(closesToReturns);
        const Tr = rets[0].length;
        const equity = [base];
        for (let t = 0; t < Tr; t++) {
            let r = 0;
            for (let i = 0; i < n; i++) r += weights[i] * rets[i][t];
            equity.push(equity[t] * Math.exp(r));
        }
        return equity;
    }
    function portfolioDailyReturns(closesPerTicker, weights) {
        const aligned = alignSeries(closesPerTicker);
        const rets = aligned.map(closesToReturns);
        const Tr = rets[0].length;
        const n = weights.length;
        const out = [];
        for (let t = 0; t < Tr; t++) {
            let r = 0;
            for (let i = 0; i < n; i++) r += weights[i] * rets[i][t];
            out.push(r);
        }
        return out;
    }

    // ══════════ 3. RISK METRICS (les vraies, pas de vol×1.5) ═════════════
    /** Vrai max drawdown à partir d'une série de valeurs. */
    function maxDrawdown(equity) {
        let peak = equity[0], maxDD = 0, ddStart = 0, ddTrough = 0;
        let currentPeakIdx = 0;
        for (let i = 1; i < equity.length; i++) {
            if (equity[i] > peak) { peak = equity[i]; currentPeakIdx = i; }
            const dd = (equity[i] - peak) / peak;
            if (dd < maxDD) { maxDD = dd; ddStart = currentPeakIdx; ddTrough = i; }
        }
        return { maxDrawdown: maxDD, startIdx: ddStart, troughIdx: ddTrough,
                 durationDays: ddTrough - ddStart };
    }

    /** Série de drawdown (pour afficher en chart). */
    function drawdownSeries(equity) {
        let peak = equity[0];
        return equity.map(v => { if (v > peak) peak = v; return (v - peak) / peak; });
    }

    /** VaR historique : perte seuil à un niveau de confiance. Retourne valeur négative. */
    function varHistorical(returns, confidence = 0.95) {
        return percentile(returns, (1 - confidence) * 100);
    }

    /** CVaR (Expected Shortfall) : moyenne des pertes au-delà de la VaR. */
    function cvarHistorical(returns, confidence = 0.95) {
        const v = varHistorical(returns, confidence);
        const tail = returns.filter(r => r <= v);
        return tail.length ? mean(tail) : v;
    }

    /** VaR paramétrique sous hypothèse de normalité. */
    function varParametric(returns, confidence = 0.95) {
        const m = mean(returns), s = std(returns);
        // Approximation de l'inverse de la normale standard
        const z = inverseStdNormal(1 - confidence);
        return m + s * z;
    }
    function inverseStdNormal(p) {
        // Approximation de Beasley-Springer-Moro (suffisante pour VaR)
        const a = [-3.969683028665376e+01, 2.209460984245205e+02,
                   -2.759285104469687e+02, 1.383577518672690e+02,
                   -3.066479806614716e+01, 2.506628277459239e+00];
        const b = [-5.447609879822406e+01, 1.615858368580409e+02,
                   -1.556989798598866e+02, 6.680131188771972e+01,
                   -1.328068155288572e+01];
        const c = [-7.784894002430293e-03, -3.223964580411365e-01,
                   -2.400758277161838e+00, -2.549732539343734e+00,
                   4.374664141464968e+00, 2.938163982698783e+00];
        const d = [7.784695709041462e-03, 3.224671290700398e-01,
                   2.445134137142996e+00, 3.754408661907416e+00];
        const pLow = 0.02425, pHigh = 1 - pLow;
        let q, r;
        if (p < pLow) {
            q = Math.sqrt(-2 * Math.log(p));
            return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
                / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
        }
        if (p <= pHigh) {
            q = p - 0.5; r = q * q;
            return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
                / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
        }
        q = Math.sqrt(-2 * Math.log(1 - p));
        return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
            / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }

    function sharpeRatio(returns, rf = 0.04) {
        const annualReturn = mean(returns) * DAYS_PER_YEAR;
        const annualVol = std(returns) * Math.sqrt(DAYS_PER_YEAR);
        return annualVol > 0 ? (annualReturn - rf) / annualVol : 0;
    }

    function sortinoRatio(returns, rf = 0.04) {
        const annualReturn = mean(returns) * DAYS_PER_YEAR;
        const downside = returns.filter(r => r < 0);
        if (!downside.length) return Infinity;
        const downsideStd = Math.sqrt(downside.reduce((s, r) => s + r * r, 0) / downside.length);
        const annualDownside = downsideStd * Math.sqrt(DAYS_PER_YEAR);
        return annualDownside > 0 ? (annualReturn - rf) / annualDownside : 0;
    }

    function betaAlpha(portfolioReturns, benchmarkReturns, rf = 0.04) {
        const T = Math.min(portfolioReturns.length, benchmarkReturns.length);
        const pr = portfolioReturns.slice(-T);
        const br = benchmarkReturns.slice(-T);
        const mP = mean(pr), mB = mean(br);
        let covPB = 0, varB = 0;
        for (let i = 0; i < T; i++) {
            covPB += (pr[i] - mP) * (br[i] - mB);
            varB += (br[i] - mB) ** 2;
        }
        const beta = varB > 0 ? covPB / varB : 1;
        const alpha = (mP * DAYS_PER_YEAR) - rf - beta * (mB * DAYS_PER_YEAR - rf);
        return { beta, alpha };
    }

    /** Rapport complet : passe tout ce qu'on sait calculer. */
    function riskReport(equity, portfolioReturns, benchmarkReturns = null) {
        const rep = {
            annualReturn: mean(portfolioReturns) * DAYS_PER_YEAR,
            annualVolatility: std(portfolioReturns) * Math.sqrt(DAYS_PER_YEAR),
            sharpe: sharpeRatio(portfolioReturns),
            sortino: sortinoRatio(portfolioReturns),
            var95Historical: varHistorical(portfolioReturns, 0.95),
            var99Historical: varHistorical(portfolioReturns, 0.99),
            cvar95: cvarHistorical(portfolioReturns, 0.95),
            cvar99: cvarHistorical(portfolioReturns, 0.99),
            var95Parametric: varParametric(portfolioReturns, 0.95),
            skewness: skewness(portfolioReturns),
            kurtosis: kurtosis(portfolioReturns),
            ...maxDrawdown(equity),
        };
        if (benchmarkReturns && benchmarkReturns.length > 2) {
            Object.assign(rep, betaAlpha(portfolioReturns, benchmarkReturns));
        }
        return rep;
    }

    // ══════════ 4. STRESS TESTS ══════════════════════════════════════════
    // Scénarios "choc" : on applique un choc en % à chaque actif
    const STRESS_SCENARIOS = {
        'krach_actions_-30': {
            label: 'Krach actions -30% / Fuite vers obligations',
            shocks: {
                equity: -0.30, etf_eq: -0.30, bond: +0.08, treasury: +0.12,
                gold: +0.10, commodity: -0.05, crypto: -0.50,
            },
        },
        'hausse_taux_+200bps': {
            label: 'Hausse des taux +200 bps (scénario 2022)',
            shocks: {
                equity: -0.15, etf_eq: -0.15, bond: -0.20, treasury: -0.25,
                gold: -0.05, commodity: +0.05,
            },
        },
        'stagflation': {
            label: 'Stagflation (Stagnation + Inflation)',
            shocks: {
                equity: -0.20, etf_eq: -0.20, bond: -0.15, treasury: -0.10,
                gold: +0.20, commodity: +0.25,
            },
        },
        'deflation_grave': {
            label: 'Déflation grave (choc déflationniste)',
            shocks: {
                equity: -0.25, etf_eq: -0.25, bond: +0.15, treasury: +0.20,
                gold: -0.10, commodity: -0.30,
            },
        },
        'crise_covid': {
            label: 'Flash krach type COVID (Mars 2020)',
            shocks: {
                equity: -0.35, etf_eq: -0.35, bond: +0.03, treasury: +0.08,
                gold: +0.05, commodity: -0.40, crypto: -0.45,
            },
        },
    };

    /**
     * Applique un stress test paramétrique.
     * assetClassByTicker : {ticker: 'equity'|'bond'|'gold'|...}
     */
    function stressTest(weights, tickers, assetClassByTicker, scenarioKey) {
        const scenario = STRESS_SCENARIOS[scenarioKey];
        if (!scenario) return null;
        let impact = 0;
        const breakdown = [];
        tickers.forEach((t, i) => {
            const cls = assetClassByTicker[t] || 'equity';
            const shock = scenario.shocks[cls] || 0;
            const contrib = weights[i] * shock;
            impact += contrib;
            breakdown.push({ ticker: t, class: cls, weight: weights[i],
                             shock, contribution: contrib });
        });
        return { key: scenarioKey, label: scenario.label, impact, breakdown };
    }

    function runAllStressTests(weights, tickers, assetClassByTicker) {
        return Object.keys(STRESS_SCENARIOS).map(k =>
            stressTest(weights, tickers, assetClassByTicker, k));
    }

    // ══════════ 5. CLASSIFICATION D'ACTIFS (heuristique) ═════════════════
    /**
     * Devine la classe d'actifs d'un ticker pour les stress tests.
     * Étend ici ton univers réel si besoin.
     */
    const KNOWN_BOND_ETFS = new Set(['TLT', 'IEF', 'SHY', 'BND', 'AGG', 'LQD', 'HYG', 'TIP']);
    const KNOWN_GOLD_ETFS = new Set(['GLD', 'IAU', 'SGOL', 'GLDM']);
    const KNOWN_COMMODITY_ETFS = new Set(['DBC', 'USO', 'UNG', 'DBA', 'PDBC']);
    const KNOWN_EQUITY_ETFS = new Set(['SPY', 'QQQ', 'VTI', 'IWM', 'DIA', 'EFA', 'EEM', 'VEA', 'VWO']);
    const KNOWN_TREASURY_ETFS = new Set(['GOVT', 'VGIT', 'VGLT', 'VGSH']);
    const CRYPTO_TICKERS = new Set(['BTC-USD', 'ETH-USD', 'GBTC', 'BITO']);

    function classifyTicker(sym, sector) {
        const s = (sym || '').toUpperCase();
        if (KNOWN_BOND_ETFS.has(s)) return 'bond';
        if (KNOWN_TREASURY_ETFS.has(s)) return 'treasury';
        if (KNOWN_GOLD_ETFS.has(s)) return 'gold';
        if (KNOWN_COMMODITY_ETFS.has(s)) return 'commodity';
        if (KNOWN_EQUITY_ETFS.has(s)) return 'etf_eq';
        if (CRYPTO_TICKERS.has(s)) return 'crypto';
        return 'equity';   // défaut : action
    }

    // ══════════ 6. BLACK-LITTERMAN (complément à ai-optimizer) ═══════════
    /**
     * Combine les poids de marché avec des "vues" (venant d'un modèle ML
     * externe, du sentiment NLP, ou de l'utilisateur) pour produire des
     * rendements postérieurs puis un portefeuille optimal.
     *
     * @param {Array<Array<number>>} cov — covariance journalière annualisée
     * @param {Array<number>} marketWeights — poids de marché
     * @param {Object} views — {ticker_index: expected_annual_return}
     * @param {Object} confidences — {ticker_index: variance_of_view}
     * @param {number} lambda — aversion au risque
     * @param {number} tau — incertitude du prior (0.02 à 0.05)
     */
    function blackLitterman(cov, marketWeights, views, confidences,
                             lambda = 3, tau = 0.05) {
        const n = cov.length;
        // 1) Rendements implicites : Π = λΣw
        const Sigma = cov;
        const Pi = new Array(n).fill(0);
        for (let i = 0; i < n; i++)
            for (let j = 0; j < n; j++) Pi[i] += lambda * Sigma[i][j] * marketWeights[j];

        const viewIdx = Object.keys(views).map(Number);
        if (!viewIdx.length) {
            // Pas de vue → retourne juste Π
            return { posteriorReturns: Pi, weights: marketWeights.slice() };
        }

        const k = viewIdx.length;
        // P : matrice de sélection (k × n)
        const P = Array.from({ length: k }, () => new Array(n).fill(0));
        const Q = new Array(k).fill(0);
        const Omega = Array.from({ length: k }, () => new Array(k).fill(0));
        viewIdx.forEach((idx, i) => {
            P[i][idx] = 1;
            Q[i] = views[idx];
            Omega[i][i] = confidences[idx] || 0.01;
        });

        // μ_BL = [(τΣ)^-1 + P'Ω^-1 P]^-1 [(τΣ)^-1 Π + P'Ω^-1 Q]
        const tauSigma = Sigma.map(row => row.map(v => v * tau));
        const tauSigmaInv = invertPD(tauSigma);
        const OmegaInv = Array.from({ length: k }, (_, i) =>
            Array.from({ length: k }, (_, j) => i === j ? 1 / (Omega[i][i] || 1e-6) : 0));

        // P'Ω^-1 P
        const PtOi = matMul(transpose(P), OmegaInv);
        const PtOiP = matMul(PtOi, P);
        const A = addMat(tauSigmaInv, PtOiP);
        const Ainv = invertPD(A);

        // b = (τΣ)^-1 Π + P'Ω^-1 Q
        const tauSigmaInvPi = matVec(tauSigmaInv, Pi);
        const PtOiQ = matVec(PtOi, Q);
        const b = tauSigmaInvPi.map((v, i) => v + PtOiQ[i]);

        const muBL = matVec(Ainv, b);

        // Poids : w = (λΣ)^-1 μ_BL (tangence analytique)
        const lambdaSigmaInv = invertPD(Sigma.map(row => row.map(v => v * lambda)));
        const wUnn = matVec(lambdaSigmaInv, muBL);
        const sum = wUnn.reduce((s, v) => s + Math.abs(v), 0) || 1;
        const w = wUnn.map(v => Math.max(0, v) / sum);
        const totalPos = w.reduce((s, v) => s + v, 0) || 1;
        return { posteriorReturns: muBL, weights: w.map(v => v / totalPos) };
    }

    // --- matrix helpers pour Black-Litterman ---
    function transpose(A) {
        const m = A.length, n = A[0].length, T = [];
        for (let j = 0; j < n; j++) { T[j] = []; for (let i = 0; i < m; i++) T[j][i] = A[i][j]; }
        return T;
    }
    function matMul(A, B) {
        const m = A.length, n = B[0].length, p = B.length, C = [];
        for (let i = 0; i < m; i++) {
            C[i] = [];
            for (let j = 0; j < n; j++) {
                let s = 0;
                for (let k = 0; k < p; k++) s += A[i][k] * B[k][j];
                C[i][j] = s;
            }
        }
        return C;
    }
    function matVec(A, v) { return A.map(row => row.reduce((s, a, j) => s + a * v[j], 0)); }
    function addMat(A, B) { return A.map((row, i) => row.map((v, j) => v + B[i][j])); }
    function invertPD(A) {
        // Inversion via Cholesky (A doit être symétrique définie positive)
        const n = A.length;
        const L = Array.from({ length: n }, () => new Array(n).fill(0));
        for (let i = 0; i < n; i++) {
            for (let j = 0; j <= i; j++) {
                let s = 0;
                for (let k = 0; k < j; k++) s += L[i][k] * L[j][k];
                if (i === j) {
                    const v = A[i][i] - s;
                    L[i][j] = v > 1e-12 ? Math.sqrt(v) : 1e-6;
                } else {
                    L[i][j] = (A[i][j] - s) / (L[j][j] || 1e-12);
                }
            }
        }
        // Inverse L
        const Li = Array.from({ length: n }, () => new Array(n).fill(0));
        for (let i = 0; i < n; i++) {
            Li[i][i] = 1 / (L[i][i] || 1e-12);
            for (let j = i + 1; j < n; j++) {
                let s = 0;
                for (let k = i; k < j; k++) s += L[j][k] * Li[k][i];
                Li[j][i] = -s / (L[j][j] || 1e-12);
            }
        }
        // A^-1 = Li' Li
        return matMul(transpose(Li), Li);
    }

    // ══════════ 7. REBALANCER ════════════════════════════════════════════
    function generateRebalanceOrders({ currentHoldings, targetWeights, livePrices,
                                       totalValue, costBps = 10, tolerance = 0.05 }) {
        const orders = [];
        const tickers = Object.keys(targetWeights);
        // 1) Calculer poids actuels
        const currentWeights = {};
        tickers.forEach(t => {
            const shares = currentHoldings[t] || 0;
            const price = livePrices[t] || 0;
            currentWeights[t] = totalValue > 0 ? (shares * price) / totalValue : 0;
        });
        // 2) Vérifier si rééquilibrage nécessaire
        const exceeds = tickers.some(t =>
            Math.abs(currentWeights[t] - targetWeights[t]) > tolerance);
        if (!exceeds) {
            return { action: 'skip', reason: `Aucun écart > ${(tolerance*100).toFixed(1)}%`,
                     currentWeights, ecarts: {} };
        }
        const ecarts = {};
        let totalCost = 0;
        tickers.forEach(t => {
            const price = livePrices[t] || 0;
            if (price <= 0) return;
            const targetValue = targetWeights[t] * totalValue;
            const currentValue = (currentHoldings[t] || 0) * price;
            const deltaValue = targetValue - currentValue;
            ecarts[t] = currentWeights[t] - targetWeights[t];
            if (Math.abs(deltaValue) < 1) return;
            const side = deltaValue > 0 ? 'BUY' : 'SELL';
            const shares = Math.abs(deltaValue) / price;
            const cost = Math.abs(deltaValue) * costBps / 10000;
            orders.push({ ticker: t, side, shares, price,
                          value: Math.abs(deltaValue), cost });
            totalCost += cost;
        });
        // Trier : ventes d'abord pour libérer du cash
        orders.sort((a, b) => a.side === 'SELL' ? -1 : 1);
        return { action: 'rebalance', orders, totalCost, currentWeights, ecarts };
    }

    // ══════════ 8. ALERT SYSTEM ══════════════════════════════════════════
    function evaluateAlerts({ equity, returns, weights, tickers,
                              maxDDThreshold = -0.15,
                              volThreshold = 0.30,
                              concentrationThreshold = 0.30,
                              varThreshold = -0.05 }) {
        const alerts = [];

        // 1) Drawdown courant
        const dd = drawdownSeries(equity);
        const ddCurrent = dd[dd.length - 1];
        if (ddCurrent < maxDDThreshold) {
            alerts.push({
                level: ddCurrent < maxDDThreshold * 1.5 ? 'critical' : 'warning',
                type: 'drawdown',
                message: `Drawdown actuel ${(ddCurrent * 100).toFixed(1)}% < seuil ${(maxDDThreshold * 100).toFixed(0)}%`,
                value: ddCurrent, threshold: maxDDThreshold,
            });
        }

        // 2) Pic de vol (vol 20j vs vol totale)
        if (returns.length >= 40) {
            const recent20 = returns.slice(-20);
            const volShort = std(recent20) * Math.sqrt(DAYS_PER_YEAR);
            const volLong = std(returns) * Math.sqrt(DAYS_PER_YEAR);
            if (volShort > volLong * 1.5) {
                alerts.push({
                    level: 'warning',
                    type: 'volatility_spike',
                    message: `Vol 20j (${(volShort * 100).toFixed(1)}%) > 1.5× vol historique (${(volLong * 100).toFixed(1)}%)`,
                    value: volShort, threshold: volLong * 1.5,
                });
            }
            if (volShort > volThreshold) {
                alerts.push({
                    level: 'warning',
                    type: 'high_volatility',
                    message: `Volatilité annualisée ${(volShort * 100).toFixed(1)}% dépasse ${(volThreshold * 100).toFixed(0)}%`,
                    value: volShort, threshold: volThreshold,
                });
            }
        }

        // 3) VaR 95% > seuil
        if (returns.length >= 60) {
            const v = varHistorical(returns.slice(-60), 0.95);
            if (v < varThreshold) {
                alerts.push({
                    level: 'warning',
                    type: 'var_breach',
                    message: `VaR 95% à ${(v * 100).toFixed(2)}% (> ${(varThreshold * 100).toFixed(0)}% de perte 1j potentielle)`,
                    value: v, threshold: varThreshold,
                });
            }
        }

        // 4) Concentration
        weights.forEach((w, i) => {
            if (w > concentrationThreshold) {
                alerts.push({
                    level: 'warning',
                    type: 'concentration',
                    message: `${tickers[i]} pèse ${(w * 100).toFixed(1)}% (> ${(concentrationThreshold * 100).toFixed(0)}%)`,
                    value: w, threshold: concentrationThreshold,
                });
            }
        });

        // 5) Kurtosis élevé (queues épaisses)
        if (returns.length >= 60) {
            const k = kurtosis(returns.slice(-60));
            if (k > 5) {
                alerts.push({
                    level: 'info',
                    type: 'fat_tails',
                    message: `Kurtosis ${k.toFixed(2)} — distribution des rendements très leptokurtique (risque de queue élevé)`,
                    value: k, threshold: 5,
                });
            }
        }

        return alerts;
    }

    // ══════════ 9. EXPOSITION PUBLIQUE ═══════════════════════════════════
    Object.assign(QE, {
        // Stats
        mean, std, variance, percentile, skewness, kurtosis,
        covMat, corrMat, closesToReturns, alignSeries,
        // Portfolio construction
        portfolioEquityCurve, portfolioDailyReturns,
        // Risk metrics
        maxDrawdown, drawdownSeries,
        varHistorical, cvarHistorical, varParametric,
        sharpeRatio, sortinoRatio, betaAlpha, riskReport,
        // Stress tests
        STRESS_SCENARIOS, stressTest, runAllStressTests,
        classifyTicker,
        // Allocator
        blackLitterman,
        // Rebalancer
        generateRebalanceOrders,
        // Alerts
        evaluateAlerts,
        // Constants
        DAYS_PER_YEAR,
    });

    global.QE = QE;
    console.log('[QuantEdge Engine] loaded — window.QE ready (', Object.keys(QE).length, 'exports)');
})(window);
