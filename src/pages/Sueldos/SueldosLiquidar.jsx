/**
 * SueldosLiquidar — Formulario de liquidación semanal
 * Adaptado de EULER-SUELDOS Liquidar.jsx
 */
import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useSueldos } from './SueldosContext';
import { getISOWeek, getWeeksInYear, getCustomWeekDates, getMonthName, formatDF, calcH, getEmpName } from './sueldosUtils';

export default function SueldosLiquidar() {
  const { employees, rates, liquidations, setLiquidations, saveData } = useSueldos();
  const yr = new Date().getFullYear();
  const wk = getISOWeek(new Date());
  const diasEstandar = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
  const diasLabelsEstandar = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const diasAdelantada = ['viernes', 'sabado', 'domingo', 'lunes', 'martes', 'miercoles', 'jueves'];
  const diasLabelsAdelantada = ['Viernes', 'Sábado', 'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves'];

  const initH = {
    lunes: { e: '08:00', s: '16:00' }, martes: { e: '08:00', s: '16:00' },
    miercoles: { e: '08:00', s: '16:00' }, jueves: { e: '08:00', s: '16:00' },
    viernes: { e: '08:00', s: '16:00' }, sabado: { e: '08:00', s: '08:00' },
    domingo: { e: '08:00', s: '08:00' }
  };

  const [f, setF] = useState({
    empId: '', week: wk, year: yr, weekType: 'estandar', horarios: { ...initH },
    bon2p: 0, bon2pObra: '', bon3p: 0, bon3pObra: '',
    bref2p: 0, bref2pObra: '', bref3p: 0, bref3pObra: '',
    vac: 0, vacO: '', bono: 0, bonoO: '', agui: 0, aguiO: '', retro: 0, retroO: '',
    gastos: [], adel: 0, notas: ''
  });

  const dias = f.weekType === 'adelantada' ? diasAdelantada : diasEstandar;
  const diasLabels = f.weekType === 'adelantada' ? diasLabelsAdelantada : diasLabelsEstandar;
  const wd = getCustomWeekDates(f.week, f.year, f.weekType);
  const mn = getMonthName(f.week, f.year);
  const emp = employees.find(x => x.id === f.empId);
  const wiy = getWeeksInYear(f.year);

  const hpd = dias.map(d => calcH(f.horarios[d]?.e || '08:00', f.horarios[d]?.s || '16:00'));
  const th = hpd.reduce((s, h) => s + h, 0);
  const getEffectiveRate = () => {
    if (!emp || !emp.categoriaUocra) return rates.hourlyRate;
    if (emp.categoriaUocra === 'Medio Oficial') return rates.hourlyRateMedio || rates.hourlyRate;
    if (emp.categoriaUocra === 'Oficial') return rates.hourlyRateOficial || rates.hourlyRate;
    return rates.hourlyRate;
  };
  const effectiveRate = getEffectiveRate();
  const vs = th * effectiveRate;
  const vbon2 = f.bon2p * rates.bocaObraNueva2p, vbon3 = f.bon3p * rates.bocaObraNueva3p;
  const vref2 = f.bref2p * rates.bocaRefaccion2p, vref3 = f.bref3p * rates.bocaRefaccion3p;
  const vb = vbon2 + vbon3 + vref2 + vref3;
  const sub = vs + vb;
  const adic = emp ? sub * ((emp.percentage || 0) / 100) : 0;
  const tg = f.gastos.reduce((s, g) => s + (parseFloat(g.v) || 0), 0);
  const ts = sub + adic + (f.vac || 0) + (f.bono || 0) + (f.agui || 0) + (f.retro || 0) - (f.adel || 0);
  const tt = ts + tg;

  const upH = (d, c, v) => setF({ ...f, horarios: { ...f.horarios, [d]: { ...f.horarios[d], [c]: v } } });
  const addG = () => setF({ ...f, gastos: [...f.gastos, { n: '', v: 0 }] });
  const upG = (i, c, v) => { const g = [...f.gastos]; g[i][c] = c === 'v' ? (parseFloat(v) || 0) : v; setF({ ...f, gastos: g }); };
  const rmG = (i) => setF({ ...f, gastos: f.gastos.filter((_, x) => x !== i) });

  const save = async () => {
    if (!f.empId) { alert('Seleccioná un colaborador'); return; }
    const empF = employees.find(x => x.id === f.empId);
    if (!empF) { alert('Error: colaborador no encontrado'); return; }
    const empName = getEmpName(empF);
    if (!empName) { alert('Error: sin nombre'); return; }

    const hrs = {}; dias.forEach((d, i) => { hrs[d] = hpd[i]; });
    const nl = {
      id: Date.now().toString(), employeeId: f.empId, employeeName: empName,
      week: f.week, year: f.year, weekType: f.weekType, horarios: f.horarios, hours: hrs, monthName: mn,
      bocasObraNueva2p: f.bon2p, bocasObraNueva2pObra: f.bon2pObra,
      bocasObraNueva3p: f.bon3p, bocasObraNueva3pObra: f.bon3pObra,
      bocasRefaccion2p: f.bref2p, bocasRefaccion2pObra: f.bref2pObra,
      bocasRefaccion3p: f.bref3p, bocasRefaccion3pObra: f.bref3pObra,
      vacaciones: f.vac, vacacionesObs: f.vacO, bonoUocra: f.bono, bonoUocraObs: f.bonoO,
      aguinaldo: f.agui, aguinaldoObs: f.aguiO, retroactivo: f.retro, retroactivoObs: f.retroO,
      gastos: f.gastos.map(g => ({ nombre: g.n, valor: g.v })), notas: f.notas, adelanto: f.adel,
      calculations: { totalHours: th, valorSemana: vs, valorBocas: vb, adicional: adic, totalSalario: ts, totalGastos: tg, total: tt, vbon2, vbon3, vref2, vref3, effectiveHourlyRate: effectiveRate },
      ratesUsed: { ...rates }, createdBy: 'admin', createdAt: new Date().toISOString()
    };
    const upd = [...liquidations, nl];
    setLiquidations(upd);
    if (await saveData({ liquidations: upd })) {
      alert('Liquidación guardada correctamente');
      setF({ empId: '', week: wk, year: yr, weekType: f.weekType, horarios: { ...initH }, bon2p: 0, bon2pObra: '', bon3p: 0, bon3pObra: '', bref2p: 0, bref2pObra: '', bref3p: 0, bref3pObra: '', vac: 0, vacO: '', bono: 0, bonoO: '', agui: 0, aguiO: '', retro: 0, retroO: '', gastos: [], adel: 0, notas: '' });
    }
  };

  const cs = { card: { background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }, inp: { width: '100%', padding: '0.625rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.875rem', outline: 'none' } };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: '700', textAlign: 'center' }}>Liquidar Sueldo Semanal</h2>

      {/* Colaborador + Fechas */}
      <div style={cs.card}>
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '8px' }}>Colaborador</label>
        <select value={f.empId} onChange={e => setF({ ...f, empId: e.target.value })} style={{ ...cs.inp, padding: '0.75rem' }}>
          <option value="">Seleccionar colaborador...</option>
          {employees.map(emp => <option key={emp.id} value={emp.id}>{getEmpName(emp)} {emp.percentage > 0 ? `(+${emp.percentage}%)` : ''}</option>)}
        </select>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '6px' }}>Tipo Sem.</label>
            <select value={f.weekType} onChange={e => setF({ ...f, weekType: e.target.value })} style={{ ...cs.inp, textAlign: 'center' }}>
              <option value="estandar">Estándar (Lun-Dom)</option>
              <option value="adelantada">Adelantada (Vie-Jue)</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '6px' }}>Semana</label>
            <input type="number" value={f.week} onChange={e => setF({ ...f, week: Math.min(Math.max(1, parseInt(e.target.value) || 1), wiy) })} style={{ ...cs.inp, textAlign: 'center' }} min="1" max={wiy} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '6px' }}>Año</label>
            <input type="number" value={f.year} onChange={e => setF({ ...f, year: parseInt(e.target.value) || yr })} style={{ ...cs.inp, textAlign: 'center' }} />
          </div>
        </div>

        <div style={{ background: '#eff6ff', padding: '12px', borderRadius: '8px', textAlign: 'center', marginTop: '1rem' }}>
          <div style={{ color: '#1e40af', fontWeight: '700', fontSize: '1.1rem' }}>Semana {f.week} - {mn} {f.year}</div>
          <div style={{ fontSize: '0.875rem', color: '#3b82f6', marginTop: '4px', fontWeight: '500' }}>
            {wd.length >= 6 && `${formatDF(wd[0])} al ${formatDF(wd[5])}`}
          </div>
        </div>
      </div>

      {/* Horarios */}
      <div style={cs.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontWeight: '700', margin: 0 }}>Horas Trabajadas</h3>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Total: <strong style={{ fontSize: '1.1rem' }}>{th.toFixed(1)}</strong> hs</span>
        </div>
        {dias.map((d, i) => (
          <div key={d} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: i < 6 ? '1px solid var(--border-light)' : 'none' }}>
            <span style={{ width: '120px', fontSize: '0.875rem', fontWeight: '500', color: 'var(--text-secondary)' }}>
              {diasLabels[i]} {wd[i] ? `${String(wd[i].getDate()).padStart(2, '0')}/${String(wd[i].getMonth() + 1).padStart(2, '0')}` : ''}
            </span>
            <input type="time" value={f.horarios[d]?.e || '08:00'} onChange={e => upH(d, 'e', e.target.value)} style={{ ...cs.inp, width: 'auto', textAlign: 'center', flex: 1 }} />
            <span style={{ color: '#d1d5db' }}>-</span>
            <input type="time" value={f.horarios[d]?.s || '16:00'} onChange={e => upH(d, 's', e.target.value)} style={{ ...cs.inp, width: 'auto', textAlign: 'center', flex: 1 }} />
            <span style={{ width: '50px', textAlign: 'right', fontWeight: '700', fontSize: '0.875rem', color: hpd[i] > 8 ? '#16a34a' : undefined }}>{hpd[i].toFixed(1)}h</span>
          </div>
        ))}
      </div>

      {/* Bocas */}
      <div style={cs.card}>
        <h3 style={{ fontWeight: '700', marginBottom: '1rem' }}>Bocas</h3>
        <div style={{ background: '#eff6ff', padding: '1rem', borderRadius: '12px', border: '1px solid #bfdbfe', marginBottom: '1rem' }}>
          <div style={{ fontWeight: '700', color: '#1e40af', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>OBRA NUEVA</div>
          {[[f.bon2p, 'bon2p', f.bon2pObra, 'bon2pObra', rates.bocaObraNueva2p, '2 Pers'], [f.bon3p, 'bon3p', f.bon3pObra, 'bon3pObra', rates.bocaObraNueva3p, '3 Pers']].map(([val, key, obra, obraKey, rate, label]) => (
            <div key={key} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ flex: '0 0 120px' }}>
                <div style={{ fontSize: '0.75rem', color: '#1d4ed8', fontWeight: '600', marginBottom: '4px' }}>{label} (${rate})</div>
                <input type="number" value={val || ''} onChange={e => setF({ ...f, [key]: parseInt(e.target.value) || 0 })} style={cs.inp} placeholder="Cant." onFocus={e => e.target.select()} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.75rem', color: 'transparent', marginBottom: '4px' }}>.</div>
                <input type="text" value={obra} onChange={e => setF({ ...f, [obraKey]: e.target.value })} style={cs.inp} placeholder="Nombre de la obra" />
              </div>
            </div>
          ))}
        </div>
        <div style={{ background: '#f5f3ff', padding: '1rem', borderRadius: '12px', border: '1px solid #ddd6fe' }}>
          <div style={{ fontWeight: '700', color: '#6d28d9', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>REFACCIÓN</div>
          {[[f.bref2p, 'bref2p', f.bref2pObra, 'bref2pObra', rates.bocaRefaccion2p, '2 Pers'], [f.bref3p, 'bref3p', f.bref3pObra, 'bref3pObra', rates.bocaRefaccion3p, '3 Pers']].map(([val, key, obra, obraKey, rate, label]) => (
            <div key={key} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ flex: '0 0 120px' }}>
                <div style={{ fontSize: '0.75rem', color: '#6d28d9', fontWeight: '600', marginBottom: '4px' }}>{label} (${rate})</div>
                <input type="number" value={val || ''} onChange={e => setF({ ...f, [key]: parseInt(e.target.value) || 0 })} style={cs.inp} placeholder="Cant." onFocus={e => e.target.select()} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.75rem', color: 'transparent', marginBottom: '4px' }}>.</div>
                <input type="text" value={obra} onChange={e => setF({ ...f, [obraKey]: e.target.value })} style={cs.inp} placeholder="Nombre de la obra" />
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', fontWeight: '700', color: '#15803d', fontSize: '1.1rem' }}>
          <span>Total Bocas:</span><span>${vb.toFixed(2)}</span>
        </div>
      </div>

      {/* Adicionales */}
      <div style={cs.card}>
        <h3 style={{ fontWeight: '700', marginBottom: '1rem' }}>Adicionales</h3>
        {[{ l: 'Vacaciones', v: 'vac', o: 'vacO' }, { l: 'Bono UOCRA', v: 'bono', o: 'bonoO' }, { l: 'Aguinaldo', v: 'agui', o: 'aguiO' }, { l: 'Retroactivo', v: 'retro', o: 'retroO' }].map(item => (
          <div key={item.v} style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
            <div style={{ width: '33%' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '4px' }}>{item.l}</label>
              <input type="number" value={f[item.v] || ''} onChange={e => setF({ ...f, [item.v]: parseFloat(e.target.value) || 0 })} style={cs.inp} onFocus={e => e.target.select()} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'transparent', marginBottom: '4px' }}>.</label>
              <input type="text" value={f[item.o]} onChange={e => setF({ ...f, [item.o]: e.target.value })} style={{ ...cs.inp, background: '#f9fafb' }} placeholder="Observación opcional" />
            </div>
          </div>
        ))}
      </div>

      {/* Gastos */}
      <div style={cs.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontWeight: '700', margin: 0 }}>Gastos (transferencia aparte)</h3>
          <button onClick={addG} style={{ background: '#2563eb', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer' }}>+ Agregar</button>
        </div>
        {f.gastos.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '1rem', background: '#f9fafb', borderRadius: '8px', border: '1px dashed #d1d5db', fontSize: '0.875rem' }}>Sin gastos registrados</p>
        ) : f.gastos.map((g, i) => (
          <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
            <input type="text" value={g.n} onChange={e => upG(i, 'n', e.target.value)} style={{ ...cs.inp, flex: 1 }} placeholder="Concepto" />
            <input type="number" value={g.v || ''} onChange={e => upG(i, 'v', e.target.value)} style={{ ...cs.inp, width: '100px', textAlign: 'right', fontWeight: '500' }} placeholder="$" onFocus={e => e.target.select()} />
            <button onClick={() => rmG(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '6px' }}><Trash2 size={18} /></button>
          </div>
        ))}
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', fontWeight: '700', color: '#2563eb', fontSize: '1.1rem' }}>
          <span>Total Gastos:</span><span>${tg.toFixed(2)}</span>
        </div>
      </div>

      {/* Notas */}
      <div style={cs.card}>
        <h3 style={{ fontWeight: '700', marginBottom: '12px' }}>Aclaraciones / Notas</h3>
        <textarea value={f.notas} onChange={e => setF({ ...f, notas: e.target.value })} style={{ ...cs.inp, minHeight: '80px', resize: 'vertical' }} placeholder="Escribe alguna nota o aclaración..." />
      </div>

      {/* Resumen */}
      <div style={{ ...cs.card, background: 'linear-gradient(135deg, #f0fdf4, white)', borderColor: '#86efac' }}>
        <h3 style={{ fontWeight: '700', color: '#166534', borderBottom: '1px solid #86efac', paddingBottom: '8px', marginBottom: '12px' }}>Resumen de Liquidación</h3>
        <div style={{ fontSize: '0.875rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Horas ({th.toFixed(1)}h × ${effectiveRate.toFixed(2)}):</span><span style={{ fontFamily: 'monospace', fontWeight: '500' }}>${vs.toFixed(2)}</span></div>
          {vb > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Bocas:</span><span style={{ fontFamily: 'monospace' }}>${vb.toFixed(2)}</span></div>}
          {emp && emp.percentage > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#15803d' }}><span>Adicional ({emp.percentage}%):</span><span style={{ fontFamily: 'monospace' }}>${adic.toFixed(2)}</span></div>}

          <div style={{ paddingTop: '8px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#dc2626', textTransform: 'uppercase' }}>Descuento / Adelanto</label>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#dc2626', marginTop: '4px' }}>
              <input type="number" value={f.adel || ''} onChange={e => setF({ ...f, adel: parseFloat(e.target.value) || 0 })} style={{ ...cs.inp, width: '130px', border: '1px solid #fecaca', color: '#dc2626', background: '#fef2f2' }} placeholder="0.00" onFocus={e => e.target.select()} />
              <span style={{ fontFamily: 'monospace', fontWeight: '700' }}>-${(f.adel || 0).toFixed(2)}</span>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #86efac', paddingTop: '12px', marginTop: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '1.1rem', color: '#374151' }}><span>TOTAL SALARIO:</span><span style={{ fontFamily: 'monospace' }}>${ts.toFixed(2)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '1.1rem', color: '#2563eb', marginTop: '4px' }}><span>TOTAL GASTOS:</span><span style={{ fontFamily: 'monospace' }}>${tg.toFixed(2)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '900', fontSize: '1.5rem', color: '#166534', background: '#dcfce7', padding: '12px', borderRadius: '8px', marginTop: '8px' }}><span>A PAGAR:</span><span style={{ fontFamily: 'monospace' }}>${tt.toFixed(2)}</span></div>
          </div>
        </div>
      </div>

      <button onClick={save} style={{ width: '100%', background: '#16a34a', color: 'white', border: 'none', padding: '1rem', borderRadius: '12px', fontWeight: '700', fontSize: '1.25rem', cursor: 'pointer', boxShadow: '0 4px 14px rgba(22,163,74,0.3)' }}>
        GUARDAR LIQUIDACIÓN
      </button>
    </div>
  );
}
