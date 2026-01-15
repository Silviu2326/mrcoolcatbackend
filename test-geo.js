require('dotenv').config();
const { searchStores } = require('./src/services/catalogService');

async function testGeo() {
    console.log('--- TEST GEO BÚSQUEDA ---\n');

    // Coordenadas simuladas de Alicante centro
    const userLocation = {
        latitude: 38.345996,
        longitude: -0.490685,
        address: { city: 'Alicante' }
    };

    console.log(`📍 Usuario en: ${userLocation.latitude}, ${userLocation.longitude}`);
    console.log(`❓ Buscando con location=null (simulando "barrio", "cerca")...\n`);

    try {
        const stores = await searchStores(null, userLocation);

        if (stores && stores.length > 0) {
            console.log(`✅ ${stores.length} tiendas encontradas.`);
            stores.forEach(s => {
                console.log(`   - ${s.name}`);
                console.log(`     Distancia: ${s.distance_info}`);
                console.log(`     URL: ${s.google_maps_url}`);
                console.log('-----------------------------------');
            });
        } else {
            console.log('⚠️ 0 resultados.');
        }
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

testGeo();
