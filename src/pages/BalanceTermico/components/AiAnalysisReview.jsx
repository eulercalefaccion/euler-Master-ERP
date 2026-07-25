import React from 'react';
import { AlertTriangle, Info, HelpCircle } from 'lucide-react';

const AiAnalysisReview = ({ aiData }) => {
  if (!aiData) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="card" style={{ padding: '1.5rem', borderLeft: '4px solid var(--primary-500)' }}>
        <h3 style={{ fontSize: '1.125rem', marginBottom: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          Resumen del caso
        </h3>
        <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', fontSize: '0.95rem' }}>
          {aiData.resumen || 'Sin resumen disponible.'}
        </p>
      </div>

      {(aiData.observaciones || aiData.preguntas?.length > 0) && (
        <div className="card" style={{ padding: '1.5rem', backgroundColor: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Info size={18} /> Observaciones para el asesor
          </h3>
          {aiData.observaciones && (
            <p style={{ color: '#1e3a8a', fontSize: '0.9rem', marginBottom: '1rem', lineHeight: '1.5' }}>
              {aiData.observaciones}
            </p>
          )}
          {aiData.preguntas && aiData.preguntas.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: '600', color: '#1e40af', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <HelpCircle size={16} /> Preguntas sugeridas para el cliente:
              </h4>
              <ul style={{ paddingLeft: '1.5rem', margin: 0, color: '#1e3a8a', fontSize: '0.9rem' }}>
                {aiData.preguntas.map((q, i) => (
                  <li key={i} style={{ marginBottom: '0.25rem' }}>{q}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        {aiData.datos_no_detectados && aiData.datos_no_detectados.length > 0 && (
          <div className="card" style={{ flex: '1 1 300px', padding: '1.5rem', backgroundColor: '#fff1f2', border: '1px solid #fecdd3' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: '#be123c', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Datos no detectados
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {aiData.datos_no_detectados.map((d, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.85rem' }}>
                  <span style={{ 
                    padding: '0.1rem 0.5rem', 
                    backgroundColor: d.importancia === 'Alto' ? '#fecaca' : d.importancia === 'Medio' ? '#fef08a' : '#e2e8f0',
                    color: d.importancia === 'Alto' ? '#991b1b' : d.importancia === 'Medio' ? '#854d0e' : '#475569',
                    borderRadius: '4px',
                    fontWeight: '600',
                    height: 'fit-content'
                  }}>
                    {d.importancia || 'Medio'}
                  </span>
                  <div>
                    <strong>{d.dato}: </strong>
                    <span style={{ color: '#881337' }}>{d.comentario}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {aiData.riesgos && aiData.riesgos.length > 0 && (
          <div className="card" style={{ flex: '1 1 300px', padding: '1.5rem', backgroundColor: '#fffbeb', border: '1px solid #fde68a' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: '#92400e', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={18} /> Riesgos técnicos
            </h3>
            <ul style={{ paddingLeft: '1.5rem', margin: 0, color: '#92400e', fontSize: '0.85rem' }}>
              {aiData.riesgos.map((r, i) => (
                <li key={i} style={{ marginBottom: '0.5rem', lineHeight: '1.4' }}>{r}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default AiAnalysisReview;
