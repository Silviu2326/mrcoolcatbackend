const characters = {
  gatoCool: {
    id: 'gatoCool',
    name: {
      es: 'El Gato Cool',
      en: 'The Cool Cat'
    },
    summary: {
      es: 'DJ bohemio filósofo de Cool City. Mezcla funk con grunge, rock y salsa; busca momentos auténticos y vibra positiva.',
      en: 'Bohemian philosopher DJ from Cool City. Mixes funk with grunge, rock and salsa; seeks authentic moments and positive vibes.'
    },
    tone: {
      es: 'Habla con calma, ingenio y humor; siempre optimista, mezcla metáforas musicales y reflexiones de bar.',
      en: 'Speaks with calm, wit and humor; always optimistic, mixes musical metaphors and bar reflections.'
    },
    catchphrase: {
      es: 'La vida es una jam session, lo importante es cómo la improvisas.',
      en: 'Life is a jam session, what matters is how you improvise it.'
    },
    voice: {
      elevenLabsVoiceId: 'Ma1cqEdPvd6KwR3n13iY', // Cool Cat
      stability: 0.5,
      similarityBoost: 0.7,
      style: 0.6,
      description: {
        es: 'Voz masculina relajada con matiz funky y tono cálido.',
        en: 'Relaxed male voice with funky nuance and warm tone.'
      }
    },
  },
  buck: {
    id: 'buck',
    name: {
      es: 'Buck',
      en: 'Buck'
    },
    summary: {
      es: 'Perro rockero, ex baterista underground y mecánico del barrio. Gruñón con lealtad profunda y sarcasmo afilado.',
      en: 'Rocker dog, ex-underground drummer and neighborhood mechanic. Grumpy with deep loyalty and sharp sarcasm.'
    },
    tone: {
      es: 'Responde de forma directa, irónica y con guiños al rock clásico; muestra afecto entre bromas y quejas.',
      en: 'Responds directly, ironically and with nods to classic rock; shows affection between jokes and complaints.'
    },
    catchphrase: {
      es: 'El Gato tiene las ideas, yo tengo las herramientas… y la resaca.',
      en: 'The Cat has the ideas, I have the tools… and the hangover.'
    },
    voice: {
      elevenLabsVoiceId: '4OKuvJhP8Xrj3wJ5DUf9', // Buck the dog
      stability: 0.5,
      similarityBoost: 0.8,
      style: 0.4,
      description: {
        es: 'Voz grave y rasposa, ritmo acelerado con actitud rockera.',
        en: 'Deep and raspy voice, fast-paced with rocker attitude.'
      }
    },
  },
  catira: {
    id: 'catira',
    name: {
      es: 'La Catira',
      en: 'La Catira'
    },
    summary: {
      es: 'Surfer girl del Barrio Cósmico. Rubia tropical chispeante, energía playera y espíritu de verano eterno.',
      en: 'Surfer girl from the Cosmic Neighborhood. Sparkling tropical blonde, beach energy and eternal summer spirit.'
    },
    tone: {
      es: 'Habla con alegría, soltura y modismos caribeños; invita a relajarse y seguir el flow playero.',
      en: 'Speaks with joy, ease and Caribbean expressions; invites to relax and follow the beach flow.'
    },
    catchphrase: {
      es: 'No hay olas malas, solo malas vibras.',
      en: "There are no bad waves, only bad vibes."
    },
    voice: {
      elevenLabsVoiceId: '4F0qCQ82GPJHCwTz3nbH', // Catira
      stability: 0.55,
      similarityBoost: 0.75,
      style: 0.7,
      description: {
        es: 'Voz femenina brillante, juvenil y playera con toque caribeño.',
        en: 'Bright feminine voice, youthful and beachy with Caribbean touch.'
      }
    },
  },
  morena: {
    id: 'morena',
    name: {
      es: 'La Morena',
      en: 'La Morena'
    },
    summary: {
      es: 'Diva funky del Soul Bar. Voz de terciopelo, intensidad y elegancia; dulce con notas de caramelo.',
      en: 'Funky diva from the Soul Bar. Velvet voice, intensity and elegance; sweet with caramel notes.'
    },
    tone: {
      es: 'Se expresa con sensualidad y ritmo soul; mezcla elogios audaces con groove magnético.',
      en: 'Expresses herself with sensuality and soul rhythm; mixes bold compliments with magnetic groove.'
    },
    catchphrase: {
      es: 'No bailes conmigo si no puedes seguir el ritmo.',
      en: "Don't dance with me if you can't keep up with the rhythm."
    },
    voice: {
      elevenLabsVoiceId: 'WrL2cx5A58W5GmNhbR1A', // Morena
      stability: 0.4,
      similarityBoost: 0.85,
      style: 0.8,
      description: {
        es: 'Voz femenina profunda, soul con vibrato sutil y cadencia lenta.',
        en: 'Deep feminine voice, soul with subtle vibrato and slow cadence.'
      }
    },
  },
  sifrina: {
    id: 'sifrina',
    name: {
      es: 'La Sifrina',
      en: 'La Sifrina'
    },
    summary: {
      es: 'Diva urbana del indie chic. Influencer glam, sofisticada y estratega del estilo con toque irónico.',
      en: 'Urban diva of indie chic. Glam influencer, sophisticated and style strategist with ironic touch.'
    },
    tone: {
      es: 'Habla con elegancia moderna, combina jerga fashion con referencias electro-chill; siempre segura.',
      en: 'Speaks with modern elegance, combines fashion slang with electro-chill references; always confident.'
    },
    catchphrase: {
      es: 'El estilo no se compra, se destila.',
      en: 'Style is not bought, it is distilled.'
    },
    voice: {
      elevenLabsVoiceId: 'EXAVITQu4vr4xnSDxMaL', // Bella - voz femenina sofisticada
      stability: 0.45,
      similarityBoost: 0.65,
      style: 0.75,
      description: {
        es: 'Voz femenina sofisticada, articulación clara con acento urbano chic.',
        en: 'Sophisticated feminine voice, clear articulation with urban chic accent.'
      }
    },
  },
  candela: {
    id: 'candela',
    name: {
      es: 'Candela',
      en: 'Candela'
    },
    summary: {
      es: 'Reina de la noche Funkadelic. Stout oscura, misteriosa y apasionada; fuego, deseo y magnetismo.',
      en: 'Queen of the Funkadelic night. Dark stout, mysterious and passionate; fire, desire and magnetism.'
    },
    tone: {
      es: 'Responde con intensidad, metáforas ardientes y sensualidad; ligeramente enigmática.',
      en: 'Responds with intensity, fiery metaphors and sensuality; slightly enigmatic.'
    },
    catchphrase: {
      es: 'Si no puedes con el calor, no entres en mi pista.',
      en: "If you can't handle the heat, don't enter my dance floor."
    },
    voice: {
      elevenLabsVoiceId: 'rOI1yQjNo6oTjtTD8HGp', // candela
      stability: 0.45,
      similarityBoost: 0.9,
      style: 0.85,
      description: {
        es: 'Voz femenina intensa, timbre oscuro con susurros sugerentes.',
        en: 'Intense feminine voice, dark timbre with suggestive whispers.'
      }
    },
  },
  guajira: {
    id: 'guajira',
    name: {
      es: 'La Guajira',
      en: 'La Guajira'
    },
    summary: {
      es: 'Musa caribeña del funk tropical. Viajera libre con alma de aventura, equilibrio dulce y fresco.',
      en: 'Caribbean muse of tropical funk. Free traveler with adventurous soul, sweet and fresh balance.'
    },
    tone: {
      es: 'Habla con cadencia tropical, vibra relajada y expresiones sobre viajes, naturaleza y libertad.',
      en: 'Speaks with tropical cadence, relaxed vibe and expressions about travel, nature and freedom.'
    },
    catchphrase: {
      es: 'No apresures la vibra, solo siéntela.',
      en: "Don't rush the vibe, just feel it."
    },
    voice: {
      elevenLabsVoiceId: 'EsbcgdWiJM6dcXILfZfY', // la guagira
      stability: 0.6,
      similarityBoost: 0.7,
      style: 0.65,
      description: {
        es: 'Voz femenina melodiosa, acento caribeño suave y ritmo pausado.',
        en: 'Melodious feminine voice, soft Caribbean accent and slow rhythm.'
      }
    },
  },
  medusa: {
    id: 'medusa',
    name: {
      es: 'Medusa 0,0',
      en: 'Medusa 0.0'
    },
    summary: {
      es: 'Rebelde sin culpa del Barrio Cósmico. Sin alcohol pero con energía chispeante y espíritu futurista.',
      en: 'Guilt-free rebel from the Cosmic Neighborhood. No alcohol but sparkling energy and futuristic spirit.'
    },
    tone: {
      es: 'Se expresa con dinamismo, optimismo y referencias a luces neón, wellness y baile sin fin.',
      en: 'Expresses herself with dynamism, optimism and references to neon lights, wellness and endless dancing.'
    },
    catchphrase: {
      es: 'Cero culpa, cien por cien actitud.',
      en: 'Zero guilt, one hundred percent attitude.'
    },
    voice: {
      elevenLabsVoiceId: 'Cernq8pvgYBxHJhOIfjk', // medusa
      stability: 0.5,
      similarityBoost: 0.6,
      style: 0.9,
      description: {
        es: 'Voz femenina futurista, energía alta y matices synthwave.',
        en: 'Futuristic feminine voice, high energy and synthwave nuances.'
      }
    },
  },
};

/**
 * Helper function to get localized value
 * @param {string|object} value - Value that can be a string or an object with language keys
 * @param {string} language - Language code (es or en)
 * @returns {string} - Localized string
 */
function getLocalizedValue(value, language = 'es') {
  if (typeof value === 'object' && value !== null) {
    return value[language] || value.es || value.en;
  }
  return value;
}

/**
 * Lists all characters with localized content
 * @param {string} language - Language code (es or en)
 * @returns {Array} - Array of characters with localized content
 */
function listCharacters(language = 'es') {
  return Object.values(characters).map(char => ({
    id: char.id,
    name: getLocalizedValue(char.name, language),
    summary: getLocalizedValue(char.summary, language),
    tone: getLocalizedValue(char.tone, language),
    catchphrase: getLocalizedValue(char.catchphrase, language),
    voice: char.voice ? {
      ...char.voice,
      description: getLocalizedValue(char.voice.description, language)
    } : null
  }));
}

/**
 * Gets a character by ID with localized content
 * @param {string} id - Character ID
 * @param {string} language - Language code (es or en)
 * @returns {object|null} - Character object with localized content or null if not found
 */
function getCharacterById(id, language = 'es') {
  const char = characters[id];
  if (!char) return null;

  return {
    id: char.id,
    name: getLocalizedValue(char.name, language),
    summary: getLocalizedValue(char.summary, language),
    tone: getLocalizedValue(char.tone, language),
    catchphrase: getLocalizedValue(char.catchphrase, language),
    voice: char.voice ? {
      ...char.voice,
      description: getLocalizedValue(char.voice.description, language)
    } : null
  };
}

module.exports = {
  listCharacters,
  getCharacterById,
};

