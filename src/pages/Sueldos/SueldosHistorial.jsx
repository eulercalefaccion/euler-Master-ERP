/**
 * SueldosHistorial — Historial de liquidaciones con PDF/Excel
 * Adaptado de EULER-SUELDOS Historial.jsx
 */
import React, { useState } from 'react';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { Download, Trash2, History, X } from 'lucide-react';
import { useSueldos } from './SueldosContext';
import { getMonthNumber, MESES, getCustomWeekDates, formatDF, getEmpName } from './sueldosUtils';

export default function SueldosHistorial() {
  const { liquidations, setLiquidations, employees, rates, saveData } = useSueldos();
  const [fYear, setFYear] = useState('');
  const [fMonth, setFMonth] = useState('');
  const [fWeek, setFWeek] = useState('');
  const [fEmp, setFEmp] = useState('');
  const [sel, setSel] = useState(null);

  const years = [...new Set(liquidations.map(l => l.year))].sort((a, b) => b - a);
  const weeks = [...new Set(liquidations.map(l => l.week))].sort((a, b) => a - b);

  const filtered = liquidations.filter(l =>
    (!fYear || l.year === parseInt(fYear)) &&
    (fMonth === '' || getMonthNumber(l.week, l.year) === parseInt(fMonth)) &&
    (!fWeek || l.week === parseInt(fWeek)) &&
    (!fEmp || l.employeeId === fEmp)
  ).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  const totals = filtered.reduce((a, l) => ({
    sal: a.sal + (l.calculations?.totalSalario || 0),
    gas: a.gas + (l.calculations?.totalGastos || 0),
    tot: a.tot + (l.calculations?.total || 0),
    hours: a.hours + (l.calculations?.totalHours || 0),
    bon2: a.bon2 + (parseFloat(l.bocasObraNueva2p) || 0),
    bon3: a.bon3 + (parseFloat(l.bocasObraNueva3p) || 0),
    br2: a.br2 + (parseFloat(l.bocasRefaccion2p) || 0),
    br3: a.br3 + (parseFloat(l.bocasRefaccion3p) || 0),
  }), { sal: 0, gas: 0, tot: 0, hours: 0, bon2: 0, bon3: 0, br2: 0, br3: 0 });

  const delLiq = async (id) => {
    if (!confirm('¿Eliminar esta liquidación?')) return;
    const u = liquidations.filter(l => l.id !== id);
    setLiquidations(u);
    await saveData({ liquidations: u });
  };

  const downloadPDF = async (liq) => {
    const doc = new jsPDF();
    const type = liq.weekType || 'estandar';
    const wd = getCustomWeekDates(liq.week, liq.year, type);
    const emp = employees.find(e => e.id === liq.employeeId);

    doc.setFontSize(18); doc.setFont(undefined, 'bold');
    doc.text('EULER CALEFACCIÓN', 105, 20, { align: 'center' });
    doc.setFontSize(12); doc.setFont(undefined, 'normal');
    doc.text('Liquidación de Haberes', 105, 28, { align: 'center' });
    doc.setLineWidth(0.5); doc.line(20, 33, 190, 33);

    let y = 43;
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold'); doc.text('Colaborador: ', 20, y);
    doc.setFont(undefined, 'normal'); doc.text(liq.employeeName || '', 60, y);
    y += 8;
    doc.setFont(undefined, 'bold'); doc.text('Período: ', 20, y);
    doc.setFont(undefined, 'normal'); doc.text('Semana ' + liq.week + ' - ' + liq.monthName + ' ' + liq.year, 60, y);
    if (wd.length >= 6) { y += 6; doc.text('Del ' + formatDF(wd[0]) + ' al ' + formatDF(wd[5]), 60, y); }

    y += 12;
    doc.setFont(undefined, 'bold'); doc.setFillColor(240, 240, 240);
    doc.rect(20, y - 5, 170, 7, 'F'); doc.text('DETALLE DE HORAS', 25, y);
    y += 10; doc.setFont(undefined, 'normal');

    const diasK = type === 'adelantada'
      ? ['viernes', 'sabado', 'domingo', 'lunes', 'martes', 'miercoles', 'jueves']
      : ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
    const diasL = type === 'adelantada'
      ? ['Viernes', 'Sábado', 'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves']
      : ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

    diasL.forEach((d, i) => {
      if (liq.hours?.[diasK[i]] !== undefined) {
        doc.text(d + ': ' + (liq.hours[diasK[i]] || 0).toFixed(1) + ' hs', 25, y); y += 6;
      }
    });
    doc.setFont(undefined, 'bold');
    doc.text('Total: ' + (liq.calculations?.totalHours || 0).toFixed(1) + ' hs', 25, y);

    y += 12; doc.setFillColor(240, 240, 240);
    doc.rect(20, y - 5, 170, 7, 'F'); doc.text('LIQUIDACIÓN', 25, y);
    y += 10; doc.setFont(undefined, 'normal');
    const r = liq.ratesUsed || rates;

    const addItem = (label, val, bold = false) => {
      if (bold) doc.setFont(undefined, 'bold');
      const lines = doc.splitTextToSize(label, 115);
      doc.text(lines, 25, y);
      doc.text('$' + val.toFixed(2), 185, y, { align: 'right' });
      if (bold) doc.setFont(undefined, 'normal');
      y += (lines.length * 5) + 2;
    };

    const eRate = liq.calculations?.effectiveHourlyRate || r.hourlyRate;
    addItem('Valor hora $' + eRate + ' x ' + (liq.calculations?.totalHours || 0).toFixed(1) + ' hs', liq.calculations?.valorSemana || 0);
    if (liq.calculations?.valorBocas > 0) {
      y += 2; doc.setFont(undefined, 'bold'); doc.text('Bocas:', 25, y); y += 6; doc.setFont(undefined, 'normal');
      if (liq.bocasObraNueva2p > 0) addItem('  ON 2p: ' + liq.bocasObraNueva2p + ' (x $' + (r.bocaObraNueva2p || 0) + ')', liq.calculations?.vbon2 || 0);
      if (liq.bocasObraNueva3p > 0) addItem('  ON 3p: ' + liq.bocasObraNueva3p + ' (x $' + (r.bocaObraNueva3p || 0) + ')', liq.calculations?.vbon3 || 0);
      if (liq.bocasRefaccion2p > 0) addItem('  Ref 2p: ' + liq.bocasRefaccion2p + ' (x $' + (r.bocaRefaccion2p || 0) + ')', liq.calculations?.vref2 || 0);
      if (liq.bocasRefaccion3p > 0) addItem('  Ref 3p: ' + liq.bocasRefaccion3p + ' (x $' + (r.bocaRefaccion3p || 0) + ')', liq.calculations?.vref3 || 0);
    }
    if (emp && emp.percentage > 0) addItem('Adicional (' + emp.percentage + '%)', liq.calculations?.adicional || 0);
    if (liq.vacaciones > 0) addItem('Vacaciones', liq.vacaciones);
    if (liq.bonoUocra > 0) addItem('Bono UOCRA', liq.bonoUocra);
    if (liq.aguinaldo > 0) addItem('Aguinaldo', liq.aguinaldo);
    if (liq.retroactivo > 0) addItem('Retroactivo', liq.retroactivo);
    if (liq.adelanto > 0) { doc.setTextColor(220, 38, 38); addItem('Adelanto', -liq.adelanto); doc.setTextColor(0); }

    y += 5; doc.setLineWidth(0.5); doc.line(20, y, 190, y); y += 10;
    doc.setFont(undefined, 'bold'); doc.setFontSize(12);
    doc.text('TOTAL SALARIO:', 25, y); doc.text('$' + (liq.calculations?.totalSalario || 0).toFixed(2), 185, y, { align: 'right' });
    y += 8; doc.setTextColor(37, 99, 235);
    doc.text('TOTAL GASTOS:', 25, y); doc.text('$' + (liq.calculations?.totalGastos || 0).toFixed(2), 185, y, { align: 'right' });
    doc.setTextColor(0);
    y += 12; doc.setFillColor(240, 255, 240); doc.setDrawColor(34, 197, 94);
    doc.roundedRect(20, y - 8, 170, 14, 2, 2, 'FD');
    doc.setFontSize(14); doc.setTextColor(21, 128, 61);
    doc.text('TOTAL A PAGAR:', 25, y); doc.text('$' + (liq.calculations?.total || 0).toFixed(2), 185, y, { align: 'right' });
    doc.setFontSize(8); doc.setTextColor(100); doc.setFont(undefined, 'normal');
    doc.text('Liquidado por: ' + liq.createdBy + ' - ' + new Date(liq.createdAt).toLocaleString('es-AR'), 20, 285);
    doc.save('Liquidacion_' + (liq.employeeName || '').replace(/\s/g, '_') + '_Sem' + liq.week + '_' + liq.year + '.pdf');
  };

  const downloadExcel = () => {
    const data = filtered.map(l => ({
      'Colaborador': l.employeeName || '', 'Año': l.year, 'Mes': l.monthName || '', 'Semana': l.week,
      'Total Horas': l.calculations?.totalHours || 0, 'ON 2p': l.bocasObraNueva2p || 0, 'ON 3p': l.bocasObraNueva3p || 0,
      'Ref 2p': l.bocasRefaccion2p || 0, 'Ref 3p': l.bocasRefaccion3p || 0,
      'Total Salario': l.calculations?.totalSalario || 0, 'Total Gastos': l.calculations?.totalGastos || 0,
      'Total General': l.calculations?.total || 0, 'Fecha': new Date(l.createdAt).toLocaleDateString('es-AR')
    }));
    if (data.length > 0) {
      data.push({ 'Colaborador': 'TOTALES', 'Total Horas': totals.hours, 'Total Salario': totals.sal, 'Total Gastos': totals.gas, 'Total General': totals.tot });
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Liquidaciones');
    XLSX.writeFile(wb, 'Liquidaciones.xlsx');
  };

  const cs = { card: { background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }, inp: { width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', background: '#f9fafb' } };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: '700' }}>Historial de Liquidaciones</h2>

      {/* Filtros */}
      <div style={cs.card}>
        <h3 style={{ fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.95rem' }}>Filtros</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
          <div><label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '4px' }}>Año</label>
            <select value={fYear} onChange={e => setFYear(e.target.value)} style={cs.inp}><option value="">Todos</option>{years.map(y => <option key={y} value={y}>{y}</option>)}</select></div>
          <div><label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '4px' }}>Mes</label>
            <select value={fMonth} onChange={e => setFMonth(e.target.value)} style={cs.inp}><option value="">Todos</option>{MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}</select></div>
          <div><label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '4px' }}>Semana</label>
            <select value={fWeek} onChange={e => setFWeek(e.target.value)} style={cs.inp}><option value="">Todas</option>{weeks.map(w => <option key={w} value={w}>Semana {w}</option>)}</select></div>
          <div><label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '4px' }}>Colaborador</label>
            <select value={fEmp} onChange={e => setFEmp(e.target.value)} style={cs.inp}><option value="">Todos</option>{employees.map(emp => <option key={emp.id} value={emp.id}>{getEmpName(emp)}</option>)}</select></div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
          <button onClick={downloadExcel} style={{ flex: 1, background: '#16a34a', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><Download size={16} /> Excel Consolidado</button>
          <button onClick={() => {}} style={{ flex: 1, background: '#dc2626', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><Download size={16} /> PDF Reporte</button>
        </div>
      </div>

      {/* KPI Resumen */}
      <div style={cs.card}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', textAlign: 'center' }}>
          {[
            { label: 'HORAS TOTALES', value: `${totals.hours.toLocaleString('es-AR', { maximumFractionDigits: 1 })} hs`, bg: '#eff6ff', color: '#2563eb' },
            { label: 'TOTAL A PAGAR', value: `$${totals.tot.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`, bg: '#f0fdf4', color: '#16a34a' },
            { label: 'SALARIOS', value: `$${totals.sal.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`, bg: '#f9fafb', color: '#374151' },
            { label: 'GASTOS', value: `$${totals.gas.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`, bg: '#f9fafb', color: '#374151' },
          ].map((m, i) => (
            <div key={i} style={{ padding: '12px', background: m.bg, borderRadius: '8px' }}>
              <div style={{ fontSize: '0.65rem', color: m.color, textTransform: 'uppercase', letterSpacing: '2px', fontWeight: '700', marginBottom: '4px' }}>{m.label}</div>
              <div style={{ fontWeight: '800', fontSize: '1.25rem' }}>{m.value}</div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '12px', marginTop: '12px' }}>
          <p style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Detalle de Bocas</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', fontSize: '0.875rem' }}>
            {[['Obra Nueva 2p', totals.bon2], ['Obra Nueva 3p', totals.bon3], ['Refacción 2p', totals.br2], ['Refacción 3p', totals.br3]].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f9fafb', borderRadius: '6px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{l}</span><span style={{ fontWeight: '700' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '3rem', background: 'white', borderRadius: '12px', border: '1px dashed #d1d5db' }}>
          <History size={48} style={{ margin: '0 auto 8px', opacity: 0.3 }} />No se encontraron liquidaciones
        </div>
      ) : filtered.map(liq => (
        <div key={liq.id} style={{ ...cs.card, transition: 'box-shadow 0.2s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div>
              <div style={{ fontWeight: '800', fontSize: '1.1rem' }}>{liq.employeeName || 'Sin nombre'}</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ background: '#f3f4f6', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>Semana {liq.week}</span>
                {liq.weekType === 'adelantada' && <span style={{ background: '#f5f3ff', color: '#7c3aed', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: '600' }}>Adelantada</span>}
                <span style={{ color: '#d1d5db' }}>•</span>
                <span>{liq.monthName} {liq.year}</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: '800', color: '#15803d', fontSize: '1.25rem' }}>${(liq.calculations?.total || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{new Date(liq.createdAt).toLocaleDateString('es-AR')}</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', paddingTop: '12px', borderTop: '1px solid var(--border-light)' }}>
            <button onClick={() => setSel(liq)} style={{ background: '#eff6ff', color: '#2563eb', border: 'none', padding: '8px', borderRadius: '8px', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer' }}>Ver Detalle</button>
            <button onClick={() => downloadPDF(liq)} style={{ background: '#f0fdf4', color: '#16a34a', border: 'none', padding: '8px', borderRadius: '8px', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}><Download size={14} /> PDF</button>
            <button onClick={() => delLiq(liq.id)} style={{ background: '#fef2f2', color: '#dc2626', border: 'none', padding: '8px', borderRadius: '8px', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}><Trash2 size={14} /></button>
          </div>
        </div>
      ))}

      {/* Modal Detalle */}
      {sel && (
        <div onClick={() => setSel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', maxWidth: '420px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '700', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px', marginBottom: '1rem' }}>Detalle de Liquidación</h3>
            <div style={{ fontSize: '0.875rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)' }}>Colaborador</span><span style={{ fontWeight: '600' }}>{sel.employeeName}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)' }}>Período</span><span style={{ fontWeight: '600' }}>Sem {sel.week} - {sel.monthName} {sel.year}</span></div>
              <hr style={{ border: 'none', borderTop: '1px solid var(--border-light)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Horas (x ${(sel.calculations?.effectiveHourlyRate || rates.hourlyRate).toFixed(2)}):</span><span style={{ fontFamily: 'monospace' }}>${(sel.calculations?.valorSemana || 0).toFixed(2)}</span></div>
              {sel.calculations?.valorBocas > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Bocas:</span><span style={{ fontFamily: 'monospace' }}>${sel.calculations.valorBocas.toFixed(2)}</span></div>}
              {sel.calculations?.adicional > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#15803d' }}><span>Adicional:</span><span style={{ fontFamily: 'monospace' }}>${sel.calculations.adicional.toFixed(2)}</span></div>}
              {sel.adelanto > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626' }}><span>Adelanto:</span><span style={{ fontFamily: 'monospace' }}>-${sel.adelanto.toFixed(2)}</span></div>}
              <hr style={{ border: 'none', borderTop: '1px solid var(--border-light)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '1rem' }}><span>SALARIO:</span><span>${(sel.calculations?.totalSalario || 0).toFixed(2)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '1rem', color: '#2563eb' }}><span>GASTOS:</span><span>${(sel.calculations?.totalGastos || 0).toFixed(2)}</span></div>
              <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', border: '1px solid #86efac', marginTop: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '900', fontSize: '1.25rem', color: '#166534' }}><span>TOTAL:</span><span>${(sel.calculations?.total || 0).toFixed(2)}</span></div>
              </div>
            </div>
            <button onClick={() => setSel(null)} style={{ width: '100%', marginTop: '1.5rem', background: '#1f2937', color: 'white', border: 'none', padding: '12px', borderRadius: '12px', fontWeight: '700', cursor: 'pointer' }}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
