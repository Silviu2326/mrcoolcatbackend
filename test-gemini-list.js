require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
  console.log('--- LISTANDO MODELOS DISPONIBLES ---\n');
  const apiKey = process.env.GEMINI_API_KEY;
  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    // Obtenemos el "model manager" (una abstracción interna) para listar
    // Nota: El SDK de JS no tiene un método directo "listModels" en la clase principal
    // en todas las versiones, así que usaremos fetch directo para listar.
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.models) {
      console.log(`✅ Tu clave tiene acceso a ${data.models.length} modelos:`);
      data.models.forEach(m => {
        if (m.name.includes('gemini')) {
            console.log(`   - ${m.name.replace('models/', '')} (${m.supportedGenerationMethods.join(', ')})`);
        }
      });
    } else {
      console.log('❌ No se encontraron modelos. Respuesta:', data);
    }

  } catch (error) {
    console.error('❌ Error listando modelos:', error);
  }
}

listModels();
