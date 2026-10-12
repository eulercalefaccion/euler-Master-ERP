/**
 * PDF "Estado de cuenta corriente" de un cliente (identidad visual Euler).
 * Resumen por empresa, comprobantes pendientes, materiales a favor y movimientos con saldo corrido.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { conSaldoCorrido, totalesCuenta } from './ventasCalculo';

const DARK = [13, 42, 78];
const MID = [26, 74, 122];
const GOLD = [245, 166, 35];
const LIGHT = [232, 239, 247];
const GRAY = [100, 116, 139];
const TEXT = [30, 41, 59];

const NOMBRE_EMPRESA = { 'ayala-nicolas': 'AYALA NICOLAS FEDERICO', 'euler-calefaccion': 'EULER CALEFACCIÓN' };
const ars = (n) => `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fechaAR = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');

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
 * @param {object} cta  cuenta de calcularCartera
 * @param {{ empresaId?: string, materiales?: object[], contacto?: object, logo?: string, descargar?: boolean }} opts
 */
export async function generarPDFEstadoCuenta(cta, { empresaId = '', materiales = [], contacto = {}, logo, descargar = true } = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;
  const logoData = logo ?? await cargarLogo();
  const hoy = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const setTxt = (size, bold = false, color = TEXT) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color); };

  // Encabezado
  doc.setFillColor(...DARK); doc.rect(0, 0, W, 3, 'F');
  doc.setFillColor(...GOLD); doc.rect(0, 3, W, 0.8, 'F');
  if (logoData) doc.addImage(logoData, 'PNG', M, 9, 56, 16);
  else { setTxt(22, true, DARK); doc.text('EULER', M, 20); }
  setTxt(16, true, DARK); doc.text('ESTADO DE CUENTA', W - M, 15, { align: 'right' });
  setTxt(9, false, GRAY); doc.text(`Emitido el ${fechaAR(hoy)}${empresaId ? ` · ${NOMBRE_EMPRESA[empresaId]}` : ''}`, W - M, 21, { align: 'right' });
  setTxt(7.5, false, GRAY);
  doc.text([contacto.telefono || '341 569-5849', contacto.email || 'info@euler.com.ar', contacto.web || 'www.euler.com.ar'].join('  ·  '), W - M, 26, { align: 'right' });
  doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.3); doc.line(M, 30, W - M, 30);
  doc.setFillColor(...GOLD); doc.rect(M, 29.6, 28, 0.9, 'F');

  // Cliente
  let y = 37;
  setTxt(7, true, MID); doc.text('CLIENTE', M, y);
  setTxt(12, true, DARK); doc.text(doc.splitTextToSize(cta.nombre || '-', W - 2 * M - 70), M, y + 6);
  setTxt(8.3, false, TEXT);
  const datos = [cta.cuit && `${String(cta.cuit).length === 11 ? 'CUIT' : 'Doc.'}: ${cta.cuit}`, cta.telefono && `Tel.: ${cta.telefono}`, cta.domicilio].filter(Boolean).join('   ·   ');
  if (datos) doc.text(doc.splitTextToSize(datos, W - 2 * M - 70), M, y + 12);

  // Caja de saldo
  const tot = totalesCuenta(cta, empresaId);
  const bx = W - M - 62;
  doc.setFillColor(...(tot.saldo > 0.009 ? [254, 243, 199] : [220, 252, 231]));
  doc.roundedRect(bx, y - 4, 62, 20, 2, 2, 'F');
  setTxt(7.5, true, GRAY); doc.text(tot.saldo > 0.009 ? 'SALDO A PAGAR' : (tot.saldo < -0.009 ? 'SALDO A SU FAVOR' : 'CUENTA AL DÍA'), bx + 31, y + 2, { align: 'center' });
  setTxt(14, true, tot.saldo > 0.009 ? [180, 83, 9] : [4, 120, 87]); doc.text(ars(Math.abs(tot.saldo)), bx + 31, y + 10.5, { align: 'center' });
  y += 22;

  const tabla = (titulo, head, body, opts = {}) => {
    if (y > H - 40) { doc.addPage(); y = 16; }
    setTxt(9.5, true, DARK); doc.text(titulo, M, y);
    autoTable(doc, {
      startY: y + 2, head: [head], body, margin: { left: M, right: M },
      styles: { fontSize: 7.8, cellPadding: 1.6, textColor: TEXT, lineColor: [226, 232, 240], lineWidth: 0.1 },
      headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      ...opts,
    });
    y = doc.lastAutoTable.finalY + 7;
  };

  // Resumen por empresa
  const emps = Object.keys(cta.porEmpresa).filter((e) => !empresaId || e === empresaId);
  if (emps.length) {
    const body = emps.map((e) => {
      const t = cta.porEmpresa[e];
      return [NOMBRE_EMPRESA[e] || e, ars(t.inicial), ars(t.facturado), ars(t.notasCredito), ars(t.cobrado), ars(t.saldo)];
    });
    if (emps.length > 1) body.push(['TOTAL', ars(tot.inicial), ars(tot.facturado), ars(tot.notasCredito), ars(tot.cobrado), ars(tot.saldo)]);
    tabla('Resumen', ['Empresa', 'Saldo inicial', 'Facturado', 'Notas de crédito', 'Cobrado', 'Saldo'], body, {
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } },
      didParseCell: (d) => { if (d.section === 'body' && d.row.raw[0] === 'TOTAL') { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = LIGHT; } },
    });
  }

  // Pendientes
  const pend = (cta.pendientes || []).filter((p) => !empresaId || (p.empresaId || 'ayala-nicolas') === empresaId);
  if (pend.length) {
    tabla('Comprobantes pendientes de pago', ['Fecha', 'Comprobante', 'Empresa', 'Total', 'Pagado / NC', 'Pendiente'], pend.map((p) => [
      fechaAR(p.fechaEmision), `${p.tipoComprobante} ${p.numeroOriginal}`, NOMBRE_EMPRESA[p.empresaId || 'ayala-nicolas'] || '',
      ars(p.totalComprobante), ars((p._cobrado || 0) + (p._nc || 0)), ars(p._pendiente),
    ]), { columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } } });
  }

  // Materiales a favor
  const mats = materiales.filter((m) => m.estado !== 'anulado' && m.estado !== 'entregado' && (!empresaId || m.empresaId === empresaId));
  const filasMat = [];
  mats.forEach((m) => (m.items || []).forEach((it) => {
    const p = Number(it.cantidad) - Number(it.cantidadEntregada || 0);
    if (p > 0.0001) filasMat.push([fechaAR(m.fecha), m.comprobanteNumero || m.nota || 'Saldo inicial', it.descripcion, `${it.cantidad} ${it.unidad || ''}`, `${it.cantidadEntregada || 0}`, `${p} ${it.unidad || ''}`]);
  }));
  if (filasMat.length) {
    tabla('Materiales pagados pendientes de entrega', ['Fecha', 'Origen', 'Material', 'Cantidad', 'Entregado', 'Pendiente'], filasMat, {
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } },
    });
  }

  // Movimientos
  const movs = conSaldoCorrido((cta.movimientos || []).filter((m) => !empresaId || m.empresaId === empresaId));
  if (movs.length) {
    tabla('Movimientos', ['Fecha', 'Comprobante', 'Detalle', 'Debe', 'Haber', 'Saldo'], movs.map((m) => [
      fechaAR(m.fecha), m.concepto, m.detalle || '', m.debe ? ars(m.debe) : '', m.haber ? ars(m.haber) : '', ars(m.saldo),
    ]), { columnStyles: { 2: { cellWidth: 62 }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } } });
  }

  // Pie
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    setTxt(7, false, GRAY);
    doc.text('Ante cualquier diferencia, por favor comunicate con nosotros. ¡Gracias por confiar en Euler Calefacción!', M, H - 8);
    doc.text(`Página ${i} de ${pages}`, W - M, H - 8, { align: 'right' });
  }

  const nombre = `EstadoCuenta_${String(cta.nombre || 'cliente').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40)}_${hoy}.pdf`;
  if (descargar) doc.save(nombre);
  return { doc, nombre };
}
