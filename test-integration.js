require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { searchProducts, getFullMenu, searchEvents, searchStores, searchCharactersInfo } = require('./src/services/catalogService');
const { listCharacters } = require('./src/characters'); // Necesario para que funcione el servicio en local

// Configuración idéntica al servidor
const GEMINI_MODEL = 'gemini-3-flash-preview';
const tools = [
  {
    function_declarations: [
      {
        name: "searchProducts",
        description: "Busca cervezas o productos en el catálogo por nombre, tipo o descripción.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: { type: "STRING", description: "El término de búsqueda." }
          },
          required: ["query"]
        }
      },
      {
        name: "getFullMenu",
        description: "Obtiene el menú completo de cervezas.",
        parameters: { type: "OBJECT", properties: {}, required: [] }
      },
      {
        name: "searchEvents",
        description: "Busca eventos próximos.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: { type: "STRING", description: "Tipo de evento o fecha." }
          },
          required: []
        }
      },
      {
        name: "searchStores",
        description: "Busca dónde comprar o bares.",
        parameters: {
          type: "OBJECT",
          properties: {
            location: { type: "STRING", description: "Ciudad o zona." }
          },
          required: []
        }
      },
      {
        name: "getCharacterInfo",
        description: "Obtiene información sobre personajes.",
        parameters: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING", description: "Nombre del personaje." }
          },
          required: ["name"]
        }
      }
    ]
  }
];

const functionsMap = {
  searchProducts: async ({ query }) => searchProducts(query),
  getFullMenu: async () => getFullMenu(),
  searchEvents: async ({ query }) => searchEvents(query),
  searchStores: async ({ location }) => searchStores(location),
  getCharacterInfo: async ({ name }) => searchCharactersInfo(name)
};

async function simulateChat(userMessage, characterName = "Asistente") {
  console.log(`
🔵 USUARIO: "${userMessage}"`);
  
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  // Simulamos la instrucción de sistema que hace el server.js real
  let systemInstruction = `Eres un asistente útil.`;
  if (characterName === "Gato Cool") {
    systemInstruction = `Eres El Gato Cool, un DJ bohemio filósofo. Hablas con calma, usas metáforas musicales y vibra positiva. Tu frase es: "La vida es una jam session".`;
  } else if (characterName === "Buck") {
    systemInstruction = `Eres Buck, un perro rockero gruñón y sarcástico. Odias el pop comercial.`;
  }

  const model = genAI.getGenerativeModel({ 
    model: GEMINI_MODEL,
    systemInstruction: systemInstruction, // Inyectamos personalidad
    tools: tools
  });

  const chat = model.startChat();
  
  try {
    // 1. Primer envío
    let result = await chat.sendMessage(userMessage);
    // ... resto del código igual ...
    let response = result.response;
    let functionCalls = response.functionCalls();

    // 2. Ciclo de herramientas
    while (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      const { name, args } = call;
      
      console.log(`   🛠️  IA decidió usar herramienta: [${name}] con args:`, args);

      if (functionsMap[name]) {
        const functionResult = await functionsMap[name](args);
        console.log(`   📊 DB devolvió ${functionResult.length} resultados.`);
        
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

    console.log(`🟢 IA (${characterName}): "${response.text()}"`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function runTests() {
  console.log('--- SIMULANDO CONVERSACIONES REALES ---');
  
  // Caso 1: Chiste del Gato Cool
  await simulateChat("Cuéntame un chiste corto.", "Gato Cool");

  // Caso 2: Chiste de Buck (para contrastar)
  await simulateChat("Cuéntame un chiste.", "Buck");
}

runTests();
