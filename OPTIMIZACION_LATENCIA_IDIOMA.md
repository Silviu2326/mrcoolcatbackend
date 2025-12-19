# Guía de Optimización: Latencia y Estabilidad de Idioma

Este documento detalla las soluciones identificadas para mejorar la velocidad de respuesta (latencia) de la aplicación y corregir el problema donde las voces de ElevenLabs cambian de idioma inesperadamente.

## 1. Problema: Latencia Alta (La app tarda en responder)

Actualmente, el flujo de datos es **serial**, lo que suma los tiempos de cada paso:
1. **Transcripción (Google Speech):** Espera a que el usuario termine de hablar.
2. **Clasificación (Gemini Router):** Decide si buscar en internet o no (~500ms - 1s).
3. **Generación de Texto (Gemini Chat):** Genera la respuesta completa (~1s - 3s).
4. **Generación de Audio (ElevenLabs HTTP):** Envía el texto completo y espera el primer byte (~500ms - 1s).
5. **Streaming al Cliente:** El audio empieza a sonar.

### Solución A: Cambiar al Modelo "Turbo" de ElevenLabs (Victoria Rápida)
El modelo actual `eleven_multilingual_v2` prioriza calidad sobre velocidad. El modelo `eleven_turbo_v2_5` es **mucho más rápido** (latencia ~400ms) y soporta español de alta calidad.

**Acción:**
En `src/server.js`, cambia la variable `ELEVENLABS_MODEL`:

```javascript
// ANTES
const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';

// DESPUÉS (Recomendado)
const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2_5';
```

### Solución B: Optimizar el "Router" de Intención
Actualmente, cada mensaje pasa por una llamada extra a Gemini (`classifyIntent`) antes de generar la respuesta real.

**Acción:**
Si la función de búsqueda en Google no es crítica para cada interacción, puedes:
1.  **Eliminar el paso del Router** y dejar que el modelo principal decida si usar la herramienta `googleSearch` (si se le proporciona).
2.  **Usar un modelo más pequeño aún** o lógica de palabras clave (regex) para detectar intenciones simples como "busca en google" antes de llamar a la IA.

### Solución C: Streaming de Texto a Audio (Avanzado)
En lugar de esperar a que Gemini termine la frase completa, se puede enviar el texto a ElevenLabs por partes (chunks) usando WebSockets. Esto permite que el audio empiece a sonar casi al mismo tiempo que la IA empieza a escribir.
*Nota: Esto requiere una reescritura significativa de la función `handleFinalTranscript` y el uso del SDK de WebSocket de ElevenLabs.*

---

## 2. Problema: Cambio de Idioma (Habla en inglés/otro idioma)

Esto ocurre porque los modelos "multilingual" intentan autodetectar el idioma del texto. Si la respuesta es corta (ej: "¡Yeah!", "Cool"), el modelo puede confundirse y aplicar un acento inglés o cambiar de idioma.

### Solución A: Usar el Modelo Turbo v2.5
El modelo `eleven_turbo_v2_5` tiene una estabilidad de idioma superior a `multilingual_v2`. Solo con hacer el cambio de la "Solución A" de arriba, este problema debería reducirse drásticamente.

### Solución B: Ajustar la "Estabilidad" de la Voz
En `src/characters.js`, cada personaje tiene una configuración de voz.
*   **Stability (Estabilidad):** Valores bajos (0.3) hacen la voz más expresiva pero inestable (riesgo de cambio de idioma). Valores altos (0.7) son más monótonos pero seguros.
*   **Similarity Boost:** Ayuda a mantener el timbre de la voz original.

**Acción:**
Si un personaje falla mucho (ej. "Buck"), sube su estabilidad en `src/characters.js`:

```javascript
// src/characters.js
buck: {
  // ...
  voice: {
    // ...
    // Sube de 0.25 a 0.45 o 0.5 si cambia mucho de idioma
    stability: 0.5, 
    similarityBoost: 0.8,
    // ...
  }
}
```

### Solución C: Forzar Idioma (Si usas Turbo v2.5)
Aunque la API REST simple no siempre permite "forzar" idioma en el cuerpo JSON de la misma manera en todas las versiones, el modelo Turbo v2.5 respeta mucho mejor el idioma del texto de entrada. Asegúrate de que el prompt de sistema (`src/server.js` -> `buildSystemInstruction`) le ordene explícitamente al modelo de texto (Gemini) **nunca** usar palabras sueltas en inglés si no es necesario, o que responda frases completas en español para dar más contexto al motor de voz.

---

## Resumen de Cambios Recomendados

1.  **Editar `src/server.js`:** Cambiar `ELEVENLABS_MODEL` a `'eleven_turbo_v2_5'`.
2.  **Editar `src/characters.js`:** Aumentar `stability` (a 0.4 - 0.5) en los personajes problemáticos.
