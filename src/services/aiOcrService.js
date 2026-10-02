import { GoogleGenerativeAI } from '@google/generative-ai';
import { storage } from './firebaseConfig';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Configurar worker de pdfjs para Vite / Navegador
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

const getGeminiKey = () => {
  if (typeof window !== 'undefined') {
    const customKey = localStorage.getItem('gemini_api_key');
    if (customKey && customKey.trim().length > 10) return customKey.trim();
  }
  return import.meta.env.VITE_GEMINI_API_KEY || '';
};

/**
 * Convierte un File a Base64 para consumo de la API de Vision de Gemini
 */
const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result;
      const base64Data = result.split(',')[1];
      resolve({
        inlineData: {
          data: base64Data,
          mimeType: file.type || 'image/jpeg'
        }
      });
    };
    reader.onerror = error => reject(error);
  });
};

/**
 * Subir archivo físico (Foto o PDF) a Firebase Storage
 */
export const uploadDocumentToStorage = async (file, folder = 'comprobantes_compra_adjuntos') => {
  try {
    const timestamp = Date.now();
    const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storageRef = ref(storage, `${folder}/${timestamp}_${cleanName}`);
    
    const uploadTask = await uploadBytesResumable(storageRef, file);
    const downloadUrl = await getDownloadURL(uploadTask.ref);
    return downloadUrl;
  } catch (error) {
    console.error('Error subiendo documento a Firebase Storage:', error);
    return URL.createObjectURL(file);
  }
};

/**
 * Parseo numérico robusto para formatos argentinos (1.234,56 o 1,234.56 o 1234.56)
 */
export function parseNumber(str) {
  if (!str) return 0;
  str = String(str).replace(/[^0-9.,]/g, '').trim();
  if (!str) return 0;
  const commaIdx = str.lastIndexOf(',');
  const dotIdx = str.lastIndexOf('.');
  if (commaIdx > dotIdx) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (dotIdx > commaIdx) {
    str = str.replace(/,/g, '');
  }
  return parseFloat(str) || 0;
}

export function parseDate(str) {
  if (!str) return new Date().toISOString().split('T')[0];
  const m = str.match(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})/);
  if (!m) return new Date().toISOString().split('T')[0];
  const day = m[1].padStart(2, '0');
  const month = m[2].padStart(2, '0');
  let year = m[3];
  if (year.length === 2) year = '20' + year;
  return `${year}-${month}-${day}`;
}

/**
 * Motor Universal Inteligente para Lectura de Facturas Argentinas (PDF)
 * Diseñado para soportar REHAU, Pronto Distribuidora, AFIP estándar, Tango, Gesdatta, y otros proveedores.
 */
export async function parsePdfInvoiceBuffer(arrayBuffer) {
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items.map(it => ({
      str: it.str.trim(),
      x: Math.round(it.transform[4]),
      y: Math.round(it.transform[5]),
      w: Math.round(it.width),
      h: Math.round(it.height)
    })).filter(it => it.str.length > 0);

    items.sort((a, b) => b.y - a.y || a.x - b.x);

    // Agrupar elementos en líneas por coordenada Y (umbral 5px)
    const lines = [];
    let curLine = [];
    let curY = null;
    for (const it of items) {
      if (curY === null || Math.abs(it.y - curY) > 5) {
        if (curLine.length) {
          curLine.sort((a, b) => a.x - b.x);
          lines.push(curLine);
        }
        curLine = [it];
        curY = it.y;
      } else {
        curLine.push(it);
      }
    }
    if (curLine.length) {
      curLine.sort((a, b) => a.x - b.x);
      lines.push(curLine);
    }

    const fullPageText = lines.map(l => l.map(c => c.str).join(' ')).join('\n');
    // Descartar páginas marcadas como Duplicado o Triplicado para evitar duplicar artículos
    const isDuplicate = /duplicado|triplicado/i.test(fullPageText) && !/original/i.test(fullPageText);

    pages.push({ pageNum: p, isDuplicate, lines, fullPageText });
  }

  // Usar páginas originales (o todas si no están rotuladas)
  const originalPages = pages.some(p => !p.isDuplicate)
    ? pages.filter(p => !p.isDuplicate)
    : pages;

  const combinedText = originalPages.map(p => p.fullPageText).join('\n');

  // 1. CUIT Emisor
  let proveedorCuit = '';
  const cuitMatches = [...combinedText.matchAll(/(?:c\.?u\.?i\.?t\.?|cuit)\s*(?:n[º°]?)?[:\s]*(\d{2}-?\d{8}-?\d{1})/gi)];
  if (cuitMatches.length > 0) {
    const rawCuit = cuitMatches[0][1].replace(/\D/g, '');
    if (rawCuit.length === 11) {
      proveedorCuit = `${rawCuit.slice(0, 2)}-${rawCuit.slice(2, 10)}-${rawCuit.slice(10)}`;
    }
  }

  // 2. Razón Social / Proveedor
  let proveedorNombre = '';
  if (/pronto\s*distribuidora/i.test(combinedText)) {
    proveedorNombre = 'Pronto Distribuidora';
    if (!proveedorCuit) proveedorCuit = '30-71672725-0';
  } else if (/rehau/i.test(combinedText)) {
    proveedorNombre = 'REHAU S.A.';
    if (!proveedorCuit) proveedorCuit = '30-67657566-5';
  } else if (/giacomini/i.test(combinedText)) {
    proveedorNombre = 'GIACOMINI ARGENTINA';
  } else if (/peisa/i.test(combinedText)) {
    proveedorNombre = 'PEISA';
  } else if (/baxi|triangular/i.test(combinedText)) {
    proveedorNombre = 'TRIANGULAR S.A. (BAXI)';
  } else if (/caldaia/i.test(combinedText)) {
    proveedorNombre = 'CALDAIA S.A.';
  } else {
    // Buscar en la cabecera de la primera página
    const firstPage = originalPages[0];
    for (let i = 0; i < Math.min(8, firstPage.lines.length); i++) {
      const line = firstPage.lines[i];
      for (const item of line) {
        if (item.str.length > 3 && 
            !/factura|nota|cod|código|nro|nº|original|duplicado|página|fecha/i.test(item.str) &&
            !/i\.?v\.?a|responsable|ingresos|cuit|cliente/i.test(item.str)) {
          proveedorNombre = item.str;
          break;
        }
      }
      if (proveedorNombre) break;
    }
  }

  // 3. Tipo de Comprobante (Factura A, B, C, etc.)
  let tipoComprobante = 'FAA';
  if (/factura\s+a\b|c[oó]d(?:igo)?\.?\s*0?1\b/i.test(combinedText)) tipoComprobante = 'FAA';
  else if (/factura\s+b\b|c[oó]d(?:igo)?\.?\s*0?6\b/i.test(combinedText)) tipoComprobante = 'FAB';
  else if (/factura\s+c\b|c[oó]d(?:igo)?\.?\s*11\b/i.test(combinedText)) tipoComprobante = 'FAC';
  else if (/nota de cr[eé]dito/i.test(combinedText)) tipoComprobante = 'NCA';
  else if (/nota de d[eé]bito/i.test(combinedText)) tipoComprobante = 'NDA';
  else if (/ticket/i.test(combinedText)) tipoComprobante = 'TICKET';

  // 4. Punto de Venta y Número Comprobante (Evitando número de remito)
  let puntoVenta = '1';
  let numeroComprobante = '';
  const nonRemitoMatch = combinedText.match(/(?<!remito\s*)(?:n[º°]|nro\.?|comp(?:robante)?\.?\s*n[º°]?)\s*[:\s]*(\d{4,5})\s*[-–]\s*(\d{8})/i);
  if (nonRemitoMatch) {
    puntoVenta = String(parseInt(nonRemitoMatch[1], 10));
    numeroComprobante = String(parseInt(nonRemitoMatch[2], 10));
  } else {
    const rawNum = combinedText.match(/\b(\d{4,5})\s*[-–]\s*(\d{8})\b/);
    if (rawNum) {
      puntoVenta = String(parseInt(rawNum[1], 10));
      numeroComprobante = String(parseInt(rawNum[2], 10));
    }
  }

  // 5. Fecha de Emisión
  const fechaEmision = parseDate(combinedText);

  // 6. Totales
  let subtotalNeto = 0;
  let totalIva = 0;
  let totalComprobante = 0;

  const baseMatch = combinedText.match(/(?:base imponible|subtotal gravado|neto gravado)\s*[:\$]?\s*([\d.,]+)/i);
  if (baseMatch) subtotalNeto = parseNumber(baseMatch[1]);

  const ivaMatch = combinedText.match(/(?:iva\s*21%|iva\s*gral\.?|total\s*iva)\s*[:\$]?\s*([\d.,]+)/i);
  if (ivaMatch) totalIva = parseNumber(ivaMatch[1]);

  const totalMatch = combinedText.match(/(?:total|importe total)\s*[:\$]?\s*([\d.,]+)(?!\s*\(|\s*d[oó]lares)/i);
  if (totalMatch) totalComprobante = parseNumber(totalMatch[1]);

  // 7. Extracción de Artículos / Renglones de la Factura
  const lineas = [];
  const seenKeys = new Set();

  for (const page of originalPages) {
    const lines = page.lines;

    // Detectar encabezado de la tabla y calcular coordenadas de columnas
    let tableHeaderIdx = -1;
    let colDescX = 30;
    let colCantX = 310;
    let colPrecioX = 380;
    let colTotalX = 500;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineStr = line.map(c => c.str).join(' ');
      if (/(?:descripci[oó]n|art[ií]culo|designaci[oó]n|concepto)/i.test(lineStr) &&
          /(?:cantidad|cant|precio|importe|total)/i.test(lineStr)) {
        tableHeaderIdx = i;

        for (const item of line) {
          if (/descripci[oó]n|art[ií]culo|designaci[oó]n/i.test(item.str)) colDescX = item.x;
          if (/cantidad|cant/i.test(item.str)) colCantX = item.x;
          if (/precio|unitario|p\.\s*unit/i.test(item.str)) colPrecioX = item.x;
          if (/total|importe/i.test(item.str)) colTotalX = item.x;
        }
        break;
      }
    }

    // Puntos de corte entre columnas
    const boundCant = (colDescX + colCantX) / 2 + 30;
    const boundPrecio = (colCantX + colPrecioX) / 2;
    const boundTotal = (colPrecioX + colTotalX) / 2;

    const startIdx = tableHeaderIdx !== -1 ? tableHeaderIdx + 1 : 0;
    let currentItem = null;

    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i];
      const lineStr = line.map(c => c.str).join(' ');

      // Filtro de filas de pie de página / subtotales / condiciones
      if (/(?:hoja\s*\d+\s*\/\s*\d+|base imponible|subtotal|transporte|son pesos|plazo de pago|condiciones de venta|cuenta bancaria|garant[ií]a|aviso de pago|observaciones|cae:?\s*\d+|vencimiento|a partir del)/i.test(lineStr) &&
          !/(?:tubo|colector|valvula|detentor|radiador|armario|casquillo|pieza|adaptador)/i.test(lineStr)) {
        if (/^transporte\s+[\d.,]+$/i.test(lineStr.trim())) {
          if (currentItem) {
            pushItem(currentItem);
            currentItem = null;
          }
          continue;
        }
        if (currentItem) {
          pushItem(currentItem);
          currentItem = null;
        }
        break;
      }

      // 1. Probar formato REHAU (con número de artículo y "Pedido del")
      const rehauMatch = lineStr.match(/^(\d{6}\.\d{3})\s*(?:\/\s*\d+)?\s+(.+?)\s+Pedido del\s+\d{2}\/\d{2}\/\d{2}\s+([\d.,]+)\s+([\d.,]+)\s*(?:\/\d+)?\s+([\d.,]+)$/i);
      if (rehauMatch) {
        if (currentItem) pushItem(currentItem);
        currentItem = {
          codigoArticulo: rehauMatch[1],
          descripcion: rehauMatch[2].replace(/\s+/g, ' ').trim(),
          cantidad: parseNumber(rehauMatch[3]),
          precioUnitario: parseNumber(rehauMatch[4]),
          total: parseNumber(rehauMatch[5]),
          alicuotaIva: 0.21
        };
        continue;
      }

      // 2. Probar formato Universal basado en Columnas Geométricas X (Pronto, AFIP, etc.)
      const descTokens = [];
      const cantTokens = [];
      const precioTokens = [];
      const totalTokens = [];

      for (const it of line) {
        if (/^(?:unidad\(es\)|unidades|mts|kg|iva|21%|10\.5%|10,5%|\$|desc\.?|\(%?\))$/i.test(it.str)) {
          continue;
        }

        const subParts = it.str.split(/\s+/).filter(Boolean);

        for (const sub of subParts) {
          if (/^(?:unidad\(es\)|unidades|mts|kg|iva|21%|10\.5%|10,5%|\$|desc\.?|\(%?\))$/i.test(sub)) {
            continue;
          }

          if (it.x < boundCant) {
            descTokens.push(sub);
          } else if (it.x >= boundCant && it.x < boundPrecio) {
            cantTokens.push(sub);
          } else if (it.x >= boundPrecio && it.x < boundTotal) {
            precioTokens.push(sub);
          } else {
            totalTokens.push(sub);
          }
        }
      }

      const cantVal = cantTokens.map(parseNumber).find(n => n > 0);
      const precioVal = precioTokens.map(parseNumber).find(n => n > 0);
      const totalVal = totalTokens.map(parseNumber).find(n => n >= 0);

      if (cantVal && (precioVal || totalVal !== undefined)) {
        if (currentItem) pushItem(currentItem);

        const desc = descTokens.join(' ').replace(/-\s*$/, '').trim();
        const codeMatch = desc.match(/\b([A-Z0-9]{5,12})\b/);
        const codigoArticulo = codeMatch ? codeMatch[1] : '';

        const pUnit = precioVal || (cantVal > 0 ? (totalVal || 0) / cantVal : 0);
        const tVal = totalVal !== undefined ? totalVal : Math.round(cantVal * pUnit * 100) / 100;

        currentItem = {
          codigoArticulo,
          descripcion: desc,
          cantidad: cantVal,
          precioUnitario: pUnit,
          total: tVal,
          alicuotaIva: 0.21
        };
      } else if (currentItem && descTokens.length > 0 && !cantVal && !precioVal) {
        currentItem.descripcion += ' ' + descTokens.join(' ').trim();
      }
    }

    if (currentItem) {
      pushItem(currentItem);
    }
  }

  function pushItem(it) {
    it.descripcion = it.descripcion.replace(/\s+/g, ' ').replace(/\s+-\s*$/, '').trim();
    if (/^(?:hoja\s*\d+|subtotal|total|\(\*\))/i.test(it.descripcion)) return;
    if (it.descripcion.length < 3) return;

    const key = `${it.descripcion}_${it.cantidad}_${it.precioUnitario}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      lineas.push({
        ...it,
        cuentaCodigo: '5.1.01',
        centroCosto: 'COSTO VARIABLE',
        obraId: ''
      });
    }
  }

  // Recalcular subtotales si no vinieron en la cabecera
  if (!subtotalNeto && lineas.length > 0) {
    subtotalNeto = Math.round(lineas.reduce((acc, l) => acc + l.total, 0) * 100) / 100;
  }
  if (!totalIva && subtotalNeto > 0) {
    totalIva = Math.round(subtotalNeto * 0.21 * 100) / 100;
  }
  if (!totalComprobante && subtotalNeto > 0) {
    totalComprobante = Math.round((subtotalNeto + totalIva) * 100) / 100;
  }

  return {
    proveedorNombre,
    proveedorCuit,
    tipoComprobante,
    puntoVenta,
    numeroComprobante,
    fechaEmision,
    subtotalNeto,
    totalIva,
    totalComprobante,
    lineas,
    exitoIA: true
  };
}

/**
 * Motor de Lectura Inteligente de Facturas y Comprobantes de Compra
 */
export const parseFacturaConIA = async (file) => {
  // 1. Subir a Storage para almacenamiento permanente
  const adjuntoUrl = await uploadDocumentToStorage(file, 'comprobantes_compra_adjuntos');

  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  // Si es un archivo PDF, usamos el motor nativo universal
  if (isPdf) {
    try {
      const buffer = await file.arrayBuffer();
      const parsedData = await parsePdfInvoiceBuffer(buffer);

      if (parsedData.lineas && parsedData.lineas.length > 0) {
        return {
          ...parsedData,
          adjuntoUrl
        };
      }
    } catch (pdfErr) {
      console.warn('Error en parser nativo de PDF, intentando Gemini:', pdfErr);
    }
  }

  // Si es imagen o el PDF no tenía texto seleccionable, intentar Gemini AI
  const geminiKey = getGeminiKey();
  if (geminiKey) {
    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const imagePart = await fileToBase64(file);

      const prompt = `
Eres un asistente contable experto en facturas y comprobantes fiscales de Argentina (AFIP / ARCA).
Analiza este documento y extrae en formato JSON estricto con todos los artículos y renglones:
{
  "proveedorNombre": "Nombre o Razón Social del emisor",
  "proveedorCuit": "CUIT en formato XX-XXXXXXXX-X",
  "tipoComprobante": "FAA" | "FAB" | "FAC" | "TICKET" | "NCA" | "NDA",
  "puntoVenta": 1,
  "numeroComprobante": 12345,
  "fechaEmision": "YYYY-MM-DD",
  "subtotalNeto": 0.00,
  "totalIva": 0.00,
  "totalComprobante": 0.00,
  "lineas": [
    {
      "codigoArticulo": "Código o referencia del artículo si existe",
      "descripcion": "Descripción detallada del artículo o servicio",
      "cantidad": 1,
      "precioUnitario": 0.00,
      "total": 0.00,
      "alicuotaIva": 0.21,
      "centroCosto": "COSTO VARIABLE"
    }
  ]
}
Responde ÚNICAMENTE con el objeto JSON válido.
`;

      const result = await model.generateContent([prompt, imagePart]);
      const responseText = result.response.text().trim();
      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsedData = JSON.parse(cleanJson);

      return {
        ...parsedData,
        adjuntoUrl,
        exitoIA: true
      };
    } catch (geminiErr) {
      console.error('Error procesando con Gemini AI:', geminiErr);
    }
  }

  return {
    proveedorNombre: '',
    proveedorCuit: '',
    tipoComprobante: 'FAA',
    puntoVenta: '1',
    numeroComprobante: '',
    fechaEmision: new Date().toISOString().split('T')[0],
    subtotalNeto: 0,
    totalIva: 0,
    totalComprobante: 0,
    lineas: [],
    adjuntoUrl,
    exitoIA: false,
    mensajeError: 'No se pudieron detectar los artículos automáticamente. Podés cargarlos manualmente o verificar la clave de Gemini.'
  };
};

/**
 * Motor IA OCR de Lectura Inteligente de E-Cheqs y Comprobantes de Pago
 */
export const parseEcheqConIA = async (file) => {
  const adjuntoUrl = await uploadDocumentToStorage(file, 'pagos_echeqs_adjuntos');
  const geminiKey = getGeminiKey();

  if (geminiKey) {
    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const imagePart = await fileToBase64(file);

      const prompt = `
Eres un asistente de tesorería experto en E-Cheqs y comprobantes bancarios de Argentina.
Analiza este comprobante de E-Cheque y extrae en formato JSON estricto:
{
  "numeroEcheq": "Número del E-Cheq",
  "monto": 0.00,
  "fechaEmision": "YYYY-MM-DD",
  "fechaVencimiento": "YYYY-MM-DD",
  "librador": "Nombre o Razón social del emisor",
  "cuitLibrador": "XX-XXXXXXXX-X",
  "beneficiario": "Nombre o Razón social del beneficiario",
  "bancoEmisor": "Nombre del Banco"
}
Responde ÚNICAMENTE con el objeto JSON válido.
`;
      const result = await model.generateContent([prompt, imagePart]);
      const responseText = result.response.text().trim();
      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsedData = JSON.parse(cleanJson);

      return {
        ...parsedData,
        adjuntoUrl,
        exitoIA: true
      };
    } catch (err) {
      console.warn('Fallback E-Cheq IA:', err);
    }
  }

  return {
    numeroEcheq: '',
    monto: 0,
    fechaEmision: new Date().toISOString().split('T')[0],
    fechaVencimiento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    librador: '',
    cuitLibrador: '',
    beneficiario: 'Euler Calefacción',
    bancoEmisor: '',
    adjuntoUrl,
    exitoIA: false
  };
};

/**
 * Motor IA OCR para Lectura de Constancias CUIT (ARCA / AFIP)
 */
export const parseConstanciaCuitConIA = async (file) => {
  const adjuntoUrl = await uploadDocumentToStorage(file, 'constancias_cuit_adjuntos');
  const geminiKey = getGeminiKey();

  if (geminiKey) {
    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const imagePart = await fileToBase64(file);

      const prompt = `
Eres un asistente contable experto en constancias de CUIT (AFIP / ARCA) de Argentina.
Extrae en formato JSON estricto:
{
  "name": "Razón Social o Nombre Completo",
  "cuit": "CUIT XX-XXXXXXXX-X",
  "dni": "DNI",
  "address": "Domicilio Fiscal",
  "location": "Localidad",
  "condicionIva": "Responsable Inscripto" | "Monotributo" | "Exento" | "Consumidor Final"
}
Responde ÚNICAMENTE con el objeto JSON válido.
`;
      const result = await model.generateContent([prompt, imagePart]);
      const responseText = result.response.text().trim();
      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsedData = JSON.parse(cleanJson);

      return {
        ...parsedData,
        adjuntoUrl,
        exitoIA: true
      };
    } catch (err) {
      console.warn('Fallback Constancia CUIT IA:', err);
    }
  }

  return {
    adjuntoUrl,
    exitoIA: false
  };
};
