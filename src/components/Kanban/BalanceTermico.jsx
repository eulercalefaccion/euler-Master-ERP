import React, { useState } from 'react';
import { updateDoc, doc } from 'firebase/firestore';
import { Plus, Trash2, Save } from 'lucide-react';
import CalculationParameters from '../../pages/BalanceTermico/components/CalculationParameters';
import FinalBalance from '../../pages/BalanceTermico/components/FinalBalance';

export default function BalanceTermico({ selectedLead, setSelectedLead, db }) {
  // If we already have balanceIA saved, use it. Otherwise, initialize defaults.
  const initialData = selectedLead?.balanceIA || {
    environments: [],
    params: {
      zonaIram: 'Zona III - Templada (-5°C)',
      tempExterior: -5,
      tempInterior: 20,
      tipoEnvolvente: 'Media (ladrillo hueco)',
      tipoVidrio: 'Simple',
      margenSeguridad: 15,
      coefVolumetrico: 45,
      sistemaEmision: 'Radiadores',
      rendimientoElemento: 145,
      pasoTubo: 20,
      diametroTubo: 20,
      longitudMaxTubo: 100
    },
    emitterChoices: {}
  };

  const [environments, setEnvironments] = useState(initialData.environments || []);
  const [params, setParams] = useState(initialData.params || {});
  const [emitterChoices, setEmitterChoices] = useState(initialData.emitterChoices || {});
  const [isSaving, setIsSaving] = useState(false);

  // Auto-update environment emitter choices from FinalBalance changes
  const handleFinalBalanceSave = (choices) => {
    setEmitterChoices(choices);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const balanceData = {
        environments: environments.map(e => {
          let sup = 0;
          if (e.modoCalculo === 'dimensiones') {
            const l = parseFloat(e.largo) || 0;
            const a = parseFloat(e.ancho) || 0;
            sup = (l > 0 && a > 0) ? Math.round(l * a * 100) / 100 : (parseFloat(e.superficie) || 0);
          } else {
            sup = e.superficie === '' ? 0 : (parseFloat(e.superficie) || 0);
          }
          return {
            ...e,
            modoCalculo: e.modoCalculo || 'directa',
            largo: e.largo === '' || e.largo === null || e.largo === undefined ? null : (parseFloat(e.largo) || null),
            ancho: e.ancho === '' || e.ancho === null || e.ancho === undefined ? null : (parseFloat(e.ancho) || null),
            superficie: sup,
            altura: e.altura === '' ? 2.8 : (parseFloat(e.altura) || 2.8),
            coefVolumetrico: (e.coefVolumetrico !== '' && e.coefVolumetrico !== null && e.coefVolumetrico !== undefined)
              ? (parseFloat(e.coefVolumetrico) || null)
              : null
          };
        }),
        params,
        emitterChoices,
        updatedAt: new Date().toISOString()
      };
      await updateDoc(doc(db, 'presupuestos', selectedLead.id), { balanceIA: balanceData });
      setSelectedLead(prev => ({ ...prev, balanceIA: balanceData }));
      alert('Balance térmico guardado con éxito.');
    } catch (err) {
      alert('Error al guardar: ' + err.message);
    }
    setIsSaving(false);
  };

  const addEnvironment = () => {
    setEnvironments([...environments, {
      id: Date.now().toString(),
      nombre: '',
      modoCalculo: 'directa',
      largo: '',
      ancho: '',
      superficie: 10,
      altura: 2.8,
      coefVolumetrico: '',
      planta: 'Planta Baja',
      calefaccion: true
    }]);
  };

  const updateEnv = (id, field, value) => {
    setEnvironments(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const handleDimensionChange = (id, field, value) => {
    setEnvironments(prev => prev.map(e => {
      if (e.id !== id) return e;
      const nextLargo = field === 'largo' ? value : (e.largo ?? '');
      const nextAncho = field === 'ancho' ? value : (e.ancho ?? '');
      const l = parseFloat(nextLargo) || 0;
      const a = parseFloat(nextAncho) || 0;
      const sup = (l > 0 && a > 0) ? Math.round(l * a * 100) / 100 : (e.superficie || 0);
      return {
        ...e,
        [field]: value,
        superficie: sup
      };
    }));
  };

  const removeEnv = (id) => {
    setEnvironments(prev => prev.filter(e => e.id !== id));
  };

  const inps = {
    padding: '0.35rem 0.5rem',
    borderRadius: '4px',
    border: '1px solid var(--border-light)',
    fontSize: '0.8rem',
    width: '100%',
    boxSizing: 'border-box'
  };

  const envsWithChoices = environments.map(env => ({
    ...env,
    superficie: env.superficie === '' ? 0 : (parseFloat(env.superficie) || 0),
    altura: env.altura === '' ? 2.8 : (parseFloat(env.altura) || 2.8),
    coefVolumetrico: (env.coefVolumetrico !== '' && env.coefVolumetrico !== null && env.coefVolumetrico !== undefined)
      ? (parseFloat(env.coefVolumetrico) || null)
      : null,
    choice: emitterChoices[env.id] || null
  }));

  return (
    <div style={{ padding: '1.5rem', background: 'white', borderRadius: '8px', minHeight: '100%', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🌡️ Balance Térmico Integrado
          </h2>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Configurá los parámetros, los ambientes y calculá emisores o piso radiante.
          </p>
        </div>
        <button onClick={handleSave} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} disabled={isSaving}>
          <Save size={16} /> {isSaving ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>

      {/* Params */}
      <CalculationParameters params={params} setParams={setParams} />

      {/* Editor de Ambientes */}
      <div className="card" style={{ padding: '1.5rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
        <h3 style={{ fontSize: '1.125rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>Definición de Ambientes</h3>
        <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-hover)', borderBottom: '2px solid var(--border-strong)', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem', minWidth: '160px' }}>Ambiente</th>
                <th style={{ padding: '0.5rem', minWidth: '110px' }}>Planta</th>
                <th style={{ padding: '0.5rem', minWidth: '120px', textAlign: 'center' }}>Cálculo Sup.</th>
                <th style={{ padding: '0.5rem', width: '75px', textAlign: 'center' }}>Largo (m)</th>
                <th style={{ padding: '0.5rem', width: '75px', textAlign: 'center' }}>Ancho (m)</th>
                <th style={{ padding: '0.5rem', width: '95px' }}>Superficie (m²)</th>
                <th style={{ padding: '0.5rem', width: '75px', textAlign: 'center' }}>Altura (m)</th>
                <th style={{ padding: '0.5rem', width: '95px', textAlign: 'center' }}>Coef. (Kcal/m³)</th>
                <th style={{ padding: '0.5rem', textAlign: 'center', width: '60px' }}>¿Calef.?</th>
                <th style={{ padding: '0.5rem', textAlign: 'center', width: '50px' }}>Eliminar</th>
              </tr>
            </thead>
            <tbody>
              {environments.length === 0 && (
                <tr><td colSpan="10" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>No hay ambientes. Presioná el botón abajo para agregar.</td></tr>
              )}
              {environments.map(env => (
                <tr key={env.id} style={{ borderBottom: '1px solid var(--border-light)', background: 'white' }}>
                  <td style={{ padding: '0.4rem' }}>
                    <input type="text" value={env.nombre} onChange={e => updateEnv(env.id, 'nombre', e.target.value)} style={inps} placeholder="Ej: Living" />
                  </td>
                  <td style={{ padding: '0.4rem' }}>
                    <select value={env.planta || 'Planta Baja'} onChange={e => updateEnv(env.id, 'planta', e.target.value)} style={inps}>
                      <option value="Planta Baja">Planta Baja</option>
                      <option value="Planta Alta">Planta Alta</option>
                    </select>
                  </td>
                  <td style={{ padding: '0.4rem', textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', borderRadius: '4px', border: '1px solid #cbd5e1', overflow: 'hidden', width: '100%' }}>
                      <button
                        type="button"
                        onClick={() => updateEnv(env.id, 'modoCalculo', 'dimensiones')}
                        style={{
                          flex: 1,
                          padding: '0.3rem 0.2rem',
                          fontSize: '0.72rem',
                          fontWeight: env.modoCalculo === 'dimensiones' ? '700' : '400',
                          background: env.modoCalculo === 'dimensiones' ? '#2563eb' : '#f8fafc',
                          color: env.modoCalculo === 'dimensiones' ? 'white' : '#64748b',
                          border: 'none',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                        title="Calcular ingresando Largo y Ancho"
                      >
                        L × A
                      </button>
                      <button
                        type="button"
                        onClick={() => updateEnv(env.id, 'modoCalculo', 'directa')}
                        style={{
                          flex: 1,
                          padding: '0.3rem 0.2rem',
                          fontSize: '0.72rem',
                          fontWeight: env.modoCalculo !== 'dimensiones' ? '700' : '400',
                          background: env.modoCalculo !== 'dimensiones' ? '#2563eb' : '#f8fafc',
                          color: env.modoCalculo !== 'dimensiones' ? 'white' : '#64748b',
                          border: 'none',
                          borderLeft: '1px solid #cbd5e1',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                        title="Ingresar Superficie directamente"
                      >
                        Directa
                      </button>
                    </div>
                  </td>
                  <td style={{ padding: '0.4rem' }}>
                    <input 
                      type="number" 
                      step="0.05" 
                      disabled={env.modoCalculo !== 'dimensiones'}
                      value={env.modoCalculo === 'dimensiones' ? (env.largo ?? '') : ''} 
                      onChange={e => handleDimensionChange(env.id, 'largo', e.target.value)} 
                      onFocus={e => e.target.select()}
                      placeholder={env.modoCalculo === 'dimensiones' ? '0.0' : '—'}
                      style={{
                        ...inps,
                        backgroundColor: env.modoCalculo === 'dimensiones' ? 'white' : '#f1f5f9',
                        color: env.modoCalculo === 'dimensiones' ? 'inherit' : '#94a3b8',
                        cursor: env.modoCalculo === 'dimensiones' ? 'text' : 'not-allowed',
                        textAlign: 'center'
                      }} 
                    />
                  </td>
                  <td style={{ padding: '0.4rem' }}>
                    <input 
                      type="number" 
                      step="0.05" 
                      disabled={env.modoCalculo !== 'dimensiones'}
                      value={env.modoCalculo === 'dimensiones' ? (env.ancho ?? '') : ''} 
                      onChange={e => handleDimensionChange(env.id, 'ancho', e.target.value)} 
                      onFocus={e => e.target.select()}
                      placeholder={env.modoCalculo === 'dimensiones' ? '0.0' : '—'}
                      style={{
                        ...inps,
                        backgroundColor: env.modoCalculo === 'dimensiones' ? 'white' : '#f1f5f9',
                        color: env.modoCalculo === 'dimensiones' ? 'inherit' : '#94a3b8',
                        cursor: env.modoCalculo === 'dimensiones' ? 'text' : 'not-allowed',
                        textAlign: 'center'
                      }} 
                    />
                  </td>
                  <td style={{ padding: '0.4rem' }}>
                    <div style={{ position: 'relative' }}>
                      <input 
                        type="number" 
                        step="0.1" 
                        readOnly={env.modoCalculo === 'dimensiones'}
                        value={env.superficie ?? ''} 
                        onChange={e => {
                          if (env.modoCalculo !== 'dimensiones') {
                            updateEnv(env.id, 'superficie', e.target.value);
                          }
                        }} 
                        onFocus={e => e.target.select()}
                        placeholder="0.0"
                        style={{
                          ...inps,
                          backgroundColor: env.modoCalculo === 'dimensiones' ? '#eff6ff' : 'white',
                          borderColor: env.modoCalculo === 'dimensiones' ? '#93c5fd' : 'var(--border-light)',
                          fontWeight: env.modoCalculo === 'dimensiones' ? '600' : 'normal',
                          color: env.modoCalculo === 'dimensiones' ? '#1d4ed8' : 'inherit'
                        }} 
                      />
                      {env.modoCalculo === 'dimensiones' && (
                        <span style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.65rem', color: '#3b82f6', fontWeight: '700', pointerEvents: 'none' }}>
                          auto
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '0.4rem' }}>
                    <input 
                      type="number" 
                      step="0.1" 
                      value={env.altura ?? ''} 
                      onChange={e => updateEnv(env.id, 'altura', e.target.value)} 
                      onFocus={e => e.target.select()}
                      placeholder="2.8"
                      style={{ ...inps, textAlign: 'center' }} 
                    />
                  </td>
                  <td style={{ padding: '0.4rem' }}>
                    <input 
                      type="number" 
                      step="1" 
                      value={env.coefVolumetrico ?? ''} 
                      onChange={e => updateEnv(env.id, 'coefVolumetrico', e.target.value)} 
                      onFocus={e => e.target.select()}
                      placeholder={params.coefVolumetrico ? `${params.coefVolumetrico}` : '45'}
                      title={`Por defecto usa el sugerido global (${params.coefVolumetrico ?? 45} Kcal/h·m³). Podés escribir otro número para este ambiente.`}
                      style={{
                        ...inps,
                        fontWeight: (env.coefVolumetrico !== '' && env.coefVolumetrico !== null && env.coefVolumetrico !== undefined) ? '600' : 'normal',
                        color: (env.coefVolumetrico !== '' && env.coefVolumetrico !== null && env.coefVolumetrico !== undefined) ? '#1e40af' : '#64748b',
                        backgroundColor: (env.coefVolumetrico !== '' && env.coefVolumetrico !== null && env.coefVolumetrico !== undefined) ? '#eff6ff' : 'white',
                        textAlign: 'center'
                      }} 
                    />
                  </td>
                  <td style={{ padding: '0.4rem', textAlign: 'center' }}>
                    <input type="checkbox" checked={env.calefaccion !== false} onChange={e => updateEnv(env.id, 'calefaccion', e.target.checked)} />
                  </td>
                  <td style={{ padding: '0.4rem', textAlign: 'center' }}>
                    <button onClick={() => removeEnv(env.id)} style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', padding: '0.2rem' }}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addEnvironment} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
          <Plus size={16} /> Agregar Ambiente Manual
        </button>
      </div>

      {/* Vista Final Balance */}
      {environments.filter(e => e.calefaccion).length > 0 ? (
        <div style={{ marginTop: '1rem' }}>
          <FinalBalance 
            environments={envsWithChoices} 
            params={params} 
            isEmbedded={true}
            onSave={handleFinalBalanceSave}
          />
        </div>
      ) : (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)', background: '#f8fafc', borderRadius: '8px', border: '1px dashed var(--border-strong)' }}>
          Agregá al menos un ambiente para ver el cálculo final y poder descargar el PDF.
        </div>
      )}
    </div>
  );
}
