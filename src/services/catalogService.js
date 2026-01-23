const { createClient } = require('@supabase/supabase-js');

/**
 * ESTRATEGIA DE TRADUCCIÓN MULTIIDIOMA
 * =====================================
 * Este servicio retorna datos tal como están almacenados en Supabase (generalmente en español).
 * NO se realizan traducciones en este nivel.
 *
 * El modelo Gemini se encarga automáticamente de:
 * 1. Recibir los datos en su idioma original
 * 2. Traducir y presentar la información en el idioma solicitado por el usuario
 * 3. Mantener coherencia con las instrucciones del sistema en ese idioma
 *
 * Ventajas de este enfoque:
 * - Más simple: no requiere duplicar datos en la BD
 * - Más flexible: Gemini puede adaptar las traducciones al contexto
 * - Menos mantenimiento: un solo conjunto de datos
 *
 * Si en el futuro se requiere mayor control sobre las traducciones,
 * se puede migrar a la Opción B (columnas traducidas en Supabase).
 */

// Inicializar cliente solo si las variables existen
let supabase = null;

function getSupabaseClient() {
  if (supabase) return supabase;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️ Advertencia: Faltan credenciales de Supabase (SUPABASE_URL o KEY). La búsqueda de productos no funcionará.');
    return null;
  }

  supabase = createClient(supabaseUrl, supabaseKey);
  return supabase;
}

/**
 * Busca productos en la base de datos por nombre o descripción.
 * @param {string} query - Término de búsqueda (ej: "cerveza rubia", "Candela").
 * @returns {Promise<Array>} - Lista de productos encontrados.
 *
 * Nota: Los datos se retornan en su idioma original (generalmente español).
 * Gemini traducirá automáticamente al idioma solicitado por el usuario.
 */
async function searchProducts(query) {
  const client = getSupabaseClient();
  if (!client) return [];

  // Búsqueda simple usando ILIKE en nombre o descripción
  // Para producción, se recomienda usar Full Text Search de Postgres
  const { data, error } = await client
    .from('products')
    .select('*')
    .or(`name.ilike.%${query}%,description.ilike.%${query}%,category.ilike.%${query}%`) // type -> category
    .limit(5);

  if (error) {
    console.error('Error buscando productos en Supabase:', error);
    return [];
  }

  return data;
}

/**
 * Obtiene el menú completo (útil si el usuario pide "qué tienes").
 *
 * Nota: Los datos se retornan en su idioma original.
 * Gemini traducirá automáticamente al idioma solicitado.
 */
async function getFullMenu() {
  const client = getSupabaseClient();
  if (!client) return [];

  // Mapeamos las columnas reales de la BD a lo que espera la app
  const { data, error } = await client
    .from('products')
    .select('name, category, base_price, description') // Usamos nombres reales
    .order('name');

  if (error) {
    console.error('Error obteniendo menú:', error);
    return [];
  }

  // Transformamos para mantener compatibilidad si es necesario
  return data.map(p => ({
    name: p.name,
    type: p.category,          // Alias para compatibilidad
    price: p.base_price,       // Alias para compatibilidad
    description: p.description
  }));
}

/**
 * Busca eventos próximos.
 * @param {string} query - Término de búsqueda opcional.
 *
 * Nota: Los datos se retornan en su idioma original.
 * Gemini traducirá automáticamente al idioma solicitado.
 */
async function searchEvents(query) {
  const client = getSupabaseClient();
  if (!client) return [];

  let dbQuery = client
    .from('events')
    .select('*')
    .gte('start_date', new Date().toISOString()) // Usamos start_date
    .order('start_date', { ascending: true });

  if (query) {
    dbQuery = dbQuery.or(`title.ilike.%${query}%,description.ilike.%${query}%`);
  }

  const { data, error } = await dbQuery.limit(5);

  if (error) {
    console.error('Error buscando eventos:', error);
    return [];
  }
  return data;
}

// --- HELPER FUNCTIONS FOR GEOLOCATION ---

/**
 * Extrae coordenadas de múltiples formatos de URLs de Google Maps.
 * Formatos soportados:
 * 1. /@38.3420936,-0.495882,17z
 * 2. ?q=38.3420936,-0.495882
 * 3. !3d38.3420936!4d-0.4933071 (formato de data)
 * 4. place/.../@lat,lng
 * 5. /maps?ll=lat,lng
 */
function extractCoordinatesFromUrl(url) {
  if (!url) return null;

  try {
    // Formato 1: .../@38.3420936,-0.495882,17z...
    const atMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (atMatch) {
      return {
        latitude: parseFloat(atMatch[1]),
        longitude: parseFloat(atMatch[2])
      };
    }

    // Formato 2: ...?q=38.3420936,-0.495882...
    const qMatch = url.match(/q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (qMatch) {
      return {
        latitude: parseFloat(qMatch[1]),
        longitude: parseFloat(qMatch[2])
      };
    }

    // Formato 3: !3d38.3420936!4d-0.4933071 (coordenadas en data de Google Maps)
    const dataMatch = url.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
    if (dataMatch) {
      return {
        latitude: parseFloat(dataMatch[1]),
        longitude: parseFloat(dataMatch[2])
      };
    }

    // Formato 4: ll=lat,lng
    const llMatch = url.match(/ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (llMatch) {
      return {
        latitude: parseFloat(llMatch[1]),
        longitude: parseFloat(llMatch[2])
      };
    }

    // Formato 5: center=lat,lng
    const centerMatch = url.match(/center=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (centerMatch) {
      return {
        latitude: parseFloat(centerMatch[1]),
        longitude: parseFloat(centerMatch[2])
      };
    }

  } catch (e) {
    console.error(`Error parsing coordinates from URL: ${url}`, e);
  }

  return null;
}

/**
 * Geocodifica un nombre de lugar/barrio a coordenadas usando Google Geocoding API.
 * Esto permite que el usuario pregunte por "bares en el barrio San Blas" y la IA
 * pueda identificar la zona.
 *
 * @param {string} placeName - Nombre del lugar, barrio o zona (ej: "San Blas, Alicante")
 * @returns {Promise<{latitude: number, longitude: number, formatted_address: string}|null>}
 */
async function geocodePlace(placeName) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_GEOCODING_API_KEY;

  if (!apiKey) {
    console.warn('[Geocode] ⚠️ No hay GOOGLE_MAPS_API_KEY configurada. Geocodificación no disponible.');
    return null;
  }

  try {
    const encodedPlace = encodeURIComponent(placeName);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedPlace}&key=${apiKey}&language=es`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const result = data.results[0];
      console.log(`[Geocode] ✅ "${placeName}" -> ${result.formatted_address}`);
      return {
        latitude: result.geometry.location.lat,
        longitude: result.geometry.location.lng,
        formatted_address: result.formatted_address,
        place_types: result.types // ej: ["neighborhood", "political"]
      };
    }

    console.log(`[Geocode] ❌ No se encontró: "${placeName}"`);
    return null;
  } catch (error) {
    console.error('[Geocode] Error:', error);
    return null;
  }
}

/**
 * Detecta si un texto contiene referencias a zonas/barrios conocidos.
 * Útil para mejorar búsquedas cuando el usuario menciona lugares específicos.
 */
const KNOWN_ZONES = {
  // Alicante
  'centro': { city: 'Alicante', area: 'Centro' },
  'playa san juan': { city: 'Alicante', area: 'Playa San Juan' },
  'san juan': { city: 'Alicante', area: 'San Juan' },
  'benalua': { city: 'Alicante', area: 'Benalúa' },
  'benalúa': { city: 'Alicante', area: 'Benalúa' },
  'carolinas': { city: 'Alicante', area: 'Carolinas' },
  'san blas': { city: 'Alicante', area: 'San Blas' },
  'florida': { city: 'Alicante', area: 'Florida' },
  'alipark': { city: 'Alicante', area: 'Alipark' },
  'golf': { city: 'Alicante', area: 'Golf' },
  'cabo huertas': { city: 'Alicante', area: 'Cabo de las Huertas' },
  'albufereta': { city: 'Alicante', area: 'Albufereta' },
  'san gabriel': { city: 'Alicante', area: 'San Gabriel' },
  'babel': { city: 'Alicante', area: 'Babel' },
  'pla': { city: 'Alicante', area: 'Pla del Bon Repòs' },
  'explanada': { city: 'Alicante', area: 'Explanada' },
  'puerto': { city: 'Alicante', area: 'Puerto' },
  'casco antiguo': { city: 'Alicante', area: 'Casco Antiguo' },
  'el barrio': { city: 'Alicante', area: 'Casco Antiguo' },
  'plaza san cristobal': { city: 'Alicante', area: 'Plaza San Cristóbal, Casco Antiguo' },
  'plaza san cristóbal': { city: 'Alicante', area: 'Plaza San Cristóbal, Casco Antiguo' },
  'san cristobal': { city: 'Alicante', area: 'Plaza San Cristóbal, Casco Antiguo' },
  'san cristóbal': { city: 'Alicante', area: 'Plaza San Cristóbal, Casco Antiguo' },
  // Añade más zonas según tu área de operación
};

function detectZone(text) {
  if (!text) return null;
  const lowerText = text.toLowerCase();

  // Ordenar las claves por longitud (de mayor a menor) para que coincidencias más específicas tengan prioridad
  // Esto evita que "plaza san cristobal" coincida con "pla" antes que con "plaza san cristobal"
  const sortedKeys = Object.keys(KNOWN_ZONES).sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    if (lowerText.includes(key)) {
      return KNOWN_ZONES[key];
    }
  }
  return null;
}

/**
 * Normaliza texto eliminando acentos para búsquedas más flexibles.
 */
function normalizeText(text) {
  if (!text) return '';
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Busca tiendas o bares con inteligencia de ubicación mejorada.
 *
 * CAPACIDADES:
 * 1. Búsqueda geoespacial por coordenadas del usuario
 * 2. Búsqueda directa por COINCIDENCIA DE ZONA/BARRIO (Prioridad 1)
 * 3. Geocodificación de nombres de barrios/zonas (ej: "San Blas", "Centro")
 * 4. Detección de zonas conocidas en el texto
 *
 * @param {string} location - Ciudad, zona o barrio (ej: "San Blas", "cerca del puerto").
 * @param {object} userLocation - { latitude, longitude } del usuario.
 */
async function searchStores(location, userLocation) {
  const client = getSupabaseClient();
  if (!client) return [];

  // --- ESTRATEGIA 1: Búsqueda geoespacial pura (usuario tiene coords, no menciona zona) ---
  if (!location && userLocation && userLocation.latitude && userLocation.longitude) {
    console.log('[Catalog] 📍 Búsqueda geoespacial iniciada (coords del usuario).');
    return await searchStoresByCoords(client, userLocation.latitude, userLocation.longitude);
  }

  // --- ESTRATEGIA 2: Usuario menciona una zona/barrio ---
  if (location) {
    console.log(`[Catalog] 🔍 Analizando ubicación: "${location}"`);

    // 2a. INTENTO DIRECTO EN BD (Nuevo): Buscar si coincide con neighborhood, district o address
    // Esto es ideal para "Plaza San Cristóbal" si ya está en la columna neighborhood.
    const directMatches = await searchStoresByText(client, location);
    if (directMatches.length > 0) {
      console.log(`[Catalog] ✅ Encontradas ${directMatches.length} tiendas por coincidencia directa de texto/barrio.`);
      return directMatches;
    }

    // 2b. Detectar zonas conocidas localmente (fallback rápido)
    const knownZone = detectZone(location);
    if (knownZone) {
      console.log(`[Catalog] ✅ Zona conocida detectada: ${knownZone.area}, ${knownZone.city}`);

      // Intentar geocodificar la zona conocida para búsqueda por cercanía
      const geoResult = await geocodePlace(`${knownZone.area}, ${knownZone.city}, España`);
      if (geoResult) {
        console.log(`[Catalog] 📍 Geocodificada: ${geoResult.formatted_address}`);
        const stores = await searchStoresByCoords(client, geoResult.latitude, geoResult.longitude, 10);
        if (stores.length > 0) {
          return stores.map(s => ({
            ...s,
            zone_info: `Zona: ${knownZone.area}`,
            geocoded_address: geoResult.formatted_address
          }));
        }
      }
    }

    // 2c. Si no es zona conocida, intentar geocodificar el texto libre
    const geoResult = await geocodePlace(`${location}, España`);
    if (geoResult) {
      console.log(`[Catalog] 📍 Geocodificado "${location}": ${geoResult.formatted_address}`);
      const stores = await searchStoresByCoords(client, geoResult.latitude, geoResult.longitude, 15);
      if (stores.length > 0) {
        return stores.map(s => ({
          ...s,
          geocoded_address: geoResult.formatted_address
        }));
      }
    }

    // 2d. Fallback final: búsqueda por texto (reintento por si acaso se nos pasó algo)
    console.log(`[Catalog] 📝 Búsqueda por texto (fallback): "${location}"`);
    return await searchStoresByText(client, location);
  }

  // --- ESTRATEGIA 3: Sin ubicación - devolver todas ordenadas ---
  console.log('[Catalog] ⚠️ Sin ubicación, devolviendo tiendas generales.');
  const { data, error } = await client.from('stores').select('*').limit(5);

  if (error) {
    console.error('Error buscando tiendas:', error);
    return [];
  }

  return data.map(store => ({
    ...store,
    ...getStoreCategoryRules(store.category)
  }));
}

/**
 * Busca tiendas por cercanía a coordenadas específicas.
 */
async function searchStoresByCoords(client, lat, lng, maxDistanceKm = 100) {
  // Traemos todas para filtrar en memoria (si no son muchas)
  // OPTIMIZACIÓN FUTURE: Usar PostGIS o RPC 'calculate_distance' si la BD crece.
  const { data, error } = await client.from('stores').select('*');

  if (error) {
    console.error('Error fetching stores for geo search:', error);
    return [];
  }

  const storesWithDist = data.map(store => {
    let coords = null;

    // Prioridad 1: Columnas nativas de lat/lng
    if (store.latitude && store.longitude) {
      coords = { latitude: store.latitude, longitude: store.longitude };
    }
    // Prioridad 2: Extraer de URL (legacy)
    else if (store.google_maps_url) {
      coords = extractCoordinatesFromUrl(store.google_maps_url);
    }

    if (coords) {
      const dist = calculateDistance(lat, lng, coords.latitude, coords.longitude);
      return { ...store, _distance: dist };
    }
    return { ...store, _distance: 999999 };
  });

  const closest = storesWithDist
    .sort((a, b) => a._distance - b._distance)
    .filter(s => s._distance < maxDistanceKm)
    .slice(0, 5);

  console.log(`[Catalog] 📍 Encontradas ${closest.length} tiendas cercanas (max ${maxDistanceKm}km).`);

  return closest.map(s => ({
    ...s,
    distance_info: `A ${s._distance.toFixed(2)} km`,
    ...getStoreCategoryRules(s.category)
  }));
}

/**
 * Busca tiendas por coincidencia de texto, incluyendo NUEVOS CAMPOS de ubicación.
 * Busca tanto con el texto original como sin acentos para mayor flexibilidad.
 */
async function searchStoresByText(client, searchText) {
  console.log(`[Catalog] 🔎 searchStoresByText llamada con: "${searchText}"`);

  // Escapar caracteres especiales para PostgREST (espacios, comas, etc.)
  // PostgREST requiere que los valores con caracteres especiales estén entre comillas dobles
  const escapeForPostgrest = (text) => {
    // Reemplazar comillas dobles existentes por comillas escapadas
    const escaped = text.replace(/"/g, '\\"');
    // Envolver en comillas dobles para que PostgREST lo interprete correctamente
    return `"*${escaped}*"`;
  };

  const normalizedText = normalizeText(searchText);
  console.log(`[Catalog] 🔎 Texto normalizado (sin acentos): "${normalizedText}"`);

  const escapedSearch = escapeForPostgrest(searchText);
  const escapedNormalized = escapeForPostgrest(normalizedText);

  // Construir query con texto escapado
  let orConditions = `city.ilike.${escapedSearch},address.ilike.${escapedSearch},name.ilike.${escapedSearch},neighborhood.ilike.${escapedSearch},district.ilike.${escapedSearch},province.ilike.${escapedSearch}`;

  // Si el texto normalizado es diferente, añadir también búsqueda sin acentos
  if (normalizedText !== searchText) {
    orConditions += `,city.ilike.${escapedNormalized},address.ilike.${escapedNormalized},name.ilike.${escapedNormalized},neighborhood.ilike.${escapedNormalized},district.ilike.${escapedNormalized},province.ilike.${escapedNormalized}`;
    console.log(`[Catalog] 🔎 Búsqueda dual activada (con y sin acentos)`);
  }

  console.log(`[Catalog] 🔎 Ejecutando query...`);

  const { data, error } = await client
    .from('stores')
    .select('*')
    .or(orConditions)
    .limit(5);

  if (error) {
    console.error('[Catalog] ❌ Error buscando tiendas por texto:', error);
    return [];
  }

  console.log(`[Catalog] 🔎 Resultados encontrados: ${data ? data.length : 0}`);
  if (data && data.length > 0) {
    console.log(`[Catalog] 🔎 Tiendas encontradas:`, data.map(s => ({ name: s.name, address: s.address, neighborhood: s.neighborhood })));
  }

  return data.map(store => ({
    ...store,
    ...getStoreCategoryRules(store.category)
  }));
}

/**
 * Define las reglas y acciones permitidas según la categoría del local.
 */
function getStoreCategoryRules(category) {
  if (!category) return { allowed_actions: [], restrictions: "Sin información de categoría" };

  const lowerCat = category.toLowerCase().trim();

  // Normalización básica
  let normalized = lowerCat;
  if (lowerCat === 'bar') normalized = 'cafes / bars';

  const rules = {
    'pubs': {
      allowed_actions: ["socializar", "beber", "música", "fiesta"],
      restrictions: "Solo para mayores de 18."
    },
    'cafes / bars': {
      allowed_actions: ["café", "beber", "tapas", "conversar"],
      restrictions: "Ambiente más relajado."
    },
    'restaurants': {
      allowed_actions: ["comer", "cenar", "beber", "celebraciones"],
      restrictions: "Se recomienda reservar."
    },
    'supermercados': {
      allowed_actions: ["comprar para llevar", "abastecimiento"],
      restrictions: "ESTRICTAMENTE PROHIBIDO consumir en el local. Solo venta."
    }
  };

  // Buscamos coincidencia parcial o directa
  if (normalized.includes('supermercado')) return rules['supermercados'];
  if (normalized.includes('restaurant')) return rules['restaurants'];
  if (normalized.includes('pub')) return rules['pubs'];
  if (normalized.includes('cafe') || normalized.includes('bar')) return rules['cafes / bars'];

  // Default
  return {
    allowed_actions: ["visitar"],
    restrictions: "Consultar en el local."
  };
}

/**
 * Busca información sobre los personajes de Cool Cat.
 * @param {string} name - Nombre del personaje a buscar.
 * @param {string} language - Idioma (es/en).
 * @returns {Array} - Información del personaje encontrado.
 */
function searchCharactersInfo(name, language = 'es') {
  // Importamos los personajes aquí para evitar dependencia circular
  const { listCharacters, getCharacterById } = require('../characters');

  if (!name) {
    // Si no hay nombre, devolver lista de todos los personajes
    return listCharacters(language);
  }

  const normalizedQuery = name.toLowerCase().trim();

  // Mapeo de nombres y aliases para búsqueda flexible
  const characterAliases = {
    'gato': 'gatoCool',
    'gato cool': 'gatoCool',
    'el gato': 'gatoCool',
    'cool cat': 'gatoCool',
    'buck': 'buck',
    'perro': 'buck',
    'catira': 'catira',
    'la catira': 'catira',
    'rubia': 'catira',
    'morena': 'morena',
    'la morena': 'morena',
    'sifrina': 'sifrina',
    'la sifrina': 'sifrina',
    'candela': 'candela',
    'guajira': 'guajira',
    'la guajira': 'guajira',
    'medusa': 'medusa',
    'medusa 0.0': 'medusa',
    'medusa 0,0': 'medusa'
  };

  // Buscar coincidencia exacta primero
  let characterId = characterAliases[normalizedQuery];

  // Si no hay coincidencia exacta, buscar por inclusión
  if (!characterId) {
    for (const [alias, id] of Object.entries(characterAliases)) {
      if (normalizedQuery.includes(alias) || alias.includes(normalizedQuery)) {
        characterId = id;
        break;
      }
    }
  }

  if (characterId) {
    const character = getCharacterById(characterId, language);
    if (character) {
      return [character];
    }
  }

  // Buscar en todos los personajes por coincidencia parcial
  const allCharacters = listCharacters(language);
  const matches = allCharacters.filter(char =>
    char.name.toLowerCase().includes(normalizedQuery) ||
    char.summary.toLowerCase().includes(normalizedQuery)
  );

  return matches.length > 0 ? matches : allCharacters;
}

module.exports = {
  searchProducts,
  getFullMenu,
  searchEvents,
  searchStores,
  searchCharactersInfo,
  geocodePlace,
  extractCoordinatesFromUrl,
  detectZone,
  KNOWN_ZONES
};
