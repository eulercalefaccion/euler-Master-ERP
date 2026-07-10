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

  const { 
    tipo, 
    radiadores, 
    piso, 
    colectores,
    rendimientoElemento = 180,
    condicionesDiseno = { provincia: '-', ciudad: '-', tempExt: 0, tempInt: 20 },
    sistemaConstructivo = '-'
  } = balanceData;

  const deltaT = (condicionesDiseno.tempInt - condicionesDiseno.tempExt).toFixed(1);

  if (tipo === 'radiadores') {
    doc.setPage(1);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('DATOS DEL PROYECTO', 15, cursorY);
    cursorY += 8;

    doc.setFontSize(10);
    const col1X = 15;
    const col2X = 55;
    
    doc.setFont('helvetica', 'bold'); doc.text('Proyecto:', col1X, cursorY); doc.setFont('helvetica', 'normal'); doc.text(`${presupuesto.presupuestoNumber || 'S/D'}`, col2X, cursorY); cursorY += 5;
    doc.setFont('helvetica', 'bold'); doc.text('Versión:', col1X, cursorY); doc.setFont('helvetica', 'normal'); doc.text(`v${presupuesto.revision || 0}`, col2X, cursorY); cursorY += 5;
    doc.setFont('helvetica', 'bold'); doc.text('Cliente:', col1X, cursorY); doc.setFont('helvetica', 'normal'); doc.text(`${presupuesto.name || 'S/D'}`, col2X, cursorY); cursorY += 5;
    doc.setFont('helvetica', 'bold'); doc.text('Dirección:', col1X, cursorY); doc.setFont('helvetica', 'normal'); doc.text(`${presupuesto.location || 'S/D'}`, col2X, cursorY); cursorY += 5;
    doc.setFont('helvetica', 'bold'); doc.text('Sistema:', col1X, cursorY); doc.setFont('helvetica', 'normal'); doc.text('Radiadores', col2X, cursorY); cursorY += 5;
    doc.setFont('helvetica', 'bold'); doc.text('Provincia:', col1X, cursorY); doc.setFont('helvetica', 'normal'); doc.text(`${condicionesDiseno.provincia}`, col2X, cursorY); cursorY += 5;
    doc.setFont('helvetica', 'bold'); doc.text('Ciudad:', col1X, cursorY); doc.setFont('helvetica', 'normal'); doc.text(`${condicionesDiseno.ciudad}`, col2X, cursorY); cursorY += 5;
    doc.setFont('helvetica', 'bold'); doc.text('DELTA T:', col1X, cursorY); doc.setFont('helvetica', 'normal'); doc.text(`${deltaT} ºC`, col2X, cursorY); cursorY += 10;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('SISTEMA CONSTRUCTIVO', 15, cursorY);
    cursorY += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(sistemaConstructivo, 15, cursorY);
    cursorY += 12;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('CÁLCULO POR AMBIENTE', 15, cursorY);
    cursorY += 5;

    let totalKcal = 0;
    let totalW = 0;
    let totalElementos = 0;
    let totalRadiadores = 0;

    if (!radiadores || radiadores.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('No hay ambientes cargados.', 15, cursorY + 5);
    } else {
      const tableBody = radiadores.map(r => {
        const sup = (Number(r.largo) || 0) * (Number(r.ancho) || 0);
        const vol = sup * (Number(r.altura) || 0);
        const kcal = vol * (Number(r.coeficiente) || 0);
        const qWatts = kcal / 0.86;
        const elementos = kcal / rendimientoElemento;
        const elemTotales = Math.ceil(elementos);
        
        totalKcal += kcal;
        totalW += qWatts;
        
        let cantRadiadores = 0;
        let radiadoresArr = [];
        
        if (r.isToallero) {
          cantRadiadores = 1;
          const equivalencia = r.toalleroSize === '120' ? 5 : 3;
          totalElementos += equivalencia;
          totalRadiadores += 1;
        } else if (elemTotales > 0) {
          totalElementos += elemTotales;
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
          cantRadiadores = radiadoresArr.length;
          totalRadiadores += cantRadiadores;
        }

        return [
          r.ambiente || '',
          sup.toFixed(2),
          vol.toFixed(2),
          qWatts.toFixed(0),
          kcal.toFixed(0),
          r.isToallero ? `T. ${r.toalleroSize || '80'}` : elemTotales.toString(),
          cantRadiadores.toString(),
          r.isToallero ? '-' : radiadoresArr.join(' + ')
        ];
      });
      
      // Fila de totales en la tabla
      tableBody.push([
        { content: 'TOTAL', styles: { fontStyle: 'bold', halign: 'right' } },
        '', '', 
        { content: totalW.toFixed(0), styles: { fontStyle: 'bold' } }, 
        { content: totalKcal.toFixed(0), styles: { fontStyle: 'bold' } }, 
        { content: totalElementos.toString(), styles: { fontStyle: 'bold' } }, 
        { content: totalRadiadores.toString(), styles: { fontStyle: 'bold' } }, 
        ''
      ]);

      autoTable(doc, {
        startY: cursorY,
        head: [['Ambiente', 'm2', 'm3', 'Q Total\n(W)', 'Q Total\n(kcal/h)', 'Elem.\nTotales', 'Cant.\nRadiadores', 'Elem./Radiador']],
        body: tableBody,
        theme: 'plain',
        headStyles: { fillColor: [91, 74, 146], textColor: 255, halign: 'center', valign: 'middle' },
        bodyStyles: { fontSize: 8, halign: 'center', textColor: [68, 68, 68] },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: {
          0: { halign: 'left', fontStyle: 'bold', textColor: [0,0,0] }
        },
        margin: { top: 30 }
      });

      doc.addPage();
      
      doc.setFillColor(248, 250, 252);
      doc.rect(15, 20, pageWidth - 30, 45, 'F');
      
      let resY = 30;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(13, 42, 78);
      doc.text('RESUMEN TOTAL', 20, resY);
      
      resY += 10;
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.text(`Carga Termica Total: ${totalW.toFixed(0)} W (${totalKcal.toFixed(0)} kcal/h)`, 20, resY);
      
      resY += 7;
      doc.setFont('helvetica', 'normal');
      doc.text(`Potencia recomendada de caldera: ${(totalKcal * 1.15).toFixed(0)} kcal/h (factor de seguridad 15%)`, 20, resY);
      
      resY += 7;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(220, 38, 38);
      doc.text(`Total Radiadores: ${totalRadiadores} unidades (${totalElementos} elementos)`, 20, resY);
      
      resY += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text(`Nota: Cada elemento emite ${rendimientoElemento} kcal/h. Maximo 12 elementos por radiador.`, 20, resY);
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
