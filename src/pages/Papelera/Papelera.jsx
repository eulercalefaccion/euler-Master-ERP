import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';
import { Trash2, RotateCcw } from 'lucide-react';

const Papelera = () => {
  const [activeTab, setActiveTab] = useState('obras');
  const [obras, setObras] = useState([]);
  const [presupuestos, setPresupuestos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Escuchar obras eliminadas
    const qObras = query(collection(db, 'obras'), where('deleted', '==', true));
    const unsubObras = onSnapshot(qObras, (snap) => {
      setObras(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Escuchar presupuestos eliminados
    const qPresupuestos = query(collection(db, 'presupuestos'), where('deleted', '==', true));
    const unsubPresupuestos = onSnapshot(qPresupuestos, (snap) => {
      setPresupuestos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => {
      unsubObras();
      unsubPresupuestos();
    };
  }, []);

  const handleRestore = async (id, type) => {
    if (!window.confirm('¿Seguro que deseas restaurar este elemento? Volverá a su pantalla original.')) return;
    try {
      await updateDoc(doc(db, type, id), { deleted: false });
    } catch (err) {
      alert('Error al restaurar: ' + err.message);
    }
  };

  const handlePermanentDelete = async (id, type) => {
    if (!window.confirm('¡ATENCIÓN! Esta acción es irreversible. ¿Eliminar definitivamente?')) return;
    try {
      await deleteDoc(doc(db, type, id));
    } catch (err) {
      alert('Error al eliminar: ' + err.message);
    }
  };

  if (loading) return <div style={{ padding: '2rem' }}>Cargando papelera...</div>;

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: '700', color: '#0f172a', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Trash2 size={28} color="#ef4444" />
          Papelera de Reciclaje
        </h1>
        <p style={{ color: '#64748b', margin: 0 }}>
          Los elementos eliminados se guardan aquí. Podés restaurarlos o eliminarlos permanentemente.
        </p>
      </header>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
        <button
          onClick={() => setActiveTab('obras')}
          style={{
            padding: '0.5rem 1.5rem',
            borderRadius: '6px',
            border: 'none',
            background: activeTab === 'obras' ? '#3b82f6' : 'transparent',
            color: activeTab === 'obras' ? 'white' : '#64748b',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Obras ({obras.length})
        </button>
        <button
          onClick={() => setActiveTab('presupuestos')}
          style={{
            padding: '0.5rem 1.5rem',
            borderRadius: '6px',
            border: 'none',
            background: activeTab === 'presupuestos' ? '#3b82f6' : 'transparent',
            color: activeTab === 'presupuestos' ? 'white' : '#64748b',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Presupuestos ({presupuestos.length})
        </button>
      </div>

      {/* Content */}
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {activeTab === 'obras' && (
          obras.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>No hay obras en la papelera.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', color: '#475569' }}>Obra</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', color: '#475569' }}>Cliente</th>
                  <th style={{ padding: '1rem', textAlign: 'right', fontSize: '0.875rem', color: '#475569' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {obras.map(obra => (
                  <tr key={obra.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '1rem', fontWeight: '500' }}>{obra.name}</td>
                    <td style={{ padding: '1rem', color: '#64748b' }}>{obra.clientName}</td>
                    <td style={{ padding: '1rem', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                      <button 
                        onClick={() => handleRestore(obra.id, 'obras')}
                        style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem' }}
                      >
                        <RotateCcw size={14} /> Restaurar
                      </button>
                      <button 
                        onClick={() => handlePermanentDelete(obra.id, 'obras')}
                        style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: 'none', background: '#fee2e2', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem' }}
                      >
                        <Trash2 size={14} /> Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {activeTab === 'presupuestos' && (
          presupuestos.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>No hay presupuestos en la papelera.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', color: '#475569' }}>Cliente / Nombre</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', color: '#475569' }}>Total</th>
                  <th style={{ padding: '1rem', textAlign: 'right', fontSize: '0.875rem', color: '#475569' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {presupuestos.map(pres => (
                  <tr key={pres.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '1rem', fontWeight: '500' }}>{pres.clientName || pres.nombre}</td>
                    <td style={{ padding: '1rem', color: '#64748b' }}>${Number(pres.totalPrice || 0).toLocaleString()}</td>
                    <td style={{ padding: '1rem', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                      <button 
                        onClick={() => handleRestore(pres.id, 'presupuestos')}
                        style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem' }}
                      >
                        <RotateCcw size={14} /> Restaurar
                      </button>
                      <button 
                        onClick={() => handlePermanentDelete(pres.id, 'presupuestos')}
                        style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: 'none', background: '#fee2e2', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem' }}
                      >
                        <Trash2 size={14} /> Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
};

export default Papelera;
