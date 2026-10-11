/**
 * PDF de Factura / Nota de Crédito electrónica (formato ARCA) con QR (RG 4892).
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

const ars = (n) => `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fechaAR = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const fmtCuit = (c) => {
  const s = String(c || '').replace(/\D/g, '');
  return s.length === 11 ? `${s.slice(0, 2)}-${s.slice(2, 10)}-${s.slice(10)}` : s;
};
const DOC_LABEL = { 80: 'CUIT', 86: 'CUIL', 96: 'DNI', 99: 'Doc.' };
const COD = { 1: '01', 3: '03', 6: '06', 8: '08' };

/**
 * @param {object} cbte  Comprobante tal como lo guarda la Cloud Function.
 * @param {object} cfg   Configuración ARCA (razón social, domicilio, IIBB, inicio actividades).
 * @param {{ descargar?: boolean }} opts
 */
export async function generarPDFFacturaArca(cbte, cfg = {}, { descargar = true } = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 10;
  const esA = cbte.letra === 'A';
  const titulo = cbte.esNotaCredito ? 'NOTA DE CRÉDITO' : 'FACTURA';
  const [pv, nro] = (cbte.numeroOriginal || '').split('-');

  // ── Marco y cabecera ─────────────────────────────────────────────────────
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.rect(M, M, W - 2 * M, 8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('ORIGINAL', W / 2, M + 5.5, { align: 'center' });

  const top = M + 8;
  const headH = 44;
  doc.rect(M, top, W - 2 * M, headH);
  doc.line(W / 2, top + 14, W / 2, top + headH);

  // Recuadro de letra
  const boxW = 16;
  doc.setFillColor(255, 255, 255);
  doc.rect(W / 2 - boxW / 2, top, boxW, 14, 'FD');
  doc.setFontSize(24);
  doc.text(cbte.letra || '', W / 2, top + 9, { align: 'center' });
  doc.setFontSize(7);
  doc.text(`COD. ${COD[cbte.cbteTipo] || ''}`, W / 2, top + 12.8, { align: 'center' });

  // Emisor (izquierda)
  doc.setFontSize(15);
  doc.text(cfg.razonSocial || cbte.emisorRazonSocial || '', M + 3, top + 10, { maxWidth: W / 2 - M - 14 });
  doc.setFontSize(8.5);
  const LH = 3.6; // alto de línea para 8.5 pt
  /** Escribe "Etiqueta: valor" partiendo el valor en varias líneas si no entra. Devuelve la cantidad de líneas. */
  const lblVal = (lbl, val, x, y, hasta) => {
    doc.setFont('helvetica', 'bold');
    doc.text(lbl, x, y);
    const w = doc.getTextWidth(lbl) + 1.5;
    doc.setFont('helvetica', 'normal');
    const limite = hasta ?? (x < W / 2 ? W / 2 - 3 : W - M - 2);
    const lineas = doc.splitTextToSize(String(val || '-'), Math.max(15, limite - (x + w)));
    doc.text(lineas, x + w, y, { lineHeightFactor: 1.2 });
    return lineas.length;
  };
  lblVal('Razón Social:', cfg.razonSocial || cbte.emisorRazonSocial, M + 3, top + 24);
  lblVal('Domicilio Comercial:', cfg.domicilio, M + 3, top + 30);
  lblVal('Condición frente al IVA:', cfg.condicionIva || 'IVA Responsable Inscripto', M + 3, top + 38);

  // Comprobante (derecha)
  const xr = W / 2 + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(titulo, xr, top + 10);
  doc.setFontSize(8.5);
  lblVal('Punto de Venta:', pv, xr, top + 18, xr + 40);
  lblVal('Comp. Nro:', nro, xr + 42, top + 18);
  lblVal('Fecha de Emisión:', fechaAR(cbte.fechaEmision), xr, top + 24);
  lblVal('CUIT:', fmtCuit(cbte.emisorCuit || cfg.cuit), xr, top + 30);
  lblVal('Ingresos Brutos:', cfg.ingresosBrutos || fmtCuit(cbte.emisorCuit || cfg.cuit), xr, top + 35);
  lblVal('Fecha de Inicio de Actividades:', fechaAR(cfg.inicioActividades) || '-', xr, top + 40);

  // ── Período facturado ────────────────────────────────────────────────────
  let y = top + headH;
  if (cbte.concepto && cbte.concepto !== 1) {
    doc.rect(M, y + 1, W - 2 * M, 7);
    doc.setFontSize(8.5);
    lblVal('Período Facturado Desde:', fechaAR(cbte.fchServDesde), M + 3, y + 5.8, M + 73);
    lblVal('Hasta:', fechaAR(cbte.fchServHasta), M + 75, y + 5.8, M + 116);
    lblVal('Fecha de Vto. para el pago:', fechaAR(cbte.fechaVencimiento), M + 118, y + 5.8);
    y += 8;
  }

  // ── Receptor (alto variable) ─────────────────────────────────────────────
  const rx = cbte.receptor || {};
  const docLabel = DOC_LABEL[rx.docTipo] || 'Doc.';
  const docVal = rx.docTipo === 99 ? '-' : (rx.docTipo === 80 || rx.docTipo === 86 ? fmtCuit(rx.docNro) : rx.docNro);
  const recTop = y + 1;
  let ry = recTop + 5.5;
  const fila = (...celdas) => {
    const n = Math.max(...celdas.map(([l, v, x, hasta]) => lblVal(l, v, x, ry, hasta)));
    ry += n * LH + 2.4;
  };
  fila([`${docLabel}:`, docVal, M + 3, M + 95], ['Condición frente al IVA:', rx.condicionIva, M + 98]);
  fila(['Apellido y Nombre / Razón Social:', rx.nombre, M + 3]);
  fila(['Domicilio:', rx.domicilio || '-', M + 3]);
  const extra = cbte.comprobanteAsociado
    ? ['Comprobante asociado:', `${cbte.letra} ${cbte.comprobanteAsociado.numeroOriginal || ''}`, M + 98]
    : (cbte.otNumber || cbte.obraNombre)
      ? ['Obra:', [cbte.otNumber, cbte.obraNombre].filter(Boolean).join(' – '), M + 98]
      : null;
  fila(['Condición de venta:', 'Otra', M + 3, M + 95], ...(extra ? [extra] : []));
  doc.rect(M, recTop, W - 2 * M, ry - recTop - 1.5);
  y = ry;

  // ── Detalle ──────────────────────────────────────────────────────────────
  const body = (cbte.lineas || []).map((l) => {
    const neto = Number(l.neto ?? l.cantidad * l.precioUnitario);
    if (esA) {
      return [l.descripcion, String(l.cantidad), ars(l.precioUnitario), '21%', ars(neto), ars(neto * 1.21)];
    }
    return [l.descripcion, String(l.cantidad), ars(l.precioUnitario * 1.21), ars(neto * 1.21)];
  });
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [esA
      ? ['Producto / Servicio', 'Cant.', 'Precio Unit.', 'IVA', 'Subtotal', 'Subtotal c/IVA']
      : ['Producto / Servicio', 'Cant.', 'Precio Unit.', 'Subtotal']],
    body,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.6, lineColor: [180, 180, 180] },
    headStyles: { fillColor: [220, 220, 220], textColor: 0, fontStyle: 'bold' },
    columnStyles: esA
      ? { 1: { halign: 'right', cellWidth: 14 }, 2: { halign: 'right', cellWidth: 28 }, 3: { halign: 'center', cellWidth: 12 }, 4: { halign: 'right', cellWidth: 28 }, 5: { halign: 'right', cellWidth: 30 } }
      : { 1: { halign: 'right', cellWidth: 14 }, 2: { halign: 'right', cellWidth: 32 }, 3: { halign: 'right', cellWidth: 34 } },
  });

  // ── Totales (al pie) ─────────────────────────────────────────────────────
  const footTop = H - 78;
  let ty = Math.max(doc.lastAutoTable.finalY + 6, footTop);
  if (ty > footTop + 2) { doc.addPage(); ty = footTop; }
  doc.rect(M, ty, W - 2 * M, 34);
  const rowsTot = esA
    ? [['Importe Neto Gravado:', cbte.subtotalNeto], ['IVA 21%:', cbte.totalIva], ['Importe Otros Tributos:', 0], ['Importe Total:', cbte.totalComprobante]]
    : [['Subtotal:', cbte.totalComprobante], ['Importe Otros Tributos:', 0], ['Importe Total:', cbte.totalComprobante]];
  doc.setFontSize(10);
  rowsTot.forEach(([l, v], i) => {
    const yy = ty + 7 + i * 6.5;
    doc.setFont('helvetica', 'bold');
    doc.text(l, W - M - 50, yy, { align: 'right' });
    doc.text(ars(v), W - M - 3, yy, { align: 'right' });
  });
  if (!esA) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)', M + 3, ty + 27);
    doc.setFont('helvetica', 'normal');
    doc.text(`IVA Contenido: ${ars(cbte.totalIva)}`, M + 3, ty + 31.5);
  }

  // ── QR + CAE ─────────────────────────────────────────────────────────────
  const qy = ty + 37;
  if (cbte.qrUrl) {
    const qr = await QRCode.toDataURL(cbte.qrUrl, { margin: 0, width: 300, errorCorrectionLevel: 'M' });
    doc.addImage(qr, 'PNG', M, qy, 30, 30);
  }
  doc.setFont('helvetica', 'bolditalic');
  doc.setFontSize(12);
  doc.text('ARCA', M + 35, qy + 8);
  doc.setFontSize(9);
  doc.text('Comprobante Autorizado', M + 35, qy + 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación', M + 35, qy + 19);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`CAE N°: ${cbte.cae || ''}`, W - M - 3, qy + 8, { align: 'right' });
  doc.text(`Fecha de Vto. de CAE: ${fechaAR(cbte.vencimientoCae)}`, W - M - 3, qy + 14, { align: 'right' });

  // ── Marca de agua para homologación ──────────────────────────────────────
  if (cbte.entornoArca !== 'produccion') {
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setTextColor(252, 165, 165);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(34);
      doc.text('SIN VALIDEZ FISCAL', W / 2, H / 2 - 6, { align: 'center', angle: 30 });
      doc.setFontSize(16);
      doc.text('Comprobante de prueba (homologación ARCA)', W / 2, H / 2 + 8, { align: 'center', angle: 30 });
      doc.setTextColor(0, 0, 0);
    }
  }

  const nombre = `${cbte.tipoComprobante || titulo}_${cbte.numeroOriginal || ''}${cbte.entornoArca !== 'produccion' ? '_PRUEBA' : ''}.pdf`;
  if (descargar) doc.save(nombre);
  return doc;
}
