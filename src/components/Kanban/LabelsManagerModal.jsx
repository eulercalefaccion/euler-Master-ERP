import React, { useState, useEffect } from 'react';
import { X, Save, Edit2, Trash2, Plus, Tag } from 'lucide-react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';

const DEFAULT_COLORS = [
  '#4ade80', '#facc15', '#a16207', '#b91c1c', '#a78bfa', '#60a5fa', '#f472b6', '#cbd5e1'
];

const LabelsManagerModal = ({ isOpen, onClose }) => {
  const [labels, setLabels] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', color: DEFAULT_COLORS[0] });
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = onSnapshot(collection(db, 'crmLabels'), (snap) => {
      setLabels(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveNew = async () => {
    if (!editForm.name.trim()) return;
    setIsLoading(true);
    try {
      await addDoc(collection(db, 'crmLabels'), {
        name: editForm.name.toUpperCase(),
        color: editForm.color
      });
      setIsCreating(false);
      setEditForm({ name: '', color: DEFAULT_COLORS[0] });
    } catch (e) {
      console.error(e);
      alert("Error al crear la etiqueta");
    }
    setIsLoading(false);
  };

  const handleSaveEdit = async () => {
    if (!editForm.name.trim() || !editingId) return;
    setIsLoading(true);
    try {
      await updateDoc(doc(db, 'crmLabels', editingId), {
        name: editForm.name.toUpperCase(),
        color: editForm.color
      });
      setEditingId(null);
      setEditForm({ name: '', color: DEFAULT_COLORS[0] });
    } catch (e) {
      console.error(e);
      alert("Error al actualizar la etiqueta");
    }
    setIsLoading(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Seguro que deseas eliminar esta etiqueta? Se quitará de todos los presupuestos asociados.')) return;
    try {
      await deleteDoc(doc(db, 'crmLabels', id));
    } catch (e) {
      console.error(e);
      alert("Error al eliminar");
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-primary)',
        width: '90%', maxWidth: '450px',
        borderRadius: '12px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column',
        maxHeight: '90vh'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Tag size={20} color="var(--primary-600)" />
            Administrar Etiquetas
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {labels.length === 0 && !isCreating && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem 0' }}>
              No hay etiquetas creadas aún.
            </div>
          )}

          {labels.map(label => (
            <div key={label.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {editingId === label.id ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--bg-surface-hover)', padding: '0.75rem', borderRadius: '8px' }}>
                  <input
                    className="input-field"
                    value={editForm.name}
                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="Nombre de etiqueta..."
                  />
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                    {DEFAULT_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setEditForm({ ...editForm, color: c })}
                        style={{ width: '24px', height: '24px', borderRadius: '4px', backgroundColor: c, border: editForm.color === c ? '2px solid var(--text-primary)' : '1px solid rgba(0,0,0,0.1)', cursor: 'pointer' }}
                      />
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                    <button className="btn btn-secondary" onClick={() => setEditingId(null)}>Cancelar</button>
                    <button className="btn btn-primary" onClick={handleSaveEdit} disabled={isLoading}>Guardar</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ 
                    flex: 1, 
                    backgroundColor: label.color, 
                    color: 'white', 
                    padding: '0.35rem 0.75rem', 
                    borderRadius: '4px',
                    fontWeight: '600',
                    fontSize: '0.85rem',
                    letterSpacing: '0.5px'
                  }}>
                    {label.name}
                  </div>
                  <button onClick={() => { setEditingId(label.id); setEditForm({ name: label.name, color: label.color }); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.25rem' }}>
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(label.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '0.25rem' }}>
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          ))}

          {!isCreating && !editingId && (
            <button
              onClick={() => { setIsCreating(true); setEditForm({ name: '', color: DEFAULT_COLORS[0] }); }}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%', marginTop: '0.5rem' }}
            >
              <Plus size={16} /> Crear una etiqueta nueva
            </button>
          )}

          {isCreating && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--bg-surface-hover)', padding: '1rem', borderRadius: '8px', marginTop: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Nueva Etiqueta</span>
              <input
                className="input-field"
                value={editForm.name}
                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Nombre (ej: FINALIZADO)..."
                autoFocus
              />
              <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                {DEFAULT_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setEditForm({ ...editForm, color: c })}
                    style={{ width: '24px', height: '24px', borderRadius: '4px', backgroundColor: c, border: editForm.color === c ? '2px solid var(--text-primary)' : '1px solid rgba(0,0,0,0.1)', cursor: 'pointer' }}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button className="btn btn-secondary" onClick={() => setIsCreating(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={handleSaveNew} disabled={isLoading}>Guardar</button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default LabelsManagerModal;
