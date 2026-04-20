import React, { useState, useEffect } from 'react';
import { UserPlus, Edit2, Trash2, Shield } from 'lucide-react';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';

const TabPersonas = () => {
  const [colaboradores, setColaboradores] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [formData, setFormData] = useState({
    nombre: '',
    puesto: '',
    telefono: '',
    categoriaBase: 'Oficial',
    adicionalPct: 0
  });

  useEffect(() => {
    const q = collection(db, 'colaboradores');
    const unsub = onSnapshot(q, (snap) => {
      setColaboradores(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  const openModal = (colab = null) => {
    if (colab) {
      setEditingId(colab.id);
      setFormData({
        nombre: colab.nombre,
        puesto: colab.puesto || '',
        telefono: colab.telefono || '',
        categoriaBase: colab.categoriaBase || 'Oficial',
        adicionalPct: colab.adicionalPct || 0
      });
    } else {
      setEditingId(null);
      setFormData({ nombre: '', puesto: '', telefono: '', categoriaBase: 'Oficial', adicionalPct: 0 });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.nombre) return;
    try {
      if (editingId) {
        await updateDoc(doc(db, 'colaboradores', editingId), {
          ...formData,
          adicionalPct: parseFloat(formData.adicionalPct)
        });
      } else {
        await addDoc(collection(db, 'colaboradores'), {
          ...formData,
          adicionalPct: parseFloat(formData.adicionalPct),
          createdAt: serverTimestamp()
        });
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error(error);
      alert('Error al guardar colaborador');
    }
  };

  const handleDelete = async (id, nombre) => {
    if (window.confirm(`¿Seguro que deseas eliminar a ${nombre}?`)) {
      await deleteDoc(doc(db, 'colaboradores', id));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '1.125rem', margin: 0 }}>Colaboradores ({colaboradores.length})</h3>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Gestión de personal para liquidaciones.</p>
        </div>
        <button className="btn-primary" onClick={() => openModal()} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <UserPlus size={18} /> Nuevo Colaborador
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {colaboradores.map(c => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontWeight: '600', textTransform: 'uppercase', fontSize: '0.875rem' }}>{c.nombre}</span>
                {c.adicionalPct !== 0 && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: c.adicionalPct > 0 ? '#059669' : '#dc2626' }}>
                    {c.adicionalPct > 0 ? `+${c.adicionalPct}%` : `${c.adicionalPct}%`}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Shield size={12}/> {c.puesto || 'Sin Puesto'}</span>
                <span>📞 {c.telefono || 'Sin Tel.'}</span>
                <span>🏷 {c.categoriaBase}</span>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => openModal(c)} style={{ padding: '0.5rem', background: 'var(--bg-surface-hover)', border: 'none', borderRadius: '4px', cursor: 'pointer', color: 'var(--primary-600)' }}>
                <Edit2 size={16} />
              </button>
              <button onClick={() => handleDelete(c.id, c.nombre)} style={{ padding: '0.5rem', background: '#fee2e2', border: 'none', borderRadius: '4px', cursor: 'pointer', color: '#dc2626' }}>
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {colaboradores.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No hay colaboradores registrados.</div>
        )}
      </div>

      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
            <h3 style={{ marginTop: 0 }}>{editingId ? 'Editar Colaborador' : 'Nuevo Colaborador'}</h3>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label>Nombre y Apellido</label>
                <input required className="input-field" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Puesto (Para PDF)</label>
                <input className="input-field" placeholder="Ej: Oficial Instalador" value={formData.puesto} onChange={e => setFormData({...formData, puesto: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Teléfono</label>
                <input className="input-field" value={formData.telefono} onChange={e => setFormData({...formData, telefono: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Categoría Sindical por Defecto</label>
                <select className="input-field" value={formData.categoriaBase} onChange={e => setFormData({...formData, categoriaBase: e.target.value})}>
                  <option value="Oficial Especializado">Oficial Especializado</option>
                  <option value="Oficial">Oficial</option>
                  <option value="Medio Oficial">Medio Oficial</option>
                  <option value="Eventual">EVENTUAL</option>
                </select>
              </div>
              <div className="form-group">
                <label>Adicional o Descuento Constante (%)</label>
                <input type="number" step="0.1" className="input-field" value={formData.adicionalPct} onChange={e => setFormData({...formData, adicionalPct: e.target.value})} placeholder="Ej: 10 (para +10%) o -5" />
                <small style={{ color: 'var(--text-tertiary)', marginTop: '0.25rem', display: 'block' }}>Este % se suma al valor de la hora que se le abona.</small>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default TabPersonas;
