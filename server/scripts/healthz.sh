#!/usr/bin/env bash
# Smoke test against a deployed instance. Exits 0 on success.
# Usage: ./healthz.sh [domain]   (default: $DOMAIN from .env, or localhost:443)
set -euo pipefail

cd "$(dirname "$0")/.."

DOMAIN_ARG="${1:-}"
if [[ -z "$DOMAIN_ARG" ]]; then
  if [[ -f .env ]]; then
    # shellcheck disable=SC1091
    source .env
    DOMAIN_ARG="${DOMAIN:-localhost}"
  else
    DOMAIN_ARG="localhost"
  fi
fi

URL="https://${DOMAIN_ARG}"

echo "== /healthz =="
curl -fsS "${URL}/healthz"

echo
echo "== /v2/languages (Catalan codes present?) =="
curl -fsS "${URL}/v2/languages" | grep -o '"longCode":"ca-ES[A-Za-z-]*"' | sort -u

echo
echo "== /v2/check (ca-ES) =="
curl -fsS -X POST "${URL}/v2/check" \
  --data-urlencode "text=Aixo es una prova de la gramatica catalana." \
  --data-urlencode "language=ca-ES" | grep -o '"id":"[^"]*"' | head -5

echo
echo "== /v2/check (ca-ES-valencia) =="
curl -fsS -X POST "${URL}/v2/check" \
  --data-urlencode "text=Hui anirem a la platja amb este xicot." \
  --data-urlencode "language=ca-ES-valencia" | grep -o '"id":"[^"]*"' | head -5

echo
echo "== /v2/check (ca-ES-balear) =="
curl -fsS -X POST "${URL}/v2/check" \
  --data-urlencode "text=Es nin va anar a sa platja amb noltros." \
  --data-urlencode "language=ca-ES-balear" | grep -o '"id":"[^"]*"' | head -5

echo
echo "OK"
