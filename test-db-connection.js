require('dotenv').config();
const { getFullMenu, searchEvents, searchStores } = require('./src/services/catalogService');

async function runTest() {
  console.log('--- TEST DE CONEXIÓN FINAL ---\n');

  try {
    // 1. Test Productos (Menú)
    console.log('🍺 Probando MENU (Cervezas)...');
    const menu = await getFullMenu();
    if (menu && menu.length > 0) {
      console.log(`✅ ÉXITO: ${menu.length} productos encontrados.`);
      console.log(`   Ejemplo: ${menu[0].name} - ${menu[0].price}€ (Cat: ${menu[0].type})`);
    } else {
      console.log('⚠️ Menu vacío (puede ser correcto si no hay datos).');
    }
  } catch (error) {
    console.error('❌ ERROR MENU:', error);
  }

  try {
    // 2. Test Eventos
    console.log('\n📅 Probando EVENTOS...');
    const events = await searchEvents();
    if (events && events.length > 0) {
      console.log(`✅ ÉXITO: ${events.length} eventos encontrados.`);
      console.log(`   Ejemplo: ${events[0].title} (${events[0].start_date})`);
    } else {
      console.log('⚠️ No hay eventos futuros (correcto si la tabla está vacía o fechas pasadas).');
    }
  } catch (error) {
    console.error('❌ ERROR EVENTOS:', error);
  }

  try {
    // 3. Test Tiendas
    console.log('\n🏪 Probando TIENDAS...');
    const stores = await searchStores();
    if (stores && stores.length > 0) {
      console.log(`✅ ÉXITO: ${stores.length} tiendas encontradas.`);
      console.log(`   Ejemplo: ${stores[0].name}`);
    } else {
      console.log('⚠️ No hay tiendas (puede ser correcto).');
    }
  } catch (error) {
    console.error('❌ ERROR TIENDAS:', error);
  }
}

runTest();
