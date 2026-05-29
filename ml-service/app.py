"""
QuantEdge ML Microservice — FastAPI

Endpoints :
  GET  /health                   → statut + backends dispo
  POST /forecast/volatility      → LSTM/EWMA volatilité
  POST /sentiment                → FinBERT/lexique sentiment

Lance avec :
  uvicorn app:app --port 8000 --host 127.0.0.1
"""
from typing import List, Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import volatility as vol_mod
import sentiment as sent_mod

app = FastAPI(title="QuantEdge ML", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ══════════════════════ Schemas ════════════════════════════════════════════
class VolRequest(BaseModel):
    ticker: Optional[str] = None
    returns: List[float] = Field(..., description="Série de rendements journaliers.")
    use_lstm: bool = True


class SentimentRequest(BaseModel):
    texts: List[str]
    ticker: Optional[str] = None
    prefer_bert: bool = True


# ══════════════════════ Routes ════════════════════════════════════════════
@app.get("/")
def root():
    return {"service": "quantedge-ml", "status": "ok"}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "torch": vol_mod._TORCH_OK,
        "finbert": sent_mod._BERT_OK,
        "endpoints": ["/forecast/volatility", "/sentiment"],
    }


@app.post("/forecast/volatility")
def forecast_vol(req: VolRequest):
    if len(req.returns) < 5:
        return {"error": "Need at least 5 return observations", "ticker": req.ticker}
    result = vol_mod.forecast(req.returns, use_lstm=req.use_lstm)
    result["ticker"] = req.ticker
    return result


@app.post("/sentiment")
def analyze_sentiment(req: SentimentRequest):
    result = sent_mod.analyze(req.texts, prefer_bert=req.prefer_bert)
    result["ticker"] = req.ticker
    return result
