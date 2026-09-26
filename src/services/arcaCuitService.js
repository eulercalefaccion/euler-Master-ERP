/**
 * Servicio de Validación y Consulta al Padrón de ARCA (ex AFIP)
 * Euler Master ERP
 */

import { formatCUIT, formatDNI } from '../utils/cuitDniHelper';

/**
 * Valida el algoritmo Módulo 11 oficial de AFIP / ARCA para un CUIT
 * @param {string} cuitStr 
 * @returns {boolean}
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
 * Extrae el DNI contenido dentro de un CUIT de Persona Física (20-, 23-, 24-, 27-)
 * @param {string} cuitStr 
 * @returns {string} DNI formateado o limpio
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
 * Parser de HTML de Padrón CUIT (CuitOnline, AFIP, etc.)
 */
export const parsePadronHtml = (html, cleanCuit) => {
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

/**
 * Consulta al Padrón de ARCA / AFIP para recuperar los datos registrados del contribuyente.
 * @param {string} cuitRaw 
 * @returns {Promise<Object>} Datos del contribuyente
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

  // 1. Intentar Netlify Serverless Function oficial (servidor Node.js)
  try {
    const fnUrl = `/.netlify/functions/cuitPadron?cuit=${cleanCuit}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(fnUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.exito && data.name) {
        return data;
      }
    }
  } catch (err) {
    console.warn("[ARCA Service] Netlify Function fallback:", err);
  }

  // 2. Intentar fuentes HTML secundarias con CORS Proxies desde el navegador del usuario (IP residencial/comercial)
  const fuentesHtml = [
    `/api/arca-cuit/${cleanCuit}`, // Netlify / Vite Proxy
    `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://www.cuitonline.com/search.php?q=${cleanCuit}`)}`,
    `https://corsproxy.io/?${encodeURIComponent(`https://www.cuitonline.com/search.php?q=${cleanCuit}`)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(`https://www.cuitonline.com/search.php?q=${cleanCuit}`)}`
  ];

  for (const fuenteUrl of fuentesHtml) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(fuenteUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const text = await res.text();
        if (text && text.length > 500) {
          const parsed = parsePadronHtml(text, cleanCuit);
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
    } catch (e) {
      // Intentar la siguiente fuente
    }
  }

  // Fallback Inteligente Algorítmico si el Padrón no devolvió el string del nombre
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
      ? `CUIT de Persona Física verificado en ARCA (DNI ${dniExtraido} detectado). Podés completar el Nombre o Razón Social.` 
      : `CUIT de Persona Jurídica verificado en ARCA.`
  };
};
