import { db } from './firebaseConfig';
import { collection, addDoc } from 'firebase/firestore';

/**
 * Normaliza cadenas para comparación de texto
 */
export function normalizeText(str) {
  if (!str) return '';
  return str.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Categorías y palabras clave para auto-asignación inteligente
 */
export function sugerirCategoria(desc) {
  const norm = normalizeText(desc);
  if (/colector|armario|gabinete|caja colector/i.test(norm)) return 'Colectores / Piso radiante';
  if (/pe-rt|pe-xa|pex|rausola|raubasic tubo|piso radiante|rautherm/i.test(norm)) return 'Colectores / Piso radiante';
  if (/casquillo|pieza en t|tee|codo|acoplamiento|eurokonus|fitting|manguito/i.test(norm)) return 'Fitting PEX';
  if (/caldera|baxi|caldaia|demirdokum/i.test(norm)) return 'Calderas';
  if (/bomba|circulador|rowa|grundfos/i.test(norm)) return 'Bombas';
  if (/radiador|toallero|nereus/i.test(norm)) return 'Radiadores';
  if (/valvula|llave de corte|esfera|detentor|cabezal termostatico|termostato/i.test(norm)) return 'Válvulas y Conexiones';
  if (/regleta|nea hc|servomotor|modulo control/i.test(norm)) return 'Regulación y Control';
  if (/aislacion|tubex|espuma/i.test(norm)) return 'Aislación';
  return 'Materiales generales';
}

export function sugerirUnidad(desc) {
  const norm = normalizeText(desc);
  if (/\b(mts|metros|metro|rollo x \d+)\b/i.test(norm)) return 'metro';
  if (/\bm2|m²\b/i.test(norm)) return 'm2';
  if (/\bkg|kilos\b/i.test(norm)) return 'kg';
  return 'unidad';
}

const CATEGORY_KEYWORDS = [
  { key: 'casquillo', regex: /\bcasquillo\b/i },
  { key: 'tee', regex: /\b(te|tee|pieza en t)\b/i },
  { key: 'codo', regex: /\bcodo\b/i },
  { key: 'tubo', regex: /\b(tubo|pe-rt|pe-xa|pex|manguera)\b/i },
  { key: 'colector', regex: /\bcolector\b/i },
  { key: 'armario', regex: /\b(armario|gabinete|caja)\b/i },
  { key: 'valvula', regex: /\b(valvula|llave de corte)\b/i },
  { key: 'cabezal', regex: /\bcabezal\b/i },
  { key: 'regleta', regex: /\bregleta\b/i },
  { key: 'curva', regex: /\bcurva\b/i },
  { key: 'adaptador', regex: /\badaptador\b/i },
  { key: 'acoplamiento', regex: /\bacoplamiento\b/i },
];

function getCategoryKey(str) {
  for (const cat of CATEGORY_KEYWORDS) {
    if (cat.regex.test(str)) return cat.key;
  }
  return null;
}

function extractNumbers(str) {
  return (str.match(/\d+(?:[.,]\d+)?/g) || []).map(n => n.replace(',', '.'));
}

/**
 * Coteja un artículo detectado en la factura con el catálogo de Lista de Precios / Stock del ERP
 */
export function matchArticleWithCatalog(invoiceDesc, invoiceCode, catalog) {
  if (!catalog || catalog.length === 0) {
    return {
      status: 'NONE',
      score: 0,
      item: null,
      reason: 'Catálogo vacío o no disponible',
      suggestedNewItem: buildSuggestedItem(invoiceDesc, invoiceCode)
    };
  }

  const normInvoice = normalizeText(invoiceDesc);
  const invoiceCat = getCategoryKey(invoiceDesc);
  const invoiceNums = extractNumbers(invoiceDesc);
  const invoiceWords = normInvoice.split(' ').filter(w => w.length > 2);

  let bestMatch = null;
  let bestScore = 0;
  let bestMatchReason = '';

  for (const item of catalog) {
    const itemDesc = item.descripcion || '';
    const normItem = normalizeText(itemDesc);
    const itemCode = (item.codigoGesdatta || '').trim();

    // 1. Coincidencia directa por Código Oficial
    if (invoiceCode && itemCode && invoiceCode.trim().length > 3 && itemCode.length > 3) {
      if (invoiceCode.includes(itemCode) || itemCode.includes(invoiceCode)) {
        // Verificar si la descripción no es disparatada
        const itemCat = getCategoryKey(itemDesc);
        if (!invoiceCat || !itemCat || invoiceCat === itemCat) {
          return {
            status: 'EXACT',
            score: 1.0,
            item,
            reason: `Código ${itemCode} coincide en catálogo`,
            suggestedNewItem: null
          };
        } else {
          // Código coincide pero descripción es de otra familia
          return {
            status: 'SIMILAR',
            score: 0.75,
            item,
            reason: `Código similar (${itemCode}) pero descripciones difieren`,
            suggestedNewItem: buildSuggestedItem(invoiceDesc, invoiceCode)
          };
        }
      }
    }

    // 2. Coincidencia idéntica de texto
    if (normInvoice === normItem) {
      return {
        status: 'EXACT',
        score: 1.0,
        item,
        reason: 'Descripción exacta en catálogo',
        suggestedNewItem: null
      };
    }

    // 3. Regla de compatibilidad de familia de producto
    const itemCat = getCategoryKey(itemDesc);
    if (invoiceCat && itemCat && invoiceCat !== itemCat) {
      continue; // No mezclar codos con tes, ni tubos con casquillos
    }
    if (invoiceCat && !itemCat) {
      continue;
    }

    const itemWords = normItem.split(' ').filter(w => w.length > 2);
    const itemNums = extractNumbers(itemDesc);

    let commonWords = 0;
    for (const w of invoiceWords) {
      if (itemWords.includes(w)) commonWords++;
    }

    if (commonWords === 0) continue;

    const wordScore = (commonWords * 2) / (invoiceWords.length + itemWords.length);

    // Comparar dimensiones / números técnicos
    let numFactor = 1.0;
    let exactNums = false;
    if (invoiceNums.length > 0 && itemNums.length > 0) {
      const allFound = invoiceNums.every(n => itemNums.includes(n));
      const noneFound = !invoiceNums.some(n => itemNums.includes(n));

      if (noneFound) {
        numFactor = 0.25; // dimensiones incompatibles (ej 16mm vs 25mm)
      } else if (allFound && invoiceNums.length === itemNums.length) {
        numFactor = 1.4;
        exactNums = true;
      } else if (allFound) {
        numFactor = 1.15;
      } else {
        numFactor = 0.7;
      }
    }

    const score = wordScore * numFactor;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = { item, exactNums };
      bestMatchReason = exactNums ? 'Coincidencia de nombre y medidas' : 'Similitud de términos';
    }
  }

  if (!bestMatch) {
    return {
      status: 'NONE',
      score: 0,
      item: null,
      reason: 'No encontrado en catálogo',
      suggestedNewItem: buildSuggestedItem(invoiceDesc, invoiceCode)
    };
  }

  if (bestScore >= 0.85 && (invoiceNums.length === 0 || bestMatch.exactNums)) {
    return {
      status: 'EXACT',
      score: bestScore,
      item: bestMatch.item,
      reason: bestMatchReason || 'Alta coincidencia',
      suggestedNewItem: null
    };
  } else if (bestScore >= 0.35) {
    return {
      status: 'SIMILAR',
      score: bestScore,
      item: bestMatch.item,
      reason: bestMatchReason || 'Coincidencia parcial sugerida',
      suggestedNewItem: buildSuggestedItem(invoiceDesc, invoiceCode)
    };
  } else {
    return {
      status: 'NONE',
      score: bestScore,
      item: null,
      reason: 'No encontrado en catálogo',
      suggestedNewItem: buildSuggestedItem(invoiceDesc, invoiceCode)
    };
  }
}

function buildSuggestedItem(desc, code) {
  return {
    descripcion: desc,
    codigoGesdatta: code || '',
    categoria: sugerirCategoria(desc),
    unidad: sugerirUnidad(desc),
    tipo: 'material',
    markup: 1.35,
    activo: true
  };
}

/**
 * Guarda un artículo nuevo en la colección 'lista_precios'
 */
export async function crearArticuloEnERP(data, precioUnitarioARS = 0, tc = null) {
  const costoARS = Number(precioUnitarioARS) || 0;
  const markup = Number(data.markup) || 1.35;
  const tcValor = tc?.valor ? Number(tc.valor) : null;
  const costoUSD = tcValor && costoARS ? Math.round((costoARS / tcValor) * 100) / 100 : null;
  const precioVentaUSD = costoUSD ? Math.round((costoUSD * markup) * 100) / 100 : null;

  const payload = {
    descripcion: data.descripcion.trim(),
    proveedor: data.proveedor || 'Sin proveedor',
    categoria: data.categoria || sugerirCategoria(data.descripcion),
    tipo: data.tipo || 'material',
    unidad: data.unidad || sugerirUnidad(data.descripcion),
    codigoGesdatta: data.codigoGesdatta || null,
    costoARS,
    costoUSD,
    markup,
    precioVentaUSD,
    stock: Number(data.stockInicial || 0),
    stockMinimo: Number(data.stockMinimo || 5),
    activo: true,
    creadoEn: new Date().toISOString(),
    actualizadoEn: new Date().toISOString()
  };

  const docRef = await addDoc(collection(db, 'lista_precios'), payload);
  return { id: docRef.id, ...payload };
}
