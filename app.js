// =============================================
// DATA & STATE
// =============================================
const SECTORS = ['Tech', 'Healthcare', 'Finance', 'Energy', 'Consumer', 'Real Estate', 'Industrials', 'Materials', 'Utilities'];
const COLORS = ['#d4a843', '#00d4b1', '#4d9fff', '#a855f7', '#ff4d6d', '#ff8c42', '#58d68d', '#85c1e9', '#f1948a'];

const STOCKS_DB = [
    // ─── Tech (8) ───────────────────────────────────────────────────────
    { sym: 'AAPL', name: 'Apple Inc.', sector: 'Tech', price: 182.5, change: 1.2, color: '#d4a843', pe: 28.5, pb: 45.2, ps: 7.5, ev: 22.1, roe: 156.0, roa: 22.5, margin: 25.3, de: 1.4, cr: 0.99, fcf: 4.2, div: 0.5, beta: 1.28 },
    { sym: 'MSFT', name: 'Microsoft Corp.', sector: 'Tech', price: 378.9, change: 0.8, color: '#00d4b1', pe: 35.2, pb: 12.5, ps: 12.1, ev: 24.3, roe: 39.1, roa: 19.4, margin: 36.2, de: 0.4, cr: 1.2, fcf: 3.8, div: 0.7, beta: 0.90 },
    { sym: 'NVDA', name: 'NVIDIA Corp.', sector: 'Tech', price: 495.2, change: 3.1, color: '#4d9fff', pe: 75.4, pb: 32.1, ps: 28.5, ev: 55.2, roe: 75.3, roa: 35.1, margin: 42.1, de: 0.2, cr: 3.5, fcf: 1.5, div: 0.05, beta: 1.70 },
    { sym: 'GOOGL', name: 'Alphabet Inc.', sector: 'Tech', price: 140.3, change: -0.4, color: '#a855f7', pe: 25.1, pb: 6.5, ps: 6.2, ev: 16.5, roe: 27.5, roa: 18.2, margin: 24.1, de: 0.1, cr: 2.1, fcf: 4.5, div: 0.0, beta: 1.05 },
    { sym: 'META', name: 'Meta Platforms', sector: 'Tech', price: 352.1, change: 2.1, color: '#ff8c42', pe: 32.1, pb: 7.1, ps: 8.2, ev: 20.1, roe: 24.3, roa: 16.7, margin: 28.4, de: 0.1, cr: 2.5, fcf: 5.1, div: 0.0, beta: 1.20 },
    { sym: 'TSLA', name: 'Tesla Inc.', sector: 'Tech', price: 245.8, change: -1.8, color: '#ff4d6d', pe: 65.2, pb: 11.2, ps: 7.5, ev: 45.1, roe: 22.5, roa: 12.1, margin: 11.5, de: 0.1, cr: 1.7, fcf: 1.2, div: 0.0, beta: 2.10 },
    { sym: 'AVGO', name: 'Broadcom Inc.', sector: 'Tech', price: 1385.0, change: 1.6, color: '#58d68d', pe: 38.5, pb: 18.0, ps: 14.5, ev: 26.0, roe: 60.0, roa: 20.0, margin: 35.0, de: 1.6, cr: 2.0, fcf: 4.0, div: 1.5, beta: 1.15 },
    { sym: 'AMD', name: 'Advanced Micro Devices', sector: 'Tech', price: 138.4, change: 2.4, color: '#85c1e9', pe: 48.0, pb: 3.8, ps: 7.0, ev: 28.0, roe: 7.0, roa: 4.5, margin: 7.0, de: 0.1, cr: 2.5, fcf: 2.0, div: 0.0, beta: 1.60 },

    // ─── Healthcare (8) ─────────────────────────────────────────────────
    { sym: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare', price: 158.7, change: -0.2, color: '#f1948a', pe: 32.1, pb: 5.2, ps: 4.5, ev: 15.2, roe: 25.1, roa: 12.5, margin: 16.5, de: 0.5, cr: 1.1, fcf: 4.5, div: 3.0, beta: 0.55 },
    { sym: 'UNH', name: 'UnitedHealth Group', sector: 'Healthcare', price: 527.3, change: 0.9, color: '#a855f7', pe: 21.5, pb: 5.8, ps: 1.3, ev: 14.5, roe: 28.5, roa: 8.5, margin: 6.1, de: 0.7, cr: 0.8, fcf: 5.5, div: 1.5, beta: 0.70 },
    { sym: 'LLY', name: 'Eli Lilly & Co.', sector: 'Healthcare', price: 765.0, change: 1.5, color: '#d4a843', pe: 62.0, pb: 55.0, ps: 16.0, ev: 45.0, roe: 85.0, roa: 15.0, margin: 22.0, de: 2.0, cr: 1.2, fcf: 3.0, div: 0.7, beta: 0.40 },
    { sym: 'PFE', name: 'Pfizer Inc.', sector: 'Healthcare', price: 28.6, change: -0.3, color: '#00d4b1', pe: 12.5, pb: 1.6, ps: 2.1, ev: 9.5, roe: 8.0, roa: 3.5, margin: 15.0, de: 0.5, cr: 1.3, fcf: 6.5, div: 6.0, beta: 0.65 },
    { sym: 'MRK', name: 'Merck & Co.', sector: 'Healthcare', price: 128.3, change: 0.4, color: '#4d9fff', pe: 18.5, pb: 6.5, ps: 5.0, ev: 12.5, roe: 30.0, roa: 14.0, margin: 24.0, de: 0.7, cr: 1.3, fcf: 5.2, div: 2.5, beta: 0.50 },
    { sym: 'ABBV', name: 'AbbVie Inc.', sector: 'Healthcare', price: 175.5, change: 0.6, color: '#ff8c42', pe: 22.0, pb: 55.0, ps: 5.5, ev: 14.0, roe: 120.0, roa: 10.0, margin: 22.0, de: 4.5, cr: 0.9, fcf: 6.8, div: 3.5, beta: 0.55 },
    { sym: 'TMO', name: 'Thermo Fisher', sector: 'Healthcare', price: 548.0, change: 0.7, color: '#ff4d6d', pe: 36.0, pb: 5.0, ps: 4.8, ev: 20.0, roe: 14.0, roa: 7.0, margin: 15.0, de: 0.7, cr: 1.7, fcf: 4.5, div: 0.3, beta: 0.85 },
    { sym: 'ABT', name: 'Abbott Laboratories', sector: 'Healthcare', price: 112.5, change: 0.2, color: '#58d68d', pe: 29.0, pb: 4.8, ps: 5.0, ev: 16.5, roe: 16.5, roa: 8.5, margin: 14.0, de: 0.5, cr: 1.5, fcf: 4.0, div: 1.9, beta: 0.65 },

    // ─── Finance (8) ────────────────────────────────────────────────────
    { sym: 'JPM', name: 'JPMorgan Chase', sector: 'Finance', price: 192.4, change: 0.3, color: '#85c1e9', pe: 11.5, pb: 1.7, ps: 3.2, ev: 8.5, roe: 15.5, roa: 1.2, margin: 32.1, de: 2.5, cr: 1.0, fcf: 0.0, div: 2.5, beta: 1.10 },
    { sym: 'BAC', name: 'Bank of America', sector: 'Finance', price: 34.2, change: -0.7, color: '#4d9fff', pe: 10.2, pb: 1.1, ps: 2.5, ev: 8.1, roe: 10.5, roa: 0.9, margin: 28.5, de: 2.1, cr: 1.0, fcf: 0.0, div: 2.8, beta: 1.35 },
    { sym: 'V', name: 'Visa Inc.', sector: 'Finance', price: 268.4, change: 0.7, color: '#58d68d', pe: 31.5, pb: 15.2, ps: 16.5, ev: 25.5, roe: 45.2, roa: 22.5, margin: 52.5, de: 0.5, cr: 1.5, fcf: 4.5, div: 0.7, beta: 0.95 },
    { sym: 'MA', name: 'Mastercard', sector: 'Finance', price: 434.7, change: 0.4, color: '#85c1e9', pe: 35.5, pb: 65.2, ps: 18.5, ev: 28.5, roe: 155.2, roa: 28.5, margin: 45.5, de: 2.5, cr: 1.2, fcf: 3.5, div: 0.5, beta: 1.10 },
    { sym: 'WFC', name: 'Wells Fargo', sector: 'Finance', price: 58.7, change: 0.5, color: '#d4a843', pe: 11.8, pb: 1.3, ps: 2.7, ev: 8.0, roe: 11.5, roa: 1.0, margin: 25.0, de: 1.5, cr: 1.0, fcf: 0.0, div: 2.4, beta: 1.20 },
    { sym: 'GS', name: 'Goldman Sachs', sector: 'Finance', price: 388.0, change: 0.6, color: '#00d4b1', pe: 14.0, pb: 1.4, ps: 2.6, ev: 10.0, roe: 10.0, roa: 0.8, margin: 22.0, de: 5.5, cr: 1.0, fcf: 0.0, div: 2.9, beta: 1.30 },
    { sym: 'MS', name: 'Morgan Stanley', sector: 'Finance', price: 94.0, change: 0.4, color: '#a855f7', pe: 16.0, pb: 1.7, ps: 2.9, ev: 11.0, roe: 11.0, roa: 1.0, margin: 25.0, de: 3.5, cr: 1.0, fcf: 0.0, div: 3.6, beta: 1.30 },
    { sym: 'BLK', name: 'BlackRock Inc.', sector: 'Finance', price: 785.0, change: 0.8, color: '#ff8c42', pe: 22.0, pb: 3.0, ps: 7.5, ev: 16.0, roe: 14.0, roa: 5.5, margin: 30.0, de: 0.4, cr: 2.5, fcf: 3.5, div: 2.6, beta: 1.25 },

    // ─── Energy (8) ─────────────────────────────────────────────────────
    { sym: 'XOM', name: 'ExxonMobil', sector: 'Energy', price: 108.3, change: 1.4, color: '#d4a843', pe: 10.5, pb: 2.1, ps: 1.2, ev: 6.5, roe: 22.1, roa: 11.5, margin: 11.2, de: 0.2, cr: 1.5, fcf: 8.5, div: 3.5, beta: 1.15 },
    { sym: 'CVX', name: 'Chevron Corp.', sector: 'Energy', price: 153.0, change: 0.9, color: '#00d4b1', pe: 13.5, pb: 1.8, ps: 1.3, ev: 7.0, roe: 14.0, roa: 8.5, margin: 9.5, de: 0.2, cr: 1.3, fcf: 7.5, div: 4.0, beta: 1.10 },
    { sym: 'COP', name: 'ConocoPhillips', sector: 'Energy', price: 117.5, change: 1.2, color: '#4d9fff', pe: 12.0, pb: 2.8, ps: 2.3, ev: 5.5, roe: 23.0, roa: 12.0, margin: 19.0, de: 0.4, cr: 1.4, fcf: 6.0, div: 2.1, beta: 1.25 },
    { sym: 'SLB', name: 'Schlumberger', sector: 'Energy', price: 48.2, change: -0.6, color: '#a855f7', pe: 15.0, pb: 3.0, ps: 1.8, ev: 9.0, roe: 20.0, roa: 9.0, margin: 12.0, de: 0.9, cr: 1.6, fcf: 3.5, div: 2.0, beta: 1.50 },
    { sym: 'EOG', name: 'EOG Resources', sector: 'Energy', price: 128.0, change: 0.8, color: '#ff4d6d', pe: 11.0, pb: 2.4, ps: 2.6, ev: 5.5, roe: 22.0, roa: 14.0, margin: 22.0, de: 0.2, cr: 2.7, fcf: 7.0, div: 3.0, beta: 1.30 },
    { sym: 'OXY', name: 'Occidental Petroleum', sector: 'Energy', price: 63.0, change: 1.6, color: '#ff8c42', pe: 14.5, pb: 2.4, ps: 2.0, ev: 7.0, roe: 17.0, roa: 7.5, margin: 14.0, de: 1.2, cr: 1.1, fcf: 7.5, div: 1.5, beta: 1.80 },
    { sym: 'PSX', name: 'Phillips 66', sector: 'Energy', price: 135.5, change: 0.7, color: '#58d68d', pe: 11.5, pb: 1.7, ps: 0.4, ev: 7.0, roe: 14.5, roa: 6.0, margin: 3.5, de: 0.6, cr: 1.3, fcf: 5.5, div: 3.5, beta: 1.20 },
    { sym: 'MPC', name: 'Marathon Petroleum', sector: 'Energy', price: 168.0, change: 1.0, color: '#85c1e9', pe: 9.5, pb: 2.3, ps: 0.4, ev: 6.0, roe: 27.0, roa: 10.0, margin: 4.5, de: 0.8, cr: 1.6, fcf: 8.5, div: 2.0, beta: 1.30 },

    // ─── Consumer (8) ───────────────────────────────────────────────────
    { sym: 'AMZN', name: 'Amazon.com', sector: 'Consumer', price: 178.2, change: 0.6, color: '#58d68d', pe: 58.1, pb: 8.5, ps: 3.1, ev: 25.4, roe: 14.2, roa: 5.5, margin: 5.2, de: 0.8, cr: 1.0, fcf: 2.1, div: 0.0, beta: 1.15 },
    { sym: 'WMT', name: 'Walmart Inc.', sector: 'Consumer', price: 167.9, change: 0.5, color: '#00d4b1', pe: 25.4, pb: 5.5, ps: 0.7, ev: 12.5, roe: 18.5, roa: 7.2, margin: 2.5, de: 0.8, cr: 0.8, fcf: 4.1, div: 1.4, beta: 0.50 },
    { sym: 'PG', name: "Procter & Gamble", sector: 'Consumer', price: 152.8, change: 0.1, color: '#ff8c42', pe: 25.1, pb: 8.2, ps: 4.5, ev: 18.5, roe: 32.5, roa: 12.5, margin: 17.5, de: 0.6, cr: 0.6, fcf: 4.8, div: 2.5, beta: 0.45 },
    { sym: 'HD', name: 'Home Depot', sector: 'Consumer', price: 342.5, change: 1.2, color: '#ff4d6d', pe: 22.5, pb: 210.5, ps: 2.5, ev: 16.5, roe: 1500.5, roa: 22.5, margin: 10.5, de: 35.1, cr: 1.3, fcf: 5.2, div: 2.5, beta: 0.95 },
    { sym: 'DIS', name: 'Walt Disney Co.', sector: 'Consumer', price: 92.3, change: -0.8, color: '#f1948a', pe: 45.5, pb: 1.8, ps: 2.1, ev: 15.5, roe: 4.5, roa: 2.5, margin: 4.5, de: 0.5, cr: 1.0, fcf: 2.5, div: 1.2, beta: 1.30 },
    { sym: 'KO', name: 'Coca-Cola', sector: 'Consumer', price: 60.1, change: 0.1, color: '#d4a843', pe: 25.0, pb: 10.0, ps: 6.0, ev: 19.0, roe: 40.0, roa: 10.0, margin: 22.0, de: 1.6, cr: 1.1, fcf: 4.0, div: 3.1, beta: 0.60 },
    { sym: 'MCD', name: "McDonald's", sector: 'Consumer', price: 283.0, change: 0.2, color: '#a855f7', pe: 24.0, pb: -15, ps: 8.0, ev: 17.0, roe: -50, roa: 14.0, margin: 32.0, de: -5, cr: 1.6, fcf: 4.0, div: 2.5, beta: 0.70 },
    { sym: 'NKE', name: 'Nike Inc.', sector: 'Consumer', price: 88.5, change: -0.9, color: '#4d9fff', pe: 22.0, pb: 9.5, ps: 2.5, ev: 15.0, roe: 38.0, roa: 16.0, margin: 11.5, de: 0.7, cr: 2.4, fcf: 3.5, div: 2.2, beta: 1.05 },

    // ─── Real Estate (8) — REITs + property ─────────────────────────────
    { sym: 'PLD', name: 'Prologis Inc.', sector: 'Real Estate', price: 108.0, change: 0.5, color: '#00d4b1', pe: 33.0, pb: 2.3, ps: 15.0, ev: 26.0, roe: 7.0, roa: 3.5, margin: 45.0, de: 0.6, cr: 0.5, fcf: 3.5, div: 3.5, beta: 1.00 },
    { sym: 'AMT', name: 'American Tower', sector: 'Real Estate', price: 195.0, change: 0.3, color: '#d4a843', pe: 42.0, pb: 35.0, ps: 8.0, ev: 22.0, roe: 85.0, roa: 4.5, margin: 19.0, de: 15.0, cr: 0.7, fcf: 4.0, div: 3.4, beta: 0.80 },
    { sym: 'EQIX', name: 'Equinix Inc.', sector: 'Real Estate', price: 775.0, change: 0.6, color: '#4d9fff', pe: 95.0, pb: 5.2, ps: 9.5, ev: 24.0, roe: 5.5, roa: 2.2, margin: 10.0, de: 1.8, cr: 1.6, fcf: 2.5, div: 2.4, beta: 0.70 },
    { sym: 'O', name: 'Realty Income Corp.', sector: 'Real Estate', price: 56.0, change: -0.2, color: '#a855f7', pe: 48.0, pb: 1.3, ps: 12.0, ev: 22.0, roe: 2.8, roa: 1.5, margin: 26.0, de: 0.8, cr: 2.0, fcf: 5.5, div: 5.7, beta: 0.85 },
    { sym: 'SPG', name: 'Simon Property Group', sector: 'Real Estate', price: 155.0, change: 0.8, color: '#ff4d6d', pe: 22.0, pb: 16.0, ps: 6.0, ev: 16.0, roe: 72.0, roa: 5.0, margin: 28.0, de: 7.5, cr: 2.0, fcf: 5.8, div: 4.9, beta: 1.45 },
    { sym: 'CCI', name: 'Crown Castle', sector: 'Real Estate', price: 105.0, change: -0.4, color: '#ff8c42', pe: 56.0, pb: 11.0, ps: 7.0, ev: 19.0, roe: 20.0, roa: 2.5, margin: 13.0, de: 4.5, cr: 0.5, fcf: 3.3, div: 6.0, beta: 0.85 },
    { sym: 'PSA', name: 'Public Storage', sector: 'Real Estate', price: 285.0, change: 0.3, color: '#58d68d', pe: 28.0, pb: 8.0, ps: 11.5, ev: 18.0, roe: 28.0, roa: 15.0, margin: 40.0, de: 1.0, cr: 0.4, fcf: 4.5, div: 4.2, beta: 0.70 },
    { sym: 'WELL', name: 'Welltower Inc.', sector: 'Real Estate', price: 98.0, change: 0.2, color: '#85c1e9', pe: 145.0, pb: 2.3, ps: 9.0, ev: 25.0, roe: 1.6, roa: 0.8, margin: 6.0, de: 0.8, cr: 1.5, fcf: 2.0, div: 2.5, beta: 0.90 },

    // ─── Industrials (8) ────────────────────────────────────────────────
    { sym: 'CAT', name: 'Caterpillar Inc.', sector: 'Industrials', price: 365.0, change: 0.6, color: '#d4a843', pe: 16.0, pb: 10.0, ps: 2.6, ev: 12.5, roe: 64.0, roa: 12.5, margin: 16.5, de: 2.3, cr: 1.3, fcf: 4.5, div: 1.5, beta: 1.00 },
    { sym: 'GE', name: 'GE Aerospace', sector: 'Industrials', price: 172.0, change: 1.1, color: '#00d4b1', pe: 39.0, pb: 8.5, ps: 3.3, ev: 25.0, roe: 23.0, roa: 4.5, margin: 9.0, de: 1.3, cr: 1.1, fcf: 2.5, div: 0.7, beta: 1.10 },
    { sym: 'HON', name: 'Honeywell Intl.', sector: 'Industrials', price: 215.0, change: 0.3, color: '#4d9fff', pe: 25.0, pb: 8.0, ps: 4.0, ev: 16.0, roe: 33.0, roa: 10.0, margin: 16.0, de: 1.2, cr: 1.4, fcf: 4.3, div: 2.0, beta: 0.95 },
    { sym: 'UNP', name: 'Union Pacific', sector: 'Industrials', price: 242.0, change: 0.4, color: '#a855f7', pe: 22.5, pb: 9.5, ps: 6.0, ev: 14.0, roe: 41.0, roa: 10.0, margin: 26.0, de: 2.0, cr: 0.8, fcf: 4.1, div: 2.2, beta: 1.00 },
    { sym: 'BA', name: 'Boeing Co.', sector: 'Industrials', price: 178.0, change: -1.3, color: '#ff4d6d', pe: -20.0, pb: -4.5, ps: 1.4, ev: 18.0, roe: 0.0, roa: -3.5, margin: -3.0, de: -5.0, cr: 1.1, fcf: 0.5, div: 0.0, beta: 1.50 },
    { sym: 'DE', name: 'Deere & Co.', sector: 'Industrials', price: 388.0, change: 0.5, color: '#ff8c42', pe: 14.0, pb: 5.5, ps: 2.6, ev: 13.0, roe: 38.0, roa: 9.0, margin: 18.0, de: 2.0, cr: 2.2, fcf: 4.5, div: 1.5, beta: 1.10 },
    { sym: 'LMT', name: 'Lockheed Martin', sector: 'Industrials', price: 455.0, change: 0.2, color: '#58d68d', pe: 18.5, pb: 19.0, ps: 1.7, ev: 13.0, roe: 105.0, roa: 11.0, margin: 9.5, de: 3.0, cr: 1.3, fcf: 4.5, div: 2.8, beta: 0.50 },
    { sym: 'RTX', name: 'RTX Corp.', sector: 'Industrials', price: 116.0, change: 0.4, color: '#85c1e9', pe: 33.0, pb: 2.4, ps: 2.2, ev: 14.0, roe: 7.0, roa: 3.0, margin: 6.5, de: 0.7, cr: 1.1, fcf: 3.5, div: 2.2, beta: 0.95 },

    // ─── Materials (8) ──────────────────────────────────────────────────
    { sym: 'LIN', name: 'Linde plc', sector: 'Materials', price: 465.0, change: 0.3, color: '#d4a843', pe: 32.0, pb: 4.7, ps: 7.0, ev: 18.0, roe: 15.0, roa: 8.0, margin: 22.0, de: 0.5, cr: 0.9, fcf: 3.5, div: 1.2, beta: 0.85 },
    { sym: 'SHW', name: 'Sherwin-Williams', sector: 'Materials', price: 325.0, change: 0.4, color: '#00d4b1', pe: 32.0, pb: 25.0, ps: 2.8, ev: 20.0, roe: 78.0, roa: 15.0, margin: 11.0, de: 3.5, cr: 0.9, fcf: 3.5, div: 0.9, beta: 1.10 },
    { sym: 'APD', name: 'Air Products', sector: 'Materials', price: 260.0, change: -0.2, color: '#4d9fff', pe: 23.0, pb: 3.6, ps: 5.0, ev: 15.0, roe: 15.0, roa: 7.0, margin: 21.0, de: 0.7, cr: 1.4, fcf: 3.5, div: 2.8, beta: 0.85 },
    { sym: 'ECL', name: 'Ecolab Inc.', sector: 'Materials', price: 240.0, change: 0.3, color: '#a855f7', pe: 40.0, pb: 8.0, ps: 5.2, ev: 22.0, roe: 20.0, roa: 6.5, margin: 13.0, de: 0.9, cr: 1.3, fcf: 3.3, div: 1.1, beta: 0.85 },
    { sym: 'NEM', name: 'Newmont Corp.', sector: 'Materials', price: 44.5, change: 1.8, color: '#ff4d6d', pe: 34.0, pb: 1.8, ps: 3.5, ev: 9.0, roe: 5.0, roa: 2.0, margin: 9.0, de: 0.5, cr: 2.5, fcf: 4.0, div: 3.8, beta: 0.55 },
    { sym: 'FCX', name: 'Freeport-McMoRan', sector: 'Materials', price: 52.0, change: 2.0, color: '#ff8c42', pe: 33.0, pb: 3.1, ps: 3.2, ev: 11.0, roe: 10.0, roa: 4.5, margin: 10.0, de: 0.5, cr: 2.5, fcf: 3.0, div: 0.8, beta: 1.70 },
    { sym: 'DD', name: 'DuPont de Nemours', sector: 'Materials', price: 78.0, change: 0.2, color: '#58d68d', pe: 23.0, pb: 1.5, ps: 2.7, ev: 12.0, roe: 7.0, roa: 4.0, margin: 10.0, de: 0.4, cr: 2.0, fcf: 4.5, div: 1.9, beta: 1.10 },
    { sym: 'NUE', name: 'Nucor Corp.', sector: 'Materials', price: 175.0, change: 0.5, color: '#85c1e9', pe: 12.5, pb: 2.2, ps: 1.2, ev: 6.5, roe: 19.0, roa: 11.0, margin: 10.0, de: 0.3, cr: 2.7, fcf: 6.0, div: 1.2, beta: 1.45 },

    // ─── Utilities (8) ──────────────────────────────────────────────────
    { sym: 'NEE', name: 'NextEra Energy', sector: 'Utilities', price: 75.0, change: 0.3, color: '#d4a843', pe: 22.0, pb: 3.0, ps: 6.0, ev: 16.0, roe: 13.0, roa: 3.0, margin: 27.0, de: 1.6, cr: 0.6, fcf: -1.0, div: 3.0, beta: 0.55 },
    { sym: 'SO', name: 'Southern Company', sector: 'Utilities', price: 82.0, change: 0.1, color: '#00d4b1', pe: 22.0, pb: 2.6, ps: 3.8, ev: 15.0, roe: 12.0, roa: 2.8, margin: 17.0, de: 1.8, cr: 0.6, fcf: 2.0, div: 3.6, beta: 0.45 },
    { sym: 'DUK', name: 'Duke Energy', sector: 'Utilities', price: 102.0, change: 0.2, color: '#4d9fff', pe: 20.0, pb: 1.9, ps: 2.8, ev: 14.0, roe: 9.0, roa: 2.5, margin: 14.0, de: 1.7, cr: 0.7, fcf: 0.5, div: 4.1, beta: 0.50 },
    { sym: 'D', name: 'Dominion Energy', sector: 'Utilities', price: 54.0, change: -0.1, color: '#a855f7', pe: 27.0, pb: 2.0, ps: 3.2, ev: 14.0, roe: 7.0, roa: 2.2, margin: 12.0, de: 1.8, cr: 0.8, fcf: 1.0, div: 4.9, beta: 0.55 },
    { sym: 'AEP', name: 'American Electric Power', sector: 'Utilities', price: 92.0, change: 0.2, color: '#ff4d6d', pe: 18.0, pb: 1.9, ps: 2.5, ev: 13.0, roe: 10.0, roa: 2.5, margin: 14.0, de: 1.9, cr: 0.8, fcf: 1.5, div: 3.8, beta: 0.50 },
    { sym: 'SRE', name: 'Sempra Energy', sector: 'Utilities', price: 78.0, change: 0.0, color: '#ff8c42', pe: 18.0, pb: 1.7, ps: 3.0, ev: 14.0, roe: 9.5, roa: 2.5, margin: 16.0, de: 1.3, cr: 0.7, fcf: 1.5, div: 3.2, beta: 0.80 },
    { sym: 'XEL', name: 'Xcel Energy', sector: 'Utilities', price: 64.0, change: 0.1, color: '#58d68d', pe: 18.0, pb: 1.9, ps: 2.7, ev: 13.0, roe: 10.0, roa: 2.7, margin: 15.0, de: 1.7, cr: 0.7, fcf: 0.8, div: 3.5, beta: 0.50 },
    { sym: 'ED', name: 'Consolidated Edison', sector: 'Utilities', price: 95.0, change: -0.1, color: '#85c1e9', pe: 18.0, pb: 1.6, ps: 2.1, ev: 12.0, roe: 9.0, roa: 2.5, margin: 12.0, de: 1.3, cr: 0.7, fcf: 2.0, div: 3.5, beta: 0.40 },
];

let state = {
    portfolio: [
        { sym: 'AAPL', shares: 10, avgCost: 165.0 },
        { sym: 'MSFT', shares: 5, avgCost: 340.0 },
        { sym: 'NVDA', shares: 8, avgCost: 410.0 },
    ],
    initAmount: 10000, recurAmount: 500, frequency: 'monthly',
    riskLevel: 4, horizon: 2, horizonLabel: '2Y',
    sectors: ['Tech', 'Finance'], modalStock: null, finTab: 'income', finTicker: null,
};

// Cache of real financial statements fetched from /api/yffinancials/:ticker
// { sym: { income[], balance[], cashflow[], name, _isFallback, _timestamp } }
const finCache = {};

// ─── FRED-backed risk-free rate (10Y UST, DGS10) ────────────────────────
// Default 4.5% if FRED is unreachable or not configured. Hydrated at startup.
const macroState = {
    riskFreeRate: 4.5,       // percent (e.g. 4.52 means 4.52%)
    riskFreeSource: 'default', // 'fred' | 'default'
    riskFreeDate: null,
};
// Expose to any module that needs it (ai-optimizer, risk-analytics, etc.)
if (typeof window !== 'undefined') window.macroState = macroState;

async function hydrateRiskFreeRate() {
    // Try FRED first (gold standard), then Alpha Vantage TREASURY_YIELD as fallback
    async function _tryFRED() {
        const r = await fetch('/api/fred/series/DGS10', { cache: 'no-store' });
        if (!r.ok) return null;
        const j = await r.json();
        if (j?.latest?.value != null && isFinite(j.latest.value)) {
            return { value: +j.latest.value, date: j.latest.date, source: 'fred' };
        }
        return null;
    }
    async function _tryAlpha() {
        const r = await fetch('/api/alpha/treasury?maturity=10year', { cache: 'no-store' });
        if (!r.ok) return null;
        const j = await r.json();
        if (j?.latest?.value != null && isFinite(j.latest.value)) {
            return { value: +j.latest.value, date: j.latest.date, source: 'alphavantage' };
        }
        return null;
    }
    try {
        const hit = (await _tryFRED()) || (await _tryAlpha());
        if (!hit) return;
        macroState.riskFreeRate = hit.value;
        macroState.riskFreeSource = hit.source;
        macroState.riskFreeDate = hit.date;
        if (typeof renderTopMetrics === 'function') {
            try { renderTopMetrics(); } catch (_) { }
        }
        window.dispatchEvent(new CustomEvent('macro:riskfree', { detail: { ...macroState } }));
    } catch (e) { /* keep default */ }
}

let charts = {};
const livePrices = {};
const liveCache = {};
const ratioCache = {};  // populated by app6.js + refreshLivePrices
let _allStocksPricesFetched = false;  // track if we've done an initial full fetch
let _marketOpen = null;  // null = unknown, true/false once detected
let notifStack = 0;
let pendingConfirm = null;

// =============================================
// INIT
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    clearOldCache();
    buildSectorChips(); buildSidebarSectors(); buildTickerTape();
    renderPortfolioTable(); renderTopMetrics(); renderCharts();
    // Hydrate 10Y UST risk-free rate from FRED in background (non-blocking)
    hydrateRiskFreeRate();
    renderNews(); renderRatios();
    if (typeof populateFinTickerSelect === 'function') populateFinTickerSelect();
    renderFinancials('income');
    if (typeof renderRevIncomeChart === 'function') renderRevIncomeChart();
    if (typeof renderMarginsChart === 'function') renderMarginsChart();
    renderComparison(); updateStockComparison();

    // ── Live price refresh strategy ─────────────────────────────────────
    // 1) Fetch portfolio stocks immediately (priority)
    // 2) Then fetch ALL ticker tape stocks in background
    // 3) Auto-refresh: portfolio every 60s, all stocks every 5min
    //    When market is closed, reduce to every 10min (prices won't change)
    setTimeout(() => {
        refreshLivePrices().catch(() => {});
        // After portfolio prices, fetch all ticker tape stocks
        setTimeout(() => refreshAllStockPrices().catch(() => {}), 3000);
    }, 1500);

    // Portfolio stocks: refresh every 60s
    setInterval(() => refreshLivePrices().catch(() => {}), 60000);
    // All ticker tape stocks: refresh every 5min (or 10min when closed)
    setInterval(() => {
        const interval = _marketOpen === false ? 600000 : 300000;
        refreshAllStockPrices().catch(() => {});
    }, 300000);

    // Close modal on Escape
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') { closeModal(); closeConfirm(); }
    });
    // Close modal on overlay click
    document.getElementById('addModal').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeModal();
    });
});

// =============================================
// SIDEBAR TOGGLE (mobile)
// =============================================
function toggleSidebar() {
    const s = document.getElementById('sidebar');
    const o = document.getElementById('sidebarOverlay');
    s.classList.toggle('open');
    o.classList.toggle('show');
}

// =============================================
// CONFIRM DIALOG
// =============================================
function showConfirm(title, msg, cb) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMsg').textContent = msg;
    pendingConfirm = cb;
    document.getElementById('confirmOverlay').classList.add('show');
}
function closeConfirm() {
    document.getElementById('confirmOverlay').classList.remove('show');
    pendingConfirm = null;
}
function confirmAction() {
    if (pendingConfirm) pendingConfirm();
    closeConfirm();
}

// =============================================
// NOTIFICATIONS — stacked
// =============================================
function notify(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = `notif ${type}`;
    el.textContent = msg;
    el.style.bottom = (20 + notifStack * 52) + 'px';
    document.body.appendChild(el);
    notifStack++;
    setTimeout(() => { el.remove(); notifStack = Math.max(0, notifStack - 1); }, 3000);
}

// =============================================
// TICKER TAPE
// =============================================
function buildTickerTape() {
    const inner = document.getElementById('tickerInner');
    // Build the tape once with data-sym attributes for in-place updates
    const items = [...STOCKS_DB, ...STOCKS_DB];
    inner.innerHTML = items.map(s => `
    <span class="tick-item" data-tape-sym="${s.sym}">
      <span class="tick-sym">${s.sym}</span>
      <span class="tick-price">$${s.price.toFixed(2)}</span>
      <span class="tick-chg ${s.change >= 0 ? 'pos' : 'neg'}">${s.change >= 0 ? '+' : ''}${s.change}%</span>
    </span>
  `).join('');
}

// Update prices in-place without rebuilding the DOM (keeps animation fluid)
function updateTickerTape() {
    const inner = document.getElementById('tickerInner');
    if (!inner) return;
    STOCKS_DB.forEach(s => {
        const lp = livePrices[s.sym];
        const price = lp?.price ?? s.price;
        const change = lp?.change ?? s.change;
        inner.querySelectorAll(`[data-tape-sym="${s.sym}"]`).forEach(el => {
            const priceEl = el.querySelector('.tick-price');
            const chgEl = el.querySelector('.tick-chg');
            if (priceEl) priceEl.textContent = '$' + price.toFixed(2);
            if (chgEl) {
                chgEl.textContent = (change >= 0 ? '+' : '') + (typeof change === 'number' ? change.toFixed(2) : change) + '%';
                chgEl.className = 'tick-chg ' + (change >= 0 ? 'pos' : 'neg');
            }
        });
    });
}

// ── Fetch real prices for ALL stocks in STOCKS_DB (ticker tape) ──────────────
// Batches requests to avoid overwhelming APIs. Uses fetchLivePrice() which
// already handles Yahoo Finance v8/chart + Twelve Data + RDP + caching.
async function refreshAllStockPrices() {
    const allSyms = STOCKS_DB.map(s => s.sym);
    const BATCH_SIZE = 8;  // parallel requests per batch
    const BATCH_DELAY = 500;  // ms between batches

    for (let i = 0; i < allSyms.length; i += BATCH_SIZE) {
        const batch = allSyms.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async sym => {
            try {
                // Skip if we have a recent cached price (< 3 min for open, < 30 min for closed)
                const existing = livePrices[sym];
                if (existing && existing._ts) {
                    const age = Date.now() - existing._ts;
                    const maxAge = existing.marketClosed ? 30 * 60 * 1000 : 3 * 60 * 1000;
                    if (age < maxAge) return;
                }

                // Clear localStorage cache to force fresh fetch
                try { localStorage.removeItem(LS_PREFIX + 'price_' + sym); } catch (_) {}

                const data = await fetchLivePrice(sym);
                if (data && data.price) {
                    data._ts = Date.now();
                    livePrices[sym] = data;
                    const db = STOCKS_DB.find(s => s.sym === sym);
                    if (db) {
                        db.price = data.price;
                        db.change = data.change || 0;
                    }
                    // Detect market state
                    if (data.marketClosed !== undefined) {
                        _marketOpen = !data.marketClosed;
                    }
                }
            } catch (_) { /* skip failed symbols silently */ }
        }));
        // Small delay between batches to be nice to APIs
        if (i + BATCH_SIZE < allSyms.length) {
            await new Promise(r => setTimeout(r, BATCH_DELAY));
        }
    }
    _allStocksPricesFetched = true;
    // Update all UI that depends on prices
    updateTickerTape();
    renderTopMetrics();
    renderPortfolioTable();

    // Show market status in console
    const closedCount = Object.values(livePrices).filter(p => p.marketClosed).length;
    const totalFetched = Object.keys(livePrices).length;
    if (closedCount > 0 && closedCount >= totalFetched * 0.8) {
        _marketOpen = false;
        console.log('[prices] Market closed — showing last closing prices');
    } else if (totalFetched > 0) {
        _marketOpen = true;
    }
}

// =============================================
// SECTOR CHIPS — combinable (header + sidebar share state.sectors)
// =============================================
function buildSectorChips() {
    document.getElementById('sectorChips').innerHTML = ['All', ...SECTORS].map(s => `
    <div class="chip ${s === 'All' ? 'active' : ''}" data-sector="${s}" onclick="filterBySector('${s}',this)" role="button" tabindex="0">${s}</div>
  `).join('');
    syncSectorChipsFromState();
}

// Source of truth for both header chips and sidebar: state.sectors[]
// "All" acts as "no filter" — clicking it resets the selection.
function filterBySector(sector, el) {
    if (sector === 'All') {
        state.sectors = [];
    } else {
        const i = state.sectors.indexOf(sector);
        if (i >= 0) state.sectors.splice(i, 1);
        else state.sectors.push(sector);
    }
    syncSectorChipsFromState();
    syncSidebarSectorsFromState();
    const label = state.sectors.length === 0 ? 'All sectors' : state.sectors.join(' + ');
    notify(`Active filter: ${label}`, 'success');
    applySectorFilter();
}

function syncSectorChipsFromState() {
    const all = document.querySelectorAll('#sectorChips .chip');
    all.forEach(chip => {
        const s = chip.dataset.sector;
        if (s === 'All') chip.classList.toggle('active', state.sectors.length === 0);
        else chip.classList.toggle('active', state.sectors.includes(s));
    });
}

function buildSidebarSectors() {
    document.getElementById('sidebarSectors').innerHTML = SECTORS.map(s => `
    <div class="sector-tag" data-sector="${s}" onclick="toggleSector('${s}',this)">${s}</div>
  `).join('');
    syncSidebarSectorsFromState();
}

function toggleSector(s, el) {
    const i = state.sectors.indexOf(s);
    if (i >= 0) state.sectors.splice(i, 1);
    else state.sectors.push(s);
    syncSidebarSectorsFromState();
    syncSectorChipsFromState();
    applySectorFilter();
}

function syncSidebarSectorsFromState() {
    document.querySelectorAll('#sidebarSectors .sector-tag').forEach(el => {
        el.classList.toggle('active', state.sectors.includes(el.dataset.sector));
    });
}

// Apply the active sector filter to any filterable UI element.
// Currently: the search dropdown grid and (lightly) the stock-compare selectors.
function applySectorFilter() {
    // Trigger a re-render of anything that reads state.sectors.
    const dropdown = document.getElementById('searchDropdown');
    if (dropdown && dropdown.style.display === 'block') {
        const input = document.getElementById('stockSearch');
        if (input && typeof doSearch === 'function') doSearch(input.value);
    }
    // Hook: future callers can watch this event
    window.dispatchEvent(new CustomEvent('sectors:changed', { detail: { sectors: state.sectors.slice() } }));
}

// =============================================
// RISK / FREQUENCY / HORIZON
// =============================================
function syncRisk(v) {
    state.riskLevel = +v;
    document.getElementById('riskInput').value = v;
    document.getElementById('riskVal').textContent = v;
    const labels = ['', 'Min Risk', 'Conservative', 'Conservative', 'Moderate', 'Moderate', 'Balanced', 'Growth', 'Aggressive', 'High Risk', 'Max Risk'];
    const returns = [0, 4.5, 5.5, 6.5, 8.5, 9.5, 11, 13, 16, 20, 25];
    document.getElementById('riskLabel').textContent = labels[v] || 'Moderate';
    document.getElementById('riskReturn').textContent = returns[v] + '%';
    const el = document.getElementById('riskLabel');
    if (v <= 2) el.style.color = 'var(--teal)';
    else if (v <= 5) el.style.color = 'var(--gold)';
    else el.style.color = 'var(--red)';
}
function syncRiskInput(v) {
    v = Math.min(10, Math.max(1, +v));
    document.getElementById('riskSlider').value = v;
    syncRisk(v);
}
function setFreq(f) {
    state.frequency = f;
    document.getElementById('freqMonthly').classList.toggle('active', f === 'monthly');
    document.getElementById('freqAnnual').classList.toggle('active', f === 'annually');
}
function setHorizon(y, label, el) {
    state.horizon = y; state.horizonLabel = label;
    document.querySelectorAll('.h-btn').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
}

function colorForIndex(sym) {
    const palette = ['#d4a843', '#00d4b1', '#4d9fff', '#a855f7', '#ff8c42', '#ff4d6d', '#58d68d', '#85c1e9', '#f1948a', '#aab7b8'];
    let hash = 0;
    for (let c of sym) hash = c.charCodeAt(0) + ((hash << 5) - hash);
    return palette[Math.abs(hash) % palette.length];
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// =============================================
// LOCALSTORAGE CACHE  (survives page reloads)
// =============================================
const LS_PREFIX = 'qe6_';           // bump version to clear all old stale data
const TTL_PRICE = 60 * 1000;        // 60 sec — live prices refresh every minute
const TTL_SUMMARY = 60 * 60 * 1000;  // 1 hour — fundamentals / ratios

function lsSet(key, data) {
    try { localStorage.setItem(LS_PREFIX + key, JSON.stringify({ d: data, t: Date.now() })); } catch (_) { }
}
function lsGet(key, ttl) {
    try {
        const raw = localStorage.getItem(LS_PREFIX + key);
        if (!raw) return null;
        const { d, t } = JSON.parse(raw);
        if (Date.now() - t > ttl) return null;
        return d;
    } catch (_) { return null; }
}
// Remove any keys from old cache versions on startup
function clearOldCache() {
    try {
        const oldPrefixes = ['qe_', 'qe2_', 'qe3_', 'qe4_'];
        Object.keys(localStorage)
            .filter(k => oldPrefixes.some(p => k.startsWith(p)))
            .forEach(k => localStorage.removeItem(k));
    } catch (_) { }
}

// =============================================
// FINANCE APIs — Local proxy (localhost) → CORS proxies (GitHub Pages)
// =============================================
const YF_BASE = 'https://query1.finance.yahoo.com';
const YF_BASE2 = 'https://query2.finance.yahoo.com';

// Twelve Data — free tier, no key needed for basic quote
const TD_BASE = 'https://api.twelvedata.com';

// Detect if we're running via our local Express server (not file:// or GH Pages)
const IS_LOCAL_SERVER = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const LOCAL_API = IS_LOCAL_SERVER ? `http://${location.host}` : null;

// CORS proxies — ALL raced simultaneously via Promise.any() (fallback for GH Pages)
const CORS_PROXIES = [
    url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    url => `https://thingproxy.freeboard.io/fetch/${url}`,
];

// Try one proxy (resolves with parsed JSON or rejects)
async function tryProxy(proxyUrl, timeout = 6000) {
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text || text.length < 10) throw new Error('Empty');
    return JSON.parse(text);
}

async function fetchWithProxy(targetUrl, ttl = 0) {
    // 1) Check localStorage cache first
    if (ttl > 0) {
        const cached = lsGet('url_' + btoa(targetUrl.slice(-80)), ttl);
        if (cached) return cached;
    }

    // 2) Local server proxy (localhost only — zero CORS issues)
    if (LOCAL_API) {
        try {
            const res = await fetch(LOCAL_API + '/api/proxy?url=' + encodeURIComponent(targetUrl),
                { signal: AbortSignal.timeout(5000) });
            if (res.ok) {
                const data = await res.json();
                if (ttl > 0) lsSet('url_' + btoa(targetUrl.slice(-80)), data);
                return data;
            }
        } catch (_) { }
    }

    // 3) Try direct fetch (works on same-origin deployments)
    try {
        const res = await fetch(targetUrl, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
            const data = await res.json();
            if (ttl > 0) lsSet('url_' + btoa(targetUrl.slice(-80)), data);
            return data;
        }
    } catch (_) { }

    // 4) Race ALL CORS proxies simultaneously — fastest wins (GitHub Pages fallback)
    try {
        const data = await Promise.any(
            CORS_PROXIES.map(fn => tryProxy(fn(targetUrl), 6000))
        );
        if (ttl > 0) lsSet('url_' + btoa(targetUrl.slice(-80)), data);
        return data;
    } catch (_) { }

    throw new Error('All proxies failed');
}

// ── BATCH live prices for ALL portfolio symbols ─────────────────────────────
async function refreshLivePrices() {
    const syms = [...new Set(state.portfolio.map(p => p.sym))];
    if (!syms.length) return;

    // Load cached values immediately (instant display, no network wait)
    syms.forEach(s => {
        const c = lsGet('price_' + s, TTL_PRICE);
        if (c) {
            livePrices[s] = { ...c, _ts: Date.now() };
            const db = STOCKS_DB.find(x => x.sym === s);
            if (db) { db.price = c.price; db.change = c.change; }
        }
    });
    applyLivePrices();

    // Force-fetch ALL portfolio symbols (clear cache for fresh data)
    await Promise.all(syms.map(async sym => {
        try {
            // Clear cache to get fresh price
            try { localStorage.removeItem(LS_PREFIX + 'price_' + sym); } catch (_) {}

            const data = await fetchLivePrice(sym);
            if (!data || !data.price) {
                if (!livePrices[sym]) {
                    const db = STOCKS_DB.find(x => x.sym === sym);
                    if (db) livePrices[sym] = { price: db.price, change: db.change, changeAmt: 0, name: db.name, currency: 'USD', _ts: Date.now(), _offline: true };
                }
                return;
            }
            data._ts = Date.now();
            livePrices[sym] = data;
            lsSet('price_' + sym, data);
            const db = STOCKS_DB.find(s => s.sym === sym);
            if (db) { db.price = data.price; db.change = data.change; }

            // Track market state
            if (data.marketClosed !== undefined) {
                _marketOpen = !data.marketClosed;
            }
        } catch (_) {
            if (!livePrices[sym]) {
                const db = STOCKS_DB.find(x => x.sym === sym);
                if (db) livePrices[sym] = { price: db.price, change: db.change, changeAmt: 0, name: db.name, currency: 'USD', _ts: Date.now(), _offline: true };
            }
        }
    }));
    applyLivePrices();
}

function applyLivePrices() {
    updateTickerTape(); renderTopMetrics(); renderPortfolioTable();
    // Notify other modules (ratios, analysis) that prices have been updated
    try { window.dispatchEvent(new CustomEvent('pricesUpdated')); } catch (_) {}
}

// ── Single symbol price — chart endpoint (no auth) + Twelve Data fallback ─────
async function fetchLivePrice(sym) {
    const cached = lsGet('price_' + sym, TTL_PRICE);
    if (cached) return cached;

    // 0) Refinitiv RDP Quote Snapshot
    try {
        const res = await fetch(`/api/rdp/quote/${encodeURIComponent(sym)}`, { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
            const rdp = await res.json();
            if (!rdp.error && (rdp.last || rdp.close)) {
                const resolvedPrice = rdp.last || rdp.close;
                const prevClose = rdp.close || resolvedPrice;
                const chgAmt = rdp.change !== undefined && rdp.change !== null ? rdp.change : 0;
                const chgPct = rdp.changePct !== undefined && rdp.changePct !== null ? rdp.changePct : 0;
                const lp = {
                    price: resolvedPrice,
                    previousClose: prevClose,
                    change: chgPct,
                    changeAmt: chgAmt,
                    name: rdp.name || sym,
                    currency: rdp.currency || 'USD',
                    marketClosed: false,
                    _isRdp: true
                };
                lsSet('price_' + sym, lp);
                return lp;
            }
        }
    } catch (_) {}

    // 1) Yahoo Finance v8/chart — NO AUTH REQUIRED, works via any proxy
    try {
        const url = `${YF_BASE2}/v8/finance/chart/${sym}?interval=1d&range=1d&includePrePost=false`;
        const data = await fetchWithProxy(url);
        const result = data?.chart?.result?.[0];
        if (result) {
            const meta = result.meta || {};
            const liveP = meta.regularMarketPrice;
            const prevClose = meta.previousClose || meta.chartPreviousClose;
            const marketState = meta.marketState || 'CLOSED';
            const isClosed = !liveP || marketState === 'CLOSED' || marketState === 'PRE' ||
                marketState === 'PREPRE' || marketState === 'POST' || marketState === 'POSTPOST';
            const resolvedPrice = liveP || prevClose;
            if (resolvedPrice) {
                const chgAmt = liveP && prevClose ? liveP - prevClose : 0;
                const chgPct = prevClose ? (chgAmt / prevClose * 100) : 0;
                const lp = {
                    price: resolvedPrice,
                    previousClose: prevClose || resolvedPrice,
                    change: +chgPct.toFixed(2),
                    changeAmt: +chgAmt.toFixed(2),
                    name: meta.shortName || meta.instrumentType || sym,
                    currency: meta.currency || 'USD',
                    marketClosed: isClosed,
                };
                lsSet('price_' + sym, lp);
                return lp;
            }
        }
    } catch (_) { }

    // 2) Twelve Data relay (free, no key required)
    try {
        const url = `${TD_BASE}/price?symbol=${sym}&format=JSON&outputsize=1`;
        const data = await fetchWithProxy(url, TTL_PRICE);
        if (data?.price) {
            const lp = {
                price: +data.price,
                previousClose: +data.price,
                change: 0, changeAmt: 0,
                name: sym, currency: 'USD',
                marketClosed: true,
            };
            lsSet('price_' + sym, lp);
            return lp;
        }
    } catch (_) { }

    return null;
}

// ── Search — Refinitiv RDP first, Yahoo/Twelve Data as fallback ───────────────
async function rdpSearch(query) {
    try {
        const res = await fetch(`/api/rdp/search?q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
            const data = await res.json();
            if (!data.error && Array.isArray(data.results) && data.results.length > 0) {
                return data.results.map(r => ({
                    symbol: r.symbol || r.ticker,
                    shortname: r.name,
                    exchDisp: r.exchange,
                    quoteType: r.type === 'ETF' ? 'ETF' : 'EQUITY',
                    _isRdp: true
                }));
            }
        }
    } catch (_) {}
    return null;
}

async function rdpHistory(sym, count = 365) {
    try {
        const res = await fetch(`/api/rdp/historical/${encodeURIComponent(sym)}?count=${count}`, {
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.error || !data.closes?.length) return null;
        return data;
    } catch (_) { return null; }
}

async function yfSearch(query) {
    const url = `${YF_BASE}/v1/finance/search?q=${encodeURIComponent(query)}&lang=en-US&region=US&quotesCount=15&newsCount=0&enableFuzzyQuery=true`;
    const data = await fetchWithProxy(url, 60 * 1000);
    return (data.quotes || []).filter(q => ['EQUITY', 'ETF', 'MUTUALFUND'].includes(q.quoteType));
}

// Fallback search via Twelve Data autocomplete (free)
async function tdSearch(query) {
    try {
        const url = `${TD_BASE}/symbol_search?symbol=${encodeURIComponent(query)}&outputsize=10`;
        const data = await fetchWithProxy(url, 60 * 1000);
        const items = data?.data || [];
        return items
            .filter(i => ['Common Stock', 'ETF'].includes(i.instrument_type))
            .map(i => ({
                symbol: i.symbol,
                shortname: i.instrument_name,
                exchDisp: i.exchange,
                quoteType: i.instrument_type === 'ETF' ? 'ETF' : 'EQUITY',
            }));
    } catch (_) { return []; }
}

// ── Chart data ───────────────────────────────────────────────────────────────
async function yfQuote(sym) {
    const url = `${YF_BASE2}/v8/finance/chart/${sym}?interval=1d&range=1y&includePrePost=false`;
    const data = await fetchWithProxy(url, TTL_SUMMARY);
    const chart = data?.chart?.result?.[0];
    if (!chart) return null;
    return { meta: chart.meta, closes: chart.indicators?.quote?.[0]?.close || [], timestamps: chart.timestamp || [] };
}

// ── Fundamentals / Ratios summary ────────────────────────────────────────────
async function yfSummary(sym) {
    const cached = lsGet('summary_' + sym, TTL_SUMMARY);
    if (cached) return cached;
    const modules = 'summaryDetail,financialData,defaultKeyStatistics,price,assetProfile';
    const url = `${YF_BASE}/v10/finance/quoteSummary/${sym}?modules=${modules}`;
    const data = await fetchWithProxy(url);
    const result = data?.quoteSummary?.result?.[0] || null;
    if (result) lsSet('summary_' + sym, result);
    return result;
}

