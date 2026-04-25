/**
 * Personas — Vista unificada de Colaboradores (ERP) + Empleados (Jornadas)
 * Lee de ambos Firebase simultáneamente
 */
import React, { useState, useEffect } from 'react';
import { UserPlus, Edit2, Trash2, Shield, Clock, MapPin, Search } from 'lucide-react';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useJornadas } from '../../context/JornadasContext';

const Personas = () => {
  // Colaboradores del ERP (euler-master-erp)
  const [colaboradores, setColaboradores] = useState([]);
  // Empleados de Jornadas (eulerjornadas)
  const { empleados, empleadosActivos, jornadas, updateEmpleado: updateEmpleadoJornadas } = useJornadas();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editSource, setEditSource] = useState(null); // 'erp' or 'jornadas'
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('todos');

  const [formData, setFormData] = useState({
    nombre: '', apellido: '', puesto: '', telefono: '', dni: '',
    categoriaBase: 'Oficial', adicionalPct: 0, rol: 'empleado'
  });

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'colaboradores'), (snap) => {
      setColaboradores(snap.docs.map(d => ({ id: d.id, ...d.data(), _source: 'erp' })));
    });
    return () => unsub();
  }, []);

  const hoyStr = new Date().toISOString().slice(0, 10);

  // Merge both lists
  const empleadosJornadas = empleados
    .filter(e => e.activo !== false)
    .map(e => ({
      ...e, _source: 'jornadas',
      nombre: `${e.nombre} ${e.apellido || ''}`.trim(),
      _estadoHoy: (() => {
        const jHoy = jornadas.filter(j => j.empleadoId === e.id && j.fechaIngreso === hoyStr);
        const abierta = jHoy.find(j => j.estado === 'abierta');
        if (abierta) return 'activo';
        const cerrada = jHoy.find(j => j.estado === 'cerrada');
        if (cerrada) return 'cerrada';
        return 'ausente';
      })()
    }));

  const todosUnificados = [...empleadosJornadas, ...colaboradores];

  const filtered = todosUnificados.filter(p => {
    const matchSearch = !searchQuery || p.nombre?.toLowerCase().includes(searchQuery.toLowerCase()) || p.dni?.includes(searchQuery);
    if (activeTab === 'jornadas') return matchSearch && p._source === 'jornadas';
    if (activeTab === 'erp') return matchSearch && p._source === 'erp';
    return matchSearch;
  });

  const openModal = (person = null) => {
    if (person) {
      setEditingId(person.id);
      setEditSource(person._source);
      setFormData({
        nombre: person._source === 'jornadas' ? (person.nombre?.split(' ')[0] || '') : (person.nombre || ''),
        apellido: person.apellido || '',
        puesto: person.puesto || '',
        telefono: person.telefono || '',
        dni: person.dni || '',
        categoriaBase: person.categoriaBase || 'Oficial',
        adicionalPct: person.adicionalPct || 0,
        rol: person.rol || 'empleado',
      });
    } else {
      setEditingId(null);
      setEditSource('erp');
      setFormData({ nombre: '', apellido: '', puesto: '', telefono: '', dni: '', categoriaBase: 'Oficial', adicionalPct: 0, rol: 'empleado' });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.nombre) return;
    try {
      if (editSource === 'jornadas' && editingId) {
        await updateEmpleadoJornadas(editingId, {
          nombre: formData.nombre, apellido: formData.apellido,
          telefono: formData.telefono, dni: formData.dni, rol: formData.rol,
        });
      } else if (editingId) {
        await updateDoc(doc(db, 'colaboradores', editingId), {
          ...formData, adicionalPct: parseFloat(formData.adicionalPct)
        });
      } else {
        await addDoc(collection(db, 'colaboradores'), {
          ...formData, adicionalPct: parseFloat(formData.adicionalPct), createdAt: serverTimestamp()
        });
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error(error);
      alert('Error al guardar');
    }
  };

  const handleDelete = async (id, nombre, source) => {
    if (!window.confirm(`¿Eliminar a ${nombre}?`)) return;
    if (source === 'erp') {
      await deleteDoc(doc(db, 'colaboradores', id));
    }
    // Jornadas employees: soft delete handled elsewhere
  };

  const estadoColors = { activo: '#10b981', cerrada: '#3b82f6', ausente: '#6b7280' };
  const estadoLabels = { activo: 'En jornada', cerrada: 'Salió', ausente: 'Ausente' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0 }}>Personas</h2>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            {todosUnificados.length} personas ({empleadosJornadas.length} de Jornadas + {colaboradores.length} de ERP)
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => openModal()} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <UserPlus size={18} /> Nuevo
        </button>
      </div>

      {/* Search + Tabs */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '250px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input className="input-field" placeholder="Buscar por nombre o DNI..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '36px', width: '100%' }} />
        </div>
        <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-surface)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
          {[{ key: 'todos', label: 'Todos' }, { key: 'jornadas', label: '🔨 Jornadas' }, { key: 'erp', label: '📋 ERP' }].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
              padding: '6px 14px', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer',
              background: activeTab === t.key ? 'var(--primary-500)' : 'transparent',
              color: activeTab === t.key ? 'white' : 'var(--text-secondary)',
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-surface-hover)', borderBottom: '1px solid var(--border-light)' }}>
              <th style={thStyle}>NOMBRE</th>
              <th style={thStyle}>DNI</th>
              <th style={thStyle}>TELÉFONO</th>
              <th style={thStyle}>ROL / PUESTO</th>
              <th style={thStyle}>ORIGEN</th>
              <th style={thStyle}>ESTADO HOY</th>
              <th style={thStyle}>ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={`${p._source}-${p.id}`} style={{ borderBottom: '1px solid var(--border-light)' }}>
                <td style={tdStyle}>
                  <div style={{ fontWeight: '700', fontSize: '0.875rem' }}>{p.nombre}</div>
                  {p._source === 'jornadas' && p.usuario && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>@{p.usuario}</div>}
                </td>
                <td style={tdStyle}><span style={{ fontSize: '0.875rem', fontFamily: 'monospace' }}>{p.dni || '-'}</span></td>
                <td style={tdStyle}><span style={{ fontSize: '0.875rem' }}>{p.telefono || '-'}</span></td>
                <td style={tdStyle}>
                  {p._source === 'jornadas' ? (
                    <span style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: '4px', fontWeight: '600',
                      background: p.rol === 'admin' ? '#fef2f2' : '#f0f9ff', color: p.rol === 'admin' ? '#dc2626' : '#0369a1'
                    }}>{p.rol?.toUpperCase()}</span>
                  ) : (
                    <span style={{ fontSize: '0.8rem' }}>{p.puesto || p.categoriaBase || '-'}</span>
                  )}
                </td>
                <td style={tdStyle}>
                  <span style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: '4px', fontWeight: '700',
                    background: p._source === 'jornadas' ? '#ecfdf5' : '#f5f3ff', color: p._source === 'jornadas' ? '#059669' : '#7c3aed'
                  }}>{p._source === 'jornadas' ? '🔨 Jornadas' : '📋 ERP'}</span>
                </td>
                <td style={tdStyle}>
                  {p._source === 'jornadas' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: estadoColors[p._estadoHoy], boxShadow: `0 0 6px ${estadoColors[p._estadoHoy]}80` }} />
                      <span style={{ fontSize: '0.8rem', fontWeight: '600', color: estadoColors[p._estadoHoy] }}>{estadoLabels[p._estadoHoy]}</span>
                    </div>
                  ) : <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>-</span>}
                </td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => openModal(p)} style={btnStyle}><Edit2 size={14} /></button>
                    {p._source === 'erp' && <button onClick={() => handleDelete(p.id, p.nombre, p._source)} style={{ ...btnStyle, background: '#fee2e2', color: '#dc2626' }}><Trash2 size={14} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No hay personas con ese filtro.</div>}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '100%', maxWidth: '420px' }}>
            <h3 style={{ marginTop: 0 }}>{editingId ? 'Editar Persona' : 'Nueva Persona'}</h3>
            {editSource === 'jornadas' && <p style={{ fontSize: '0.8rem', color: '#d97706', background: '#fffbeb', padding: '8px 12px', borderRadius: '6px' }}>⚠️ Esta persona viene de Euler Jornadas. Solo se pueden editar algunos campos.</p>}
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="form-group">
                <label>Nombre</label>
                <input required className="input-field" value={formData.nombre} onChange={e => setFormData({ ...formData, nombre: e.target.value })} />
              </div>
              {editSource === 'jornadas' && <div className="form-group"><label>Apellido</label><input className="input-field" value={formData.apellido} onChange={e => setFormData({ ...formData, apellido: e.target.value })} /></div>}
              <div className="form-group"><label>DNI</label><input className="input-field" value={formData.dni} onChange={e => setFormData({ ...formData, dni: e.target.value })} /></div>
              <div className="form-group"><label>Teléfono</label><input className="input-field" value={formData.telefono} onChange={e => setFormData({ ...formData, telefono: e.target.value })} /></div>
              {editSource !== 'jornadas' && (
                <>
                  <div className="form-group"><label>Puesto</label><input className="input-field" placeholder="Ej: Oficial Instalador" value={formData.puesto} onChange={e => setFormData({ ...formData, puesto: e.target.value })} /></div>
                  <div className="form-group">
                    <label>Categoría Sindical</label>
                    <select className="input-field" value={formData.categoriaBase} onChange={e => setFormData({ ...formData, categoriaBase: e.target.value })}>
                      <option value="Oficial Especializado">Oficial Especializado</option>
                      <option value="Oficial">Oficial</option>
                      <option value="Medio Oficial">Medio Oficial</option>
                      <option value="Eventual">EVENTUAL</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Adicional/Descuento (%)</label>
                    <input type="number" step="0.1" className="input-field" value={formData.adicionalPct} onChange={e => setFormData({ ...formData, adicionalPct: e.target.value })} />
                  </div>
                </>
              )}
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const thStyle = { padding: '0.75rem 1rem', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-secondary)', textAlign: 'left', fontWeight: '700', letterSpacing: '0.5px' };
const tdStyle = { padding: '0.75rem 1rem' };
const btnStyle = { padding: '6px', background: 'var(--bg-surface-hover)', border: 'none', borderRadius: '4px', cursor: 'pointer', color: 'var(--primary-600)', display: 'flex', alignItems: 'center' };

export default Personas;
