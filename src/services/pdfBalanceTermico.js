import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const EULER_DARK  = [17, 24, 53];    // Dark navy blue matching the screenshot headers
const EULER_LIGHT_BG = [238, 240, 246]; // Light gray-blue for alternate rows

export default async function generarPDFBalanceTermico(data) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  
  const { environments, params, totalKcalMargin, totalVolumen, totalElementos } = data;
  const totalSup = environments.reduce((a, e) => a + (parseFloat(e.superficie) || 0), 0);
  const totalWatts = (totalKcalMargin / 1.163) / (1 + (params.margenSeguridad / 100)); // Potencia efectiva en W sin margen para la tabla de cargas
  const totalWattsMargin = totalKcalMargin / 1.163; // Con margen en W
  
  // Margins
  const marginX = 15;
  let y = 15;

  // --- Top Border ---
  doc.setFillColor(...EULER_DARK);
  doc.rect(0, 0, W, 4, 'F');
  doc.setFillColor(232, 175, 48); // Gold
  doc.rect(0, 4, W, 1, 'F');

  y += 12;

  // --- Header ---
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...EULER_DARK);
  doc.text(`Balance térmico — Proyecto ${Math.round(totalSup)} m² · Radiadores`, marginX, y);
  
  y += 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(`Cálculo volumétrico · Margen de seguridad ${params.margenSeguridad}%`, marginX, y);

  y += 4;
  doc.setDrawColor(200, 200, 200);
  doc.line(marginX, y, W - marginX, y);

  y += 10;

  // --- Helper function for section titles ---
  const addSectionTitle = (title, subtitle) => {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...EULER_DARK);
    doc.text(title, marginX, y);
    y += 5;
    if (subtitle) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      doc.text(subtitle, marginX, y);
      y += 4;
    }
    y += 2;
  };

  // --- 1. Datos de partida ---
  addSectionTitle('1 · Datos de partida', 'Todo informe abre declarando las hipótesis de cálculo.');
  
  autoTable(doc, {
    startY: y,
    head: [['Parámetro', 'Valor adoptado', 'Referencia']],
    body: [
      ['Zona bioclimática', params.zonaIram, 'IRAM 11603'],
      ['Temperatura interior de diseño', `${params.tempInterior} °C`, 'Confort'],
      ['Temperatura exterior de diseño', `${params.tempExterior} °C`, 'Zona bioamb. local'],
      ['Coeficiente volumétrico', `${params.coefVolumetrico} Kcal/h·m³`, 'Estimación'],
      ['Margen de seguridad', `${params.margenSeguridad}%`, 'Euler']
    ],
    theme: 'grid',
    headStyles: { fillColor: EULER_DARK, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: 50 },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    margin: { left: marginX, right: marginX }
  });
  y = doc.lastAutoTable.finalY + 12;

  // --- 2. Transmitancias (Adaptado) ---
  addSectionTitle('2 · Parámetros de la envolvente', 'Se listan los parámetros de aislación adoptados para el cálculo.');
  
  autoTable(doc, {
    startY: y,
    head: [['Cerramiento', 'Descripción adoptada', 'Impacto en cálculo']],
    body: [
      ['Envolvente constructiva', params.tipoEnvolvente, 'Afecta coeficiente volumétrico'],
      ['Aberturas', params.tipoVidrio, 'Afecta carga de transmisión']
    ],
    theme: 'grid',
    headStyles: { fillColor: EULER_DARK, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: 50 },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    margin: { left: marginX, right: marginX }
  });
  y = doc.lastAutoTable.finalY + 12;

  // --- 3. Balance de cargas por local ---
  addSectionTitle('3 · Balance de cargas por local (resultado central)', 'Este es el corazón del informe: pérdidas por transmisión + infiltración local por local.');
  
  const cargasBody = environments.filter(e => e.calefaccion).map(env => [
    env.nombre,
    env.superficie.toFixed(1),
    Math.round(env.transmisionW).toLocaleString('es-AR'),
    Math.round(env.infiltracionW).toLocaleString('es-AR'),
    Math.round(env.totalW).toLocaleString('es-AR'),
    env.superficie > 0 ? Math.round(env.totalW / env.superficie).toString() : '0'
  ]);

  // Sumas para la fila de totales
  const sumaTrans = environments.filter(e => e.calefaccion).reduce((a, e) => a + e.transmisionW, 0);
  const sumaVent = environments.filter(e => e.calefaccion).reduce((a, e) => a + e.infiltracionW, 0);
  const sumaTotalW = environments.filter(e => e.calefaccion).reduce((a, e) => a + e.totalW, 0);

  cargasBody.push([
    { content: 'TOTAL', styles: { fontStyle: 'bold' } },
    { content: totalSup.toFixed(1), styles: { fontStyle: 'bold' } },
    { content: Math.round(sumaTrans).toLocaleString('es-AR'), styles: { fontStyle: 'bold' } },
    { content: Math.round(sumaVent).toLocaleString('es-AR'), styles: { fontStyle: 'bold' } },
    { content: Math.round(sumaTotalW).toLocaleString('es-AR'), styles: { fontStyle: 'bold' } },
    { content: Math.round(sumaTotalW / totalSup).toString(), styles: { fontStyle: 'bold' } }
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Local', 'Sup. [m²]', 'Q trans. [W]', 'Q vent. [W]', 'Q total [W]', 'W/m²']],
    body: cargasBody,
    theme: 'grid',
    headStyles: { fillColor: EULER_DARK, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: 50 },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      0: { fontStyle: 'normal' },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right', fontStyle: 'bold' },
      5: { halign: 'right' }
    },
    margin: { left: marginX, right: marginX }
  });
  y = doc.lastAutoTable.finalY + 12;

  // Verificar si hay espacio para la siguiente tabla, sino salto de página
  if (y > 230) {
    doc.addPage();
    y = 20;
  }

  // --- 4. Selección de equipos ---
  addSectionTitle('4 · Selección de equipos', 'Basado en los requerimientos térmicos calculados.');
  
  const kwCaldera = (totalWattsMargin / 1000).toFixed(1);
  const caudalAprox = Math.round(totalKcalMargin / 10); // ΔT 10 K = Q / 10 litros/h

  autoTable(doc, {
    startY: y,
    head: [['Componente', 'Criterio', 'Selección recomendada']],
    body: [
      ['Caldera', `Q + ${params.margenSeguridad}% margen = ${kwCaldera} kW`, 'Mural condensación / tiro forzado'],
      ['Emisión', `Rendimiento adoptado: ${params.rendimientoElemento} Kcal/h`, 'Radiadores de aluminio inyectado'],
      ['Caudal del sistema', 'Q / (1 Kcal/l·°C · ΔT 10°C)', `~ ${caudalAprox} litros/hora`],
      ['Bomba', 'Caudal vs. pérdida de carga', 'Circulador integrado en caldera']
    ],
    theme: 'grid',
    headStyles: { fillColor: EULER_DARK, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: 50 },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    margin: { left: marginX, right: marginX }
  });
  y = doc.lastAutoTable.finalY + 12;

  if (y > 220) {
    doc.addPage();
    y = 20;
  }

  // --- 5. Selección de emisores por local ---
  addSectionTitle('5 · Distribución de emisores (Radiadores / Toalleros)', 'Detalle de equipos a instalar en cada local térmico.');
  
  const emisoresBody = environments.filter(e => e.calefaccion).map(env => [
    env.nombre,
    env.choice?.type || 'Radiador',
    env.emitterSummary,
    Math.round(env.totalKcalMargin).toLocaleString('es-AR')
  ]);
  
  emisoresBody.push([
    { content: 'TOTALES', styles: { fontStyle: 'bold' } },
    { content: '-', styles: { fontStyle: 'bold', halign: 'center' } },
    { content: `${totalElementos} elementos equivalentes`, styles: { fontStyle: 'bold' } },
    { content: Math.round(totalKcalMargin).toLocaleString('es-AR'), styles: { fontStyle: 'bold', halign: 'right' } }
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Local', 'Tipo de Emisor', 'Configuración', 'Requerimiento (Kcal/h)']],
    body: emisoresBody,
    theme: 'grid',
    headStyles: { fillColor: EULER_DARK, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: 50 },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      0: { fontStyle: 'normal' },
      1: { halign: 'center' },
      2: { fontStyle: 'bold', textColor: [21, 128, 61] },
      3: { halign: 'right', fontStyle: 'bold', textColor: EULER_DARK }
    },
    margin: { left: marginX, right: marginX }
  });

  // Footer en todas las páginas
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('Euler Calefacción · Informe técnico de balance térmico', marginX, 287);
    
    // Page number box
    doc.setFillColor(150, 150, 150);
    doc.rect(W - marginX - 15, 282, 15, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(`Pág. ${i} / ${pageCount}`, W - marginX - 12, 287);
  }

  doc.save(`Balance_Termico_Euler_${new Date().getTime()}.pdf`);
}
