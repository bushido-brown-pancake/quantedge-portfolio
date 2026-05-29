"""
Sentiment analysis — FinBERT (si transformers dispo) + lexique de secours.

Entrée : liste de textes (titres de news, tweets…).
Sortie : score composite [-1, +1] par texte et moyenne.

En l'absence de transformers/torch, on utilise un lexique financier simple :
~ 200 mots positifs / négatifs, règles de négation "not", pondération.
"""
from __future__ import annotations

import re
from typing import Dict, List, Optional

try:
    from transformers import AutoTokenizer, AutoModelForSequenceClassification
    import torch
    _BERT_OK = True
except Exception:  # pragma: no cover
    _BERT_OK = False

# ══════════════════ 1. Lexique fallback ═══════════════════════════════════
POS_WORDS = {
    "gain", "gains", "beat", "beats", "surge", "surges", "rally", "rallies",
    "record", "strong", "stronger", "strongest", "outperform", "outperforms",
    "upgrade", "upgrades", "profit", "profits", "profitable", "growth", "grow",
    "grows", "growing", "bullish", "buy", "rise", "rises", "rising", "rose",
    "soar", "soars", "jump", "jumps", "jumped", "boost", "boosted", "raised",
    "upbeat", "optimistic", "positive", "exceed", "exceeds", "exceeded",
    "breakthrough", "innovate", "innovation", "expansion", "expand", "advance",
    "approved", "approval", "success", "successful", "win", "wins", "won",
    "dividend", "buyback", "acquisition",
}
NEG_WORDS = {
    "loss", "losses", "miss", "misses", "missed", "plunge", "plunges", "slump",
    "slumps", "weak", "weaker", "weakest", "underperform", "underperforms",
    "downgrade", "downgrades", "cut", "cuts", "cutting", "warning", "warn",
    "warns", "bearish", "sell", "fall", "falls", "falling", "fell", "drop",
    "drops", "dropped", "decline", "declines", "crash", "crashed", "lower",
    "lowered", "downbeat", "pessimistic", "negative", "shortfall", "recession",
    "layoff", "layoffs", "lawsuit", "probe", "investigation", "fraud",
    "default", "bankruptcy", "delay", "delayed", "halt", "halted", "suspend",
    "crisis", "risk", "concern", "concerns", "worry", "worries", "fear",
    "fears", "volatile", "volatility", "debt", "deficit",
}
NEG_MODIFIERS = {"not", "no", "never", "without", "lack", "lacks"}


def _lexicon_score(text: str) -> float:
    text = text.lower()
    tokens = re.findall(r"[a-z']+", text)
    pos, neg, n = 0, 0, 0
    prev = None
    for tok in tokens:
        if tok in POS_WORDS:
            if prev in NEG_MODIFIERS:
                neg += 1
            else:
                pos += 1
            n += 1
        elif tok in NEG_WORDS:
            if prev in NEG_MODIFIERS:
                pos += 1
            else:
                neg += 1
            n += 1
        prev = tok
    if n == 0:
        return 0.0
    return (pos - neg) / max(n, 1)


# ══════════════════ 2. FinBERT (lazy) ═════════════════════════════════════
_FINBERT: Optional[dict] = None


def _load_finbert() -> Optional[dict]:
    global _FINBERT
    if _FINBERT is not None:
        return _FINBERT
    if not _BERT_OK:
        return None
    try:
        name = "ProsusAI/finbert"
        tok = AutoTokenizer.from_pretrained(name)
        mdl = AutoModelForSequenceClassification.from_pretrained(name)
        mdl.eval()
        _FINBERT = {"tok": tok, "mdl": mdl}
        return _FINBERT
    except Exception as e:  # pragma: no cover
        print(f"[sentiment] FinBERT load failed: {e}")
        return None


def _finbert_score(texts: List[str]) -> Optional[List[Dict]]:
    bundle = _load_finbert()
    if bundle is None:
        return None
    tok, mdl = bundle["tok"], bundle["mdl"]
    inputs = tok(texts, padding=True, truncation=True, max_length=128, return_tensors="pt")
    with torch.no_grad():
        logits = mdl(**inputs).logits
    probs = torch.softmax(logits, dim=-1).numpy()
    # FinBERT labels : [positive, negative, neutral]
    out = []
    for p in probs:
        score = float(p[0]) - float(p[1])  # net positive - net negative
        out.append({
            "score": score,
            "positive": float(p[0]),
            "negative": float(p[1]),
            "neutral": float(p[2]),
        })
    return out


# ══════════════════ 3. Fonction publique ══════════════════════════════════
def analyze(texts: List[str], *, prefer_bert: bool = True) -> Dict:
    texts = [t for t in texts if isinstance(t, str) and t.strip()]
    if not texts:
        return {"backend": "none", "avg_score": 0.0, "n": 0, "items": []}

    bert_out = _finbert_score(texts) if prefer_bert else None
    backend = "finbert" if bert_out else "lexicon"
    items = []
    scores = []
    for i, t in enumerate(texts):
        if bert_out:
            s = bert_out[i]["score"]
            items.append({"text": t[:200], **bert_out[i]})
        else:
            s = _lexicon_score(t)
            items.append({"text": t[:200], "score": s})
        scores.append(s)

    avg = float(sum(scores) / len(scores))
    return {
        "backend": backend,
        "n": len(texts),
        "avg_score": avg,
        "label": "positive" if avg > 0.15 else ("negative" if avg < -0.15 else "neutral"),
        "items": items,
    }
