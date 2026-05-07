#!/usr/bin/env bash
# Bootstrap: first-time TLS certificate issuance via Let's Encrypt + bring stack up.
# Idempotent: if a cert already exists, skips re-issuance and just brings the stack up.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "Falta server/.env. Copia .env.example a .env i edita DOMAIN i EMAIL_FOR_LE." >&2
  exit 1
fi

# shellcheck disable=SC1091
source .env

if [[ -z "${DOMAIN:-}" || -z "${EMAIL_FOR_LE:-}" ]]; then
  echo "DOMAIN i EMAIL_FOR_LE han d'estar definits a .env" >&2
  exit 1
fi

echo ">> Bootstrap per a $DOMAIN (correu LE: $EMAIL_FOR_LE)"

# Step 1: stand up a temporary HTTP-only nginx so certbot can complete the ACME challenge.
mkdir -p certbot/www certbot/conf logs/nginx

if [[ -f "certbot/conf/live/${DOMAIN}/fullchain.pem" ]]; then
  echo ">> Ja existeix un certificat per a $DOMAIN. Salto la primera emissió."
else
  echo ">> Aixecant nginx HTTP-only temporal per a la primera emissió..."
  cat > nginx/conf.d/_bootstrap.conf <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 200 "bootstrap\\n"; }
}
EOF
  # Run nginx alone (no LT yet — image hasn't pulled / config refers to certs that don't exist yet).
  docker compose run --rm --no-deps -p 80:80 -d --name cc-nginx-bootstrap \
    --entrypoint "/bin/sh" nginx -c "echo 'events {} http { include /etc/nginx/conf.d/_bootstrap.conf; }' > /etc/nginx/nginx.conf && nginx -g 'daemon off;'"

  trap 'docker rm -f cc-nginx-bootstrap >/dev/null 2>&1 || true; rm -f nginx/conf.d/_bootstrap.conf' EXIT

  sleep 3
  echo ">> Demanant certificat Let's Encrypt (webroot)..."
  docker compose run --rm certbot certonly \
    --webroot -w /var/www/certbot \
    --email "${EMAIL_FOR_LE}" \
    -d "${DOMAIN}" \
    --agree-tos --no-eff-email \
    --non-interactive

  docker rm -f cc-nginx-bootstrap >/dev/null 2>&1 || true
  rm -f nginx/conf.d/_bootstrap.conf
  trap - EXIT
fi

echo ">> Renderitzant la configuració definitiva de nginx..."
# The official nginx image renders /etc/nginx/templates/*.template -> /etc/nginx/conf.d/*.conf via envsubst.
# We mount templates/ already; nothing else needed at our end.

echo ">> Aixecant l'estack complet (LT + nginx + certbot, perfil standalone)..."
docker compose --profile standalone up -d

echo ">> Esperant que LanguageTool estigui sa..."
for i in {1..30}; do
  if docker compose ps --format '{{.Health}}' languagetool 2>/dev/null | grep -q "healthy"; then
    echo ">> LT sa."
    break
  fi
  sleep 3
  echo -n "."
done
echo

echo ">> Provant l'API local..."
if curl -fsS "https://${DOMAIN}/healthz" >/dev/null; then
  echo ">> OK: https://${DOMAIN}/healthz respon."
else
  echo "!! /healthz no respon. Comprova logs amb: docker compose logs -f nginx" >&2
  exit 2
fi

cat <<EOF

✅ Bootstrap completat.

Prova:
  curl -X POST "https://${DOMAIN}/v2/check" \\
    --data-urlencode "text=Aixo es una prova" \\
    --data-urlencode "language=ca-ES"

Logs:    docker compose logs -f
Aturar:  docker compose down
Actualitzar: ./scripts/update.sh
EOF
