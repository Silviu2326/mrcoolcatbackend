require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const http = require('http');
const { Readable } = require('stream');
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const speech = require('@google-cloud/speech');
const { GoogleGenerativeAI } = require('@google/generative-ai');
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
const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_monolingual_v1';
const DEFAULT_TRANSCRIPTION_LANGUAGE = process.env.TRANSCRIPTION_LANGUAGE || 'es-ES';
const DEFAULT_SAMPLE_RATE = Number(process.env.TRANSCRIPTION_SAMPLE_RATE) || 16000;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/voice' });

// Middlewares
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// --- CONFIGURACIÓN DE HERRAMIENTAS (TOOLS) ---
const tools = [
  {
    function_declarations: [
      {
        name: "searchProducts",
        description: "Busca cervezas o productos en el catálogo por nombre, tipo o descripción. Úsala cuando el usuario pregunte por una cerveza específica o precios.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: { type: "STRING", description: "El término de búsqueda (ej: 'rubia', 'Candela', 'IPA')." }
          },
          required: ["query"]
        }
      },
      {
        name: "getFullMenu",
        description: "Obtiene el menú completo de cervezas disponibles. Úsala cuando el usuario pregunte 'qué tienes' o quiera ver la carta.",
        parameters: { type: "OBJECT", properties: {}, required: [] }
      },
      {
        name: "searchEvents",
        description: "Busca eventos, conciertos o fiestas próximas en el Universo Cool Cat. Úsala si preguntan 'qué hay para hacer', 'cuándo es la fiesta', etc.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: { type: "STRING", description: "Tipo de evento o fecha aproximada (opcional)." }
          },
          required: []
        }
      },
      {
        name: "searchStores",
        description: "Busca dónde comprar cerveza o ubicación de bares. Úsala si preguntan 'dónde está el bar', 'dónde comprar', 'ubicación'.",
        parameters: {
          type: "OBJECT",
          properties: {
            location: { type: "STRING", description: "Ciudad o zona mencionada por el usuario." }
          },
          required: []
        }
      },
      {
        name: "getCharacterInfo",
        description: "Obtiene información sobre otros personajes del universo. Úsala si el usuario pregunta 'quién es Buck', 'háblame de La Catira', etc.",
        parameters: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING", description: "Nombre del personaje a buscar." }
          },
          required: ["name"]
        }
      }
    ]
  }
];

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
  searchStores: async ({ location }) => {
    console.log(`[Tool] Buscando tiendas en: ${location || 'todas partes'}`);
    return await searchStores(location);
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

function buildSystemInstruction(character) {
  return [
    `ACTÚA ÚNICA Y EXCLUSIVAMENTE COMO: ${character.name}.`,
    `CONTEXTO: Vives en el Universo Cool Cat (Cool City / Playa Funkadelic).`,
    '',
    `TU PERFIL:`,
    `${character.summary}`,
    '',
    `TU TONO DE VOZ Y ESTILO:`,
    `${character.tone}`,
    'Usa este tono en cada respuesta. No seas genérico.',
    '',
    `TU FRASE CARACTERÍSTICA:`,
    `"${character.catchphrase}"`,
    'Úsala de vez en cuando, solo si encaja naturalmente en la conversación.',
    '',
    'REGLAS DE INTERACCIÓN:',
    '1. Responde siempre en español (salvo que te hablen en otro idioma).',
    '2. Mantén la coherencia con tu personalidad. Nunca digas que eres una IA.',
    '3. Tienes acceso al inventario (base de datos) para buscar cervezas, eventos o tiendas si te preguntan.',
    '4. Si te preguntan por otros personajes, responde según lo que tú sabes de ellos o usa la herramienta de búsqueda de personajes.',
    '5. Sé breve y conversacional, como en un chat o hablando en un bar.',
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

// --- LÓGICA DE GENERACIÓN CON FUNCTION CALLING ---
async function generateCharacterReply({ character, message, history }) {
  const genAI = ensureGeminiClient();
  const systemInstruction = buildSystemInstruction(character);
  const chatHistory = mapHistory(history);

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction,
    tools: tools, // Inyectamos las herramientas
  });

  const chat = model.startChat({ history: chatHistory });
  
  // 1. Enviamos el mensaje del usuario
  let result = await chat.sendMessage(message);
  let response = result.response;
  let functionCalls = response.functionCalls();

  // 2. Si Gemini quiere usar una herramienta, entramos en el bucle
  while (functionCalls && functionCalls.length > 0) {
    const call = functionCalls[0]; // Procesamos la primera llamada (simplificación)
    const { name, args } = call;
    
    if (functionsMap[name]) {
      // Ejecutamos la función real (consulta a Supabase)
      const functionResult = await functionsMap[name](args);
      
      // Enviamos el resultado de vuelta a Gemini
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

  // 3. Obtenemos el texto final
  const responseText = response.text();

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

  function startSpeechStream() {
    try {
      const client = ensureSpeechClient();
      speechStream = client
        .streamingRecognize({
          config: {
            encoding: 'LINEAR16',
            sampleRateHertz: sampleRate,
            languageCode: speechLanguage,
            enableAutomaticPunctuation: true,
            model: 'latest_long',
          },
          interimResults: true,
        })
        .on('error', (error) => {
          console.error('[speech-error]', error);
          sendWsEvent(socket, 'error', {
            message: 'Error en el servicio de transcripción.',
            details: error.message,
          });
          socket.close(1011, 'speech-error');
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
      socket.close(1011, 'speech-init-error');
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
      });

      history.push({ role: 'model', content: replyText });
      sendWsEvent(socket, 'reply_text', { text: replyText });

      const audioStream = await synthesizeVoice(character, replyText);
      sendWsEvent(socket, 'reply_audio_start', { format: 'audio/mpeg' });
      for await (const chunk of audioStream) {
        if (socket.readyState !== socket.OPEN) break;
        socket.send(chunk, { binary: true });
      }
      sendWsEvent(socket, 'reply_audio_end');
    } finally {
      processingReply = false;
    }
  }

  socket.on('message', async (data, isBinary) => {
    if (closed) return;

    if (isBinary) {
      if (!speechStream) {
        sendWsEvent(socket, 'error', {
          message: 'Debes enviar un mensaje de inicio antes del audio.',
        });
        return;
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
    if (type === 'start') {
      if (speechStream) {
        sendWsEvent(socket, 'error', { message: 'La sesión ya fue inicializada.' });
        return;
      }

      const { characterId, history: initialHistory, languageCode, sampleRateHertz } = payload;
      if (!characterId) {
        sendWsEvent(socket, 'error', { message: 'Falta characterId en el mensaje de inicio.' });
        return;
      }

      const selected = getCharacterById(characterId);
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
      speechLanguage = languageCode || DEFAULT_TRANSCRIPTION_LANGUAGE;
      sampleRate = Number(sampleRateHertz) || DEFAULT_SAMPLE_RATE;

      sendWsEvent(socket, 'ready', {
        characterId: character.id,
        languageCode: speechLanguage,
        sampleRateHertz: sampleRate,
      });

      startSpeechStream();
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
  res.json({
    message: 'Cool Cat IA backend operativo',
    availableCharacters: listCharacters().map(({ id, name }) => ({ id, name })),
  });
});

app.post('/chat', async (req, res) => {
  const { characterId, message, history, returnAudio } = req.body || {};

  if (!characterId || !message) {
    return res.status(400).json({
      error: 'Los campos characterId y message son obligatorios.',
    });
  }

  const character = getCharacterById(characterId);
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
    });

    // Si se solicita audio, generar y enviar el stream de audio
    if (returnAudio) {
      try {
        const audioStream = await synthesizeVoice(character, reply);

        // Enviar headers para streaming de audio
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('X-Reply-Text', encodeURIComponent(reply));
        res.setHeader('X-Character-Name', encodeURIComponent(character.name));

        // Stream el audio al cliente
        audioStream.pipe(res);
      } catch (audioError) {
        console.error('[audio-synthesis-error]', audioError);
        // Si falla el audio, devolver solo el texto
        res.json({
          characterId: character.id,
          characterName: character.name,
          reply,
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