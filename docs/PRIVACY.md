# Política de privadesa

**Darrera actualització:** 2026-05-07

## Què fa l'extensió amb el teu text

Quan escrius en una caixa de text d'una pàgina web, l'extensió:

1. Captura el text **en local**, dins el teu navegador.
2. L'envia per HTTPS al **servidor de correcció** que tens configurat (per defecte `https://api.corrector.cat`, però pots canviar-lo a la pàgina d'opcions).
3. Rep la resposta amb els errors detectats i els suggeriments.
4. Mostra els subratllats al teu navegador.

**Cap altre tercer rep el teu text.** No hi ha analítiques (Google Analytics, Mixpanel, etc.), no hi ha telemetria, no hi ha *fingerprinting*.

## Què guarda el servidor del corrector

El servidor de referència (`api.corrector.cat`) **no emmagatzema els textos ni les correccions**. Els logs d'accés de nginx (IP, hora, mida del cos de la petició) es retenen un màxim de 30 dies amb finalitat tècnica (depuració, detecció d'abús).

Si fas servir un servidor propi o el d'un altre administrador, la seva política pot ser diferent. Consulta-la abans de configurar-lo a l'extensió.

## Què emmagatzema l'extensió en el teu navegador

Mitjançant `browser.storage.sync`, l'extensió desa:

- Si està activada o no.
- La variant de català escollida.
- L'URL del servidor.
- El teu **diccionari personal** (paraules a ignorar).
- La llista de **dominis on està desactivada**.
- (Per origen) la variant que has triat manualment per a aquell origen.

`storage.sync` se sincronitza entre dispositius del mateix perfil de Chrome. Pots esborrar-ho tot en qualsevol moment desinstal·lant l'extensió.

## Permisos que demana l'extensió

| Permís                   | Per què                                                                 |
|--------------------------|-------------------------------------------------------------------------|
| `storage`                | Desar la teva configuració i diccionari personal.                       |
| `activeTab`              | Saber el domini de la pestanya actual quan cliques "Desactiva aquí".    |
| `contextMenus`           | (Reservat per a futures opcions del menú contextual del navegador.)     |
| `scripting`              | Injectar el script de correcció a la pàgina activa.                     |
| `<all_urls>` (opcional)  | Activar el corrector a tots els llocs. **És opcional.**                 |

## Dades que NO recopilem

- Cap text introduït en pàgines web (més enllà de l'enviament al teu servidor).
- Cap identificador d'usuari, dispositiu o navegador.
- Cap historial de navegació.
- Cap cookie de tercers.

## Drets

Com que no recopilem dades personals nominals, no hi ha res específic que esborrar a una base de dades nostra. Si fas servir el servidor de referència, pots demanar-nos que esborrem els teus logs d'accés (per IP) escrivint a [contacte](mailto:correctorcatala@example.com).

## Canvis a aquesta política

Si canvia, ho anunciarem a la pàgina d'inici del repositori i a la fitxa del Web Store. El nou text serà visible a `docs/PRIVACY.md` del codi font.
