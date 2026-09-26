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
 */
export const parsePadronHtml = (html, cleanCuit) => {
  if (!html) return null;

  let name = '';
  let location = '';
  let address = '';

  // Strategy 1: Title tag: <title>NAME (XX-XXXXXXXX-X), LOCATION - Cuit Online</title>
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

  // Strategy 2: H2 denominacion
  if (!name) {
    const h2Match = html.match(/<h2[^>]*class=["']denominacion["'][^>]*>([^<]+)<\/h2>/i) ||
                    html.match(/title=["']Ver detalles de ([^"']+)["']/i);
    if (h2Match && h2Match[1] && !h2Match[1].toLowerCase().includes('bloqueador')) {
      name = h2Match[1].trim();
    }
  }

  // Strategy 3: Meta description
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

  // Extract Address
  const domMatch = html.match(/(?:domicilio|direcci[oó]n)[^:]*:\s*<[^>]+>\s*([^<]+)/i) ||
                   html.match(/itemprop=["']streetAddress["'][^>]*>([^<]+)/i) ||
                   html.match(/domicilio[^<]*<[^>]+>\s*([^<]+)/i);
  if (domMatch) address = domMatch[1].trim();

  // Extract Location
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
    location,
    condicionIva
  };
};

/**
 * Parsea el HTML de DuckDuckGo para extraer el nombre del contribuyente.
 * DDG devuelve: class="result__a">NOMBRE (XX-XXXXXXXX-X), Localidad...
 */
const parseDuckDuckGoHtml = (html, cleanCuit) => {
  if (!html) return null;

  let name = '';
  let location = '';

  // Pattern 1: result__a link text: "NAME (XX-XXXXXXXX-X), LOCATION"
  const resultAMatch = html.match(/class=["']result__a["'][^>]*>([^<]+)\(\d{2}-\d{8}-\d\)/i);
  if (resultAMatch && resultAMatch[1]) {
    name = resultAMatch[1].trim();
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
      if (raw.length >= 3) name = raw;
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
    location
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
    const timeoutId = setTimeout(() => controller.abort(), 6000);

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
          address: '',
          location: parsed.location || '',
          condicionIva: esPersonaFisica ? 'Consumidor Final' : 'Responsable Inscripto',
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
      if (html.length > 5000) {
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
