import React, { useState, useEffect } from 'react';
import { Search, Plus, Archive, AlertTriangle, Package, Wrench, Thermometer, X, Save, Edit2, Trash2 } from 'lucide-react';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';

const Stock = () => {
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('Todas');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [newItem, setNewItem] = useState({
    name: '', category: 'Materiales', quantity: 0, minAlert: 5, unit: 'U', costUSD: 0, profitCF: 30
  });

  // Edit state
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState({});

  const categories = ['Todas', 'Equipos', 'Materiales', 'Herramientas', 'Repuestos SSTT'];

  useEffect(() => {
    const q = query(collection(db, 'stock'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name && item.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTab = activeTab === 'Todas' || item.category === activeTab;
    return matchesSearch && matchesTab;
  });

  const getCategoryIcon = (cat) => {
    switch (cat) {
      case 'Equipos': return <Thermometer size={16} />;
      case 'Materiales': return <Package size={16} />;
      case 'Herramientas': return <Wrench size={16} />;
      case 'Repuestos SSTT': return <Archive size={16} />;
      default: return <Package size={16} />;
    }
  };

  const handleSaveItem = async (e) => {
    e.preventDefault();
    if (!newItem.name) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'stock'), {
        name: newItem.name,
        category: newItem.category,
        quantity: Number(newItem.quantity),
        minAlert: Number(newItem.minAlert),
        unit: newItem.unit,
        costUSD: Number(newItem.costUSD) || 0,
        profitCF: Number(newItem.profitCF) || 0,
        lastUpdated: new Date().toLocaleDateString('es-AR'),
        createdAt: serverTimestamp()
      });
      setIsModalOpen(false);
      setNewItem({ name: '', category: 'Materiales', quantity: 0, minAlert: 5, unit: 'U', costUSD: 0, profitCF: 30 });
    } catch (e) {
      console.error(e);
      alert('Error al guardar en el inventario.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const adjustStock = async (item, amount) => {
    try {
      const newQuantity = Number(item.quantity) + amount;
      await updateDoc(doc(db, 'stock', item.id), {
        quantity: newQuantity,
        lastUpdated: new Date().toLocaleDateString('es-AR')
      });
    } catch (e) {
      console.error("Error adjusting stock:", e);
    }
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setEditForm({ name: item.name, category: item.category, quantity: item.quantity, minAlert: item.minAlert, unit: item.unit, costUSD: item.costUSD || 0, profitCF: item.profitCF || 0 });
  };

  const handleEditItem = async (e) => {
    e.preventDefault();
    if (!editingItem) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'stock', editingItem.id), {
        ...editForm,
        quantity: Number(editForm.quantity),
        minAlert: Number(editForm.minAlert),
        costUSD: Number(editForm.costUSD) || 0,
        profitCF: Number(editForm.profitCF) || 0,
        lastUpdated: new Date().toLocaleDateString('es-AR')
      });
      setEditingItem(null);
    } catch (e) {
      alert('Error al editar.');
    }
    setIsSubmitting(false);
  };

  const handleDeleteItem = async (item) => {
    if (!window.confirm(`¿Eliminar "${item.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteDoc(doc(db, 'stock', item.id));
    } catch (e) {
      alert('Error al eliminar.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0 }}>Stock del Galpón</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Control de inventario físico y alertas de compras
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
          <Plus size={18} />
          Nuevo Ítem
        </button>
      </div>

      {/* Toolbox (Buscador y Pestañas) */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexDirection: 'column' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
          <Search size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input 
            type="text" 
            placeholder="Buscar por código o nombre..." 
            className="input-field"
            style={{ paddingLeft: '2.5rem' }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-light)', overflowX: 'auto' }}>
          {categories.map(cat => (
            <button 
              key={cat}
              onClick={() => setActiveTab(cat)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: activeTab === cat ? '2px solid var(--primary-600)' : '2px solid transparent',
                color: activeTab === cat ? 'var(--primary-600)' : 'var(--text-secondary)',
                fontWeight: activeTab === cat ? '600' : '500',
                padding: '0.5rem 0.5rem 0.75rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap'
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla de Stock */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ backgroundColor: 'var(--bg-surface-hover)', borderBottom: '1px solid var(--border-light)' }}>
              <tr>
                <th style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Ítem / Descripción</th>
                <th style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Categoría</th>
                <th style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Precio Base</th>
                <th style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Cantidad Total</th>
                <th style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Estado</th>
                <th style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(item => {
                const isCritical = item.quantity <= item.minAlert;

                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border-light)', backgroundColor: isCritical ? '#fef2f2' : 'transparent' }}>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{item.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.125rem' }}>Última act: {item.lastUpdated}</div>
                    </td>
                    
                    <td style={{ padding: '1rem' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', backgroundColor: 'var(--primary-50)', color: 'var(--primary-700)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '500' }}>
                        {getCategoryIcon(item.category)} {item.category}
                      </span>
                    </td>

                    <td style={{ padding: '1rem' }}>
                      {item.costUSD ? <div style={{ fontWeight: '600', color: 'var(--accent-600)' }}>U$D {item.costUSD}</div> : <div style={{ color: 'var(--text-tertiary)' }}>-</div>}
                      {item.profitCF ? <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{item.profitCF}% Margen</div> : null}
                    </td>

                    <td style={{ padding: '1rem' }}>
                      <span style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--text-primary)' }}>{item.quantity}</span>
                      <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginLeft: '0.25rem' }}>{item.unit}</span>
                    </td>

                    <td style={{ padding: '1rem' }}>
                      {isCritical ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--accent-600)', fontWeight: '600', fontSize: '0.875rem' }}>
                          <AlertTriangle size={16} /> Reponer URG. (Mín: {item.minAlert})
                        </div>
                      ) : (
                        <span style={{ color: 'var(--success)', fontWeight: '500', fontSize: '0.875rem' }}>Stock Sano</span>
                      )}
                    </td>

                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary" onClick={() => adjustStock(item, 1)} style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}>+ Ingreso</button>
                        <button className="btn" onClick={() => adjustStock(item, -1)} style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', backgroundColor: '#f3f4f6', border: '1px solid #d1d5db' }}>- Salida</button>
                        <button onClick={() => openEdit(item)} style={{ padding: '0.35rem', background: 'var(--bg-surface-hover)', border: 'none', borderRadius: '4px', cursor: 'pointer', color: 'var(--primary-600)', display: 'flex', alignItems: 'center' }} title="Editar"><Edit2 size={14} /></button>
                        <button onClick={() => handleDeleteItem(item)} style={{ padding: '0.35rem', background: '#fee2e2', border: 'none', borderRadius: '4px', cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center' }} title="Eliminar"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No hay inventario cargado bajo este filtro en la Nube.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Nuevo Item */}
      {isModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="card" style={{ width: '450px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Crear Ítem en Inventario</h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSaveItem} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nombre del Material/Equipo <span style={{color: 'var(--accent-600)'}}>*</span></label>
                <input required type="text" className="input-field" value={newItem.name} onChange={(e) => setNewItem({...newItem, name: e.target.value})} placeholder="Ej: Caldera Baxi Eco Nova" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Categoría</label>
                  <select className="input-field" value={newItem.category} onChange={(e) => setNewItem({...newItem, category: e.target.value})}>
                    <option value="Equipos">Equipos</option>
                    <option value="Materiales">Materiales</option>
                    <option value="Herramientas">Herramientas</option>
                    <option value="Repuestos SSTT">Repuestos SSTT</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Alarma de Stock Mínimo</label>
                  <input required type="number" min="0" className="input-field" value={newItem.minAlert} onChange={(e) => setNewItem({...newItem, minAlert: e.target.value})} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Stock Inicial Físico</label>
                  <input required type="number" min="0" className="input-field" value={newItem.quantity} onChange={(e) => setNewItem({...newItem, quantity: e.target.value})} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Unidad de Medida</label>
                  <select className="input-field" value={newItem.unit} onChange={(e) => setNewItem({...newItem, unit: e.target.value})}>
                    <option value="U">Unidad (U)</option>
                    <option value="Mts">Metros (Mts)</option>
                    <option value="Rollos">Rollos</option>
                    <option value="Kgs">Kilos (Kgs)</option>
                    <option value="Lts">Litros (Lts)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Costo en USD (Opcional)</label>
                  <input type="number" min="0" step="0.01" className="input-field" value={newItem.costUSD} onChange={(e) => setNewItem({...newItem, costUSD: e.target.value})} placeholder="Ej: 120.50" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">% Rentabilidad (Consumidor Final)</label>
                  <input type="number" min="0" className="input-field" value={newItem.profitCF} onChange={(e) => setNewItem({...newItem, profitCF: e.target.value})} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  <Save size={16} style={{marginRight: '0.35rem'}} /> Guardar Ítem
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Item */}
      {editingItem && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="card" style={{ width: '450px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Editar Ítem</h3>
              <button onClick={() => setEditingItem(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleEditItem} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nombre</label>
                <input required type="text" className="input-field" value={editForm.name || ''} onChange={(e) => setEditForm({...editForm, name: e.target.value})} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Categoría</label>
                  <select className="input-field" value={editForm.category} onChange={(e) => setEditForm({...editForm, category: e.target.value})}>
                    <option value="Equipos">Equipos</option>
                    <option value="Materiales">Materiales</option>
                    <option value="Herramientas">Herramientas</option>
                    <option value="Repuestos SSTT">Repuestos SSTT</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Stock Mínimo</label>
                  <input type="number" min="0" className="input-field" value={editForm.minAlert} onChange={(e) => setEditForm({...editForm, minAlert: e.target.value})} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Costo USD</label>
                  <input type="number" min="0" step="0.01" className="input-field" value={editForm.costUSD} onChange={(e) => setEditForm({...editForm, costUSD: e.target.value})} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">% Rentabilidad</label>
                  <input type="number" min="0" className="input-field" value={editForm.profitCF} onChange={(e) => setEditForm({...editForm, profitCF: e.target.value})} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditingItem(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  <Save size={16} /> Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Stock;
