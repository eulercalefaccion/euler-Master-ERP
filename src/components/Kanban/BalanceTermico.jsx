import React, { useState, useRef } from 'react';
import { updateDoc, doc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Plus, Trash2, Save, Sparkles, Upload, Loader2, AlertTriangle, X } from 'lucide-react';
import CalculationParameters from '../../pages/BalanceTermico/components/CalculationParameters';
import FinalBalance from '../../pages/BalanceTermico/components/FinalBalance';
import { functions } from '../../services/firebaseConfig';

// ── Helpers para el asistente IA de planos ──────────────────────────────
const AI_ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const AI_MAX_FILES = 3;
const AI_MAX_SIZE = 30 * 1024 * 1024; // 30 MB (igual que PlanUploader)

const convertToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result);
  reader.onerror = error => reject(error);
});

// Convierte "18,5" / "18.5 m²" / 18.5 en número; devuelve fallback si no es válido
const toNumber = (value, fallback) => {
  if (value === null || value === undefined || value === '') return fallback;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// La IA (y la página standalone) usan 'Baja'/'Alta'; el componente embebido usa 'Planta Baja'/'Planta Alta'
const normalizePlanta = (planta) => (String(planta || '').toLowerCase().includes('alta') ? 'Planta Alta' : 'Planta Baja');

// Mapea un ambiente devuelto por analyzeFloorPlan a la forma que usa este componente
const mapAiEnvironment = (env, idx, baseId) => ({
  id: `${baseId}_ia_${idx}`,
  nombre: (typeof env?.nombre === 'string' && env.nombre.trim()) ? env.nombre.trim() : 'Local Sin Nombre',
  modoCalculo: 'directa',
  largo: '',
  ancho: '',
  superficie: Math.round(toNumber(env?.superficie, 0) * 100) / 100,
  altura: toNumber(env?.altura, 2.8),
  coefVolumetrico: '', // usa el coeficiente global de los parámetros
  planta: normalizePlanta(env?.planta),
  calefaccion: env?.calefaccion !== undefined ? env.calefaccion !== false : true,
  // Datos informativos extra de la IA (mismos nombres que la página standalone)
  orientacion: env?.orientacion || 'No indicada',
  tipoVidrio: env?.tipo_vidrio || 'Simple',
  porcentajeVidrio: toNumber(env?.porcentaje_vidrio, 10),
  confianza: env?.confianza || 'Media',
  motivo: env?.motivo || '',
  origen: 'ia'
});

const readableAiError = (err) => {
  const code = err?.code || '';
  if (code === 'functions/deadline-exceeded') return 'El análisis tardó demasiado. Probá con un plano más liviano o de a un archivo por vez.';
  if (code === 'functions/unauthenticated') return 'Tu sesión expiró. Volvé a iniciar sesión e intentá de nuevo.';
  if (code === 'functions/unavailable') return 'El servicio de IA no está disponible en este momento. Intentá más tarde.';
  const msg = err?.message && err.message !== 'internal' ? err.message : 'Error interno del servicio de IA.';
  return `No se pudo analizar el plano: ${msg}`;
};

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

  // ── Estado del asistente IA ──
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiProgress, setAiProgress] = useState('');
  const [aiError, setAiError] = useState('');
  const [aiResult, setAiResult] = useState(null); // { environments, resumen, observaciones }
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Auto-update environment emitter choices from FinalBalance changes
  const handleFinalBalanceSave = (choices) => {
    setEmitterChoices(choices);
  };

  const resetAiPanel = () => {
    setAiResult(null);
    setAiError('');
    setAiProgress('');
    setIsDragOver(false);
  };

  const closeAiPanel = () => {
    if (isAnalyzing) return;
    resetAiPanel();
    setShowAiPanel(false);
  };

  // Mismo flujo que la página standalone (src/pages/BalanceTermico): base64 → analyzeFloorPlan por archivo
  const handleAiFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setAiError('');
    setAiResult(null);

    if (files.length > AI_MAX_FILES) {
      setAiError(`Solo podés subir hasta ${AI_MAX_FILES} archivos simultáneamente.`);
      return;
    }
    for (const file of files) {
      if (file.size > AI_MAX_SIZE) {
        setAiError(`El archivo "${file.name}" supera los 30 MB permitidos.`);
        return;
      }
      if (file.type && !AI_ACCEPTED_TYPES.includes(file.type)) {
        setAiError(`El archivo "${file.name}" no tiene un formato válido. Usá PDF, JPG, PNG o WEBP.`);
        return;
      }
    }

    setIsAnalyzing(true);
    try {
      const analyzeFloorPlan = httpsCallable(functions, 'analyzeFloorPlan');
      let allAiEnvs = [];
      const resumenes = [];
      const observaciones = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setAiProgress(files.length > 1 ? `Plano ${i + 1} de ${files.length}: ${file.name}` : file.name);
        const base64 = await convertToBase64(file);
        // Remove prefix data:image/...;base64,
        const base64Data = String(base64).split(',')[1];
        const response = await analyzeFloorPlan({ fileBase64: base64Data, mediaType: file.type });
        const parsedData = response?.data?.data || {};
        if (parsedData.resumen) resumenes.push(parsedData.resumen);
        if (parsedData.observaciones) observaciones.push(parsedData.observaciones);
        if (Array.isArray(parsedData.ambientes)) {
          allAiEnvs = [...allAiEnvs, ...parsedData.ambientes];
        }
      }

      if (allAiEnvs.length === 0) {
        setAiError('La IA no detectó ambientes en el plano. Probá con una imagen más nítida o cargalos manualmente.');
        return;
      }

      const baseId = Date.now().toString();
      setAiResult({
        environments: allAiEnvs.map((env, idx) => mapAiEnvironment(env, idx, baseId)),
        resumen: resumenes.join(' | '),
        observaciones: observaciones.join(' | ')
      });
    } catch (err) {
      console.error('Error analizando plano:', err);
      setAiError(readableAiError(err));
    } finally {
      setIsAnalyzing(false);
      setAiProgress('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // mode: 'append' | 'replace'. No guarda en Firestore: el usuario debe presionar "Guardar Cambios".
  const applyAiEnvironments = (mode) => {
    if (!aiResult?.environments?.length) return;
    if (mode === 'replace' && environments.length > 0) {
      const ok = window.confirm(`Se reemplazarán los ${environments.length} ambientes actuales por los ${aiResult.environments.length} detectados por la IA. ¿Continuar?`);
      if (!ok) return;
    }
    setEnvironments(prev => (mode === 'replace' ? aiResult.environments : [...prev, ...aiResult.environments]));
    resetAiPanel();
    setShowAiPanel(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const balanceData = {
        environments: environments.map(e => {
          const l = e.largo !== '' && e.largo !== null && e.largo !== undefined ? (parseFloat(String(e.largo).replace(',', '.')) || null) : null;
          const a = e.ancho !== '' && e.ancho !== null && e.ancho !== undefined ? (parseFloat(String(e.ancho).replace(',', '.')) || null) : null;
          let sup = e.superficie === '' ? 0 : (parseFloat(String(e.superficie).replace(',', '.')) || 0);
          if (e.modoCalculo === 'dimensiones' && l && a) {
            sup = Math.round(l * a * 100) / 100;
          }
          return {
            ...e,
            modoCalculo: e.modoCalculo || 'directa',
            largo: l,
            ancho: a,
            superficie: sup,
            altura: e.altura === '' ? 2.8 : (parseFloat(String(e.altura).replace(',', '.')) || 2.8),
            coefVolumetrico: (e.coefVolumetrico !== '' && e.coefVolumetrico !== null && e.coefVolumetrico !== undefined)
              ? (parseFloat(String(e.coefVolumetrico).replace(',', '.')) || null)
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
      const l = parseFloat(String(nextLargo).replace(',', '.')) || 0;
      const a = parseFloat(String(nextAncho).replace(',', '.')) || 0;
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
    superficie: env.superficie === '' ? 0 : (parseFloat(String(env.superficie).replace(',', '.')) || 0),
    altura: env.altura === '' ? 2.8 : (parseFloat(String(env.altura).replace(',', '.')) || 2.8),
    coefVolumetrico: (env.coefVolumetrico !== '' && env.coefVolumetrico !== null && env.coefVolumetrico !== undefined)
      ? (parseFloat(String(env.coefVolumetrico).replace(',', '.')) || null)
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.125rem', margin: 0, color: 'var(--text-primary)' }}>Definición de Ambientes</h3>
          {!showAiPanel && (
            <button
              type="button"
              onClick={() => { resetAiPanel(); setShowAiPanel(true); }}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#7c3aed', borderColor: '#c4b5fd', background: '#f5f3ff' }}
            >
              <Sparkles size={16} /> Importar ambientes desde plano (IA)
            </button>
          )}
        </div>

        {/* Asistente IA: importar ambientes desde plano */}
        {showAiPanel && (
          <div style={{ marginBottom: '1.25rem', padding: '1rem 1.25rem', background: 'white', border: '1px solid #c4b5fd', borderRadius: '8px', boxShadow: '0 1px 3px rgba(124, 58, 237, 0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#6d28d9', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Sparkles size={16} /> Importar ambientes desde plano (IA)
              </h4>
              <button
                type="button"
                onClick={closeAiPanel}
                disabled={isAnalyzing}
                title="Cerrar"
                style={{ background: 'none', border: 'none', cursor: isAnalyzing ? 'not-allowed' : 'pointer', color: 'var(--text-secondary)', padding: '0.2rem', display: 'flex' }}
              >
                <X size={18} />
              </button>
            </div>

            {isAnalyzing ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.5rem 0' }}>
                <Loader2 size={32} style={{ color: '#7c3aed', animation: 'bt-ia-spin 1s linear infinite' }} />
                <p style={{ margin: '0.75rem 0 0.25rem 0', fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>Analizando plano con IA…</p>
                {aiProgress && <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{aiProgress}</p>}
                <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>Esto puede demorar hasta 60 segundos por archivo.</p>
                <style>{`@keyframes bt-ia-spin { 100% { transform: rotate(360deg); } }`}</style>
              </div>
            ) : aiResult ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                  La IA detectó <strong>{aiResult.environments.length}</strong> ambiente{aiResult.environments.length === 1 ? '' : 's'}. Revisalos antes de importarlos (podrás editarlos luego en la tabla).
                </p>
                {(aiResult.resumen || aiResult.observaciones) && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.5rem 0.75rem' }}>
                    {aiResult.resumen && <div><strong>Resumen:</strong> {aiResult.resumen}</div>}
                    {aiResult.observaciones && <div style={{ marginTop: aiResult.resumen ? '0.25rem' : 0 }}><strong>Observaciones:</strong> {aiResult.observaciones}</div>}
                  </div>
                )}
                <div style={{ overflowX: 'auto', maxHeight: '260px', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: '6px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-surface-hover)', textAlign: 'left' }}>
                        <th style={{ padding: '0.4rem 0.5rem' }}>Ambiente</th>
                        <th style={{ padding: '0.4rem 0.5rem' }}>Planta</th>
                        <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>Sup. (m²)</th>
                        <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>Altura (m)</th>
                        <th style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>Calef.</th>
                        <th style={{ padding: '0.4rem 0.5rem' }}>Confianza</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aiResult.environments.map(env => (
                        <tr key={env.id} style={{ borderTop: '1px solid var(--border-light)' }} title={env.motivo || ''}>
                          <td style={{ padding: '0.35rem 0.5rem' }}>{env.nombre}</td>
                          <td style={{ padding: '0.35rem 0.5rem' }}>{env.planta}</td>
                          <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>{Number(env.superficie) ? Number(env.superficie).toFixed(2) : '—'}</td>
                          <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>{env.altura}</td>
                          <td style={{ padding: '0.35rem 0.5rem', textAlign: 'center' }}>{env.calefaccion ? 'Sí' : 'No'}</td>
                          <td style={{ padding: '0.35rem 0.5rem' }}>{env.confianza}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-secondary" onClick={resetAiPanel} style={{ fontSize: '0.8rem' }}>
                    Analizar otro plano
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => applyAiEnvironments('replace')} style={{ fontSize: '0.8rem' }}>
                    Reemplazar ambientes
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => applyAiEnvironments('append')} style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Plus size={14} /> Agregar a los existentes
                  </button>
                </div>
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-tertiary)', textAlign: 'right' }}>
                  Los cambios no se guardan hasta presionar "Guardar Cambios".
                </p>
              </div>
            ) : (
              <div>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={e => { e.preventDefault(); setIsDragOver(false); }}
                  onDrop={e => { e.preventDefault(); setIsDragOver(false); handleAiFiles(e.dataTransfer.files); }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    border: `2px dashed ${isDragOver ? '#7c3aed' : 'var(--border-light)'}`,
                    borderRadius: '8px', padding: '1.5rem 1rem', cursor: 'pointer', transition: 'all 0.2s ease',
                    backgroundColor: isDragOver ? 'rgba(124, 58, 237, 0.05)' : 'var(--bg-surface-hover)'
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf, image/jpeg, image/png, image/webp"
                    multiple
                    style={{ display: 'none' }}
                    onChange={e => handleAiFiles(e.target.files)}
                  />
                  <Upload size={24} color="#7c3aed" />
                  <p style={{ margin: '0.5rem 0 0.25rem 0', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Seleccionar planos o arrastrar y soltar</p>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>PDF, JPG, PNG, WEBP · Máx 30 MB · Hasta 3 archivos</p>
                </div>
              </div>
            )}

            {aiError && !isAnalyzing && (
              <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.6rem 0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#b91c1c', fontSize: '0.8rem' }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>{aiError}</span>
              </div>
            )}
          </div>
        )}

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
                      type="text" 
                      inputMode="decimal"
                      disabled={env.modoCalculo !== 'dimensiones'}
                      value={env.modoCalculo === 'dimensiones' ? (env.largo === 0 ? '' : (env.largo ?? '')) : ''} 
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
                      type="text" 
                      inputMode="decimal"
                      disabled={env.modoCalculo !== 'dimensiones'}
                      value={env.modoCalculo === 'dimensiones' ? (env.ancho === 0 ? '' : (env.ancho ?? '')) : ''} 
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
                        type="text" 
                        inputMode="decimal"
                        readOnly={env.modoCalculo === 'dimensiones'}
                        value={env.superficie === 0 ? '' : (env.superficie ?? '')} 
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
                      type="text" 
                      inputMode="decimal"
                      value={env.altura === 0 ? '' : (env.altura ?? '')} 
                      onChange={e => updateEnv(env.id, 'altura', e.target.value)} 
                      onFocus={e => e.target.select()}
                      placeholder="2.8"
                      style={{ ...inps, textAlign: 'center' }} 
                    />
                  </td>
                  <td style={{ padding: '0.4rem' }}>
                    <input 
                      type="text" 
                      inputMode="decimal"
                      value={env.coefVolumetrico === 0 ? '' : (env.coefVolumetrico ?? '')} 
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
