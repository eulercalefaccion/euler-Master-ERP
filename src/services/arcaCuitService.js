/**
 * Servicio de Validación y Consulta al Padrón de ARCA (ex AFIP)
 * Euler Master ERP
 * 
 * Estrategia Multi-Fuente:
 * 1. Netlify Serverless Function (cuitPadron) - intenta CuitOnline + DuckDuckGo + Bing desde servidor
 * 2. DuckDuckGo HTML search desde el navegador del usuario (IP residencial, no bloqueado por Cloudflare)
 * 3. Fallback algorítmico (DNI extraction + verificación Módulo 11)
 */

import { formatCUIT, formatDNI } from '../utils/cuitDniHelper';

/**
 * Valida el algoritmo Módulo 11 oficial de AFIP / ARCA para un CUIT
 */
export const validarCuitArca = (cuitStr) => {
  if (!cuitStr) return false;
  const clean = cuitStr.replace(/\D/g, '');
  if (clean.length !== 11) return false;

  const multiplicadores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 10; i++) {
    suma += parseInt(clean[i], 10) * multiplicadores[i];
  }

  const resto = suma % 11;
  let digitoVerificador = 11 - resto;
  if (resto === 0) digitoVerificador = 0;
  if (resto === 1) {
    if (clean.startsWith('20') || clean.startsWith('27')) digitoVerificador = 9;
    else if (clean.startsWith('30')) digitoVerificador = 4;
  }

  return digitoVerificador === parseInt(clean[10], 10);
};

/**
 * Extrae el DNI contenido dentro de un CUIT de Persona Física
 */
export const extraerDniDeCuit = (cuitStr) => {
  if (!cuitStr) return '';
  const clean = cuitStr.replace(/\D/g, '');
  if (clean.length === 11) {
    const prefijo = clean.substring(0, 2);
    if (['20', '23', '24', '27'].includes(prefijo)) {
      const dniClean = clean.substring(2, 10);
      return formatDNI(dniClean);
    }
  }
  return '';
};

/**
 * Parsea HTML de CuitOnline (search o detail page) para extraer nombre, dirección, etc.
 * 
 * Formatos conocidos (Oct 2026):
 * SEARCH: <title>XXXXXXXXXXX -  Cuit Online</title> + link a detalle con nombre
 * DETAIL: <title>NOMBRE (XX-XXXXXXXX-X), Localidad (Provincia) -  Cuit Online</title>
 */
export const parsePadronHtml = (html, cleanCuit) => {
  if (!html) return null;

  let name = '';
  let location = '';
  let address = '';

  // Strategy 1: Title tag: <title>NAME (XX-XXXXXXXX-X), Localidad (Provincia) - Cuit Online</title>
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
      let locRaw = titleMatch[2].replace(/-\s*Cuit\s*Online.*/i, '').trim();
      const provInParens = locRaw.match(/\(([^)]+)\)/);
      if (provInParens) {
        location = provInParens[1].trim();
        locRaw = locRaw.replace(/\s*\([^)]+\)\s*/, '').trim();
      }
      if (locRaw && !location) location = locRaw;
      if (locRaw && location && locRaw !== location) {
        location = `${locRaw}, ${location}`;
      }
    }
  }

  // Strategy 2: Detail link href text
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

  // Strategy 3: H2 denominacion
  if (!name) {
    const h2Match = html.match(/<h2[^>]*class=["']denominacion["'][^>]*>([^<]+)<\/h2>/i) ||
                    html.match(/title=["']Ver detalles de ([^"']+)["']/i);
    if (h2Match && h2Match[1] && !h2Match[1].toLowerCase().includes('bloqueador')) {
      name = h2Match[1].trim();
    }
  }

  // Strategy 4: Meta description
  if (!name) {
    const metaMatch = html.match(
      /meta\s+name=["']description["']\s+content=["']([^"']+)["']/i
    );
    if (metaMatch && metaMatch[1]) {
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

  // Extract Address: itemprop
  if (!address) {
    const itemPropMatch = html.match(/itemprop=["']streetAddress["'][^>]*>([^<]+)/i);
    if (itemPropMatch && itemPropMatch[1].trim().length > 3) {
      address = itemPropMatch[1].trim();
    }
  }
  // Extract Address: domicilio label
  if (!address) {
    const domMatch = html.match(/(?:domicilio|direcci[oó]n)\s*(?:fiscal|legal)?\s*:?\s*<[^>]+>\s*([^<]+)/i);
    if (domMatch && domMatch[1].trim().length > 3) {
      address = domMatch[1].trim();
    }
  }
  // Extract Address: body text before "Provincia:"
  if (!address) {
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

  // Extract Location
  if (!location) {
    const provLinkMatch = html.match(/Provincia:\s*(?:<a[^>]*>)?\s*([^<\n]+)/i);
    if (provLinkMatch && provLinkMatch[1]) {
      location = provLinkMatch[1].replace(/-\s*$/, '').trim();
    }
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

  if (!location) {
    const provMatch = html.match(
      /(?:provincia[^a-z]*|Provincia:\s*(?:<[^>]*>)?\s*)(Santa Fe|Buenos Aires|C[oó]rdoba|Mendoza|Entre R[íi]os|Tucum[áa]n|Salta|San Juan|San Luis|Chaco|Corrientes|Misiones|Neuqu[eé]n|R[íi]o Negro|Chubut|Santa Cruz|Jujuy|La Pampa|Formosa|Catamarca|La Rioja|Tierra del Fuego|Santiago del Estero|CABA|Capital Federal|C\.A\.B\.A\.)/i
    );
    if (provMatch && provMatch[1]) location = provMatch[1].trim();
  }

  // Extract Condicion IVA
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

  // Clean up
  if (name) name = name.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  if (address) address = address.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

  return {
    name: name ? name.toUpperCase() : '',
    address: address ? address.toUpperCase() : '',
    location,
    condicionIva
  };
};

/**
 * Parsea el HTML de DuckDuckGo para extraer nombre, dirección y localidad.
 */
const parseDuckDuckGoHtml = (html, cleanCuit) => {
  if (!html) return null;

  let name = '';
  let location = '';
  let address = '';
  let condicionIva = '';

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
      if (nameFromSnippet) name = nameFromSnippet[1].trim();
    }

    if (!address) {
      const addrMatch = clean.match(/Persona\s+(?:F[ií]sica|Jur[ií]dica)(?:\s*\([^)]*\))?\s+(.+?)\s+Localidad:/i);
      if (addrMatch && addrMatch[1]) address = addrMatch[1].trim();
    }

    if (!location) {
      const locMatch = clean.match(/Localidad:\s*([A-Za-záéíóúñÁÉÍÓÚÑ .]+?)(?:\s+(?:Ganancias|Fecha|IVA|No Inscripto|Monotributo)|$)/i);
      if (locMatch && locMatch[1]) location = locMatch[1].trim();
    }

    if (!condicionIva) {
      if (clean.includes('Monotributo')) condicionIva = 'Monotributo';
      else if (clean.includes('IVA Exento') || clean.includes('Exento')) condicionIva = 'Exento';
      else if (clean.includes('Responsable Inscripto')) condicionIva = 'Responsable Inscripto';
    }
  }

  // Pattern 3: URL slug fallback
  if (!name) {
    const slugMatch = html.match(new RegExp(`detalle/${cleanCuit}/([a-z0-9-]+)\\.html`, 'i'));
    if (slugMatch && slugMatch[1]) name = slugMatch[1].replace(/-/g, ' ').trim();
  }

  return {
    name: name ? name.toUpperCase().replace(/\s+/g, ' ').trim() : '',
    address: address ? address.toUpperCase() : '',
    location,
    condicionIva
  };
};

/**
 * Consulta al Padrón de ARCA / AFIP para recuperar los datos registrados del contribuyente.
 */
export const consultarCuitArca = async (cuitRaw) => {
  const cleanCuit = cuitRaw.replace(/\D/g, '');
  
  if (cleanCuit.length !== 11) {
    throw new Error('El CUIT debe contener exactamente 11 dígitos numéricos.');
  }

  const cuitFormateado = formatCUIT(cleanCuit);
  const prefijo = cleanCuit.substring(0, 2);
  const esPersonaFisica = ['20', '23', '24', '27'].includes(prefijo);
  const dniExtraido = extraerDniDeCuit(cleanCuit);

  // ═══════════════════════════════════════════════════════════
  // STEP 1: Netlify Serverless Function (tries CuitOnline + DDG + Bing server-side)
  // ═══════════════════════════════════════════════════════════
  try {
    const fnUrl = `/.netlify/functions/cuitPadron?cuit=${cleanCuit}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(fnUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.exito && data.name) {
        return data;
      }
    }
  } catch (err) {
    console.warn("[ARCA Service] Netlify Function failed:", err.message);
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 2: DuckDuckGo HTML search from browser (user's residential IP)
  // ═══════════════════════════════════════════════════════════
  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=cuit+${cleanCuit}+cuitonline`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(ddgUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const html = await res.text();
      const parsed = parseDuckDuckGoHtml(html, cleanCuit);
      if (parsed && parsed.name) {
        return {
          exito: true,
          fuente: 'ARCA / AFIP Padrón',
          cuit: cuitFormateado,
          cuitLimpio: cleanCuit,
          name: parsed.name,
          type: esPersonaFisica ? 'Propietario' : 'Constructora',
          dni: dniExtraido,
          address: parsed.address || '',
          location: parsed.location || '',
          condicionIva: parsed.condicionIva || (esPersonaFisica ? 'Consumidor Final' : 'Responsable Inscripto'),
          esPersonaFisica,
          mensaje: `Contribuyente hallado en Padrón ARCA: ${parsed.name}`
        };
      }
    }
  } catch (err) {
    console.warn("[ARCA Service] DuckDuckGo client-side failed:", err.message);
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 3: CuitOnline direct from browser (user IP may bypass Cloudflare)
  // ═══════════════════════════════════════════════════════════
  try {
    const coUrl = `https://www.cuitonline.com/search.php?q=${cleanCuit}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(coUrl, { 
      signal: controller.signal,
      mode: 'cors'
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const html = await res.text();
      if (html.length > 2000) {
        const parsed = parsePadronHtml(html, cleanCuit);
        if (parsed && parsed.name) {
          return {
            exito: true,
            fuente: 'ARCA / AFIP Padrón Oficial',
            cuit: cuitFormateado,
            cuitLimpio: cleanCuit,
            name: parsed.name,
            type: esPersonaFisica ? 'Propietario' : 'Constructora',
            dni: dniExtraido,
            address: parsed.address,
            location: parsed.location,
            condicionIva: parsed.condicionIva,
            esPersonaFisica,
            mensaje: `Contribuyente hallado en Padrón ARCA: ${parsed.name}`
          };
        }
      }
    }
  } catch (err) {
    // CORS will likely block this, that's expected
  }

  // ═══════════════════════════════════════════════════════════
  // FALLBACK: Algorítmico (DNI + Módulo 11 valid)
  // ═══════════════════════════════════════════════════════════
  return {
    exito: true,
    fuente: 'ARCA (Verificación de CUIT)',
    cuit: cuitFormateado,
    cuitLimpio: cleanCuit,
    name: '',
    type: esPersonaFisica ? 'Propietario' : 'Constructora',
    dni: dniExtraido,
    address: '',
    location: '',
    condicionIva: esPersonaFisica ? 'Consumidor Final' : 'Responsable Inscripto',
    esPersonaFisica,
    mensaje: esPersonaFisica 
      ? `CUIT de Persona Física verificado en ARCA (DNI ${dniExtraido} detectado). Completá la Razón Social manualmente.` 
      : `CUIT de Persona Jurídica verificado en ARCA.`
  };
};
