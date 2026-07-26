import React from 'react';
import { ArrowLeft, AlertTriangle, Info } from 'lucide-react';

const FinalBalance = ({ environments, params, onBack }) => {
  const coef = params.coefVolumetrico ?? 45; // Kcal/h·m³
  const margenMultiplier = 1 + (params.margenSeguridad / 100);

  // Cálculo correcto por coeficiente volumétrico (método estándar Argentina)
  const computedEnvs = environments.filter(e => e.calefaccion).map(env => {
    const superficie = parseFloat(env.superficie) || 0;
    const altura = parseFloat(env.altura) || 2.8;
    const volumen = superficie * altura;

    // Distribución típica: 65% transmisión, 35% infiltración
    const totalKcal = volumen * coef;
    const transmisionKcal = totalKcal * 0.65;
    const infiltracionKcal = totalKcal * 0.35;

    // Conversión a Watts (1 Kcal/h = 1.163 W)
    const totalW = totalKcal * 1.163;
    const transmisionW = transmisionKcal * 1.163;
    const infiltracionW = infiltracionKcal * 1.163;

    return {
      ...env,
      volumen,
      transmisionW,
      infiltracionW,
      totalW,
      totalKcal,
    };
  });

  const totalKcal = computedEnvs.reduce((acc, e) => acc + e.totalKcal, 0);
  const totalWatts = totalKcal * 1.163;
  const totalKcalMargin = totalKcal * margenMultiplier;
  const totalWattsMargin = totalWatts * margenMultiplier;
  const totalVolumen = computedEnvs.reduce((acc, e) => acc + e.volumen, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '1.25rem', margin: 0 }}>Balance Térmico — Resultado Preliminar</h3>
        <button onClick={onBack} className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid var(--border-light)', backgroundColor: 'white' }}>
          <ArrowLeft size={16} /> Volver a edición
        </button>
      </div>

      {/* KPIs principales */}
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

      {/* Dato de verificación */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '0.75rem 1.25rem', backgroundColor: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
        <Info size={18} color="#2563eb" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: '0.875rem', color: '#1e40af' }}>
          <strong>{totalVolumen.toFixed(1)} m³</strong> con calefacción × <strong>{coef} Kcal/h·m³</strong> = <strong>{Math.round(totalKcal).toLocaleString('es-AR')} Kcal/h</strong> &nbsp;|&nbsp; Equivale a <strong>{(totalKcal / (totalVolumen || 1)).toFixed(1)} Kcal/h·m³</strong>
        </span>
      </div>

      {/* Tabla de detalle */}
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
                  <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                    {env.nombre} <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', fontWeight: '400', marginLeft: '0.5rem' }}>Baja</span>
                  </td>
                  <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right' }}>{env.superficie.toFixed(1)}</td>
                  <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right' }}>{env.volumen.toFixed(1)}</td>
                  <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right' }}>{Math.round(env.transmisionW)}</td>
                  <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right' }}>{Math.round(env.infiltracionW)}</td>
                  <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right', color: '#2563eb', fontWeight: '500' }}>{Math.round(env.totalW).toLocaleString('es-AR')}</td>
                  <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right', color: '#2563eb', fontWeight: '600' }}>{Math.round(env.totalKcal).toLocaleString('es-AR')}</td>
                </tr>
              ))}
              <tr style={{ backgroundColor: '#f8fafc', fontWeight: '600', borderTop: '2px solid var(--border-light)' }}>
                <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem' }}>TOTAL</td>
                <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right' }}>
                  {computedEnvs.reduce((a, c) => a + c.superficie, 0).toFixed(1)}
                </td>
                <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right' }}>
                  {totalVolumen.toFixed(1)}
                </td>
                <td colSpan="2"></td>
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
          <h4 style={{ margin: '0 0 0.5rem 0', color: '#b45309', fontSize: '1rem' }}>Metodología de cálculo</h4>
          <p style={{ margin: 0, color: '#92400e', fontSize: '0.875rem', lineHeight: '1.5' }}>
            Se utiliza el <strong>método del coeficiente volumétrico</strong> (estándar en la industria Argentina): <em>Q = Volumen × {coef} Kcal/h·m³</em>. 
            La distribución 65% transmisión / 35% infiltración es estimativa. Para un balance definitivo, debe validarse el coeficiente con datos del proyecto.
          </p>
        </div>
      </div>
    </div>
  );
};

export default FinalBalance;
