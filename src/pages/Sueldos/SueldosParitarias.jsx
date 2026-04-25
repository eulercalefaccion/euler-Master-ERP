/**
 * SueldosParitarias — Gestión de escalas salariales UOCRA
 * Adaptado de EULER-SUELDOS Paritarias.jsx
 */
import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useSueldos } from './SueldosContext';

export default function SueldosParitarias() {
  const { rates, paritarias, setRates, setParitarias, saveData } = useSueldos();
  const [temp, setTemp] = useState({ ...rates });

  const handleH = (v, type = 'Especializado') => {
    const nr = parseFloat(v) || 0;
    let newTemp = { ...temp };
    if (type === 'Especializado') newTemp.hourlyRate = nr;
    if (type === 'Oficial') newTemp.hourlyRateOficial = nr;
    if (type === 'Medio') newTemp.hourlyRateMedio = nr;
    if (paritarias.length > 0 && type === 'Especializado' && nr > 0) {
      const l = paritarias[0];
      const p = (nr - l.hourlyRate) / l.hourlyRate;
      newTemp = { ...newTemp,
        bocaObraNueva2p: Math.round(l.bocaObraNueva2p * (1 + p)),
        bocaObraNueva3p: Math.round(l.bocaObraNueva3p * (1 + p)),
        bocaRefaccion2p: Math.round(l.bocaRefaccion2p * (1 + p)),
        bocaRefaccion3p: Math.round(l.bocaRefaccion3p * (1 + p))
      };
    }
    setTemp(newTemp);
  };

  const savePar = async () => {
    if (!temp.paritariaFecha || !temp.mesVigente || !temp.hourlyRate || !temp.hourlyRateOficial || !temp.hourlyRateMedio) {
      alert('Completá todos los campos'); return;
    }
    const nh = [{ ...temp, id: Date.now().toString(), createdAt: new Date().toISOString() }, ...paritarias];
    setRates(temp); setParitarias(nh);
    await saveData({ globalRates: temp, paritariasHistory: nh });
    alert('Paritaria guardada');
  };

  const delPar = async (id, first) => {
    if (!confirm('¿Eliminar?')) return;
    const nh = paritarias.filter(p => p.id !== id);
    setParitarias(nh);
    if (first && nh.length > 0) { setRates(nh[0]); await saveData({ globalRates: nh[0], paritariasHistory: nh }); }
    else await saveData({ paritariasHistory: nh });
  };

  const cs = {
    card: { background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' },
    inp: { width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.875rem', outline: 'none' }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: '700' }}>Paritarias UOCRA</h2>

      {/* Nueva Paritaria */}
      <div style={cs.card}>
        <h3 style={{ fontWeight: '600', fontSize: '1.1rem', color: '#2563eb', marginBottom: '1rem' }}>Nueva Paritaria</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px' }}>Paritaria de</label>
            <input type="text" value={temp.paritariaFecha || ''} onChange={e => setTemp({ ...temp, paritariaFecha: e.target.value })} style={cs.inp} placeholder="Ej: Enero 2026" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px' }}>Mes Vigente</label>
            <input type="text" value={temp.mesVigente || ''} onChange={e => setTemp({ ...temp, mesVigente: e.target.value })} style={cs.inp} placeholder="Ej: Febrero 2026" />
          </div>
        </div>

        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-light)' }}>
          <label style={{ display: 'block', fontWeight: '600', marginBottom: '12px' }}>Valores Hora ($)</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            {[
              { label: 'Oficial Especializado', key: 'hourlyRate', type: 'Especializado' },
              { label: 'Oficial', key: 'hourlyRateOficial', type: 'Oficial' },
              { label: 'Medio Oficial', key: 'hourlyRateMedio', type: 'Medio' }
            ].map(item => (
              <div key={item.key} style={{ background: '#f9fafb', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '6px' }}>{item.label}</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-secondary)' }}>$</span>
                  <input type="number" value={temp[item.key] || ''} onChange={e => handleH(e.target.value, item.type)} style={{ ...cs.inp, paddingLeft: '24px', fontWeight: '700', fontSize: '1.1rem' }} onFocus={e => e.target.select()} />
                </div>
                {item.type === 'Especializado' && paritarias.length > 0 && temp.hourlyRate > 0 && (
                  <div style={{ fontSize: '0.75rem', color: '#16a34a', marginTop: '4px', fontWeight: '600', background: '#f0fdf4', display: 'inline-block', padding: '2px 8px', borderRadius: '4px' }}>
                    +{((temp.hourlyRate - paritarias[0].hourlyRate) / paritarias[0].hourlyRate * 100).toFixed(1)}% vs ant.
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
          <div style={{ background: '#eff6ff', padding: '1rem', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
            <label style={{ display: 'block', fontWeight: '600', color: '#1e40af', fontSize: '0.875rem', marginBottom: '8px' }}>Boca Obra Nueva</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div><span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>2 Personas</span><input type="number" value={temp.bocaObraNueva2p || ''} onChange={e => setTemp({ ...temp, bocaObraNueva2p: parseFloat(e.target.value) || 0 })} style={cs.inp} onFocus={e => e.target.select()} /></div>
              <div><span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>3 Personas</span><input type="number" value={temp.bocaObraNueva3p || ''} onChange={e => setTemp({ ...temp, bocaObraNueva3p: parseFloat(e.target.value) || 0 })} style={cs.inp} onFocus={e => e.target.select()} /></div>
            </div>
          </div>
          <div style={{ background: '#f5f3ff', padding: '1rem', borderRadius: '8px', border: '1px solid #ddd6fe' }}>
            <label style={{ display: 'block', fontWeight: '600', color: '#6d28d9', fontSize: '0.875rem', marginBottom: '8px' }}>Boca Refacción</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div><span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>2 Personas</span><input type="number" value={temp.bocaRefaccion2p || ''} onChange={e => setTemp({ ...temp, bocaRefaccion2p: parseFloat(e.target.value) || 0 })} style={cs.inp} onFocus={e => e.target.select()} /></div>
              <div><span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>3 Personas</span><input type="number" value={temp.bocaRefaccion3p || ''} onChange={e => setTemp({ ...temp, bocaRefaccion3p: parseFloat(e.target.value) || 0 })} style={cs.inp} onFocus={e => e.target.select()} /></div>
            </div>
          </div>
        </div>

        <button onClick={savePar} style={{ width: '100%', background: '#2563eb', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', marginTop: '1rem', boxShadow: '0 4px 14px rgba(37,99,235,0.3)' }}>
          Guardar Paritaria
        </button>
      </div>

      {/* Historial */}
      <h3 style={{ fontWeight: '600', marginLeft: '4px' }}>Historial</h3>
      {paritarias.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '1rem', background: '#f9fafb', borderRadius: '8px', border: '1px dashed #d1d5db' }}>Sin historial</p>
      ) : paritarias.map((p, i) => (
        <div key={p.id} style={{ ...cs.card, borderColor: i === 0 ? '#86efac' : undefined, boxShadow: i === 0 ? '0 0 0 1px #bbf7d0' : undefined }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <div>
              <div style={{ fontWeight: '700' }}>{p.paritariaFecha}</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Vigente: {p.mesVigente}</div>
            </div>
            {i === 0 && <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '0.7rem', padding: '4px 10px', borderRadius: '20px', fontWeight: '800' }}>ACTUAL</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '8px', background: 'rgba(255,255,255,0.5)', padding: '8px', borderRadius: '8px', fontSize: '0.875rem' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Valores Hora</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                {[['Especializado', p.hourlyRate], ['Oficial', p.hourlyRateOficial || p.hourlyRate], ['Medio Oficial', p.hourlyRateMedio || p.hourlyRate]].map(([l, v]) => (
                  <div key={l} style={{ background: 'white', padding: '6px', borderRadius: '4px', border: '1px solid #f3f4f6' }}>
                    <span style={{ display: 'block', fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>{l}</span>
                    <span style={{ fontWeight: '800' }}>${v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '0.8rem' }}>
              <div style={{ color: 'var(--text-secondary)' }}>Obra Nueva: <strong>${p.bocaObraNueva2p}</strong> / <strong>${p.bocaObraNueva3p}</strong></div>
              <div style={{ color: 'var(--text-secondary)' }}>Refacción: <strong>${p.bocaRefaccion2p}</strong> / <strong>${p.bocaRefaccion3p}</strong></div>
            </div>
          </div>
          <button onClick={() => delPar(p.id, i === 0)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '600', marginTop: '12px' }}>
            <Trash2 size={14} /> Eliminar
          </button>
        </div>
      ))}
    </div>
  );
}
