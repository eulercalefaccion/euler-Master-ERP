/**
 * PDF de Factura / Nota de Crédito electrónica ARCA con identidad visual Euler.
 * Incluye todos los elementos obligatorios: letra + código, ORIGINAL, datos del emisor,
 * CUIT, IIBB, inicio de actividades, receptor, período (servicios), CAE + vencimiento y QR (RG 4892).
 * En Factura B: leyenda de IVA contenido (Ley 27.743).
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

const DARK = [13, 42, 78];     // #0D2A4E
const MID = [26, 74, 122];     // #1A4A7A
const GOLD = [245, 166, 35];   // #F5A623
const LIGHT = [232, 239, 247]; // #E8EFF7
const GRAY = [100, 116, 139];
const TEXT = [30, 41, 59];
const LINE = [203, 213, 225];

const ars = (n) => `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fechaAR = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
const fmtCuit = (c) => {
  const s = String(c || '').replace(/\D/g, '');
  return s.length === 11 ? `${s.slice(0, 2)}-${s.slice(2, 10)}-${s.slice(10)}` : s;
};
const DOC_LABEL = { 80: 'CUIT', 86: 'CUIL', 96: 'DNI', 99: 'Documento' };
const COD = { 1: '01', 3: '03', 6: '06', 8: '08' };

let logoCache = null;
async function cargarLogo() {
  if (logoCache !== null) return logoCache;
  try {
    const blob = await (await fetch('/logo_euler_factura.png')).blob();
    logoCache = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  } catch {
    logoCache = '';
  }
  return logoCache;
}

/**
 * @param {object} cbte  Comprobante tal como lo guarda la Cloud Function.
 * @param {object} cfg   Configuración ARCA (razón social, domicilio, IIBB, inicio de actividades, contacto).
 * @param {{ descargar?: boolean, logo?: string }} opts
 */
export async function generarPDFFacturaArca(cbte, cfg = {}, { descargar = true, logo } = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;
  const esA = cbte.letra === 'A';
  const esNC = !!cbte.esNotaCredito;
  const prueba = cbte.entornoArca !== 'produccion';
  const titulo = esNC ? 'NOTA DE CRÉDITO' : 'FACTURA';
  const numero = cbte.numeroOriginal || '';
  const logoData = logo ?? await cargarLogo();
  const contacto = {
    tel: cfg.telefono || '341 569-5849',
    email: cfg.email || 'info@euler.com.ar',
    web: cfg.web || 'www.euler.com.ar',
    ig: cfg.instagram || '@eulercalefaccion',
  };

  // ── Helpers ──────────────────────────────────────────────────────────────
  const setTxt = (size, bold = false, color = TEXT, italic = false) => {
    doc.setFont('helvetica', bold ? (italic ? 'bolditalic' : 'bold') : (italic ? 'italic' : 'normal'));
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  /** "Etiqueta: valor" con salto de línea automático. Devuelve la cantidad de líneas usadas. */
  const par = (lbl, val, x, y, maxW, size = 8.3) => {
    setTxt(size, true, GRAY);
    doc.text(lbl, x, y);
    const w = doc.getTextWidth(lbl) + 1.4;
    setTxt(size, false, TEXT);
    const lines = doc.splitTextToSize(String(val || '-'), Math.max(15, maxW - w));
    doc.text(lines, x + w, y, { lineHeightFactor: 1.25 });
    return lines.length;
  };
  const LH = 3.7;

  const encabezadoCompacto = () => {
    doc.setFillColor(...DARK); doc.rect(0, 0, W, 3, 'F');
    doc.setFillColor(...GOLD); doc.rect(0, 3, W, 0.8, 'F');
    if (logoData) doc.addImage(logoData, 'PNG', M, 7, 35, 10);
    setTxt(10, true, DARK);
    doc.text(`${titulo} ${cbte.letra} N° ${numero}`, W - M, 13, { align: 'right' });
    setTxt(7.5, false, GRAY);
    doc.text(`Fecha de emisión: ${fechaAR(cbte.fechaEmision)}  ·  CAE ${cbte.cae || ''}`, W - M, 17.5, { align: 'right' });
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(M, 21, W - M, 21);
  };

  // ── Encabezado ───────────────────────────────────────────────────────────
  doc.setFillColor(...DARK); doc.rect(0, 0, W, 3, 'F');
  doc.setFillColor(...GOLD); doc.rect(0, 3, W, 0.8, 'F');

  if (logoData) {
    doc.addImage(logoData, 'PNG', M, 9, 60, 17);
  } else {
    setTxt(24, true, DARK); doc.text('EULER', M, 20);
    setTxt(9, false, MID, true); doc.text('calefacción por agua', M, 25);
  }

  // Recuadro de letra (obligatorio)
  const bx = W / 2 - 10;
  const by = 8;
  doc.setDrawColor(...DARK); doc.setLineWidth(0.6); doc.setFillColor(255, 255, 255);
  doc.roundedRect(bx, by, 20, 20, 1.5, 1.5, 'FD');
  setTxt(28, true, DARK); doc.text(cbte.letra || '', W / 2, by + 13.3, { align: 'center' });
  setTxt(6.5, true, GRAY); doc.text(`COD. ${COD[cbte.cbteTipo] || ''}`, W / 2, by + 18, { align: 'center' });

  // Título y número
  setTxt(esNC ? 17 : 21, true, DARK); doc.text(titulo, W - M, 16, { align: 'right' });
  setTxt(12.5, true, MID); doc.text(`N° ${numero}`, W - M, 23, { align: 'right' });
  const pill = (texto, color, xRight, y) => {
    setTxt(6.8, true, [255, 255, 255]);
    const w = doc.getTextWidth(texto) + 5;
    doc.setFillColor(...color); doc.roundedRect(xRight - w, y, w, 4.6, 1.2, 1.2, 'F');
    doc.text(texto, xRight - w / 2, y + 3.25, { align: 'center' });
    return w;
  };
  const wOrig = pill('ORIGINAL', GOLD, W - M, 25.8);
  if (prueba) pill('PRUEBA – SIN VALIDEZ FISCAL', [220, 38, 38], W - M - wOrig - 2, 25.8);

  // Separador vertical (debajo del recuadro de letra)
  doc.setDrawColor(...LINE); doc.setLineWidth(0.3);
  doc.line(W / 2, by + 21, W / 2, 59);

  // Emisor (izquierda)
  const colW = W / 2 - M - 5;
  setTxt(10.5, true, DARK); doc.text(cfg.razonSocial || cbte.emisorRazonSocial || '', M, 35.5);
  let ey = 41;
  ey += par('Domicilio comercial:', cfg.domicilio, M, ey, colW) * LH + 1.2;
  ey += par('Teléfono:', contacto.tel, M, ey, colW) * LH + 1.2;
  ey += par('Email:', contacto.email, M, ey, colW) * LH + 1.2;
  par('Condición frente al IVA:', cfg.condicionIva || 'IVA Responsable Inscripto', M, ey, colW);

  // Datos del comprobante (derecha)
  const xr = W / 2 + 6;
  const colR = W - M - xr;
  par('Fecha de emisión:', fechaAR(cbte.fechaEmision), xr, 35.5, colR, 8.6);
  par('CUIT:', fmtCuit(cbte.emisorCuit || cfg.cuit), xr, 41, colR);
  par('Ingresos Brutos:', cfg.ingresosBrutos || fmtCuit(cbte.emisorCuit || cfg.cuit), xr, 45.9, colR);
  par('Inicio de actividades:', fechaAR(cfg.inicioActividades) || '-', xr, 50.8, colR);
  par('Punto de venta / Número:', numero, xr, 55.7, colR);

  // Línea de cierre del encabezado con acento dorado
  doc.setDrawColor(...LINE); doc.line(M, 60, W - M, 60);
  doc.setFillColor(...GOLD); doc.rect(M, 59.6, 28, 0.9, 'F');

  let y = 64;

  // ── Período facturado ────────────────────────────────────────────────────
  if (cbte.concepto && cbte.concepto !== 1) {
    doc.setFillColor(...LIGHT); doc.roundedRect(M, y, W - 2 * M, 8, 1.5, 1.5, 'F');
    par('Período facturado desde:', fechaAR(cbte.fchServDesde), M + 3, y + 5.3, 70);
    par('Hasta:', fechaAR(cbte.fchServHasta), M + 72, y + 5.3, 40);
    par('Vencimiento de pago:', fechaAR(cbte.fechaVencimiento), M + 118, y + 5.3, 70);
    y += 12;
  }

  // ── Receptor ─────────────────────────────────────────────────────────────
  const rx = cbte.receptor || {};
  const docVal = rx.docTipo === 99 ? 'Sin identificar' : (rx.docTipo === 80 || rx.docTipo === 86 ? fmtCuit(rx.docNro) : rx.docNro);
  const recTop = y;
  const xDer = W - M - 66;
  setTxt(7, true, MID); doc.text(esNC ? 'CLIENTE' : 'FACTURAR A', M + 5, y + 5);
  setTxt(11, true, DARK);
  const nombreLines = doc.splitTextToSize(rx.nombre || '-', xDer - (M + 5) - 4);
  doc.text(nombreLines, M + 5, y + 10.5, { lineHeightFactor: 1.15 });
  par(`${DOC_LABEL[rx.docTipo] || 'Documento'}:`, docVal, xDer, y + 5.5, 64);
  par('IVA:', rx.condicionIva, xDer, y + 10.5, 64);
  let ry = y + 10.5 + (nombreLines.length - 1) * 4.6 + 6;
  ry += par('Domicilio:', rx.domicilio || '-', M + 5, ry, W - 2 * M - 10) * LH + 1.3;
  if (cbte.comprobanteAsociado) {
    ry += par('Comprobante asociado:', `Factura ${cbte.letra} N° ${cbte.comprobanteAsociado.numeroOriginal || ''}`, M + 5, ry, W - 2 * M - 10) * LH + 1.3;
  }
  if (cbte.otNumber || cbte.obraNombre) {
    ry += par('Obra:', [cbte.otNumber, cbte.obraNombre].filter(Boolean).join(' – '), M + 5, ry, W - 2 * M - 10) * LH + 1.3;
  }
  ry += 1;
  doc.setDrawColor(...LINE); doc.setLineWidth(0.3);
  doc.roundedRect(M, recTop, W - 2 * M, ry - recTop, 1.5, 1.5, 'S');
  doc.setFillColor(...GOLD); doc.rect(M, recTop + 1.5, 1.3, ry - recTop - 3, 'F');
  y = ry + 5;

  // ── Detalle ──────────────────────────────────────────────────────────────
  const body = (cbte.lineas || []).map((l, i) => {
    const neto = Number(l.neto ?? l.cantidad * l.precioUnitario);
    const cant = Number(l.cantidad).toLocaleString('es-AR', { maximumFractionDigits: 3 });
    return esA
      ? [String(i + 1), l.descripcion, cant, ars(l.precioUnitario), '21%', ars(neto)]
      : [String(i + 1), l.descripcion, cant, ars(l.precioUnitario * 1.21), ars(neto * 1.21)];
  });
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, top: 26, bottom: 20 },
    head: [esA
      ? ['#', 'Descripción', 'Cant.', 'Precio unit.', 'IVA', 'Subtotal']
      : ['#', 'Descripción', 'Cant.', 'Precio unit.', 'Subtotal']],
    body,
    theme: 'striped',
    styles: { font: 'helvetica', fontSize: 8.3, cellPadding: { top: 2.1, bottom: 2.1, left: 2, right: 2 }, textColor: TEXT, valign: 'middle' },
    headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [246, 248, 251] },
    columnStyles: esA
      ? { 0: { cellWidth: 8, halign: 'center', textColor: GRAY }, 2: { halign: 'right', cellWidth: 15 }, 3: { halign: 'right', cellWidth: 30 }, 4: { halign: 'center', cellWidth: 12 }, 5: { halign: 'right', cellWidth: 32, fontStyle: 'bold' } }
      : { 0: { cellWidth: 8, halign: 'center', textColor: GRAY }, 2: { halign: 'right', cellWidth: 15 }, 3: { halign: 'right', cellWidth: 34 }, 4: { halign: 'right', cellWidth: 36, fontStyle: 'bold' } },
    didParseCell: (d) => {
      if (d.section === 'head' && d.column.index >= 2) d.cell.styles.halign = d.column.index === 4 && esA ? 'center' : 'right';
    },
    didDrawPage: (d) => { if (d.pageNumber > 1) encabezadoCompacto(); },
  });

  // ── Pie: totales, notas, CAE y QR (siempre al final de la última página) ──
  const F = H - 92;
  if (doc.lastAutoTable.finalY + 4 > F) { doc.addPage(); encabezadoCompacto(); }

  // Notas y condición de venta (izquierda)
  const notasW = W - 2 * M - 86;
  let ny = F + 4;
  ny += par('Condición de venta:', cbte.condicionVenta || 'Contado', M, ny, notasW) * LH + 1.5;
  if (cbte.notas) ny += par('Notas:', cbte.notas, M, ny, notasW) * LH + 1.5;
  if (!esA) {
    const ty = Math.max(ny + 1, F + 14);
    doc.setFillColor(...LIGHT); doc.roundedRect(M, ty, notasW, 12, 1.5, 1.5, 'F');
    setTxt(7.3, true, DARK); doc.text('Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)', M + 3, ty + 4.6);
    setTxt(8.3, false, TEXT); doc.text(`IVA contenido: ${ars(cbte.totalIva)}`, M + 3, ty + 9.2);
  }

  // Totales (derecha)
  const tx = W - M - 80;
  const filas = esA
    ? [['Importe neto gravado', cbte.subtotalNeto], ['IVA 21%', cbte.totalIva], ['Otros tributos', 0]]
    : [['Subtotal', cbte.totalComprobante], ['Otros tributos', 0]];
  let tyy = F + 4;
  filas.forEach(([l, v]) => {
    setTxt(8.6, false, GRAY); doc.text(l, tx + 2, tyy);
    setTxt(8.6, true, TEXT); doc.text(ars(v), W - M - 2, tyy, { align: 'right' });
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(tx, tyy + 1.8, W - M, tyy + 1.8);
    tyy += 6;
  });
  doc.setFillColor(...DARK); doc.roundedRect(tx, tyy - 2.5, 80, 10, 1.5, 1.5, 'F');
  setTxt(10.5, true, [255, 255, 255]); doc.text(esNC ? 'TOTAL A ACREDITAR' : 'TOTAL', tx + 3, tyy + 4.2);
  setTxt(12, true, [255, 255, 255]); doc.text(ars(cbte.totalComprobante), W - M - 3, tyy + 4.3, { align: 'right' });

  // Separador
  const sy = F + 40;
  doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(M, sy, W - M, sy);

  // QR + leyenda ARCA
  if (cbte.qrUrl) {
    const qr = await QRCode.toDataURL(cbte.qrUrl, { margin: 0, width: 320, errorCorrectionLevel: 'M', color: { dark: '#0D2A4E', light: '#FFFFFF' } });
    doc.addImage(qr, 'PNG', M, sy + 4, 31, 31);
  }
  setTxt(14, true, DARK, true); doc.text('ARCA', M + 36, sy + 12);
  setTxt(9, true, TEXT); doc.text('Comprobante Autorizado', M + 36, sy + 17.5);
  setTxt(6.6, false, GRAY);
  doc.text(doc.splitTextToSize('Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación.', 62), M + 36, sy + 22, { lineHeightFactor: 1.2 });

  // CAE
  const cx = W - M - 72;
  doc.setDrawColor(...DARK); doc.setLineWidth(0.4); doc.roundedRect(cx, sy + 6, 72, 22, 2, 2, 'S');
  setTxt(7.2, true, GRAY); doc.text('CAE N°', cx + 4, sy + 11.5);
  setTxt(13, true, DARK); doc.text(String(cbte.cae || ''), cx + 4, sy + 18);
  setTxt(7.2, true, GRAY); doc.text('Vencimiento del CAE:', cx + 4, sy + 24.3);
  setTxt(8.6, true, TEXT); doc.text(fechaAR(cbte.vencimientoCae), cx + 34, sy + 24.3);

  // ── Pie de página en todas las hojas ─────────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFillColor(...GOLD); doc.rect(M, H - 12, W - 2 * M, 0.5, 'F');
    setTxt(7, false, GRAY);
    doc.text(`${contacto.web}   ·   ${contacto.ig}   ·   ${contacto.email}   ·   Tel. ${contacto.tel}`, W / 2, H - 7.5, { align: 'center' });
    doc.text(`Página ${p} de ${total}`, W - M, H - 7.5, { align: 'right' });

    if (prueba) {
      try { doc.setGState(new doc.GState({ opacity: 0.12 })); } catch { /* sin transparencia */ }
      setTxt(40, true, [220, 38, 38]);
      doc.text('SIN VALIDEZ FISCAL', W / 2, H / 2 + 10, { align: 'center', angle: 30 });
      try { doc.setGState(new doc.GState({ opacity: 1 })); } catch { /* noop */ }
    }
  }

  const nombre = `${cbte.tipoComprobante || titulo}_${numero}${prueba ? '_PRUEBA' : ''}.pdf`;
  if (descargar) doc.save(nombre);
  return doc;
}
