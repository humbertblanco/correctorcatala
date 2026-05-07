# Corrector Català

> Correcció ortogràfica i gramatical en català, lliure i sense subscripcions, per al teu navegador.

LanguageTool va passar la seva extensió oficial a **Premium-only** el gener del 2025. Aquest projecte ofereix un substitut **gratuït i autohostat** que aprofita el motor LanguageTool de codi obert (LGPL) i les regles catalanes que la comunitat hi manté.

## Característiques

- ✅ Corrector ortogràfic i gramatical en **català** complet
- ✅ Suport per a **català estàndard, valencià i balear** (amb detecció automàtica)
- ✅ Interfície **100% en català**
- ✅ **Privadesa**: el teu text només va al servidor que tu controlis
- ✅ Codi obert (AGPLv3), gratuït per sempre
- ✅ Diccionari personal i llista de dominis on desactivar-lo

## Estructura del repositori

```
correctorcatala/
├── extension/      # Extensió Chrome MV3 (WXT + TypeScript)
├── server/         # Docker Compose: LanguageTool + nginx + Let's Encrypt
└── docs/           # Documentació tècnica i d'usuari
```

## Estat actual

- **API en producció**: `https://corrector.damosenelblanco.com`
- **Extensió**: en desenvolupament. Build local funciona; pendent de publicació al Chrome Web Store.

## Instal·lació

- **Per a usuaris finals**: vegeu [`docs/INSTALL.md`](docs/INSTALL.md).
- **Per administrar el teu propi servidor**: [`docs/INSTALL_SERVER.md`](docs/INSTALL_SERVER.md) (cobreix mode standalone i mode Plesk).
- **Notes del desplegament real**: [`docs/DEPLOYMENT_NOTES.md`](docs/DEPLOYMENT_NOTES.md).
- **Política de privadesa**: [`docs/PRIVACY.md`](docs/PRIVACY.md).
- **Decisions arquitectòniques**: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Desenvolupament

Cal Node.js ≥ 20 i `pnpm`.

```bash
pnpm install
pnpm dev               # arrenca l'extensió en mode hot-reload (Chromium)
pnpm build             # build de producció
pnpm zip               # genera el ZIP per pujar al Chrome Web Store
```

Per al servidor:

```bash
cd server
cp .env.example .env   # edita DOMAIN i EMAIL_FOR_LE
./scripts/bootstrap.sh # primera emissió del certificat + arrencada
```

## Agraïments

Aquest projecte no existiria sense:

- [LanguageTool](https://languagetool.org) — el motor (LGPL 2.1) que fa la feina pesada.
- [Softcatalà](https://www.softcatala.org) — manté les regles i diccionaris catalans més complets del món del programari lliure ([catalan-dict-tools](https://github.com/Softcatala/catalan-dict-tools), contribucions a LanguageTool).
- [erikvl87/docker-languagetool](https://github.com/Erikvl87/docker-languagetool) — la imatge Docker que utilitzem.

## Llicència

[AGPLv3](LICENSE). Si fas servir el codi del servidor en un servei accessible per xarxa, has de publicar les teves modificacions sota la mateixa llicència.

## Contribuir

Vegeu [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md). Hi ha feina a fer i les *pull requests* són benvingudes.
