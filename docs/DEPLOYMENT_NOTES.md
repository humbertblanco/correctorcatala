# Notes de la producció actual

> Estat del desplegament real del Corrector Català. Mantingues aquest fitxer al dia després de cada canvi a la VPS.

## API endpoint

**`https://corrector.damosenelblanco.com`**

| Recurs                | URL                                                  |
|-----------------------|------------------------------------------------------|
| Health                | `https://corrector.damosenelblanco.com/healthz`      |
| Llistat de llengües   | `https://corrector.damosenelblanco.com/v2/languages` |
| Comprovació de text   | `POST https://corrector.damosenelblanco.com/v2/check`|

## Servidor

| Concepte                | Valor                                                  |
|-------------------------|--------------------------------------------------------|
| Host                    | `37.187.151.83` (corrector.damosenelblanco.com)        |
| OS                      | AlmaLinux 9.7                                          |
| CPU / RAM               | 16-core AMD Ryzen 9700X / 62 GB RAM                    |
| Panel                   | Plesk Obsidian 18.0.77 (multi-tenant amb altres dominis)|
| Docker / Compose        | 29.4.3 / v5.1.3                                        |
| Domini pare a Plesk     | `damosenelblanco.com` (subscripció existent)           |

## Layout

```
/opt/corrector/                              # Codi font (sync des de l'extrem dev)
└── server/
    ├── docker-compose.yml                   # Profiles: default = només LT, "standalone" afegeix nginx+certbot
    ├── .env                                  # DOMAIN, EMAIL_FOR_LE, HOST_PORT=8011, JAVA_X*
    ├── plesk/
    │   ├── cc-corrector.conf.template        # server block override per nginx
    │   ├── cc-shared.conf                    # http-context map+zone
    │   ├── plesk-deploy.sh                   # script idempotent
    │   └── README.md
    └── scripts/                              # standalone helpers (no usats en aquest deploy)

/etc/nginx/conf.d/
├── aa-default-fallback.conf                  # default_server flag (vegeu "Gotcha #1")
├── cc-shared.conf                            # http-context: limit_req_zone cc_lt + map cc_cors_ok
└── cc-corrector.conf                         # server { } per a corrector.damosenelblanco.com (renderitzat)

/var/www/vhosts/system/corrector.damosenelblanco.com/   # Plesk vhost (gestiona TLS)
└── conf/
    └── nginx.conf                            # auto-generat per Plesk; el nostre cc-corrector.conf el sobrepuja per SNI
```

## Contenidors

```
NAME    IMAGE                              PORTS                          BIND
cc-lt   erikvl87/languagetool:latest       8010 (intern) / 8011 host      127.0.0.1
```

`docker compose up -d` (sense `--profile standalone`) → només `cc-lt` perquè els serveis nginx i certbot tenen `profiles: ["standalone"]`.

## Gotchas i fixes

### #1 — `default_server` cal explícit en un Plesk multi-tenant (incident 2026-05-07)

**Què va passar:** quan vaig afegir `cc-corrector.conf` a `/etc/nginx/conf.d/`, el meu server block va passar a ser el "primer definit" per a `37.187.151.83:443 ssl`. Cap altre block té el flag `default_server` (Plesk hi confia per ordre de càrrega), així que nginx va començar a fer servir el meu bloc com a catch-all per a tots els hostnames sense match — incloent `server.estic.online` (el hostname de la màquina), trencant l'accés a la pàgina del panell Plesk i a vhosts Apache-only com `21botons.com`.

**Solució:** afegit `/etc/nginx/conf.d/aa-default-fallback.conf` (fitxer al repo a `server/plesk/aa-default-fallback.conf`). És una còpia byte-per-byte de `/etc/nginx/plesk.conf.d/server.conf` amb el flag `default_server` afegit. El nom `aa-` el carrega abans que `cc-corrector.conf`, i el flag fa que nginx l'usi com a default explícit (regla guanya per damunt de l'ordre).

**Verificació post-fix:** `damosenelblanco.com`, `clients.damosenelblanco.com`, `appmuseus.damosenelblanco.com`, `gaudi.damosenelblanco.com`, `afabaix.org`, `annaribas.cat`, `ajudem.cat` retornen 200 igual que abans. `server.estic.online` torna a redirigir al login del panell (303 → `/login.php` → `/login_up.php`). `corrector.damosenelblanco.com/healthz` continua tornant `ok`.

**Risc futur:** si Plesk regenera mai el seu `server.conf` canviant el cert (`scfjcnnp04rhc3gctnlqlz`) o el comportament, cal re-sincronitzar la nostra còpia. Comprovar amb:
```bash
diff /etc/nginx/plesk.conf.d/server.conf /etc/nginx/conf.d/aa-default-fallback.conf
```

## Decisions específiques d'aquesta producció

1. **Plesk gestiona TLS**, no `certbot/certbot` del compose. Plesk renova cada 60-89 dies via la seva extensió oficial. El nostre server block referencia el fitxer de cert que Plesk genera (`/usr/local/psa/var/certificates/<hash>`) — `plesk-deploy.sh` el detecta automàticament.

2. **El server block sobrepuja** el de Plesk. Justificació tècnica detallada a `server/plesk/README.md` i `docs/INSTALL_SERVER.md` (secció B). Resum: Plesk no inclou `vhost_ssl_nginx.conf` automàticament al template, i forçar-lo via DB és fràgil. nginx accepta dos blocks amb el mateix `server_name` i guanya el primer carregat (`cc-corrector.conf` < `zz010_psa_nginx.conf` alfabèticament).

3. **Port localhost 8011** (no 8010). El port 8010 podria col·lidir amb futures eines del servidor; 8011 estava lliure. Configurable via `HOST_PORT` a `.env`.

4. **CORS allow-list restrictiva** (no `*`):
   - `chrome-extension://[a-z]{32}` (totes les extensions Chrome legítimes)
   - `moz-extension://[0-9a-f-]{36}` (Firefox)
   - `https://corrector.cat` (per si en futur tenim web pròpia al domini canònic)

5. **Rate limit**: 30 req/min per IP, burst 10 nodelay. Mesurat: 8 requests passen, 9è+ obtenen 429 fins al següent slot.

## Smoke test post-deploy

```bash
DOMAIN=corrector.damosenelblanco.com
curl -fsS "https://$DOMAIN/healthz"                                  # ok
curl -fsS "https://$DOMAIN/v2/languages" | jq '[.[].longCode] | map(select(startswith("ca-ES")))'
curl -fsS -X POST "https://$DOMAIN/v2/check" \
  --data-urlencode "text=Aixo es una prova" --data-urlencode "language=ca-ES" | jq '.matches | length'
```

Resultat esperat: `ok`, `["ca-ES","ca-ES-valencia","ca-ES-balear"]`, `2` o més matches.

## Manteniment

| Tasca                          | Cadència      | Comanda                                      |
|--------------------------------|---------------|----------------------------------------------|
| Actualitzar imatge LT          | Mensual       | `cd /opt/corrector/server && ./scripts/update.sh` |
| Renovar TLS                    | Auto (Plesk)  | (cap acció manual)                            |
| Re-render nginx config         | Si edites .env| `./plesk/plesk-deploy.sh`                     |
| Re-deploy complet              | Si fa falta   | Idem (idempotent)                             |

## Mètriques d'observabilitat (per fer)

- [ ] Configurar UptimeKuma per monitorar `/healthz`
- [ ] Exportar mètriques de LT (Java JMX a Prometheus, opcional)
- [ ] Alertes per 5xx o latència > 2s

## SSH

Accés a la VPS: clau ed25519 a `~/.ssh/corrector_vps_id` (instal·lada amb `ssh-copy-id` a `/root/.ssh/authorized_keys`). Test:

```bash
ssh -i ~/.ssh/corrector_vps_id root@37.187.151.83 'docker compose -f /opt/corrector/server/docker-compose.yml ps'
```

> ⚠️ La contrasenya de root va arribar per xat amb el prompt original. Recomanable:
> 1. Desactivar `PasswordAuthentication` a `/etc/ssh/sshd_config` (deixar només autenticació per clau)
> 2. Rotar la contrasenya de root quan es pugui
