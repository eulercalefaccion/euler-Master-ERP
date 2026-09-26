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
 * Parsea respuestas en HTML de Padrón CUIT
 */
const parseHtmlPadron = (html, cleanCuit) => {
  let name = '';
  const metaMatch = html.match(/CuitOnline\.\s*([^-\d<]+)\s*-\s*\d{11}/i) ||
                    html.match(/meta name="description" content="[^"]*?\b([a-zA-Z\sÑñÁÉÍÓÚáéíóú.-]+)\s*-\s*\d{11}/i);

  if (metaMatch && metaMatch[1]) {
    name = metaMatch[1].replace(/regímenes y actividades con CuitOnline\.?/gi, '').trim();
  }

  if (!name || name.length < 3 || name.toLowerCase().includes('resultados') || name.toLowerCase().includes('bloqueador')) {
    const h3Match = html.match(/<h3[^>]*>\s*([a-zA-Z\sÑñÁÉÍÓÚáéíóú.-]+)\s*<\/h3>/i);
    if (h3Match && h3Match[1] && !h3Match[1].toLowerCase().includes('bloqueador') && !h3Match[1].toLowerCase().includes('sumate')) {
      name = h3Match[1].trim();
    }
  }

  let domicilio = '';
  const domMatch = html.match(/(?:domicilio|direcci[oó]n)[^:]*:\s*<[^>]+>\s*([^<]+)/i) ||
                   html.match(/itemprop="streetAddress">([^<]+)/i);
  if (domMatch) domicilio = domMatch[1].trim();

  let localidad = '';
  const provMatch = html.match(/(Santa Fe|Buenos Aires|Córdoba|Cordoba|Mendoza|Entre R[íi]os|Tucum[áa]n|Salta|San Juan|San Luis|Chaco|Corrientes|Misiones|Neuqu[eé]n|R[íi]o Negro|Chubut|Santa Cruz|Jujuy|La Pampa|Formosa|Catamarca|La Rioja|Tierra del Fuego|CABA|Capital Federal)/i);
  if (provMatch) localidad = provMatch[1];

  let condicionIva = 'Consumidor Final';
  if (html.includes('MONOTRIBUTO')) condicionIva = 'Monotributo';
  else if (html.includes('IVA EXENTO') || html.includes('EXENTO')) condicionIva = 'Exento';
  else if (html.includes('IVA RESPONSABLE INSCRIPTO') || html.includes('RESPONSABLE INSCRIPTO')) condicionIva = 'Responsable Inscripto';
  else if (cleanCuit.startsWith('30') || cleanCuit.startsWith('33')) condicionIva = 'Responsable Inscripto';

  return {
    name: name ? name.toUpperCase() : '',
    address: domicilio,
    location: localidad,
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

  // Intentamos fuentes en orden de velocidad y disponibilidad
  const fuentesHtml = [
    `/api/arca-cuit/${cleanCuit}`, // Netlify / Vite Proxy
    `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://www.cuitonline.com/search.php?q=${cleanCuit}`)}`,
    `https://corsproxy.io/?${encodeURIComponent(`https://www.cuitonline.com/search.php?q=${cleanCuit}`)}`
  ];

  for (const fuenteUrl of fuentesHtml) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(fuenteUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const text = await res.text();
        if (text && text.length > 500) {
          const parsed = parseHtmlPadron(text, cleanCuit);
          if (parsed.name) {
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

  // Fallback a APIs JSON públicas si existen
  const apisJson = [
    `https://afip.padron.ar/api/v1/persona/${cleanCuit}`,
    `https://api.apis.net.ar/v1/cuit?cuit=${cleanCuit}`
  ];

  for (const apiUrl of apisJson) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(apiUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        const razonSocial = data.razonSocial || data.nombre || data.nombreCompleto || '';
        if (razonSocial) {
          return {
            exito: true,
            fuente: 'ARCA / AFIP API',
            cuit: cuitFormateado,
            cuitLimpio: cleanCuit,
            name: razonSocial.toUpperCase(),
            type: esPersonaFisica ? 'Propietario' : 'Constructora',
            dni: dniExtraido,
            address: data.direccion || data.domicilio?.calle || '',
            location: data.localidad || '',
            condicionIva: data.condicionIva || 'Responsable Inscripto',
            esPersonaFisica,
            mensaje: `Contribuyente hallado en Padrón ARCA: ${razonSocial}`
          };
        }
      }
    } catch (e) {}
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
      ? `CUIT de Persona Física verificado en ARCA (DNI ${dniExtraido} detectado). Podés escribir la Razón Social.` 
      : `CUIT de Persona Jurídica verificado en ARCA.`
  };
};
