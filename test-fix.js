require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function test() {
    const apiKey = process.env.GEMINI_API_KEY;
    const modelName = "gemini-2.5-flash"; // Testing 2.5
    // const modelName = "gemini-3-flash-preview"; 

    // Simulating INTERNAL intent (only function declarations)
    const tools = [
        {
            functionDeclarations: [
                {
                    name: "dummyFunc",
                    description: "Does nothing",
                    parameters: { type: "OBJECT", properties: {}, required: [] }
                }
            ]
        }
    ];

    const systemInstruction = "Eres un gato.";

    console.log(`Testing ONLY FUNCTION DECLARATIONS with ${modelName}...`);

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: modelName,
            tools: tools,
            systemInstruction: systemInstruction
        });

        console.log("Sending request...");
        const result = await model.generateContent("Llama a la funcion dummyFunc");
        console.log("Success:", JSON.stringify(result.response.functionCalls(), null, 2));
        console.log("Text:", result.response.text());
    } catch (error) {
        console.error("Error details:", error.message);
    }
}

test();
