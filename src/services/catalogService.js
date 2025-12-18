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

/**
 * Busca tiendas o bares.
 * @param {string} location - Ciudad o zona.
 *
 * Nota: Los datos se retornan en su idioma original.
 * Gemini traducirá automáticamente al idioma solicitado.
 */
async function searchStores(location, userLocation) {
  const client = getSupabaseClient();
  if (!client) return [];

  let dbQuery = client.from('stores').select('*');

  let searchLocation = location;
  
  // Si no hay ubicación explícita pero tenemos la del usuario, intentamos usar su ciudad/región
  if (!searchLocation && userLocation && userLocation.address) {
      // Priorizamos la ciudad o la región
      searchLocation = userLocation.address.city || userLocation.address.region || userLocation.address.subregion;
      console.log(`[Catalog] Usando ubicación del usuario: ${searchLocation}`);
  }

  if (searchLocation) {
    dbQuery = dbQuery.or(`city.ilike.%${searchLocation}%,address.ilike.%${searchLocation}%,name.ilike.%${searchLocation}%`);
  }

  const { data, error } = await dbQuery.limit(5);

  if (error) {
    console.error('Error buscando tiendas:', error);
    return [];
  }
  
  // Si tenemos lat/long en la base de datos y en el usuario, podríamos calcular distancias aquí
  // Pero por ahora solo devolvemos los resultados filtrados por texto
  return data;
}

/**
 * Busca información sobre los personajes (usando el archivo local, no BD).
 * @param {string} name - Nombre del personaje.
 *
 * Nota: Esta función retorna datos de personajes en español por defecto.
 * Gemini traducirá automáticamente la información al idioma solicitado.
 * Los personajes tienen versiones multiidioma disponibles, pero en este
 * contexto de búsqueda se usa el idioma por defecto para simplificar.
 */
async function searchCharactersInfo(name) {
  // Importamos aquí para evitar ciclos si fuera necesario, o usamos el módulo ya cargado en server.
  // Como esto es un servicio, podemos requerir el archivo de personajes directamente.
  const { listCharacters } = require('../characters');

  // Retornamos personajes en idioma por defecto (español)
  // Gemini se encargará de traducir si el usuario está en otro idioma
  const allChars = listCharacters('es');

  if (!name) return allChars.map(c => ({ name: c.name, summary: c.summary }));

  const lowerName = name.toLowerCase();
  return allChars.filter(c =>
    c.name.toLowerCase().includes(lowerName) ||
    c.summary.toLowerCase().includes(lowerName)
  ).map(c => ({
    name: c.name,
    description: c.summary,
    style: c.tone,
    product: "Ver catálogo de cervezas para su producto asociado"
  }));
}

module.exports = {
  searchProducts,
  getFullMenu,
  searchEvents,
  searchStores,
  searchCharactersInfo
};
