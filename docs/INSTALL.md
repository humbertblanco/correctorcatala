# Instal·lació per a usuaris

## Des del Chrome Web Store (recomanat)

> Pendent de publicació. Quan estigui disponible, hi haurà un enllaç directe aquí.

## Instal·lació manual (mode desenvolupador)

Mentre l'extensió encara no és al Web Store, pots carregar-la a Chrome/Edge/Brave així:

1. Descarrega o clona aquest repositori.
2. Compila l'extensió:
   ```bash
   pnpm install
   pnpm build
   ```
   Es generarà `extension/.output/chrome-mv3/`.
3. Obre `chrome://extensions/` al navegador.
4. Activa **Mode desenvolupador** (cantonada superior dreta).
5. Clica **Carrega sense empaquetar** i tria la carpeta `extension/.output/chrome-mv3/`.
6. L'extensió apareixerà a la llista. Fixa-la a la barra clicant la icona del trencaclosques i el pin.

## Configuració inicial

1. Clica la icona del corrector → **Configuració avançada**.
2. A **Adreça del servidor** posa l'URL del teu servidor LanguageTool. Per defecte: `https://api.corrector.cat`.
3. Clica **Comprova la connexió** per assegurar-te que respon i veus els tres codis catalans (`ca-ES`, `ca-ES-valencia`, `ca-ES-balear`).
4. (Opcional) Afegeix paraules al **Diccionari personal** o dominis a **Dominis desactivats**.
5. Desa.

## Ús

- Escriu en qualsevol caixa de text del navegador. Després d'una pausa de 0.7 s, els errors apareixeran subratllats en vermell.
- Clica el subratllat per veure els suggeriments. Tria un per aplicar-lo o **Afegeix al diccionari** / **Ignora aquí**.
- Al popup de l'extensió pots:
  - Activar/desactivar globalment.
  - Triar variant (estàndard, valencià, balear) o deixar **Detecció automàtica**.
  - Desactivar el corrector només en el domini actual.

## Dispositius i sincronització

La configuració es desa amb `storage.sync` de Chrome → es replica als teus altres dispositius amb el mateix usuari del navegador.

## Editors no compatibles (avui)

- Google Docs (renderitza el text en `<canvas>`, no exposa elements editables).
- Notion (canvas-based per al document principal).
- Editors WYSIWYG dins iframes aïllats per CSP.

L'extensió detecta aquests casos i no fa res — no veuràs errors a la consola.
