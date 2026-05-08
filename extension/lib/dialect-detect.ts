import type { ResolvedVariant } from './types';

// Two-stage detector:
//   1. Catalan-vs-Spanish (language). Catalan wins by default; Spanish only if it
//      decisively beats Catalan markers AND clears an absolute floor.
//   2. If Catalan, narrow to standard / Valencian / Balearic by sub-dialect markers.
//
// Each marker is a regex (global, case-insensitive) plus a weight; we sum hits.

interface Marker {
  re: RegExp;
  w: number;
}

// ---------------------------------------------------------------------------
// Spanish markers — chosen so most don't appear in Catalan text.
// ---------------------------------------------------------------------------
const SPANISH: Marker[] = [
  // Unique characters / suffixes — strong signal across most Spanish text.
  { re: /ñ/gi, w: 3 },
  { re: /\b\w+ción\b/gi, w: 2 },                  // Catalan equivalent: -ció
  { re: /\b\w+mente\b/gi, w: 1 },                 // Catalan equivalent: -ment

  // Pronouns / demonstratives only Spanish
  { re: /\b(nosotros|vosotros|ellos|ellas|usted|ustedes)\b/gi, w: 3 },
  { re: /\b(unos|unas|esto|eso|aquello)\b/gi, w: 2 },

  // Common adverbs / function words only Spanish
  { re: /\bmuy\b/gi, w: 2 },
  { re: /\bhay\b/gi, w: 2 },                                          // Catalan: "hi ha"
  { re: /\b(qué|cómo|cuándo|dónde|por\s+qué|porqué)\b/gi, w: 2 },
  { re: /\b(más|también|después|antes|porque|todavía|así|aquí|allí|sólo|solo)\b/gi, w: 2 },

  // Verb forms only Spanish (Catalan equivalents have grave accents)
  { re: /\b(está|están|estás|estoy|estamos|estuvieron|estuvo)\b/gi, w: 2 },
  { re: /\b(haber|tener|hacer|dijo|hizo|tuvo|hubo|sido|hecho)\b/gi, w: 2 },
  { re: /\b(será|sería|serán|sean|hayan)\b/gi, w: 1 },
  { re: /\b(soy|eres|fue|fueron|seré|seríamos)\b/gi, w: 1 },

  // Spanish-distinctive nouns/adjectives without Catalan cognates
  { re: /\b(cliente|clientes|cuenta|cuentas|pedido|pedidos|prueba|pruebas|errores)\b/gi, w: 2 },
  { re: /\b(día|días|mes|año|años|mañana|noche|tarde)\b/gi, w: 1 },

  // Prepositions / connectors only Spanish
  { re: /\b(con|sin|hacia|hasta|desde|durante|según)\b/gi, w: 1 },
  { re: /\b(aunque|pues|entonces|mientras|siempre|nunca|jamás|ahora)\b/gi, w: 1 },
];

// ---------------------------------------------------------------------------
// Catalan-distinctive markers (vs Spanish and other Romance).
// Used only for the language-vs-Spanish discrimination step.
// ---------------------------------------------------------------------------
const CATALAN_DISTINCTIVE: Marker[] = [
  { re: /[àèò]/g, w: 3 },                                             // grave accents → Catalan/Italian; very rare in Spanish
  { re: /\bamb\b/gi, w: 3 },
  { re: /\bperò\b/gi, w: 3 },
  { re: /\bperquè\b/gi, w: 3 },
  { re: /\bnomés\b/gi, w: 3 },
  { re: /\bmés\b/gi, w: 2 },
  { re: /\btambé\b/gi, w: 2 },
  { re: /\b(hi\s+ha|n'hi\s+ha|no\s+hi\s+ha)\b/gi, w: 3 },
  { re: /\b(els|les|nostres|vostres)\b/gi, w: 1 },
  { re: /\b(jo|nosaltres|vosaltres)\b/gi, w: 2 },
  { re: /\b(aquest|aquesta|aquests|aquestes|aquell|aquella)\b/gi, w: 2 },
  { re: /\b(és|sóc|som|sou|estem|estan|està|estàs|estic)\b/gi, w: 2 },
  { re: /\bd'(un|una|aquesta|aquest|això|aquell)\b/gi, w: 2 },
  { re: /\bque\s+\w+r\b/gi, w: 0 },                                   // intentionally neutral
];

// ---------------------------------------------------------------------------
// Catalan sub-dialect markers (only consulted if language is Catalan).
// ---------------------------------------------------------------------------
const VALENCIAN: Marker[] = [
  { re: /\bhui\b/gi, w: 2 },
  { re: /\b(este|esta|estos|estes)\b/gi, w: 1 },
  { re: /\b(eixe|eixa|eixos|eixes)\b/gi, w: 2 },
  { re: /\b(xiquet|xiqueta|xiquets|xiquetes)\b/gi, w: 2 },
  { re: /\b(xicot|xicota|xicots|xicotes)\b/gi, w: 2 },
  { re: /\b(meua|teua|seua|meues|teues|seues)\b/gi, w: 2 },
  { re: /\bvore\b/gi, w: 1 },
  { re: /\bagarrar\b/gi, w: 1 },
  { re: /\b(sancer|sancera)\b/gi, w: 2 },
  { re: /\b(mosatros|nosatres)\b/gi, w: 3 },
  { re: /\b(matalaf|matalafs)\b/gi, w: 2 },
  { re: /\b(huit|deneu|setze)\b/gi, w: 1 },
];

const BALEARIC: Marker[] = [
  { re: /\bnoltros\b/gi, w: 3 },
  { re: /\b(vatros|voltros)\b/gi, w: 3 },
  { re: /\b(atlot|atlota|atlots|atlotes)\b/gi, w: 3 },
  { re: /\b(qualcun|qualcuna)\b/gi, w: 2 },
  { re: /\bidò\b/gi, w: 2 },
  { re: /\bendemés\b/gi, w: 2 },
  { re: /\bmos\s+(diu|fa|ha|han|donar|donà|portà|veu|veus|sentí|sent)\b/gi, w: 2 },
  { re: /\b\w+àrem\b/gi, w: 2 },
  { re: /(?:^|[\s.,;:!?¡¿—–])(es|sa|ses|s')\s+[a-zàèéíòóúïüç]/gi, w: 1 },
  { re: /\b(nin|nina|nins|nines)\b/gi, w: 1 },
];

const NEUTRAL_THRESHOLD = 3;
const RATIO_THRESHOLD = 1.8;
// Lowered from 4 → 3 so generic Spanish text (no ñ / nosotros / muy etc.)
// still picks up via the broader -ción / verb-form markers added below.
const ES_FLOOR = 3;
const ES_DOMINANCE = 1.5;

function score(text: string, markers: Marker[]): number {
  let s = 0;
  for (const m of markers) {
    const matches = text.match(m.re);
    if (matches) s += matches.length * m.w;
  }
  return s;
}

export interface DetectResult {
  variant: ResolvedVariant;
  scores: { va: number; ba: number; es: number; ca: number };
}

export function detectVariant(text: string): DetectResult {
  const empty = { va: 0, ba: 0, es: 0, ca: 0 };
  if (text.length < 30) {
    return { variant: 'ca-ES', scores: empty };
  }

  const es = score(text, SPANISH);
  const ca = score(text, CATALAN_DISTINCTIVE);

  // Stage 1: is it Spanish?
  if (es >= ES_FLOOR && es > ca * ES_DOMINANCE) {
    return { variant: 'es', scores: { va: 0, ba: 0, es, ca } };
  }

  // Stage 2: Catalan sub-dialect.
  const va = score(text, VALENCIAN);
  const ba = score(text, BALEARIC);
  const subMax = Math.max(va, ba);

  if (subMax < NEUTRAL_THRESHOLD) {
    return { variant: 'ca-ES', scores: { va, ba, es, ca } };
  }
  if (va > ba && va >= ba * RATIO_THRESHOLD) {
    return { variant: 'ca-ES-valencia', scores: { va, ba, es, ca } };
  }
  if (ba > va && ba >= va * RATIO_THRESHOLD) {
    return { variant: 'ca-ES-balear', scores: { va, ba, es, ca } };
  }
  return { variant: 'ca-ES', scores: { va, ba, es, ca } };
}
