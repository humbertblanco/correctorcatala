import { describe, it, expect } from 'vitest';
import { detectVariant } from './dialect-detect';

// Each case: a sample text long enough to trip the heuristic, with the variant
// we expect detectVariant() to produce. Keep these grounded in real-world
// snippets — synthetic strings tuned to the algorithm don't catch regressions.

const CASES: Array<{ name: string; text: string; expected: string }> = [
  // ---- ca-ES (general / standard) -----------------------------------------
  {
    name: 'ca-ES neutral paragraph',
    text:
      'Aquesta és una prova llarga de text en català estàndard. La gramàtica és prou complexa, però amb pràctica es pot dominar.',
    expected: 'ca-ES',
  },
  {
    name: 'ca-ES with diacritics',
    text:
      'És sabut que la llengua catalana té una ortografia rica i molts accents. També hi ha distincions entre vocals obertes i tancades.',
    expected: 'ca-ES',
  },
  {
    name: 'ca-ES short sentence (under threshold) defaults to ca-ES',
    text: 'Hola',
    expected: 'ca-ES',
  },
  {
    name: 'ca-ES with quotes and apostrophes',
    text: "M'agrada molt llegir l'autobiografia d'aquesta escriptora; és captivadora.",
    expected: 'ca-ES',
  },

  // ---- ca-ES-valencia ------------------------------------------------------
  {
    name: 'valencià with hui + este + xicot',
    text: 'Hui anirem a la platja amb este xicot, després menjarem una paella ben gran.',
    expected: 'ca-ES-valencia',
  },
  {
    name: 'valencià with eixe + meua + xiquet',
    text:
      "Eixe xiquet és el meu cosí. La meua família ve d'Alacant, encara que jo visc a València des de fa anys.",
    expected: 'ca-ES-valencia',
  },
  {
    name: 'valencià with multiple distinctive markers',
    text:
      'Hui hem agarrat el cotxe per anar a vore la meua mare. Estos quatre xiquets són els seus néts; el meu cosí ve també.',
    expected: 'ca-ES-valencia',
  },

  // ---- ca-ES-balear --------------------------------------------------------
  {
    name: 'balear with noltros + sa platja',
    text:
      'Es nin va anar a sa platja amb noltros i s\'avi. Voltros podríeu venir també, idò?',
    expected: 'ca-ES-balear',
  },
  {
    name: 'balear with atlot + idò',
    text:
      "Aquell atlot és en Pep. Voltros el coneixeu? Idò, és veí meu de tota la vida; nosaltres anàrem a escola junts.",
    expected: 'ca-ES-balear',
  },

  // ---- es ------------------------------------------------------------------
  {
    name: 'es plain Spanish',
    text:
      'Esto es una prueba en español. Espero que el corrector encuentre todos los errores ortográficos y gramaticales.',
    expected: 'es',
  },
  {
    name: 'es with accent and ñ',
    text:
      'Mañana iremos a la montaña, después al mar. ¿Cómo estás tú? Yo estoy muy bien gracias, también voy a viajar.',
    expected: 'es',
  },
  {
    name: 'es with ustedes / nosotros',
    text:
      'Nosotros también estamos cansados. Ustedes pueden quedarse aquí o ir hacia el centro, después podemos cenar.',
    expected: 'es',
  },

  // ---- Edge cases ----------------------------------------------------------
  {
    name: 'short es text under threshold defaults to ca-ES',
    text: 'Hola que tal',
    expected: 'ca-ES',
  },
  {
    name: 'mostly ca with one Spanish word stays ca-ES',
    text:
      "Aquesta és una prova llarga en català. Hi ha una sola paraula 'también' al mig per veure si l'algoritme s'equivoca.",
    expected: 'ca-ES',
  },
  {
    name: 'mostly es with one Catalan word stays es',
    text:
      'Esto es un texto largo en español. Hay solo una palabra "amb" en medio, pero el resto es claramente español, ¿no? Mañana lo vemos.',
    expected: 'es',
  },
  {
    name: 'mixed ca + valencià markers picks valencià',
    text:
      "Hui hem anat amb la meua germana a València a vore la festa. Tot estava ben preparat però hi havia molta gent. Eixe matí va eixir el sol.",
    expected: 'ca-ES-valencia',
  },
  {
    name: 'standard ca with one rare valencian word stays ca-ES',
    text:
      "Aquesta novel·la és molt interessant. La gramàtica i l'estil són impecables, encara que un cop algú ha emprat 'hui' per error.",
    expected: 'ca-ES',
  },

  // ---- Realistic snippets --------------------------------------------------
  {
    name: 'ca-ES news headline',
    text:
      "El Govern aprova el nou pressupost amb el suport dels partits de l'oposició, després d'una llarga negociació.",
    expected: 'ca-ES',
  },
  {
    name: 'ca-ES literary',
    text:
      "L'autora descriu amb precisió els paisatges del Pirineu i el silenci de les valls altes; cada paràgraf té un ritme propi.",
    expected: 'ca-ES',
  },
  {
    name: 'es business email',
    text:
      'Estimado cliente: le confirmamos que su pedido ha sido procesado correctamente. Recibirá la mercancía en un plazo de 48 horas.',
    expected: 'es',
  },
  {
    name: 'valencià news snippet',
    text:
      "Hui ha plogut a tota la comarca. Els xiquets no han pogut eixir al pati de l'escola; demà esperem que faja sol.",
    expected: 'ca-ES-valencia',
  },
  {
    name: 'balear news snippet',
    text:
      "Es president de Mallorca anuncià mesures noves per al turisme. Idò, voltros què en pensau? Noltros encara estam estudiant la proposta.",
    expected: 'ca-ES-balear',
  },
];

describe('detectVariant', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const { variant } = detectVariant(c.text);
      expect(variant, `text: "${c.text}"`).toBe(c.expected);
    });
  }

  it('returns scores for inspection', () => {
    const result = detectVariant(
      'Hui anem amb noltros a la platja amb este xicot que parla castellano también.',
    );
    expect(result.scores).toMatchObject({
      va: expect.any(Number),
      ba: expect.any(Number),
      es: expect.any(Number),
      ca: expect.any(Number),
    });
  });
});
