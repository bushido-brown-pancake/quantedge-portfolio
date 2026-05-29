#!/usr/bin/env bash
# Lance le microservice ML QuantEdge sur le port 8000
set -e
cd "$(dirname "$0")"

# Venv auto si absent
if [ ! -d ".venv" ]; then
  echo "▶ Création du virtualenv…"
  python3 -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate

echo "▶ Installation des dépendances minimales…"
pip install -q --upgrade pip
pip install -q -r requirements.txt

echo ""
echo "  ╔═══════════════════════════════════════════╗"
echo "  ║   QuantEdge — ML Microservice             ║"
echo "  ╠═══════════════════════════════════════════╣"
echo "  ║   🐍  http://127.0.0.1:8000               ║"
echo "  ║   /health  /forecast/volatility  /sentiment"
echo "  ╚═══════════════════════════════════════════╝"
echo ""
echo "  Backends optionnels (pip install torch transformers)"
echo "  → LSTM pour la volatilité"
echo "  → FinBERT pour le sentiment"
echo ""

exec uvicorn app:app --host 127.0.0.1 --port 8000 --reload
