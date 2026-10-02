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
/**
 * Motor Universal Inteligente para Lectura de Facturas Argentinas (PDF)
 * Soportando dinámicamente Triangular S.A. (BAXI), Pronto Distribuidora, REHAU S.A., AFIP estándar, Tango, etc.
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

    // Agrupar elementos en líneas por coordenada Y (umbral 4px)
    const lines = [];
    let curLine = [];
    let curY = null;
    for (const it of items) {
      if (curY === null || Math.abs(it.y - curY) > 4) {
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
    // Descartar páginas duplicadas/triplicadas si existen originales
    const isDuplicate = /duplicado|triplicado/i.test(fullPageText) && !/original/i.test(fullPageText);

    pages.push({ pageNum: p, isDuplicate, lines, fullPageText });
  }

  // Usar páginas originales (o todas si no están rotuladas)
  const originalPages = pages.some(p => !p.isDuplicate)
    ? pages.filter(p => !p.isDuplicate)
    : pages;

  const combinedText = originalPages.map(p => p.fullPageText).join('\n');

  // 1. Empresa Receptora (Cliente destinatario)
  // Por requerimiento comercial, todas las facturas formales van dirigidas a AYALA NICOLAS FEDERICO (CUIT 20-31627562-2)
  let receptorEmpresaId = 'ayala-nicolas';
  let receptorNombre = 'AYALA NICOLAS FEDERICO';
  let receptorCuit = '20-31627562-2';

  if (/20-?31627562-?2|AYALA\s*,?\s*NICOLAS\s*FEDERICO/i.test(combinedText)) {
    receptorEmpresaId = 'ayala-nicolas';
    receptorNombre = 'AYALA NICOLAS FEDERICO';
    receptorCuit = '20-31627562-2';
  } else if (/euler\s*srl/i.test(combinedText) || /30-?71998877-?5/i.test(combinedText)) {
    receptorEmpresaId = 'euler-general';
    receptorNombre = 'EULER SRL';
    receptorCuit = '30-71998877-5';
  }

  // 2. Proveedor Emisor
  let proveedorNombre = '';
  let proveedorCuit = '';

  if (/triangular/i.test(combinedText) || /baxi/i.test(combinedText)) {
    proveedorNombre = 'TRIANGULAR S.A. (BAXI)';
    proveedorCuit = '30-60945338-5';
  } else if (/pronto\s*distribuidora/i.test(combinedText)) {
    proveedorNombre = 'Pronto Distribuidora';
    proveedorCuit = '30-71672725-0';
  } else if (/rehau/i.test(combinedText)) {
    proveedorNombre = 'REHAU S.A.';
    proveedorCuit = '30-67657566-5';
  } else if (/giacomini/i.test(combinedText)) {
    proveedorNombre = 'GIACOMINI ARGENTINA';
  } else if (/peisa/i.test(combinedText)) {
    proveedorNombre = 'PEISA';
  } else if (/caldaia/i.test(combinedText)) {
    proveedorNombre = 'CALDAIA S.A.';
  }

  if (!proveedorCuit) {
    const cuitMatches = [...combinedText.matchAll(/(?:c\.?u\.?i\.?t\.?|cuit)\s*(?:n[º°]?)?[:\s]*(\d{2}-?\d{8}-?\d{1})/gi)];
    for (const m of cuitMatches) {
      const rawC = m[1].replace(/\D/g, '');
      if (rawC.length === 11 && rawC !== '20316275622') {
        proveedorCuit = `${rawC.slice(0, 2)}-${rawC.slice(2, 10)}-${rawC.slice(10)}`;
        break;
      }
    }
  }

  if (!proveedorNombre) {
    const firstPage = originalPages[0];
    for (let i = 0; i < Math.min(8, firstPage.lines.length); i++) {
      const line = firstPage.lines[i];
      for (const item of line) {
        if (item.str.length > 3 && 
            !/factura|nota|cod|código|nro|nº|original|duplicado|página|fecha/i.test(item.str) &&
            !/i\.?v\.?a|responsable|ingresos|cuit|cliente|señor/i.test(item.str)) {
          proveedorNombre = item.str;
          break;
        }
      }
      if (proveedorNombre) break;
    }
  }

  // 3. Tipo de Comprobante, Punto de Venta y Número
  let tipoComprobante = 'FAA';
  let puntoVenta = '1';
  let numeroComprobante = '';

  // Detección de Letra
  if (/factura\s+a\b|c[oó]d(?:igo)?\.?\s*0?1\b|\bA000/i.test(combinedText)) tipoComprobante = 'FAA';
  else if (/factura\s+b\b|c[oó]d(?:igo)?\.?\s*0?6\b|\bB000/i.test(combinedText)) tipoComprobante = 'FAB';
  else if (/factura\s+c\b|c[oó]d(?:igo)?\.?\s*11\b|\bC000/i.test(combinedText)) tipoComprobante = 'FAC';
  else if (/nota de cr[eé]dito/i.test(combinedText)) tipoComprobante = 'NCA';
  else if (/nota de d[eé]bito/i.test(combinedText)) tipoComprobante = 'NDA';

  // Buscar Número de Comprobante en todos los formatos argentinos
  // Formato Triangular / continuo: "Nro. Comp: A000800075096"
  const mTriangular = combinedText.match(/(?:nro\.?\s*comp\.?|comp(?:robante)?\.?\s*n[º°]?|factura\s*n[º°]?|nro\.?)\s*[:\s]*([A-C|M])\s*(\d{4,5})\s*(\d{8})/i) ||
                      combinedText.match(/\b([A-C|M])(\d{4})(\d{8})\b/i);
  if (mTriangular) {
    const letra = mTriangular[1].toUpperCase();
    tipoComprobante = letra === 'A' ? 'FAA' : letra === 'B' ? 'FAB' : 'FAC';
    puntoVenta = String(parseInt(mTriangular[2], 10));
    numeroComprobante = String(parseInt(mTriangular[3], 10));
  } else {
    // Formato con guión: "Nro: 00009-00009753" o "0015-00311614"
    const mHyphen = combinedText.match(/(?<!remito\s*)(?:n[º°]|nro\.?|comp(?:robante)?\.?\s*n[º°]?)\s*[:\s]*([A-C|M])?\s*(\d{4,5})\s*[-–]\s*(\d{6,8})/i);
    if (mHyphen) {
      if (mHyphen[1]) {
        tipoComprobante = mHyphen[1].toUpperCase() === 'A' ? 'FAA' : mHyphen[1].toUpperCase() === 'B' ? 'FAB' : 'FAC';
      }
      puntoVenta = String(parseInt(mHyphen[2], 10));
      numeroComprobante = String(parseInt(mHyphen[3], 10));
    } else {
      const mRaw = combinedText.match(/\b(\d{4,5})\s*[-–]\s*(\d{6,8})\b/);
      if (mRaw) {
        puntoVenta = String(parseInt(mRaw[1], 10));
        numeroComprobante = String(parseInt(mRaw[2], 10));
      }
    }
  }

  // 4. Fecha de Emisión
  const fechaEmision = parseDate(combinedText);

  // 5. Totales
  let subtotalNeto = 0;
  let totalIva = 0;
  let totalComprobante = 0;

  const baseMatch = combinedText.match(/(?:base imponible|subtotal gravado|neto gravado)\s*[:\$]?\s*([\d.,]+)/i);
  if (baseMatch) subtotalNeto = parseNumber(baseMatch[1]);

  const ivaMatch = combinedText.match(/(?:iva\s*21%|iva\s*gral\.?|total\s*iva)\s*[:\$]?\s*([\d.,]+)/i);
  if (ivaMatch) totalIva = parseNumber(ivaMatch[1]);

  const totalMatch = combinedText.match(/(?:importe\s*total|total|total\s*factura)\s*[:\$]?\s*([\d.,]+)(?!\s*\(|\s*d[oó]lares)/i);
  if (totalMatch) totalComprobante = parseNumber(totalMatch[1]);

  // 6. Extracción Dinámica e Interpretación de Artículos / Renglones
  const lineas = [];
  const seenKeys = new Set();

  for (const page of originalPages) {
    const lines = page.lines;

    // Detectar encabezado de la tabla y calcular coordenadas de columnas
    let headerLineIdx = -1;
    let headerLine2Idx = -1;

    for (let i = 0; i < lines.length; i++) {
      const lineStr = lines[i].map(c => c.str).join(' ');
      if (/(?:c[oó]digo|descripci[oó]n|art[ií]culo|concepto|designaci[oó]n)/i.test(lineStr) &&
          /(?:cant|precio|dto|importe|total)/i.test(lineStr)) {
        headerLineIdx = i;
        if (i > 0 && /(?:precio|unitario|dto|desc|u\.?m|medida)/i.test(lines[i - 1].map(c => c.str).join(' '))) {
          headerLine2Idx = i - 1;
        } else if (i + 1 < lines.length && /(?:unitario|desc|bonif|importe)/i.test(lines[i + 1].map(c => c.str).join(' '))) {
          headerLine2Idx = i + 1;
        }
        break;
      }
    }

    const headerTokens = [];
    if (headerLineIdx !== -1) {
      headerTokens.push(...lines[headerLineIdx]);
      if (headerLine2Idx !== -1) {
        headerTokens.push(...lines[headerLine2Idx]);
      }
    }

    // Mapeo dinámico de columnas por coordenadas X
    const detectedCols = [];
    const findHeaderX = (regex) => {
      const match = headerTokens.find(t => regex.test(t.str));
      return match ? match.x : null;
    };

    const xCod = findHeaderX(/^c[oó]d/i);
    const xDesc = findHeaderX(/descrip|art[ií]c|concepto/i);
    const xUm = findHeaderX(/unidad|u\.?m|medida/i);
    const xPNeto = findHeaderX(/con\s*dto|c\/dto|p\.neto/i);
    const xPUnit = findHeaderX(/unitario|precio|p\.unit/i);
    const xDto = findHeaderX(/(?:^|\s)(?:%?\s*dto\b|desc\b|desc\.|\bdescuento\b|\bbonif\b)/i);
    const xCant = findHeaderX(/cant/i);
    const xIva = findHeaderX(/iva/i);
    const xTotal = findHeaderX(/importe|total|subtotal/i);

    if (xCod !== null) detectedCols.push({ id: 'codigo', x: xCod });
    if (xDesc !== null) detectedCols.push({ id: 'descripcion', x: xDesc });
    if (xUm !== null) detectedCols.push({ id: 'unidad', x: xUm });
    if (xCant !== null) detectedCols.push({ id: 'cantidad', x: xCant });
    if (xPUnit !== null) detectedCols.push({ id: 'precioUnitario', x: xPUnit });
    if (xDto !== null) detectedCols.push({ id: 'descuentoPorc', x: xDto });
    if (xPNeto !== null) detectedCols.push({ id: 'precioConDto', x: xPNeto });
    if (xIva !== null) detectedCols.push({ id: 'iva', x: xIva });
    if (xTotal !== null) detectedCols.push({ id: 'total', x: xTotal });

    detectedCols.sort((a, b) => a.x - b.x);

    // Calcular límites de corte entre columnas
    const colBounds = [];
    for (let c = 0; c < detectedCols.length; c++) {
      const left = c === 0 ? 0 : (detectedCols[c - 1].x + detectedCols[c].x) / 2;
      const right = c === detectedCols.length - 1 ? 9999 : (detectedCols[c].x + detectedCols[c + 1].x) / 2;
      colBounds.push({ id: detectedCols[c].id, left, right, x: detectedCols[c].x });
    }

    const startIdx = Math.max(headerLineIdx, headerLine2Idx) !== -1 ? Math.max(headerLineIdx, headerLine2Idx) + 1 : 0;
    let currentItem = null;

    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i];
      const lineStr = line.map(c => c.str).join(' ');

      // Filtro estricto de fin de tabla (subtotales, impuestos, pie de página)
      if (/(?:detalle de impuestos|base imponible|subtotal|importe total|transporte|son pesos|plazo de pago|condiciones de venta|cuenta bancaria|garant[ií]a|aviso de pago|observaciones|cae:?\s*\d+|vencimiento|a partir del|hoja\s*\d+\s*\/\s*\d+)/i.test(lineStr) &&
          !/(?:caldera|tubo|colector|valvula|detentor|radiador|armario|casquillo|pieza|adaptador|combo|kit)/i.test(lineStr)) {
        if (currentItem) {
          pushItem(currentItem);
          currentItem = null;
        }
        break;
      }

      // 1. REHAU formato específico
      const rehauMatch = lineStr.match(/^(\d{6}\.\d{3})\s*(?:\/\s*\d+)?\s+(.+?)\s+Pedido del\s+\d{2}\/\d{2}\/\d{2}\s+([\d.,]+)\s+([\d.,]+)\s*(?:\/\d+)?\s+([\d.,]+)$/i);
      if (rehauMatch) {
        if (currentItem) pushItem(currentItem);
        const q = parseNumber(rehauMatch[3]);
        const pu = parseNumber(rehauMatch[4]);
        const tot = parseNumber(rehauMatch[5]);
        currentItem = {
          codigoArticulo: rehauMatch[1],
          descripcion: rehauMatch[2].replace(/\s+/g, ' ').trim(),
          unidad: 'UN',
          cantidad: q,
          precioUnitario: pu,
          descuentoPorc: 0,
          precioConDto: pu,
          total: tot,
          alicuotaIva: 0.21
        };
        continue;
      }

      // 2. Mapeo Universal de columnas por coordenadas geométricas
      const buckets = {
        codigo: [],
        descripcion: [],
        unidad: [],
        precioUnitario: [],
        descuentoPorc: [],
        precioConDto: [],
        cantidad: [],
        iva: [],
        total: []
      };

      for (const it of line) {
        if (/^(?:\$|%|\(%?\))$/i.test(it.str)) continue;

        // Desarmar tokens agrupados con espacios para no mezclar números con texto
        const parts = it.str.split(/\s+/).filter(Boolean);
        for (const sub of parts) {
          if (/^(?:\$|%|\(%?\))$/i.test(sub)) continue;

          let matchedColId = null;
          for (const b of colBounds) {
            if (it.x >= b.left && it.x < b.right) {
              matchedColId = b.id;
              break;
            }
          }

          if (matchedColId && buckets[matchedColId]) {
            buckets[matchedColId].push(sub);
          } else {
            buckets.descripcion.push(sub);
          }
        }
      }

      // Extraer y validar valores numéricos
      let valCant = buckets.cantidad.map(parseNumber).find(n => n > 0);
      let valPUnit = buckets.precioUnitario.map(parseNumber).find(n => n >= 0);
      let valDto = buckets.descuentoPorc.map(parseNumber).find(n => n >= 0);
      let valPNeto = buckets.precioConDto.map(parseNumber).find(n => n >= 0);
      let valTotal = buckets.total.map(parseNumber).find(n => n >= 0);
      let valIva = buckets.iva.map(parseNumber).find(n => n > 0);

      // Si no hubo IVA explícito por columna, detectar tasa estándar
      let alicuotaIva = 0.21;
      if (valIva === 10.5 || /10[,.]5/i.test(buckets.iva.join(' '))) alicuotaIva = 0.105;
      else if (valIva === 0) alicuotaIva = 0;

      // RESOLUCIÓN MATEMÁTICA Y DE SANIDAD (Interpretación Real de Factura)
      if (valTotal !== undefined || (valCant && valPUnit !== undefined)) {
        // Sanity Check: si la cantidad y el precio unitario quedaron invertidos
        // (por ejemplo si un precio de $ 4.135.950 quedó en cantidad y 10 en precio)
        if (valCant > 5000 && valPUnit !== undefined && valPUnit > 0 && valPUnit <= 100) {
          const tmp = valCant;
          valCant = valPUnit;
          valPUnit = tmp;
        }

        // Si tenemos precio unitario y descuento pero no precio con descuento
        if (valPUnit !== undefined && valDto !== undefined && valPNeto === undefined) {
          valPNeto = Math.round(valPUnit * (1 - (valDto || 0) / 100) * 100) / 100;
        } else if (valPUnit && valPNeto !== undefined && (!valDto || valDto === 0) && valPNeto < valPUnit) {
          valDto = Math.round((1 - valPNeto / valPUnit) * 10000) / 100;
        }

        const effectiveNetPrice = valPNeto !== undefined ? valPNeto : (valPUnit || 0);

        // Si total falta o es inconsistente, calcularlo: Total = Cantidad * Precio con Descuento
        if (valTotal === undefined && valCant) {
          valTotal = Math.round(valCant * effectiveNetPrice * 100) / 100;
        }

        // Verificar consistencia matemática: si cant * pUnit == total (sin descuento)
        if (valCant && effectiveNetPrice && valTotal !== undefined) {
          const expectedTotal = valCant * effectiveNetPrice;
          if (Math.abs(expectedTotal - valTotal) > Math.max(1, valTotal * 0.05)) {
            if (valPUnit && Math.abs(valCant * valPUnit - valTotal) < Math.max(1, valTotal * 0.01)) {
              valPNeto = valPUnit;
              valDto = 0;
            }
          }
        }

        if (currentItem) pushItem(currentItem);

        const rawDesc = buckets.descripcion.join(' ').replace(/-\s*$/, '').trim();
        const code = buckets.codigo.join(' ').trim() || (rawDesc.match(/\b([A-Z0-9]{5,12})\b/) || [])[1] || '';
        const unidad = buckets.unidad.join(' ').trim() || 'UN';

        currentItem = {
          codigoArticulo: code,
          descripcion: rawDesc,
          unidad: unidad,
          cantidad: valCant || 1,
          precioUnitario: valPUnit || 0,
          descuentoPorc: valDto || 0,
          precioConDto: effectiveNetPrice,
          total: valTotal !== undefined ? valTotal : (valCant || 1) * effectiveNetPrice,
          alicuotaIva: alicuotaIva
        };
      } else if (currentItem && buckets.descripcion.length > 0 && !valCant && valPUnit === undefined) {
        // Línea secundaria de descripción (como en Pronto Distribuidora)
        currentItem.descripcion += ' ' + buckets.descripcion.join(' ').trim();
        if (buckets.unidad.length > 0 && currentItem.unidad === 'UN') {
          currentItem.unidad = buckets.unidad.join(' ').trim();
        }
      }
    }

    if (currentItem) {
      pushItem(currentItem);
    }
  }

  function pushItem(it) {
    it.descripcion = it.descripcion.replace(/\s+/g, ' ').replace(/\s+-\s*$/, '').trim();
    if (/^(?:hoja\s*\d+|subtotal|total|\(\*\)|detalle de impuestos)/i.test(it.descripcion)) return;
    if (it.descripcion.length < 3) return;

    // Limpiar coletillas comunes en descripción (como UN al final)
    it.descripcion = it.descripcion.replace(/\s+(?:UN|Unidad\(es\)|Unidad|mts)\s*$/i, '').trim();

    const key = `${it.codigoArticulo}_${it.descripcion}_${it.cantidad}_${it.precioUnitario}`;
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
    subtotalNeto = Math.round(lineas.reduce((acc, l) => acc + (l.total || 0), 0) * 100) / 100;
  }
  if (!totalIva && subtotalNeto > 0) {
    totalIva = Math.round(subtotalNeto * 0.21 * 100) / 100;
  }
  if (!totalComprobante && subtotalNeto > 0) {
    totalComprobante = Math.round((subtotalNeto + totalIva) * 100) / 100;
  }

  return {
    empresaId: receptorEmpresaId,
    receptorNombre,
    receptorCuit,
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
 * Motor de Lectura Inteligente de Facturas y Comprobantes de Compra (PDF o Visión IA)
 */
export const parseFacturaConIA = async (file) => {
  // 1. Subir a Storage para almacenamiento permanente del comprobante
  const adjuntoUrl = await uploadDocumentToStorage(file, 'comprobantes_compra_adjuntos');

  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  // Si es un archivo PDF, usamos el motor nativo universal matemático
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

  // Si es imagen o el PDF no tenía texto seleccionable, intentar Gemini AI Vision
  const geminiKey = getGeminiKey();
  if (geminiKey) {
    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const imagePart = await fileToBase64(file);

      const prompt = `
Eres un asistente contable experto en facturas y comprobantes fiscales de Argentina (AFIP / ARCA).
Analiza este comprobante comercial o factura y extrae en formato JSON estricto con todos los datos y renglones:
{
  "empresaId": "ayala-nicolas",
  "receptorNombre": "Nombre de la empresa receptora o cliente (usualmente AYALA NICOLAS FEDERICO)",
  "receptorCuit": "CUIT del receptor (usualmente 20-31627562-2)",
  "proveedorNombre": "Nombre o Razón Social del emisor / proveedor (ej: TRIANGULAR S.A., REHAU, Pronto Distribuidora)",
  "proveedorCuit": "CUIT del proveedor en formato XX-XXXXXXXX-X",
  "tipoComprobante": "FAA" | "FAB" | "FAC" | "TICKET" | "NCA" | "NDA",
  "puntoVenta": 1,
  "numeroComprobante": 12345,
  "fechaEmision": "YYYY-MM-DD",
  "subtotalNeto": 0.00,
  "totalIva": 0.00,
  "totalComprobante": 0.00,
  "lineas": [
    {
      "codigoArticulo": "Código o referencia del artículo si figura en la factura",
      "descripcion": "Descripción clara del artículo",
      "unidad": "UN / Unidad / mts",
      "precioUnitario": 0.00,
      "descuentoPorc": 0.00,
      "precioConDto": 0.00,
      "cantidad": 1,
      "alicuotaIva": 0.21,
      "total": 0.00,
      "centroCosto": "COSTO VARIABLE"
    }
  ]
}
IMPORTANTE:
- "precioUnitario" es el precio antes de descuento.
- "descuentoPorc" es el % de descuento (ej: 50 o 7).
- "precioConDto" es el precio unitario neto con descuento.
- "total" es la multiplicación de cantidad * precioConDto.
- Si hay renglones despiece del combo con precio 0.00, inclúyelos con su cantidad real.
Responde ÚNICAMENTE con el objeto JSON válido.
`;

      const result = await model.generateContent([prompt, imagePart]);
      const responseText = result.response.text().trim();
      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsedData = JSON.parse(cleanJson);

      return {
        ...parsedData,
        empresaId: parsedData.empresaId || (parsedData.receptorCuit?.includes('20316275622') || parsedData.receptorNombre?.includes('AYALA') ? 'ayala-nicolas' : 'ayala-nicolas'),
        adjuntoUrl,
        exitoIA: true
      };
    } catch (geminiErr) {
      console.error('Error procesando con Gemini AI:', geminiErr);
    }
  }

  return {
    empresaId: 'ayala-nicolas',
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
