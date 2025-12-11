# Plan de Acción: Implementación de Soporte Multiidioma (Español/Inglés)

## Objetivo
Permitir que la aplicación funcione tanto en español como en inglés, donde el frontend enviará el idioma seleccionado por el usuario y toda la experiencia (conversaciones, respuestas del personaje, herramientas) se adaptará a ese idioma.

---

## 1. Backend - Modificaciones en `src/server.js`

### 1.1 Agregar constante de idiomas soportados
```javascript
const SUPPORTED_LANGUAGES = {
  es: 'es-ES',
  en: 'en-US'
};
```

### 1.2 Actualizar función `buildSystemInstruction(character, language)`
- Agregar parámetro `language` (por defecto 'es')
- Crear dos versiones de las instrucciones del sistema: español e inglés
- Ejemplo:
```javascript
function buildSystemInstruction(character, language = 'es') {
  const instructions = {
    es: {
      actAs: `ACTÚA ÚNICA Y EXCLUSIVAMENTE COMO: ${character.name}.`,
      context: `CONTEXTO: Vives en el Universo Cool Cat (Cool City / Playa Funkadelic).`,
      profile: `TU PERFIL:`,
      tone: `TU TONO DE VOZ Y ESTILO:`,
      catchphrase: `TU FRASE CARACTERÍSTICA:`,
      rules: 'REGLAS DE INTERACCIÓN:',
      // ... más textos
    },
    en: {
      actAs: `ACT EXCLUSIVELY AS: ${character.name}.`,
      context: `CONTEXT: You live in the Cool Cat Universe (Cool City / Playa Funkadelic).`,
      profile: `YOUR PROFILE:`,
      tone: `YOUR VOICE TONE AND STYLE:`,
      catchphrase: `YOUR SIGNATURE PHRASE:`,
      rules: 'INTERACTION RULES:',
      // ... más textos
    }
  };

  const i18n = instructions[language] || instructions.es;
  // Construir el system instruction usando i18n
}
```

### 1.3 Actualizar `tools` para ser multiidioma
- Crear función `getTools(language)` que devuelva las herramientas en el idioma correspondiente
- Traducir los nombres de las funciones (mantener el código igual, solo traducir descripciones)
- Ejemplo:
```javascript
function getTools(language = 'es') {
  const toolDescriptions = {
    es: {
      searchProducts: {
        description: "Busca cervezas o productos en el catálogo...",
        query: "El término de búsqueda..."
      },
      // ... más herramientas
    },
    en: {
      searchProducts: {
        description: "Search for beers or products in the catalog...",
        query: "The search term..."
      },
      // ... más herramientas
    }
  };

  const i18n = toolDescriptions[language] || toolDescriptions.es;

  return [{
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
      // ... más declaraciones
    ]
  }];
}
```

### 1.4 Actualizar función `generateCharacterReply`
- Agregar parámetro `language`
- Usar `buildSystemInstruction(character, language)`
- Usar `getTools(language)` en lugar de `tools` estático

### 1.5 Modificar endpoint `/chat`
- Recibir parámetro `language` en el body (por defecto 'es')
- Validar que el idioma esté en `SUPPORTED_LANGUAGES`
- Pasar `language` a `generateCharacterReply`

```javascript
app.post('/chat', async (req, res) => {
  const { characterId, message, history, returnAudio, language = 'es' } = req.body || {};

  // Validar idioma
  if (!['es', 'en'].includes(language)) {
    return res.status(400).json({
      error: 'Invalid language. Supported: es, en'
    });
  }

  // ... resto del código
  const reply = await generateCharacterReply({
    character,
    message,
    history,
    language
  });
});
```

### 1.6 Modificar WebSocket para voz
- En el mensaje `start`, recibir parámetro `language`
- Actualizar `languageCode` para transcripción según idioma (es-ES o en-US)
- Pasar idioma a `generateCharacterReply` en `handleFinalTranscript`

```javascript
// En el tipo 'start' del WebSocket
const { characterId, history: initialHistory, language = 'es', languageCode, sampleRateHertz } = payload;

// Determinar languageCode según idioma si no se especifica
speechLanguage = languageCode || (language === 'en' ? 'en-US' : 'es-ES');
```

---

## 2. Backend - Modificaciones en `src/characters.js`

### 2.1 Agregar traducciones de personajes
- Cada personaje debe tener `summary`, `tone` y `catchphrase` en ambos idiomas
- Estructura sugerida:

```javascript
const characters = {
  gatoCool: {
    id: 'gatoCool',
    name: 'El Gato Cool', // Puede tener versión en inglés si aplica
    nameEn: 'The Cool Cat',
    summary: {
      es: 'DJ bohemio filósofo de Cool City...',
      en: 'Bohemian philosopher DJ from Cool City...'
    },
    tone: {
      es: 'Habla con calma, ingenio y humor...',
      en: 'Speaks with calm, wit and humor...'
    },
    catchphrase: {
      es: 'La vida es una jam session, lo importante es cómo la improvisas.',
      en: 'Life is a jam session, what matters is how you improvise it.'
    },
    voice: {
      elevenLabsVoiceId: 'Ma1cqEdPvd6KwR3n13iY',
      stability: 0.35,
      similarityBoost: 0.7,
      style: 0.6,
      description: {
        es: 'Voz masculina relajada con matiz funky y tono cálido.',
        en: 'Relaxed male voice with funky nuance and warm tone.'
      }
    }
  },
  // ... repetir para todos los personajes
};
```

### 2.2 Crear función helper para obtener personaje en idioma específico
```javascript
function getCharacterById(id, language = 'es') {
  const char = characters[id];
  if (!char) return null;

  return {
    ...char,
    name: language === 'en' && char.nameEn ? char.nameEn : char.name,
    summary: typeof char.summary === 'object' ? char.summary[language] : char.summary,
    tone: typeof char.tone === 'object' ? char.tone[language] : char.tone,
    catchphrase: typeof char.catchphrase === 'object' ? char.catchphrase[language] : char.catchphrase,
    voice: {
      ...char.voice,
      description: typeof char.voice?.description === 'object'
        ? char.voice.description[language]
        : char.voice?.description
    }
  };
}
```

---

## 3. Backend - Modificaciones en `src/services/catalogService.js`

### 3.1 Considerar traducción de datos de Supabase
Opciones:
- **Opción A (Simple)**: Mantener los datos en el idioma original y dejar que Gemini traduzca las respuestas
- **Opción B (Completa)**: Agregar columnas traducidas en la base de datos
  - `name_en`, `description_en`, `category_en` en tabla `products`
  - `title_en`, `description_en` en tabla `events`
  - `name_en`, `address_en`, `city_en` en tabla `stores`

### 3.2 Si se elige Opción A (Recomendada inicialmente)
- No hacer cambios en `catalogService.js`
- Gemini se encargará de responder en el idioma del sistema de instrucciones
- Más simple y rápido de implementar

### 3.3 Si se elige Opción B (Más completa)
- Modificar las queries para seleccionar columnas según idioma
- Ejemplo para `searchProducts`:

```javascript
async function searchProducts(query, language = 'es') {
  const client = getSupabaseClient();
  if (!client) return [];

  const nameCol = language === 'en' ? 'name_en' : 'name';
  const descCol = language === 'en' ? 'description_en' : 'description';
  const catCol = language === 'en' ? 'category_en' : 'category';

  const { data, error } = await client
    .from('products')
    .select(`id, ${nameCol} as name, ${descCol} as description, ${catCol} as category, base_price`)
    .or(`${nameCol}.ilike.%${query}%,${descCol}.ilike.%${query}%,${catCol}.ilike.%${query}%`)
    .limit(5);

  if (error) {
    console.error('Error buscando productos:', error);
    return [];
  }

  return data;
}
```

---

## 4. Base de Datos - Supabase (Si se elige Opción B)

### 4.1 Migración de tabla `products`
```sql
ALTER TABLE products
ADD COLUMN name_en TEXT,
ADD COLUMN description_en TEXT,
ADD COLUMN category_en TEXT;

-- Actualizar con traducciones
UPDATE products SET
  name_en = 'Cool Cat IPA',
  description_en = 'Bold and hoppy craft beer...',
  category_en = 'IPA'
WHERE name = 'Cool Cat IPA';

-- Repetir para todos los productos
```

### 4.2 Migración de tabla `events`
```sql
ALTER TABLE events
ADD COLUMN title_en TEXT,
ADD COLUMN description_en TEXT;
```

### 4.3 Migración de tabla `stores`
```sql
ALTER TABLE stores
ADD COLUMN name_en TEXT,
ADD COLUMN city_en TEXT,
ADD COLUMN address_en TEXT;
```

---

## 5. Frontend - Recomendaciones

### 5.1 Selector de idioma
- Agregar un componente selector de idioma (dropdown o toggle)
- Guardar preferencia en localStorage
- Usar librería i18n (ej: `react-i18next`, `vue-i18n`, etc.)

### 5.2 Enviar idioma en las peticiones
**Para chat de texto:**
```javascript
const response = await fetch('/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    characterId: 'gatoCool',
    message: userMessage,
    history: chatHistory,
    language: selectedLanguage, // 'es' o 'en'
    returnAudio: false
  })
});
```

**Para WebSocket (voz):**
```javascript
ws.send(JSON.stringify({
  type: 'start',
  characterId: 'gatoCool',
  history: [],
  language: selectedLanguage, // 'es' o 'en'
  languageCode: selectedLanguage === 'en' ? 'en-US' : 'es-ES',
  sampleRateHertz: 16000
}));
```

### 5.3 Traducir la UI del frontend
- Mensajes de error
- Etiquetas de botones
- Placeholder de inputs
- Nombres de personajes si aplica

---

## 6. Testing

### 6.1 Pruebas de Backend
- [ ] Probar endpoint `/chat` con `language: 'es'`
- [ ] Probar endpoint `/chat` con `language: 'en'`
- [ ] Verificar que las herramientas (tools) se ejecuten correctamente en ambos idiomas
- [ ] Probar WebSocket con transcripción en español
- [ ] Probar WebSocket con transcripción en inglés
- [ ] Verificar que ElevenLabs sintetice correctamente en ambos idiomas

### 6.2 Pruebas de Integración
- [ ] Cambiar de idioma en medio de una conversación
- [ ] Verificar que el historial se mantenga consistente
- [ ] Probar con diferentes personajes
- [ ] Probar herramientas: búsqueda de productos, eventos, tiendas en ambos idiomas

### 6.3 Pruebas de Voz
- [ ] Hablar en español y verificar transcripción correcta
- [ ] Hablar en inglés y verificar transcripción correcta
- [ ] Verificar que la respuesta de audio esté en el idioma correcto

---

## 7. Orden de Implementación Recomendado

### Fase 1: Backend Core (Prioridad Alta)
1. Agregar soporte de idioma en `src/characters.js` (traducir personajes)
2. Modificar `buildSystemInstruction()` para aceptar parámetro `language`
3. Crear función `getTools(language)` con herramientas traducidas
4. Actualizar `generateCharacterReply()` para aceptar `language`
5. Modificar endpoint `/chat` para recibir y procesar `language`

### Fase 2: Voz (Prioridad Media)
6. Actualizar WebSocket handler para recibir y usar `language`
7. Configurar transcripción con idioma dinámico (es-ES / en-US)

### Fase 3: Datos (Prioridad Baja - Opcional)
8. Decidir entre Opción A (dejar que Gemini traduzca) u Opción B (traducir BD)
9. Si se elige Opción B, crear migraciones de Supabase
10. Actualizar `catalogService.js` para consultar datos traducidos

### Fase 4: Frontend
11. Agregar selector de idioma en UI
12. Implementar i18n para textos de la interfaz
13. Enviar parámetro `language` en todas las peticiones

### Fase 5: Testing y Ajustes
14. Ejecutar suite de pruebas
15. Ajustar prompt/tone según comportamiento observado
16. Optimizar traducciones basándose en feedback

---

## 8. Consideraciones Técnicas

### 8.1 Rendimiento
- La traducción de herramientas en tiempo de ejecución es eficiente
- No hay impacto significativo en latencia
- Considerar cachear las instrucciones del sistema si se vuelven muy largas

### 8.2 ElevenLabs
- Las voces configuradas pueden hablar en inglés y español
- La calidad puede variar según el idioma
- Considerar tener voces específicas para inglés si la calidad no es óptima

### 8.3 Google Speech-to-Text
- Soporta múltiples idiomas (es-ES, en-US, etc.)
- La transcripción es altamente precisa en ambos idiomas
- El `languageCode` debe coincidir con el idioma esperado

### 8.4 Gemini
- Puede responder fluentemente en español e inglés
- Las instrucciones del sistema deben estar en el idioma objetivo
- Los tools pueden describirse en cualquier idioma, pero es mejor mantener consistencia

---

## 9. Variables de Entorno Adicionales (Opcional)

```env
# En .env
DEFAULT_LANGUAGE=es
SUPPORTED_LANGUAGES=es,en
```

---

## 10. Ejemplo de Respuesta Final

### Español
```
Usuario: "¿Qué cervezas tienes?"
Gato Cool: "¡Hey compadre! Tenemos un menú bien funky: Cool Cat IPA, La Catira Lager, Candela Stout... ¿Cuál te late?"
```

### Inglés
```
Usuario: "What beers do you have?"
Gato Cool: "Hey buddy! We've got a funky menu: Cool Cat IPA, La Catira Lager, Candela Stout... Which one catches your vibe?"
```

---

## Resumen de Archivos a Modificar

- ✅ `src/server.js` - Sistema de instrucciones, tools, endpoints, WebSocket
- ✅ `src/characters.js` - Agregar traducciones de personajes
- ✅ `src/services/catalogService.js` - (Opcional) Consultas multiidioma
- ✅ `package.json` - Posible agregar librería i18n si se necesita
- ✅ Frontend - Agregar selector de idioma y enviar parámetro
- ✅ Supabase - (Opcional) Migraciones para columnas traducidas

---

## Estimación de Esfuerzo

- **Backend Core**: 4-6 horas
- **Traducciones de personajes**: 2-3 horas
- **Voz multiidioma**: 2-3 horas
- **Base de datos (Opción B)**: 4-6 horas
- **Frontend**: 3-4 horas
- **Testing**: 3-4 horas

**Total estimado**: 18-26 horas

---

## Próximos Pasos

1. Revisar y aprobar este plan
2. Decidir si se implementará Opción A o B para los datos de Supabase
3. Iniciar con Fase 1 (Backend Core)
4. Coordinar con el equipo de frontend para la integración
