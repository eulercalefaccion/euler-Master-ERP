import { GoogleGenerativeAI } from '@google/generative-ai';
import { storage } from './firebaseConfig';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Configurar worker de pdfjs para ejecución en Vite / Navegador
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
 * Normalizadores auxiliares
 */
function parseNumber(str) {
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

function parseDate(str) {
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
 * Parser de Facturas Argentinas (AFIP / ARCA / REHAU / Proveedores Industriales) directamente desde PDF
 */
export async function parsePdfInvoiceBuffer(arrayBuffer) {
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items = content.items.map(it => ({
      str: it.str.trim(),
      x: it.transform[4],
      y: it.transform[5],
      w: it.width,
      h: it.height
    })).filter(it => it.str.length > 0);

    items.sort((a, b) => b.y - a.y || a.x - b.x);

    const lines = [];
    let currentLine = [];
    let currentY = null;
    for (const it of items) {
      if (currentY === null || Math.abs(it.y - currentY) > 4) {
        if (currentLine.length) {
          currentLine.sort((a, b) => a.x - b.x);
          lines.push(currentLine);
        }
        currentLine = [it];
        currentY = it.y;
      } else {
        currentLine.push(it);
      }
    }
    if (currentLine.length) {
      currentLine.sort((a, b) => a.x - b.x);
      lines.push(currentLine);
    }

    const fullPageText = lines.map(l => l.map(c => c.str).join(' ')).join('\n');
    // Filtrar páginas duplicadas / triplicadas para no duplicar los ítems
    const isDuplicate = /duplicado|triplicado/i.test(fullPageText) && !/original/i.test(fullPageText);

    pages.push({ pageNum: i, isDuplicate, lines, fullPageText });
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

  // 2. Razón Social Proveedor
  let proveedorNombre = '';
  if (/rehau/i.test(combinedText)) {
    proveedorNombre = 'REHAU S.A.';
    if (!proveedorCuit) proveedorCuit = '30-67657566-5';
  } else if (/peisa/i.test(combinedText)) {
    proveedorNombre = 'PEISA';
  } else if (/baxi|triangular/i.test(combinedText)) {
    proveedorNombre = 'TRIANGULAR S.A. (BAXI)';
  } else if (/caldaia/i.test(combinedText)) {
    proveedorNombre = 'CALDAIA S.A.';
  } else if (/giacomini/i.test(combinedText)) {
    proveedorNombre = 'GIACOMINI ARGENTINA';
  } else {
    // Buscar primera línea destacada
    for (const page of originalPages) {
      for (const line of page.lines) {
        const text = line.map(c => c.str).join(' ');
        if (text.length > 3 && !/factura|nota de|código|nº|fecha|c\.?u\.?i\.?t|ingresos brutos|i\.?v\.?a/i.test(text)) {
          proveedorNombre = text;
          break;
        }
      }
      if (proveedorNombre) break;
    }
  }

  // 3. Tipo de Comprobante
  let tipoComprobante = 'FAA';
  if (/factura\s+a\b|código:?\s*0?1\b/i.test(combinedText)) tipoComprobante = 'FAA';
  else if (/factura\s+b\b|código:?\s*0?6\b/i.test(combinedText)) tipoComprobante = 'FAB';
  else if (/factura\s+c\b|código:?\s*11\b/i.test(combinedText)) tipoComprobante = 'FAC';
  else if (/nota de cr[eé]dito\s+a/i.test(combinedText)) tipoComprobante = 'NCA';
  else if (/nota de d[eé]bito\s+a/i.test(combinedText)) tipoComprobante = 'NDA';
  else if (/ticket/i.test(combinedText)) tipoComprobante = 'TICKET';

  // 4. Punto de Venta y Número
  let puntoVenta = '1';
  let numeroComprobante = '';
  const numMatch = combinedText.match(/(?:n[º°]|comp(?:robante)?\.?\s*n[º°]?)\s*[:\s]*(\d{4,5})\s*[-–]\s*(\d{8})/i);
  if (numMatch) {
    puntoVenta = String(parseInt(numMatch[1], 10));
    numeroComprobante = String(parseInt(numMatch[2], 10));
  } else {
    const singleNum = combinedText.match(/n[º°]\s*(\d{1,8})/i);
    if (singleNum) numeroComprobante = singleNum[1];
  }

  // 5. Fecha
  const fechaEmision = parseDate(combinedText);

  // 6. Extracción de Artículos / Líneas
  const lineas = [];
  const seenLineKeys = new Set();

  for (const page of originalPages) {
    for (const line of page.lines) {
      const lineItems = line.map(c => c.str);
      const lineStr = lineItems.join(' ');

      // Formato específico REHAU (con código de artículo, descripción, pedido, cantidad, precio unitario y total)
      const rehauMatch = lineStr.match(/^(\d{6}\.\d{3})\s*(?:\/\s*\d+)?\s+(.+?)\s+Pedido del\s+\d{2}\/\d{2}\/\d{2}\s+([\d.,]+)\s+([\d.,]+)\s*(?:\/\d+)?\s+([\d.,]+)$/i);
      if (rehauMatch) {
        const codigoArticulo = rehauMatch[1];
        const rawDesc = rehauMatch[2].replace(/\s+/g, ' ').trim();
        const cantidad = parseNumber(rehauMatch[3]);
        const precioUnitario = parseNumber(rehauMatch[4]);
        const total = parseNumber(rehauMatch[5]);

        const key = `${codigoArticulo}_${cantidad}_${precioUnitario}`;
        if (!seenLineKeys.has(key)) {
          seenLineKeys.add(key);
          lineas.push({
            codigoArticulo,
            descripcion: rawDesc,
            cantidad,
            precioUnitario,
            total,
            alicuotaIva: 0.21,
            cuentaCodigo: '5.1.01',
            centroCosto: 'COSTO VARIABLE',
            obraId: ''
          });
        }
        continue;
      }

      // Formato General AFIP / Proveedor estándar (Cantidad, Precio Unitario, Total)
      if (lineItems.length >= 3) {
        const last1 = parseNumber(lineItems[lineItems.length - 1]);
        const last2 = parseNumber(lineItems[lineItems.length - 2]);
        const last3 = lineItems.length >= 4 ? parseNumber(lineItems[lineItems.length - 3]) : 0;

        if (last1 > 0 && last2 > 0 && last3 > 0) {
          const diff = Math.abs(last2 * last3 - last1);
          if (diff <= Math.max(1, last1 * 0.05)) {
            const desc = lineItems.slice(0, lineItems.length - 3).join(' ').trim();
            if (desc.length >= 3 && !/subtotal|total|transporte|cae|p[aá]gina|i\.?v\.?a/i.test(desc)) {
              const key = `${desc}_${last3}_${last2}`;
              if (!seenLineKeys.has(key)) {
                seenLineKeys.add(key);
                lineas.push({
                  codigoArticulo: '',
                  descripcion: desc,
                  cantidad: last3,
                  precioUnitario: last2,
                  total: last1,
                  alicuotaIva: 0.21,
                  cuentaCodigo: '5.1.01',
                  centroCosto: 'COSTO VARIABLE',
                  obraId: ''
                });
              }
              continue;
            }
          }
        }
      }
    }
  }

  // Totales
  const subtotalNeto = lineas.reduce((acc, l) => acc + (l.total || (l.cantidad * l.precioUnitario)), 0);
  const totalIva = Math.round(subtotalNeto * 0.21 * 100) / 100;
  const totalComprobante = Math.round((subtotalNeto + totalIva) * 100) / 100;

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

  // Si es un archivo PDF, usamos el motor nativo de alta precisión
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

  // Si falló y no pudimos extraer los ítems, retornamos datos básicos reales del archivo
  // SIN inventar líneas falsas ni datos inventados
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
