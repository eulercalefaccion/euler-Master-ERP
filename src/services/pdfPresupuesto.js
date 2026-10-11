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
import { calcularDescuentosPresupuesto } from './descuentosService';

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

const getPresupuestoFecha = (presupuesto) => {
  if (presupuesto?.revisionSavedAt) {
    const d = new Date(presupuesto.revisionSavedAt);
    if (!isNaN(d.getTime())) return d.toLocaleDateString('es-AR');
  }
  if (presupuesto?.savedAt) {
    const d = new Date(presupuesto.savedAt);
    if (!isNaN(d.getTime())) return d.toLocaleDateString('es-AR');
  }
  if (presupuesto?.revision > 0 && presupuesto?.revisionsHistory && presupuesto.revisionsHistory.length > 0) {
    const lastHist = presupuesto.revisionsHistory[presupuesto.revisionsHistory.length - 1];
    if (lastHist?.savedAt) {
      const d = new Date(lastHist.savedAt);
      if (!isNaN(d.getTime())) return d.toLocaleDateString('es-AR');
    }
  }
  if (presupuesto?.date) return presupuesto.date;
  if (presupuesto?.createdAt) {
    const d = presupuesto.createdAt.toDate ? presupuesto.createdAt.toDate() : new Date(presupuesto.createdAt);
    if (!isNaN(d.getTime())) return d.toLocaleDateString('es-AR');
  }
  return new Date().toLocaleDateString('es-AR');
};

// ─── Encabezado / pie comunes (mismo lenguaje visual que la factura ARCA) ────
const GRAY_SOFT = [100, 116, 139];
const LINE_SOFT = [203, 213, 225];
const DOMICILIO_COMERCIAL = 'Perez Bulnes 6044 - Rosario - Santa Fe';
const CONTACTO = `www.euler.com.ar  ·  info@euler.com.ar  ·  Cel. 341 569-5849  ·  ${DOMICILIO_COMERCIAL}`;
/** Primera línea útil debajo del encabezado (con y sin título de sección). */
const CONTENT_TOP = 49;
const CONTENT_TOP_CONT = 43;
const PAGE_BOTTOM = 18;

const numeroPresupuesto = (p) => {
  const num = p.presupuestoNumber || 'S/N';
  return String(num).includes('_Rev')
    ? `N° ${num}`
    : `N° ${num}  ·  Rev${p.revision !== undefined ? p.revision : 0}`;
};

/** Encabezado de las páginas interiores: logo, recuadro X y título PRESUPUESTO. */
const drawHeader = (doc, p, logoHeader, seccion = '') => {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(...EULER_DARK); doc.rect(0, 0, W, 3, 'F');
  doc.setFillColor(...EULER_GOLD); doc.rect(0, 3, W, 0.8, 'F');

  if (logoHeader) {
    doc.addImage(logoHeader, 'PNG', 14, 9, 50, 14.2);
  } else {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...EULER_DARK);
    doc.text('EULER', 14, 18);
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...EULER_MID);
    doc.text('calefacción por agua', 14, 23);
  }

  // Recuadro "X": documento no válido como factura
  const by = 8;
  doc.setDrawColor(...EULER_DARK); doc.setLineWidth(0.6); doc.setFillColor(...WHITE);
  doc.roundedRect(W / 2 - 9, by, 18, 18, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(24); doc.setTextColor(...EULER_DARK);
  doc.text('X', W / 2, by + 12.4, { align: 'center' });
  doc.setFontSize(5.6); doc.setTextColor(...GRAY_SOFT);
  doc.text('DOCUMENTO NO VÁLIDO', W / 2, by + 21.6, { align: 'center' });
  doc.text('COMO FACTURA', W / 2, by + 24.1, { align: 'center' });

  // Título
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...EULER_DARK);
  doc.text('PRESUPUESTO', W - 14, 16.5, { align: 'right' });
  doc.setFontSize(10.5); doc.setTextColor(...EULER_MID);
  doc.text(numeroPresupuesto(p), W - 14, 23, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY_SOFT);
  doc.text(`Fecha: ${getPresupuestoFecha(p)}`, W - 14, 28, { align: 'right' });

  // Separador con acento dorado
  doc.setDrawColor(...LINE_SOFT); doc.setLineWidth(0.3); doc.line(14, 35, W - 14, 35);
  doc.setFillColor(...EULER_GOLD); doc.rect(14, 34.6, 28, 0.9, 'F');

  if (seccion) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...EULER_MID);
    doc.text(seccion, 14, 43);
  }
};

/** Si no entra `alto` desde `y`, agrega página con encabezado y devuelve la nueva y. */
const asegurarEspacio = (doc, p, logoHeader, y, alto) => {
  const H = doc.internal.pageSize.getHeight();
  if (y + alto <= H - PAGE_BOTTOM) return y;
  doc.addPage();
  drawHeader(doc, p, logoHeader);
  return CONTENT_TOP_CONT;
};

/** Pie con datos de contacto en todas las páginas interiores. */
const drawFooters = (doc, desde = 2) => {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  for (let i = desde; i <= doc.getNumberOfPages(); i++) {
    doc.setPage(i);
    doc.setFillColor(...EULER_GOLD); doc.rect(14, H - 12, W - 28, 0.5, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY_SOFT);
    doc.text(CONTACTO, W / 2, H - 7.5, { align: 'center' });
  }
};

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
  drawLogo(doc, W / 2, 70, logoBase64);

  // Título bien visible (centrado manual: jsPDF no compensa charSpace al centrar)
  const centrado = (txt, y, cs) => {
    const w = doc.getTextWidth(txt) + cs * (txt.length - 1);
    doc.text(txt, W / 2 - w / 2, y, { charSpace: cs });
  };
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(40);
  doc.setTextColor(...WHITE);
  centrado('PRESUPUESTO', 121, 1.5);
  doc.setFillColor(...EULER_GOLD);
  doc.rect(W / 2 - 25, 126, 50, 1.2, 'F');
  doc.setFontSize(10.5);
  doc.setTextColor(...EULER_GOLD);
  centrado('CALEFACCIÓN POR AGUA', 133.5, 1);

  // Número + revisión en píldora dorada
  const pillTxt = numeroPresupuesto(presupuesto);
  doc.setFontSize(11);
  const pillW = doc.getTextWidth(pillTxt) + 12;
  doc.setFillColor(...EULER_GOLD);
  doc.roundedRect(W / 2 - pillW / 2, 138.5, pillW, 8.5, 4.25, 4.25, 'F');
  doc.setTextColor(...EULER_DARK);
  doc.text(pillTxt, W / 2, 144.3, { align: 'center' });

  // Datos del presupuesto (metadatos)
  const campos = [
    ['Cliente:',           presupuesto.clientName || presupuesto.name || '—'],
    ['Dirección de obra:', presupuesto.location || '—'],
    ['Fecha:',             getPresupuestoFecha(presupuesto)],
    ['Modo de precios:',   (presupuesto.canal === 'canal2' || presupuesto.canal === 'descuento') ? 'Con Descuento Comercial' : 'Con IVA 21% discriminado'],
  ];

  const labelColor = [106, 159, 192];
  let yPos = 159;

  campos.forEach(([label, valor]) => {
    if (!valor || valor === '—' || valor === '') return;
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...labelColor);
    doc.text(label, W / 2 - 5, yPos, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...WHITE);
    
    // Wrap text dynamically to prevent overflow
    const maxTextWidth = W / 2 - 20;
    const lines = doc.splitTextToSize(String(valor), maxTextWidth);
    doc.text(lines, W / 2 + 8, yPos);
    
    yPos += Math.max(9, lines.length * 4.5 + 3.5);
  });

  // ── Historial de Cambios (ocupa todo el ancho de la página para no superar márgenes) ──
  if (presupuesto.revision > 0) {
    const changeItems = [];
    if (presupuesto.revisionsHistory) {
      presupuesto.revisionsHistory.forEach((hist) => {
        if (hist.cambiosPublicos && hist.revisionNumber > 0) {
          const lines = String(hist.cambiosPublicos).split('\n').map(l => l.trim()).filter(Boolean);
          if (lines.length > 0) {
            changeItems.push({
              rev: `Rev${hist.revisionNumber}`,
              lines
            });
          }
        }
      });
    }
    if (presupuesto.cambiosPublicos) {
      const lines = String(presupuesto.cambiosPublicos).split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length > 0) {
        changeItems.push({
          rev: `Rev${presupuesto.revision}`,
          lines
        });
      }
    }

    if (changeItems.length > 0) {
      const maxBottom = H - 28;
      const xLeft = 24;
      const contentWidth = W - 48; // 162mm en A4
      const indent = 5;
      const itemWidth = contentWidth - indent;

      // Unificar en lista para calcular espacio
      const flatList = [];
      changeItems.forEach((grp) => {
        flatList.push({ type: 'rev', text: `${grp.rev}:` });
        grp.lines.forEach((line) => {
          flatList.push({ type: 'line', text: `•  ${line}` });
        });
      });

      // Cálculo de fuente e interlineado dinámico según cantidad de elementos
      let fontSize = 8.5;
      let lineHeight = 4.2;
      let isTwoCols = false;

      doc.setFontSize(fontSize);
      let totalLines = 0;
      flatList.forEach((item) => {
        const w = item.type === 'rev' ? contentWidth : itemWidth;
        const wrapped = doc.splitTextToSize(item.text, w);
        totalLines += wrapped.length;
      });

      const availableH = maxBottom - yPos - 8;
      if (totalLines * lineHeight > availableH) {
        fontSize = 7.5;
        lineHeight = 3.6;
        doc.setFontSize(fontSize);
        totalLines = 0;
        flatList.forEach((item) => {
          const w = item.type === 'rev' ? contentWidth : itemWidth;
          const wrapped = doc.splitTextToSize(item.text, w);
          totalLines += wrapped.length;
        });

        if (totalLines * lineHeight > availableH) {
          isTwoCols = true;
          fontSize = 7.5;
          lineHeight = 3.4;
        }
      }

      // Título de la sección
      yPos += 3;
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...labelColor);
      doc.text('Historial de Cambios:', xLeft, yPos);
      yPos += 5.2;

      if (!isTwoCols) {
        doc.setFontSize(fontSize);
        flatList.forEach((item) => {
          if (yPos + lineHeight > maxBottom) return;
          if (item.type === 'rev') {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...labelColor);
            doc.text(item.text, xLeft, yPos);
            yPos += lineHeight;
          } else {
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...WHITE);
            const wrapped = doc.splitTextToSize(item.text, itemWidth);
            wrapped.forEach((wLine) => {
              if (yPos + lineHeight > maxBottom) return;
              doc.text(wLine, xLeft + indent, yPos);
              yPos += lineHeight;
            });
          }
        });
      } else {
        // Formato a 2 columnas si los cambios son extremadamente numerosos
        const colWidth = (contentWidth - 8) / 2;
        const colItemWidth = colWidth - indent;
        const col1X = xLeft;
        const col2X = xLeft + colWidth + 8;
        const startY = yPos;
        let currentCol = 1;
        let currentY = startY;

        doc.setFontSize(fontSize);
        flatList.forEach((item) => {
          const x = currentCol === 1 ? col1X : col2X;
          const w = item.type === 'rev' ? colWidth : colItemWidth;
          const currentIndent = item.type === 'rev' ? 0 : indent;

          const wrapped = doc.splitTextToSize(item.text, w);
          if (currentY + wrapped.length * lineHeight > maxBottom && currentCol === 1) {
            currentCol = 2;
            currentY = startY;
          }

          if (currentY + lineHeight <= maxBottom) {
            if (item.type === 'rev') {
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(...labelColor);
            } else {
              doc.setFont('helvetica', 'normal');
              doc.setTextColor(...WHITE);
            }

            wrapped.forEach((wLine) => {
              if (currentY + lineHeight <= maxBottom) {
                doc.text(wLine, x + currentIndent, currentY);
                currentY += lineHeight;
              }
            });
          }
        });
      }
    }
  }

  // Footer
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...labelColor);
  doc.text(CONTACTO, W / 2, H - 10, { align: 'center' });
};

// ─── PÁGINA 2: Tabla de ítems ────────────────────────────────────────────────
const buildTablaItems = (doc, presupuesto, logoHeader) => {
  doc.addPage();
  const W = doc.internal.pageSize.getWidth();
  drawHeader(doc, presupuesto, logoHeader, 'DETALLE DEL PRESUPUESTO');

  // Tarjeta del cliente
  const nombreCli = presupuesto.clientName || presupuesto.name || '';
  doc.setFillColor(...EULER_LIGHT);
  doc.roundedRect(14, CONTENT_TOP, W - 28, 15, 1.5, 1.5, 'F');
  doc.setFillColor(...EULER_GOLD);
  doc.rect(14, CONTENT_TOP + 1.5, 1.3, 12, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(...EULER_MID);
  doc.text('CLIENTE', 19, CONTENT_TOP + 4.6);
  doc.setFontSize(10.5);
  doc.setTextColor(...EULER_DARK);
  doc.text(doc.splitTextToSize(nombreCli, W - 40)[0] || '', 19, CONTENT_TOP + 9.4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY_TEXT);
  doc.text(doc.splitTextToSize(presupuesto.location || '', W - 40)[0] || '', 19, CONTENT_TOP + 13.2);

  const quoteItems = presupuesto.quoteItems || [];
  const materiales = quoteItems.filter(i => i.tipo !== 'mano_de_obra' && i.tipo !== 'servicio');
  const manoDeObra = quoteItems.filter(i => i.tipo === 'mano_de_obra' || i.tipo === 'servicio');

  let startY = CONTENT_TOP + 23;

  const buildSection = (items, titulo, startY) => {
    if (items.length === 0) return startY;
    startY = asegurarEspacio(doc, presupuesto, logoHeader, startY, 25);

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
      theme: 'striped',
      styles: { font: 'helvetica', cellPadding: { top: 2.1, bottom: 2.1, left: 2, right: 2 }, valign: 'middle' },
      headStyles: {
        fillColor: EULER_DARK,
        textColor: WHITE,
        fontStyle: 'bold',
        fontSize: 8.5,
      },
      bodyStyles: { fontSize: 8.8, textColor: GRAY_TEXT },
      alternateRowStyles: { fillColor: [246, 248, 251] },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center', textColor: GRAY_SOFT },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 26, halign: 'center' },
        3: { cellWidth: 32, halign: 'right' },
        4: { cellWidth: 34, halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (d) => {
        if (d.section === 'head' && d.column.index >= 2) d.cell.styles.halign = d.column.index === 2 ? 'center' : 'right';
      },
      margin: { left: 14, right: 14, top: CONTENT_TOP_CONT, bottom: PAGE_BOTTOM },
      didDrawPage: (d) => { if (d.pageNumber > 1) drawHeader(doc, presupuesto, logoHeader); },
    });

    return doc.lastAutoTable.finalY + 8;
  };

  startY = buildSection(materiales, 'MATERIALES Y EQUIPOS', startY);
  startY = buildSection(manoDeObra, 'MANO DE OBRA E INSTALACIÓN', startY + 2);

  // Total
  const isDescuentoComercial = presupuesto.canal === 'canal2' || presupuesto.canal === 'descuento';
  const calcRes = calcularDescuentosPresupuesto(quoteItems, isDescuentoComercial);
  startY = asegurarEspacio(doc, presupuesto, logoHeader, startY, isDescuentoComercial ? 16 : 30);
  const xVal = W - 20;

  if (isDescuentoComercial) {
    doc.setFillColor(...EULER_DARK);
    doc.roundedRect(14, startY, W - 28, 14, 2, 2, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...WHITE);
    doc.text('TOTAL — Precios con Descuento Comercial', 20, startY + 9.2);
    doc.setFontSize(13);
    doc.text(formatARS(calcRes.montoFinalPresupuesto), xVal, startY + 9.4, { align: 'right' });
    startY += 20;
  } else {
    const subtotalSinIva = calcRes.subtotalNeto;
    const iva = calcRes.ivaOriginal;
    const totalConIva = calcRes.totalOriginalConIVA;

    doc.setFillColor(...EULER_LIGHT);
    doc.roundedRect(14, startY, W - 28, 28, 2, 2, 'F');

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY_TEXT);
    doc.text('Precio sin IVA:', 20, startY + 7);
    doc.text(formatARS(subtotalSinIva), xVal, startY + 7, { align: 'right' });

    doc.text('IVA (21%):', 20, startY + 12.5);
    doc.text(formatARS(iva), xVal, startY + 12.5, { align: 'right' });

    // Banda oscura del total
    doc.setFillColor(...EULER_DARK);
    doc.roundedRect(14, startY + 16, W - 28, 12, 2, 2, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...WHITE);
    doc.text('TOTAL (Precio IVA incluido)', 20, startY + 23.6);
    doc.setFontSize(13);
    doc.text(formatARS(totalConIva), xVal, startY + 23.8, { align: 'right' });

    startY += 34;
  }

  // Notas
  if (presupuesto.notas) {
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(presupuesto.notas, W - 28);
    const notasY = asegurarEspacio(doc, presupuesto, logoHeader, startY + 2, 8 + Math.min(lines.length, 6) * 4.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...EULER_DARK);
    doc.text('Observaciones:', 14, notasY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY_TEXT);
    doc.text(lines, 14, notasY + 6);
  }
};

// ─── PÁGINA 3: Condiciones ───────────────────────────────────────────────────
const buildCondiciones = (doc, presupuesto, logoHeader) => {
  doc.addPage();
  const W = doc.internal.pageSize.getWidth();
  drawHeader(doc, presupuesto, logoHeader, 'CONDICIONES COMERCIALES');

  const addSection = (titulo, items, yStart) => {
    yStart = asegurarEspacio(doc, presupuesto, logoHeader, yStart, 14);
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...EULER_DARK);
    doc.text(titulo, 14, yStart);
    let y = yStart + 6;
    items.forEach(item => {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(`— ${item}`, W - 32);
      const LH_ITEM = 9 * 0.3528 * 1.25; // alto real de línea (9 pt, factor 1.25)
      y = asegurarEspacio(doc, presupuesto, logoHeader, y, lines.length * LH_ITEM);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...GRAY_TEXT);
      doc.text(lines, 18, y, { lineHeightFactor: 1.25 });
      y += lines.length * LH_ITEM + 1.8;
    });
    return y + 4;
  };

  let y = CONTENT_TOP + 1;

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
const buildGarantiasYCierre = (doc, presupuesto, logoHeader) => {
  doc.addPage();
  const W = doc.internal.pageSize.getWidth();
  drawHeader(doc, presupuesto, logoHeader, 'GARANTÍAS Y CIERRE');

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

  let y = CONTENT_TOP + 2;
  
  doc.setFontSize(10.5);
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
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...EULER_MID);
  doc.text('PROYECTO', 14, y);

  const quoteItems = presupuesto.quoteItems || [];
  const isDescuentoComercial = presupuesto.canal === 'canal2' || presupuesto.canal === 'descuento';
  const calcRes = calcularDescuentosPresupuesto(quoteItems, isDescuentoComercial);
  
  let totalText = '';
  if (isDescuentoComercial) {
    totalText = `${formatARS(calcRes.montoFinalPresupuesto)} (con Descuento Comercial)`;
  } else {
    totalText = `${formatARS(calcRes.subtotalNeto)} + IVA = ${formatARS(calcRes.totalOriginalConIVA)}`;
  }

  const projFields = [
    ['Cliente:',           presupuesto.clientName || presupuesto.name || '—'],
    ['Direccion de obra:',  presupuesto.location || '—'],
    ['N° Presupuesto:',    presupuesto.presupuestoNumber || '—'],
    ['Fecha:',             getPresupuestoFecha(presupuesto)],
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
 * Arma las páginas propias del presupuesto (sin folletos) y devuelve el jsPDF.
 * @param {Object} presupuesto
 * @param {{ logoPortada?: string|null, logoHeader?: string|null }} logos
 */
export function construirDocPresupuesto(presupuesto, { logoPortada = null, logoHeader = null } = {}, onProgress = null) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  onProgress?.(0.1);
  buildPortada(doc, presupuesto, logoPortada);
  onProgress?.(0.2);
  buildTablaItems(doc, presupuesto, logoHeader);
  onProgress?.(0.3);
  buildCondiciones(doc, presupuesto, logoHeader);
  onProgress?.(0.4);
  buildGarantiasYCierre(doc, presupuesto, logoHeader);
  drawFooters(doc, 2);
  onProgress?.(0.5);
  return doc;
}

/**
 * Genera y descarga el PDF del presupuesto.
 * @param {Object} presupuesto - El documento del presupuesto de Firestore
 * @param {Array}  folletoUrls - Array de { nombre, url } de Firebase Storage (opcional)
 * @param {Function} onProgress - Callback (0..1) para barra de progreso
 */
export async function generarPDFPresupuesto(presupuesto, folletoUrls = [], onProgress = null) {
  // Logos: portada (fondo azul) y encabezados (fondo blanco)
  const [logoPortada, logoHeader] = await Promise.all(
    ['/logo_euler.png', '/logo_euler_factura.png'].map((u) => getBase64ImageFromURL(u).catch((e) => {
      console.warn('No se pudo cargar el logo', u, e);
      return null;
    })),
  );

  // Paso 1-4: páginas del presupuesto
  const jspdfInstance = construirDocPresupuesto(presupuesto, { logoPortada, logoHeader }, onProgress);

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
