/**
 * PDF "Remito de entrega" (identidad visual Euler).
 * Sin precios: detalle de materiales entregados + bloque de conformidad (firma digital o renglones para firmar en papel)
 * + QR al link de firma digital mientras esté pendiente.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

const DARK = [13, 42, 78];
const GOLD = [245, 166, 35];
const LIGHT = [232, 239, 247];
const GRAY = [100, 116, 139];
const TEXT = [30, 41, 59];
const GREEN = [4, 120, 87];

const fechaAR = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
const fechaHoraAR = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const num = (n) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
export const METODO_FIRMA = { link: 'Firma digital (link enviado al cliente)', presencial: 'Firma en dispositivo de Euler al momento de la entrega', papel: 'Firmado en papel' };

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
 * @param {object} rem  documento de remitos_entrega (con id)
 * @param {{ descargar?: boolean, linkFirma?: string }} opts
 * @returns {Promise<Blob>}
 */
export async function generarPDFRemito(rem, { descargar = true, linkFirma = '' } = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;
  const em = rem.emisor || {};
  const logo = await cargarLogo();
  const setTxt = (size, bold = false, color = TEXT) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color); };
  const firmado = rem.estadoFirma === 'firmado';
  const link = linkFirma || (typeof window !== 'undefined' ? `${window.location.origin}/remito/${rem.id}` : '');

  // ── Encabezado ──
  doc.setFillColor(...DARK); doc.rect(0, 0, W, 3, 'F');
  doc.setFillColor(...GOLD); doc.rect(0, 3, W, 0.8, 'F');
  if (logo) doc.addImage(logo, 'PNG', M, 9, 56, 16);
  else { setTxt(22, true, DARK); doc.text('EULER', M, 20); }

  // Caja "X" central
  const cx = W / 2;
  doc.setDrawColor(...DARK); doc.setLineWidth(0.5); doc.rect(cx - 8, 8, 16, 14);
  setTxt(20, true, DARK); doc.text('X', cx, 18.5, { align: 'center' });
  setTxt(5.5, false, GRAY); doc.text('DOCUMENTO NO VÁLIDO', cx, 25.5, { align: 'center' }); doc.text('COMO FACTURA', cx, 28, { align: 'center' });

  setTxt(17, true, DARK); doc.text('REMITO DE ENTREGA', W - M, 14, { align: 'right' });
  setTxt(10, true, TEXT); doc.text(`N° ${rem.numero || ''}`, W - M, 20.5, { align: 'right' });
  setTxt(9, false, GRAY); doc.text(`Fecha: ${fechaAR(rem.fecha)}`, W - M, 25.5, { align: 'right' });

  // Emisor
  let y = 33;
  setTxt(9.5, true, DARK); doc.text(em.razonSocial || '', M, y);
  setTxt(7.8, false, GRAY);
  const lineasEmisor = [
    em.domicilio,
    [em.cuit && `CUIT ${em.cuit}`, em.condicionIva].filter(Boolean).join(' · '),
    [em.telefono, em.email, em.web].filter(Boolean).join(' · '),
  ].filter(Boolean);
  lineasEmisor.forEach((t, i) => doc.text(t, M, y + 4.2 * (i + 1)));
  y += 4.2 * (lineasEmisor.length + 1) + 1;
  doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.3); doc.line(M, y, W - M, y);
  doc.setFillColor(...GOLD); doc.rect(M, y - 0.4, 28, 0.9, 'F');

  // ── Cliente ──
  y += 4;
  doc.setFillColor(...LIGHT); doc.roundedRect(M, y, W - 2 * M, 24, 2, 2, 'F');
  setTxt(7, true, GRAY); doc.text('ENTREGADO A', M + 4, y + 5);
  setTxt(11, true, DARK); doc.text(doc.splitTextToSize(rem.clienteNombre || '', 110)[0] || '', M + 4, y + 11);
  setTxt(8, false, TEXT);
  const cuit = String(rem.clienteCuit || '');
  doc.text([
    cuit ? `${cuit.length === 11 ? 'CUIT' : 'DNI'}: ${cuit}` : '',
    rem.clienteDomicilio ? `Domicilio: ${rem.clienteDomicilio}` : '',
  ].filter(Boolean).join('   ·   ').slice(0, 120), M + 4, y + 16.5);
  if (rem.clienteTelefono) doc.text(`Tel.: ${rem.clienteTelefono}`, M + 4, y + 21);
  setTxt(7, true, GRAY); doc.text('REFERENCIA', W - M - 4, y + 5, { align: 'right' });
  setTxt(8.5, true, TEXT); doc.text(rem.comprobanteNumero || (rem.origen === 'entrega' ? 'Materiales a favor' : '—'), W - M - 4, y + 11, { align: 'right' });
  setTxt(7.5, false, GRAY);
  doc.text(rem.origen === 'factura' ? 'Entrega en el momento de la venta' : 'Entrega de materiales pendientes', W - M - 4, y + 16.5, { align: 'right' });
  if (rem.entregadoPor) doc.text(`Entregó: ${rem.entregadoPor}`, W - M - 4, y + 21, { align: 'right' });
  y += 29;

  // ── Detalle ──
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, bottom: 95 },
    head: [['Cantidad', 'Unidad', 'Descripción del material']],
    body: (rem.items || []).map((it) => [num(it.cantidad), it.unidad || 'u', it.descripcion || '']),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.2, textColor: TEXT, lineColor: [226, 232, 240], lineWidth: 0.2 },
    headStyles: { fillColor: DARK, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
    columnStyles: { 0: { halign: 'right', cellWidth: 24, fontStyle: 'bold' }, 1: { halign: 'center', cellWidth: 22 } },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });
  y = doc.lastAutoTable.finalY + 5;
  const totalUnid = (rem.items || []).reduce((a, it) => a + Number(it.cantidad || 0), 0);
  setTxt(8, false, GRAY); doc.text(`${(rem.items || []).length} ítem(s) · ${num(totalUnid)} unidad(es) en total`, M, y);
  if (rem.nota) { y += 5; setTxt(8, false, TEXT); doc.text(doc.splitTextToSize(`Observaciones: ${rem.nota}`, W - 2 * M), M, y); }

  // ── Conformidad (pie fijo de la última página) ──
  if (y > H - 92) doc.addPage();
  const yC = H - 88;
  doc.setDrawColor(...DARK); doc.setLineWidth(0.4); doc.roundedRect(M, yC, W - 2 * M, 66, 2, 2);
  doc.setFillColor(...DARK); doc.rect(M, yC, W - 2 * M, 7, 'F');
  setTxt(8.5, true, [255, 255, 255]); doc.text('CONFORMIDAD DEL CLIENTE', M + 4, yC + 4.8);
  setTxt(7.5, false, TEXT);
  doc.text(doc.splitTextToSize('Declaro haber recibido los materiales detallados en este remito en buen estado y en las cantidades indicadas.', 118), M + 4, yC + 12);

  const fx = M + 4; const fw = 112;
  if (firmado && rem.firma) {
    const f = rem.firma;
    if (f.imagen) {
      try {
        const props = doc.getImageProperties(f.imagen);
        const maxW = 70; const maxH = 26;
        const k = Math.min(maxW / props.width, maxH / props.height);
        doc.addImage(f.imagen, 'PNG', fx + 4, yC + 19, props.width * k, props.height * k);
      } catch { /* firma ilegible */ }
    }
    doc.setDrawColor(148, 163, 184); doc.setLineWidth(0.3); doc.line(fx, yC + 47, fx + 80, yC + 47);
    setTxt(7, false, GRAY); doc.text('Firma', fx, yC + 50.5);
    setTxt(8.5, true, TEXT); doc.text(`${f.nombre || ''}${f.dni ? `  ·  DNI ${f.dni}` : ''}`, fx, yC + 56);
    setTxt(7.5, false, GREEN); doc.text(`${METODO_FIRMA[f.metodo] || 'Firmado'} · ${fechaHoraAR(f.fecha || rem.firmadoEn)}`, fx, yC + 61);
  } else {
    doc.setDrawColor(148, 163, 184); doc.setLineWidth(0.3);
    [['Firma', 33], ['Aclaración', 45], ['DNI', 57]].forEach(([t, dy]) => {
      doc.line(fx + 20, yC + dy, fx + fw - 10, yC + dy);
      setTxt(7.5, false, GRAY); doc.text(t, fx, yC + dy);
    });
    doc.line(fx + 20, yC + 63, fx + 60, yC + 63); setTxt(7.5, false, GRAY); doc.text('Fecha', fx, yC + 63);
  }

  // QR / estado
  const qx = W - M - 58;
  if (!firmado && link && rem.estado !== 'anulado') {
    try {
      const qr = await QRCode.toDataURL(link, { margin: 0, width: 240, color: { dark: '#0D2A4E' } });
      doc.addImage(qr, 'PNG', qx + 14, yC + 11, 30, 30);
    } catch { /* sin QR */ }
    setTxt(8, true, DARK); doc.text('¿Preferís firmar digital?', qx + 29, yC + 46, { align: 'center' });
    setTxt(7, false, GRAY); doc.text(doc.splitTextToSize('Escaneá el código con la cámara del celular y firmá con el dedo.', 54), qx + 29, yC + 50.5, { align: 'center' });
  } else if (firmado) {
    doc.setFillColor(236, 253, 245); doc.roundedRect(qx + 2, yC + 14, 54, 26, 2, 2, 'F');
    setTxt(12, true, GREEN); doc.text('RECIBIDO', qx + 29, yC + 25, { align: 'center' });
    doc.text('CONFORME', qx + 29, yC + 31, { align: 'center' });
    setTxt(7, false, GREEN); doc.text(fechaHoraAR(rem.firmadoEn), qx + 29, yC + 36.5, { align: 'center' });
  }

  // Marcas de agua
  const marca = rem.estado === 'anulado' ? 'ANULADO' : (rem.prueba ? 'PRUEBA' : '');
  if (marca) {
    doc.saveGraphicsState?.();
    doc.setGState?.(new doc.GState({ opacity: 0.12 }));
    setTxt(80, true, [185, 28, 28]); doc.text(marca, W / 2, H / 2, { align: 'center', angle: 30 });
    doc.restoreGraphicsState?.();
  }

  // Pie
  doc.setFillColor(...DARK); doc.rect(0, H - 12, W, 12, 'F');
  doc.setFillColor(...GOLD); doc.rect(0, H - 12, W, 0.6, 'F');
  setTxt(7.5, false, [255, 255, 255]);
  doc.text([em.razonSocial, em.domicilio, em.telefono].filter(Boolean).join('  ·  '), M, H - 5);
  doc.text(`Remito N° ${rem.numero || ''}`, W - M, H - 5, { align: 'right' });

  const nombre = `Remito_${String(rem.numero || rem.id).replace(/[^\w-]+/g, '_')}.pdf`;
  if (descargar) doc.save(nombre);
  return doc.output('blob');
}
