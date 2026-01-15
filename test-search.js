require('dotenv').config();
const { searchStores } = require('./src/services/catalogService');

async function testSearch() {
    console.log('--- TEST BÚSQUEDA TIENDAS ---\n');

    const terms = ['barrio', 'el barrio', 'zona del barrio', ''];

    for (const term of terms) {
        console.log(`\n🔍 Buscando: "${term}"`);
        try {
            const stores = await searchStores(term);
            if (stores && stores.length > 0) {
                console.log(`✅ ${stores.length} encontrados.`);
                stores.forEach(s => console.log(`   - ${s.name} (${s.city}, ${s.address})`));
            } else {
                console.log('⚠️ 0 resultados.');
            }
        } catch (error) {
            console.error('❌ Error:', error.message);
        }
    }
}

testSearch();
