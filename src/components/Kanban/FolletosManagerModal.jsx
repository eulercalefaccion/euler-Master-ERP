import React, { useState, useMemo } from 'react';
import { X, Upload, Trash2, FileText, Loader2, Edit2, Check, Eye, ExternalLink, Download, Search } from 'lucide-react';
import { db, storage } from '../../services/firebaseConfig';
import { collection, addDoc, deleteDoc, doc, updateDoc, setDoc, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

const FolletosManagerModal = ({ onClose, folletos = [], folletosConfig = { deletedUrls: [], renamedUrls: {} } }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingFolletoId, setEditingFolletoId] = useState(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [previewFolleto, setPreviewFolleto] = useState(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  const filteredFolletos = useMemo(() => {
    if (!searchQuery.trim()) return folletos;
    const q = searchQuery.toLowerCase();
    return folletos.filter(f => (f.descripcion || '').toLowerCase().includes(q));
  }, [folletos, searchQuery]);

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
        alert('Error al subir el archivo: ' + error.message);
        setIsUploading(false);
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
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

  const handleStartRename = (folleto) => {
    setEditingFolletoId(folleto.folletoUrl);
    setEditNameValue(folleto.descripcion);
  };

  const handleSaveRename = async (folleto) => {
    const trimmed = editNameValue.trim();
    if (!trimmed) {
      alert('El nombre del folleto no puede estar vacío.');
      return;
    }
    setIsActionLoading(true);
    try {
      if (folleto.isCustom && folleto.id) {
        await updateDoc(doc(db, 'folletos', folleto.id), { nombre: trimmed });
      }
      
      const currentRenamed = { ...(folletosConfig?.renamedUrls || {}) };
      currentRenamed[folleto.folletoUrl] = trimmed;
      await setDoc(doc(db, 'folletos', '_config'), {
        renamedUrls: currentRenamed
      }, { merge: true });

      setEditingFolletoId(null);
    } catch (err) {
      console.error("Error renombrando folleto:", err);
      alert("Error al renombrar el folleto: " + err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDelete = async (folleto) => {
    if (!window.confirm(`¿Seguro que deseas eliminar el folleto "${folleto.descripcion}"?\n\nYa no estará disponible en el cotizador.`)) return;
    setIsActionLoading(true);
    try {
      if (folleto.isCustom) {
        if (folleto.storagePath) {
          const fileRef = ref(storage, folleto.storagePath);
          await deleteObject(fileRef).catch(e => console.warn('Archivo no encontrado en storage, continuando...', e));
        }
        if (folleto.id) {
          await deleteDoc(doc(db, 'folletos', folleto.id));
        }
      }
      
      await setDoc(doc(db, 'folletos', '_config'), {
        deletedUrls: arrayUnion(folleto.folletoUrl)
      }, { merge: true });

      if (previewFolleto && previewFolleto.folletoUrl === folleto.folletoUrl) {
        setPreviewFolleto(null);
      }
    } catch (err) {
      console.error("Error eliminando folleto:", err);
      alert('Error eliminando el folleto: ' + err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
        <div className="card" style={{ width: '560px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', gap: '1rem', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>
          
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-light)', backgroundColor: '#f8fafc' }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', color: '#0f172a' }}>
              <FileText size={20} color="#0369a1"/> Administrar Folletos Generales
            </h3>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '0.25rem' }}>
              <X size={20}/>
            </button>
          </div>

          {/* Upload Button */}
          <div style={{ padding: '0 1.5rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', border: '2px dashed #bae6fd', borderRadius: '8px', backgroundColor: '#f0f9ff', cursor: isUploading ? 'not-allowed' : 'pointer', transition: 'all 0.2s', opacity: isUploading ? 0.7 : 1 }}>
              {isUploading ? (
                <>
                  <Loader2 size={28} color="#0284c7" className="spinner" style={{ animation: 'spin 1s linear infinite' }} />
                  <span style={{ marginTop: '0.5rem', fontWeight: '600', color: '#0369a1', fontSize: '0.9rem' }}>Subiendo folleto... {uploadProgress}%</span>
                </>
              ) : (
                <>
                  <Upload size={26} color="#0284c7" />
                  <span style={{ marginTop: '0.5rem', fontWeight: '600', color: '#0369a1', fontSize: '0.9rem' }}>Subir Nuevo Folleto (PDF)</span>
                  <span style={{ fontSize: '0.75rem', color: '#0ea5e9', marginTop: '0.2rem' }}>Haz clic aquí para seleccionar un archivo desde tu PC</span>
                </>
              )}
              <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={handleFileUpload} disabled={isUploading} />
            </label>
          </div>

          {/* Search & List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 1.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
              <h4 style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.825rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Folletos Disponibles ({filteredFolletos.length})
              </h4>
              <div style={{ position: 'relative', width: '200px' }}>
                <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Buscar folleto..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ width: '100%', padding: '0.35rem 0.5rem 0.35rem 1.75rem', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none' }}
                />
              </div>
            </div>
            
            {filteredFolletos.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.875rem', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                {searchQuery ? 'No se encontraron folletos que coincidan con la búsqueda.' : 'No hay folletos disponibles.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {filteredFolletos.map(f => {
                  const isEditing = editingFolletoId === f.folletoUrl;

                  return (
                    <div 
                      key={f.folletoUrl} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between', 
                        padding: '0.65rem 0.75rem', 
                        border: isEditing ? '1px solid #0284c7' : '1px solid #e2e8f0', 
                        borderRadius: '8px', 
                        backgroundColor: isEditing ? '#f0f9ff' : '#fff',
                        transition: 'all 0.15s ease',
                        gap: '0.5rem'
                      }}
                    >
                      {/* Left: icon and name / input */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: 0 }}>
                        <FileText size={18} color="#0284c7" style={{ flexShrink: 0 }} />
                        
                        {isEditing ? (
                          <input
                            type="text"
                            value={editNameValue}
                            onChange={e => setEditNameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSaveRename(f);
                              if (e.key === 'Escape') setEditingFolletoId(null);
                            }}
                            autoFocus
                            disabled={isActionLoading}
                            style={{ 
                              flex: 1, 
                              padding: '0.3rem 0.5rem', 
                              fontSize: '0.85rem', 
                              fontWeight: '600', 
                              borderRadius: '4px', 
                              border: '1px solid #0284c7', 
                              outline: 'none',
                              backgroundColor: '#fff'
                            }}
                          />
                        ) : (
                          <div 
                            onClick={() => setPreviewFolleto(f)}
                            title="Haz clic para previsualizar este folleto"
                            style={{ 
                              fontSize: '0.875rem', 
                              color: '#1e293b', 
                              fontWeight: '600', 
                              cursor: 'pointer', 
                              whiteSpace: 'nowrap', 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis',
                              flex: 1
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = '#0284c7'}
                            onMouseLeave={e => e.currentTarget.style.color = '#1e293b'}
                          >
                            {f.descripcion}
                          </div>
                        )}
                      </div>

                      {/* Right: Actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => handleSaveRename(f)}
                              disabled={isActionLoading}
                              title="Guardar nuevo nombre (Enter)"
                              style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: '6px', color: '#15803d', cursor: 'pointer', padding: '0.35rem 0.5rem', display: 'flex', alignItems: 'center' }}
                            >
                              <Check size={15} />
                            </button>
                            <button
                              onClick={() => setEditingFolletoId(null)}
                              disabled={isActionLoading}
                              title="Cancelar (Esc)"
                              style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#64748b', cursor: 'pointer', padding: '0.35rem 0.5rem', display: 'flex', alignItems: 'center' }}
                            >
                              <X size={15} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => setPreviewFolleto(f)}
                              title="Ver folleto"
                              style={{ background: 'none', border: 'none', color: '#0284c7', cursor: 'pointer', padding: '0.35rem', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
                              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e0f2fe'}
                              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                              <Eye size={16} />
                            </button>
                            <button
                              onClick={() => handleStartRename(f)}
                              title="Modificar nombre"
                              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '0.35rem', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
                              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                              <Edit2 size={15} />
                            </button>
                            <button 
                              onClick={() => handleDelete(f)}
                              disabled={isActionLoading}
                              title="Eliminar folleto"
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.35rem', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
                              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fee2e2'}
                              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
        <style>{`
          @keyframes spin { 100% { transform: rotate(360deg); } }
        `}</style>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────
          MODAL: Visualizador / Previsualización de Folleto (PDF)
      ────────────────────────────────────────────────────────────────────── */}
      {previewFolleto && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3200 }}>
          <div className="card" style={{ width: '88vw', maxWidth: '1000px', height: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0, boxShadow: '0 25px 50px rgba(0,0,0,0.4)' }}>
            
            {/* Header del visualizador */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border-light)', backgroundColor: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', overflow: 'hidden' }}>
                <FileText size={20} color="#0369a1" style={{ flexShrink: 0 }} />
                <span style={{ fontWeight: '700', fontSize: '1rem', color: '#0f172a', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {previewFolleto.descripcion}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                <a
                  href={previewFolleto.folletoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', color: '#0369a1', fontSize: '0.8rem', fontWeight: '600', textDecoration: 'none' }}
                  title="Abrir en visor del navegador"
                >
                  <ExternalLink size={14} /> Abrir en nueva pestaña
                </a>
                <button
                  onClick={() => setPreviewFolleto(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '0.35rem', display: 'flex', alignItems: 'center' }}
                  title="Cerrar visor"
                >
                  <X size={22} />
                </button>
              </div>
            </div>

            {/* Cuerpo del visor (iFrame del PDF) */}
            <div style={{ flex: 1, backgroundColor: '#525659', position: 'relative' }}>
              <iframe
                src={previewFolleto.folletoUrl}
                title={previewFolleto.descripcion}
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
            </div>

          </div>
        </div>
      )}
    </>
  );
};

export default FolletosManagerModal;
