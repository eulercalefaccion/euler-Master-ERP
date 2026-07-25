import React from 'react';

const CalculationParameters = ({ params, setParams }) => {
  const updateParam = (field, value) => {
    setParams(p => ({ ...p, [field]: value }));
  };

  return (
    <div className="card" style={{ padding: '1.5rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
      <h3 style={{ fontSize: '1.125rem', marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Parámetros de Cálculo</h3>
      
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
            Zona bioclimática IRAM 11603 *
          </label>
          <select 
            className="input-field" 
            value={params.zonaIram} 
            onChange={e => updateParam('zonaIram', e.target.value)}
            style={{ width: '100%', backgroundColor: 'white' }}
          >
            <option>Zona I - NOA / NEA (0°C)</option>
            <option>Zona II - Centro (-2°C)</option>
            <option>Zona III - Templada (-5°C)</option>
            <option>Zona IV - Fría (-8°C)</option>
            <option>Zona V - Muy Fría (-12°C)</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
            T° exterior de diseño (°C) *
          </label>
          <input 
            type="number" 
            className="input-field" 
            value={params.tempExterior} 
            onChange={e => updateParam('tempExterior', parseFloat(e.target.value))}
            style={{ width: '100%', backgroundColor: 'white' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
            T° interior objetivo (°C)
          </label>
          <input 
            type="number" 
            className="input-field" 
            value={params.tempInterior} 
            onChange={e => updateParam('tempInterior', parseFloat(e.target.value))}
            style={{ width: '100%', backgroundColor: 'white' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
            Tipo de envolvente constructiva
          </label>
          <select 
            className="input-field" 
            value={params.tipoEnvolvente} 
            onChange={e => updateParam('tipoEnvolvente', e.target.value)}
            style={{ width: '100%', backgroundColor: 'white' }}
          >
            <option>Buena (Aislación extra)</option>
            <option>Media (ladrillo hueco)</option>
            <option>Mala (ladrillo común sin aislación)</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
            Tipo de vidrio predominante
          </label>
          <select 
            className="input-field" 
            value={params.tipoVidrio} 
            onChange={e => updateParam('tipoVidrio', e.target.value)}
            style={{ width: '100%', backgroundColor: 'white' }}
          >
            <option>Simple</option>
            <option>DVH</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
            Margen de seguridad
          </label>
          <select 
            className="input-field" 
            value={params.margenSeguridad} 
            onChange={e => updateParam('margenSeguridad', parseInt(e.target.value))}
            style={{ width: '100%', backgroundColor: 'white' }}
          >
            <option value="10">10%</option>
            <option value="15">15% (Recomendado)</option>
            <option value="20">20%</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default CalculationParameters;
