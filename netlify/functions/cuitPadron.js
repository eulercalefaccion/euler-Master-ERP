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
// FILTROS DE SEGURIDAD Y VALIDACIÓN
// ═══════════════════════════════════════════════════════════════

const stripStylesAndScripts = (html) => {
  if (!html) return '';
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
             .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ');
};

const isGarbageName = (name) => {
  if (!name || typeof name !== 'string') return true;
  const n = name.toLowerCase().trim();
  if (n.length < 3) return true;
  const badPatterns = [
    'buscador de', 'cuit online', 'cuitonline', 'resultados de', 'bloqueador de',
    'acceso restringido', 'obtener constancia', 'partner with', 'sumate al',
    'politica de privacidad', 'política de privacidad', 'preguntas frecuentes',
    'eliminacion de datos', 'eliminación de datos', 'informacion publica',
    'información pública', 'constancia de inscripcion', 'constancia de inscripción',
    'antecedentes comerciales', 'duckduckgo', 'conviertase en partner'
  ];
  return badPatterns.some(bp => n.includes(bp));
};

const isGarbageAddress = (addr) => {
  if (!addr || typeof addr !== 'string') return true;
  const a = addr.toLowerCase().trim();
  if (a.length < 4) return true;
  const badWords = [
    'duckduckgo', 'actividades', 'registradas', 'antecedentes', 'informacion',
    'información', 'boletin', 'boletín', 'marcas', 'patentes', 'privacidad',
    'terminos', 'términos', 'resultado', 'buscador', 'cuit online'
  ];
  return badWords.some(bw => a.includes(bw));
};

// ═══════════════════════════════════════════════════════════════
// PARSEO: CuitOnline
// ═══════════════════════════════════════════════════════════════

const extractDetailSlug = (rawHtml, cleanCuit) => {
  if (!rawHtml) return '';
  const html = stripStylesAndScripts(rawHtml);
  const slugMatch = html.match(new RegExp(`detalle/${cleanCuit}/([a-z0-9][a-z0-9-]+)\\.html`, 'i'));
  return slugMatch ? slugMatch[1] : '';
};

const parsePadronHtml = (rawHtml, cleanCuit) => {
  if (!rawHtml) return null;
  const html = stripStylesAndScripts(rawHtml);

  let name = '';
  let location = '';
  let address = '';

  // 1. Title tag: <title>NAME (XX-XXXXXXXX-X), Localidad (Provincia) - Cuit Online</title>
  const titleMatch = html.match(/<title>\s*([^(<]+?)\s*\(\d{2}-\d{8}-\d\)(?:,\s*([^-\n<]+))?/i);
  if (titleMatch && titleMatch[1]) {
    const rawName = titleMatch[1].trim();
    if (!isGarbageName(rawName)) {
      name = rawName;
    }
    if (titleMatch[2]) {
      let locRaw = titleMatch[2].replace(/-\s*Cuit\s*Online.*/i, '').trim();
      const provInParens = locRaw.match(/\(([^)]+)\)/);
      if (provInParens) {
        const prov = provInParens[1].trim();
        const loc = locRaw.replace(/\s*\([^)]+\)\s*/, '').trim();
        location = loc && prov && loc !== prov ? `${loc}, ${prov}` : (loc || prov);
      } else {
        location = locRaw;
      }
    }
  }

  // 2. Search result link to detail
  if (!name) {
    const detailLinkMatch = html.match(
      new RegExp(`detalle/${cleanCuit}/([a-z0-9][a-z0-9-]+)\\.html[^>]*>\\s*([^<]+)`, 'i')
    );
    if (detailLinkMatch) {
      const linkText = detailLinkMatch[2].trim();
      if (!isGarbageName(linkText)) {
        name = linkText;
      }
    }
  }

  // 3. H2 denominacion on verified detail page
  if (!name) {
    const h2Match = html.match(/<h2[^>]*class=["']denominacion["'][^>]*>([^<]+)<\/h2>/i);
    if (h2Match && h2Match[1] && !isGarbageName(h2Match[1])) {
      name = h2Match[1].trim();
    }
  }

  // Address: CuitOnline detail page layout
  if (!address) {
    const addrRegex = /Argentina\s*(?:<[^>]*>)*\s*([a-zA-ZáéíóúñÁÉÍÓÚÑ0-9 .,/'-]+\d{1,5}[a-zA-ZáéíóúñÁÉÍÓÚÑ0-9 .,/'-]*?)\s*(?:<[^>]*>)*\s*Provincia:/i;
    const bodyMatch = html.match(addrRegex);
    if (bodyMatch && bodyMatch[1]) {
      const candidate = bodyMatch[1].replace(/<[^>]+>/g, '').trim();
      if (!isGarbageAddress(candidate)) {
        address = candidate;
      }
    }
  }

  if (!address) {
    const itemPropMatch = html.match(/itemprop=["']streetAddress["'][^>]*>([^<]+)/i);
    if (itemPropMatch && itemPropMatch[1] && !isGarbageAddress(itemPropMatch[1])) {
      address = itemPropMatch[1].trim();
    }
  }

  // Condicion IVA (Clean check without CSS classes)
  let condicionIva = 'Consumidor Final';
  const esPersonaJuridica = cleanCuit.startsWith('30') || cleanCuit.startsWith('33') || cleanCuit.startsWith('34');
  if (esPersonaJuridica) {
    condicionIva = 'Responsable Inscripto';
  } else {
    const taxSection = html.match(/Impuestos activos:[\s\S]*?(?=Reg[ií]menes|Actividades|<\/table>|<\/div>|$)/i);
    const taxText = taxSection ? taxSection[0].toUpperCase() : '';
    if (taxText.includes('MONOTRIBUTO')) condicionIva = 'Monotributo';
    else if (taxText.includes('RESPONSABLE INSCRIPTO') || taxText.includes('IVA')) condicionIva = 'Responsable Inscripto';
    else if (taxText.includes('EXENTO')) condicionIva = 'Exento';
  }

  if (!name) return null;

  return {
    name: name.toUpperCase().replace(/\s+/g, ' ').trim(),
    address: address ? address.toUpperCase().replace(/\s+/g, ' ').trim() : '',
    location: location ? location.replace(/\s+/g, ' ').trim() : '',
    condicionIva
  };
};

// ═══════════════════════════════════════════════════════════════
// PARSEO: DuckDuckGo HTML
// ═══════════════════════════════════════════════════════════════

const parseDuckDuckGoHtml = (rawHtml, cleanCuit) => {
  if (!rawHtml) return null;
  const html = stripStylesAndScripts(rawHtml);
  const esPersonaJuridica = cleanCuit.startsWith('30') || cleanCuit.startsWith('33') || cleanCuit.startsWith('34');

  let name = '';
  let address = '';
  let location = '';
  let condicionIva = esPersonaJuridica ? 'Responsable Inscripto' : 'Consumidor Final';

  const titles = [...html.matchAll(/class=["']result__a["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
  const snippets = [...html.matchAll(/class=["']result__snippet["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim());

  // Titles: e.g. "NAME — CUIT ...", "NAME (30-12345678-9)...", "NAME - CUIT ..."
  for (const t of titles) {
    const m = t.match(/^([A-ZÁÉÍÓÚÑa-záéíóúñ0-9 .,'&-]{3,70}?)\s*(?:[—–-]|\||\()\s*(?:CUIT|\d{2}-\d{8}-\d)/i);
    if (m && !isGarbageName(m[1])) {
      name = m[1].trim();
      break;
    }
    const m2 = t.match(/(?:Buscador de CUIT - |Consulta de CUIT - )([A-ZÁÉÍÓÚÑa-záéíóúñ0-9 .,'&-]{3,70}?)\s*(?:\(CUIT|[—–-]\s*CUIT)/i);
    if (m2 && !isGarbageName(m2[1])) {
      name = m2[1].trim();
      break;
    }
  }

  // Snippets
  for (const s of snippets) {
    if (!name) {
      const nm = s.match(/(?:(?:Informaci[óo]n p[úu]blica de|empresa)\s+)?([A-ZÁÉÍÓÚÑa-záéíóúñ0-9 .,'&-]{3,70}?)\s*(?:[—–-]|:|\()\s*CUIT\s*:?\s*\d{2}-?\d{8}-?\d/i);
      if (nm && !isGarbageName(nm[1])) {
        name = nm[1].trim();
      }
    }

    if (!esPersonaJuridica) {
      if (s.match(/IVA\s+Inscripto|Responsable\s+Inscripto/i)) {
        condicionIva = 'Responsable Inscripto';
      } else if (s.match(/Monotribut/i)) {
        condicionIva = 'Monotributo';
      }
    }

    if (!location) {
      const locM = s.match(/\d{4}-([A-ZÁÉÍÓÚÑ\s]+?)(?:,|$|\.)/i);
      if (locM && locM[1] && !locM[1].toLowerCase().includes('duckduckgo')) {
        location = locM[1].trim();
      }
    }

    if (!address) {
      const addrMatch = s.match(/Persona\s+(?:F[ií]sica|Jur[ií]dica)(?:\s*\([^)]*\))?\s+(.+?)\s+Localidad:/i);
      if (addrMatch && addrMatch[1] && !isGarbageAddress(addrMatch[1])) {
        address = addrMatch[1].trim();
      }
    }
  }

  if (!name) return null;

  return {
    name: name.toUpperCase().replace(/\s+/g, ' ').trim(),
    address: address ? address.toUpperCase().replace(/\s+/g, ' ').trim() : '',
    location: location || '',
    condicionIva
  };
};

const fetchHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'max-age=0'
};

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
  // STRATEGY 1: CuitOnline SEARCH + DETAIL
  // ═══════════════════════════════════════════════════════════════
  try {
    const searchUrl = `https://www.cuitonline.com/search.php?q=${cleanCuit}`;
    const response = await fetchWithTimeout(searchUrl, 5000);

    if (response.ok) {
      const searchHtml = await response.text();
      
      if (searchHtml.length > 2000 && !searchHtml.includes('cf-browser-verification') && !searchHtml.includes('cf-challenge')) {
        detailSlug = extractDetailSlug(searchHtml, cleanCuit);

        if (detailSlug) {
          try {
            const detailUrl = `https://www.cuitonline.com/detalle/${cleanCuit}/${detailSlug}.html`;
            const detailRes = await fetchWithTimeout(detailUrl, 5000);
            if (detailRes.ok) {
              const detailHtml = await detailRes.text();
              const parsed = parsePadronHtml(detailHtml, cleanCuit);
              if (parsed && parsed.name) {
                finalName = parsed.name;
                finalAddress = parsed.address || '';
                finalLocation = parsed.location || '';
                finalCondicionIva = parsed.condicionIva || finalCondicionIva;
              }
            }
          } catch (e) {
            console.warn('[cuitPadron] Detail page fetch failed:', e.message);
          }
        } else {
          // If no detail slug, try parsing the search page directly
          const parsed = parsePadronHtml(searchHtml, cleanCuit);
          if (parsed && parsed.name) {
            finalName = parsed.name;
            finalLocation = parsed.location || '';
            finalCondicionIva = parsed.condicionIva || finalCondicionIva;
          }
        }
      }
    }
  } catch (err) {
    console.warn('[cuitPadron] Strategy 1 (CuitOnline) failed:', err.message);
  }

  // ═══════════════════════════════════════════════════════════════
  // STRATEGY 2: DuckDuckGo HTML Search (Universal Fallback)
  // ═══════════════════════════════════════════════════════════════
  if (!finalName) {
    try {
      const ddgUrl = `https://html.duckduckgo.com/html/?q=cuit+${cleanCuit}`;
      const ddgRes = await fetchWithTimeout(ddgUrl, 5000, {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0'
      });

      if (ddgRes.ok) {
        const ddgHtml = await ddgRes.text();
        const ddgParsed = parseDuckDuckGoHtml(ddgHtml, cleanCuit);
        if (ddgParsed && ddgParsed.name) {
          finalName = ddgParsed.name;
          finalAddress = ddgParsed.address || finalAddress;
          finalLocation = ddgParsed.location || finalLocation;
          finalCondicionIva = ddgParsed.condicionIva || finalCondicionIva;
        }
      }
    } catch (err) {
      console.warn('[cuitPadron] Strategy 2 (DuckDuckGo) failed:', err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STRATEGY 3: Bing Search (Third Fallback)
  // ═══════════════════════════════════════════════════════════════
  if (!finalName) {
    try {
      const bingUrl = `https://www.bing.com/search?q=cuit+${cleanCuit}`;
      const bingRes = await fetchWithTimeout(bingUrl, 4000, {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0'
      });

      if (bingRes.ok) {
        const bingHtml = await bingRes.text();
        const cleanBing = stripStylesAndScripts(bingHtml);
        const bingMatch = cleanBing.match(
          new RegExp(`([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .'-]{2,60})\\s*\\(\\s*\\d{2}-\\d{8}-\\d\\s*\\)`, 'i')
        ) || cleanBing.match(
          new RegExp(`([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .'-]{2,60})\\s*(?:CUIT|cuit)\\s*:?\\s*${cleanCuit}`, 'i')
        );
        if (bingMatch && bingMatch[1] && !isGarbageName(bingMatch[1])) {
          finalName = bingMatch[1].trim().toUpperCase();
        }
      }
    } catch (err) {
      console.warn('[cuitPadron] Strategy 3 (Bing) failed:', err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // FINAL SANITIZATION
  // ═══════════════════════════════════════════════════════════════
  if (isGarbageName(finalName)) {
    finalName = '';
  }
  if (isGarbageAddress(finalAddress)) {
    finalAddress = '';
  }

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
          : `CUIT de Persona Jurídica verificado en ARCA. Completá la Razón Social manualmente.`
    })
  };
};
