# Arquitectura

## Visió general

```
┌──────────────────────────────────────────┐         ┌──────────────────────────┐
│ Pestanya del navegador                    │         │ VPS                       │
│                                          │         │                          │
│  ┌──────────────┐  message  ┌──────────┐ │  HTTPS  │ ┌──────────┐ HTTP ┌────┐ │
│  │ content.ts   │──────────▶│ background│─────────▶ │  nginx   │─────▶│ LT │ │
│  │ (per tab)    │  results  │ (sw)     │ │  CORS   │ │  TLS     │      │8010│ │
│  │ - editors    │◀──────────│ - cache  │◀───────── │ │  rate-lim│      └────┘ │
│  │ - marks      │           │ - settings│ │         │ │  CORS    │             │
│  │ - popup      │           │ - api    │ │         │ └──────────┘             │
│  └──────────────┘           └──────────┘ │         │                          │
└──────────────────────────────────────────┘         └──────────────────────────┘
```

## Decisions clau i raons

### El service worker fa les crides HTTPS, no el content script
Els content scripts viuen dins l'origen de la pàgina amfitriona. Llocs amb CSP estricte (Twitter/X, Facebook, GitHub) bloquegen `fetch` cap a tercers. El service worker té un origen propi i fix, així que CORS només cal configurar-lo per a `chrome-extension://<id>` i prou.

### CSS Custom Highlight API per a contenteditable
La forma més comuna de pintar subratllats sobre `[contenteditable]` és embolicar les paraules amb errors en `<span>`s. Això **muta el DOM de l'usuari**, trenca *frameworks* (React, ProseMirror) i sovint provoca pèrdua de cursor.

L'API [`CSS.highlights`](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API) (Chromium ≥ 105) ens permet declarar Ranges decoratius **sense tocar el DOM**. El cost: hit-testing dels clics requereix `caretRangeFromPoint`/`caretPositionFromPoint` per saber on s'ha clicat, que és el que fem a `lib/editors/contenteditable.ts`.

### Mirror-overlay per a `<textarea>`
`<textarea>` no exposa la seva estructura interna de glyphs. La tècnica establerta (Grammarly, GhostText) és clonar el textarea com un `<div>` absolutament posicionat amb tots els estils computats sincronitzats, i pintar-hi els marcadors. És el que implementa `lib/editors/textarea.ts`.

### Detecció de variant per heurística simple
LanguageTool té diccionaris diferents per a estàndard, valencià i balear. Detectar-ho automàticament val la pena perquè l'usuari mitjà no sap que ha de triar.

L'algorisme (`lib/dialect-detect.ts`) busca **tokens marcadors** distintius (p. ex., `hui`, `noltros`) amb pesos. Si el text supera un llindar i una variant domina amb un ratio ≥ 1.8 sobre l'altra, l'aplica. Si no, *fallback* a `ca-ES`.

És intencionadament conservador. Una mala detecció introdueix falsos positius (text marcat com a error perquè la variant està mal seleccionada). Preferim ser neutrals i deixar l'override manual a la popup.

### Cau LRU al service worker
Quan l'usuari fa **typo → ctrl-z → re-typo**, fins i tot un debounce de 700ms genera 3 peticions idèntiques. La cau LRU per `(text, variant)` les redueix a 1.

50 entrades són suficients (~25 KB de matches a memòria, descartable).

### Llicència
Tot el repositori és **AGPLv3**. La justificació:

- LanguageTool és LGPL 2.1. **No l'enllacem** — només cridem la seva API HTTP. La crida per xarxa **no és obra derivada** sota la jurisprudència de LGPL/AGPL. Per tant, no hi ha cap obligació legal de cap llicència concreta per a la nostra extensió.
- AGPLv3 és la llicència triada perquè és coherent amb l'ecosistema (LT, Softcatalà) i evita que algú clonï el nostre kit d'autohostatge i el comercialitzi com a SaaS sense compartir les modificacions.
- Si en el futur tercers volen contribuir amb codi més ergonòmic per a Chrome Web Store i prefereixen MIT, podem dual-licenciar només `extension/`. `server/` es queda AGPL.

## Fluxos principals

### Inicialització de pestanya

1. `content.ts` s'injecta a `document_idle`.
2. Llegeix la configuració. Si està desactivat o el domini és exclós, surt.
3. Escaneja `EDITOR_SELECTOR` i adjunta un `EditorAdapter` per element trobat.
4. Inicia un `MutationObserver` per detectar editors afegits dinàmicament (SPA, etc.).
5. Per cada adapter, fa una primera comprovació amb un retard de 200 ms.

### Cicle de comprovació

1. L'usuari escriu → l'adapter emet `onTextChange`.
2. `content.ts` programa un `setTimeout` (700 ms). Si arriben més canvis, es cancel·la i es reprograma.
3. Quan dispara, llegeix el text actual, calcula la variant resolta i envia un missatge `check` al background.
4. El background:
   - Si està desactivat globalment → torna `{ matches: [] }`.
   - Mira el cau → si hit, torna sense fer fetch.
   - Si miss, fa `POST /v2/check` al servidor → desa al cau → filtra paraules del diccionari personal → torna.
5. `content.ts` rep el resultat. Si el text actual ja no és el que va enviar, ignora la resposta (cursa: text canviat). Si no, demana a l'adapter que renderitzi `setMatches(matches)`.

### Aplicar suggeriment

1. L'usuari clica un subratllat. L'adapter detecta el match i emet `onMatchClick(idx, rect)`.
2. `content.ts` mostra `SuggestionCard` (component Shadow DOM, mount únic per pestanya) ancorat a `rect`.
3. L'usuari clica una substitució → `onApply(replacement)` crida `adapter.applyReplacement(offset, length, value)`.
4. L'adapter modifica el text **i emet `input`** perquè els *frameworks* del lloc se sincronitzin.
5. `content.ts` força un re-check (text canviat).

## Mòduls

| Mòdul                                   | Responsabilitat                                            |
|-----------------------------------------|------------------------------------------------------------|
| `entrypoints/background.ts`             | Router de missatges, cau LRU, client API                   |
| `entrypoints/content.ts`                | Orquestrador: detecta editors, gestiona cicle de check     |
| `entrypoints/popup/`                    | Popup ràpid: enabled, variant, desactivar domini           |
| `entrypoints/options/`                  | Configuració: server, dict, dominis                        |
| `lib/api.ts`                            | `POST /v2/check` + `GET /v2/languages`                     |
| `lib/cache.ts`                          | LRU de matches, key=`sha256(text|variant)`                  |
| `lib/dialect-detect.ts`                 | Heurística de detecció de variant                          |
| `lib/settings.ts`                       | Wrapper tipat sobre `chrome.storage.sync` + helpers        |
| `lib/messaging.ts`                      | `sendToBackground` i `onMessage` tipats                    |
| `lib/i18n.ts`                           | `t(key)` + helpers de variant a label                      |
| `lib/editors/types.ts`                  | Interfície `EditorAdapter`                                 |
| `lib/editors/textarea.ts`               | Adapter per `<textarea>` i `<input>` mitjançant mirror     |
| `lib/editors/contenteditable.ts`        | Adapter per `[contenteditable]` via CSS Highlight API      |
| `components/SuggestionCard.ts`          | Popup Shadow DOM amb suggeriments                          |

## Backend

| Servei      | Imatge                              | Funció                            |
|-------------|-------------------------------------|-----------------------------------|
| languagetool | `erikvl87/languagetool:latest`       | Motor LT, port intern 8010        |
| nginx       | `nginx:1.27-alpine`                  | TLS, CORS, rate-limit             |
| certbot     | `certbot/certbot:latest`             | Renovació de certificat (12h)     |

El nginx renderitza `nginx/templates/api.conf.template` a través d'`envsubst` (funció pròpia de la imatge oficial).
