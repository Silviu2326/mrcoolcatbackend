/**
 * Test script for Store Category Rules logic.
 * Duplicates the logic from catalogService.js to verify correctness of rules.
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

// Test Cases
const cases = [
    { input: "Supermercado", expectedKey: "supermercados" },
    { input: "supermercados", expectedKey: "supermercados" },
    { input: "Bar", expectedKey: "cafes / bars" },
    { input: "Cafe Bar", expectedKey: "cafes / bars" },
    { input: "Pub irlandés", expectedKey: "pubs" },
    { input: "Restaurante italiano", expectedKey: "restaurants" },
    { input: "Tienda Desconocida", expectedKey: "default" },
    { input: null, expectedKey: "no-category" }
];

console.log("Running Category Logic Tests...");
let passed = 0;
cases.forEach(c => {
    const result = getStoreCategoryRules(c.input);
    console.log(`Input: "${c.input}" -> Actions: [${result.allowed_actions}] | Restriction: "${result.restrictions}"`);

    // Basic validation
    if (c.expectedKey === 'supermercados' && !result.restrictions.includes("PROHIBIDO")) console.error("FAIL: Supermarket should fail restriction check");
    else if (c.expectedKey === 'pubs' && !result.allowed_actions.includes("música")) console.error("FAIL: Pub should have music");
    else passed++;
});

console.log(`Tests Completed. ${passed}/${cases.length} passed basic checks.`);
