import React from 'react';
import { ArrowLeft, AlertTriangle } from 'lucide-react';

const FinalBalance = ({ environments, params, onBack }) => {
  const deltaT = params.tempInterior - params.tempExterior;
  
  // Approximate U values based on envelope type
  let U_wall = 1.5;
  if (params.tipoEnvolvente.includes('Buena')) U_wall = 0.8;
  if (params.tipoEnvolvente.includes('Mala')) U_wall = 2.2;
  
  // Calculation logic per environment
  const computedEnvs = environments.filter(e => e.calefaccion).map(env => {
    const volume = env.superficie * env.altura;
    
    // Transmission (Simplified: assuming some % of surface is exposed)
    // A real balance requires exact exposed wall areas, roofs, etc.
    // For estimation, we assume a proportional exposed area:
    const exposedArea = env.superficie * 0.8; 
    const transmissionW = exposedArea * U_wall * deltaT;
    
    // Infiltration: Vol * ren/h * 0.33 * deltaT
    const infiltrationW = volume * 0.5 * 0.33 * deltaT;
    
    const totalW = transmissionW + infiltrationW;
    const totalKcal = totalW * 0.86;
    
    return {
      ...env,
      volumen: volume,
      transmision: transmissionW,
      infiltracion: infiltrationW,
      totalW,
      totalKcal
    };
  });

  const totalWatts = computedEnvs.reduce((acc, curr) => acc + curr.totalW, 0);
  const totalKcal = computedEnvs.reduce((acc, curr) => acc + curr.totalKcal, 0);
  
  const margenMultiplier = 1 + (params.margenSeguridad / 100);
  const totalWattsMargin = totalWatts * margenMultiplier;
  const totalKcalMargin = totalKcal * margenMultiplier;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '1.25rem', margin: 0 }}>Balance Térmico — Resultado Preliminar</h3>
        <button onClick={onBack} className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid var(--border-light)', backgroundColor: 'white' }}>
          <ArrowLeft size={16} /> Volver a edición
        </button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
        <div className="card" style={{ padding: '2rem', backgroundColor: '#3b82f6', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.9 }}>Potencia Efectiva</span>
          <h2 style={{ fontSize: '2.5rem', margin: '0.5rem 0', fontWeight: '700' }}>{(totalWatts / 1000).toFixed(1)}</h2>
          <span style={{ fontSize: '1rem', opacity: 0.9 }}>kW</span>
        </div>
        
        <div className="card" style={{ padding: '2rem', backgroundColor: '#2563eb', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.9 }}>Con Margen {params.margenSeguridad}%</span>
          <h2 style={{ fontSize: '2.5rem', margin: '0.5rem 0', fontWeight: '700' }}>{(totalWattsMargin / 1000).toFixed(1)}</h2>
          <span style={{ fontSize: '1rem', opacity: 0.9 }}>kW</span>
        </div>

        <div className="card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-light)' }}>
          <span style={{ fontSize: '0.875rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Kcal/h Efectiva</span>
          <h2 style={{ fontSize: '2.5rem', margin: '0.5rem 0', fontWeight: '700', color: 'var(--text-primary)' }}>{Math.round(totalKcal).toLocaleString('es-AR')}</h2>
          <span style={{ fontSize: '1rem', color: 'var(--text-tertiary)' }}>Kcal/h</span>
        </div>

        <div className="card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-light)' }}>
          <span style={{ fontSize: '0.875rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Kcal/h con Margen</span>
          <h2 style={{ fontSize: '2.5rem', margin: '0.5rem 0', fontWeight: '700', color: 'var(--text-primary)' }}>{Math.round(totalKcalMargin).toLocaleString('es-AR')}</h2>
          <span style={{ fontSize: '1rem', color: 'var(--text-tertiary)' }}>Kcal/h</span>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)' }}>
          <h3 style={{ fontSize: '1.125rem', margin: 0 }}>Detalle por Ambiente</h3>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-surface-hover)', borderBottom: '1px solid var(--border-light)' }}>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>AMBIENTE</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'right' }}>SUP. (M²)</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'right' }}>VOL. (M³)</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'right' }}>TRANSM. (W)</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'right' }}>INFILTR. (W)</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'right' }}>TOTAL (W)</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: '#2563eb', textAlign: 'right', fontWeight: '600' }}>KCAL/H</th>
              </tr>
            </thead>
            <tbody>
              {computedEnvs.map(env => (
                <tr key={env.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', fontWeight: '500' }}>{env.nombre} <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', fontWeight: '400', marginLeft: '0.5rem' }}>Baja</span></td>
                  <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right' }}>{env.superficie.toFixed(1)}</td>
                  <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right' }}>{env.volumen.toFixed(1)}</td>
                  <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right' }}>{Math.round(env.transmision)}</td>
                  <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right' }}>{Math.round(env.infiltracion)}</td>
                  <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right', color: '#2563eb', fontWeight: '500' }}>{Math.round(env.totalW).toLocaleString('es-AR')}</td>
                  <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right', color: '#2563eb', fontWeight: '600' }}>{Math.round(env.totalKcal).toLocaleString('es-AR')}</td>
                </tr>
              ))}
              <tr style={{ backgroundColor: '#f8fafc', fontWeight: '600' }}>
                <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem' }}>TOTAL</td>
                <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right' }}>{computedEnvs.reduce((a, c) => a + c.superficie, 0).toFixed(1)}</td>
                <td colSpan="3"></td>
                <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right', color: '#2563eb' }}>{Math.round(totalWatts).toLocaleString('es-AR')}</td>
                <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right', color: '#2563eb' }}>{Math.round(totalKcal).toLocaleString('es-AR')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="card" style={{ padding: '1.5rem', backgroundColor: '#fffbeb', border: '1px solid #fde68a', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
        <AlertTriangle color="#d97706" style={{ flexShrink: 0 }} />
        <div>
          <h4 style={{ margin: '0 0 0.5rem 0', color: '#b45309', fontSize: '1rem' }}>Supuestos incluidos en este cálculo</h4>
          <p style={{ margin: 0, color: '#92400e', fontSize: '0.875rem', lineHeight: '1.5' }}>
            Los datos de transmisión se estimaron proporcionalmente asumiendo un 80% de superficie expuesta. Para un balance térmico definitivo, las superficies exactas de muros exteriores y techos deben validarse en obra o con cortes del proyecto.
          </p>
        </div>
      </div>
    </div>
  );
};

export default FinalBalance;
