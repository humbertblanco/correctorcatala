# Plesk deployment kit

Aquest directori conté els artefactes específics per desplegar el Corrector Català darrere d'un Plesk Obsidian existent — la situació real de la nostra producció a `corrector.damosenelblanco.com`.

## Quan fer servir aquest mode

| Situació                                            | Mode recomanat                          |
|-----------------------------------------------------|-----------------------------------------|
| VPS net, només per al corrector                     | `scripts/bootstrap.sh` (standalone)     |
| VPS Plesk amb altres dominis                        | **Aquest kit** (`plesk-deploy.sh`)      |
| Detecció de tunel Cloudflare / Traefik / k8s         | Variant equivalent (proxy a `127.0.0.1:${HOST_PORT}`) |

## Per què no usem "Additional nginx directives" del panel

Plesk Obsidian té un camp "Apache & nginx Settings → Additional nginx directives" que escriu a `/var/www/vhosts/system/<domain>/conf/vhost_ssl_nginx.conf`. **Però el template per defecte no inclou aquest fitxer**: l'inclou només si la base de dades de Plesk té un registre que ho indica, registre que es crea automàticament quan es desa des del panell. Forçar aquest registre per CLI és fràgil (taules sense ID estables, sense una flag pública).

Solució: **bypass clean**. Escrivim un server block propi a `/etc/nginx/conf.d/cc-corrector.conf`. Aquest fitxer es carrega abans que el de Plesk (alfabèticament `cc-...` < `zz010_psa_nginx.conf`), guanya per SNI i nginx només avisa amb un `[warn] conflicting server name` (inofensiu).

Plesk continua gestionant l'emissió i renovació del certificat — només "redirigim" el trànsit del subdomini cap al nostre LanguageTool local.

## Fitxers

| Fitxer                              | Què fa                                                                  |
|-------------------------------------|-------------------------------------------------------------------------|
| `cc-shared.conf`                    | http-context: rate-limit zone + CORS allow-list. Va a `/etc/nginx/conf.d/`. |
| `cc-corrector.conf.template`        | server block, renderitzat amb `envsubst` per `plesk-deploy.sh`.         |
| `plesk-deploy.sh`                   | Script idempotent: crea subdomini, emet LE, instal·la configs, recarrega nginx, smoke-test. |
| `README.md`                         | Aquest document.                                                        |

## Ús

```bash
cd /opt/corrector/server
cp .env.example .env
$EDITOR .env                # DOMAIN, EMAIL_FOR_LE, HOST_PORT (per defecte 8011)
docker compose up -d        # arrenca LT a 127.0.0.1:${HOST_PORT}
./plesk/plesk-deploy.sh     # crea subdomini Plesk + LE + nginx override
```

Re-execució més tard (canvis a `.env` o als fitxers): `./plesk/plesk-deploy.sh` un altre cop. És idempotent.

## Renovació TLS

Plesk renova automàticament el certificat (els seus cron's d'extensió `letsencrypt`). El nostre server block apunta al fitxer que Plesk manté, així que la renovació funciona sense canvis al nostre costat.

## Desfer (cleanup)

```bash
rm /etc/nginx/conf.d/cc-corrector.conf /etc/nginx/conf.d/cc-shared.conf
systemctl reload nginx
docker compose down
plesk bin subdomain --remove corrector -domain damosenelblanco.com   # opcional
```
