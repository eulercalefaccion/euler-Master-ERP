/**
 * Genera la clave privada (RSA 2048) y el CSR para el certificado de Web Services de ARCA.
 * Uso:  node scripts/arca_generar_csr.cjs
 * Salida: data/arca/  (carpeta ignorada por git)
 *   - euler_erp.key  -> CLAVE PRIVADA. NO compartir con nadie. Se sube a Firebase Secret Manager.
 *   - euler_erp.csr  -> Pedido de certificado. Es lo que se pega/sube en ARCA.
 */
const path = require('path');
const fs = require('fs');
const forge = require(path.join(__dirname, '..', 'functions', 'node_modules', 'node-forge'));

const CUIT = '20316275622';
const RAZON_SOCIAL = 'AYALA NICOLAS FEDERICO';
const ALIAS = 'eulererp';

const outDir = path.join(__dirname, '..', 'data', 'arca');
fs.mkdirSync(outDir, { recursive: true });
const keyPath = path.join(outDir, 'euler_erp.key');
const csrPath = path.join(outDir, 'euler_erp.csr');

if (fs.existsSync(keyPath)) {
  console.log('Ya existe una clave privada en', keyPath, '- no se sobreescribe.');
  process.exit(0);
}

console.log('Generando clave RSA 2048...');
const keys = forge.pki.rsa.generateKeyPair(2048);
const csr = forge.pki.createCertificationRequest();
csr.publicKey = keys.publicKey;
csr.setSubject([
  { name: 'countryName', value: 'AR' },
  { name: 'organizationName', value: RAZON_SOCIAL },
  { name: 'commonName', value: ALIAS },
  { type: '2.5.4.5', value: `CUIT ${CUIT}` }, // serialNumber
]);
csr.sign(keys.privateKey, forge.md.sha256.create());

fs.writeFileSync(keyPath, forge.pki.privateKeyToPem(keys.privateKey));
fs.writeFileSync(csrPath, forge.pki.certificationRequestToPem(csr));
console.log('OK');
console.log('  Clave privada:', keyPath);
console.log('  CSR          :', csrPath);
