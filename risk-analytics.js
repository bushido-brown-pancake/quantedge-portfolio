// ═══════════════════════════════════════════════════════════════════════════
// RISK-ANALYTICS.JS — Onglet "Risk" pour QuantEdge
// ═══════════════════════════════════════════════════════════════════════════
// Utilise window.QE (chargé par quantedge-engine.js) pour calculer et afficher :
//   - KPI cards : VaR, CVaR, Drawdown réel, Sharpe, Sortino, Beta, Alpha
//   - Heatmap de corrélation (SVG inline, pas de dépendance externe)
//   - Stress tests paramétriques
//   - Système d'alertes précoces
//   - Aperçu de rééquilibrage (vs poids actuels du portfolio)
//
// Dépendances : window.state (de app.js), window.liveCache, window.STOCKS_DB,
//               window.yfQuote (pour fetch historique si manquant)
// ═══════════════════════════════════════════════════════════════════════════

(function () {
    'use strict';

    const HOST_ID = 'tab-risk';
    let lastRender = null;

    // ── Helpers de couleurs / formats ────────────────────────────────────
    const fmtPct = (v, dec = 2) => v == null || isNaN(v) ? '—' : (v * 100).toFixed(dec) + '%';
    const fmtNum = (v, dec = 2) => v == null || isNaN(v) ? '—' : Number(v).toFixed(dec);
    const fmtMoney = (v) => v == null ? '—' :
        '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });

    function colorFromValue(v, min, max) {
        // -1..0..1 → rouge→blanc→bleu
        const t = Math.max(-1, Math.min(1, v));
        if (t >= 0) {
            const k = Math.round(255 - t * 200);
            return `rgb(${k},${k},255)`;
        } else {
            const k = Math.round(255 + t * 200);
            return `rgb(255,${k},${k})`;
        }
    }

    // ── 1. Récupération des closes par ticker (avec fallback fetch) ──────
    //     Ordre : liveCache → Yahoo (yfQuote) → Marketstack → null
    async function getClosesFor(sym) {
        // Cherche dans liveCache de l'app
        if (typeof liveCache !== 'undefined' && liveCache[sym]?.closes?.length > 1) {
            return liveCache[sym].closes.filter(v => v != null);
        }
        // Tente Yahoo en premier
        if (typeof yfQuote === 'function') {
            try {
                const q = await yfQuote(sym);
                if (q?.closes?.length > 1) {
                    if (typeof liveCache !== 'undefined') liveCache[sym] = q;
                    return q.closes.filter(v => v != null);
                }
            } catch (_) { /* ignore — on essaie Marketstack */ }
        }
        // Fallback Marketstack (seulement si clé configurée côté serveur)
        try {
            const r = await fetch(`/api/marketstack/eod/${encodeURIComponent(sym)}?limit=252`, { cache: 'no-store' });
            if (r.ok) {
                const data = await r.json();
                const closes = (data?.rows || []).map(d => d.close).filter(v => v != null);
                if (closes.length > 1) {
                    if (typeof liveCache !== 'undefined') {
                        liveCache[sym] = { closes, source: 'marketstack' };
                    }
                    return closes;
                }
            }
        } catch (_) { /* Marketstack indispo — on essaie Alpha Vantage */ }
        // Fallback Alpha Vantage (25 req/jour — à utiliser en dernier recours)
        try {
            const r = await fetch(`/api/alpha/eod/${encodeURIComponent(sym)}`, { cache: 'no-store' });
            if (r.ok) {
                const data = await r.json();
                const closes = (data?.rows || []).map(d => d.close).filter(v => v != null);
                if (closes.length > 1) {
                    if (typeof liveCache !== 'undefined') {
                        liveCache[sym] = { closes, source: 'alphavantage' };
                    }
                    return closes;
                }
            }
        } catch (_) { /* AV indispo */ }
        return null;
    }

    // ── 2. Construction du dataset portefeuille ──────────────────────────
    async function buildPortfolioDataset() {
        if (typeof state === 'undefined' || !state.portfolio?.length) {
            return { error: 'Portefeuille vide. Ajoute des actions dans l\'onglet Portfolio.' };
        }
        const tickers = state.portfolio.map(p => p.sym);
        const sharesByTicker = Object.fromEntries(state.portfolio.map(p => [p.sym, p.shares]));
        const livePrices = {};
        const sectors = {};
        const closesPerTicker = [];
        const validTickers = [];
        const skipped = [];

        for (const t of tickers) {
            const dbEntry = (typeof STOCKS_DB !== 'undefined') ?
                STOCKS_DB.find(s => s.sym === t) : null;
            const cur = (typeof livePricesGlobal !== 'undefined' && livePricesGlobal[t]?.price)
                || dbEntry?.price || null;
            livePrices[t] = cur;
            sectors[t] = dbEntry?.sector || 'Unknown';

            const closes = await getClosesFor(t);
            if (closes && closes.length > 30) {
                closesPerTicker.push(closes);
                validTickers.push(t);
            } else {
                skipped.push(t);
            }
        }

        if (validTickers.length < 1) {
            return { error: 'Pas assez de données historiques. Ouvre l\'onglet Portfolio puis Overview pour charger les prix.' };
        }

        // Poids = valeur de marché / total
        const totalValue = validTickers.reduce((s, t) =>
            s + (sharesByTicker[t] || 0) * (livePrices[t] || 0), 0);
        const weights = validTickers.map(t =>
            totalValue > 0 ? (sharesByTicker[t] || 0) * (livePrices[t] || 0) / totalValue : 0);

        // Benchmark (SPY) — fallback s'il n'est pas dans le portefeuille
        let benchmarkReturns = null;
        const benchSym = 'SPY';
        const benchCloses = await getClosesFor(benchSym);
        if (benchCloses && benchCloses.length > 30) {
            benchmarkReturns = QE.closesToReturns(benchCloses);
        }

        return {
            tickers: validTickers, weights, sharesByTicker, livePrices, sectors,
            totalValue, closesPerTicker, benchmarkReturns, skipped,
        };
    }

    // ── 3. Rendu HTML : KPI Cards ────────────────────────────────────────
    function renderKpiCards(rep, totalValue) {
        const kpi = (label, val, sub = '', color = '') => `
          <div class="qe-kpi" style="${color ? `border-left:3px solid ${color}` : ''}">
            <div class="qe-kpi-label">${label}</div>
            <div class="qe-kpi-val">${val}</div>
            ${sub ? `<div class="qe-kpi-sub">${sub}</div>` : ''}
          </div>`;
        const annRet = rep.annualReturn || 0;
        const annVol = rep.annualVolatility || 0;
        return `
          <div class="qe-kpi-grid">
            ${kpi('Total Value', fmtMoney(totalValue))}
            ${kpi('Annual Return', fmtPct(annRet, 1), '', annRet >= 0 ? '#3fb37f' : '#e74c3c')}
            ${kpi('Annual Volatility', fmtPct(annVol, 1), '', '#e0a93b')}
            ${kpi('Sharpe Ratio', fmtNum(rep.sharpe, 2),
                  rep.sharpe > 1 ? 'Excellent' : rep.sharpe > 0.5 ? 'Bon' : 'Faible',
                  rep.sharpe > 1 ? '#3fb37f' : rep.sharpe > 0.5 ? '#e0a93b' : '#e74c3c')}
            ${kpi('Sortino Ratio', isFinite(rep.sortino) ? fmtNum(rep.sortino, 2) : '∞',
                  'Risque downside seul')}
            ${kpi('Max Drawdown',
                  fmtPct(rep.maxDrawdown, 2),
                  rep.durationDays ? `${rep.durationDays} jours` : '',
                  rep.maxDrawdown < -0.20 ? '#e74c3c' : rep.maxDrawdown < -0.10 ? '#e0a93b' : '#3fb37f')}
            ${kpi('VaR 95% (1 jour)', fmtPct(rep.var95Historical, 2),
                  'Historique', '#cc6666')}
            ${kpi('CVaR 95% (1 jour)', fmtPct(rep.cvar95, 2),
                  'Perte moy. au-delà de la VaR', '#aa3333')}
            ${kpi('VaR 99% (1 jour)', fmtPct(rep.var99Historical, 2), 'Historique')}
            ${kpi('CVaR 99% (1 jour)', fmtPct(rep.cvar99, 2), 'Tail risk extrême')}
            ${kpi('Skewness', fmtNum(rep.skewness, 2),
                  rep.skewness < -0.5 ? 'Asymétrie négative ⚠' :
                  rep.skewness > 0.5 ? 'Asymétrie positive' : 'Symétrique')}
            ${kpi('Kurtosis (excès)', fmtNum(rep.kurtosis, 2),
                  rep.kurtosis > 3 ? 'Queues épaisses ⚠' : 'Normal',
                  rep.kurtosis > 3 ? '#e0a93b' : '')}
            ${rep.beta != null ? kpi('Beta vs SPY', fmtNum(rep.beta, 2),
                  rep.beta > 1.2 ? 'Plus volatil' : rep.beta < 0.8 ? 'Défensif' : 'Marché') : ''}
            ${rep.alpha != null ? kpi('Alpha annualisé', fmtPct(rep.alpha, 2),
                  rep.alpha > 0 ? 'Surperformance' : 'Sous-performance',
                  rep.alpha >= 0 ? '#3fb37f' : '#e74c3c') : ''}
          </div>`;
    }

    // ── 4. Heatmap de corrélation (SVG) ──────────────────────────────────
    function renderCorrelationHeatmap(corr, tickers) {
        const n = tickers.length;
        const cell = 36, padLabel = 60;
        const w = padLabel + n * cell + 20, h = padLabel + n * cell + 20;
        let svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" style="font-family:system-ui,sans-serif;font-size:10px">`;
        // Labels haut
        tickers.forEach((t, j) => {
            const x = padLabel + j * cell + cell / 2, y = padLabel - 8;
            svg += `<text x="${x}" y="${y}" text-anchor="end" transform="rotate(-45 ${x} ${y})" fill="#bbb">${t}</text>`;
        });
        // Labels gauche
        tickers.forEach((t, i) => {
            svg += `<text x="${padLabel - 6}" y="${padLabel + i * cell + cell / 2 + 4}" text-anchor="end" fill="#bbb">${t}</text>`;
        });
        // Cellules
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                const v = corr[i][j];
                const x = padLabel + j * cell, y = padLabel + i * cell;
                const fill = colorFromValue(v, -1, 1);
                svg += `<rect x="${x}" y="${y}" width="${cell - 1}" height="${cell - 1}" fill="${fill}"/>`;
                svg += `<text x="${x + cell / 2}" y="${y + cell / 2 + 3}" text-anchor="middle" fill="#222" style="font-size:9px;font-weight:600">${v.toFixed(2)}</text>`;
            }
        }
        svg += `</svg>`;
        return svg;
    }

    // ── 5. Tableau de stress tests ───────────────────────────────────────
    function renderStressTests(weights, tickers, sectors) {
        const assetClass = {};
        tickers.forEach(t => assetClass[t] = QE.classifyTicker(t, sectors[t]));
        const results = QE.runAllStressTests(weights, tickers, assetClass);
        const rows = results.map(r => {
            const cls = r.impact < -0.10 ? 'critical' : r.impact < -0.05 ? 'warning' : '';
            return `<tr class="${cls}">
              <td>${r.label}</td>
              <td style="text-align:right;font-weight:600;color:${r.impact < 0 ? '#e74c3c' : '#3fb37f'}">${fmtPct(r.impact, 2)}</td>
            </tr>`;
        }).join('');
        const classifLines = tickers.map((t, i) =>
            `<span class="qe-pill">${t} → ${assetClass[t]}</span>`).join(' ');
        return `
          <div style="margin-bottom:8px;font-size:11px;color:var(--text3,#888)">
            Classification heuristique : ${classifLines}
          </div>
          <table class="qe-table">
            <thead><tr><th>Scénario</th><th style="text-align:right">Impact estimé</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>`;
    }

    // ── 6. Alertes ───────────────────────────────────────────────────────
    function renderAlerts(alerts) {
        if (!alerts.length) {
            return `<div class="qe-alert info">✓ Aucune alerte active. Le portefeuille est dans les seuils définis.</div>`;
        }
        return alerts.map(a => `
          <div class="qe-alert ${a.level}">
            <span class="qe-alert-tag">${a.level.toUpperCase()}</span>
            <span class="qe-alert-type">${a.type.replace('_', ' ')}</span>
            <span class="qe-alert-msg">${a.message}</span>
          </div>`).join('');
    }

    // ── 7. Aperçu de rééquilibrage ───────────────────────────────────────
    // Priorité 1 : cible issue de l'AI Optimizer (window.__aioLastResult)
    // Priorité 2 : équipondérée (fallback)
    function renderRebalancePreview(dataset) {
        const { tickers, sharesByTicker, livePrices, totalValue } = dataset;

        const aio = (typeof window !== 'undefined') ? window.__aioLastResult : null;
        let target = {};
        let source = 'equal-weight';
        let sourceLabel = 'équipondérée (lance l\'AI Optimizer pour une cible optimisée)';

        if (aio && Array.isArray(aio.tickers) && Array.isArray(aio.weights)) {
            // Mapper les poids AI sur les tickers du Risk dataset
            const aiMap = {};
            aio.tickers.forEach((t, i) => { aiMap[t] = aio.weights[i]; });
            let sum = 0;
            tickers.forEach(t => { if (aiMap[t] != null) sum += aiMap[t]; });
            if (sum > 0) {
                tickers.forEach(t => { target[t] = (aiMap[t] != null ? aiMap[t] / sum : 0); });
                const ageSec = ((Date.now() - (aio.timestamp || 0)) / 1000) | 0;
                source = 'ai-optimizer';
                sourceLabel = `AI Optimizer ensemble (cible calculée il y a ${ageSec}s)`;
            }
        }
        if (source === 'equal-weight') {
            tickers.forEach(t => target[t] = 1 / tickers.length);
        }

        const result = QE.generateRebalanceOrders({
            currentHoldings: sharesByTicker, targetWeights: target,
            livePrices, totalValue, costBps: 10, tolerance: 0.05,
        });

        if (result.action === 'skip') {
            return `<div class="qe-alert info">✓ ${result.reason}. Pas de trade nécessaire.<br><span style="font-size:11px;opacity:.7">Cible : ${sourceLabel}</span></div>`;
        }
        const rows = result.orders.map(o => `
          <tr>
            <td><strong>${o.ticker}</strong></td>
            <td><span class="qe-pill ${o.side === 'BUY' ? 'buy' : 'sell'}">${o.side}</span></td>
            <td style="text-align:right">${o.shares.toFixed(2)}</td>
            <td style="text-align:right">${fmtMoney(o.price)}</td>
            <td style="text-align:right">${fmtMoney(o.value)}</td>
            <td style="text-align:right">${fmtMoney(o.cost)}</td>
          </tr>`).join('');
        const badgeColor = source === 'ai-optimizer' ? '#3fb37f' : '#888';
        return `
          <div style="margin-bottom:8px;font-size:11px;color:var(--text3,#888)">
            <span style="display:inline-block;padding:2px 8px;border-radius:3px;background:rgba(63,179,127,.12);color:${badgeColor};margin-right:6px">
              ${source === 'ai-optimizer' ? '⚡ AI Optimizer' : '≡ Équipondérée'}
            </span>
            Cible : ${sourceLabel}. Coût total estimé : <strong>${fmtMoney(result.totalCost)}</strong>
            (${result.orders.length} ordres, bandes 5%, frais 10 bps).
          </div>
          <table class="qe-table">
            <thead><tr><th>Ticker</th><th>Sens</th><th style="text-align:right">Quantité</th>
              <th style="text-align:right">Prix</th><th style="text-align:right">Valeur</th>
              <th style="text-align:right">Coût</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>`;
    }

    // ── 8. Composition + poids actuels ───────────────────────────────────
    function renderComposition(dataset) {
        const { tickers, weights, sharesByTicker, livePrices, sectors } = dataset;
        const rows = tickers.map((t, i) => `
          <tr>
            <td><strong>${t}</strong></td>
            <td>${sectors[t]}</td>
            <td style="text-align:right">${sharesByTicker[t]}</td>
            <td style="text-align:right">${fmtMoney(livePrices[t])}</td>
            <td style="text-align:right">
              <div class="qe-bar"><div class="qe-bar-fill" style="width:${(weights[i] * 100).toFixed(1)}%"></div></div>
              ${(weights[i] * 100).toFixed(1)}%
            </td>
          </tr>`).join('');
        return `
          <table class="qe-table">
            <thead><tr><th>Ticker</th><th>Secteur</th><th style="text-align:right">Parts</th>
              <th style="text-align:right">Prix</th><th style="text-align:right">Poids</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>`;
    }

    // ── 9. RENDU PRINCIPAL ───────────────────────────────────────────────
    async function renderRiskAnalytics() {
        const host = document.getElementById(HOST_ID);
        if (!host) return;
        host.innerHTML = `
          <div class="qe-loader">
            <div class="qe-spinner"></div>
            <div>Calcul des métriques de risque…</div>
          </div>`;

        if (typeof QE === 'undefined') {
            host.innerHTML = `<div class="qe-alert critical">QuantEdge Engine non chargé. Vérifie que <code>quantedge-engine.js</code> est bien inclus dans index.html.</div>`;
            return;
        }

        const dataset = await buildPortfolioDataset();
        if (dataset.error) {
            host.innerHTML = `<div class="qe-alert warning">${dataset.error}</div>`;
            return;
        }

        const { tickers, weights, closesPerTicker, benchmarkReturns,
                totalValue, sectors, skipped } = dataset;

        // Calculs principaux
        const equity = QE.portfolioEquityCurve(closesPerTicker, weights, 100);
        const portRet = QE.portfolioDailyReturns(closesPerTicker, weights);
        const rep = QE.riskReport(equity, portRet, benchmarkReturns);
        const returnArrays = closesPerTicker.map(QE.closesToReturns);
        const cov = QE.covMat(returnArrays);
        const corr = QE.corrMat(cov);
        const alerts = QE.evaluateAlerts({
            equity, returns: portRet, weights, tickers,
            maxDDThreshold: -0.15, volThreshold: 0.30,
            concentrationThreshold: 0.30, varThreshold: -0.05,
        });

        lastRender = { dataset, equity, portRet, rep, cov, corr, alerts };

        // Construction du HTML
        const skipNote = skipped.length ?
            `<div style="font-size:11px;color:#e0a93b;margin-bottom:12px">⚠ Tickers sans historique exploitable, exclus du calcul : ${skipped.join(', ')}</div>` : '';

        host.innerHTML = `
          <div class="qe-section">
            <div class="qe-section-head">
              <h3>📊 Risk Metrics — vraies valeurs (pas vol×1.5)</h3>
              <button class="qe-btn-refresh" onclick="window.renderRiskAnalytics()">↻ Recalculer</button>
            </div>
            ${skipNote}
            ${renderKpiCards(rep, totalValue)}
          </div>

          <div class="qe-section">
            <div class="qe-section-head"><h3>🚨 Alertes précoces</h3></div>
            <div class="qe-alerts-list">${renderAlerts(alerts)}</div>
          </div>

          <div class="qe-grid-2">
            <div class="qe-section">
              <div class="qe-section-head"><h3>🔥 Stress tests paramétriques</h3></div>
              ${renderStressTests(weights, tickers, sectors)}
            </div>
            <div class="qe-section">
              <div class="qe-section-head"><h3>📉 Composition actuelle</h3></div>
              ${renderComposition(dataset)}
            </div>
          </div>

          <div class="qe-section">
            <div class="qe-section-head"><h3>🌐 Matrice de corrélation</h3></div>
            <div style="overflow:auto">${renderCorrelationHeatmap(corr, tickers)}</div>
            <div style="font-size:11px;color:var(--text3,#888);margin-top:8px">
              Bleu = corrélation positive forte (peu de diversification). Rouge = corrélation négative (diversification utile).
            </div>
          </div>

          <div class="qe-section">
            <div class="qe-section-head"><h3>♻️ Aperçu de rééquilibrage</h3></div>
            ${renderRebalancePreview(dataset)}
          </div>

          <div class="qe-section" id="qe-ml-section">
            <div class="qe-section-head">
              <h3>🧠 Prévisions ML & Sentiment <span style="font-size:10px;color:var(--text3);font-weight:normal">microservice Python</span></h3>
              <button class="qe-btn-refresh" onclick="window.renderMLPanel && window.renderMLPanel()">↻ Recharger</button>
            </div>
            <div id="qe-ml-body">
              <div style="font-size:12px;color:var(--text3,#888)">Chargement…</div>
            </div>
          </div>

          <div class="qe-footer-note">
            QuantEdge Engine v1 — drawdown réel, VaR/CVaR historiques, stress tests paramétriques.
            Pour brancher un modèle ML (LSTM volatilité, sentiment NLP) ou un Black-Litterman avec vues custom,
            utilise <code>QE.blackLitterman(...)</code> depuis la console.
          </div>`;
    }

    // ── 9.5 Panneau ML (microservice Python) ─────────────────────────────
    async function postJSON(url, payload) {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    }

    async function renderMLPanel() {
        const body = document.getElementById('qe-ml-body');
        if (!body) return;
        if (!lastRender?.dataset) {
            body.innerHTML = `<div class="qe-alert warning">Charge d'abord l'onglet Risk (re-clique dessus).</div>`;
            return;
        }
        body.innerHTML = `<div class="qe-loader" style="padding:20px"><div class="qe-spinner"></div><div>Appel du microservice ML…</div></div>`;

        // 1) Ping santé
        let health = null;
        try {
            const h = await fetch('/api/ml/health');
            health = await h.json();
        } catch (_) {
            body.innerHTML = `
              <div class="qe-alert critical">
                ❌ Microservice Python indisponible.<br>
                Lance-le dans un terminal séparé :<br>
                <code>cd ml-service && ./run.sh</code>
              </div>`;
            return;
        }

        // 2) Volatilité portefeuille
        const portRet = lastRender.portRet;
        let volResult = null;
        try {
            volResult = await postJSON('/api/ml/forecast/volatility', {
                ticker: 'PORTFOLIO', returns: portRet, use_lstm: true,
            });
        } catch (e) { volResult = { error: e.message }; }

        // 3) Volatilité des 3 plus grosses positions
        const ds = lastRender.dataset;
        const topIdx = ds.weights
            .map((w, i) => ({ w, i }))
            .sort((a, b) => b.w - a.w)
            .slice(0, 3)
            .map(o => o.i);
        const perTicker = await Promise.all(topIdx.map(async (i) => {
            try {
                const rets = QE.closesToReturns(ds.closesPerTicker[i]);
                const r = await postJSON('/api/ml/forecast/volatility', {
                    ticker: ds.tickers[i], returns: rets, use_lstm: true,
                });
                return { ticker: ds.tickers[i], ...r };
            } catch (e) { return { ticker: ds.tickers[i], error: e.message }; }
        }));

        // 4) Rendu
        const backendBadge = (b) => {
            const color = b === 'lstm+ewma' ? '#3fb37f' : (b === 'ewma' ? '#d4a843' : '#888');
            return `<span style="font-size:10px;padding:2px 6px;border-radius:3px;background:${color}22;color:${color};font-weight:600">${b || '?'}</span>`;
        };
        const pct = (v) => (v == null || isNaN(v)) ? '–' : (v * 100).toFixed(1) + '%';

        const portHtml = volResult.error ? `
            <div class="qe-alert warning">Vol portefeuille : ${volResult.error}</div>
        ` : `
          <div class="qe-kpi-grid" style="grid-template-columns:repeat(3,1fr)">
            <div class="qe-kpi">
              <div class="qe-kpi-label">EWMA (RiskMetrics)</div>
              <div class="qe-kpi-val">${pct(volResult.ewma?.sigma_annual)}</div>
              <div class="qe-kpi-sub">vol annualisée, λ=0.94</div>
            </div>
            <div class="qe-kpi">
              <div class="qe-kpi-label">LSTM forecast</div>
              <div class="qe-kpi-val">${volResult.lstm ? pct(volResult.lstm.sigma_annual) : '—'}</div>
              <div class="qe-kpi-sub">${volResult.lstm ? 'loss: ' + volResult.lstm.final_loss.toExponential(2) : (volResult.lstm_unavailable_reason || 'LSTM non dispo')}</div>
            </div>
            <div class="qe-kpi">
              <div class="qe-kpi-label">Backend</div>
              <div class="qe-kpi-val" style="font-size:14px">${backendBadge(volResult.backend)}</div>
              <div class="qe-kpi-sub">${volResult.n_obs} obs</div>
            </div>
          </div>`;

        const tickerRows = perTicker.map(r => {
            if (r.error) return `<tr><td><strong>${r.ticker}</strong></td><td colspan="4" style="color:#e74c3c">${r.error}</td></tr>`;
            return `<tr>
              <td><strong>${r.ticker}</strong></td>
              <td style="text-align:right">${pct(r.ewma?.sigma_annual)}</td>
              <td style="text-align:right">${r.lstm ? pct(r.lstm.sigma_annual) : '—'}</td>
              <td style="text-align:right">${r.n_obs || '–'}</td>
              <td>${backendBadge(r.backend)}</td>
            </tr>`;
        }).join('');

        const sentHtml = `
          <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
            <input id="qe-sent-input" class="qe-input" placeholder="Colle 1 à N titres d'actualité (1 par ligne) ou clique « Charger depuis Finnhub »"
              style="flex:1;min-width:220px;padding:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:6px;color:var(--text1,#fff);font-size:12px"/>
            <button class="qe-btn-refresh" onclick="window.loadFinnhubHeadlines && window.loadFinnhubHeadlines()" title="Récupère les titres de news pour vos positions via Finnhub">📰 Finnhub</button>
            <button class="qe-btn-refresh" onclick="window.runSentiment && window.runSentiment()">📊 Analyser (FinBERT)</button>
          </div>
          <div id="qe-finnhub-agg" style="font-size:11px;color:var(--text3,#888);margin-bottom:8px"></div>
          <div id="qe-sent-result" style="font-size:12px;color:var(--text3,#888)">
            Astuce : clique « 📰 Finnhub » pour auto-remplir avec les titres récents de tes positions, puis « 📊 Analyser » pour scorer via FinBERT.
          </div>`;

        body.innerHTML = `
          <div style="font-size:11px;color:var(--text3,#888);margin-bottom:10px">
            Microservice : <code>${health?.status || '?'}</code> · torch=${health?.torch ? '✓' : '✗'} · finbert=${health?.finbert ? '✓' : '✗'}
          </div>

          <h4 style="margin:10px 0 8px;font-size:12px;color:var(--text2,#ccc)">📊 Volatilité portefeuille</h4>
          ${portHtml}

          <h4 style="margin:16px 0 8px;font-size:12px;color:var(--text2,#ccc)">🎯 Top 3 positions — vol LSTM vs EWMA</h4>
          <table class="qe-table">
            <thead><tr><th>Ticker</th><th style="text-align:right">EWMA σ</th>
              <th style="text-align:right">LSTM σ</th><th style="text-align:right">N obs</th><th>Backend</th></tr></thead>
            <tbody>${tickerRows}</tbody>
          </table>

          <h4 style="margin:16px 0 8px;font-size:12px;color:var(--text2,#ccc)">💬 Analyse de sentiment (FinBERT / lexique)</h4>
          ${sentHtml}`;
    }

    window.renderMLPanel = renderMLPanel;

    // Handler pour le bouton Analyser sentiment
    window.runSentiment = async function () {
        const inp = document.getElementById('qe-sent-input');
        const out = document.getElementById('qe-sent-result');
        if (!inp || !out) return;
        const texts = inp.value.split('\n').map(s => s.trim()).filter(Boolean);
        if (!texts.length) { out.textContent = 'Saisis au moins 1 titre.'; return; }
        out.innerHTML = `<div class="qe-spinner" style="display:inline-block"></div> Analyse…`;
        try {
            const r = await postJSON('/api/ml/sentiment', { texts, prefer_bert: true });
            const color = r.label === 'positive' ? '#3fb37f'
                : r.label === 'negative' ? '#e74c3c' : '#d4a843';
            out.innerHTML = `
              <div style="margin-bottom:8px">
                <span style="padding:4px 10px;border-radius:4px;background:${color}22;color:${color};font-weight:600">
                  ${r.label?.toUpperCase()} · score ${r.avg_score.toFixed(3)}
                </span>
                <span style="margin-left:8px;font-size:10px;color:var(--text3,#888)">
                  backend=${r.backend} · ${r.n} textes
                </span>
              </div>
              <table class="qe-table">
                <thead><tr><th>Texte</th><th style="text-align:right">Score</th></tr></thead>
                <tbody>${r.items.map(it => `
                  <tr><td>${it.text}</td>
                    <td style="text-align:right;color:${it.score >= 0 ? '#3fb37f' : '#e74c3c'}">${it.score.toFixed(3)}</td></tr>
                `).join('')}</tbody>
              </table>`;
        } catch (e) {
            out.innerHTML = `<div class="qe-alert warning">Erreur : ${e.message}</div>`;
        }
    };

    // ── Finnhub headlines + sentiment aggregé ─────────────────────────────
    window.loadFinnhubHeadlines = async function () {
        const inp = document.getElementById('qe-sent-input');
        const out = document.getElementById('qe-sent-result');
        const agg = document.getElementById('qe-finnhub-agg');
        if (!inp || !out || !agg) return;

        const port = (typeof portfolio !== 'undefined' && Array.isArray(portfolio) ? portfolio : [])
            .slice().sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 5);
        if (!port.length) {
            out.innerHTML = '<div class="qe-alert warning">Aucune position dans le portefeuille.</div>';
            return;
        }

        agg.innerHTML = '<div class="qe-spinner" style="display:inline-block"></div> Récupération Finnhub…';
        out.innerHTML = '';

        const results = await Promise.allSettled(port.map(async p => {
            const [newsResp, sentResp] = await Promise.all([
                fetch(`/api/finnhub/news/${encodeURIComponent(p.ticker)}?days=7`).then(r => r.ok ? r.json() : null).catch(() => null),
                fetch(`/api/finnhub/news-sentiment/${encodeURIComponent(p.ticker)}`).then(r => r.ok ? r.json() : null).catch(() => null),
            ]);
            const newsList = Array.isArray(newsResp?.items) ? newsResp.items
                           : Array.isArray(newsResp) ? newsResp : [];
            return { ticker: p.ticker, news: newsList.slice(0, 4), sent: sentResp };
        }));

        const headlines = [];
        const aggRows = [];
        for (const r of results) {
            if (r.status !== 'fulfilled') continue;
            const { ticker, news, sent } = r.value;
            news.forEach(n => { if (n?.headline) headlines.push(n.headline); });

            // Serveur aplati : {bullish_percent, bearish_percent, buzz_articles, ...}
            const buzz = sent?.buzz_articles ?? sent?.buzz_weeklyAverage ?? null;
            const bullPct = sent?.bullish_percent;
            const bearPct = sent?.bearish_percent;
            const score = (bullPct != null && bearPct != null) ? (bullPct - bearPct) : null;
            let color = '#d4a843', label = 'neutre';
            if (score != null) {
                if (score > 0.15) { color = '#3fb37f'; label = 'bullish'; }
                else if (score < -0.15) { color = '#e74c3c'; label = 'bearish'; }
            }
            aggRows.push(`
                <tr>
                    <td><strong>${ticker}</strong></td>
                    <td style="text-align:right">${buzz != null ? (+buzz).toFixed(0) : '—'}</td>
                    <td style="text-align:right;color:${color}">${score != null ? (score * 100).toFixed(1) + '%' : '—'}</td>
                    <td style="color:${color};text-transform:uppercase;font-weight:600;font-size:10px">${score != null ? label : '—'}</td>
                </tr>`);
        }

        if (headlines.length) {
            inp.value = headlines.slice(0, 15).join('\n');
            out.innerHTML = `<span style="color:#3fb37f">✓</span> ${headlines.length} titres chargés depuis Finnhub. Clique « 📊 Analyser » pour scorer via FinBERT.`;
        } else {
            out.innerHTML = '<div class="qe-alert warning">Aucun titre Finnhub disponible (clé manquante ou rate limit). Colle des titres manuellement.</div>';
        }

        if (aggRows.length) {
            agg.innerHTML = `
                <div style="margin-bottom:4px;font-weight:600;color:var(--text2,#ccc)">🎯 Score agrégé Finnhub (bullish − bearish) · buzz = articles/semaine</div>
                <table class="qe-table" style="font-size:11px">
                    <thead><tr><th>Ticker</th><th style="text-align:right">Buzz</th><th style="text-align:right">Score</th><th>Label</th></tr></thead>
                    <tbody>${aggRows.join('')}</tbody>
                </table>`;
        } else {
            agg.innerHTML = '<span style="color:var(--text3,#888)">Pas de score Finnhub disponible.</span>';
        }
    };

    // Auto-chargement du panneau ML dès que le rendu principal est fait
    const _origRender = renderRiskAnalytics;
    async function renderRiskAnalyticsWithML() {
        await _origRender();
        // Déclenche le ML panel en arrière-plan (non-bloquant)
        setTimeout(() => { try { renderMLPanel(); } catch (_) {} }, 100);
    }

    // ── 10. Exposition + auto-init si l'onglet est actif ─────────────────
    window.renderRiskAnalytics = renderRiskAnalyticsWithML;

    // Re-render auto quand l'AI Optimizer pousse de nouveaux poids cibles
    window.addEventListener('aio:optimized', () => {
        if (document.getElementById('tab-risk')?.classList.contains('active')) {
            renderRiskAnalytics();
        }
    });

    // Hook : étend switchTab pour reconnaître 'risk' (si app3.js déjà chargé)
    document.addEventListener('DOMContentLoaded', () => {
        const origSwitch = window.switchTab;
        if (typeof origSwitch === 'function') {
            window.switchTab = function (tab) {
                if (tab === 'risk') {
                    document.querySelectorAll('.tab').forEach(t =>
                        t.classList.toggle('active',
                            t.getAttribute('onclick')?.includes("'risk'")));
                    document.querySelectorAll('.tab-pane').forEach(p =>
                        p.classList.remove('active'));
                    document.getElementById('tab-risk')?.classList.add('active');
                    setTimeout(renderRiskAnalytics, 50);
                    return;
                }
                origSwitch(tab);
            };
        }
    });
})();
