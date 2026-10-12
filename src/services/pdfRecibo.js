/**
 * PDF del Recibo de Cobro con identidad visual Euler (misma línea que la factura).
 * Incluye: comprobantes cancelados, cobro a cuenta, formas de cobro, valores (cheques / e-cheq),
 * importe en letras, saldo de cuenta corriente opcional y firma.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MEDIOS_COBRO, detalleMedio, numeroALetras } from './ventasCalculo';

const DARK = [13, 42, 78];
const MID = [26, 74, 122];
const GOLD = [245, 166, 35];
const LIGHT = [232, 239, 247];
const GRAY = [100, 116, 139];
const TEXT = [30, 41, 59];
const LINE = [203, 213, 225];

const ars = (n) => `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fechaAR = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
const fmtCuit = (c) => {
  const s = String(c || '').replace(/\D/g, '');
  return s.length === 11 ? `${s.slice(0, 2)}-${s.slice(2, 10)}-${s.slice(10)}` : s;
};

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
 * @param {object} rec     Recibo (como lo guarda cobranzasService.registrarRecibo)
 * @param {object} emisor  { razonSocial, domicilio, telefono, email, web, instagram, fiscal, cuit, ingresosBrutos, inicioActividades, condicionIva }
 * @param {{ descargar?: boolean, logo?: string, saldoPosterior?: number|null }} opts
 */
export async function generarPDFRecibo(rec, emisor = {}, { descargar = true, logo, saldoPosterior = null } = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;
  const numero = rec.numeroOriginal || '';
  const logoData = logo ?? await cargarLogo();
  const contacto = {
    tel: emisor.telefono || '341 569-5849',
    email: emisor.email || 'info@euler.com.ar',
    web: emisor.web || 'www.euler.com.ar',
    ig: emisor.instagram || '@eulercalefaccion',
  };

  const setTxt = (size, bold = false, color = TEXT, italic = false) => {
    doc.setFont('helvetica', bold ? (italic ? 'bolditalic' : 'bold') : (italic ? 'italic' : 'normal'));
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
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
    setTxt(10, true, DARK); doc.text(`RECIBO DE COBRO N° ${numero}`, W - M, 13, { align: 'right' });
    setTxt(7.5, false, GRAY); doc.text(`Fecha: ${fechaAR(rec.fechaEmision)}  ·  ${rec.clienteNombre || ''}`, W - M, 17.5, { align: 'right' });
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(M, 21, W - M, 21);
  };

  // ── Encabezado ───────────────────────────────────────────────────────────
  doc.setFillColor(...DARK); doc.rect(0, 0, W, 3, 'F');
  doc.setFillColor(...GOLD); doc.rect(0, 3, W, 0.8, 'F');
  if (logoData) doc.addImage(logoData, 'PNG', M, 9, 60, 17);
  else { setTxt(24, true, DARK); doc.text('EULER', M, 20); }

  const by = 8;
  doc.setDrawColor(...DARK); doc.setLineWidth(0.6); doc.setFillColor(255, 255, 255);
  doc.roundedRect(W / 2 - 11, by, 22, 20, 1.5, 1.5, 'FD');
  setTxt(15, true, DARK); doc.text('REC', W / 2, by + 10.5, { align: 'center' });
  setTxt(4.6, true, GRAY);
  doc.text('NO VÁLIDO', W / 2, by + 15.4, { align: 'center' });
  doc.text('COMO FACTURA', W / 2, by + 17.6, { align: 'center' });

  setTxt(19, true, DARK); doc.text('RECIBO DE COBRO', W - M, 16, { align: 'right' });
  setTxt(12.5, true, MID); doc.text(`N° ${numero}`, W - M, 23, { align: 'right' });
  const pill = (texto, color, xRight, y) => {
    setTxt(6.8, true, [255, 255, 255]);
    const w = doc.getTextWidth(texto) + 5;
    doc.setFillColor(...color); doc.roundedRect(xRight - w, y, w, 4.6, 1.2, 1.2, 'F');
    doc.text(texto, xRight - w / 2, y + 3.25, { align: 'center' });
    return w;
  };
  const wOrig = pill('ORIGINAL', GOLD, W - M, 25.8);
  if (rec.prueba) pill('PRUEBA', [220, 38, 38], W - M - wOrig - 2, 25.8);

  doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(W / 2, by + 21, W / 2, 59);

  const colW = W / 2 - M - 5;
  setTxt(10.5, true, DARK); doc.text(emisor.razonSocial || '', M, 35.5);
  let ey = 41;
  ey += par('Domicilio comercial:', emisor.domicilio, M, ey, colW) * LH + 1.2;
  ey += par('Teléfono:', contacto.tel, M, ey, colW) * LH + 1.2;
  ey += par('Email:', contacto.email, M, ey, colW) * LH + 1.2;
  if (emisor.fiscal) par('Condición frente al IVA:', emisor.condicionIva || 'IVA Responsable Inscripto', M, ey, colW);
  else par('Web:', contacto.web, M, ey, colW);

  const xr = W / 2 + 6;
  const colR = W - M - xr;
  par('Fecha de emisión:', fechaAR(rec.fechaEmision), xr, 35.5, colR, 8.6);
  par('Comprobante:', `REC ${numero}`, xr, 41, colR);
  if (emisor.fiscal) {
    par('CUIT:', fmtCuit(emisor.cuit), xr, 45.9, colR);
    par('Ingresos Brutos:', emisor.ingresosBrutos || fmtCuit(emisor.cuit), xr, 50.8, colR);
    par('Inicio de actividades:', fechaAR(emisor.inicioActividades) || '-', xr, 55.7, colR);
  }

  doc.setDrawColor(...LINE); doc.line(M, 60, W - M, 60);
  doc.setFillColor(...GOLD); doc.rect(M, 59.6, 28, 0.9, 'F');

  // ── Cliente ──────────────────────────────────────────────────────────────
  let y = 64;
  const recTop = y;
  const xDer = W - M - 66;
  setTxt(7, true, MID); doc.text('RECIBIMOS DE', M + 5, y + 5);
  setTxt(11, true, DARK);
  const nombreLines = doc.splitTextToSize(rec.clienteNombre || '-', xDer - (M + 5) - 4);
  doc.text(nombreLines, M + 5, y + 10.5, { lineHeightFactor: 1.15 });
  const docNro = String(rec.clienteCuit || '');
  par(docNro.length === 11 ? 'CUIT:' : 'Documento:', docNro.length === 11 ? fmtCuit(docNro) : (docNro || '-'), xDer, y + 5.5, 64);
  par('IVA:', rec.clienteCondicionIva || 'Consumidor Final', xDer, y + 10.5, 64);
  let ry = y + 10.5 + (nombreLines.length - 1) * 4.6 + 6;
  ry += par('Domicilio:', rec.clienteDomicilio || '-', M + 5, ry, W - 2 * M - 10) * LH + 1.3;
  ry += 1;
  doc.setDrawColor(...LINE); doc.setLineWidth(0.3);
  doc.roundedRect(M, recTop, W - 2 * M, ry - recTop, 1.5, 1.5, 'S');
  doc.setFillColor(...GOLD); doc.rect(M, recTop + 1.5, 1.3, ry - recTop - 3, 'F');
  y = ry + 4;

  // ── Importe en letras ────────────────────────────────────────────────────
  const letras = doc.splitTextToSize(`La suma de ${numeroALetras(rec.totalRecibo)}`, W - 2 * M - 70);
  const hBanda = Math.max(13, 6 + letras.length * 4.2);
  doc.setFillColor(...LIGHT); doc.roundedRect(M, y, W - 2 * M, hBanda, 1.5, 1.5, 'F');
  setTxt(8.6, false, TEXT); doc.text(letras, M + 4, y + 5.6, { lineHeightFactor: 1.3 });
  doc.setFillColor(...DARK); doc.roundedRect(W - M - 62, y + 1.8, 60, hBanda - 3.6, 1.5, 1.5, 'F');
  setTxt(7, true, [255, 255, 255]); doc.text('TOTAL RECIBIDO', W - M - 59, y + 6.2);
  setTxt(12.5, true, [255, 255, 255]); doc.text(ars(rec.totalRecibo), W - M - 4, y + hBanda - 4, { align: 'right' });
  y += hBanda + 6;

  const tabla = (titulo, head, body, columnStyles, foot) => {
    if (y > H - 50) { doc.addPage(); encabezadoCompacto(); y = 28; }
    setTxt(10, true, DARK); doc.text(titulo, M, y);
    doc.setFillColor(...GOLD); doc.rect(M, y + 1.4, 18, 0.7, 'F');
    autoTable(doc, {
      startY: y + 3.5,
      margin: { left: M, right: M, top: 26, bottom: 20 },
      head: [head],
      body,
      foot: foot ? [foot] : undefined,
      theme: 'striped',
      styles: { font: 'helvetica', fontSize: 8.2, cellPadding: { top: 1.9, bottom: 1.9, left: 2, right: 2 }, textColor: TEXT, valign: 'middle' },
      headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.8 },
      footStyles: { fillColor: [255, 255, 255], textColor: DARK, fontStyle: 'bold', fontSize: 8.6 },
      alternateRowStyles: { fillColor: [246, 248, 251] },
      columnStyles,
      didParseCell: (d) => {
        const cs = columnStyles[d.column.index];
        if ((d.section === 'head' || d.section === 'foot') && cs?.halign) d.cell.styles.halign = cs.halign;
      },
      didDrawPage: (d) => { if (d.pageNumber > 1) encabezadoCompacto(); },
    });
    y = doc.lastAutoTable.finalY + 7;
  };

  // ── Comprobantes cancelados ──────────────────────────────────────────────
  const imps = rec.imputaciones || [];
  const filasComp = imps.map((i) => [
    `${i.tipoComprobante || ''} ${i.numeroOriginal || ''}`.trim(), fechaAR(i.fechaEmision), i.notas || '', ars(i.totalComprobante), ars(i.saldoAnterior), ars(i.importe),
  ]);
  if (Number(rec.aCuenta) > 0.009) filasComp.push(['Cobro a cuenta', '', 'Queda como saldo a favor del cliente', '', '', ars(rec.aCuenta)]);
  if (filasComp.length) {
    tabla('Comprobantes', ['Comprobante', 'Fecha', 'Detalle', 'Total', 'Saldo anterior', 'Importe'], filasComp, {
      0: { cellWidth: 38, fontStyle: 'bold' }, 1: { cellWidth: 20 }, 3: { halign: 'right', cellWidth: 28 }, 4: { halign: 'right', cellWidth: 28 }, 5: { halign: 'right', cellWidth: 30, fontStyle: 'bold' },
    }, ['', '', '', '', 'TOTAL', ars(rec.totalRecibo)]);
  }

  // ── Formas de cobro ──────────────────────────────────────────────────────
  const medios = rec.mediosPago || [];
  tabla('Formas de cobro', ['Forma de cobro', 'Detalle', 'Importe'], medios.map((m) => [MEDIOS_COBRO[m.tipo]?.label || m.tipo, detalleMedio(m), ars(m.importe)]), {
    0: { cellWidth: 52, fontStyle: 'bold' }, 2: { halign: 'right', cellWidth: 34, fontStyle: 'bold' },
  }, ['', 'TOTAL', ars(rec.totalRecibo)]);

  // ── Valores (cheques / e-cheq) ───────────────────────────────────────────
  const cheques = medios.filter((m) => m.tipo === 'cheque' || m.tipo === 'echeq');
  if (cheques.length) {
    tabla('Cheques recibidos', ['Tipo', 'Banco', 'Número', 'Fecha de pago', 'Librador', 'Importe'], cheques.map((m) => [
      m.tipo === 'echeq' ? 'E-cheq' : 'Cheque', m.banco || '', m.numero || '', fechaAR(m.fechaPago), [m.librador, m.cuitLibrador && fmtCuit(m.cuitLibrador)].filter(Boolean).join(' – '), ars(m.importe),
    ]), { 0: { cellWidth: 18 }, 2: { cellWidth: 24 }, 3: { cellWidth: 24 }, 5: { halign: 'right', cellWidth: 30, fontStyle: 'bold' } });
  }

  // ── Notas, saldo y firma ─────────────────────────────────────────────────
  const conSaldo = saldoPosterior !== null && saldoPosterior !== undefined;
  const necesario = (rec.notas ? 7 : 0) + (conSaldo ? 13 : 0) + 24;
  if (y + necesario > H - 16) { doc.addPage(); encabezadoCompacto(); y = 30; }
  if (rec.notas) { y += par('Notas:', rec.notas, M, y, W - 2 * M) * LH + 2; }
  if (conSaldo) {
    const s = Number(saldoPosterior);
    const txt = Math.abs(s) < 0.01 ? 'Cuenta corriente al día' : (s > 0 ? `Saldo pendiente en cuenta corriente: ${ars(s)}` : `Saldo a favor en cuenta corriente: ${ars(-s)}`);
    doc.setFillColor(...(s > 0.01 ? [255, 247, 237] : [240, 253, 244])); doc.roundedRect(M, y, 110, 9, 1.5, 1.5, 'F');
    setTxt(8.6, true, s > 0.01 ? [154, 52, 18] : [21, 128, 61]); doc.text(txt, M + 3, y + 5.9);
    y += 13;
  }
  const fy = Math.max(y + 16, H - 40);
  doc.setDrawColor(...GRAY); doc.setLineWidth(0.3);
  doc.line(W - M - 70, fy, W - M, fy);
  setTxt(7.5, false, GRAY);
  doc.text('Firma y aclaración', W - M - 35, fy + 4, { align: 'center' });
  setTxt(7.2, false, GRAY, true);
  doc.text(doc.splitTextToSize('Los cheques y valores se reciben salvo buen cobro. Este recibo cancela los comprobantes detallados por los importes indicados.', 105), M, fy - 2, { lineHeightFactor: 1.25 });

  // ── Pie en todas las hojas ───────────────────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFillColor(...GOLD); doc.rect(M, H - 12, W - 2 * M, 0.5, 'F');
    setTxt(7, false, GRAY);
    doc.text(`${contacto.web}   ·   ${contacto.ig}   ·   ${contacto.email}   ·   Tel. ${contacto.tel}`, W / 2, H - 7.5, { align: 'center' });
    doc.text(`Página ${p} de ${total}`, W - M, H - 7.5, { align: 'right' });
    if (rec.estado === 'anulado' || rec.prueba) {
      try { doc.setGState(new doc.GState({ opacity: 0.12 })); } catch { /* sin transparencia */ }
      setTxt(48, true, [220, 38, 38]);
      doc.text(rec.estado === 'anulado' ? 'ANULADO' : 'PRUEBA', W / 2, H / 2 + 10, { align: 'center', angle: 30 });
      try { doc.setGState(new doc.GState({ opacity: 1 })); } catch { /* noop */ }
    }
  }

  if (descargar) doc.save(`REC_${numero}.pdf`);
  return doc;
}
