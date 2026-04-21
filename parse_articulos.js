import fs from 'fs';

const text = fs.readFileSync('catalogo_articulos_gesdatta.txt', 'utf8');
const lines = text.split('\n');

const results = [];
let startParsing = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  
  // Identify the header line
  if (line.startsWith('Código\tNombre')) {
    startParsing = true;
    continue;
  }
  
  if (!startParsing || line.length === 0 || line === 'Triangular' || line === 'Buscar...') continue;
  
  const columns = line.split('\t');
  if (columns.length < 5) continue; // Skip malformed lines
  
  const code = columns[0].trim();
  const name = columns[1].trim();
  const cuentaC = columns[3] ? columns[3].trim() : '';
  const lastPriceRaw = columns[6] ? columns[6].trim() : '0';
  
  const parsePrice = (str) => {
    let clean = str.replace('$', '').trim();
    clean = clean.replace(/\./g, '');   // remove thousands separator
    clean = clean.replace(',', '.');    // replace decimal comma with dot
    const val = parseFloat(clean);
    return isNaN(val) ? 0 : val;
  };

  const rawCost = parsePrice(lastPriceRaw);
  
  // Asignar categorías lógicas
  let category = 'Materiales';
  const nameLower = name.toLowerCase();
  if (cuentaC.toLowerCase().includes('servicio') || nameLower.includes('mano de obra')) {
    category = 'Servicios';
  } else if (nameLower.includes('caldera') || nameLower.includes('bomba') || nameLower.includes('climatizador') || nameLower.includes('aire acondicionado')) {
    category = 'Equipos';
  }

  results.push({
    codigo: code,
    name: name,
    category: category,
    costoImportadoBase: rawCost, // Guardamos el valor crudo en pesos/dolares
    quantity: 5,
    minAlert: 2,
    unit: 'U',
    costUSD: 0, // Listo para que luego se configure correcto
    profitCF: 30
  });
}

// Sort alphabetically by name
results.sort((a, b) => a.name.localeCompare(b.name));

fs.writeFileSync('catalogo_limpio.json', JSON.stringify(results, null, 2));
console.log(`¡Listo! Se procesaron y ordenaron ${results.length} artículos.`);
