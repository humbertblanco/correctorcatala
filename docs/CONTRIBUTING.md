# Contribuir

Gràcies per voler contribuir al Corrector Català!

## Regles de joc bàsiques

- Tot el codi es publica sota AGPLv3.
- Les comunicacions principals són en català.
- Sigues respectuós: el [Codi de conducta del Contributor Covenant](https://www.contributor-covenant.org/ca/version/2/1/code_of_conduct/) hi aplica.

## Setup de desenvolupament

```bash
git clone https://github.com/humbertblanco/correctorcatala.git
cd correctorcatala
pnpm install
pnpm dev          # arrenca Chromium amb l'extensió hot-reloaded
```

Per al servidor:

```bash
cd server
cp .env.example .env   # edita DOMAIN i EMAIL_FOR_LE
docker compose up -d
```

## Tests

Comprovacions automàtiques (CI):

```bash
pnpm typecheck    # tsc --noEmit
pnpm build        # producció
```

Comprovacions manuals al navegador:

- Escriure en un `<textarea>` → veure subratllats correctes.
- Editor contenteditable (Reddit/Twitter): subratllats sense fugues d'estil.
- Aplicar suggeriment → text actualitzat sense pèrdua de cursor.
- Detecció de variant amb una mostra inequívoca de valencià / balear.
- Diccionari personal: afegir paraula → desapareix el subratllat.
- Domini desactivat: cap subratllat aparèixer.

## Tipus de contribucions benvingudes

- **Regles gramaticals catalanes**: si trobes un error que el corrector hauria de detectar, [obre una *issue* upstream](https://github.com/Softcatala/catalan-dict-tools/issues) — les regles són de Softcatalà i LanguageTool. Aquí gestionem només l'extensió i el deployment.
- **Adapters per editors moderns**: ProseMirror, Slate, Lexical, CodeMirror... PRs benvinguts a `extension/lib/editors/`.
- **Detecció de variant més robusta**: si tens corpus dialectològics o vols millorar les heurístiques de `extension/lib/dialect-detect.ts`, súper.
- **Optimitzacions**: bundle size, latència, cau més intel·ligent.
- **Documentació i traduccions de la docs** (la UI ha de ser només en català).

## Estil de codi

- TypeScript estricte (`strict: true`, `noUncheckedIndexedAccess: true`).
- Sense `any`. Si cal, deixa-ho documentat amb un comentari.
- Sense dependències UI runtime (volem el bundle petit). Plain DOM + Shadow DOM és suficient per al que fem.
- Comentaris només per al **per què**, mai per al **què**.

## Workflow PR

1. Forc + branca.
2. Commit petit i atomic.
3. PR contra `main` amb descripció breu del problema, la solució, i com l'has provat.
4. Espera que CI passi.
5. Revisarem en uns dies.

## Agraïments especials

Aquest projecte només existeix gràcies a:

- [Softcatalà](https://www.softcatala.org) i la seva feina amb les regles catalanes a LanguageTool.
- [LanguageTool](https://languagetool.org) com a motor.
- [WXT](https://wxt.dev) com a framework d'extensions.

Si el teu nom hauria de ser aquí, fes-nos-ho saber.
