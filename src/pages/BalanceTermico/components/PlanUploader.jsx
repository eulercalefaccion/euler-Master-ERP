import React from 'react';
import { Upload, FileImage, Loader2 } from 'lucide-react';

const PlanUploader = ({ onUpload, isAnalyzing }) => {
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 30 * 1024 * 1024) {
      alert('El archivo supera los 30MB permitidos.');
      return;
    }

    onUpload(file);
  };

  return (
    <div className="card" style={{ padding: '2rem' }}>
      <h3 style={{ fontSize: '1.125rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <FileImage size={20} color="var(--primary-600)" />
        Análisis IA — Subir Plano
      </h3>

      {isAnalyzing ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem 0' }}>
          <Loader2 size={40} className="spinner" style={{ color: 'var(--primary-500)', animation: 'spin 1s linear infinite' }} />
          <p style={{ marginTop: '1rem', fontWeight: '500', color: 'var(--text-primary)' }}>
            Analizando con IA...
          </p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Esto puede demorar hasta 60 segundos.
          </p>
          <div style={{ width: '100%', maxWidth: '400px', height: '6px', backgroundColor: 'var(--bg-surface-hover)', borderRadius: '3px', marginTop: '1.5rem', overflow: 'hidden' }}>
            <div style={{ width: '50%', height: '100%', backgroundColor: 'var(--primary-500)', borderRadius: '3px', animation: 'progress 2s infinite ease-in-out' }} />
          </div>
          <style>
            {`
              @keyframes spin { 100% { transform: rotate(360deg); } }
              @keyframes progress { 
                0% { transform: translateX(-100%); } 
                100% { transform: translateX(200%); }
              }
            `}
          </style>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border-light)', borderRadius: '8px', padding: '3rem 2rem', backgroundColor: 'var(--bg-surface-hover)', transition: 'all 0.2s ease', cursor: 'pointer' }} onClick={() => document.getElementById('plan-upload').click()}>
          <input 
            id="plan-upload" 
            type="file" 
            accept=".pdf, image/jpeg, image/png, image/webp" 
            style={{ display: 'none' }} 
            onChange={handleFileChange}
          />
          <div style={{ backgroundColor: 'white', padding: '1rem', borderRadius: '50%', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', marginBottom: '1rem' }}>
            <Upload size={32} color="var(--primary-500)" />
          </div>
          <p style={{ fontWeight: '600', marginBottom: '0.5rem', fontSize: '1.125rem' }}>Seleccionar archivo o arrastrar y soltar</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Formatos aceptados: PDF, JPG, PNG, WEBP. Máx 30 MB.</p>
        </div>
      )}
    </div>
  );
};

export default PlanUploader;
