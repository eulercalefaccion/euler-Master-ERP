import React from 'react';
import { Plus, X } from 'lucide-react';

const EnvironmentsEditor = ({ environments, setEnvironments }) => {
  const updateEnvironment = (id, field, value) => {
    setEnvironments(envs => 
      envs.map(env => env.id === id ? { ...env, [field]: value } : env)
    );
  };

  const removeEnvironment = (id) => {
    setEnvironments(envs => envs.filter(env => env.id !== id));
  };

  const handleDimensionChange = (id, field, value) => {
    setEnvironments(envs => envs.map(env => {
      if (env.id !== id) return env;
      const nextLargo = field === 'largo' ? value : (env.largo ?? '');
      const nextAncho = field === 'ancho' ? value : (env.ancho ?? '');
      const l = parseFloat(String(nextLargo).replace(',', '.')) || 0;
      const a = parseFloat(String(nextAncho).replace(',', '.')) || 0;
      const sup = (l > 0 && a > 0) ? Math.round(l * a * 100) / 100 : (env.superficie || 0);
      return {
        ...env,
        [field]: value,
        superficie: sup
      };
    }));
  };

  const addEnvironment = () => {
    const newId = Date.now().toString();
    setEnvironments([...environments, {
      id: newId,
      nombre: 'Nuevo Ambiente',
      planta: 'Baja',
      modoCalculo: 'directa',
      largo: '',
      ancho: '',
      superficie: 10,
      altura: 2.8,
      coefVolumetrico: '',
      orientacion: 'Norte',
      tipoVidrio: 'Simple',
      porcentajeVidrio: 15,
      calefaccion: true,
      confianza: 'Manual'
    }]);
  };

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1.125rem', margin: 0 }}>Ambientes ({environments.length})</h3>
        <button className="btn btn-primary" onClick={addEnvironment} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
          <Plus size={16} /> Agregar ambiente
        </button>
      </div>

      {environments.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '2rem 0' }}>
          No hay ambientes cargados.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {environments.map(env => (
            <div key={env.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '1rem', backgroundColor: 'var(--bg-surface-hover)', border: '1px solid var(--border-light)', borderRadius: '6px' }}>
              
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                  <div style={{ flex: '1 1 180px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>AMBIENTE</label>
                    <input 
                      className="input-field" 
                      value={env.nombre} 
                      onChange={(e) => updateEnvironment(env.id, 'nombre', e.target.value)} 
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div style={{ flex: '0 0 110px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>CÁLCULO SUP.</label>
                    <div style={{ display: 'flex', borderRadius: '4px', border: '1px solid #cbd5e1', overflow: 'hidden' }}>
                      <button
                        type="button"
                        onClick={() => updateEnvironment(env.id, 'modoCalculo', 'dimensiones')}
                        style={{
                          flex: 1,
                          padding: '0.35rem 0.2rem',
                          fontSize: '0.72rem',
                          fontWeight: env.modoCalculo === 'dimensiones' ? '700' : '400',
                          background: env.modoCalculo === 'dimensiones' ? '#2563eb' : '#f8fafc',
                          color: env.modoCalculo === 'dimensiones' ? 'white' : '#64748b',
                          border: 'none',
                          cursor: 'pointer'
                        }}
                        title="Calcular por Largo × Ancho"
                      >
                        L × A
                      </button>
                      <button
                        type="button"
                        onClick={() => updateEnvironment(env.id, 'modoCalculo', 'directa')}
                        style={{
                          flex: 1,
                          padding: '0.35rem 0.2rem',
                          fontSize: '0.72rem',
                          fontWeight: env.modoCalculo !== 'dimensiones' ? '700' : '400',
                          background: env.modoCalculo !== 'dimensiones' ? '#2563eb' : '#f8fafc',
                          color: env.modoCalculo !== 'dimensiones' ? 'white' : '#64748b',
                          border: 'none',
                          borderLeft: '1px solid #cbd5e1',
                          cursor: 'pointer'
                        }}
                        title="Ingresar Superficie directa"
                      >
                        Directa
                      </button>
                    </div>
                  </div>

                  <div style={{ flex: '0 0 70px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>LARGO (M)</label>
                    <input 
                      type="text" 
                      inputMode="decimal"
                      className="input-field" 
                      disabled={env.modoCalculo !== 'dimensiones'}
                      value={env.modoCalculo === 'dimensiones' ? (env.largo === 0 ? '' : (env.largo ?? '')) : ''} 
                      onChange={(e) => handleDimensionChange(env.id, 'largo', e.target.value)} 
                      onFocus={e => e.target.select()}
                      placeholder={env.modoCalculo === 'dimensiones' ? '0.0' : '—'}
                      style={{ 
                        width: '100%', 
                        textAlign: 'center',
                        backgroundColor: env.modoCalculo === 'dimensiones' ? 'white' : '#f1f5f9'
                      }}
                    />
                  </div>

                  <div style={{ flex: '0 0 70px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>ANCHO (M)</label>
                    <input 
                      type="text" 
                      inputMode="decimal"
                      className="input-field" 
                      disabled={env.modoCalculo !== 'dimensiones'}
                      value={env.modoCalculo === 'dimensiones' ? (env.ancho === 0 ? '' : (env.ancho ?? '')) : ''} 
                      onChange={(e) => handleDimensionChange(env.id, 'ancho', e.target.value)} 
                      onFocus={e => e.target.select()}
                      placeholder={env.modoCalculo === 'dimensiones' ? '0.0' : '—'}
                      style={{ 
                        width: '100%', 
                        textAlign: 'center',
                        backgroundColor: env.modoCalculo === 'dimensiones' ? 'white' : '#f1f5f9'
                      }}
                    />
                  </div>

                  <div style={{ flex: '0 0 90px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>SUP. M²</label>
                    <input 
                      type="text" 
                      inputMode="decimal"
                      readOnly={env.modoCalculo === 'dimensiones'}
                      className="input-field" 
                      value={env.superficie === 0 ? '' : (env.superficie ?? '')} 
                      onChange={(e) => {
                        if (env.modoCalculo !== 'dimensiones') {
                          updateEnvironment(env.id, 'superficie', e.target.value);
                        }
                      }} 
                      onFocus={e => e.target.select()}
                      placeholder="0.0"
                      style={{ 
                        width: '100%',
                        backgroundColor: env.modoCalculo === 'dimensiones' ? '#eff6ff' : 'white',
                        fontWeight: env.modoCalculo === 'dimensiones' ? '600' : 'normal',
                        color: env.modoCalculo === 'dimensiones' ? '#1d4ed8' : 'inherit'
                      }}
                    />
                  </div>

                  <div style={{ flex: '0 0 75px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>ALTURA M</label>
                    <input 
                      type="text" 
                      inputMode="decimal"
                      className="input-field" 
                      value={env.altura === 0 ? '' : (env.altura ?? '')} 
                      onChange={(e) => updateEnvironment(env.id, 'altura', e.target.value)} 
                      onFocus={e => e.target.select()}
                      placeholder="2.8"
                      style={{ width: '100%', textAlign: 'center' }}
                    />
                  </div>

                  <div style={{ flex: '0 0 85px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>COEF. KCAL</label>
                    <input 
                      type="text" 
                      inputMode="decimal"
                      className="input-field" 
                      value={env.coefVolumetrico === 0 ? '' : (env.coefVolumetrico ?? '')} 
                      onChange={(e) => updateEnvironment(env.id, 'coefVolumetrico', e.target.value)} 
                      onFocus={e => e.target.select()}
                      placeholder="Global"
                      title="Coeficiente volumétrico para este ambiente. Si está vacío, usa el global."
                      style={{ 
                        width: '100%', 
                        textAlign: 'center',
                        fontWeight: env.coefVolumetrico ? '600' : 'normal',
                        color: env.coefVolumetrico ? '#1e40af' : '#64748b',
                        backgroundColor: env.coefVolumetrico ? '#eff6ff' : 'white'
                      }}
                    />
                  </div>

                  <div style={{ flex: '0 0 100px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>VIDRIO</label>
                    <select 
                      className="input-field" 
                      value={env.tipoVidrio} 
                      onChange={(e) => updateEnvironment(env.id, 'tipoVidrio', e.target.value)}
                      style={{ width: '100%' }}
                    >
                      <option value="Simple">Simple</option>
                      <option value="DVH">DVH</option>
                    </select>
                  </div>

                  <div style={{ flex: '0 0 70px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>% VIDRIO</label>
                    <input 
                      type="text" 
                      inputMode="decimal"
                      className="input-field" 
                      value={env.porcentajeVidrio === 0 ? '' : (env.porcentajeVidrio ?? '')} 
                      onChange={(e) => updateEnvironment(env.id, 'porcentajeVidrio', e.target.value)} 
                      onFocus={e => e.target.select()}
                      placeholder="15"
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div style={{ flex: '0 0 65px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>CALEF.</label>
                    <select 
                      className="input-field" 
                      value={env.calefaccion ? 'Sí' : 'No'} 
                      onChange={(e) => updateEnvironment(env.id, 'calefaccion', e.target.value === 'Sí')}
                      style={{ width: '100%' }}
                    >
                      <option value="Sí">Sí</option>
                      <option value="No">No</option>
                    </select>
                  </div>
                </div>
                
                {env.motivo && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', margin: 0, marginTop: '0.5rem', fontStyle: 'italic' }}>
                    IA: {env.motivo}
                  </p>
                )}
              </div>
              
              <button 
                onClick={() => removeEnvironment(env.id)}
                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.5rem', marginTop: '1.25rem' }}
                title="Eliminar ambiente"
              >
                <X size={20} />
              </button>
            </div>
          ))}
        </div>
      )}

      {environments.length > 0 && (
        <div style={{ 
          display: 'flex', 
          gap: '2rem', 
          padding: '1rem 1.5rem', 
          marginTop: '1rem',
          backgroundColor: 'var(--bg-surface-hover)', 
          borderRadius: '8px', 
          borderTop: '2px solid var(--primary-500)',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total ambientes</span>
            <span style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)' }}>{environments.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total superficie</span>
            <span style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--primary-600)' }}>
              {environments.reduce((acc, e) => acc + (parseFloat(e.superficie) || 0), 0).toFixed(1)} m²
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total volumen</span>
            <span style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)' }}>
              {environments.reduce((acc, e) => acc + ((parseFloat(e.superficie) || 0) * (parseFloat(e.altura) || 0)), 0).toFixed(1)} m³
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Con calefacción</span>
            <span style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)' }}>
              {environments.filter(e => e.calefaccion).reduce((acc, e) => acc + (parseFloat(e.superficie) || 0), 0).toFixed(1)} m²
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnvironmentsEditor;
