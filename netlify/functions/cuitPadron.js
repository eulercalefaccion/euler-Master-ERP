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

// ═══════════════════════════════════════════════════════════════
// PARSEO: Funciones para extraer datos del HTML de CuitOnline
// ═══════════════════════════════════════════════════════════════

/**
 * Parsea HTML de CuitOnline (search o detail page)
 * 
 * Formatos conocidos del HTML de CuitOnline (Oct 2026):
 * 
 * SEARCH PAGE (/search.php?q=XXXXXXXXXXX):
 *   <title>XXXXXXXXXXX -  Cuit Online</title>
 *   <a href="https://www.cuitonline.com/detalle/CUIT/nombre-slug.html">NOMBRE</a>
 *   <h2 class="denominacion">NOMBRE</h2>
 * 
 * DETAIL PAGE (/detalle/CUIT/nombre-slug.html):
 *   <title>NOMBRE (XX-XXXXXXXX-X), Localidad (Provincia) -  Cuit Online</title>
 *   Persona Física  (Femenino/Masculino), Argentina
 *   CALLE NÚMERO    Provincia: PROVINCIA -     Localidad: LOCALIDAD
 *   Empleador: No/Sí
 *   Impuestos activos: ...
 */
const parsePadronHtml = (html, cleanCuit) => {
  if (!html) return null;

  const cuitFormateado = formatCUIT(cleanCuit);
  let name = '';
  let location = '';
  let address = '';

  // ── Strategy 1: <title> tag ─────────────────────────────────────
  // Detail pages: <title>NOMBRE (XX-XXXXXXXX-X), Localidad (Provincia) -  Cuit Online</title>
  const titleMatch = html.match(/<title>\s*([^(<]+?)\s*\(\d{2}-\d{8}-\d\)(?:,\s*([^-\n<]+))?/i);
  if (titleMatch && titleMatch[1]) {
    const rawName = titleMatch[1].trim();
    if (rawName.length >= 3 &&
        !rawName.toLowerCase().includes('cuit online') && 
        !rawName.toLowerCase().includes('resultados') &&
        !rawName.toLowerCase().includes('bloqueador')) {
      name = rawName;
    }
    if (titleMatch[2]) {
      // "Rosario (Santa Fe) -  Cuit Online" → extract localidad and provincia
      let locRaw = titleMatch[2].replace(/-\s*Cuit\s*Online.*/i, '').trim();
      // Extract "(Provincia)" if present
      const provInParens = locRaw.match(/\(([^)]+)\)/);
      if (provInParens) {
        location = provInParens[1].trim(); // provincia
        locRaw = locRaw.replace(/\s*\([^)]+\)\s*/, '').trim(); // localidad
      }
      if (locRaw && !location) location = locRaw;
      // If we have "Rosario (Santa Fe)", prepend localidad
      if (locRaw && location && locRaw !== location) {
        location = `${locRaw}, ${location}`;
      }
    }
  }

  // ── Strategy 2: Detail link href in search results ──────────────
  // <a href=".../detalle/CUIT/nombre-con-guiones.html">NOMBRE</a>
  if (!name) {
    const detailLinkMatch = html.match(
      new RegExp(`detalle/${cleanCuit}/([a-z0-9][a-z0-9-]+)\\.html[^>]*>\\s*([^<]+)`, 'i')
    );
    if (detailLinkMatch) {
      const linkText = detailLinkMatch[2].trim();
      if (linkText.length >= 3 && 
          !linkText.toLowerCase().includes('informe') &&
          !linkText.toLowerCase().includes('vista previa') &&
          !linkText.toLowerCase().includes('constancia')) {
        name = linkText;
      }
    }
  }

  // ── Strategy 3: H2 denominacion or title="Ver detalles de NAME" ──
  if (!name) {
    const h2Match = html.match(/<h2[^>]*class=["']denominacion["'][^>]*>([^<]+)<\/h2>/i) ||
                    html.match(/title=["']Ver detalles de ([^"']+)["']/i);
    if (h2Match && h2Match[1] && !h2Match[1].toLowerCase().includes('bloqueador')) {
      name = h2Match[1].trim();
    }
  }

  // ── Strategy 4: Meta description ─────────────────────────────────
  if (!name) {
    const metaMatch = html.match(
      /meta\s+name=["']description["']\s+content=["']([^"']+)["']/i
    );
    if (metaMatch && metaMatch[1]) {
      // Format: "NOMBRE - CUIT XXXXXXXXXXX - Datos de..." 
      const metaParts = metaMatch[1].split(/\s*-\s*/);
      if (metaParts[0]) {
        const candidate = metaParts[0].trim();
        if (candidate.length >= 3 && 
            !candidate.toLowerCase().includes('cuit online') &&
            !candidate.toLowerCase().includes('bloqueador') &&
            !candidate.toLowerCase().includes('resultados') &&
            !candidate.toLowerCase().includes('obtener')) {
          name = candidate;
        }
      }
    }
  }

  // ── Extract Address (multiple patterns) ──────────────────────────
  
  // Pattern 1: itemprop="streetAddress"
  if (!address) {
    const itemPropMatch = html.match(/itemprop=["']streetAddress["'][^>]*>([^<]+)/i);
    if (itemPropMatch && itemPropMatch[1].trim().length > 3) {
      address = itemPropMatch[1].trim();
    }
  }

  // Pattern 2: Domicilio/Dirección label followed by value
  if (!address) {
    const domMatch = html.match(/(?:domicilio|direcci[oó]n)\s*(?:fiscal|legal)?\s*:?\s*<[^>]+>\s*([^<]+)/i);
    if (domMatch && domMatch[1].trim().length > 3) {
      address = domMatch[1].trim();
    }
  }

  // Pattern 3: CuitOnline detail page body text pattern
  // The detail page shows address as plain text: "cordoba 8536    Provincia: Santa Fe"
  if (!address) {
    // Look for text that looks like an address before "Provincia:"
    const bodyAddrMatch = html.match(
      /Persona\s+(?:F[ií]sica|Jur[ií]dica)[^]*?(?:\([^)]*\))?[^]*?Argentina\s*(?:<[^>]*>)*\s*([a-zA-ZáéíóúñÁÉÍÓÚÑ0-9 .,]+\d{1,5}[a-zA-ZáéíóúñÁÉÍÓÚÑ0-9 .,]*?)\s*(?:<[^>]*>)*\s*Provincia:/i
    );
    if (bodyAddrMatch && bodyAddrMatch[1]) {
      const candidate = bodyAddrMatch[1].replace(/<[^>]+>/g, '').trim();
      if (candidate.length >= 4) {
        address = candidate;
      }
    }
  }

  // ── Extract Location/Provincia ────────────────────────────────────
  if (!location) {
    // CuitOnline format: "Provincia: <a...>Santa Fe</a> - Localidad: Rosario"
    const provLinkMatch = html.match(/Provincia:\s*(?:<a[^>]*>)?\s*([^<\n]+)/i);
    if (provLinkMatch && provLinkMatch[1]) {
      location = provLinkMatch[1].replace(/-\s*$/, '').trim();
    }
    // Also try to get Localidad
    const locMatch = html.match(/Localidad:\s*([A-Za-záéíóúñÁÉÍÓÚÑ .']+?)(?:\s*<|\s*$)/im);
    if (locMatch && locMatch[1] && locMatch[1].trim().length > 1) {
      const localidad = locMatch[1].trim();
      if (location && localidad !== location) {
        location = `${localidad}, ${location}`;
      } else if (!location) {
        location = localidad;
      }
    }
  }

  // Fallback: match known province names
  if (!location) {
    const provMatch = html.match(
      /(?:provincia[^a-z]*|Provincia:\s*(?:<[^>]*>)?\s*)(Santa Fe|Buenos Aires|C[oó]rdoba|Mendoza|Entre R[íi]os|Tucum[áa]n|Salta|San Juan|San Luis|Chaco|Corrientes|Misiones|Neuqu[eé]n|R[íi]o Negro|Chubut|Santa Cruz|Jujuy|La Pampa|Formosa|Catamarca|La Rioja|Tierra del Fuego|Santiago del Estero|CABA|Capital Federal|C\.A\.B\.A\.)/i
    );
    if (provMatch && provMatch[1]) location = provMatch[1].trim();
  }

  // ── Extract Condición IVA ─────────────────────────────────────────
  let condicionIva = 'Consumidor Final';
  const htmlUpper = html.toUpperCase();
  if (htmlUpper.includes('MONOTRIBUTO') || htmlUpper.includes('MONOTRIBUTISTA')) {
    condicionIva = 'Monotributo';
  } else if (htmlUpper.includes('IVA EXENTO') || htmlUpper.includes('EXENTO DE IVA')) {
    condicionIva = 'Exento';
  } else if (htmlUpper.includes('IVA RESPONSABLE INSCRIPTO') || htmlUpper.includes('RESPONSABLE INSCRIPTO')) {
    condicionIva = 'Responsable Inscripto';
  } else if (cleanCuit.startsWith('30') || cleanCuit.startsWith('33') || cleanCuit.startsWith('34')) {
    condicionIva = 'Responsable Inscripto';
  }

  // ── Clean up name ─────────────────────────────────────────────────
  if (name) {
    // Remove any straggling HTML entities
    name = name.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }
  if (address) {
    address = address.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }

  return {
    name: name ? name.toUpperCase() : '',
    address: address ? address.toUpperCase() : '',
    location: location || '',
    condicionIva
  };
};

/**
 * Extrae el slug del detalle de CuitOnline del HTML de búsqueda.
 * Ejemplo: detalle/27215239646/di-benedetto-nanci.html → "di-benedetto-nanci"
 */
const extractDetailSlug = (html, cleanCuit) => {
  const slugMatch = html.match(new RegExp(`detalle/${cleanCuit}/([a-z0-9][a-z0-9-]+)\\.html`, 'i'));
  return slugMatch ? slugMatch[1] : '';
};

/**
 * Parsea los resultados HTML de DuckDuckGo para extraer nombre, dirección, etc.
 */
const parseDuckDuckGoHtml = (html, cleanCuit) => {
  if (!html) return null;

  let name = '';
  let location = '';
  let address = '';
  let condicionIva = '';
  let detailSlug = '';

  // Extract detail page slug from URL in results
  const slugMatch = html.match(new RegExp(`detalle/${cleanCuit}/([a-z0-9-]+)\\.html`, 'i'));
  if (slugMatch && slugMatch[1]) {
    detailSlug = slugMatch[1];
  }

  // Pattern 1: result__a link text: "NAME (XX-XXXXXXXX-X), LOCATION"
  const resultAMatch = html.match(/class=["']result__a["'][^>]*>([^<]+)\(\d{2}-\d{8}-\d\)/i);
  if (resultAMatch && resultAMatch[1]) {
    name = resultAMatch[1].trim();
    const fullMatch = html.match(/class=["']result__a["'][^>]*>[^<]+\(\d{2}-\d{8}-\d\),\s*([^<]+)/i);
    if (fullMatch && fullMatch[1]) {
      location = fullMatch[1].replace(/-\s*Cuit\s*Online.*/i, '').replace(/\s*-\s*$/, '').trim();
    }
  }

  // Pattern 2: Scan ALL snippets for address & localidad
  const snippetRegex = /class=["']result__snippet["'][^>]*>([\s\S]*?)<\/a>/gi;
  let snippetMatch;
  while ((snippetMatch = snippetRegex.exec(html)) !== null) {
    const clean = snippetMatch[1].replace(/<[^>]+>/g, '').trim();

    if (!name) {
      const nameFromSnippet = clean.match(/^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .',-]{2,60})\s+CUIT/i);
      if (nameFromSnippet) {
        name = nameFromSnippet[1].trim();
      }
    }

    if (!address) {
      const addrMatch = clean.match(/Persona\s+(?:F[ií]sica|Jur[ií]dica)(?:\s*\([^)]*\))?\s+(.+?)\s+Localidad:/i);
      if (addrMatch && addrMatch[1]) {
        address = addrMatch[1].trim();
      }
    }

    if (!location) {
      const locMatch = clean.match(/Localidad:\s*([A-Za-záéíóúñÁÉÍÓÚÑ .]+?)(?:\s+(?:Ganancias|Fecha|IVA|No Inscripto|Monotributo)|$)/i);
      if (locMatch && locMatch[1]) {
        location = locMatch[1].trim();
      }
    }

    if (!condicionIva) {
      if (clean.includes('Monotributo')) condicionIva = 'Monotributo';
      else if (clean.includes('IVA Exento') || clean.includes('Exento')) condicionIva = 'Exento';
      else if (clean.includes('Responsable Inscripto')) condicionIva = 'Responsable Inscripto';
    }
  }

  // Pattern 3: From URL slug if no other name found
  if (!name && detailSlug) {
    name = detailSlug.replace(/-/g, ' ').trim();
  }

  return {
    name: name ? name.toUpperCase().replace(/\s+/g, ' ').trim() : '',
    address: address ? address.toUpperCase() : '',
    location: location || '',
    condicionIva: condicionIva || '',
    detailSlug
  };
};

const fetchHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'max-age=0',
  'Sec-Ch-Ua': '"Chromium";v="126", "Not(A:Brand";v="24", "Google Chrome";v="126"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1'
};

/**
 * Fetch con timeout y manejo de errores
 */
const fetchWithTimeout = async (url, timeoutMs = 6000, extraHeaders = {}) => {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { ...fetchHeaders, ...extraHeaders },
      signal: controller.signal,
      redirect: 'follow'
    });
    clearTimeout(tid);
    return res;
  } catch (err) {
    clearTimeout(tid);
    throw err;
  }
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
  let detailSlug = '';

  // ═══════════════════════════════════════════════════════════════
  // STRATEGY 1: CuitOnline SEARCH page (direct)
  // ═══════════════════════════════════════════════════════════════
  try {
    const searchUrl = `https://www.cuitonline.com/search.php?q=${cleanCuit}`;
    console.log('[cuitPadron] Strategy 1: CuitOnline search →', searchUrl);
    
    const response = await fetchWithTimeout(searchUrl, 6000);

    if (response.ok) {
      const searchHtml = await response.text();
      console.log('[cuitPadron] Search HTML length:', searchHtml.length);
      
      // Only process if we got real HTML (not a Cloudflare challenge)
      if (searchHtml.length > 2000 && !searchHtml.includes('cf-browser-verification') && !searchHtml.includes('cf-challenge')) {
        
        // Extract the detail slug FIRST (for later use)
        detailSlug = extractDetailSlug(searchHtml, cleanCuit);
        console.log('[cuitPadron] Detail slug found:', detailSlug || '(none)');

        const parsed = parsePadronHtml(searchHtml, cleanCuit);
        if (parsed && parsed.name) {
          finalName = parsed.name;
          finalLocation = parsed.location || finalLocation;
          finalCondicionIva = parsed.condicionIva || finalCondicionIva;
          console.log('[cuitPadron] Strategy 1 got name:', finalName);
        }
      }
    }
  } catch (err) {
    console.warn('[cuitPadron] Strategy 1 (CuitOnline search) failed:', err.message);
  }

  // ═══════════════════════════════════════════════════════════════
  // STRATEGY 2: CuitOnline DETAIL page (has address + full info)
  // ═══════════════════════════════════════════════════════════════
  if (detailSlug) {
    try {
      const detailUrl = `https://www.cuitonline.com/detalle/${cleanCuit}/${detailSlug}.html`;
      console.log('[cuitPadron] Strategy 2: CuitOnline detail →', detailUrl);
      
      const detailRes = await fetchWithTimeout(detailUrl, 6000);
      
      if (detailRes.ok) {
        const detailHtml = await detailRes.text();
        console.log('[cuitPadron] Detail HTML length:', detailHtml.length);
        
        if (detailHtml.length > 2000 && !detailHtml.includes('cf-browser-verification')) {
          const dp = parsePadronHtml(detailHtml, cleanCuit);
          if (dp) {
            finalName = dp.name || finalName;
            finalAddress = dp.address || finalAddress;
            finalLocation = dp.location || finalLocation;
            finalCondicionIva = dp.condicionIva || finalCondicionIva;
            console.log('[cuitPadron] Strategy 2 got:', { name: dp.name, address: dp.address, location: dp.location });
          }
        }
      }
    } catch (e) {
      console.warn('[cuitPadron] Strategy 2 (CuitOnline detail) failed:', e.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STRATEGY 3: DuckDuckGo HTML search (works from datacenter IPs)
  // ═══════════════════════════════════════════════════════════════
  if (!finalName) {
    try {
      const ddgUrl = `https://html.duckduckgo.com/html/?q=cuit+${cleanCuit}+cuitonline`;
      console.log('[cuitPadron] Strategy 3: DuckDuckGo →', ddgUrl);
      
      const ddgRes = await fetchWithTimeout(ddgUrl, 6000, {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0'
      });

      if (ddgRes.ok) {
        const ddgHtml = await ddgRes.text();
        const ddgParsed = parseDuckDuckGoHtml(ddgHtml, cleanCuit);
        if (ddgParsed && ddgParsed.name) {
          finalName = ddgParsed.name;
          finalAddress = ddgParsed.address || finalAddress;
          finalLocation = ddgParsed.location || finalLocation;
          if (ddgParsed.condicionIva) finalCondicionIva = ddgParsed.condicionIva;
          detailSlug = ddgParsed.detailSlug || detailSlug;
          console.log('[cuitPadron] Strategy 3 got name:', finalName);
        }
      }
    } catch (err) {
      console.warn('[cuitPadron] Strategy 3 (DuckDuckGo) failed:', err.message);
    }

    // If DDG gave us a slug but no detail was fetched yet, try it
    if (detailSlug && !finalAddress) {
      try {
        const detailUrl = `https://www.cuitonline.com/detalle/${cleanCuit}/${detailSlug}.html`;
        console.log('[cuitPadron] Strategy 3b: CuitOnline detail from DDG slug →', detailUrl);
        
        const detailRes = await fetchWithTimeout(detailUrl, 5000);
        if (detailRes.ok) {
          const detailHtml = await detailRes.text();
          if (detailHtml.length > 2000 && !detailHtml.includes('cf-browser-verification')) {
            const dp = parsePadronHtml(detailHtml, cleanCuit);
            if (dp) {
              finalName = dp.name || finalName;
              finalAddress = dp.address || finalAddress;
              finalLocation = dp.location || finalLocation;
              finalCondicionIva = dp.condicionIva || finalCondicionIva;
            }
          }
        }
      } catch (e) {
        console.warn('[cuitPadron] Strategy 3b (CuitOnline detail from DDG) failed:', e.message);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STRATEGY 4: DDG search for domicilio specifically
  // ═══════════════════════════════════════════════════════════════
  if (!finalAddress && finalName) {
    try {
      const ddgDomUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(finalName)}+${cleanCuit}+domicilio`;
      console.log('[cuitPadron] Strategy 4: DDG domicilio →', ddgDomUrl);
      
      const ddgDomRes = await fetchWithTimeout(ddgDomUrl, 5000, {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0'
      });
      
      if (ddgDomRes.ok) {
        const ddgDomHtml = await ddgDomRes.text();
        const domSnippet = ddgDomHtml.match(
          /(?:domicilio|direcci[oó]n|dom\.?)\s*(?:fiscal)?[:\s]+([A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9a-záéíóúñ .,\-\d]{5,80})/i
        );
        if (domSnippet && domSnippet[1]) {
          finalAddress = domSnippet[1].trim().toUpperCase();
          console.log('[cuitPadron] Strategy 4 got address:', finalAddress);
        }
      }
    } catch (e) {
      console.warn('[cuitPadron] Strategy 4 (DDG domicilio) failed:', e.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STRATEGY 5: Bing search (additional fallback for name)
  // ═══════════════════════════════════════════════════════════════
  if (!finalName) {
    try {
      const bingUrl = `https://www.bing.com/search?q=cuit+${cleanCuit}+cuitonline`;
      console.log('[cuitPadron] Strategy 5: Bing →', bingUrl);
      
      const bingRes = await fetchWithTimeout(bingUrl, 5000, {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0'
      });

      if (bingRes.ok) {
        const bingHtml = await bingRes.text();
        const bingMatch = bingHtml.match(
          new RegExp(`([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .'-]{2,60})\\s*\\(\\s*\\d{2}-\\d{8}-\\d\\s*\\)`, 'i')
        ) || bingHtml.match(
          new RegExp(`([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .'-]{2,60})\\s*(?:CUIT|cuit)\\s*:?\\s*${cleanCuit}`, 'i')
        );
        if (bingMatch && bingMatch[1]) {
          finalName = bingMatch[1].trim().toUpperCase();
          console.log('[cuitPadron] Strategy 5 got name:', finalName);
        }
      }
    } catch (err) {
      console.warn('[cuitPadron] Strategy 5 (Bing) failed:', err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // BUILD RESPONSE
  // ═══════════════════════════════════════════════════════════════
  console.log('[cuitPadron] Final result:', { name: finalName, address: finalAddress, location: finalLocation, condicionIva: finalCondicionIva });

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
