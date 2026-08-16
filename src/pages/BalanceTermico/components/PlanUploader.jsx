import React, { useState } from 'react';
import { Upload, FileImage, Loader2 } from 'lucide-react';

const PlanUploader = ({ onUpload, isAnalyzing }) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFiles = (files) => {
    if (!files || files.length === 0) return;
    
    if (files.length > 3) {
      alert('Solo puedes subir hasta 3 archivos simultáneamente.');
      return;
    }

    const validFiles = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 30 * 1024 * 1024) {
        alert(`El archivo ${file.name} supera los 30MB permitidos.`);
        return;
      }
      validFiles.push(file);
    }

    onUpload(validFiles);
  };

  const handleFileChange = (e) => {
    handleFiles(e.target.files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
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
        <div 
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: `2px dashed ${isDragOver ? 'var(--primary-500)' : 'var(--border-light)'}`, borderRadius: '8px', padding: '3rem 2rem', backgroundColor: isDragOver ? 'rgba(59, 130, 246, 0.05)' : 'var(--bg-surface-hover)', transition: 'all 0.2s ease', cursor: 'pointer' }} 
          onClick={() => document.getElementById('plan-upload').click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input 
            id="plan-upload" 
            type="file" 
            accept=".pdf, image/jpeg, image/png, image/webp" 
            style={{ display: 'none' }} 
            onChange={handleFileChange}
            multiple
          />
          <div style={{ backgroundColor: 'white', padding: '1rem', borderRadius: '50%', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', marginBottom: '1rem' }}>
            <Upload size={32} color="var(--primary-500)" />
          </div>
          <p style={{ fontWeight: '600', marginBottom: '0.5rem', fontSize: '1.125rem' }}>Seleccionar archivos o arrastrar y soltar</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Formatos aceptados: PDF, JPG, PNG, WEBP. Máx 30 MB. (Hasta 3 archivos)</p>
        </div>
      )}
    </div>
  );
};

export default PlanUploader;
