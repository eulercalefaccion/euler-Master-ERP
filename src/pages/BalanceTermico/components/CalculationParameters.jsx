import React from 'react';

// Tabla de coeficientes volumétricos (Kcal/h·m³) según zona y envolvente
// Basado en práctica profesional estándar Argentina
const COEF_TABLE = {
  'I':   { Buena: 32, Media: 42, Mala: 52 },
  'II':  { Buena: 36, Media: 47, Mala: 58 },
  'III': { Buena: 42, Media: 55, Mala: 68 },
  'IV':  { Buena: 50, Media: 64, Mala: 80 },
  'V':   { Buena: 60, Media: 78, Mala: 96 },
};

const getZonaKey = (zonaIram) => {
  if (zonaIram.includes('Zona I -') || zonaIram.startsWith('Zona I ')) return 'I';
  if (zonaIram.includes('II')) return 'II';
  if (zonaIram.includes('III')) return 'III';
  if (zonaIram.includes('IV')) return 'IV';
  if (zonaIram.includes('V')) return 'V';
  return 'III';
};

const getEnvKey = (tipoEnvolvente) => {
  if (tipoEnvolvente.includes('Buena')) return 'Buena';
  if (tipoEnvolvente.includes('Mala')) return 'Mala';
  return 'Media';
};

export const getSuggestedCoef = (zonaIram, tipoEnvolvente) => {
  const zona = getZonaKey(zonaIram);
  const env = getEnvKey(tipoEnvolvente);
  return COEF_TABLE[zona]?.[env] ?? 45;
};

const CalculationParameters = ({ params, setParams }) => {
  const updateParam = (field, value) => {
    setParams(p => ({ ...p, [field]: value }));
  };

  const handleZonaOrEnvChange = (field, value) => {
    const newParams = { ...params, [field]: value };
    // Auto-sugerir el coeficiente cuando cambia la zona o envolvente
    const suggested = getSuggestedCoef(
      field === 'zonaIram' ? value : newParams.zonaIram,
      field === 'tipoEnvolvente' ? value : newParams.tipoEnvolvente
    );
    setParams({ ...newParams, coefVolumetrico: suggested });
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
            onChange={e => handleZonaOrEnvChange('zonaIram', e.target.value)}
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
            onChange={e => handleZonaOrEnvChange('tipoEnvolvente', e.target.value)}
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

        {/* COEFICIENTE VOLUMETRICO — clave del cálculo */}
        <div style={{ gridColumn: '1 / -1', padding: '1rem', backgroundColor: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.25rem', color: '#1e40af' }}>
            Coeficiente volumétrico (Kcal/h·m³) — editable
          </label>
          <p style={{ fontSize: '0.8rem', color: '#3730a3', marginBottom: '0.75rem', margin: '0 0 0.75rem 0' }}>
            Auto-sugerido según zona y envolvente. Rango habitual: 30–80 Kcal/h·m³. Podés ajustarlo manualmente.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <input 
              type="number" 
              className="input-field" 
              value={params.coefVolumetrico ?? 45} 
              onChange={e => updateParam('coefVolumetrico', parseFloat(e.target.value) || 45)}
              style={{ width: '100px', backgroundColor: 'white', fontWeight: '700', fontSize: '1.1rem' }}
              step="1"
              min="10"
              max="150"
            />
            <span style={{ fontSize: '0.9rem', color: '#1e40af', fontWeight: '500' }}>Kcal/h·m³</span>
            <button 
              onClick={() => updateParam('coefVolumetrico', getSuggestedCoef(params.zonaIram, params.tipoEnvolvente))}
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Restablecer sugerido
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalculationParameters;
