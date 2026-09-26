async function testParseFull(cuit) {
  const url = `https://www.cuitonline.com/search.php?q=${cuit}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();

  console.log("=== PARSING CUIT ===", cuit);

  // 1. Razón Social / Nombre
  let name = '';
  const metaMatch = html.match(/meta name="description" content="[^"]*?\b([a-zA-Z\sÑñÁÉÍÓÚáéíóú.-]+)\s*-\s*\d{11}/i);
  if (metaMatch && metaMatch[1] && !metaMatch[1].toLowerCase().includes('resultados')) {
    name = metaMatch[1].trim();
  }
  if (!name) {
    const h3Match = html.match(/<h3[^>]*>\s*([a-zA-Z\sÑñÁÉÍÓÚáéíóú.-]+)\s*<\/h3>/i);
    if (h3Match && h3Match[1] && !h3Match[1].toLowerCase().includes('bloqueador') && !h3Match[1].toLowerCase().includes('sumate')) {
      name = h3Match[1].trim();
    }
  }
  console.log("Extracted Name:", name);

  // 2. Domicilio / Direccion
  let domicilio = '';
  const domRegex = /(?:domicilio|direcci[oó]n)[^:]*:\s*<[^>]+>\s*([^<]+)/i;
  const domMatch = html.match(domRegex);
  if (domMatch) domicilio = domMatch[1].trim();

  // Alternative domicilio regexes
  if (!domicilio) {
    const streetMatch = html.match(/itemprop="streetAddress">([^<]+)/i);
    if (streetMatch) domicilio = streetMatch[1].trim();
  }
  console.log("Extracted Domicilio:", domicilio);

  // 3. Localidad / Provincia
  let localidad = '';
  let provincia = '';
  const provMatch = html.match(/(Santa Fe|Buenos Aires|Córdoba|Cordoba|Mendoza|Entre R[íi]os|Tucum[áa]n|Salta|San Juan|San Luis|Chaco|Corrientes|Misiones|Neuqu[eé]n|R[íi]o Negro|Chubut|Santa Cruz|Jujuy|La Pampa|Formosa|Catamarca|La Rioja|Tierra del Fuego|CABA|Capital Federal)/i);
  if (provMatch) provincia = provMatch[1];
  console.log("Extracted Provincia:", provincia);

  // 4. Actividad / Condicion IVA
  let condicionIva = '';
  if (html.includes('MONOTRIBUTO')) condicionIva = 'Monotributo';
  else if (html.includes('IVA EXENTO') || html.includes('EXENTO')) condicionIva = 'Exento';
  else if (html.includes('IVA RESPONSABLE INSCRIPTO') || html.includes('RESPONSABLE INSCRIPTO')) condicionIva = 'Responsable Inscripto';
  else condicionIva = cuit.startsWith('30') || cuit.startsWith('33') ? 'Responsable Inscripto' : 'Consumidor Final';
  console.log("Extracted Condicion IVA:", condicionIva);
}

testParseFull('27319516277');
testParseFull('30500010912');
