import React, { useState, useEffect } from 'react';
import { HardHat, Search, Plus, MapPin, User, Thermometer, X, Save, Edit2, ChevronRight } from 'lucide-react';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot, query, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';

const Obras = () => {
  const [obras, setObras] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPhase, setFilterPhase] = useState('Todas');

  // Detail/Edit panel
  const [selectedObra, setSelectedObra] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [newBitacora, setNewBitacora] = useState('');

  // Modal nueva obra
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newObra, setNewObra] = useState({
    name: '', location: '', clientName: '', system: 'Radiadores',
    phase: 'Obra', estado: 'Pendiente de Inicio', operarios: '', progress: 0
  });

  const phases = ['Todas', 'Obra', 'Instalación', 'Finalizada'];
  const estados = ['Pendiente de Inicio', 'En Proceso', 'Finalizada', 'Instalación Pendiente', 'Instalación en Proceso', 'Instalación Finalizada'];
  const sistemas = ['Radiadores', 'Piso Radiante', 'SSTT Caldera', 'Híbrido'];

  useEffect(() => {
    const qObras = query(collection(db, 'obras'));
    const unsubObras = onSnapshot(qObras, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setObras(data);
      // Update selected if open
      if (selectedObra) {
        const updated = data.find(o => o.id === selectedObra.id);
        if (updated) {
          setSelectedObra(updated);
          setEditForm({ ...updated });
        }
      }
    });
    return () => unsubObras();
  }, []);

  const filteredObras = obras.filter(obra => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = (obra.name && obra.name.toLowerCase().includes(term)) ||
                          (obra.clientName && obra.clientName.toLowerCase().includes(term));
    if (filterPhase === 'Todas') return matchesSearch;
    if (filterPhase === 'Finalizada') return matchesSearch && (obra.estado === 'Instalación Finalizada' || obra.estado === 'Finalizada');
    return matchesSearch && obra.phase === filterPhase;
  });

  const getStatusBadge = (estado) => {
    const colors = {
      'Pendiente de Inicio': { bg: '#f1f5f9', color: '#475569' },
      'En Proceso': { bg: '#dbeafe', color: '#1d4ed8' },
      'Finalizada': { bg: '#d1fae5', color: '#059669' },
      'Instalación Pendiente': { bg: '#fef3c7', color: '#d97706' },
      'Instalación en Proceso': { bg: '#dbeafe', color: '#1d4ed8' },
      'Instalación Finalizada': { bg: '#d1fae5', color: '#059669' },
    };
    const c = colors[estado] || colors['Pendiente de Inicio'];
    return <span className="badge" style={{ backgroundColor: c.bg, color: c.color, fontWeight: '600' }}>{estado}</span>;
  };

  const openDetail = (obra) => {
    setSelectedObra(obra);
    setEditForm({ ...obra });
    setNewBitacora('');
  };

  const handleSaveEdit = async () => {
    if (!selectedObra) return;
    setIsSaving(true);
    try {
      const updates = {
        name: editForm.name || '',
        location: editForm.location || '',
        clientName: editForm.clientName || '',
        system: editForm.system || '',
        phase: editForm.phase || 'Obra',
        estado: editForm.estado || 'Pendiente de Inicio',
        operarios: editForm.operarios || '',
        progress: parseInt(editForm.progress) || 0,
      };
      if (newBitacora.trim()) {
        updates.bitacoraPreview = newBitacora.trim();
        const existing = editForm.bitacoraHistory || [];
        updates.bitacoraHistory = [
          { texto: newBitacora.trim(), fecha: new Date().toISOString() },
          ...existing
        ];
      }
      await updateDoc(doc(db, 'obras', selectedObra.id), updates);
      setNewBitacora('');
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setIsSaving(false);
  };

  const handleCreateObra = async () => {
    if (!newObra.name) { alert('Nombre es requerido'); return; }
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'obras'), {
        ...newObra,
        progress: parseInt(newObra.progress) || 0,
        bitacoraPreview: 'Obra creada manualmente.',
        bitacoraHistory: [{ texto: 'Obra creada manualmente.', fecha: new Date().toISOString() }],
        createdAt: serverTimestamp()
      });
      setIsNewModalOpen(false);
      setNewObra({ name: '', location: '', clientName: '', system: 'Radiadores', phase: 'Obra', estado: 'Pendiente de Inicio', operarios: '', progress: 0 });
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setIsSaving(false);
  };

  const inp = { width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--border-strong)', borderRadius: '8px', fontSize: '0.875rem', outline: 'none' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0 }}>Gestión de Obras</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            {obras.length} obras • {obras.filter(o => o.estado === 'En Proceso' || o.estado === 'Instalación en Proceso').length} en curso
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsNewModalOpen(true)}>
          <Plus size={18} /> Nueva Obra
        </button>
      </div>

      {/* Toolbar */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flexGrow: 1, maxWidth: '400px' }}>
          <Search size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input type="text" placeholder="Buscar por nombre de obra o cliente..." className="input-field" style={{ paddingLeft: '2.5rem' }} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {phases.map(fase => (
            <button key={fase} onClick={() => setFilterPhase(fase)} className={filterPhase === fase ? 'btn btn-primary' : 'btn btn-secondary'} style={{ padding: '0.35rem 0.75rem', fontSize: '0.875rem' }}>
              {fase}
            </button>
          ))}
        </div>
      </div>

      {/* Grid de Tarjetas */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem', paddingBottom: '2rem' }}>
        {filteredObras.map(obra => (
          <div key={obra.id} className="card hover-card" onClick={() => openDetail(obra)} style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', cursor: 'pointer' }}>
            <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface-hover)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: '600', margin: 0, paddingRight: '1rem' }}>{obra.name}</h3>
                {getStatusBadge(obra.estado)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                <MapPin size={14} /> {obra.location || 'Sin ubicación'}
              </div>
            </div>
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: '600' }}>Cliente</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem', fontWeight: '500' }}>
                    <User size={14} color="var(--primary-600)" /> {obra.clientName || 'No asignado'}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: '600' }}>Operarios</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem' }}>
                    <HardHat size={14} color="var(--accent-600)" /> {obra.operarios || 'Sin asignar'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: 'var(--bg-primary)', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                <Thermometer size={16} color="var(--warning)" />
                <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>{obra.system || 'S/D'}</span>
              </div>
            </div>
            <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border-light)', backgroundColor: '#fafafa' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                <span>Progreso ({obra.phase})</span>
                <span style={{ fontWeight: '600' }}>{obra.progress || 0}%</span>
              </div>
              <div style={{ width: '100%', backgroundColor: 'var(--border-light)', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${obra.progress || 0}%`, backgroundColor: obra.phase === 'Obra' ? 'var(--primary-500)' : 'var(--success)', height: '100%', transition: 'width 0.3s' }}></div>
              </div>
            </div>
          </div>
        ))}
        {filteredObras.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', gridColumn: '1 / -1' }}>
            No hay obras para mostrar.
          </div>
        )}
      </div>

      {/* Panel de Detalle */}
      {selectedObra && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 40 }} onClick={() => setSelectedObra(null)} />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: '550px',
            backgroundColor: 'var(--bg-primary)', boxShadow: '-5px 0 25px rgba(0,0,0,0.15)', zIndex: 50,
            display: 'flex', flexDirection: 'column', animation: 'slideIn 0.25s ease'
          }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-hover)' }}>
              <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <HardHat color="var(--primary-600)" size={20} /> Detalle de Obra
              </h3>
              <button onClick={() => setSelectedObra(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '0.25rem' }}>
                <X size={22} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nombre de la Obra <span style={{ color: 'var(--accent-600)' }}>*</span></label>
                <input type="text" style={inp} value={editForm.name || ''} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Cliente</label>
                  <input type="text" style={inp} value={editForm.clientName || ''} onChange={e => setEditForm({ ...editForm, clientName: e.target.value })} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Ubicación</label>
                  <input type="text" style={inp} value={editForm.location || ''} onChange={e => setEditForm({ ...editForm, location: e.target.value })} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Sistema</label>
                  <select style={inp} value={editForm.system || ''} onChange={e => setEditForm({ ...editForm, system: e.target.value })}>
                    {sistemas.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Operarios asignados</label>
                  <input type="text" style={inp} placeholder="Nombres separados por coma" value={editForm.operarios || ''} onChange={e => setEditForm({ ...editForm, operarios: e.target.value })} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Fase</label>
                  <select style={inp} value={editForm.phase || 'Obra'} onChange={e => setEditForm({ ...editForm, phase: e.target.value })}>
                    <option value="Obra">Obra</option>
                    <option value="Instalación">Instalación</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Estado</label>
                  <select style={inp} value={editForm.estado || ''} onChange={e => setEditForm({ ...editForm, estado: e.target.value })}>
                    {estados.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Progreso %</label>
                  <input type="number" min="0" max="100" style={inp} value={editForm.progress || 0} onChange={e => setEditForm({ ...editForm, progress: e.target.value })} />
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ background: 'var(--bg-surface)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '6px' }}>
                  <span style={{ fontWeight: '600' }}>Progreso: {editForm.progress || 0}%</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{editForm.phase}</span>
                </div>
                <div style={{ width: '100%', background: 'var(--border-light)', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${editForm.progress || 0}%`, height: '100%', background: 'var(--primary-500)', borderRadius: '4px', transition: 'width 0.3s' }} />
                </div>
              </div>

              {/* Bitácora */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nueva anotación (Bitácora)</label>
                <textarea style={{ ...inp, minHeight: '70px', resize: 'vertical' }} value={newBitacora} onChange={e => setNewBitacora(e.target.value)} placeholder="Escribe una novedad, avance o problema..." />
              </div>

              {/* Bitácora histórica */}
              {editForm.bitacoraHistory && editForm.bitacoraHistory.length > 0 && (
                <div style={{ border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ padding: '0.75rem 1rem', background: 'var(--bg-surface-hover)', fontWeight: '600', fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Historial de Bitácora
                  </div>
                  {editForm.bitacoraHistory.slice(0, 10).map((entry, i) => (
                    <div key={i} style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border-light)', fontSize: '0.875rem' }}>
                      <div style={{ color: 'var(--text-primary)', marginBottom: '2px' }}>{entry.texto}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{new Date(entry.fecha).toLocaleString('es-AR')}</div>
                    </div>
                  ))}
                </div>
              )}

              {!editForm.bitacoraHistory && editForm.bitacoraPreview && (
                <div style={{ padding: '0.75rem 1rem', background: '#f9fafb', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.875rem', fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                  "{editForm.bitacoraPreview}"
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', backgroundColor: '#f8fafc' }}>
              <button className="btn btn-secondary" onClick={() => setSelectedObra(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSaveEdit} disabled={isSaving} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Save size={16} /> {isSaving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Modal Nueva Obra */}
      {isNewModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '500px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Nueva Obra</h3>
              <button onClick={() => setIsNewModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}><X size={20} /></button>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Nombre de la Obra <span style={{ color: 'var(--accent-600)' }}>*</span></label>
              <input required type="text" className="input-field" value={newObra.name} onChange={e => setNewObra({ ...newObra, name: e.target.value })} placeholder="Ej: Dpto Pellegrini 1500" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Cliente / Dueño</label>
                <input type="text" className="input-field" value={newObra.clientName} onChange={e => setNewObra({ ...newObra, clientName: e.target.value })} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Ubicación</label>
                <input type="text" className="input-field" value={newObra.location} onChange={e => setNewObra({ ...newObra, location: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Sistema</label>
                <select className="input-field" value={newObra.system} onChange={e => setNewObra({ ...newObra, system: e.target.value })}>
                  {sistemas.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Operarios</label>
                <input type="text" className="input-field" value={newObra.operarios} onChange={e => setNewObra({ ...newObra, operarios: e.target.value })} placeholder="Nombres separados por coma" />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setIsNewModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleCreateObra} disabled={isSaving}>
                <Save size={16} /> {isSaving ? 'Creando...' : 'Crear Obra'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .hover-card { transition: transform 0.2s, box-shadow 0.2s; }
        .hover-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-md); }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </div>
  );
};

export default Obras;
