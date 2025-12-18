require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testGemini() {
  console.log('--- TEST DE CONEXIÓN GEMINI FINAL ---');
  
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = "gemini-3-flash-preview"; 

  console.log(`🔑 Usando modelo: ${modelName}`);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    console.log('📡 Enviando: "Hola"');
    const result = await model.generateContent("Hola");
    const response = await result.response;
    const text = response.text();

    console.log(`\n✅ ÉXITO. Respuesta: "${text}"`);
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
  }
}

testGemini();