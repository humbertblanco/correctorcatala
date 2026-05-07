#!/usr/bin/env bash
# Reproducible Plesk deployment for the Corrector Català backend.
# Run on the Plesk-managed VPS as root.
#
# Idempotent: safe to re-run after edits to .env or to the template files.
#
# Steps:
#   1. Validate Plesk subdomain exists (creates it if missing).
#   2. Issue Let's Encrypt certificate via Plesk's extension.
#   3. Write http-context shared file (rate-limit zone + CORS map).
#   4. Render cc-corrector.conf from template into /etc/nginx/conf.d/.
#   5. nginx -t and reload.
#   6. Smoke-test /healthz, /v2/languages, /v2/check.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "Falta server/.env (copia .env.example i edita DOMAIN, EMAIL_FOR_LE, HOST_PORT)." >&2
  exit 1
fi
# shellcheck disable=SC1091
source .env

: "${DOMAIN:?DOMAIN ha d'estar a .env}"
: "${EMAIL_FOR_LE:?EMAIL_FOR_LE ha d'estar a .env}"
: "${HOST_PORT:=8011}"

PARENT_DOMAIN=${DOMAIN#*.}
SUBNAME=${DOMAIN%%.*}
LISTEN_IP=${LISTEN_IP:-$(ip -4 -o addr show scope global | awk '{print $4}' | cut -d/ -f1 | head -1)}

echo ">> Subdomini Plesk: $DOMAIN (sota $PARENT_DOMAIN)"
if ! plesk bin domain --info "$DOMAIN" >/dev/null 2>&1; then
  echo ">> Creant subdomini..."
  plesk bin subdomain --create "$SUBNAME" -domain "$PARENT_DOMAIN" -ssl true -ssl-redirect true
else
  echo ">> Ja existeix."
fi

echo ">> Emissió/renovació de certificat Let's Encrypt..."
plesk bin extension --exec letsencrypt cli.php -d "$DOMAIN" -m "$EMAIL_FOR_LE" 2>&1 || {
  echo "!! L'emissió ha fallat. Comprova que el DNS apunta i que els ports 80/443 són oberts." >&2
  exit 2
}

echo ">> Detectant ruta del certificat de Plesk..."
NGINX_VHOST=/var/www/vhosts/system/${DOMAIN}/conf/nginx.conf
CERT_FILE=$(grep -m1 'ssl_certificate ' "$NGINX_VHOST" | awk -F'"' '{print $2}')
if [[ -z "$CERT_FILE" || ! -f "$CERT_FILE" ]]; then
  echo "!! No he trobat la ruta del certificat: $CERT_FILE" >&2
  exit 3
fi
LOG_DIR=/var/www/vhosts/system/${DOMAIN}/logs
echo "   $CERT_FILE"

echo ">> Instal·lant fitxer http-context (cc-shared.conf)..."
install -m 0644 plesk/cc-shared.conf /etc/nginx/conf.d/cc-shared.conf

echo ">> Renderitzant cc-corrector.conf (envsubst) per a /etc/nginx/conf.d/..."
DOMAIN="$DOMAIN" LISTEN_IP="$LISTEN_IP" CERT_FILE="$CERT_FILE" UPSTREAM_PORT="$HOST_PORT" LOG_DIR="$LOG_DIR" \
  envsubst '$DOMAIN $LISTEN_IP $CERT_FILE $UPSTREAM_PORT $LOG_DIR' \
  < plesk/cc-corrector.conf.template > /etc/nginx/conf.d/cc-corrector.conf
chmod 644 /etc/nginx/conf.d/cc-corrector.conf

echo ">> nginx -t..."
nginx -t

echo ">> Recarregant nginx..."
systemctl reload nginx

echo ">> Esperant que el contenidor LT estigui sa..."
for i in $(seq 1 30); do
  status=$(docker inspect --format '{{.State.Health.Status}}' cc-lt 2>/dev/null || echo absent)
  if [[ "$status" = "healthy" ]]; then break; fi
  if [[ "$status" = "absent" ]]; then
    echo "!! El contenidor cc-lt no existeix. Executa primer: docker compose up -d" >&2
    exit 4
  fi
  sleep 2
done

echo ">> Smoke test contra https://${DOMAIN}/ ..."
curl -fsS "https://${DOMAIN}/healthz" >/dev/null && echo "  ✓ /healthz"
curl -fsS "https://${DOMAIN}/v2/languages" | grep -q ca-ES-balear && echo "  ✓ /v2/languages (ca-ES-balear present)"
curl -fsS -X POST "https://${DOMAIN}/v2/check" \
  --data-urlencode "text=Aixo es una prova" --data-urlencode "language=ca-ES" \
  | grep -q '"matches"' && echo "  ✓ /v2/check (ca-ES)"

cat <<EOF

✅ Desplegament Plesk completat.

API:        https://${DOMAIN}
Health:     https://${DOMAIN}/healthz
LT upstream: 127.0.0.1:${HOST_PORT} (només localhost)

Logs:
  docker compose logs -f                      # LT
  tail -f ${LOG_DIR}/proxy_access_ssl_log     # nginx access
  tail -f ${LOG_DIR}/proxy_error_log          # nginx errors

Re-render config:  ./plesk/plesk-deploy.sh
Actualitzar LT:    ./scripts/update.sh
EOF
