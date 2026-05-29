#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  QuantEdge — Launcher unifié
#  Lance le microservice Python (port 8000) + le serveur Node (port 3000)
#  puis ouvre http://localhost:3000 dans ton navigateur.
#  Ctrl-C arrête les deux serveurs proprement.
# ─────────────────────────────────────────────────────────────────────────────
set -e
cd "$(dirname "$0")"
ROOT="$(pwd)"
ML_DIR="$ROOT/ml-service"

# ── Pretty print ─────────────────────────────────────────────────────────────
cyan()  { printf "\033[36m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*"; }
gold()  { printf "\033[33m%s\033[0m\n" "$*"; }

echo ""
cyan "  ╔═══════════════════════════════════════════════╗"
cyan "  ║   QuantEdge — Full Stack Launcher             ║"
cyan "  ║   Node (3000) + Python ML (8000)              ║"
cyan "  ╚═══════════════════════════════════════════════╝"
echo ""

# ── 1. Vérifs ────────────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || { red "❌ Node introuvable. Installe depuis https://nodejs.org"; exit 1; }
command -v python3 >/dev/null 2>&1 || { red "❌ python3 introuvable."; exit 1; }

# ── 1b. Vérif .env (clés API optionnelles mais recommandées) ────────────────
if [ ! -f ".env" ]; then
  gold "⚠  Aucun fichier .env détecté."
  if [ -f ".env.example" ]; then
    gold "   Copie .env.example → .env puis remplis tes clés :"
    gold "   FINNHUB_KEY, FRED_KEY, MARKETSTACK_KEY, SEC_USER_AGENT"
    gold "   Commande : cp .env.example .env && \$EDITOR .env"
  fi
  gold "   L'app tournera quand même avec Yahoo Finance seul (sources limitées)."
  echo ""
else
  # Résumé des clés configurées (sans les afficher)
  CONFIGURED=""
  grep -q '^FINNHUB_KEY=..' .env 2>/dev/null && CONFIGURED="$CONFIGURED Finnhub"
  grep -q '^ALPHAVANTAGE_KEY=..' .env 2>/dev/null && CONFIGURED="$CONFIGURED AlphaVantage"
  grep -q '^FRED_KEY=..' .env 2>/dev/null && CONFIGURED="$CONFIGURED FRED"
  grep -q '^MARKETSTACK_KEY=..' .env 2>/dev/null && CONFIGURED="$CONFIGURED Marketstack"
  grep -q '^SEC_USER_AGENT=..' .env 2>/dev/null && CONFIGURED="$CONFIGURED SEC-EDGAR"
  if [ -n "$CONFIGURED" ]; then
    green "✓ .env chargé — sources activées :$CONFIGURED"
  else
    gold "⚠  .env présent mais aucune clé renseignée."
  fi
fi

# ── 2. Node deps ─────────────────────────────────────────────────────────────
if [ ! -d "node_modules" ]; then
  gold "▶ npm install…"
  npm install --silent
fi

# ── 3. Python venv + deps ───────────────────────────────────────────────────
cd "$ML_DIR"

# Si un .venv existe mais est corrompu (pas d'activate), on le supprime
if [ -d ".venv" ] && [ ! -f ".venv/bin/activate" ]; then
  red "▶ .venv corrompu détecté — suppression et recréation…"
  rm -rf .venv
fi

if [ ! -d ".venv" ]; then
  gold "▶ Création du virtualenv Python (.venv)…"
  if ! python3 -m venv .venv 2>/tmp/venv_err; then
    red "❌ Échec de python3 -m venv :"
    cat /tmp/venv_err
    red "   Essaie : brew install python3   (ou installe depuis python.org)"
    exit 1
  fi
  # Double-check que activate a bien été créé
  if [ ! -f ".venv/bin/activate" ]; then
    red "❌ Le venv a été créé mais activate est absent."
    red "   Ton python3 est probablement incomplet (Xcode stub ?)."
    red "   Solution : brew install python3"
    exit 1
  fi
fi

# shellcheck disable=SC1091
source .venv/bin/activate
gold "▶ Vérification des dépendances Python (1re fois = long, PyTorch ~800 Mo)…"
pip install -q --upgrade pip
pip install -q -r requirements.txt || {
  red "⚠️  Installation Python partielle. Le service démarrera en mode dégradé (EWMA + lexique)."
}

# ── 4. Lancement parallèle ───────────────────────────────────────────────────
cleanup() {
  echo ""
  gold "▶ Arrêt des serveurs…"
  [ -n "$ML_PID" ]   && kill "$ML_PID"   2>/dev/null || true
  [ -n "$NODE_PID" ] && kill "$NODE_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  green "✓ Arrêt propre. À+"
  exit 0
}
trap cleanup INT TERM

gold "▶ Démarrage du microservice Python (port 8000)…"
gold "  (chargement PyTorch = 10-30s au premier démarrage, patience…)"
uvicorn app:app --host 127.0.0.1 --port 8000 > "$ROOT/.ml-service.log" 2>&1 &
ML_PID=$!

# Attendre que FastAPI réponde (jusqu'à 90 s — torch + finbert = lent à charger)
printf "  "
READY=0
for i in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; then
    READY=1; break
  fi
  # Vérifier que le process n'est pas mort
  if ! kill -0 "$ML_PID" 2>/dev/null; then
    echo ""
    red "❌ Le process Python est mort pendant le démarrage."
    red "   Dernières lignes de .ml-service.log :"
    tail -30 "$ROOT/.ml-service.log"
    cleanup
  fi
  printf "."
  sleep 1
done
echo ""

if [ "$READY" != "1" ]; then
  red "❌ Le microservice n'a pas répondu après 90 s. Voir .ml-service.log"
  tail -30 "$ROOT/.ml-service.log"
  cleanup
fi
green "✓ Python ML : http://127.0.0.1:8000"

cd "$ROOT"
gold "▶ Démarrage du serveur Node (port 3000)…"
node server.js > .node-server.log 2>&1 &
NODE_PID=$!

# Attendre Node
for i in {1..20}; do
  if curl -fsS http://localhost:3000/ >/dev/null 2>&1; then break; fi
  sleep 0.5
done

if ! curl -fsS http://localhost:3000/ >/dev/null 2>&1; then
  red "❌ Node ne répond pas. Voir .node-server.log"
  tail -20 .node-server.log
  cleanup
fi
green "✓ Node     : http://localhost:3000"

# ── 5. Ouverture du navigateur ──────────────────────────────────────────────
echo ""
gold "▶ Ouverture de http://localhost:3000 …"
if [[ "$OSTYPE" == "darwin"* ]]; then open http://localhost:3000
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then xdg-open http://localhost:3000 >/dev/null 2>&1 || true
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then start http://localhost:3000
fi

echo ""
cyan "════════════════════════════════════════════════════"
green "  ✓ Tout tourne. Clique l'onglet ⚠️  Risk."
cyan "    → http://localhost:3000"
cyan "    → Logs Python : .ml-service.log"
cyan "    → Logs Node   : .node-server.log"
cyan "════════════════════════════════════════════════════"
gold "  Ctrl-C pour tout arrêter proprement."
echo ""

# Bloquant — attend que l'un ou l'autre meure
wait -n "$ML_PID" "$NODE_PID"
cleanup
