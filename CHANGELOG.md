# Changelog

Tots els canvis notables al **Corrector Català** es documenten en aquest fitxer.

El format segueix [Keep a Changelog](https://keepachangelog.com/ca/1.1.0/) i el projecte fa servir [Versionat semàntic](https://semver.org/lang/ca/).

## [Unreleased]

(canvis encara no llançats)

## [0.2.0] – 2026-05-08

### Added
- **Mode fosc** automàtic via `prefers-color-scheme: dark` a la landing (CA + ES), al popup, a la pàgina d'opcions, al popup de suggeriments i al toast.
- **Indicador "comprovant"** (StatusIndicator): petit pip vermell que pulsa al cantó superior dret de l'editor mentre s'està fent una crida al servidor.
- **Toast d'error de xarxa**: si el servidor del corrector no respon, l'usuari ho sap (rate-limited a 30 s perquè no spam).
- **Pàgina de privadesa hostatjada al web** (CA + ES) a `/privacy.html` i `/privacy.es.html`. Substitueix l'enllaç a GitHub des de la landing i serveix d'URL estable per al Chrome Web Store.
- **Imatge Open Graph + Twitter Card** (1200×630) per a previews quan es comparteix la URL.
- **Tests automatitzats** del detector de variant (Vitest, 23 casos cobrint ca-ES / ca-ES-valencia / ca-ES-balear / es i edge cases).
- **CHANGELOG.md** (aquest fitxer).
- **README ampliat** amb captures de la landing en clar i fosc, agraïments a Damos en el Blanco i estat del projecte.

### Changed
- Detector de variant **reforçat per a castellà**: afegits marcadors `-ción`, `-mente`, formes verbals comunes (`sido`, `hecho`, `será`, `sería`...), substantius freqüents (`cliente`, `pedido`, `prueba`, `errores`...), i baixat el llindar `ES_FLOOR` de 4 a 3 perquè text castellà sense `ñ` ni pronoms personals encara es detecti.
- Crèdit a Damos en el Blanco al footer ampliat: "agència creativa i tecnològica a Barcelona".

### Fixed
- **Bug crític**: l'extensió no permetia escriure al cercador de Google ni a altres camps amb layouts flex/grid estrictes. Causa: `TextareaAdapter` envoltava l'input amb un `<div>` (`wrapper.appendChild(el)`) durant el `focusin`; això blurr-ejava l'element mid-event i rompia el layout. **Fix**: el mirror viu ara a `document.body` amb `position: fixed`, sense embolicar l'input. Re-alineat al rect del textarea via window scroll/resize listeners (rAF-coalesced).
- **Cache de `flattenText()`** dins ContentEditableAdapter: abans es feia 3× per click; ara 1× per render-window, invalidat al següent `scheduleRender()`.
- **Debounce a TextareaAdapter**: el render del mirror estava sense debounce; ara 80 ms igual que ContentEditableAdapter.
- **Scroll listener a TextareaAdapter** ara coalesced via `requestAnimationFrame`.
- **AbortController per al outsideClickListener** del SuggestionCard, garantint cleanup en navigation SPA.

## [0.1.0] – 2026-05-07

Versió inicial del projecte.

### Added
- **Backend**: `erikvl87/languagetool` Docker autohostat a `corrector.damosenelblanco.com` (LT bound a `127.0.0.1:8011` darrere de nginx de Plesk amb override + Let's Encrypt).
- **Extensió Chrome MV3** amb WXT 0.20 + TypeScript:
  - Adapter de `<textarea>`/`<input>` via mirror-overlay.
  - Adapter de `[contenteditable]` via CSS Custom Highlight API.
  - Suggestion popup en Shadow DOM.
  - Lazy-attach via `focusin` per minimitzar observers actius.
  - Detecció heurística de variant: ca-ES / ca-ES-valencia / ca-ES-balear / es.
  - UI 100 % en català (`_locales/ca/messages.json`).
  - Diccionari personal + llista de dominis desactivats (sincronitzats via `chrome.storage.sync`).
  - Toast informatiu a Google Docs / Notion explicant la limitació del canvas-rendered.
  - Botó "Obre text al corrector web" al popup que envia la selecció de la pestanya activa al demo de la landing.
  - Icones reals (rounded rectangle + "C" + ratlla ondulada) en 5 mides.
- **Landing pública** a `corrector.damosenelblanco.com` (CA + ES) amb demo en viu connectant-se a `/v2/check` i descàrrega del ZIP.
- **Documentació**: install (usuari + administrador), arquitectura, política de privadesa, notes de desplegament, contribuir.
- **GitHub Actions workflows** (CI per a typecheck + multi-browser build, release per a tag → ZIP). _Pendents de pujar quan el token tingui scope `workflow`._
- **Llicència AGPLv3**.

### Fixed
- `default_server` de nginx en entorn Plesk multi-tenant: el bloc del corrector deixava de ser default explícit, que passava a apropiar-se de `server.estic.online`. Solucionat amb `aa-default-fallback.conf` que replica el catch-all de Plesk amb el flag `default_server`.
- `_locales/` no s'incloïa al build de WXT (movent-lo a `extension/public/`).
- Avís "extensió alenteix el navegador" en SPAs com Drive/Twitter: throttling del MutationObserver global + skip dels nostres propis nodes (`data-cc`).

[Unreleased]: https://github.com/humbertblanco/correctorcatala/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/humbertblanco/correctorcatala/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/humbertblanco/correctorcatala/releases/tag/v0.1.0
