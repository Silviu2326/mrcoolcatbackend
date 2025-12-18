require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { listCharacters } = require('./src/characters');

// Copia exacta de la función mejorada en server.js
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
    '1. Responde siempre en español.',
    '2. Nunca digas que eres una IA.',
    '3. Sé breve y conversacional.',
  ].join('\n');
}

async function testPersona(characterId) {
  const characters = listCharacters();
  const character = characters.find(c => c.id === characterId);
  
  if (!character) {
    console.error(`❌ Personaje ${characterId} no encontrado.`);
    return;
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: "gemini-3-flash-preview",
    systemInstruction: buildSystemInstruction(character)
  });

  console.log(`\n🎭 SIMULANDO A: ${character.name.toUpperCase()}`);
  console.log(`   (Tono: ${character.tone.substring(0, 50)}...)`);
  
  const prompt = "¿Cómo describirías una buena noche en Cool City?";
  console.log(`   ❓ Pregunta: "${prompt}"`);

  try {
    const result = await model.generateContent(prompt);
    console.log(`   🗣️  Respuesta:\n   "${result.response.text().trim()}"`);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function runPersonaTests() {
  console.log('--- TEST DE PERSONALIDADES ---');
  await testPersona('gatoCool');
  await testPersona('buck');
  await testPersona('sifrina');
}

runPersonaTests();
