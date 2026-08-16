import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const EULER_DARK  = [13,  42, 78];    // #0D2A4E
const EULER_MID   = [26,  74, 122];   // #1A4A7A
const EULER_GOLD  = [245, 166, 35];   // #F5A623
const EULER_LIGHT = [232, 239, 247];  // #E8EFF7
const WHITE       = [255, 255, 255];
const GRAY_TEXT   = [68,  68,  68];
const GRAY_LIGHT  = [245, 245, 245];

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

const drawLogo = (doc, x, y, logoBase64) => {
  if (logoBase64) {
    const imgWidth = 120;
    const imgHeight = 40;
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

const buildPortada = (doc, data, logoBase64) => {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  doc.setFillColor(...EULER_DARK);
  doc.rect(0, 0, W, H, 'F');

  doc.setFillColor(...EULER_MID);
  doc.rect(0, H - 22, W, 22, 'F');
  doc.setFillColor(...EULER_GOLD);
  doc.rect(0, H - 24, W, 2, 'F');

  drawLogo(doc, W / 2, 80, logoBase64);

  doc.setDrawColor(...[42, 90, 138]);
  doc.setLineWidth(0.5);
  doc.line(40, 100, W - 40, 100);

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...WHITE);
  doc.text('INFORME TÉCNICO: BALANCE TÉRMICO DE CALEFACCIÓN', W / 2, 116, { align: 'center' });

  const campos = [
    ['Fecha:', new Date().toLocaleDateString('es-AR')],
    ['Metodología:', 'Coeficiente Volumétrico (IRAM 11603)'],
    ['Potencia Calculada:', `${Math.round(data.totalKcalMargin).toLocaleString('es-AR')} Kcal/h`],
    ['Total Elementos Eq.:', `${data.totalElementos}`]
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

  doc.setFontSize(9);
  doc.setTextColor(...labelColor);
  doc.text('www.euler.com.ar  |  info@euler.com.ar  |  CEL 341 5695849', W / 2, H - 10, { align: 'center' });
};

const buildTablaBalance = (doc, data) => {
  doc.addPage();
  const W = doc.internal.pageSize.getWidth();

  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...EULER_MID);
  doc.text(`EULER Calefacción por Agua  |  Balance Térmico`, W - 14, 14, { align: 'right' });

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...EULER_DARK);
  doc.text('Resultados del Cálculo Térmico', 14, 25);

  doc.setFillColor(...EULER_GOLD);
  doc.rect(14, 28, W - 28, 1.5, 'F');

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...GRAY_TEXT);
  doc.text('Parámetros de diseño', 14, 38);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Coeficiente Volumétrico aplicado: ${data.params.coefVolumetrico} Kcal/h·m³`, 14, 44);
  doc.text(`Margen de Seguridad: ${data.params.margenSeguridad}%`, 14, 49);
  doc.text(`Rendimiento de radiador adoptado: ${data.params.rendimientoElemento} Kcal/h por elemento`, 14, 54);

  let startY = 64;

  const tableData = data.environments.map((env) => [
    env.nombre,
    env.superficie.toFixed(1),
    env.volumen.toFixed(1),
    Math.round(env.totalKcalMargin).toLocaleString('es-AR'),
    env.emitterSummary
  ]);

  autoTable(doc, {
    startY: startY,
    head: [['Ambiente', 'Sup (m²)', 'Vol (m³)', 'Kcal/h', 'Emisores Asignados']],
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
      0: { cellWidth: 'auto', fontStyle: 'bold' },
      1: { cellWidth: 20, halign: 'right' },
      2: { cellWidth: 20, halign: 'right' },
      3: { cellWidth: 22, halign: 'right', textColor: EULER_MID, fontStyle: 'bold' },
      4: { cellWidth: 50, textColor: [21, 128, 61], fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });

  const finalY = doc.lastAutoTable.finalY + 10;

  doc.setFillColor(...EULER_LIGHT);
  doc.roundedRect(14, finalY, W - 28, 18, 2, 2, 'F');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...EULER_DARK);
  doc.text('TOTALES', 20, finalY + 7);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Volumen calefaccionado: ${data.totalVolumen.toFixed(1)} m³`, 60, finalY + 7);
  doc.text(`Potencia Total (C/ Margen): ${Math.round(data.totalKcalMargin).toLocaleString('es-AR')} Kcal/h`, 110, finalY + 7);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...[21, 128, 61]);
  doc.text(`Elementos Totales: ${data.totalElementos}`, 20, finalY + 13);
};

export default async function generarPDFBalanceTermico(data) {
  const jspdfInstance = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  let logoBase64 = null;
  try {
    logoBase64 = await getBase64ImageFromURL('/logo_euler.png');
  } catch (e) {
    console.warn('No se pudo cargar el logo de Euler', e);
  }

  buildPortada(jspdfInstance, data, logoBase64);
  buildTablaBalance(jspdfInstance, data);

  jspdfInstance.save(`Balance_Termico_Euler_${new Date().getTime()}.pdf`);
}
