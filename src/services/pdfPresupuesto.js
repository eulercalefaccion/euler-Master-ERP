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
const drawLogo = (doc, x, y) => {
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...EULER_GOLD);
  doc.text('⚡ EULER', x, y, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...WHITE);
  doc.text('CALEFACCIÓN POR AGUA', x, y + 7, { align: 'center' });
};

// ─── PÁGINA 1: Portada ───────────────────────────────────────────────────────
const buildPortada = (doc, presupuesto) => {
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
  drawLogo(doc, W / 2, 80);

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
  const campos = [
    ['Cliente:',           presupuesto.clientName || presupuesto.name || '—'],
    ['N° Presupuesto:',    presupuesto.presupuestoNumber || '—'],
    ['Revisión:',          `Rev ${presupuesto.revision || 0}`],
    ['Dirección de obra:', presupuesto.location || '—'],
    ['Fecha:',             presupuesto.date || new Date().toLocaleDateString('es-AR')],
    ['Modo de precios:',   presupuesto.canal === 'canal2' ? 'Sin IVA (Canal 2)' : 'Con IVA 21% discriminado'],
  ];

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
    doc.text(String(valor), W / 2 + 8, yPos);
    yPos += 14;
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
  doc.text(`EULER Calefacción por Agua  |  ${presupuesto.presupuestoNumber || ''}  Rev ${presupuesto.revision || 0}`, W - 14, 14, { align: 'right' });

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

    const tableData = items.map(item => [
      item.descripcion || '—',
      `${item.quantity || 1} ${item.unidad || 'u.'}`,
      formatARS(item.unitPrice),
      formatARS(item.subtotal),
    ]);

    autoTable(doc, {
      startY: startY + 3,
      head: [['Descripción', 'Cantidad', 'Precio Unit.', 'Subtotal']],
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
        0: { cellWidth: 'auto' },
        1: { cellWidth: 28, halign: 'center' },
        2: { cellWidth: 32, halign: 'right' },
        3: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: 14, right: 14 },
    });

    return doc.lastAutoTable.finalY + 8;
  };

  startY = buildSection(materiales, 'MATERIALES Y EQUIPOS', startY);
  startY = buildSection(manoDeObra, 'MANO DE OBRA E INSTALACIÓN', startY + 2);

  // Total
  const total = quoteItems.reduce((s, i) => s + (i.subtotal || 0), 0);
  const modoLabel = presupuesto.canal === 'canal2'
    ? 'TOTAL — Precios sin IVA (Canal 2)'
    : 'TOTAL — Precios con IVA 21% discriminado';

  doc.setFillColor(...EULER_LIGHT);
  doc.roundedRect(14, startY, W - 28, 14, 2, 2, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...EULER_DARK);
  doc.text(modoLabel, 20, startY + 9.5);
  doc.setTextColor(...EULER_MID);
  doc.text(formatARS(total), W - 14, startY + 9.5, { align: 'right' });

  // Notas
  if (presupuesto.notas) {
    const notasY = startY + 22;
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
    'Efectivo, transferencia, cheques/echeqs. (Consultar por tarjetas de crédito).',
    'Cañería: Al aprobar la oferta.',
    'Equipos: A convenir.',
    'Mano de obra de instalación de equipos: A convenir.',
  ], y);

  y = addSection('2) PLAZO DE ENTREGA', [
    'Provisión de equipos: inmediato.',
    'Cañería: Hasta 15 días hábiles a partir del comienzo del trabajo.',
    'Instalación de caldera y radiadores: 3 días hábiles según tiempos de construcción.',
  ], y);

  const notas = [
    'El presente presupuesto tiene validez de 10 días hábiles a partir de la fecha de confeccionado.',
    'Los valores están expresados en pesos argentinos, calculados según el dólar oficial BNA (tipo vendedor) al día de emisión. Estos valores se actualizarán según la cotización vigente al momento del pago o avance de obra.',
    'Para la instalación del termostato de ambiente, se debe dejar un cableado desde la caldera hasta la ubicación del mismo según instrucciones nuestras.',
    'Para el funcionamiento de la caldera se debe dejar una conexión de entrada de agua con presión igual o superior a 1 kg/cm². De no conseguir dicha presión, se debe adicionar una bomba presurizadora.',
    'La instalación no incluye la instalación eléctrica del tomacorriente necesaria para el funcionamiento de la caldera.',
    'El presente presupuesto NO incluye ningún trabajo ni material relacionado con la cañería de GAS, agua fría ni agua caliente sanitaria.',
    'El trabajo de instalación de cañería incluye el canaleteo de pisos y paredes y se entrega con la misma amurada y fijada, quedando a cargo del cliente el posterior tapado de las canaletas.',
    'Puesta en marcha inicial (PEMIO): se realiza inmediatamente después de finalizar la instalación. Requiere todos los servicios (electricidad, gas y agua) y presencia de los propietarios.',
    'Condiciones de garantía — Calderas: 12 meses a partir de la PEMIO (extendible a 24 meses). Radiadores: 10 años a partir de la PEMIO.',
  ];

  y = addSection('3) NOTAS', notas.map((n, i) => `${String.fromCharCode(97 + i)}) ${n}`), y);

  // Firma
  const H = doc.internal.pageSize.getHeight();
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY_TEXT);
  doc.text('Sin más, saluda Atte.', W - 14, H - 35, { align: 'right' });
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...EULER_DARK);
  doc.text('Ing. Nicolas F. Ayala', W - 14, H - 25, { align: 'right' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...EULER_MID);
  doc.text('EULER CALEFACCIÓN POR AGUA', W - 14, H - 18, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY_TEXT);
  doc.text('CEL 3415695849  |  www.euler.com.ar', W - 14, H - 12, { align: 'right' });
};

// ─── FUNCIÓN PRINCIPAL ───────────────────────────────────────────────────────

/**
 * Genera y descarga el PDF del presupuesto.
 * @param {Object} presupuesto - El documento del presupuesto de Firestore
 * @param {Array}  folletoUrls - Array de { nombre, url } de Firebase Storage (opcional)
 * @param {Function} onProgress - Callback (0..1) para barra de progreso
 */
export async function generarPDFPresupuesto(presupuesto, folletoUrls = [], onProgress = null) {
  const jspdfInstance = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Paso 1-3: páginas del presupuesto
  onProgress?.(0.1);
  buildPortada(jspdfInstance, presupuesto);
  onProgress?.(0.25);
  buildTablaItems(jspdfInstance, presupuesto);
  onProgress?.(0.4);
  buildCondiciones(jspdfInstance, presupuesto);
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
        const res = await fetch(url);
        const bytes = await res.arrayBuffer();
        const folletoDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await mainDoc.copyPages(folletoDoc, folletoDoc.getPageIndices());
        pages.forEach(p => mainDoc.addPage(p));
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
  const rev     = p.revision > 0 ? `_Rev${p.revision}` : '';
  return `Presupuesto_Euler_${cliente}_${numero}${rev}.pdf`;
};

export default generarPDFPresupuesto;
