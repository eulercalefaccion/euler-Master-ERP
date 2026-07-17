/**
 * pdfPresupuesto.js
 * Genera el PDF del presupuesto Euler usando jsPDF + pdf-lib para combinar folletos.
 * Estructura del documento:
 *   1. Portada (fondo azul Euler)
 *   2. Tabla de ítems cotizados (materiales + mano de obra)
 *   3. Condiciones comerciales
 *   [4..N] Folletos de productos (PDFs de Firebase Storage)
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PDFDocument } from 'pdf-lib';

// ─── Constantes de marca ─────────────────────────────────────────────────────
const EULER_DARK  = [13,  42, 78];    // #0D2A4E
const EULER_MID   = [26,  74, 122];   // #1A4A7A
const EULER_GOLD  = [245, 166, 35];   // #F5A623
const EULER_LIGHT = [232, 239, 247];  // #E8EFF7
const WHITE       = [255, 255, 255];
const GRAY_TEXT   = [68,  68,  68];
const GRAY_LIGHT  = [245, 245, 245];

const formatARS = (n) =>
  n != null ? `$ ${Math.round(n).toLocaleString('es-AR')}` : '—';

// ─── LOGO Euler (texto estilizado, se reemplaza con imagen si está disponible)
const drawLogo = (doc, x, y, logoBase64) => {
  if (logoBase64) {
    // Logo proporcionado (apaisado)
    const imgWidth = 120;
    const imgHeight = 40;
    // Ajustar posición X e Y (x es el centro, y es la posición superior aproximada en el original)
    doc.addImage(logoBase64, 'PNG', x - (imgWidth / 2), y - 10, imgWidth, imgHeight);
  } else {
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...EULER_GOLD);
    doc.text('⚡ EULER', x, y, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...WHITE);
    doc.text('CALEFACCIÓN POR AGUA', x, y + 7, { align: 'center' });
  }
};

// ─── PÁGINA 1: Portada ───────────────────────────────────────────────────────
const buildPortada = (doc, presupuesto, logoBase64) => {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // Fondo azul oscuro
  doc.setFillColor(...EULER_DARK);
  doc.rect(0, 0, W, H, 'F');

  // Franja decorativa inferior
  doc.setFillColor(...EULER_MID);
  doc.rect(0, H - 22, W, 22, 'F');
  doc.setFillColor(...EULER_GOLD);
  doc.rect(0, H - 24, W, 2, 'F');

  // Logo
  drawLogo(doc, W / 2, 80, logoBase64);

  // Separador
  doc.setDrawColor(...[42, 90, 138]);
  doc.setLineWidth(0.5);
  doc.line(40, 100, W - 40, 100);

  // Título
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...WHITE);
  doc.text('PRESUPUESTO DE CALEFACCIÓN POR AGUA', W / 2, 116, { align: 'center' });

  // Datos del presupuesto
  const versionSuffix = (presupuesto.revision !== undefined) ? '' : ''; // The filename already has _RevX, we don't append it here because it might duplicate. Let's just use the presupuestoNumber directly since we updated it in KanbanBoard.
  
  const campos = [
    ['Cliente:',           presupuesto.clientName || presupuesto.name || '—'],
    ['N° Presupuesto:',    `${presupuesto.presupuestoNumber || '—'}`],
    ['Revisión:',          presupuesto.revision !== undefined ? `Rev${presupuesto.revision}` : 'Rev0'],
    ['Dirección de obra:', presupuesto.location || '—'],
    ['Fecha:',             presupuesto.date || new Date().toLocaleDateString('es-AR')],
    ['Modo de precios:',   presupuesto.canal === 'canal2' ? 'Sin Factura (Canal 2)' : 'Con IVA 21% discriminado'],
  ];

  if (presupuesto.revision > 0) {
    const allChanges = [];
    if (presupuesto.revisionsHistory) {
      presupuesto.revisionsHistory.forEach((hist) => {
        if (hist.cambiosPublicos && hist.revisionNumber > 0) {
          allChanges.push(`Rev${hist.revisionNumber}: ${hist.cambiosPublicos}`);
        }
      });
    }
    if (presupuesto.cambiosPublicos) {
      allChanges.push(`Rev${presupuesto.revision}: ${presupuesto.cambiosPublicos}`);
    }
    
    if (allChanges.length > 0) {
      campos.push(['Historial de Cambios:', allChanges.join('\n')]);
    }
  }

  const labelColor = [106, 159, 192];
  let yPos = 140;

  campos.forEach(([label, valor]) => {
    if (!valor || valor === '—' || valor === '') return;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...labelColor);
    doc.text(label, W / 2 - 5, yPos, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...WHITE);
    
    // Wrap text dynamically to prevent overflow
    const maxTextWidth = W / 2 - 20;
    const lines = doc.splitTextToSize(String(valor), maxTextWidth);
    doc.text(lines, W / 2 + 8, yPos);
    
    yPos += Math.max(14, lines.length * 5 + 4);
  });

  // Footer
  doc.setFontSize(9);
  doc.setTextColor(...labelColor);
  doc.text('www.euler.com.ar  |  info@euler.com.ar  |  CEL 341 5695849', W / 2, H - 10, { align: 'center' });
};

// ─── PÁGINA 2: Tabla de ítems ────────────────────────────────────────────────
const buildTablaItems = (doc, presupuesto) => {
  doc.addPage();
  const W = doc.internal.pageSize.getWidth();

  // Mini header
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...EULER_MID);
  doc.text(`EULER Calefacción por Agua  |  ${presupuesto.presupuestoNumber || ''}  V${presupuesto.revision || 0}`, W - 14, 14, { align: 'right' });

  // Título de sección
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...EULER_DARK);
  doc.text('EULER — Calefacción por Agua', 14, 25);

  // Línea dorada
  doc.setFillColor(...EULER_GOLD);
  doc.rect(14, 28, W - 28, 1.5, 'F');

  // Info cliente
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...GRAY_TEXT);
  doc.text(presupuesto.clientName || presupuesto.name || '', 14, 38);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(presupuesto.location || '', 14, 44);

  const quoteItems = presupuesto.quoteItems || [];
  const materiales = quoteItems.filter(i => i.tipo !== 'mano_de_obra' && i.tipo !== 'servicio');
  const manoDeObra = quoteItems.filter(i => i.tipo === 'mano_de_obra' || i.tipo === 'servicio');

  let startY = 52;

  const buildSection = (items, titulo, startY) => {
    if (items.length === 0) return startY;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...EULER_DARK);
    doc.text(titulo, 14, startY);

    const tableData = items.map((item, idx) => [
      (idx + 1).toString(),
      item.descripcion || '—',
      `${item.quantity || 1} ${item.unidad || 'u.'}`,
      formatARS(item.unitPrice),
      formatARS(item.subtotal),
    ]);

    autoTable(doc, {
      startY: startY + 3,
      head: [['#', 'Descripción', 'Cantidad', 'Precio Unit.', 'Subtotal']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: EULER_DARK,
        textColor: WHITE,
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: { fontSize: 9, textColor: GRAY_TEXT },
      alternateRowStyles: { fillColor: GRAY_LIGHT },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 28, halign: 'center' },
        3: { cellWidth: 32, halign: 'right' },
        4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: 14, right: 14 },
    });

    return doc.lastAutoTable.finalY + 8;
  };

  startY = buildSection(materiales, 'MATERIALES Y EQUIPOS', startY);
  startY = buildSection(manoDeObra, 'MANO DE OBRA E INSTALACIÓN', startY + 2);

  // Total
  const total = quoteItems.reduce((s, i) => s + (i.subtotal || 0), 0);

  if (presupuesto.canal === 'canal2') {
    doc.setFillColor(...EULER_LIGHT);
    doc.roundedRect(14, startY, W - 28, 14, 2, 2, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...EULER_DARK);
    doc.text('TOTAL — Precios sin Factura (Canal 2)', 20, startY + 9.5);
    doc.setTextColor(...EULER_MID);
    doc.text(formatARS(total), W - 14, startY + 9.5, { align: 'right' });
    startY += 20;
  } else {
    const subtotalSinIva = total;
    const iva = Math.round(total * 0.21);
    const totalConIva = subtotalSinIva + iva;

    doc.setFillColor(...EULER_LIGHT);
    doc.roundedRect(14, startY, W - 28, 28, 2, 2, 'F');

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY_TEXT);
    doc.text('Precio sin IVA:', 20, startY + 8);
    doc.text(formatARS(subtotalSinIva), W - 14, startY + 8, { align: 'right' });

    doc.text('IVA (21%):', 20, startY + 14);
    doc.text(formatARS(iva), W - 14, startY + 14, { align: 'right' });

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...EULER_DARK);
    doc.text('TOTAL (Precio IVA incluido):', 20, startY + 22);
    doc.setTextColor(...EULER_MID);
    doc.text(formatARS(totalConIva), W - 14, startY + 22, { align: 'right' });

    startY += 34;
  }

  // Notas
  if (presupuesto.notas) {
    const notasY = startY + 2;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...EULER_DARK);
    doc.text('Observaciones:', 14, notasY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY_TEXT);
    const lines = doc.splitTextToSize(presupuesto.notas, W - 28);
    doc.text(lines, 14, notasY + 6);
  }
};

// ─── PÁGINA 3: Condiciones ───────────────────────────────────────────────────
const buildCondiciones = (doc, presupuesto) => {
  doc.addPage();
  const W = doc.internal.pageSize.getWidth();

  // Mini header
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...EULER_MID);
  doc.text('www.euler.com.ar  |  info@euler.com.ar', W - 14, 14, { align: 'right' });

  // Título
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...EULER_DARK);
  doc.text('EULER — Calefacción por Agua', 14, 25);

  // Línea dorada
  doc.setFillColor(...EULER_GOLD);
  doc.rect(14, 28, W - 28, 1.5, 'F');

  const addSection = (titulo, items, yStart) => {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...EULER_MID);
    doc.text(titulo, 14, yStart);
    let y = yStart + 6;
    items.forEach(item => {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...GRAY_TEXT);
      const lines = doc.splitTextToSize(`— ${item}`, W - 32);
      doc.text(lines, 18, y);
      y += lines.length * 5.5;
    });
    return y + 4;
  };

  let y = 38;

  y = addSection('1) FORMA DE PAGO', [
    'Efectivo, transferencia, cheques/echeqs. (consultar por tarjetas de credito).',
    'Cañería: Al aprobar la oferta.',
    'Equipos: A convenir.',
    'Mano de obra de instalación de equipos: A convenir.',
  ], y);

  y = addSection('2) PLAZO DE ENTREGA', [
    'Provision de equipos: inmediato.',
    'Cañería: Hasta 15 días hábiles a partir del comienzo del trabajo.',
    'Instalación de caldera y radiadores: 3 días hábiles segun tiempos de construcción.',
  ], y);

  const notas = [
    'El presente presupuesto tiene validez de 10 días hábiles a partir de la fecha de confeccionado.',
    'Los valores están expresados en pesos argentinos, calculados según el dólar oficial BNA (tipo vendedor) al día de emisión de éste presupuesto, éstos valores se actualizarán según la cotización vigente al momento del pago o avance de obra.',
    'Para la instalación del termostato de ambiente, se debe dejar un cableado desde la caldera hasta la ubicacion del mismo segun instrucciones nuestras.',
    'Para el funcionamiento de la caldera se debe dejar una conexión de entrada de agua (a realizar por el cliente segun instrucciones nuestras) y es excluyente que la presion de agua a la entrada sea igual o superior a 1 kg/cm2. De no conseguir dicha presion por altura del tanque, se debe adicionar una bomba presurizadora.',
    'La instalación no incluye la instalación eléctrica del tomacorriente, necesaria para el funcionamiento de la caldera.',
    'El presente presupuesto NO incluye ningun trabajo ni material relacionado con la cañería de GAS, agua fria ni agua caliente sanitaria necesaria y excluyente para el funcionamiento de la caldera.',
    'El trabajo de instalación de cañería incluye el canaleteo de pisos y paredes y se entrega con la misma amurada y fijada, quedando a cargo del cliente el posterior tapado de las canaletas.',
    'Puesta en marcha inicial (PEMIO): tiene por objetivo probar el sistema, ponerlo a punto, explicar el funcionamiento a los propietarios y activar la garantía de los equipos. Se realiza inmediatamente despues de finalizar la instalación. Para realizarla se debe contar con todos los servicios (energía eléctrica, gas y agua) y con la presencia de los propietarios o responsables. De no cumplirse alguno de estos requisitos, la PEMIO se realizara en el momento que se cumplan dichos requisitos, con costo a cargo del cliente.',
    'Condiciones de garantía: Calderas: 12 meses a partir de la PEMIO. La garantía puede extenderse 12 meses adicionales (logrando 24 meses totales) contratando un servicio de mantenimiento preventivo autorizado. Radiadores: 10 años a partir de la PEMIO.',
  ];

  y = addSection('3) NOTAS', notas.map((n, i) => `${String.fromCharCode(97 + i)}) ${n}`), y);
};

// ─── PÁGINA 4: Garantías y Cierre ─────────────────────────────────────────────
const buildGarantiasYCierre = (doc, presupuesto) => {
  doc.addPage();
  const W = doc.internal.pageSize.getWidth();

  // Mini header
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...EULER_MID);
  doc.text('www.euler.com.ar  |  info@euler.com.ar', W - 14, 14, { align: 'right' });

  // Título
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...EULER_DARK);
  doc.text('EULER — Garantías y Cierre', 14, 25);

  // Línea dorada
  doc.setFillColor(...EULER_GOLD);
  doc.rect(14, 28, W - 28, 1.5, 'F');

  const addGarantia = (titulo, desc, yStart) => {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...EULER_DARK);
    doc.text(titulo, 14, yStart);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY_TEXT);
    const lines = doc.splitTextToSize(desc, W - 28);
    doc.text(lines, 14, yStart + 5.5);
    return yStart + 5.5 + (lines.length * 5) + 6;
  };

  let y = 38;
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...EULER_MID);
  doc.text('GARANTÍAS', 14, y);
  
  y = addGarantia(
    'Calderas:',
    '12 meses de garantía a partir de la puesta en marcha inicial obligatoria (PEMIO). Extendible a 24 meses totales contratando servicio de mantenimiento preventivo autorizado.',
    y + 8
  );

  y = addGarantia(
    'Radiadores:',
    '10 años de garantía a partir de la PEMIO.',
    y
  );

  y = addGarantia(
    'Instalación:',
    'Euler garantiza la correcta ejecución de los trabajos. La garantía de la mano de obra es de 6 meses a partir de la puesta en marcha. Cualquier inconveniente derivado de la instalación será atendido sin cargo durante el periodo de garantía.',
    y
  );

  // Proyecto
  y += 4;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...EULER_MID);
  doc.text('PROYECTO', 14, y);

  const quoteItems = presupuesto.quoteItems || [];
  const total = quoteItems.reduce((s, i) => s + (i.subtotal || 0), 0);
  
  let totalText = '';
  if (presupuesto.canal === 'canal2') {
    totalText = `${formatARS(total)} (sin factura)`;
  } else {
    const subtotalSinIva = Math.round(total / 1.21);
    const iva = total - subtotalSinIva;
    totalText = `${formatARS(subtotalSinIva)} + IVA = ${formatARS(total)}`;
  }

  const projFields = [
    ['Cliente:',           presupuesto.clientName || presupuesto.name || '—'],
    ['Direccion de obra:',  presupuesto.location || '—'],
    ['N° Presupuesto:',    presupuesto.presupuestoNumber || '—'],
    ['Fecha:',             presupuesto.date || new Date().toLocaleDateString('es-AR')],
    ['Total:',             totalText],
  ];

  autoTable(doc, {
    startY: y + 4,
    body: projFields,
    theme: 'plain',
    bodyStyles: { fontSize: 9.5, textColor: GRAY_TEXT, cellPadding: 3.5 },
    columnStyles: {
      0: { cellWidth: 40, fontStyle: 'bold', textColor: EULER_DARK },
      1: { cellWidth: 'auto' }
    },
    alternateRowStyles: { fillColor: GRAY_LIGHT },
    margin: { left: 14, right: 14 }
  });

  y = doc.lastAutoTable.finalY + 15;

  // Firma
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY_TEXT);
  doc.text('Sin más, saluda Atte.', W - 14, y, { align: 'right' });
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...EULER_DARK);
  doc.text('Ing. Nicolas F. Ayala', W - 14, y + 10, { align: 'right' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...EULER_MID);
  doc.text('EULER CALEFACCIÓN POR AGUA', W - 14, y + 16, { align: 'right' });
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY_TEXT);
  doc.text('CEL 3415695849  |  www.euler.com.ar', W - 14, y + 22, { align: 'right' });
};

// ─── FUNCIÓN PRINCIPAL ───────────────────────────────────────────────────────

// Helper para convertir imagen a Base64
const getBase64ImageFromURL = (url) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = error => reject(error);
    img.src = url;
  });
};

/**
 * Genera y descarga el PDF del presupuesto.
 * @param {Object} presupuesto - El documento del presupuesto de Firestore
 * @param {Array}  folletoUrls - Array de { nombre, url } de Firebase Storage (opcional)
 * @param {Function} onProgress - Callback (0..1) para barra de progreso
 */
export async function generarPDFPresupuesto(presupuesto, folletoUrls = [], onProgress = null) {
  const jspdfInstance = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Cargar el logo desde public/logo_euler.png si existe
  let logoBase64 = null;
  try {
    logoBase64 = await getBase64ImageFromURL('/logo_euler.png');
  } catch (e) {
    console.warn('No se pudo cargar el logo de Euler', e);
  }

  // Paso 1-4: páginas del presupuesto
  onProgress?.(0.1);
  buildPortada(jspdfInstance, presupuesto, logoBase64);
  onProgress?.(0.2);
  buildTablaItems(jspdfInstance, presupuesto);
  onProgress?.(0.3);
  buildCondiciones(jspdfInstance, presupuesto);
  onProgress?.(0.4);
  buildGarantiasYCierre(jspdfInstance, presupuesto);
  onProgress?.(0.5);

  // Serializar el PDF principal
  const mainPdfBytes = jspdfInstance.output('arraybuffer');

  if (folletoUrls.length === 0) {
    // Sin folletos: descargar directo
    jspdfInstance.save(getNombreArchivo(presupuesto));
    onProgress?.(1.0);
    return;
  }

  // Con folletos: combinar con pdf-lib
  try {
    const mainDoc = await PDFDocument.load(mainPdfBytes);
    const total = folletoUrls.length;

    for (let i = 0; i < folletoUrls.length; i++) {
      const { url } = folletoUrls[i];
      try {
        let fetchUrl = url;
        if (url.includes('firebasestorage.googleapis.com')) {
          fetchUrl = url.replace('https://firebasestorage.googleapis.com/', '/proxy/storage/');
        }
        
        const res = await fetch(fetchUrl);
        if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
        
        const contentType = res.headers.get('content-type') || '';
        const bytes = await res.arrayBuffer();
        
        const isPng = contentType.includes('image/png') || url.toLowerCase().includes('.png');
        const isJpg = contentType.includes('image/jpeg') || contentType.includes('image/jpg') || url.toLowerCase().includes('.jpg') || url.toLowerCase().includes('.jpeg');
        
        if (isPng || isJpg) {
          // Embed image onto a new A4 page
          const img = isPng ? await mainDoc.embedPng(bytes) : await mainDoc.embedJpg(bytes);
          const page = mainDoc.addPage([595.27, 841.89]); // A4 size in points
          const { width, height } = img.scaleToFit(595.27, 841.89);
          const x = (595.27 - width) / 2;
          const y = (841.89 - height) / 2;
          page.drawImage(img, { x, y, width, height });
        } else {
          // Load as PDF
          const folletoDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
          const pages = await mainDoc.copyPages(folletoDoc, folletoDoc.getPageIndices());
          pages.forEach(p => mainDoc.addPage(p));
        }
      } catch (e) {
        console.warn('No se pudo incluir folleto:', url, e);
      }
      onProgress?.(0.5 + (0.45 * (i + 1)) / total);
    }

    const finalBytes = await mainDoc.save();
    const blob = new Blob([finalBytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = getNombreArchivo(presupuesto);
    link.click();
    URL.revokeObjectURL(link.href);
    onProgress?.(1.0);
  } catch (err) {
    console.error('Error combinando PDFs con pdf-lib:', err);
    // Fallback: descargar sin folletos
    jspdfInstance.save(getNombreArchivo(presupuesto));
    onProgress?.(1.0);
  }
}

const getNombreArchivo = (p) => {
  const cliente = (p.clientName || p.name || 'cliente').replace(/\s+/g, '_').substring(0, 25);
  const numero  = p.presupuestoNumber || 'S-N';
  return `Presupuesto_Euler_${cliente}_${numero}.pdf`;
};

export default generarPDFPresupuesto;
