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
const { getCharacterById, listCharacters } = require('./characters');
const { 
  searchProducts, 
  getFullMenu, 
  searchEvents, 
  searchStores, 
  searchCharactersInfo 
} = require('./services/catalogService');

const PORT = process.env.PORT || 3000;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
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
        description: "Busca dónde comprar cerveza o ubicación de bares. Úsala si preguntan 'dónde está el bar', 'dónde comprar', 'ubicación'.",
        location: "Ciudad o zona mencionada por el usuario."
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
        description: "Search for where to buy beer or bar locations. Use it if they ask 'where is the bar', 'where to buy', 'location'.",
        location: "City or area mentioned by the user."
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
  const instructions = {
    es: {
      actAs: `ACTÚA ÚNICA Y EXCLUSIVAMENTE COMO: ${character.name}.`,
      context: `CONTEXTO: Vives en el Universo Cool Cat (Cool City / Playa Funkadelic).`,
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
      ]
    },
    en: {
      actAs: `ACT EXCLUSIVELY AS: ${character.name}.`,
      context: `CONTEXT: You live in the Cool Cat Universe (Cool City / Playa Funkadelic).`,
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
      ]
    }
  };

  const i18n = instructions[language] || instructions.es;

  return [
    i18n.actAs,
    i18n.context,
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

// Start server
server.listen(PORT, () => {
  console.log(`Servidor HTTP/WebSocket escuchando en http://localhost:${PORT}`);
});