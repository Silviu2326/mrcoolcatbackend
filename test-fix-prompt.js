require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testPrompt() {
    const apiKey = process.env.GEMINI_API_KEY;
    const modelName = "gemini-2.5-flash";

    const toolDescriptionImproved = {
        description: "Busca tiendas o bares. IMPORTANTE: Si el usuario dice 'barrio', 'zona', 'por aquí' o 'cerca', NO pongas nada en location (null) para usar su GPS.",
        location: "Ciudad o zona explícita (ej: 'Alicante'). Dejar NULL/VACÍO si es 'mi zona', 'el barrio', 'por aquí'."
    };

    const tools = [{
        functionDeclarations: [{
            name: "searchStores",
            description: toolDescriptionImproved.description,
            parameters: {
                type: "OBJECT",
                properties: {
                    location: { type: "STRING", description: toolDescriptionImproved.location }
                },
                required: []
            }
        }]
    }];

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName, tools: tools });

    const msg = "Oye, gato donde me recomiendas irme a tomar una cerveza que quede en la zona del barrio.";
    console.log(`Prompt: "${msg}"`);

    const result = await model.generateContent(msg);
    const calls = result.response.functionCalls();

    if (calls) {
        console.log("Function Calls:", JSON.stringify(calls, null, 2));
    } else {
        console.log("Response Text:", result.response.text());
    }
}

testPrompt();
