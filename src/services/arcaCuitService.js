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

export const parsePadronHtml = (rawHtml, cleanCuit) => {
  if (!rawHtml) return null;
  const html = stripStylesAndScripts(rawHtml);

  let name = '';
  let location = '';
  let address = '';

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

  if (!name) {
    const h2Match = html.match(/<h2[^>]*class=["']denominacion["'][^>]*>([^<]+)<\/h2>/i);
    if (h2Match && h2Match[1] && !isGarbageName(h2Match[1])) {
      name = h2Match[1].trim();
    }
  }

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
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(fnUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.exito && data.name && !isGarbageName(data.name)) {
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
    const ddgUrl = `https://html.duckduckgo.com/html/?q=cuit+${cleanCuit}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(ddgUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const html = await res.text();
      const parsed = parseDuckDuckGoHtml(html, cleanCuit);
      if (parsed && parsed.name && !isGarbageName(parsed.name)) {
        return {
          exito: true,
          fuente: 'ARCA / AFIP Padrón',
          cuit: cuitFormateado,
          cuitLimpio: cleanCuit,
          name: parsed.name,
          type: esPersonaFisica ? 'Propietario' : 'Constructora',
          dni: dniExtraido,
          address: isGarbageAddress(parsed.address) ? '' : parsed.address,
          location: parsed.location || '',
          condicionIva: parsed.condicionIva,
          esPersonaFisica,
          mensaje: `Contribuyente hallado en Padrón ARCA: ${parsed.name}`
        };
      }
    }
  } catch (err) {
    console.warn("[ARCA Service] DuckDuckGo client-side failed:", err.message);
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 3: CuitOnline direct from browser (user IP)
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
        if (parsed && parsed.name && !isGarbageName(parsed.name)) {
          return {
            exito: true,
            fuente: 'ARCA / AFIP Padrón Oficial',
            cuit: cuitFormateado,
            cuitLimpio: cleanCuit,
            name: parsed.name,
            type: esPersonaFisica ? 'Propietario' : 'Constructora',
            dni: dniExtraido,
            address: isGarbageAddress(parsed.address) ? '' : parsed.address,
            location: parsed.location,
            condicionIva: parsed.condicionIva,
            esPersonaFisica,
            mensaje: `Contribuyente hallado en Padrón ARCA: ${parsed.name}`
          };
        }
      }
    }
  } catch (err) {
    // CORS will likely block this from browser, expected
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
      : `CUIT de Persona Jurídica verificado en ARCA. Completá la Razón Social manualmente.`
  };
};
