const fs = require('fs');
const path = require('path');

const filePath = process.argv[2];

if (!filePath) {
  console.error('Por favor, indica la ruta a tu archivo JSON de credenciales.');
  console.error('Ejemplo: node generate_creds.js ./mi-service-account.json');
  process.exit(1);
}

try {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`El archivo no existe: ${absolutePath}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(absolutePath);
  const base64 = fileContent.toString('base64');

  console.log('\n=== COPIA EL SIGUIENTE VALOR EN RAILWAY ===');
  console.log('Nombre de la Variable: GOOGLE_CREDENTIALS_BASE64');
  console.log('Valor:');
  console.log(base64);
  console.log('===========================================\n');

} catch (error) {
  console.error('Error leyendo el archivo:', error.message);
}
