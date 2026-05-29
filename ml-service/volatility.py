"""
Volatility forecasting — LSTM (si PyTorch dispo) + EWMA baseline.

Entrée : série de rendements journaliers r_t.
Sortie : volatilité annualisée prévue pour t+1, plus la série in-sample.

Pourquoi LSTM sur la volatilité ?
- La volatilité est beaucoup plus prévisible que les rendements (clustering,
  effet de levier, mean-reversion). C'est le cas d'usage canonique du DL
  en finance quantitative.
- On vise à capturer les dépendances non linéaires et de long terme qu'un
  GARCH(1,1) linéaire ne voit pas.
"""
from __future__ import annotations

import math
from typing import Dict, List, Optional

import numpy as np

try:
    import torch
    import torch.nn as nn
    _TORCH_OK = True
except Exception:  # pragma: no cover
    torch = None
    nn = None
    _TORCH_OK = False

TRADING_DAYS = 252


# ══════════════════ 1. EWMA baseline (toujours dispo) ════════════════════
def ewma_volatility(returns: List[float], lam: float = 0.94) -> Dict[str, float]:
    """Volatilité EWMA à la RiskMetrics (lam=0.94)."""
    if len(returns) < 2:
        return {"sigma_daily": 0.0, "sigma_annual": 0.0}
    arr = np.asarray(returns, dtype=float)
    arr = arr - arr.mean()
    var = float(arr[0] ** 2)
    for r in arr[1:]:
        var = lam * var + (1 - lam) * float(r) ** 2
    sigma_d = math.sqrt(max(var, 0.0))
    return {"sigma_daily": sigma_d, "sigma_annual": sigma_d * math.sqrt(TRADING_DAYS)}


def realized_volatility(returns: List[float], window: int = 21) -> List[float]:
    """Série de vol réalisée annualisée sur fenêtre glissante."""
    if len(returns) < window:
        return []
    arr = np.asarray(returns, dtype=float)
    out = []
    for i in range(window, len(arr) + 1):
        out.append(float(arr[i - window:i].std(ddof=1) * math.sqrt(TRADING_DAYS)))
    return out


# ══════════════════ 2. LSTM (si PyTorch dispo) ════════════════════════════
if _TORCH_OK:

    class VolLSTM(nn.Module):
        def __init__(self, input_size: int = 1, hidden: int = 16, layers: int = 1):
            super().__init__()
            self.lstm = nn.LSTM(input_size, hidden, layers, batch_first=True, dropout=0.0)
            self.head = nn.Sequential(nn.Linear(hidden, 8), nn.ReLU(), nn.Linear(8, 1))

        def forward(self, x):
            out, _ = self.lstm(x)
            return self.head(out[:, -1, :]).squeeze(-1)

    def _train_lstm(
        returns: List[float],
        window: int = 21,
        epochs: int = 25,
        lr: float = 1e-2,
    ) -> Optional[Dict[str, float]]:
        """Entraîne un petit LSTM pour prédire sigma_{t+1} à partir des 21 dernières |r|.
        Retourne None si la série est trop courte."""
        if len(returns) < window + 30:
            return None

        arr = np.asarray(returns, dtype=float)
        # Cible : vol réalisée sur horizon glissant
        sigmas = realized_volatility(arr.tolist(), window=window)  # ann. vol
        if len(sigmas) < 30:
            return None

        # Features : |r| des `window` derniers jours
        abs_r = np.abs(arr)
        X, Y = [], []
        for i in range(window, len(arr) - 1):
            # pred target = sigma ann. des 21 prochains jours — on décale
            target_idx = i - window + 1
            if target_idx >= len(sigmas):
                break
            X.append(abs_r[i - window:i])
            Y.append(sigmas[target_idx])
        if len(X) < 10:
            return None
        X = torch.tensor(np.array(X), dtype=torch.float32).unsqueeze(-1)
        Y = torch.tensor(np.array(Y), dtype=torch.float32)

        torch.manual_seed(42)
        model = VolLSTM()
        opt = torch.optim.Adam(model.parameters(), lr=lr)
        loss_fn = nn.MSELoss()
        model.train()
        for _ in range(epochs):
            opt.zero_grad()
            pred = model(X)
            loss = loss_fn(pred, Y)
            loss.backward()
            opt.step()

        # Prévision t+1 : on prend les 21 derniers |r|
        model.eval()
        with torch.no_grad():
            last = torch.tensor(abs_r[-window:], dtype=torch.float32).view(1, window, 1)
            sigma_annual = float(model(last).item())
        sigma_annual = max(sigma_annual, 1e-4)
        sigma_daily = sigma_annual / math.sqrt(TRADING_DAYS)
        return {
            "sigma_daily": sigma_daily,
            "sigma_annual": sigma_annual,
            "final_loss": float(loss.item()),
        }
else:
    def _train_lstm(*args, **kwargs):  # type: ignore
        return None


# ══════════════════ 3. Fonction publique ══════════════════════════════════
def forecast(returns: List[float], *, use_lstm: bool = True) -> Dict:
    """Renvoie un bundle : EWMA + (optionnel) LSTM + série réalisée."""
    out: Dict = {
        "n_obs": len(returns),
        "ewma": ewma_volatility(returns),
        "realized_21d": realized_volatility(returns, 21)[-60:],  # 60 dernières val.
        "lstm": None,
        "backend": "ewma",
    }
    if use_lstm and _TORCH_OK and len(returns) >= 60:
        lstm = _train_lstm(returns)
        if lstm is not None:
            out["lstm"] = lstm
            out["backend"] = "lstm+ewma"
    elif not _TORCH_OK:
        out["lstm_unavailable_reason"] = "PyTorch non installé (pip install torch)"
    return out
