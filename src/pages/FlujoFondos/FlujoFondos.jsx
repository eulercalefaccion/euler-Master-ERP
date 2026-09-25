import React, { useState, useEffect, useMemo } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Calendar, Sliders, AlertCircle, ArrowUpRight, ArrowDownRight, Info, ChevronRight, RefreshCw } from 'lucide-react';
import { getFlujoFondosData } from '../../services/flujoFondosService';

const FlujoFondos = () => {
  const [canal, setCanal] = useState('Todos');
  const [horizonte, setHorizonte] = useState(45);
  const [demoraCobro, setDemoraCobro] = useState(0);
  const [data, setData] = useState(null);
  const [diaSeleccionadoIdx, setDiaSeleccionadoIdx] = useState(null);

  const cargarProyeccion = async () => {
    const res = await getFlujoFondosData({
      canal,
      horizonteDias: horizonte,
      demoraCobroDias: demoraCobro
    });
    setData(res);
    // Seleccionar por defecto el día actual o el último día pasado
    if (res && res.dias) {
      const idxHoy = res.dias.findIndex(d => d.esHoy);
      setDiaSeleccionadoIdx(idxHoy >= 0 ? idxHoy : 0);
    }
  };

  useEffect(() => {
    cargarProyeccion();
  }, [canal, horizonte, demoraCobro]);

  const diaSeleccionado = useMemo(() => {
    if (!data || !data.dias || diaSeleccionadoIdx === null) return null;
    return data.dias[diaSeleccionadoIdx] || data.dias[0];
  }, [data, diaSeleccionadoIdx]);

  if (!data) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Cargando proyección de flujo de fondos...
      </div>
    );
  }

  const { saldoBancosHoy, pisoFirmeMinimo, saldoFinalProyectado, calloutTitulo, calloutSubtitulo, dias, contrapartes } = data;

  // Formateador de millones para KPIs
  const fmtM = (val) => {
    if (val === null || val === undefined) return '$0,0 M';
    const m = val / 1000000;
    const sign = m < 0 ? '-' : '';
    return `${sign}$${Math.abs(m).toFixed(1).replace('.', ',')} M`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* 1. Header & Callout Insight */}
      <div>
        <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#64748b' }}>
          Euler Calefacción, flujo de fondos proyectado
        </div>
        <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '1rem' }}>
          Al {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}, canal {canal === 'Todos' ? 'Ayala + Euler' : canal}.
        </div>

        <h1 style={{ fontSize: '2.5rem', fontWeight: '800', color: '#1e293b', margin: '0.5rem 0', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
          {calloutTitulo}
        </h1>
        <p style={{ fontSize: '1.1rem', color: '#64748b', margin: 0, fontWeight: '500' }}>
          {calloutSubtitulo}
        </p>
      </div>

      {/* 2. KPI Cards Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
        
        {/* KPI 1: Hoy en Banco */}
        <div className="card" style={{ padding: '1.25rem', backgroundColor: 'white', border: '1px solid var(--border-light)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#64748b' }}>Hoy en banco</div>
          <div style={{ fontSize: '2rem', fontWeight: '800', color: '#0f172a', margin: '0.25rem 0' }}>
            {fmtM(saldoBancosHoy.total)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Ayala {fmtM(saldoBancosHoy.ayala)}, Euler {fmtM(saldoBancosHoy.euler)}
          </div>
        </div>

        {/* KPI 2: Piso Firme Mínimo */}
        <div className="card" style={{ padding: '1.25rem', backgroundColor: 'white', border: '1px solid var(--border-light)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#64748b' }}>Piso firme mínimo</div>
          <div style={{ fontSize: '2rem', fontWeight: '800', color: pisoFirmeMinimo < 0 ? '#b91c1c' : '#059669', margin: '0.25rem 0' }}>
            {fmtM(pisoFirmeMinimo)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            el lunes 9 de noviembre (escenario 0 cobros)
          </div>
        </div>

        {/* KPI 3: Saldo Proyectado Final */}
        <div className="card" style={{ padding: '1.25rem', backgroundColor: 'white', border: '1px solid var(--border-light)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#64748b' }}>Saldo proyectado al final del horizonte</div>
          <div style={{ fontSize: '2rem', fontWeight: '800', color: '#059669', margin: '0.25rem 0' }}>
            {fmtM(saldoFinalProyectado)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            al final de los {horizonte} días; piso firme {fmtM(pisoFirmeMinimo)}
          </div>
        </div>

      </div>

      {/* 3. Interactive Controls & Legend Bar */}
      <div className="card" style={{ padding: '1rem 1.25rem', backgroundColor: '#f8fafc', border: '1px solid var(--border-light)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1.25rem' }}>
        
        {/* Switchers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
          
          {/* Selector Canal */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748b', letterSpacing: '0.05em' }}>CANAL</span>
            <div style={{ display: 'flex', backgroundColor: '#e2e8f0', padding: '2px', borderRadius: '6px' }}>
              {['Todos', 'Ayala', 'Euler'].map(c => (
                <button
                  key={c}
                  onClick={() => setCanal(c)}
                  style={{
                    padding: '0.35rem 0.85rem', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '700',
                    backgroundColor: canal === c ? '#0f172a' : 'transparent',
                    color: canal === c ? 'white' : '#475569'
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Selector Horizonte */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748b', letterSpacing: '0.05em' }}>HORIZONTE</span>
            <div style={{ display: 'flex', backgroundColor: '#e2e8f0', padding: '2px', borderRadius: '6px' }}>
              {[15, 30, 45].map(h => (
                <button
                  key={h}
                  onClick={() => setHorizonte(h)}
                  style={{
                    padding: '0.35rem 0.85rem', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '700',
                    backgroundColor: horizonte === h ? '#0f172a' : 'transparent',
                    color: horizonte === h ? 'white' : '#475569'
                  }}
                >
                  {h} días
                </button>
              ))}
            </div>
          </div>

          {/* Slider Demora de Cobro */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '220px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: '700', color: '#475569' }}>
              <span>Demora de cobros de obra:</span>
              <span style={{ color: '#0284c7' }}>{demoraCobro} días</span>
            </div>
            <input
              type="range"
              min="0"
              max="30"
              step="1"
              value={demoraCobro}
              onChange={e => setDemoraCobro(Number(e.target.value))}
              style={{ accentColor: '#0284c7', cursor: 'pointer' }}
            />
          </div>

        </div>

        {/* Leyenda del gráfico */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.75rem', flexWrap: 'wrap', color: '#475569' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '12px', height: '3px', backgroundColor: '#0f172a' }}></span>
            <span>Saldo real</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '12px', height: '3px', backgroundColor: '#854d0e' }}></span>
            <span>Saldo proyectado</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '12px', height: '0px', borderTop: '2px dashed #1d4ed8' }}></span>
            <span>Piso firme</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '10px', height: '10px', backgroundColor: '#059669', borderRadius: '2px' }}></span>
            <span>Entra seguro</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '10px', height: '10px', background: 'repeating-linear-gradient(45deg, #d97706, #d97706 2px, #f59e0b 2px, #f59e0b 4px)', borderRadius: '2px' }}></span>
            <span>Entra esperado</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '10px', height: '10px', backgroundColor: '#dc2626', borderRadius: '2px' }}></span>
            <span>Sale</span>
          </div>
        </div>

      </div>

      {/* 4. Interactive Timeline & Cashflow Chart Component */}
      <div className="card" style={{ padding: '1.25rem 0.5rem 0.5rem 0.5rem', backgroundColor: '#fafafa', border: '1px solid var(--border-light)', overflowX: 'auto' }}>
        <div style={{ minWidth: '950px', display: 'flex', flexDirection: 'column' }}>
          
          {/* Sub-header gráfico */}
          <div style={{ padding: '0 1rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', marginBottom: '0.5rem' }}>
            <span>Tocá un día (o usá las flechas) para ver sus movimientos y proyección.</span>
            <span>Valores expresados en Millones de ARS ($M)</span>
          </div>

          {/* Gráfico SVG interactivo */}
          <div style={{ position: 'relative', width: '100%', height: '240px' }}>
            <svg width="100%" height="100%" viewBox={`0 0 ${dias.length * 40} 240`} preserveAspectRatio="none">
              
              {/* Franja de zona roja de saldo negativo (< $0 M) */}
              <rect x="0" y="140" width={dias.length * 40} height="50" fill="rgba(239, 68, 68, 0.08)" />

              {/* Columnas de los días (fondos de fin de semana y selección) */}
              {dias.map((d, i) => {
                const x = i * 40;
                const isSelected = diaSeleccionadoIdx === i;
                return (
                  <g key={i} onClick={() => setDiaSeleccionadoIdx(i)} style={{ cursor: 'pointer' }}>
                    {/* Fondo Finde */}
                    {d.esFinde && (
                      <rect x={x} y="0" width="40" height="200" fill="rgba(226, 232, 240, 0.4)" />
                    )}
                    {/* Fondo Selección */}
                    {isSelected && (
                      <rect x={x} y="0" width="40" height="200" fill="rgba(59, 130, 246, 0.12)" stroke="#3b82f6" strokeWidth="1" />
                    )}
                  </g>
                );
              })}

              {/* Barras diarias de Entra seguro, Entra esperado y Sale */}
              {dias.map((d, i) => {
                const cx = i * 40 + 20;
                
                // Entra seguro (Verde)
                if (d.entraSeguro > 0) {
                  const h = Math.min(45, (d.entraSeguro / 1000000) * 4);
                  return (
                    <rect key={`es-${i}`} x={cx - 10} y={190 - h} width="8" height={h} fill="#059669" rx="1" />
                  );
                }
                // Entra esperado (Rayado Naranja/Marrón)
                if (d.entraEsperado > 0) {
                  const h = Math.min(45, (d.entraEsperado / 1000000) * 4);
                  return (
                    <g key={`ee-${i}`}>
                      <rect x={cx - 2} y={190 - h} width="8" height={h} fill="#d97706" rx="1" />
                      <text x={cx + 2} y={190 - h - 3} fontSize="8" fontWeight="700" fill="#b45309" textAnchor="middle">
                        +${(d.entraEsperado/1000000).toFixed(1)}M
                      </text>
                    </g>
                  );
                }
                // Sale (Rojo)
                if (d.sale > 0) {
                  const h = Math.min(45, (d.sale / 1000000) * 4);
                  return (
                    <g key={`s-${i}`}>
                      <rect x={cx - 6} y={190} width="12" height={h} fill="#dc2626" rx="1" />
                      <text x={cx} y={195 + h + 8} fontSize="8" fontWeight="700" fill="#b91c1c" textAnchor="middle">
                        -${(d.sale/1000000).toFixed(1)}M
                      </text>
                    </g>
                  );
                }
                return null;
              })}

              {/* Línea Saldo Real (Negra) */}
              <polyline
                fill="none"
                stroke="#0f172a"
                strokeWidth="2.5"
                points={dias.map((d, i) => {
                  if (d.saldoReal === null) return '';
                  const x = i * 40 + 20;
                  const y = 130 - (d.saldoReal / 1000000) * 3;
                  return `${x},${Math.max(20, Math.min(180, y))}`;
                }).filter(Boolean).join(' ')}
              />

              {/* Línea Saldo Proyectado (Marrón) */}
              <polyline
                fill="none"
                stroke="#854d0e"
                strokeWidth="2.5"
                points={dias.map((d, i) => {
                  if (d.saldoProyectado === null) return '';
                  const x = i * 40 + 20;
                  const y = 130 - (d.saldoProyectado / 1000000) * 3;
                  return `${x},${Math.max(20, Math.min(180, y))}`;
                }).filter(Boolean).join(' ')}
              />

              {/* Línea Piso Firme (Azul Punteada) */}
              <polyline
                fill="none"
                stroke="#1d4ed8"
                strokeWidth="2"
                strokeDasharray="4 3"
                points={dias.map((d, i) => {
                  if (d.pisoFirme === null) return '';
                  const x = i * 40 + 20;
                  const y = 130 - (d.pisoFirme / 1000000) * 3;
                  return `${x},${Math.max(20, Math.min(180, y))}`;
                }).filter(Boolean).join(' ')}
              />

            </svg>

            {/* Floating Label HOY */}
            {dias.findIndex(d => d.esHoy) >= 0 && (
              <div style={{
                position: 'absolute',
                top: '5px',
                left: `${(dias.findIndex(d => d.esHoy) * 40) + 10}px`,
                backgroundColor: '#0f172a',
                color: 'white',
                fontSize: '0.65rem',
                fontWeight: '800',
                padding: '2px 6px',
                borderRadius: '3px',
                zIndex: 10
              }}>
                hoy
              </div>
            )}
          </div>

          {/* Eje X Fechas */}
          <div style={{ display: 'flex', borderTop: '1px solid #e2e8f0', paddingTop: '0.5rem' }}>
            {dias.map((d, i) => (
              <div 
                key={i} 
                onClick={() => setDiaSeleccionadoIdx(i)}
                style={{
                  width: '40px',
                  textAlign: 'center',
                  fontSize: '0.65rem',
                  color: d.esHoy ? '#0f172a' : '#64748b',
                  fontWeight: d.esHoy || diaSeleccionadoIdx === i ? '800' : '400',
                  cursor: 'pointer'
                }}
              >
                <div>{d.diaSemana}</div>
                <div>{d.fechaISO.slice(8, 10)}/{d.fechaISO.slice(5, 7)}</div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* 5. Bottom Split Section: Left Day Detail & Right "Con quién" Counterparty Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '1.5rem' }}>
        
        {/* Panel Izquierdo: Detalle del Día Seleccionado */}
        <div className="card" style={{ padding: '1.5rem', backgroundColor: 'white', border: '1px solid var(--border-light)' }}>
          {diaSeleccionado ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: '#0f172a' }}>
                  {new Date(diaSeleccionado.fechaISO + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
                  {diaSeleccionado.esPasado ? 'Día cerrado, según extracto real' : 'Proyección estimada de fondos'}
                </div>
              </div>

              <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>
                  {diaSeleccionado.esPasado ? 'Saldo Real' : 'Saldo Proyectado'}
                </span>
                <div style={{ fontSize: '1.75rem', fontWeight: '800', color: (diaSeleccionado.saldoProyectado || diaSeleccionado.saldoReal) < 0 ? '#dc2626' : '#0f172a' }}>
                  {fmtM(diaSeleccionado.esPasado ? diaSeleccionado.saldoReal : diaSeleccionado.saldoProyectado)}
                </div>
                {!diaSeleccionado.esPasado && (
                  <div style={{ fontSize: '0.75rem', color: '#1d4ed8', fontWeight: '600', marginTop: '0.25rem' }}>
                    Piso firme sin cobros esperados: {fmtM(diaSeleccionado.pisoFirme)}
                  </div>
                )}
              </div>

              <div>
                <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', fontWeight: '700', color: '#334155' }}>
                  Movimientos programados para este día
                </h4>
                {diaSeleccionado.detalles && diaSeleccionado.detalles.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {diaSeleccionado.detalles.map((det, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', borderRadius: '6px', backgroundColor: det.tipo === 'sale' ? '#fef2f2' : '#f0fdf4', fontSize: '0.85rem' }}>
                        <div>
                          <div style={{ fontWeight: '600', color: '#1e293b' }}>{det.contraparte}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{det.concepto}</div>
                        </div>
                        <span style={{ fontWeight: '800', color: det.tipo === 'sale' ? '#dc2626' : '#059669' }}>
                          {det.tipo === 'sale' ? '-' : '+'}$ {Number(det.monto).toLocaleString('es-AR')}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic', padding: '1rem 0' }}>
                    Sin movimientos registrados este día.
                  </div>
                )}
              </div>

            </div>
          ) : (
            <div style={{ color: '#94a3b8' }}>Selecciona un día en la línea de tiempo.</div>
          )}
        </div>

        {/* Panel Derecho: Resumen "Con quién" por Contraparte */}
        <div className="card" style={{ padding: '1.5rem', backgroundColor: 'white', border: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: '#0f172a' }}>Con quién</h3>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
                Próximos {horizonte} días, incluye cobros esperados.
              </div>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem' }}>Contraparte</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>Entra</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>Sale</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>Neto</th>
                </tr>
              </thead>
              <tbody>
                {contrapartes.map((c, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.6rem 0.5rem', fontWeight: '600', color: '#334155' }}>{c.contraparte}</td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', color: '#059669', fontWeight: c.entra > 0 ? '600' : '400' }}>
                      {c.entra > 0 ? fmtM(c.entra) : ''}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', color: '#dc2626', fontWeight: c.sale > 0 ? '600' : '400' }}>
                      {c.sale > 0 ? `-${fmtM(c.sale).replace('-', '')}` : ''}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontWeight: '700', color: c.neto >= 0 ? '#059669' : '#dc2626' }}>
                      {fmtM(c.neto)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid #0f172a', fontWeight: '800' }}>
                  <td style={{ padding: '0.75rem 0.5rem' }}>Total</td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#059669' }}>
                    {fmtM(contrapartes.reduce((a, c) => a + c.entra, 0))}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#dc2626' }}>
                    -{fmtM(contrapartes.reduce((a, c) => a + c.sale, 0)).replace('-', '')}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#0f172a' }}>
                    {fmtM(contrapartes.reduce((a, c) => a + c.neto, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

        </div>

      </div>

    </div>
  );
};

export default FlujoFondos;
