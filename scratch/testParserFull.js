const parsePadronHtml = (html, cleanCuit) => {
  if (!html) return null;

  let name = '';
  let location = '';
  let address = '';

  // Strategy 1: Title pattern on detail pages: <title>NAME (CUIT), LOCATION - Cuit Online</title>
  const titleMatch = html.match(/<title>\s*([^(<]+)\s*\(\d{2}-\d{8}-\d\)(?:,\s*([^-\n<]+))?/i);
  if (titleMatch && titleMatch[1]) {
    const rawName = titleMatch[1].trim();
    if (!rawName.toLowerCase().includes('cuit online') && !rawName.toLowerCase().includes('resultados')) {
      name = rawName;
    }
    if (titleMatch[2]) {
      location = titleMatch[2].replace(/-\s*Cuit\s*Online/i, '').trim();
    }
  }

  // Strategy 2: H2 class="denominacion" or title="Ver detalles de NAME"
  if (!name) {
    const h2Match = html.match(/<h2[^>]*class=["']denominacion["'][^>]*>([^<]+)<\/h2>/i) ||
                    html.match(/title=["']Ver detalles de ([^"']+)["']/i) ||
                    html.match(/<h2[^>]*>([^<]+)<\/h2>/i);
    if (h2Match && h2Match[1] && !h2Match[1].toLowerCase().includes('bloqueador') && !h2Match[1].toLowerCase().includes('cuit')) {
      name = h2Match[1].trim();
    }
  }

  // Strategy 3: Meta description
  if (!name) {
    const metaMatch = html.match(/meta name="description" content="[^"]*?\b([a-zA-Z\sÑñÁÉÍÓÚáéíóú.-]+)\s*-\s*\d{11}/i) ||
                      html.match(/CuitOnline\.\s*([^-\d<]+)\s*-\s*\d{11}/i);
    if (metaMatch && metaMatch[1]) {
      const rawMeta = metaMatch[1].replace(/regímenes y actividades con CuitOnline\.?/gi, '').replace(/1 Resultados de \d+/gi, '').trim();
      if (!rawMeta.toLowerCase().includes('bloqueador')) {
        name = rawMeta;
      }
    }
  }

  if (name.toLowerCase().startsWith('con cuitonline.')) {
    name = name.replace(/^con cuitonline\.\s*/i, '');
  }

  // Extract Address (Domicilio)
  const domMatch = html.match(/(?:domicilio|direcci[oó]n)[^:]*:\s*<[^>]+>\s*([^<]+)/i) ||
                   html.match(/itemprop=["']streetAddress["'][^>]*>([^<]+)/i) ||
                   html.match(/domicilio[^<]*<[^>]+>\s*([^<]+)/i);
  if (domMatch) {
    address = domMatch[1].trim();
  }

  // Extract Location if not found in title
  if (!location) {
    const provMatch = html.match(/(Santa Fe|Buenos Aires|Córdoba|Cordoba|Mendoza|Entre R[íi]os|Tucum[áa]n|Salta|San Juan|San Luis|Chaco|Corrientes|Misiones|Neuqu[eé]n|R[íi]o Negro|Chubut|Santa Cruz|Jujuy|La Pampa|Formosa|Catamarca|La Rioja|Tierra del Fuego|CABA|Capital Federal)/i);
    if (provMatch) location = provMatch[1];
  }

  // Extract Condicion IVA
  let condicionIva = 'Consumidor Final';
  if (html.includes('MONOTRIBUTO')) condicionIva = 'Monotributo';
  else if (html.includes('IVA EXENTO') || html.includes('EXENTO')) condicionIva = 'Exento';
  else if (html.includes('IVA RESPONSABLE INSCRIPTO') || html.includes('RESPONSABLE INSCRIPTO')) condicionIva = 'Responsable Inscripto';
  else if (cleanCuit.startsWith('30') || cleanCuit.startsWith('33')) condicionIva = 'Responsable Inscripto';

  return {
    name: name ? name.toUpperCase() : '',
    address: address ? address.toUpperCase() : '',
    location: location || '',
    condicionIva
  };
};

async function testFull() {
  const cuits = ['27319516277', '30500010912'];

  for (const cuit of cuits) {
    console.log(`\n================================`);
    console.log(`Testing CUIT: ${cuit}`);
    const searchRes = await fetch(`https://www.cuitonline.com/search.php?q=${cuit}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36'
      }
    });
    const searchHtml = await searchRes.text();
    let result = parsePadronHtml(searchHtml, cuit);

    const detailRegex = new RegExp(`href=["'](detalle/${cuit}/[^"']+\\.html)["']`, 'i');
    const detailPathMatch = searchHtml.match(detailRegex);
    if (detailPathMatch) {
      const detailRes = await fetch(`https://www.cuitonline.com/${detailPathMatch[1]}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36'
        }
      });
      const detailHtml = await detailRes.text();
      const detailResult = parsePadronHtml(detailHtml, cuit);
      result = {
        name: detailResult.name || result.name,
        address: detailResult.address || result.address,
        location: detailResult.location || result.location,
        condicionIva: detailResult.condicionIva || result.condicionIva
      };
    }
    console.log('Final Combined Result:', result);
  }
}

testFull();
