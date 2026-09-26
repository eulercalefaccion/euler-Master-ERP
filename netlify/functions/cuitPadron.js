const formatCUIT = (val) => {
  if (!val) return '';
  const clean = val.replace(/\D/g, '');
  if (clean.length === 11) {
    return `${clean.slice(0, 2)}-${clean.slice(2, 10)}-${clean.slice(10, 11)}`;
  }
  return val.trim();
};

const formatDNI = (val) => {
  if (!val) return '';
  const clean = val.replace(/\D/g, '');
  if (clean.length >= 7 && clean.length <= 8) {
    return clean.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  return val.trim();
};

const extraerDniDeCuit = (cleanCuit) => {
  if (cleanCuit.length === 11) {
    const prefijo = cleanCuit.substring(0, 2);
    if (['20', '23', '24', '27'].includes(prefijo)) {
      const dniClean = cleanCuit.substring(2, 10);
      return formatDNI(dniClean);
    }
  }
  return '';
};

/**
 * Parsea HTML de CuitOnline (search o detail page)
 */
const parsePadronHtml = (html, cleanCuit) => {
  if (!html) return null;

  let name = '';
  let location = '';
  let address = '';

  // Strategy 1: Title pattern on detail pages: <title>NAME (XX-XXXXXXXX-X), LOCATION - Cuit Online</title>
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
                    html.match(/title=["']Ver detalles de ([^"']+)["']/i);
    if (h2Match && h2Match[1] && !h2Match[1].toLowerCase().includes('bloqueador')) {
      name = h2Match[1].trim();
    }
  }

  // Strategy 3: Meta description fallback
  if (!name) {
    const metaMatch = html.match(/meta\s+name=["']description["']\s+content=["'][^"']*?([a-zA-Z\sÑñÁÉÍÓÚáéíóú.-]{3,60})\s*-\s*\d{11}/i);
    if (metaMatch && metaMatch[1]) {
      let rawMeta = metaMatch[1].trim();
      rawMeta = rawMeta.replace(/.*CuitOnline\.\s*/i, '').trim();
      if (rawMeta.length >= 3 && !rawMeta.toLowerCase().includes('bloqueador') && !rawMeta.toLowerCase().includes('resultados')) {
        name = rawMeta;
      }
    }
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
    const provMatch = html.match(/(Santa Fe|Buenos Aires|Córdoba|Cordoba|Mendoza|Entre R[íi]os|Tucum[áa]n|Salta|San Juan|San Luis|Chaco|Corrientes|Misiones|Neuqu[eé]n|R[íi]o Negro|Chubut|Santa Cruz|Jujuy|La Pampa|Formosa|Catamarca|La Rioja|Tierra del Fuego|CABA|Capital Federal|C\.A\.B\.A\.)/i);
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

/**
 * Parsea los resultados HTML de DuckDuckGo para extraer el nombre del contribuyente
 * DuckDuckGo devuelve el nombre en el link: "ALVAREZ CINDEA LEONORA (27-31951627-7), Rosario..."
 * y en el snippet: "ALVAREZ CINDEA LEONORA CUIT: 27319516277..."
 */
const parseDuckDuckGoHtml = (html, cleanCuit) => {
  if (!html) return null;
  const cuitFormatted = formatCUIT(cleanCuit);

  let name = '';
  let location = '';

  // Pattern 1: result__a link text: "NAME (XX-XXXXXXXX-X), LOCATION"
  const resultAMatch = html.match(/class=["']result__a["'][^>]*>([^<]+)\(\d{2}-\d{8}-\d\)/i);
  if (resultAMatch && resultAMatch[1]) {
    name = resultAMatch[1].trim();
    // Check for location after the CUIT
    const fullMatch = html.match(/class=["']result__a["'][^>]*>[^<]+\(\d{2}-\d{8}-\d\),\s*([^<]+)/i);
    if (fullMatch && fullMatch[1]) {
      location = fullMatch[1].replace(/-\s*Cuit\s*Online.*/i, '').replace(/\s*-\s*$/, '').trim();
    }
  }

  // Pattern 2: result__snippet: "NAME CUIT: XXXXXXXXXXX"
  if (!name) {
    const snippetMatch = html.match(/class=["']result__snippet["'][^>]*>([^<]+?)(?:\s*<b>)?CUIT/i);
    if (snippetMatch && snippetMatch[1]) {
      const raw = snippetMatch[1].replace(/<[^>]+>/g, '').trim();
      if (raw.length >= 3) {
        name = raw;
      }
    }
  }

  // Pattern 3: URL slug: /detalle/CUIT/nombre-con-guiones.html
  if (!name) {
    const slugMatch = html.match(new RegExp(`detalle/${cleanCuit}/([a-z0-9-]+)\\.html`, 'i'));
    if (slugMatch && slugMatch[1]) {
      name = slugMatch[1].replace(/-/g, ' ').trim();
    }
  }

  return {
    name: name ? name.toUpperCase().replace(/\s+/g, ' ').trim() : '',
    location: location || ''
  };
};

const fetchHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'max-age=0',
  'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1'
};

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const rawCuit = event.queryStringParameters?.cuit || event.path.split('/').pop() || '';
  const cleanCuit = rawCuit.replace(/\D/g, '');

  if (cleanCuit.length !== 11) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ exito: false, mensaje: 'CUIT inválido (debe tener 11 dígitos numéricos)' })
    };
  }

  const cuitFormateado = formatCUIT(cleanCuit);
  const prefijo = cleanCuit.substring(0, 2);
  const esPersonaFisica = ['20', '23', '24', '27'].includes(prefijo);
  const dniExtraido = extraerDniDeCuit(cleanCuit);

  let finalName = '';
  let finalAddress = '';
  let finalLocation = '';
  let finalCondicionIva = esPersonaFisica ? 'Consumidor Final' : 'Responsable Inscripto';

  // ═══════════════════════════════════════════════════════════════
  // STRATEGY 1: CuitOnline direct (may fail from datacenter IPs)
  // ═══════════════════════════════════════════════════════════════
  try {
    const searchUrl = `https://www.cuitonline.com/search.php?q=${cleanCuit}`;
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(searchUrl, { headers: fetchHeaders, signal: controller.signal });
    clearTimeout(tid);

    if (response.ok) {
      const searchHtml = await response.text();
      
      // Only process if we got real HTML (not a Cloudflare challenge)
      if (searchHtml.length > 10000 && !searchHtml.includes('cf-browser-verification')) {
        const parsed = parsePadronHtml(searchHtml, cleanCuit);
        if (parsed && parsed.name) {
          finalName = parsed.name;
          finalLocation = parsed.location;
          finalCondicionIva = parsed.condicionIva;
        }

        // Follow detail link for address
        const detailRegex = new RegExp(`href=["'](detalle/${cleanCuit}/[^"']+\\.html)["']`, 'i');
        const detailMatch = searchHtml.match(detailRegex);
        if (detailMatch) {
          try {
            const dctl = new AbortController();
            const dtid = setTimeout(() => dctl.abort(), 4000);
            const detailRes = await fetch(`https://www.cuitonline.com/${detailMatch[1]}`, { headers: fetchHeaders, signal: dctl.signal });
            clearTimeout(dtid);
            if (detailRes.ok) {
              const detailHtml = await detailRes.text();
              if (detailHtml.length > 10000) {
                const dp = parsePadronHtml(detailHtml, cleanCuit);
                if (dp) {
                  finalName = dp.name || finalName;
                  finalAddress = dp.address || finalAddress;
                  finalLocation = dp.location || finalLocation;
                  finalCondicionIva = dp.condicionIva || finalCondicionIva;
                }
              }
            }
          } catch (e) { /* detail fetch failed, continue */ }
        }
      }
    }
  } catch (err) {
    console.warn('[cuitPadron] CuitOnline direct failed:', err.message);
  }

  // ═══════════════════════════════════════════════════════════════
  // STRATEGY 2: DuckDuckGo HTML search (works from datacenter IPs)
  // ═══════════════════════════════════════════════════════════════
  if (!finalName) {
    try {
      const ddgUrl = `https://html.duckduckgo.com/html/?q=cuit+${cleanCuit}+cuitonline`;
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 5000);
      const ddgRes = await fetch(ddgUrl, { 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0' },
        signal: controller.signal 
      });
      clearTimeout(tid);

      if (ddgRes.ok) {
        const ddgHtml = await ddgRes.text();
        const ddgParsed = parseDuckDuckGoHtml(ddgHtml, cleanCuit);
        if (ddgParsed && ddgParsed.name) {
          finalName = ddgParsed.name;
          finalLocation = ddgParsed.location || finalLocation;
        }
      }
    } catch (err) {
      console.warn('[cuitPadron] DuckDuckGo failed:', err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STRATEGY 3: Bing search (additional fallback)
  // ═══════════════════════════════════════════════════════════════
  if (!finalName) {
    try {
      const bingUrl = `https://www.bing.com/search?q=cuit+${cleanCuit}+cuitonline`;
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 4000);
      const bingRes = await fetch(bingUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0' },
        signal: controller.signal
      });
      clearTimeout(tid);

      if (bingRes.ok) {
        const bingHtml = await bingRes.text();
        // Bing title: "ALVAREZ CINDEA LEONORA (27-31951627-7)..." or "BANCO DE LA NACION ARGENTINA..."
        const bingMatch = bingHtml.match(new RegExp(`([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .'-]{2,60})\\s*\\(\\s*\\d{2}-\\d{8}-\\d\\s*\\)`, 'i')) ||
                          bingHtml.match(new RegExp(`([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .'-]{2,60})\\s*(?:CUIT|cuit)\\s*:?\\s*${cleanCuit}`, 'i'));
        if (bingMatch && bingMatch[1]) {
          finalName = bingMatch[1].trim().toUpperCase();
        }
      }
    } catch (err) {
      console.warn('[cuitPadron] Bing failed:', err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // BUILD RESPONSE
  // ═══════════════════════════════════════════════════════════════
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      exito: true,
      cuit: cuitFormateado,
      cuitLimpio: cleanCuit,
      name: finalName,
      type: esPersonaFisica ? 'Propietario' : 'Constructora',
      dni: dniExtraido,
      address: finalAddress,
      location: finalLocation,
      condicionIva: finalCondicionIva,
      esPersonaFisica,
      mensaje: finalName
        ? `Contribuyente hallado en Padrón ARCA: ${finalName}`
        : esPersonaFisica
          ? `CUIT de Persona Física verificado (DNI ${dniExtraido} detectado). Completá la Razón Social manualmente.`
          : `CUIT de Persona Jurídica verificado en ARCA.`
    })
  };
};
