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

  const addEnvironment = () => {
    const newId = Date.now().toString();
    setEnvironments([...environments, {
      id: newId,
      nombre: 'Nuevo Ambiente',
      planta: 'Baja',
      superficie: 10,
      altura: 2.8,
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
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                  <div style={{ flex: '1 1 200px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>AMBIENTE</label>
                    <input 
                      className="input-field" 
                      value={env.nombre} 
                      onChange={(e) => updateEnvironment(env.id, 'nombre', e.target.value)} 
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div style={{ flex: '0 0 100px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>SUP. M²</label>
                    <input 
                      type="number" 
                      className="input-field" 
                      value={env.superficie} 
                      onChange={(e) => updateEnvironment(env.id, 'superficie', parseFloat(e.target.value) || 0)} 
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div style={{ flex: '0 0 100px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>ALTURA M</label>
                    <input 
                      type="number" 
                      step="0.1"
                      className="input-field" 
                      value={env.altura} 
                      onChange={(e) => updateEnvironment(env.id, 'altura', parseFloat(e.target.value) || 0)} 
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div style={{ flex: '0 0 120px' }}>
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
                  <div style={{ flex: '0 0 80px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>% VIDRIO</label>
                    <input 
                      type="number" 
                      className="input-field" 
                      value={env.porcentajeVidrio} 
                      onChange={(e) => updateEnvironment(env.id, 'porcentajeVidrio', parseInt(e.target.value) || 0)} 
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div style={{ flex: '0 0 80px' }}>
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
