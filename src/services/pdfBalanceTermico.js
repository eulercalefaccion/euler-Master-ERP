import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const EULER_DARK  = [17, 24, 53];    // Dark navy blue matching the screenshot headers
const EULER_GOLD  = [218, 165, 32];  // Gold
const EULER_LIGHT_BG = [238, 240, 246]; // Light gray-blue for alternate rows

export default async function generarPDFBalanceTermico(data) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  
  const { environments, params, totalKcalMargin, totalVolumen, totalElementos, totalSup, colectores, totalTubos } = data;
  const totalWatts = (totalKcalMargin / 1.163) / (1 + (params.margenSeguridad / 100)); // Potencia efectiva en W sin margen para la tabla de cargas
  const totalWattsMargin = totalKcalMargin / 1.163; // Con margen en W
  const esPisoRadiante = params.sistemaEmision === 'Piso Radiante';
  
  // Margins
  const marginX = 15;
  let y = 15;

  // --- Top Border ---
  doc.setFillColor(...EULER_DARK);
  doc.rect(0, 0, W, 4, 'F');
  
  if (esPisoRadiante) {
    // Caja dorada para "CASO B - VIVIENDA MEDIA"
    doc.setFillColor(205, 150, 75); // Color dorado mostaza
    doc.rect(W / 2 - 25, 4, 50, 10, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('REPORTE: PISO RADIANTE', W / 2, 10, { align: 'center' });
  } else {
    doc.setFillColor(232, 175, 48); // Gold
    doc.rect(0, 4, W, 1, 'F');
  }

  y += 15;

  // --- Header ---
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...EULER_DARK);
  doc.text(`Balance térmico — Proyecto ${Math.round(totalSup || 0)} m² · ${params.sistemaEmision}`, marginX, y);
  
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

  // -------------------------------------------------------------
  // BRANCH: PISO RADIANTE (CASO B)
  // -------------------------------------------------------------
  if (esPisoRadiante) {
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    const descText = "Diseño integral de sistema hidrónico de baja temperatura, considerando densidad de emisión y balance hidráulico por colector.";
    const lines = doc.splitTextToSize(descText, W - 2 * marginX);
    doc.text(lines, marginX, y);
    y += lines.length * 4 + 6;

    // --- 1. Cargas por zona y densidad ---
    addSectionTitle('1 · Cargas por zona y densidad de emisión', '');
    
    const zonasBody = environments.filter(e => e.calefaccion).map(env => [
      env.planta ? `${env.planta.substring(0, 2).toUpperCase()} · ${env.nombre}` : env.nombre,
      env.superficie.toFixed(1),
      Math.round(env.totalW).toLocaleString('es-AR'),
      Math.round(env.wattsPorM2 || 0).toString(),
      `${env.tempSup || 25} °C`
    ]);

    const sumaWatts = environments.filter(e => e.calefaccion).reduce((a, e) => a + e.totalW, 0);

    zonasBody.push([
      { content: 'TOTAL', styles: { fontStyle: 'bold' } },
      { content: totalSup.toFixed(1), styles: { fontStyle: 'bold' } },
      { content: Math.round(sumaWatts).toLocaleString('es-AR'), styles: { fontStyle: 'bold' } },
      { content: Math.round(sumaWatts / (totalSup || 1)).toString(), styles: { fontStyle: 'bold' } },
      { content: '—', styles: { fontStyle: 'bold', halign: 'center' } }
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Zona', 'Sup. [m²]', 'Q total [W]', 'W/m²', 'Temp. sup. losa']],
      body: zonasBody,
      theme: 'grid',
      headStyles: { fillColor: EULER_DARK, textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: 50 },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      columnStyles: { 0: { fontStyle: 'normal' }, 1: { halign: 'center' }, 2: { halign: 'center', fontStyle: 'bold' }, 3: { halign: 'center' }, 4: { halign: 'center' } },
      margin: { left: marginX, right: marginX }
    });
    y = doc.lastAutoTable.finalY + 3;
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 100, 100);
    doc.text("Verificación de losa: la temperatura no debe superar ~29°C. Baños se resuelven con mayor densidad.", marginX, y + 3);
    y += 12;

    // --- 2. Diseño de circuitos y balance hidráulico ---
    if (y > 220) { doc.addPage(); y = 20; }
    addSectionTitle('2 · Diseño de circuitos y balance hidráulico', 'Aquí el informe detalla el dimensionamiento hidrónico por nivel.');

    const colBody = colectores.map(col => [
      `Colector ${col.planta} (${col.circuitos} vías)`,
      col.circuitos,
      `${Math.round(col.longitudMax)} m`,
      `${params.pasoTubo} cm`,
      `~ ${Math.round(col.circuitos * 120)} litros/hora` // Caudal estimado (120L/h aprox por via o calculo simple)
    ]);
    const caudalTotalSistema = Math.round(totalKcalMargin / 10); // Q / 10K

    autoTable(doc, {
      startY: y,
      head: [['Colector', 'Circuitos', 'Long. máx.', 'Paso', 'Caudal total est.']],
      body: colBody,
      theme: 'grid',
      headStyles: { fillColor: EULER_DARK, textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: 50 },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      columnStyles: { 4: { fontStyle: 'bold' } },
      margin: { left: marginX, right: marginX }
    });
    y = doc.lastAutoTable.finalY + 3;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 100, 100);
    doc.text("El balance por lazos (equilibrado de caudales en cada vía del colector) es fundamental.", marginX, y + 3);
    y += 12;

    // --- 3. Generación y bombeo ---
    if (y > 220) { doc.addPage(); y = 20; }
    addSectionTitle('3 · Generación y bombeo', '');
    
    const kwCalderaPR = (totalWattsMargin / 1000).toFixed(1);

    autoTable(doc, {
      startY: y,
      head: [['Componente', 'Criterio / dato', 'Selección']],
      body: [
        ['Caldera', `${kwCalderaPR} kW + margen ACS`, 'Caldera modúlate recomendada (ej: 24-35 kW)'],
        ['Régimen radiante', 'Baja temperatura', '40/32 °C con válvula mezcladora / condensación'],
        ['Caudal total sistema', 'Suma de colectores', `~ ${caudalTotalSistema} litros/hora`],
        ['Bomba de circuito', 'Caudal vs. pérdida de carga', 'Circulador clase A integrado o externo']
      ],
      theme: 'grid',
      headStyles: { fillColor: EULER_DARK, textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: 50 },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      margin: { left: marginX, right: marginX }
    });
    y = doc.lastAutoTable.finalY + 12;

  } else {
    // -------------------------------------------------------------
    // BRANCH: RADIADORES (CASO A)
    // -------------------------------------------------------------
    
    // --- 1. Datos de partida ---
    addSectionTitle('1 · Datos de partida', 'Todo informe abre declarando las hipótesis de cálculo.');
    autoTable(doc, {
      startY: y,
      head: [['Parámetro', 'Valor adoptado', 'Referencia']],
      body: [
        ['Zona bioclimática', params.zonaIram, 'IRAM 11603'],
        ['Temperatura interior', `${params.tempInterior} °C`, 'Confort'],
        ['Temperatura exterior', `${params.tempExterior} °C`, 'Zona bioamb. local'],
        ['Coef. volumétrico', `${params.coefVolumetrico} Kcal/h·m³`, 'Estimación'],
        ['Margen seguridad', `${params.margenSeguridad}%`, 'Euler']
      ],
      theme: 'grid',
      headStyles: { fillColor: EULER_DARK, textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: 50 },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      margin: { left: marginX, right: marginX }
    });
    y = doc.lastAutoTable.finalY + 12;

    // --- 2. Balance de cargas por local ---
    addSectionTitle('2 · Balance de cargas por local (resultado central)', 'Pérdidas por transmisión + infiltración local por local.');
    const cargasBody = environments.filter(e => e.calefaccion).map(env => [
      env.nombre,
      env.superficie.toFixed(1),
      Math.round(env.transmisionW).toLocaleString('es-AR'),
      Math.round(env.infiltracionW).toLocaleString('es-AR'),
      Math.round(env.totalW).toLocaleString('es-AR'),
      env.superficie > 0 ? Math.round(env.totalW / env.superficie).toString() : '0'
    ]);
    const sumaTrans = environments.filter(e => e.calefaccion).reduce((a, e) => a + e.transmisionW, 0);
    const sumaVent = environments.filter(e => e.calefaccion).reduce((a, e) => a + e.infiltracionW, 0);
    const sumaTotalW = environments.filter(e => e.calefaccion).reduce((a, e) => a + e.totalW, 0);

    cargasBody.push([
      { content: 'TOTAL', styles: { fontStyle: 'bold' } },
      { content: totalSup.toFixed(1), styles: { fontStyle: 'bold' } },
      { content: Math.round(sumaTrans).toLocaleString('es-AR'), styles: { fontStyle: 'bold' } },
      { content: Math.round(sumaVent).toLocaleString('es-AR'), styles: { fontStyle: 'bold' } },
      { content: Math.round(sumaTotalW).toLocaleString('es-AR'), styles: { fontStyle: 'bold' } },
      { content: Math.round(sumaTotalW / (totalSup || 1)).toString(), styles: { fontStyle: 'bold' } }
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Local', 'Sup. [m²]', 'Q trans. [W]', 'Q vent. [W]', 'Q total [W]', 'W/m²']],
      body: cargasBody,
      theme: 'grid',
      headStyles: { fillColor: EULER_DARK, textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: 50 },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' }, 5: { halign: 'right' } },
      margin: { left: marginX, right: marginX }
    });
    y = doc.lastAutoTable.finalY + 12;

    if (y > 230) { doc.addPage(); y = 20; }

    // --- 3. Selección de equipos ---
    addSectionTitle('3 · Selección de equipos', 'Basado en los requerimientos térmicos calculados.');
    const kwCaldera = (totalWattsMargin / 1000).toFixed(1);
    const caudalAprox = Math.round(totalKcalMargin / 10); 
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

    if (y > 220) { doc.addPage(); y = 20; }

    // --- 4. Distribución de emisores ---
    addSectionTitle('4 · Distribución de emisores (Radiadores / Toalleros)', 'Detalle de equipos a instalar.');
    const emisoresBody = environments.filter(e => e.calefaccion).map(env => [
      env.nombre,
      env.choice?.type || 'Radiador',
      env.emitterSummary,
      Math.round(env.totalKcalMargin).toLocaleString('es-AR')
    ]);
    emisoresBody.push([
      { content: 'TOTALES', styles: { fontStyle: 'bold' } },
      { content: '-', styles: { fontStyle: 'bold', halign: 'center' } },
      { content: `${totalElementos} elementos eq.`, styles: { fontStyle: 'bold' } },
      { content: Math.round(totalKcalMargin).toLocaleString('es-AR'), styles: { fontStyle: 'bold', halign: 'right' } }
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Local', 'Tipo de Emisor', 'Configuración', 'Req. (Kcal/h)']],
      body: emisoresBody,
      theme: 'grid',
      headStyles: { fillColor: EULER_DARK, textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: 50 },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      columnStyles: { 1: { halign: 'center' }, 2: { fontStyle: 'bold', textColor: [21, 128, 61] }, 3: { halign: 'right', fontStyle: 'bold', textColor: EULER_DARK } },
      margin: { left: marginX, right: marginX }
    });
  }

  // Footer en todas las páginas
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('Euler Calefacción · Informe técnico de balance térmico', marginX, 287);
    doc.setFillColor(150, 150, 150);
    doc.rect(W - marginX - 15, 282, 15, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(`Pág. ${i} / ${pageCount}`, W - marginX - 12, 287);
  }

  doc.save(`Balance_Termico_Euler_${new Date().getTime()}.pdf`);
}
