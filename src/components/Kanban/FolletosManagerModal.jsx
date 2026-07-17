import React, { useState } from 'react';
import { X, Upload, Trash2, FileText, Loader2 } from 'lucide-react';
import { db, storage } from '../../services/firebaseConfig';
import { collection, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

const FolletosManagerModal = ({ onClose, folletos = [] }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.type !== 'application/pdf') {
      alert('Por favor, selecciona un archivo PDF.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    const storageRef = ref(storage, `folletos/${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(Math.round(progress));
      },
      (error) => {
        console.error("Error subiendo el folleto:", error);
        alert('Error al subir el archivo.');
        setIsUploading(false);
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          // Save to Firestore
          await addDoc(collection(db, 'folletos'), {
            nombre: file.name.replace('.pdf', ''),
            url: downloadURL,
            storagePath: uploadTask.snapshot.ref.fullPath,
            createdAt: new Date().toISOString()
          });
        } catch (err) {
          console.error("Error guardando referencia en BD:", err);
          alert('Error al registrar el archivo en la base de datos.');
        } finally {
          setIsUploading(false);
          setUploadProgress(0);
        }
      }
    );
  };

  const handleDelete = async (folleto) => {
    if (!window.confirm(`¿Seguro que deseas eliminar el folleto "${folleto.descripcion}"?`)) return;
    try {
      if (folleto.storagePath) {
        const fileRef = ref(storage, folleto.storagePath);
        await deleteObject(fileRef).catch(e => console.warn('Archivo no encontrado en storage, continuando...', e));
      }
      await deleteDoc(doc(db, 'folletos', folleto.id));
    } catch (err) {
      console.error(err);
      alert('Error eliminando el folleto: ' + err.message);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
      <div className="card" style={{ width: '500px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: '1rem', overflow: 'hidden' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-light)', backgroundColor: '#f8fafc' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', color: '#0f172a' }}>
            <FileText size={20} color="#0369a1"/> Administrar Folletos Generales
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}><X size={20}/></button>
        </div>

        {/* Upload Button */}
        <div style={{ padding: '0 1.5rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', border: '2px dashed #bae6fd', borderRadius: '8px', backgroundColor: '#f0f9ff', cursor: isUploading ? 'not-allowed' : 'pointer', transition: 'all 0.2s', opacity: isUploading ? 0.7 : 1 }}>
            {isUploading ? (
              <>
                <Loader2 size={28} color="#0284c7" className="spinner" style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ marginTop: '0.75rem', fontWeight: '600', color: '#0369a1' }}>Subiendo... {uploadProgress}%</span>
              </>
            ) : (
              <>
                <Upload size={28} color="#0284c7" />
                <span style={{ marginTop: '0.75rem', fontWeight: '600', color: '#0369a1' }}>Subir Folleto (PDF)</span>
                <span style={{ fontSize: '0.75rem', color: '#0ea5e9', marginTop: '0.25rem' }}>Haz clic aquí para seleccionar un archivo desde tu PC</span>
              </>
            )}
            <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={handleFileUpload} disabled={isUploading} />
          </label>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 1.5rem 1.5rem' }}>
          <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Folletos Disponibles ({folletos.length})</h4>
          
          {folletos.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.875rem', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              No hay folletos subidos.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {folletos.map(f => (
                <div key={f.folletoUrl} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', border: '1px solid var(--border-light)', borderRadius: '8px', backgroundColor: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                    <FileText size={16} color="#64748b" style={{ flexShrink: 0 }} />
                    <a href={f.folletoUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.875rem', color: 'var(--primary-600)', fontWeight: '600', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.descripcion}>
                      {f.descripcion}
                    </a>
                  </div>
                  {f.isCustom ? (
                  <button 
                    onClick={() => handleDelete(f)}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.25rem', flexShrink: 0 }}
                    title="Eliminar folleto"
                  >
                    <Trash2 size={16} />
                  </button>
                  ) : (
                    <span style={{ fontSize:'0.7rem', backgroundColor:'#e2e8f0', color:'#475569', padding:'0.2rem 0.5rem', borderRadius:'12px', fontWeight:'600' }} title="Este folleto proviene automáticamente de los artículos de la lista de precios">Sistema</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default FolletosManagerModal;
