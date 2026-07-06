import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const EULER_DARK  = [13,  42, 78];
const EULER_MID   = [26,  74, 122];
const EULER_LIGHT = [232, 239, 247];

export const generarPDFBalance = async (presupuesto, balanceData) => {
  if (!presupuesto || !balanceData) {
    throw new Error('No hay datos suficientes para generar el PDF del balance térmico.');
  }

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let cursorY = 20;

  // --- Header ---
  doc.setFillColor(...EULER_DARK);
  doc.rect(0, 0, pageWidth, 25, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('BALANCE TÉRMICO Y CÁLCULO DE SISTEMA', 15, 16);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const dateStr = new Date().toLocaleDateString('es-AR');
  doc.text(`Fecha: ${dateStr}`, pageWidth - 40, 16);

  cursorY = 35;

  // --- Lead Info ---
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Datos del Proyecto', 15, cursorY);
  
  cursorY += 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Cliente: ${presupuesto.name || 'S/D'}`, 15, cursorY);
  doc.text(`Proyecto: ${presupuesto.presupuestoNumber || 'S/D'} - Rev ${presupuesto.revision || 0}`, 100, cursorY);
  doc.text(`Ubicación: ${presupuesto.location || 'S/D'}`, 190, cursorY);

  cursorY += 15;

  const { tipo, radiadores, piso, colectores } = balanceData;

  if (tipo === 'radiadores') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Sistema por Radiadores', 15, cursorY);
    cursorY += 5;

    if (!radiadores || radiadores.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('No hay ambientes cargados.', 15, cursorY + 5);
    } else {
      const tableBody = radiadores.map(r => {
        const sup = (Number(r.largo) || 0) * (Number(r.ancho) || 0);
        const vol = sup * (Number(r.altura) || 0);
        const kcal = vol * (Number(r.coeficiente) || 0);
        const elementos = kcal / 180;
        const elemTotales = Math.ceil(elementos);
        
        let radiadoresArr = [];
        if (!r.isToallero && elemTotales > 0) {
          if (elemTotales <= 12) {
            radiadoresArr = [elemTotales];
          } else if (elemTotales <= 24) {
            const m = Math.ceil(elemTotales / 2);
            radiadoresArr = [m, elemTotales - m];
          } else {
            const q = Math.ceil(elemTotales / 12);
            let rem = elemTotales;
            for (let j = 0; j < q; j++) {
              const cant = j === q - 1 ? rem : Math.ceil(elemTotales / q);
              radiadoresArr.push(cant);
              rem -= cant;
            }
          }
        }

        return [
          r.planta || '',
          r.ambiente || '',
          `${r.largo} x ${r.ancho} x ${r.altura}`,
          sup.toFixed(1),
          vol.toFixed(1),
          r.coeficiente,
          kcal.toFixed(0),
          r.isToallero ? 'TOALLERO' : radiadoresArr.join(' + ')
        ];
      });

      autoTable(doc, {
        startY: cursorY,
        head: [['Planta', 'Ambiente', 'Medidas (m)', 'Sup (m2)', 'Vol (m3)', 'Coef.', 'Kcal Totales', 'Radiadores/Emisores']],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: EULER_MID, textColor: 255 },
        styles: { fontSize: 9 },
        alternateRowStyles: { fillColor: EULER_LIGHT }
      });
    }
  } else if (tipo === 'piso') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Sistema por Piso Radiante (Paso 20cm)', 15, cursorY);
    cursorY += 8;

    if (!piso || piso.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('No hay ambientes cargados.', 15, cursorY);
    } else {
      // 1. Resumen de Colectores
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('1. Resumen de Colectores', 15, cursorY);
      cursorY += 5;

      const colBody = (colectores || []).map(col => {
        const colPisos = piso.filter(p => p.colectorId === col.id);
        const circs = colPisos.reduce((acc, p) => {
          const sup = Number(p.superficie) || 0;
          const dist = Number(p.distancia) || 0;
          if (dist === 0) return acc;
          const mlCircuito = (sup * 5) + (dist * 2);
          const cantCirc = mlCircuito > 110 ? Math.ceil(mlCircuito / 100) : 1;
          return acc + cantCirc;
        }, 0);
        return [
          col.planta || '',
          col.nombre || '',
          circs.toString(),
          circs > 5 ? 'EXCEDE MÁXIMO (5)' : 'OK'
        ];
      });

      autoTable(doc, {
        startY: cursorY,
        head: [['Planta', 'Colector', 'Cant. Circuitos', 'Estado']],
        body: colBody,
        theme: 'grid',
        headStyles: { fillColor: EULER_MID, textColor: 255 },
        styles: { fontSize: 9 },
        alternateRowStyles: { fillColor: EULER_LIGHT }
      });

      cursorY = doc.lastAutoTable.finalY + 10;

      // 2. Detalle de Ambientes
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('2. Detalle de Ambientes y Circuitos', 15, cursorY);
      cursorY += 5;

      const pBody = piso.map(p => {
        const col = colectores.find(c => c.id === p.colectorId);
        const sup = Number(p.superficie) || 0;
        const dist = Number(p.distancia) || 0;
        
        let mlEspira = 0, mlConexion = 0, mlCircuito = 0, cantCirc = 0, estado = 'Falta Dist.';
        
        if (dist > 0) {
          mlEspira = sup * 5;
          mlConexion = dist * 2;
          mlCircuito = mlEspira + mlConexion;
          cantCirc = mlCircuito > 110 ? Math.ceil(mlCircuito / 100) : 1;
          
          if (mlCircuito > 110) estado = `FORZADO (${cantCirc} circ.)`;
          else if (mlCircuito > 100) estado = 'ALERTA (Tolerancia)';
          else estado = 'OK';
        }

        return [
          col ? col.nombre : 'S/Asignar',
          p.ambiente || '',
          sup.toFixed(1),
          dist.toFixed(1),
          dist > 0 ? mlEspira.toFixed(1) : '-',
          dist > 0 ? mlConexion.toFixed(1) : '-',
          dist > 0 ? mlCircuito.toFixed(1) : '-',
          dist > 0 ? cantCirc.toString() : '-',
          estado
        ];
      });

      autoTable(doc, {
        startY: cursorY,
        head: [['Colector', 'Ambiente', 'Sup. Útil (m2)', 'Dist. Ida (m)', 'ML Espira', 'ML Conexión', 'ML Total', 'N° Circ.', 'Estado']],
        body: pBody,
        theme: 'grid',
        headStyles: { fillColor: EULER_MID, textColor: 255 },
        styles: { fontSize: 9 },
        alternateRowStyles: { fillColor: EULER_LIGHT }
      });
    }
  }

  // Descargar PDF
  const filename = `Balance_${presupuesto.presupuestoNumber || 'S-N'}_Rev${presupuesto.revision || 0}.pdf`;
  doc.save(filename);
};
