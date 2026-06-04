/**
 * Script para generar la lista de precios inicial de Euler Master ERP.
 * 
 * 1. Parsea catalogo_articulos_gesdatta.txt (filtra solo productos/servicios reales)
 * 2. Cruza con los precios USD del Excel de Euler (hardcodeados desde las capturas)
 * 3. Genera un archivo JS importable con todos los datos listos para Firestore
 * 
 * Ejecutar: node scripts/generarListaPrecios.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ═══════════════════════════════════════════════════════════════════
// DATOS DEL EXCEL DE EULER (extraídos de las capturas del usuario)
// ═══════════════════════════════════════════════════════════════════
const excelData = [
  // CALDERAS
  { nombre: "ECO NOVA 24", proveedor: "TRIANGULAR", categoria: "Calderas", costoUSD: 850.00, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "ATRON", proveedor: "DEMIR DOKUM", categoria: "Calderas", costoUSD: 760.00, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "DIGITAL TOP SA26", proveedor: "CALDAIA", categoria: "Calderas", costoUSD: 1134.00, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "FORTUNA F24", proveedor: "LATYN", categoria: "Calderas", costoUSD: 907.54, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "LUNA 3 CONFORT", proveedor: "TRIANGULAR", categoria: "Calderas", costoUSD: 1638.00, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "ECO NOVA 31", proveedor: "TRIANGULAR", categoria: "Calderas", costoUSD: 1000.00, markup: 1.4, tipo: "material", unidad: "unidad" },
  
  // RADIADORES
  { nombre: "ELEMENTO REHAU 500MM", proveedor: "REHAU", categoria: "Radiadores", costoUSD: 8.50, markup: 1.55, tipo: "material", unidad: "unidad" },
  { nombre: "ELEMENTO BEST 500MM", proveedor: "TRIANGULAR", categoria: "Radiadores", costoUSD: 14.00, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "ELEMENTO BEST 350MM", proveedor: "TRIANGULAR", categoria: "Radiadores", costoUSD: 15.50, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "ELEMENTO BEST 600MM", proveedor: "TRIANGULAR", categoria: "Radiadores", costoUSD: 16.00, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "ELEMENTO PLUS 500MM", proveedor: "TRIANGULAR", categoria: "Radiadores", costoUSD: 15.50, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "ELEMENTO PLUS 350MM", proveedor: "TRIANGULAR", categoria: "Radiadores", costoUSD: 15.50, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "ELEMENTO PLUS 700MM", proveedor: "TRIANGULAR", categoria: "Radiadores", costoUSD: 21.00, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "ELEMENTO PLUS 800MM", proveedor: "TRIANGULAR", categoria: "Radiadores", costoUSD: 22.50, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "ELEMENTO CLAN N500", proveedor: "CALDAIA", categoria: "Radiadores", costoUSD: 14.00, markup: 1.4, tipo: "material", unidad: "unidad" },
  
  // TOALLEROS
  { nombre: "TOALLERO CURVO NEREUS 80 BLANCO", proveedor: "PRONTO", categoria: "Toalleros", costoUSD: 40.02, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "TOALLERO CURVO NEREUS 80 NEGRO", proveedor: "PRONTO", categoria: "Toalleros", costoUSD: 47.97, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "KHANA 80 BLANCO", proveedor: "LATYN", categoria: "Toalleros", costoUSD: 77.40, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "KHANA 120 BLANCO", proveedor: "LATYN", categoria: "Toalleros", costoUSD: 132.12, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "KHANA 80 CROMADO", proveedor: "LATYN", categoria: "Toalleros", costoUSD: 151.79, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "KHANA 120 CROMADO", proveedor: "LATYN", categoria: "Toalleros", costoUSD: 211.27, markup: 1.4, tipo: "material", unidad: "unidad" },
  
  // COLECTORES / PISO RADIANTE
  { nombre: "COLECTOR PHKVD - D2", proveedor: "REHAU", categoria: "Colectores / Piso radiante", costoUSD: 149.30, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "COLECTOR PHKVD - D3", proveedor: "REHAU", categoria: "Colectores / Piso radiante", costoUSD: 176.95, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "COLECTOR PHKVD - D4", proveedor: "REHAU", categoria: "Colectores / Piso radiante", costoUSD: 205.99, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "COLECTOR PHKVD - D5", proveedor: "REHAU", categoria: "Colectores / Piso radiante", costoUSD: 237.09, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "COLECTOR PHKVD - D6", proveedor: "REHAU", categoria: "Colectores / Piso radiante", costoUSD: 264.74, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "COLECTOR PHKVD - D7", proveedor: "REHAU", categoria: "Colectores / Piso radiante", costoUSD: 295.85, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "COLECTOR PHKVD - D8", proveedor: "REHAU", categoria: "Colectores / Piso radiante", costoUSD: 322.80, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "ARMARIO DE 2 A 5 SALIDAS", proveedor: "REHAU", categoria: "Colectores / Piso radiante", costoUSD: 50.21, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "ARMARIO DE 6 A 9 SALIDAS", proveedor: "REHAU", categoria: "Colectores / Piso radiante", costoUSD: 57.05, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "TUBO PE-ER 20MM", proveedor: "REHAU", categoria: "Colectores / Piso radiante", costoUSD: 0.90, markup: 1.4, tipo: "material", unidad: "metro" },
  
  // AISLACIÓN
  { nombre: "EPS CON NOPAS (PRECIO POR M2)", proveedor: "HIDRAULIC", categoria: "Aislación", costoUSD: 10.37, markup: 1.4, tipo: "material", unidad: "m2" },
  
  // TERMOSTATOS / CABEZALES / CENTRALES
  { nombre: "MITRA 260S", proveedor: "TRIANGULAR", categoria: "Termostatos / Automatización", costoUSD: 49.20, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "DIGITAL HT500S SMART WIFI", proveedor: "TRIANGULAR", categoria: "Termostatos / Automatización", costoUSD: 152.40, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "ASUA HY02B05 (CUADRADO BLANCO)", proveedor: "URIARTE", categoria: "Termostatos / Automatización", costoUSD: 23.81, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "ASUA HY510WW (NEGRO CUADRADO WIFI)", proveedor: "URIARTE", categoria: "Termostatos / Automatización", costoUSD: 42.63, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "ASUA HY311WW (FONDO AZUL WIFI)", proveedor: "URIARTE", categoria: "Termostatos / Automatización", costoUSD: 54.09, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "ASUA HY316WW (NEGRO REDONDO WIFI)", proveedor: "URIARTE", categoria: "Termostatos / Automatización", costoUSD: 74.21, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "REGLETA DE AUTOMATIZACIÓN", proveedor: "REHAU", categoria: "Termostatos / Automatización", costoUSD: 61.61, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "CABEZAL TERMOSTATICO REHAU", proveedor: "REHAU", categoria: "Termostatos / Automatización", costoUSD: 23.42, markup: 1.4, tipo: "material", unidad: "unidad" },
  
  // VÁLVULAS / FLEXIBLES / ACCESORIOS
  { nombre: "VALVULA MICROMETRICA", proveedor: "PRONTO", categoria: "Válvulas / Accesorios", costoUSD: 6.21, markup: 1.7, tipo: "material", unidad: "unidad" },
  { nombre: "DETENTOR ESCUADRA", proveedor: "PRONTO", categoria: "Válvulas / Accesorios", costoUSD: 5.77, markup: 1.7, tipo: "material", unidad: "unidad" },
  { nombre: "NIPLE", proveedor: "SUMINOX", categoria: "Válvulas / Accesorios", costoUSD: 1.91, markup: 2.0, tipo: "material", unidad: "unidad" },
  { nombre: "ROSETA", proveedor: "SUMINOX", categoria: "Válvulas / Accesorios", costoUSD: 0.31, markup: 5.0, tipo: "material", unidad: "unidad" },
  { nombre: "KIT DE FLEXIBLES DOBLE SERVICIO", proveedor: "LATYN", categoria: "Válvulas / Accesorios", costoUSD: 51.05, markup: 1.4, tipo: "material", unidad: "unidad" },
  
  // SEPARADORES / INTERCAMBIADORES
  { nombre: "VALVULA SOLENOIDE", proveedor: "HIDRAULIC", categoria: "Separadores / Intercambiadores", costoUSD: 89.71, markup: 1.4, tipo: "material", unidad: "unidad" },
  { nombre: "SEPARADOR HIDRAULICO 3 SALIDAS", proveedor: "LOCAL", categoria: "Separadores / Intercambiadores", costoUSD: 425.53, markup: 1.5, tipo: "material", unidad: "unidad" },  // Costo ARS $600,000 / TC 1410
  
  // BOMBAS
  { nombre: "WILO STAR RS 25/6", proveedor: "TRIANGULAR", categoria: "Bombas", costoUSD: 204.00, markup: 1.4, tipo: "material", unidad: "unidad" },
  
  // MANO DE OBRA
  { nombre: "MANO DE OBRA INSTALACIÓN RADIADOR", proveedor: "EULER", categoria: "Mano de obra", costoUSD: null, markup: null, tipo: "mano_de_obra", unidad: "unidad", precioVentaUSD: 35.00 },
  { nombre: "MANO DE OBRA PISO / INST. CALDERA", proveedor: "EULER", categoria: "Mano de obra", costoUSD: null, markup: null, tipo: "mano_de_obra", unidad: "unidad", precioVentaUSD: 140.00 },
  { nombre: "MANO DE OBRA M2 PISO RADIANTE", proveedor: "EULER", categoria: "Mano de obra", costoUSD: null, markup: null, tipo: "mano_de_obra", unidad: "m2", precioVentaUSD: 12.50 },
  { nombre: "MANO DE OBRA POR TERMOSTATIZACIÓN", proveedor: "EULER", categoria: "Mano de obra", costoUSD: null, markup: null, tipo: "mano_de_obra", unidad: "unidad", precioVentaUSD: 175.00 },
  { nombre: "TRONCAL PARA COLECTOR / PILETA", proveedor: "EULER", categoria: "Mano de obra", costoUSD: null, markup: null, tipo: "servicio", unidad: "unidad", precioVentaUSD: 210.00 },
];

// ═══════════════════════════════════════════════════════════════════
// CUENTAS QUE INDICAN QUE ES UN PRODUCTO/SERVICIO REAL
// ═══════════════════════════════════════════════════════════════════
const cuentasProducto = [
  'Costo de Mercaderia Vendida',
  'Bienes de Cambio (Factura Recibida)',
];
const cuentasServicio = [
  'Ventas Brutas de Servicios',
];
const cuentasVentaValidas = [
  'Ventas Brutas de Bienes',
  'Ventas Brutas de Servicios',
];

// ═══════════════════════════════════════════════════════════════════
// CATEGORIZACIÓN AUTOMÁTICA POR NOMBRE
// ═══════════════════════════════════════════════════════════════════
function detectarCategoria(nombre) {
  const n = nombre.toLowerCase();
  if (n.includes('caldera') || n.includes('calefon') || n.includes('termotanque') || n.includes('boiler')) return 'Calderas';
  if (n.includes('radiador') || n.includes('elemento de radiador') || n.includes('elemento para radiador')) return 'Radiadores';
  if (n.includes('toallero')) return 'Toalleros';
  if (n.includes('colector') && (n.includes('piso') || n.includes('circuito'))) return 'Colectores / Piso radiante';
  if (n.includes('termostato') || n.includes('cabezal') || n.includes('regleta')) return 'Termostatos / Automatización';
  if (n.includes('bomba')) return 'Bombas';
  if (n.includes('separador') || n.includes('intercambiador')) return 'Separadores / Intercambiadores';
  if (n.includes('aire acondicionado') || n.includes('fan coil') || n.includes('climatizador') || n.includes('bomba de calor')) return 'Climatización';
  if (n.includes('valvula') || n.includes('válvula') || n.includes('detentor') || n.includes('llave')) return 'Válvulas / Accesorios';
  if (n.includes('tubo') || n.includes('caño') || n.includes('cañeria') || n.includes('cañería') || n.includes('coaxial')) return 'Cañería / Ventilación';
  if (n.includes('vaso de expan')) return 'Separadores / Intercambiadores';
  if (n.includes('tee ') || n.includes('codo') || n.includes('union') || n.includes('unión') || n.includes('manguito') || n.includes('terminal') || n.includes('casquillo') || n.includes('acoplamiento') || n.includes('racor')) return 'Fitting PEX';
  if (n.includes('niple') || n.includes('roseta') || n.includes('blister kit') || n.includes('teflon') || n.includes('teflón') || n.includes('abrazadera') || n.includes('aro de terminación') || n.includes('cupla') || n.includes('filtro') || n.includes('purga') || n.includes('manómetro') || n.includes('termómetro')) return 'Válvulas / Accesorios';
  if (n.includes('mano de obra') || n.includes('instalacion') || n.includes('instalación') || n.includes('puesta en marcha') || n.includes('servicio tecnico') || n.includes('servicio técnico')) return 'Mano de obra';
  if (n.includes('corrugado') || n.includes('aislacion') || n.includes('aislación') || n.includes('eps ') || n.includes('manta aislante')) return 'Aislación';
  if (n.includes('flexib')) return 'Válvulas / Accesorios';
  if (n.includes('kit')) return 'Kits / Accesorios';
  if (n.includes('solenoide') || n.includes('ablandador')) return 'Separadores / Intercambiadores';
  if (n.includes('presurizadora') || n.includes('presurizado')) return 'Bombas';
  if (n.includes('gabinete') || n.includes('armario')) return 'Colectores / Piso radiante';
  return 'Materiales generales';
}

function detectarTipo(nombre, cuentaCompras, cuentaVentas) {
  const n = nombre.toLowerCase();
  if (n.includes('mano de obra') || n.includes('puesta en marcha') || n.includes('servicio tecnico') || n.includes('servicio técnico')) return 'mano_de_obra';
  if (n.includes('proyecto') || n.includes('planimetria')) return 'servicio';
  if (cuentaCompras.includes('Servicios') && cuentaVentas.includes('Servicios')) return 'mano_de_obra';
  return 'material';
}

// ═══════════════════════════════════════════════════════════════════
// PARSEAR CATÁLOGO GESDATTA
// ═══════════════════════════════════════════════════════════════════
const gesdattaPath = path.join(__dirname, '..', 'catalogo_articulos_gesdatta.txt');
const text = fs.readFileSync(gesdattaPath, 'utf8');
const lines = text.split('\n');

const gesdattaItems = [];
let startParsing = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (line.startsWith('Código\tNombre')) { startParsing = true; continue; }
  if (!startParsing || line.length === 0 || line === 'Triangular' || line === 'Buscar...') continue;

  const columns = line.split('\t');
  if (columns.length < 5) continue;

  const code = columns[0]?.trim();
  const name = columns[1]?.trim();
  const cuentaCompras = columns[3]?.trim() || '';
  const cuentaVentas = columns[4]?.trim() || '';

  if (!code || !name) continue;

  // Filtrar: solo productos y servicios reales
  const esProducto = cuentasProducto.some(c => cuentaCompras.includes(c));
  const esServicioCompra = cuentasServicio.some(c => cuentaCompras.includes(c));
  const esVentaValida = cuentasVentaValidas.some(c => cuentaVentas.includes(c));

  if (!esProducto && !esServicioCompra && !esVentaValida) continue;

  const tipo = detectarTipo(name, cuentaCompras, cuentaVentas);
  const categoria = detectarCategoria(name);

  gesdattaItems.push({
    codigoGesdatta: code,
    descripcion: name,
    categoria,
    tipo,
  });
}

console.log(`Gesdatta: ${gesdattaItems.length} productos/servicios reales encontrados.`);

// ═══════════════════════════════════════════════════════════════════
// CRUZAR CON DATOS DEL EXCEL
// ═══════════════════════════════════════════════════════════════════

// Build matching function - fuzzy name matching
function normalizar(str) {
  return str.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchScore(gesdattaName, excelName) {
  const gn = normalizar(gesdattaName);
  const en = normalizar(excelName);
  
  // Exact match
  if (gn === en) return 100;
  // One contains the other
  if (gn.includes(en) || en.includes(gn)) return 80;
  
  // Word overlap
  const gWords = gn.split(' ').filter(w => w.length > 2);
  const eWords = en.split(' ').filter(w => w.length > 2);
  const commonWords = gWords.filter(w => eWords.some(ew => ew.includes(w) || w.includes(ew)));
  const score = (commonWords.length / Math.max(gWords.length, eWords.length)) * 70;
  return score;
}

const finalItems = [];
const matchedExcelIndices = new Set();

for (const gItem of gesdattaItems) {
  let bestMatch = null;
  let bestScore = 0;

  for (let i = 0; i < excelData.length; i++) {
    if (matchedExcelIndices.has(i)) continue;
    const score = matchScore(gItem.descripcion, excelData[i].nombre);
    if (score > bestScore && score >= 50) {
      bestScore = score;
      bestMatch = { index: i, data: excelData[i] };
    }
  }

  if (bestMatch) {
    matchedExcelIndices.add(bestMatch.index);
    const excel = bestMatch.data;
    finalItems.push({
      codigoGesdatta: gItem.codigoGesdatta,
      descripcion: excel.nombre, // Usar nombre del Excel (más limpio)
      proveedor: excel.proveedor,
      categoria: excel.categoria,
      tipo: excel.tipo,
      costoUSD: excel.costoUSD,
      markup: excel.markup,
      precioVentaUSD: excel.precioVentaUSD || null,
      unidad: excel.unidad,
      activo: true,
    });
    console.log(`  ✓ Match: "${gItem.descripcion}" → "${excel.nombre}" (score: ${bestScore})`);
  } else {
    finalItems.push({
      codigoGesdatta: gItem.codigoGesdatta,
      descripcion: gItem.descripcion,
      proveedor: null,
      categoria: gItem.categoria,
      tipo: gItem.tipo,
      costoUSD: null,
      markup: null,
      precioVentaUSD: null,
      unidad: 'unidad',
      activo: true,
    });
  }
}

// Add Excel items that didn't match any Gesdatta item
for (let i = 0; i < excelData.length; i++) {
  if (!matchedExcelIndices.has(i)) {
    const excel = excelData[i];
    finalItems.push({
      codigoGesdatta: null,
      descripcion: excel.nombre,
      proveedor: excel.proveedor,
      categoria: excel.categoria,
      tipo: excel.tipo,
      costoUSD: excel.costoUSD,
      markup: excel.markup,
      precioVentaUSD: excel.precioVentaUSD || null,
      unidad: excel.unidad,
      activo: true,
    });
    console.log(`  + Excel-only: "${excel.nombre}"`);
  }
}

// Sort by category then name
finalItems.sort((a, b) => {
  if (a.categoria !== b.categoria) return a.categoria.localeCompare(b.categoria);
  return a.descripcion.localeCompare(b.descripcion);
});

console.log(`\nTotal: ${finalItems.length} ítems para importar.`);
console.log(`  - Con precio USD: ${finalItems.filter(i => i.costoUSD !== null || i.precioVentaUSD !== null).length}`);
console.log(`  - Sin precio (pendientes): ${finalItems.filter(i => i.costoUSD === null && i.precioVentaUSD === null).length}`);

// Get unique categories
const cats = [...new Set(finalItems.map(i => i.categoria))].sort();
console.log(`\nCategorías: ${cats.join(', ')}`);

// ═══════════════════════════════════════════════════════════════════
// GENERAR ARCHIVO JS IMPORTABLE
// ═══════════════════════════════════════════════════════════════════
const output = `// Auto-generado por scripts/generarListaPrecios.js
// Fecha: ${new Date().toISOString()}
// Total: ${finalItems.length} ítems

export const datosIniciales = ${JSON.stringify(finalItems, null, 2)};

export const categoriasIniciales = ${JSON.stringify(cats, null, 2)};
`;

const outputPath = path.join(__dirname, '..', 'src', 'pages', 'ListaPrecios', 'datosIniciales.js');

// Create directory if needed
const dir = path.dirname(outputPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

fs.writeFileSync(outputPath, output);
console.log(`\n✓ Archivo generado: ${outputPath}`);
