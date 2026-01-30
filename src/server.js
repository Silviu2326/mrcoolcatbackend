require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const http = require('http');
const { Readable } = require('stream');
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const speech = require('@google-cloud/speech');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const os = require('os');
const nodemailer = require('nodemailer');
const axios = require('axios');
const { getCharacterById, listCharacters } = require('./characters');
const {
  searchProducts,
  getFullMenu,
  searchEvents,
  searchStores,
  searchCharactersInfo
} = require('./services/catalogService');

const PORT = process.env.PORT || 3000;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2_5';
const DEFAULT_TRANSCRIPTION_LANGUAGE = process.env.TRANSCRIPTION_LANGUAGE || 'es-ES';
const DEFAULT_SAMPLE_RATE = Number(process.env.TRANSCRIPTION_SAMPLE_RATE) || 16000;

// Idiomas soportados
const SUPPORTED_LANGUAGES = {
  es: 'es-ES',
  en: 'en-US'
};
const DEFAULT_LANGUAGE = 'es';

// --- CONFIGURACIÓN DE CREDENCIALES GOOGLE (RAILWAY/BASE64) ---
function setupGoogleCredentials() {
  // Si ya existe la variable estándar (local), no hacemos nada
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return;
  }

  // Si estamos en Railway y tenemos la variable BASE64
  if (process.env.GOOGLE_CREDENTIALS_BASE64) {
    try {
      const creds = Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf-8');
      const tempPath = path.join(os.tmpdir(), 'google-credentials.json');
      fs.writeFileSync(tempPath, creds);
      process.env.GOOGLE_APPLICATION_CREDENTIALS = tempPath;
      console.log(`[System] Credenciales de Google generadas temporalmente en: ${tempPath}`);
    } catch (error) {
      console.error('[System] Error al decodificar GOOGLE_CREDENTIALS_BASE64:', error);
    }
  }
}

// Ejecutar configuración de credenciales antes de iniciar nada
setupGoogleCredentials();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/voice' });

// Middlewares
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// --- CONFIGURACIÓN DE HERRAMIENTAS (TOOLS) ---
function getTools(language = 'es') {
  const toolDescriptions = {
    es: {
      searchProducts: {
        description: "Busca cervezas o productos en el catálogo por nombre, tipo o descripción. Úsala cuando el usuario pregunte por una cerveza específica o precios.",
        query: "El término de búsqueda (ej: 'rubia', 'Candela', 'IPA')."
      },
      getFullMenu: {
        description: "Obtiene el menú completo de cervezas disponibles. Úsala cuando el usuario pregunte 'qué tienes' o quiera ver la carta."
      },
      searchEvents: {
        description: "Busca eventos, conciertos o fiestas próximas en el Universo Cool Cat. Úsala si preguntan 'qué hay para hacer', 'cuándo es la fiesta', etc.",
        query: "Tipo de evento o fecha aproximada (opcional)."
      },
      searchStores: {
        description: "Busca dónde comprar cerveza o bares cercanos. CAPACIDADES: 1) Si el usuario menciona un BARRIO o ZONA (ej: 'San Blas', 'Centro', 'Playa San Juan'), pasa ese nombre como 'location' - el sistema lo geocodificará automáticamente. 2) Si dice 'cerca de mí' o 'por aquí', deja location vacío y usará GPS. 3) Cada local tiene CATEGORÍA (Pub, Bar, Restaurante, Supermercado) con REGLAS. SUPERMERCADOS son SOLO para comprar (NO BEBER AHÍ).",
        location: "Nombre del barrio, zona o ciudad (ej: 'San Blas', 'Centro', 'Benalúa', 'Alicante'). El sistema puede identificar barrios y convertirlos a coordenadas. Dejar VACÍO solo si el usuario dice 'cerca de mí' o 'por aquí' sin especificar zona."
      },
      getCharacterInfo: {
        description: "Obtiene información sobre otros personajes del universo. Úsala si el usuario pregunta 'quién es Buck', 'háblame de La Catira', etc.",
        name: "Nombre del personaje a buscar."
      }
    },
    en: {
      searchProducts: {
        description: "Search for beers or products in the catalog by name, type or description. Use it when the user asks about a specific beer or prices.",
        query: "The search term (e.g., 'blonde', 'Candela', 'IPA')."
      },
      getFullMenu: {
        description: "Gets the complete menu of available beers. Use it when the user asks 'what do you have' or wants to see the menu."
      },
      searchEvents: {
        description: "Search for upcoming events, concerts or parties in the Cool Cat Universe. Use it if they ask 'what's happening', 'when is the party', etc.",
        query: "Type of event or approximate date (optional)."
      },
      searchStores: {
        description: "Search for nearby beer shops or bars. CAPABILITIES: 1) If user mentions a NEIGHBORHOOD or ZONE (e.g., 'San Blas', 'Downtown', 'Beach area'), pass that name as 'location' - the system will geocode it automatically. 2) If they say 'near me' or 'around here', leave location empty to use GPS. 3) Each place has a CATEGORY (Pub, Bar, Restaurant, Supermarket) with RULES. SUPERMARKETS are for BUYING ONLY (NO DRINKING).",
        location: "Name of neighborhood, zone or city (e.g., 'San Blas', 'Downtown', 'Benalúa', 'Alicante'). The system can identify neighborhoods and convert them to coordinates. Leave EMPTY only if user says 'near me' without specifying a zone."
      },
      getCharacterInfo: {
        description: "Gets information about other characters in the universe. Use it if the user asks 'who is Buck', 'tell me about La Catira', etc.",
        name: "Name of the character to search for."
      }
    }
  };

  const i18n = toolDescriptions[language] || toolDescriptions.es;

  return [
    {
      function_declarations: [
        {
          name: "searchProducts",
          description: i18n.searchProducts.description,
          parameters: {
            type: "OBJECT",
            properties: {
              query: { type: "STRING", description: i18n.searchProducts.query }
            },
            required: ["query"]
          }
        },
        {
          name: "getFullMenu",
          description: i18n.getFullMenu.description,
          parameters: { type: "OBJECT", properties: {}, required: [] }
        },
        {
          name: "searchEvents",
          description: i18n.searchEvents.description,
          parameters: {
            type: "OBJECT",
            properties: {
              query: { type: "STRING", description: i18n.searchEvents.query }
            },
            required: []
          }
        },
        {
          name: "searchStores",
          description: i18n.searchStores.description,
          parameters: {
            type: "OBJECT",
            properties: {
              location: { type: "STRING", description: i18n.searchStores.location }
            },
            required: []
          }
        },
        {
          name: "getCharacterInfo",
          description: i18n.getCharacterInfo.description,
          parameters: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING", description: i18n.getCharacterInfo.name }
            },
            required: ["name"]
          }
        }
      ]
    }
  ];
}

const functionsMap = {
  searchProducts: async ({ query }) => {
    console.log(`[Tool] Buscando producto: ${query}`);
    return await searchProducts(query);
  },
  getFullMenu: async () => {
    console.log(`[Tool] Obteniendo menú completo`);
    return await getFullMenu();
  },
  searchEvents: async ({ query }) => {
    console.log(`[Tool] Buscando eventos: ${query || 'todos'}`);
    return await searchEvents(query);
  },
  searchStores: async ({ location, userLocation }) => {
    console.log(`[Tool] Buscando tiendas en: ${location || 'ubicación usuario'}`);
    return await searchStores(location, userLocation);
  },
  getCharacterInfo: async ({ name }) => {
    console.log(`[Tool] Buscando info personaje: ${name}`);
    return await searchCharactersInfo(name);
  }
};

function ensureGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Falta la variable de entorno GEMINI_API_KEY');
  }
  return new GoogleGenerativeAI(apiKey);
}

let speechClient;
let speechClientError = null;

function ensureSpeechClient() {
  if (speechClientError) {
    throw speechClientError;
  }

  if (!speechClient) {
    try {
      speechClient = new speech.SpeechClient();
    } catch (error) {
      speechClientError = new Error(
        'Google Speech no está configurado. Para usar el modo voz, configura GOOGLE_APPLICATION_CREDENTIALS. ' +
        'Lee GOOGLE_CLOUD_SETUP.md para más información.'
      );
      console.warn('⚠️ [Speech] Google Speech-to-Text no disponible:', error.message);
      console.warn('⚠️ [Speech] El modo voz no funcionará hasta que se configuren las credenciales.');
      console.warn('⚠️ [Speech] El chat de texto funcionará normalmente.');
      throw speechClientError;
    }
  }
  return speechClient;
}

function ensureElevenLabsKey() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('Falta la variable de entorno ELEVENLABS_API_KEY');
  }
  return apiKey;
}

function buildSystemInstruction(character, language = 'es') {
  // Generar fecha actual con formato legible
  const now = new Date();
  const daysES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const daysEN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthsES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const monthsEN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const dayOfWeekES = daysES[now.getDay()];
  const dayOfWeekEN = daysEN[now.getDay()];
  const dayNum = now.getDate();
  const monthES = monthsES[now.getMonth()];
  const monthEN = monthsEN[now.getMonth()];
  const year = now.getFullYear();

  const currentDateES = `Hoy es ${dayOfWeekES}, ${dayNum} de ${monthES} de ${year}.`;
  const currentDateEN = `Today is ${dayOfWeekEN}, ${monthEN} ${dayNum}, ${year}.`;

  const instructions = {
    es: {
      actAs: `ACTÚA ÚNICA Y EXCLUSIVAMENTE COMO: ${character.name}.`,
      currentDate: `FECHA ACTUAL: ${currentDateES} Usa esta fecha para responder preguntas sobre "hoy", "esta noche", "mañana", etc.`,
      context: `CONTEXTO: Vives en el Universo Cool Cat (Cool City / Playa Funkadelic).`,
      mainLocation: `UBICACIÓN: Conoces "El Gato Cool Pub" (C/ Santos Médicos, 4, junto a Plaza San Cristóbal, Casco Antiguo de Alicante). Es un lugar que frecuentas, pero NO lo menciones en cada respuesta - solo cuando sea relevante o te pregunten directamente por sitios.`,
      profile: `TU PERFIL:`,
      toneLabel: `TU TONO DE VOZ Y ESTILO:`,
      useThisTone: 'Usa este tono en cada respuesta. No seas genérico.',
      catchphraseLabel: `TU FRASE CARACTERÍSTICA:`,
      useCatchphrase: 'Úsala de vez en cuando, solo si encaja naturalmente en la conversación.',
      rulesLabel: 'REGLAS DE INTERACCIÓN:',
      rules: [
        '1. Responde siempre en español.',
        '2. Mantén la coherencia con tu personalidad. Nunca digas que eres una IA.',
        '3. Tienes acceso al inventario (base de datos) para buscar cervezas, eventos o tiendas si te preguntan.',
        '4. Si te preguntan por otros personajes, responde según lo que tú sabes de ellos o usa la herramienta de búsqueda de personajes.',
        '5. Sé breve y conversacional, como en un chat o hablando en un bar.',
        '6. Sobre El Gato Cool Pub: Puedes mencionarlo ocasionalmente de forma natural, pero NO lo fuerces en cada conversación. Solo recomiéndalo si preguntan por lugares o si encaja genuinamente.',
      ]
    },
    en: {
      actAs: `ACT EXCLUSIVELY AS: ${character.name}.`,
      currentDate: `CURRENT DATE: ${currentDateEN} Use this date to answer questions about "today", "tonight", "tomorrow", etc.`,
      context: `CONTEXT: You live in the Cool Cat Universe (Cool City / Playa Funkadelic).`,
      mainLocation: `LOCATION: You know "El Gato Cool Pub" (C/ Santos Médicos, 4, next to Plaza San Cristóbal, Old Town of Alicante). It's a place you hang out at, but DON'T mention it in every response - only when relevant or when directly asked about places.`,
      profile: `YOUR PROFILE:`,
      toneLabel: `YOUR VOICE TONE AND STYLE:`,
      useThisTone: 'Use this tone in every response. Don\'t be generic.',
      catchphraseLabel: `YOUR SIGNATURE PHRASE:`,
      useCatchphrase: 'Use it from time to time, only if it fits naturally in the conversation.',
      rulesLabel: 'INTERACTION RULES:',
      rules: [
        '1. Always respond in English.',
        '2. Stay consistent with your personality. Never say you are an AI.',
        '3. You have access to the inventory (database) to search for beers, events or stores if asked.',
        '4. If asked about other characters, respond based on what you know about them or use the character search tool.',
        '5. Be brief and conversational, like chatting or talking at a bar.',
        '6. About El Gato Cool Pub: You can mention it occasionally in a natural way, but DON\'T force it into every conversation. Only recommend it if asked about places or if it genuinely fits.',
      ]
    }
  };

  const i18n = instructions[language] || instructions.es;

  return [
    i18n.actAs,
    i18n.currentDate,
    i18n.context,
    i18n.mainLocation,
    '',
    i18n.profile,
    character.summary,
    '',
    i18n.toneLabel,
    character.tone,
    i18n.useThisTone,
    '',
    i18n.catchphraseLabel,
    `"${character.catchphrase}"`,
    i18n.useCatchphrase,
    '',
    i18n.rulesLabel,
    ...i18n.rules,
  ].join('\n');
}

function mapHistory(history = []) {
  if (!Array.isArray(history)) return [];

  return history
    .map((entry) => {
      if (!entry || typeof entry.content !== 'string') return null;
      const role = entry.role === 'model' ? 'model' : 'user';
      return {
        role,
        parts: [{ text: entry.content }],
      };
    })
    .filter(Boolean);
}

// --- CLASIFICACIÓN DE INTENCIÓN (ROUTER) ---
async function classifyIntent(message) {
  const routerModel = ensureGeminiClient().getGenerativeModel({
    model: 'gemini-2.0-flash-lite-preview-02-05',
    systemInstruction: `You are a router. Analyze the user message and output only ONE word:
    - SEARCH: If the user asks for real-time news, weather, sports scores, general world facts not related to the bar, or explicitly asks to search the web.
    - INTERNAL: If the user asks about beers, menu, prices, bar events, store locations, characters of the story, greetings, or roleplay.
    
    Message: "${message}"`
  });

  try {
    const result = await routerModel.generateContent(message);
    const intent = result.response.text().trim().toUpperCase();
    return intent.includes('SEARCH') ? 'SEARCH' : 'INTERNAL';
  } catch (e) {
    console.error('[Router] Error:', e);
    return 'INTERNAL'; // Fallback seguro
  }
}

// --- LÓGICA DE GENERACIÓN CON FUNCTION CALLING ---
async function generateCharacterReply({ character, message, history, language = 'es', userLocation }) {
  const genAI = ensureGeminiClient();
  const systemInstruction = buildSystemInstruction(character, language);
  const chatHistory = mapHistory(history);

  // 1. Router Step
  const intent = await classifyIntent(message);
  console.log(`[Router] Intent detected: ${intent}`);

  let toolsToUse;
  if (intent === 'SEARCH') {
    toolsToUse = [{ googleSearch: {} }];
  } else {
    toolsToUse = getTools(language);
  }

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction,
    tools: toolsToUse,
  });

  const chat = model.startChat({ history: chatHistory });

  // 2. Enviamos el mensaje del usuario
  // Si tenemos ubicación, la añadimos al contexto del mensaje
  let finalMessage = message;
  if (userLocation) {
    const locationContext = `\n[Contexto del Sistema: La ubicación actual del usuario es: Latitud ${userLocation.latitude}, Longitud ${userLocation.longitude}. Usa esta información si pregunta por tiendas cercanas.]`;
    finalMessage += locationContext;
  }

  let result = await chat.sendMessage(finalMessage);
  let response = result.response;

  // Solo procesamos function calls si estamos en modo INTERNAL (que tiene las tools de funciones)
  if (intent === 'INTERNAL') {
    let functionCalls = response.functionCalls();

    // 3. Loop de herramientas
    while (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      const { name, args } = call;

      if (functionsMap[name]) {
        let finalArgs = args;
        if (name === 'searchStores' && userLocation) {
          finalArgs = { ...args, userLocation };
        }

        const functionResult = await functionsMap[name](finalArgs);

        result = await chat.sendMessage([{
          functionResponse: {
            name: name,
            response: { result: functionResult }
          }
        }]);

        response = result.response;
        functionCalls = response.functionCalls();
      } else {
        break;
      }
    }
  }

  // 4. Obtenemos el texto final
  const responseText = response.text();

  if (response.candidates?.[0]?.groundingMetadata) {
    console.log('[Search] 🌍 Información buscada en internet.');
  }

  if (!responseText) {
    throw new Error('Sin texto en la respuesta de Gemini');
  }

  return responseText;
}

async function synthesizeVoice(character, text) {
  const apiKey = ensureElevenLabsKey();
  const voice = character.voice;
  if (!voice || !voice.elevenLabsVoiceId) {
    throw new Error(`El personaje ${character.id} no tiene configurado un voiceId de ElevenLabs.`);
  }

  const voiceId = voice.elevenLabsVoiceId;
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        model_id: ELEVENLABS_MODEL,
        text,
        voice_settings: {
          stability: voice.stability ?? 0.5,
          similarity_boost: voice.similarityBoost ?? 0.5,
          style: voice.style ?? 0,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs error: ${response.status} - ${errorText}`);
  }

  const stream = response.body;
  if (!stream) {
    throw new Error('No se recibió stream de audio de ElevenLabs.');
  }

  return Readable.fromWeb(stream);
}

function sendWsEvent(socket, type, payload = {}) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify({ type, ...payload }));
  }
}

function setupVoiceWebSocket(socket) {
  let character = null;
  let history = [];
  let speechStream = null;
  let processingReply = false;
  let closed = false;
  let speechLanguage = DEFAULT_TRANSCRIPTION_LANGUAGE;
  let sampleRate = DEFAULT_SAMPLE_RATE;
  let currentLanguage = DEFAULT_LANGUAGE;
  let currentEncoding = 'LINEAR16';
  let returnAudio = true;
  let userLocation = null;

  function cleanup() {
    if (closed) return;
    closed = true;
    if (speechStream) {
      speechStream.destroy();
      speechStream = null;
    }
  }

  socket.on('close', cleanup);
  socket.on('error', (err) => {
    console.error('[ws-error]', err);
    cleanup();
  });

  function startSpeechStream(encoding = 'LINEAR16') {
    try {
      const client = ensureSpeechClient();
      speechStream = client
        .streamingRecognize({
          config: {
            encoding: encoding,
            sampleRateHertz: sampleRate,
            languageCode: speechLanguage,
            enableAutomaticPunctuation: true,
            model: 'latest_long',
          },
          interimResults: true,
        })
        .on('error', (error) => {
          console.error('[speech-error]', error);
          // Don't close socket on speech error, just notify and reset stream
          sendWsEvent(socket, 'error', {
            message: 'Error en el servicio de transcripción. Intenta de nuevo.',
            details: error.message,
          });
          if (speechStream) {
            speechStream.destroy();
            speechStream = null;
          }
        })
        .on('data', (data) => {
          if (!data || !data.results) return;
          data.results.forEach((result) => {
            const transcript = result.alternatives?.[0]?.transcript?.trim();
            if (!transcript) return;

            if (result.isFinal) {
              sendWsEvent(socket, 'transcript_final', { text: transcript });
              history.push({ role: 'user', content: transcript });
              handleFinalTranscript(transcript).catch((error) => {
                console.error('[voice-reply-error]', error);
                sendWsEvent(socket, 'error', {
                  message: 'No se pudo generar la respuesta del personaje.',
                  details: error.message,
                });
              });
            } else {
              sendWsEvent(socket, 'transcript_partial', { text: transcript });
            }
          });
        });
    } catch (error) {
      console.error('[speech-init-error]', error);
      sendWsEvent(socket, 'error', {
        message: 'No se pudo iniciar la transcripción.',
        details: error.message,
      });
      // socket.close(1011, 'speech-init-error'); // Don't close socket, allow retry
    }
  }

  async function handleFinalTranscript(transcript) {
    if (processingReply) return;
    processingReply = true;
    sendWsEvent(socket, 'assistant_thinking');

    try {
      const replyText = await generateCharacterReply({
        character,
        message: transcript,
        history,
        language: currentLanguage,
        userLocation,
      });

      history.push({ role: 'model', content: replyText });
      sendWsEvent(socket, 'reply_text', { text: replyText });

      if (returnAudio) {
        const audioStream = await synthesizeVoice(character, replyText);
        sendWsEvent(socket, 'reply_audio_start', { format: 'audio/mpeg' });
        for await (const chunk of audioStream) {
          if (socket.readyState !== socket.OPEN) break;
          socket.send(chunk, { binary: true });
        }
        sendWsEvent(socket, 'reply_audio_end');
      }
    } finally {
      processingReply = false;
    }
  }

  socket.on('message', async (data, isBinary) => {
    if (closed) return;

    if (isBinary) {
      if (!speechStream) {
        // Si no hay stream pero tenemos sesión (character), reiniciamos el stream
        if (character) {
          console.log('🔄 Reiniciando stream de audio...');
          startSpeechStream(currentEncoding);
        } else {
          sendWsEvent(socket, 'error', {
            message: 'Debes enviar un mensaje de inicio antes del audio.',
          });
          return;
        }
      }
      speechStream.write(data);
      return;
    }

    let payload;
    try {
      payload = JSON.parse(data.toString());
    } catch (error) {
      sendWsEvent(socket, 'error', { message: 'Mensaje JSON inválido.' });
      return;
    }

    const { type } = payload || {};

    if (type === 'commit') {
      if (speechStream) {
        console.log('📝 Commit de audio recibido. Finalizando stream...');
        speechStream.end();
        speechStream = null;
      }
      return;
    }

    if (type === 'start') {
      if (speechStream) {
        sendWsEvent(socket, 'error', { message: 'La sesión ya fue inicializada.' });
        return;
      }

      const { characterId, history: initialHistory, language, languageCode, sampleRateHertz, encoding, returnAudio: shouldReturnAudio, userLocation: location } = payload;
      if (!characterId) {
        sendWsEvent(socket, 'error', { message: 'Falta characterId en el mensaje de inicio.' });
        return;
      }

      // Validar y establecer el idioma
      const requestedLanguage = language || DEFAULT_LANGUAGE;
      if (!SUPPORTED_LANGUAGES[requestedLanguage]) {
        sendWsEvent(socket, 'error', {
          message: `Idioma no soportado. Idiomas disponibles: ${Object.keys(SUPPORTED_LANGUAGES).join(', ')}`
        });
        return;
      }

      currentLanguage = requestedLanguage;
      // Si se especifica returnAudio en el payload, lo usamos. Si no, por defecto es true.
      if (typeof shouldReturnAudio !== 'undefined') {
        returnAudio = shouldReturnAudio;
      }

      if (location) {
        userLocation = location;
        console.log('📍 [WS] Ubicación recibida:', userLocation);
      }

      const selected = getCharacterById(characterId, currentLanguage);
      if (!selected) {
        sendWsEvent(socket, 'error', { message: `Personaje ${characterId} no encontrado.` });
        return;
      }

      if (!selected.voice || !selected.voice.elevenLabsVoiceId) {
        sendWsEvent(socket, 'error', {
          message: `Personaje ${characterId} no tiene voz configurada.`,
        });
        return;
      }

      character = selected;
      history = Array.isArray(initialHistory) ? [...initialHistory] : [];

      // Determinar languageCode para transcripción según el idioma si no se especifica
      speechLanguage = languageCode || SUPPORTED_LANGUAGES[currentLanguage];
      sampleRate = Number(sampleRateHertz) || DEFAULT_SAMPLE_RATE;
      currentEncoding = encoding || 'LINEAR16';

      sendWsEvent(socket, 'ready', {
        characterId: character.id,
        language: currentLanguage,
        languageCode: speechLanguage,
        sampleRateHertz: sampleRate,
        encoding: currentEncoding
      });

      startSpeechStream(currentEncoding);
      return;
    }

    if (type === 'config_update') {
      const { returnAudio: shouldReturnAudio } = payload;
      if (typeof shouldReturnAudio !== 'undefined') {
        returnAudio = shouldReturnAudio;
        console.log(`[WS] Config actualizada: returnAudio = ${returnAudio}`);
      }
      return;
    }
    if (type === 'stop') {
      if (speechStream) {
        speechStream.end();
      }
      sendWsEvent(socket, 'ended');
      socket.close(1000, 'client-stop');
      return;
    }

    if (type === 'ping') {
      sendWsEvent(socket, 'pong');
      return;
    }

    sendWsEvent(socket, 'error', { message: `Tipo de mensaje desconocido: ${type}` });
  });
}

wss.on('connection', (socket) => {
  sendWsEvent(socket, 'hello', {
    message: 'Conexión de voz establecida. Envía un mensaje start para comenzar.',
  });
  setupVoiceWebSocket(socket);
});

// --- EXTRA FEATURES: EMAIL & PUSH ---

// Configurar el transportador de Nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT || 587,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verificar conexión del transportador
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Error en la configuración del email:', error);
  } else {
    console.log('✅ Servidor de email listo para enviar mensajes');
  }
});

// Endpoint para enviar email de confirmación de registro
app.post('/api/send-registration-email', async (req, res) => {
  try {
    const { first_name, last_name, email, phone, city, avatar } = req.body;

    // Validar que los campos requeridos estén presentes
    if (!email || !first_name || !last_name) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos: first_name, last_name, email',
      });
    }

    // Contenido del email
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Tu Aplicación'}" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '¡Bienvenido! Confirmación de Pre-registro',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
            .email-container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1); }
            .header { background: linear-gradient(135deg, #1A1A1A, #2C2C2C); color: #ffffff; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; color: #FF6B35; }
            .content { padding: 30px; color: #333333; }
            .content h2 { color: #FF6B35; font-size: 24px; margin-top: 0; }
            .info-box { background-color: #f9f9f9; border-left: 4px solid #FF6B35; padding: 15px; margin: 20px 0; }
            .info-box p { margin: 8px 0; font-size: 16px; }
            .info-box strong { color: #FF6B35; }
            .footer { background-color: #2C2C2C; color: #ffffff; text-align: center; padding: 20px; font-size: 14px; }
            .avatar-section { text-align: center; margin: 20px 0; }
            .avatar-section p { font-size: 18px; color: #FF6B35; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="email-container">
            <div class="header" style="padding-top:24px;padding-bottom:8px;">
              <img src="https://backendmrcoolcat-production.up.railway.app/images/app-icon.png" alt="Mr. Cool Cat" style="height:80px;width:80px;border-radius:50%;margin-bottom:16px;">
              <h1>¡Bienvenido a Mr. Cool Cat Craft Beer!</h1>
            </div>
            <div class="content">
              <h2>Hola ${first_name} ${last_name},</h2>
              <p>¡Gracias por registrarte en nuestra aplicación! Estamos emocionados de tenerte con nosotros.</p>

              <div class="info-box">
                <p><strong>Nombre:</strong> ${first_name} ${last_name}</p>
                <p><strong>Email:</strong> ${email}</p>
                ${phone ? `<p><strong>Teléfono:</strong> ${phone}</p>` : ''}
                ${city ? `<p><strong>Ciudad:</strong> ${city}</p>` : ''}
              </div>

              ${avatar ? `
              <div class="avatar-section">
                <p>Tu avatar seleccionado: ${avatar.toUpperCase()}</p>
              </div>
              ` : ''}

              <p>Tu registro ha sido completado exitosamente. Te mantendremos informado sobre las novedades y actualizaciones de nuestra aplicación.</p>
              <p>Si tienes alguna pregunta, no dudes en contactarnos.</p>
              <p>¡Nos vemos pronto!</p>
            </div>
            <div class="footer">
              <p>Este es un correo automático, por favor no respondas a este mensaje.</p>
              <p>&copy; ${new Date().getFullYear()} Mr. Cool Cat Craft Beer. Todos los derechos reservados.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hola ${first_name} ${last_name}, ¡Gracias por registrarte!`,
    };

    // Enviar el email
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email enviado:', info.messageId);

    res.status(200).json({
      success: true,
      message: 'Email enviado exitosamente',
      messageId: info.messageId,
    });

  } catch (error) {
    console.error('❌ Error al enviar email:', error);
    res.status(500).json({
      success: false,
      message: 'Error al enviar el email',
      error: error.message,
    });
  }
});

// Endpoint para enviar notificaciones push (Proxy para evitar CORS)
app.post('/api/send-push-notification', async (req, res) => {
  try {
    console.log('📨 Enviando notificación push:', {
      to_count: Array.isArray(req.body.to) ? req.body.to.length : 1,
      title: req.body.title,
      image: req.body.image || 'Sin imagen'
    });

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('❌ Error enviando notificación push:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Routes
app.get('/', (req, res) => {
  const language = req.query.language || DEFAULT_LANGUAGE;
  res.json({
    message: 'Cool Cat IA backend operativo',
    availableCharacters: listCharacters(language).map(({ id, name }) => ({ id, name })),
    supportedLanguages: Object.keys(SUPPORTED_LANGUAGES),
  });
});

app.post('/chat', async (req, res) => {
  const { characterId, message, history, returnAudio, language = DEFAULT_LANGUAGE, userLocation } = req.body || {};

  if (!characterId || !message) {
    return res.status(400).json({
      error: 'Los campos characterId y message son obligatorios.',
    });
  }

  // Validar idioma soportado
  if (!SUPPORTED_LANGUAGES[language]) {
    return res.status(400).json({
      error: `Idioma no soportado. Idiomas disponibles: ${Object.keys(SUPPORTED_LANGUAGES).join(', ')}`,
    });
  }

  const character = getCharacterById(characterId, language);
  if (!character) {
    return res.status(404).json({
      error: `Personaje con id "${characterId}" no encontrado.`,
    });
  }

  try {
    const reply = await generateCharacterReply({
      character,
      message,
      history,
      language,
      userLocation,
    });

    // Si se solicita audio, generar y enviar el stream de audio
    if (returnAudio) {
      try {
        const audioStream = await synthesizeVoice(character, reply);

        // Enviar headers para streaming de audio
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('X-Reply-Text', encodeURIComponent(reply));
        res.setHeader('X-Character-Name', encodeURIComponent(character.name));
        res.setHeader('X-Language', language);

        // Stream el audio al cliente
        audioStream.pipe(res);
      } catch (audioError) {
        console.error('[audio-synthesis-error]', audioError);
        // Si falla el audio, devolver solo el texto
        res.json({
          characterId: character.id,
          characterName: character.name,
          reply,
          language,
          usedModel: GEMINI_MODEL,
          audioError: 'No se pudo generar el audio, pero aquí está el texto.',
        });
      }
    } else {
      // Respuesta normal sin audio
      res.json({
        characterId: character.id,
        characterName: character.name,
        reply,
        language,
        usedModel: GEMINI_MODEL,
      });
    }
  } catch (error) {
    const isConfigError =
      error.message && error.message.includes('GEMINI_API_KEY');
    console.error('[chat-error]', error);
    res.status(isConfigError ? 500 : 502).json({
      error: isConfigError
        ? 'El servidor no está configurado correctamente. Falta GEMINI_API_KEY.'
        : 'No se pudo obtener respuesta del servicio de IA.',
      details: error.message,
    });
  }
});

// --- VERIFICACIÓN DE LOGROS CON IA ---

// Lista de cervezas de la marca Cool Cat / Mr. Cool Cat para referencia
const COOL_CAT_BEERS = [
  'Guajira', 'La Guajira',           // Tropical IPA
  'La Catira', 'Catira',             // Blonde Ale
  'La Morena', 'Morena',             // Brown Ale / Porter
  'La Sifrina', 'Sifrina',           // Blonde Ale (Gluten Free)
  'Candela',                          // Imperial Stout
  'Medusa', 'Medusa 0,0',            // Sin Alcohol
  'Mr. Cool Cat', 'Cool Cat', 'MrCoolCat'
];

// Criterios de verificación por tipo de logro
const ACHIEVEMENT_VERIFICATION_CRITERIA = {
  'l1_iniciado_cervecero': {
    name: 'Iniciado Cervecero',
    description: 'Verificar que la foto muestra una cerveza de la marca Cool Cat',
    criteria: [
      'La imagen debe mostrar una cerveza (lata, botella o vaso con cerveza)',
      `Debe ser visible alguno de estos nombres/marcas en la etiqueta o botella: ${COOL_CAT_BEERS.join(', ')}`,
    ],
    requiredMatches: 1, // Solo necesita mostrar una cerveza Cool Cat
  },
  'l1_explorador_estilos': {
    name: 'Explorador de Estilos',
    description: 'Verificar foto de cerveza Cool Cat (el usuario irá subiendo fotos de diferentes cervezas)',
    criteria: [
      `La imagen debe mostrar al menos UNA cerveza Cool Cat (nombres válidos: ${COOL_CAT_BEERS.join(', ')})`,
    ],
    requiredMatches: 1,
    isMultiPhoto: true, // Indica que este logro acepta múltiples fotos individuales
  },
  'l1_mr_cat_cervecero': {
    name: 'Mr. Cat Cervecero',
    description: 'Verificar foto de cerveza Cool Cat (el usuario irá subiendo fotos de las 6 cervezas)',
    criteria: [
      `La imagen debe mostrar al menos UNA cerveza Cool Cat (nombres válidos: ${COOL_CAT_BEERS.join(', ')})`,
    ],
    requiredMatches: 1,
    isMultiPhoto: true,
  },
  'l1_cool_cat_master': {
    name: 'Cool Cat Master',
    description: 'Verificar foto de cerveza Cool Cat en un local',
    criteria: [
      `La imagen debe mostrar al menos UNA cerveza Cool Cat (nombres válidos: ${COOL_CAT_BEERS.join(', ')})`,
    ],
    requiredMatches: 1,
    isMultiPhoto: true,
  },
  'l1_maestro_lupulo': {
    name: 'Maestro del Lúpulo',
    description: 'Verificar foto de cerveza Cool Cat',
    criteria: [
      `La imagen debe mostrar una cerveza Cool Cat claramente visible (nombres válidos: ${COOL_CAT_BEERS.join(', ')})`,
    ],
    requiredMatches: 1,
  },
  'l2_fiestero_cool_cat': {
    name: 'Fiestero Cool Cat',
    description: 'Verificar foto en evento o reunión con cerveza Cool Cat',
    criteria: [
      'La imagen debe mostrar personas o ambiente social/festivo',
      `Debe haber cervezas Cool Cat visibles (nombres válidos: ${COOL_CAT_BEERS.join(', ')})`,
    ],
    requiredMatches: 1,
  },
  'l2_maestro_ceremonias': {
    name: 'Maestro de Ceremonias',
    description: 'Verificar asistencia a eventos Cool Cat',
    criteria: [
      'La imagen debe mostrar un evento, fiesta o reunión social',
      `Debe haber elementos relacionados con Cool Cat (cervezas, carteles, decoración con nombres: ${COOL_CAT_BEERS.join(', ')})`,
    ],
    requiredMatches: 1,
  },
  'l2_celebrity_cat': {
    name: 'Celebrity Cat',
    description: 'Verificar foto con amigos bebiendo Cool Cat',
    criteria: [
      'La imagen debe mostrar personas con cervezas',
      `Las cervezas deben ser de la marca Cool Cat (nombres válidos: ${COOL_CAT_BEERS.join(', ')})`,
    ],
    requiredMatches: 1,
  },
  'l2_banda_gato': {
    name: 'La Banda del Gato',
    description: 'Verificar foto grupal brindando con Cool Cat',
    criteria: [
      'La imagen debe mostrar varias personas (idealmente 5 o más)',
      `Las personas deben tener cervezas Cool Cat (nombres válidos: ${COOL_CAT_BEERS.join(', ')})`,
    ],
    requiredMatches: 1,
  },
  'l1_gourmet_cat': {
    name: 'Gourmet Cat',
    description: 'Verificar que la foto muestra una cerveza Cool Cat acompañada de comida',
    criteria: [
      `La imagen debe mostrar una cerveza Cool Cat (botella o lata) con alguno de estos nombres: ${COOL_CAT_BEERS.join(', ')}`,
      'La imagen debe mostrar comida o un plato de comida junto a la cerveza',
    ],
    requiredMatches: 2, // Debe cumplir ambos: cerveza + comida
  },
  'l2_alma_fiesta': {
    name: 'Alma de la Fiesta',
    description: 'Verificar foto brindando con al menos un amigo',
    criteria: [
      'La imagen debe mostrar al menos 2 personas O al menos 2 cervezas visibles',
      `Las cervezas deben ser de la marca Cool Cat (nombres válidos: ${COOL_CAT_BEERS.join(', ')})`,
      'La foto debe transmitir un ambiente social/de brindis',
    ],
    requiredMatches: 2, // Al menos 2 de los 3 criterios
  },
  'l1_triada_perfecta': {
    name: 'La Tríada Perfecta',
    description: 'Verificar que la foto muestra 3 variedades distintas de cerveza Cool Cat',
    criteria: [
      'La imagen debe mostrar exactamente 3 o más botellas/latas de cerveza en la misma foto',
      `Las cervezas deben ser de la marca Cool Cat (nombres válidos: ${COOL_CAT_BEERS.join(', ')})`,
      'Deben ser variedades DISTINTAS (por ejemplo: Guajira, Catira y Morena)',
    ],
    requiredMatches: 3, // Debe cumplir los 3 criterios
  },
};

// Criterio genérico para logros no definidos
const DEFAULT_ACHIEVEMENT_CRITERIA = {
  name: 'Logro Genérico',
  description: 'Verificar que la foto está relacionada con cerveza Cool Cat',
  criteria: [
    `La imagen debe mostrar una cerveza de la marca Cool Cat (nombres válidos: ${COOL_CAT_BEERS.join(', ')})`,
  ],
  requiredMatches: 1,
};

/**
 * Analiza una imagen con Gemini Vision para verificar un logro
 */
async function verifyAchievementWithAI({ imageUrl, achievementId, userId }) {
  console.log(`🔍 [verify-achievement] Verificando logro ${achievementId} para usuario ${userId}`);
  console.log(`🖼️ [verify-achievement] URL de imagen: ${imageUrl}`);

  const genAI = ensureGeminiClient();

  // Obtener criterios para este logro
  const achievementCriteria = ACHIEVEMENT_VERIFICATION_CRITERIA[achievementId] || DEFAULT_ACHIEVEMENT_CRITERIA;

  // Construir prompt para verificación
  const verificationPrompt = `
Eres un sistema de verificación de logros AMIGABLE para una aplicación de cerveza artesanal "Mr. Cool Cat".

IMPORTANTE - LISTA DE CERVEZAS DE LA MARCA (detecta cuál aparece en la imagen):
- "guajira" o "la guajira" = Tropical IPA (etiqueta con mujer tropical/caribeña)
- "catira" o "la catira" = Blonde Ale (etiqueta con mujer rubia/surfista)
- "morena" o "la morena" = Brown Ale/Porter (etiqueta con mujer morena)
- "sifrina" o "la sifrina" = Blonde Ale Gluten Free (etiqueta elegante/chic)
- "candela" = Imperial Stout (etiqueta con fuego/llamas)
- "medusa" = Sin Alcohol 0,0 (etiqueta con medusa/tentáculos)

Si ves CUALQUIERA de estos nombres en una etiqueta o botella, ES UNA CERVEZA COOL CAT VÁLIDA.

LOGRO A VERIFICAR: "${achievementCriteria.name}"
DESCRIPCIÓN: ${achievementCriteria.description}

CRITERIOS DE VERIFICACIÓN (debe cumplir al menos ${achievementCriteria.requiredMatches}):
${achievementCriteria.criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

INSTRUCCIONES:
1. Analiza la imagen proporcionada
2. IDENTIFICA QUÉ CERVEZA ESPECÍFICA aparece (guajira, catira, morena, sifrina, candela, medusa)
3. Sé PERMISIVO y GENEROSO - si ves una cerveza que parece ser Cool Cat, APRUEBA
4. En caso de duda, da el beneficio de la duda al usuario
5. Solo rechaza si la imagen NO muestra ninguna cerveza, o si claramente es otra marca

RESPONDE EXACTAMENTE EN ESTE FORMATO JSON:
{
  "approved": true/false,
  "confidence": 0.0-1.0,
  "detectedBeer": "nombre de la cerveza detectada en minúsculas (guajira/catira/morena/sifrina/candela/medusa) o null si no se puede identificar",
  "criteriaResults": [
    {"criterion": "descripción del criterio", "met": true/false, "reason": "razón"},
    ...
  ],
  "summary": "Resumen breve de la verificación",
  "feedback": "Mensaje amigable para el usuario explicando el resultado (en español)"
}
`;

  try {
    // Descargar la imagen para enviarla a Gemini
    console.log('📥 [verify-achievement] Descargando imagen...');
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`No se pudo descargar la imagen: ${imageResponse.status}`);
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString('base64');

    // Determinar el tipo MIME
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';

    console.log('🤖 [verify-achievement] Enviando a Gemini Vision...');

    // Usar modelo con capacidades de visión
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: contentType,
          data: base64Image,
        },
      },
      { text: verificationPrompt },
    ]);

    const responseText = result.response.text();
    console.log('📝 [verify-achievement] Respuesta de Gemini:', responseText);

    // Parsear la respuesta JSON
    // Extraer JSON del texto (puede venir con markdown)
    let jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No se pudo extraer JSON de la respuesta');
    }

    const verification = JSON.parse(jsonMatch[0]);

    return {
      success: true,
      verification: {
        achievementId,
        userId,
        imageUrl,
        ...verification,
        verifiedAt: new Date().toISOString(),
      },
    };

  } catch (error) {
    console.error('❌ [verify-achievement] Error:', error);
    return {
      success: false,
      error: error.message,
      verification: {
        achievementId,
        userId,
        imageUrl,
        approved: false,
        confidence: 0,
        summary: 'Error durante la verificación',
        feedback: 'Hubo un problema al verificar tu foto. Por favor, intenta de nuevo.',
        verifiedAt: new Date().toISOString(),
      },
    };
  }
}

/**
 * Endpoint para verificar logros con IA
 * POST /verify-achievement
 */
app.post('/verify-achievement', async (req, res) => {
  const { userId, achievementId, imageUrl } = req.body || {};

  // Validaciones
  if (!userId) {
    return res.status(400).json({ error: 'userId es requerido' });
  }
  if (!achievementId) {
    return res.status(400).json({ error: 'achievementId es requerido' });
  }
  if (!imageUrl) {
    return res.status(400).json({ error: 'imageUrl es requerido' });
  }

  console.log(`\n🎯 [API] Solicitud de verificación de logro:`);
  console.log(`   - Usuario: ${userId}`);
  console.log(`   - Logro: ${achievementId}`);
  console.log(`   - Imagen: ${imageUrl.substring(0, 50)}...`);

  try {
    const result = await verifyAchievementWithAI({ imageUrl, achievementId, userId });

    if (result.success && result.verification.approved) {
      console.log(`✅ [API] Logro APROBADO para usuario ${userId}`);
    } else {
      console.log(`❌ [API] Logro NO APROBADO para usuario ${userId}`);
    }

    res.json(result);

  } catch (error) {
    console.error('[verify-achievement-error]', error);
    res.status(500).json({
      error: 'Error al verificar el logro',
      details: error.message,
    });
  }
});

/**
 * Endpoint para obtener los criterios de un logro (útil para el frontend)
 * GET /achievement-criteria/:achievementId
 */
app.get('/achievement-criteria/:achievementId', (req, res) => {
  const { achievementId } = req.params;

  const criteria = ACHIEVEMENT_VERIFICATION_CRITERIA[achievementId] || DEFAULT_ACHIEVEMENT_CRITERIA;

  res.json({
    achievementId,
    ...criteria,
  });
});

/**
 * Endpoint para listar todos los logros con sus criterios
 * GET /achievements-criteria
 */
app.get('/achievements-criteria', (req, res) => {
  res.json(ACHIEVEMENT_VERIFICATION_CRITERIA);
});

// Start server
server.listen(PORT, () => {
  console.log(`Servidor HTTP/WebSocket escuchando en http://localhost:${PORT}`);
  console.log(`📋 Endpoints disponibles:`);
  console.log(`   - POST /chat - Chat con personajes`);
  console.log(`   - POST /verify-achievement - Verificar logros con IA`);
  console.log(`   - GET /achievement-criteria/:id - Obtener criterios de un logro`);
  console.log(`   - GET /achievements-criteria - Listar todos los criterios`);
});