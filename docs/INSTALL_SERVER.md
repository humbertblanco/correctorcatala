# Autohostatge del servidor

Aquesta guia cobreix les **dues maneres** d'aixecar el backend del Corrector Català. Tria la que encaixi amb la teva infraestructura:

| Mode                                           | Quan fer-lo servir                                                            | Script                          |
|------------------------------------------------|-------------------------------------------------------------------------------|---------------------------------|
| **A. Standalone**                              | VPS net, Docker és l'única cosa que escolta als ports 80/443                  | `scripts/bootstrap.sh`          |
| **B. Darrere d'un Plesk**                      | El servidor ja té Plesk amb altres dominis i un nginx propi                   | `plesk/plesk-deploy.sh`         |
| C. Darrere d'un altre proxy (Cloudflare Tunnel, Traefik, k8s...) | Vols que el teu balancer existent enviï a `127.0.0.1:${HOST_PORT}`            | (manual; consulta el mode B com a referència) |

Tots tres modes comparteixen el mateix contenidor LanguageTool. La diferència és **qui termina TLS i fa de reverse proxy**.

---

## Requisits comuns

- Linux amb Docker i Docker Compose v2 (`docker compose version` ha de dir 2.x).
- ≥ 1 GB de RAM lliure (recomanat 2-4 GB amb `JAVA_XMX=4g`).
- 5 GB de disc lliures.
- Domini/subdomini amb DNS A/AAAA apuntant a la IP del servidor.
- Ports 80 i 443 oberts a Internet.

---

## A. Mode standalone (VPS net)

```bash
git clone https://github.com/humbertblanco/correctorcatala.git
cd correctorcatala/server
cp .env.example .env
$EDITOR .env                # DOMAIN=, EMAIL_FOR_LE=
./scripts/bootstrap.sh      # primera emissió cert + arrencada
```

`bootstrap.sh` aixeca **tres serveis**:
- `cc-lt` (LanguageTool, port intern 8010, exposat a `127.0.0.1:8010` per defecte)
- `cc-nginx` (TLS termination, CORS, rate-limit; ports 80/443)
- `cc-certbot` (renovació Let's Encrypt cada 12h)

Test:

```bash
./scripts/healthz.sh
```

L'script imprimeix les 3 variants catalanes detectades i un resum dels matches per a tres frases de prova (ca-ES, ca-ES-valencia, ca-ES-balear).

---

## B. Darrere d'un Plesk

Aquesta és la nostra producció real (`https://corrector.damosenelblanco.com`).

### Per què no fem servir el camp "Additional nginx directives" del panell

Plesk Obsidian té un camp "Apache & nginx Settings → Additional nginx directives" que escriu a `/var/www/vhosts/system/<domain>/conf/vhost_ssl_nginx.conf`. **Però el template per defecte de Plesk no inclou aquest fitxer** — el registre que fa que s'inclogui es crea per la base de dades quan deses des del panell. Forçar-lo per CLI és fràgil (esquema sense una flag pública estable).

Solució neta: un **server block propi** a `/etc/nginx/conf.d/cc-corrector.conf` que es carrega abans del bloc auto-generat de Plesk (`zz010_psa_nginx.conf`) i guanya per SNI. nginx avisa amb `[warn] conflicting server name` (inofensiu). Plesk continua mantenint el certificat (incloses les renovacions automàtiques).

### Procediment

```bash
ssh root@<servidor-plesk>

# 1. Clona el repo i posa la configuració
git clone https://github.com/humbertblanco/correctorcatala.git /opt/corrector
cd /opt/corrector/server
cp .env.example .env
$EDITOR .env
#   DOMAIN=corrector.exemple.cat       (subdomini sota un domini que Plesk ja gestiona)
#   EMAIL_FOR_LE=tu@exemple.cat
#   HOST_PORT=8011                      (port localhost; tria un que no estigui ocupat)
#   JAVA_XMS=1g
#   JAVA_XMX=4g

# 2. Arrenca LT en localhost (sense nginx propi — Plesk fa de proxy)
docker compose up -d
docker compose ps                       # cc-lt ha d'estar (healthy) en ~30-60s

# 3. Crea subdomini Plesk + emet LE + instal·la el server block override
./plesk/plesk-deploy.sh
```

`plesk-deploy.sh` és idempotent — pots tornar-lo a executar després de:
- Editar `.env` (canviar el port, dominis, etc.)
- Editar la plantilla `plesk/cc-corrector.conf.template`
- Renovar manualment el certificat
- Re-llegir la ruta del cert (Plesk pot canviar-la)

### Comprovació

```bash
curl https://corrector.exemple.cat/healthz                   # → ok
curl https://corrector.exemple.cat/v2/languages | jq         # → llista amb ca-ES, ca-ES-valencia, ca-ES-balear
./scripts/healthz.sh corrector.exemple.cat                   # bateria completa de tests
```

### Detalls que cal recordar

- **Port localhost**: `${HOST_PORT}` (per defecte 8011). Si en futur en vols un altre, edita `.env` i torna a executar `plesk-deploy.sh` (re-renderitza la plantilla).
- **Certificat**: el manté Plesk. La nostra plantilla referencia el fitxer `${CERT_FILE}` que Plesk genera (típicament `/usr/local/psa/var/certificates/<hash>`). El deploy script el detecta automàticament.
- **Logs nginx**: `/var/www/vhosts/system/${DOMAIN}/logs/proxy_access_ssl_log` (Plesk els roti).
- **Logs LT**: `docker compose logs -f`.
- **Renovació**: 100% automàtica via Plesk. No has de fer res.

---

## Operacions habituals

```bash
# Veure logs
docker compose logs -f                                          # LT
tail -f /var/www/vhosts/system/${DOMAIN}/logs/proxy_*_log       # nginx (mode B)
docker compose logs -f nginx                                    # nginx (mode A)

# Aturar
docker compose down

# Actualitzar la imatge LT
./scripts/update.sh

# Re-renderitzar la config nginx (mode B)
./plesk/plesk-deploy.sh

# Re-emetre el certificat manualment (mode A — només si la renovació falla)
docker compose run --rm certbot certonly --webroot -w /var/www/certbot -d ${DOMAIN} -m ${EMAIL_FOR_LE} --force-renewal
```

---

## Dimensionament

| Càrrega                    | RAM mínima | CPU |
|----------------------------|-----------:|----:|
| Personal (un usuari)       |       1 GB |   1 |
| Comunitat petita (~50 us.) |       2 GB |   1 |
| Comunitat mitjana (~500)   |       4 GB |   2 |
| Pública oberta             |     8+ GB  |  4+ |

Els endpoints `/v2/check` són CPU-bound durant 100-500 ms per request. Per a més concurrència ajusta `langtool_maxCheckThreads` a `docker-compose.yml`.

---

## Resolució de problemes

### `bootstrap.sh` falla emetent el certificat (mode A)

- DNS encara no propagat → espera 5-10 min.
- Port 80 bloquejat → comprova `iptables` / firewall del proveïdor.
- "challenge unauthorized" → un altre servei escolta el port 80. Atura'l i reintenta.

### `plesk-deploy.sh` falla amb "Plesk subdomain not found" (mode B)

L'script intenta crear-lo, però necessita que el **domini pare** ja existeixi com a subscripció a Plesk. Crea'l manualment al panell o per CLI:

```bash
plesk bin domain --create exemple.cat ...
```

### El navegador veu "ERR_CERT_AUTHORITY_INVALID"

- Mode A: certbot encara no ha emès. Mira `docker compose logs certbot`.
- Mode B: Plesk ha pogut fer 'self-signed' inicial. Espera un minut i prova de nou; si persisteix, executa `plesk bin extension --exec letsencrypt cli.php -d ${DOMAIN} -m ${EMAIL_FOR_LE}`.

### LT consumeix massa RAM

Baixa `JAVA_XMX` a `2g` o `1g` a `.env` i `docker compose up -d --force-recreate cc-lt`.

### nginx avisa "conflicting server name" en mode B

Esperable. El nostre server block es carrega abans que el de Plesk; nginx avisa però usa el nostre (correcte). No cal acció.
