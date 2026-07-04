import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot, doc, setDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { Plus, Search, Trash2, Save, FileText, Package, Check, X, AlertTriangle } from 'lucide-react';

const Estandares = () => {
  const [estandares, setEstandares] = useState([]);
  const [listaPrecios, setListaPrecios] = useState([]);
  
  const [selectedStandard, setSelectedStandard] = useState(null);
  const [editingStandard, setEditingStandard] = useState(null);

  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  // ─── INIT DATA ───
  useEffect(() => {
    const unsubEstandares = onSnapshot(collection(db, 'estandares'), (snap) => {
      setEstandares(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    
    const unsubLista = onSnapshot(collection(db, 'lista_precios'), (snap) => {
      setListaPrecios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubEstandares(); unsubLista(); };
  }, []);

  // ─── SEARCH DROPDOWN ───
  const filteredProducts = useMemo(() => {
    if (!productSearch) return [];
    const term = productSearch.toLowerCase();
    return listaPrecios.filter(item => 
      (item.descripcion || '').toLowerCase().includes(term) || 
      (item.codigoGesdatta || '').toLowerCase().includes(term)
    ).slice(0, 50); // Limit to 50 results for performance
  }, [listaPrecios, productSearch]);

  // ─── SELECTION & NEW ───
  const handleSelectStandard = (est) => {
    setSelectedStandard(est);
    setEditingStandard(JSON.parse(JSON.stringify(est)));
    setProductSearch('');
    setShowProductDropdown(false);
  };

  const handleNewStandard = () => {
    const newEst = { id: 'new', nombre: 'Nuevo Estándar', items: [] };
    setSelectedStandard(newEst);
    setEditingStandard(newEst);
    setProductSearch('');
    setShowProductDropdown(false);
  };

  // ─── ITEM MANAGEMENT ───
  const handleAddItem = (itemLista) => {
    if (!editingStandard) return;
    const newItem = {
      itemId: itemLista.id,
      descripcion: itemLista.descripcion,
      tipo: itemLista.tipo || 'material',
      unidad: itemLista.unidad || 'unidad',
      defaultQty: 1
    };
    setEditingStandard({
      ...editingStandard,
      items: [...editingStandard.items, newItem]
    });
    setProductSearch('');
    setShowProductDropdown(false);
  };

  const handleRemoveItem = (index) => {
    if (!editingStandard) return;
    const newItems = [...editingStandard.items];
    newItems.splice(index, 1);
    setEditingStandard({ ...editingStandard, items: newItems });
  };

  const handleQtyChange = (index, value) => {
    if (!editingStandard) return;
    const num = parseFloat(value);
    const newItems = [...editingStandard.items];
    newItems[index].defaultQty = isNaN(num) ? 0 : num;
    setEditingStandard({ ...editingStandard, items: newItems });
  };

  const handleNameChange = (e) => {
    if (!editingStandard) return;
    setEditingStandard({ ...editingStandard, nombre: e.target.value });
  };

  // ─── SAVE & DELETE ───
  const handleSave = async () => {
    if (!editingStandard || !editingStandard.nombre.trim()) {
      alert("El estándar debe tener un nombre.");
      return;
    }
    
    try {
      if (editingStandard.id === 'new') {
        const { id, ...dataToSave } = editingStandard;
        await addDoc(collection(db, 'estandares'), dataToSave);
      } else {
        const docRef = doc(db, 'estandares', editingStandard.id);
        const { id, ...dataToSave } = editingStandard;
        await setDoc(docRef, dataToSave, { merge: true });
      }
      setSelectedStandard(null);
      setEditingStandard(null);
    } catch (error) {
      console.error("Error guardando el estándar:", error);
      alert("Hubo un error al guardar.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Estás seguro de que deseas eliminar este estándar?")) return;
    try {
      await deleteDoc(doc(db, 'estandares', id));
      if (selectedStandard?.id === id) {
        setSelectedStandard(null);
        setEditingStandard(null);
      }
    } catch (error) {
      console.error("Error eliminando:", error);
      alert("Hubo un error al eliminar.");
    }
  };

  // ─── MIGRATION (SEED) ───
  const handleSeed = async () => {
    if (estandares.length > 0) return;
    const defaultTemplateItems = [
      { term: 'nereus 500', defaultQty: 30, fallbackDesc: 'ELEMENTO DE RADIADOR NEREUS 500MM', defaultType: 'material', defaultUnit: 'unidad' },
      { term: 'valvula micrometrica', defaultQty: 5, fallbackDesc: 'VALVULA MICROMETRICA ESCUADRA - R705X013 - GIACOMINI', defaultType: 'material', defaultUnit: 'unidad' },
      { term: 'detentor escuadra', defaultQty: 5, fallbackDesc: 'DETENTOR ESCUADRA GIACOMINI 1/2" R16X033 (RETORNO)', defaultType: 'material', defaultUnit: 'unidad' },
      { term: 'roseta', defaultQty: 10, fallbackDesc: 'Roseta Embellecedor para niple de 1/2"', defaultType: 'material', defaultUnit: 'unidad' },
      { term: 'niple', defaultQty: 10, fallbackDesc: 'Niple de acero Inoxidable 8cm 1/2"', defaultType: 'material', defaultUnit: 'unidad' },
      { term: 'hy02b05', defaultQty: 1, fallbackDesc: 'TERMOSTATO ASUA DIGITAL PROGRAMABLE HY02B05 (CUADRADO BLANCO-BOTONES)', defaultType: 'material', defaultUnit: 'unidad' },
      { term: 'instalación radiador', defaultQty: 5, fallbackDesc: 'Mano de obra Instalación de radiadores', defaultType: 'mano_de_obra', defaultUnit: 'servicio' },
      { term: 'eco nova 24', defaultQty: 1, fallbackDesc: 'CALDERA BAXI ECO NOVA 24 F', defaultType: 'material', defaultUnit: 'unidad' },
      { term: 'inst. caldera', defaultQty: 1, fallbackDesc: 'Mano de obra Instalación de caldera', defaultType: 'mano_de_obra', defaultUnit: 'servicio' },
      { term: 'flexibles hidrá', defaultQty: 1, fallbackDesc: 'KIT DE FLEXIBLES HIDRÁULICOS PARA CALDERA DUAL', defaultType: 'material', defaultUnit: 'unidad' },
      { term: 'nereus 80 blanco', defaultQty: 1, fallbackDesc: 'TOALLERO CURVO NEREUS 80 BLANCO (450MM ENTRE EJES)', defaultType: 'material', defaultUnit: 'unidad' },
      { term: 'pressfitting', defaultQty: 1, fallbackDesc: 'Mano de obra y Materiales para cañería de calefacción por agua en sistema pressfitting de polietileno reticulado', defaultType: 'mano_de_obra', defaultUnit: 'servicio' },
    ];

    const seededItems = defaultTemplateItems.map(tpl => {
      // Intentar encontrar el item en la lista actual por el termino viejo
      const found = listaPrecios.find(i => (i.descripcion || '').toLowerCase().includes(tpl.term));
      if (found) {
        return { itemId: found.id, descripcion: found.descripcion, tipo: found.tipo || tpl.defaultType, unidad: found.unidad || tpl.defaultUnit, defaultQty: tpl.defaultQty };
      }
      return { itemId: 'unknown', descripcion: tpl.fallbackDesc, tipo: tpl.defaultType, unidad: tpl.defaultUnit, defaultQty: tpl.defaultQty };
    });

    try {
      await addDoc(collection(db, 'estandares'), { nombre: 'RADIADORES LLAVE EN MANO', items: seededItems });
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    // Si ya cargaron la lista y estandares está vacio, lo creamos
    if (estandares.length === 0 && listaPrecios.length > 0) {
      handleSeed();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estandares.length, listaPrecios.length]);


  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden' }}>
      {/* ─── SIDEBAR LISTA DE ESTÁNDARES ─── */}
      <div style={{ 
        width: '350px', background: 'var(--bg-surface)', borderRight: '1px solid var(--border-light)',
        display: 'flex', flexDirection: 'column', zIndex: 10
      }}>
        <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>Estándares</h1>
            <button onClick={handleNewStandard} className="btn-primary" style={{ padding: '0.4rem 0.6rem' }}>
              <Plus size={16} /> Nuevo
            </button>
          </div>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Plantillas predefinidas para cargar rápido en presupuestos.
          </p>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
          {estandares.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.85rem', marginTop: '2rem' }}>
              No hay estándares creados.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {estandares.map(est => (
                <li key={est.id} 
                  onClick={() => handleSelectStandard(est)}
                  style={{
                    padding: '1rem', borderRadius: '8px', cursor: 'pointer',
                    background: selectedStandard?.id === est.id ? 'var(--primary-50)' : 'var(--bg-surface)',
                    border: selectedStandard?.id === est.id ? '1px solid var(--primary-300)' : '1px solid var(--border-light)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, color: selectedStandard?.id === est.id ? 'var(--primary-700)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {est.nombre}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                      {est.items?.length || 0} artículos
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ─── EDITOR ─── */}
      <div style={{ flex: 1, background: 'var(--bg-body)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {editingStandard ? (
          <>
            <div style={{ padding: '1.25rem 2rem', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ flex: 1, maxWidth: '600px' }}>
                <input 
                  type="text" 
                  value={editingStandard.nombre}
                  onChange={handleNameChange}
                  placeholder="Nombre del Estándar (ej: RADIADORES LLAVE EN MANO)"
                  style={{ 
                    width: '100%', fontSize: '1.2rem', fontWeight: 700, padding: '0.5rem', 
                    border: '1px solid var(--border-light)', borderRadius: '6px',
                    color: 'var(--primary-800)'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {editingStandard.id !== 'new' && (
                  <button onClick={() => handleDelete(editingStandard.id)} className="btn" style={{ color: '#ef4444', borderColor: '#fecaca', background: '#fef2f2' }}>
                    <Trash2 size={16} /> Eliminar
                  </button>
                )}
                <button onClick={handleSave} className="btn-primary" style={{ padding: '0.5rem 1rem' }}>
                  <Save size={16} /> Guardar Estándar
                </button>
              </div>
            </div>

            <div style={{ padding: '2rem', flex: 1, overflowY: 'auto' }}>
              <div style={{ background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-light)', overflow: 'visible', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Package size={18} color="var(--primary-500)"/> Artículos de este estándar
                  </h3>
                </div>

                {/* Buscador para agregar artículos */}
                <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input 
                      type="text"
                      placeholder="Buscar artículo para agregar..."
                      value={productSearch}
                      onChange={(e) => {
                        setProductSearch(e.target.value);
                        setShowProductDropdown(true);
                      }}
                      onFocus={() => setShowProductDropdown(true)}
                      style={{
                        width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem',
                        border: '1px solid var(--primary-300)', borderRadius: '8px',
                        fontSize: '0.9rem', outline: 'none'
                      }}
                    />
                  </div>
                  
                  {showProductDropdown && productSearch && (
                    <div style={{ 
                      position: 'absolute', top: '100%', left: 0, right: 0, 
                      background: 'white', border: '1px solid var(--border-light)', 
                      borderRadius: '8px', marginTop: '4px', zIndex: 50, 
                      boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', maxHeight: '300px', overflowY: 'auto' 
                    }}>
                      {filteredProducts.length === 0 ? (
                        <div style={{ padding: '1rem', color: 'var(--text-tertiary)', textAlign: 'center', fontSize: '0.85rem' }}>No se encontraron artículos</div>
                      ) : (
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                          {filteredProducts.map(prod => (
                            <li 
                              key={prod.id}
                              onClick={() => handleAddItem(prod)}
                              style={{ 
                                padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-light)', 
                                cursor: 'pointer', transition: 'background 0.2s',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                            >
                              <div>
                                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{prod.descripcion}</div>
                                {prod.codigoGesdatta && <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Cód: {prod.codigoGesdatta}</div>}
                              </div>
                              <span style={{ fontSize: '0.7rem', background: 'var(--bg-body)', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>
                                {prod.tipo || 'N/A'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {/* Tabla de artículos */}
                {(!editingStandard.items || editingStandard.items.length === 0) ? (
                  <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-tertiary)', background: 'var(--bg-body)', borderRadius: '8px', border: '1px dashed var(--border-light)' }}>
                    <FileText size={40} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                    <p style={{ margin: 0 }}>Usa el buscador de arriba para agregar artículos a este estándar.</p>
                  </div>
                ) : (
                  <table className="table" style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                        <th>Descripción (Fija en plantilla)</th>
                        <th style={{ width: '100px' }}>Tipo</th>
                        <th style={{ width: '150px' }}>Cant. Sugerida</th>
                        <th style={{ width: '50px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {editingStandard.items.map((item, idx) => (
                        <tr key={idx}>
                          <td style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>{idx + 1}</td>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{item.descripcion}</div>
                            {item.itemId === 'unknown' && <span style={{ fontSize: '0.7rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.2rem' }}><AlertTriangle size={12}/> No vinculado a lista actual</span>}
                          </td>
                          <td>
                            <span style={{ fontSize: '0.7rem', background: 'var(--bg-body)', padding: '0.2rem 0.4rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                              {item.tipo}
                            </span>
                          </td>
                          <td>
                            <input 
                              type="number" 
                              min="0" step="0.01"
                              value={item.defaultQty}
                              onChange={(e) => handleQtyChange(idx, e.target.value)}
                              className="input"
                              style={{ padding: '0.4rem', width: '80px', textAlign: 'right' }}
                            />
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginLeft: '0.3rem' }}>{item.unidad}</span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button onClick={() => handleRemoveItem(idx)} className="btn-icon" style={{ color: '#ef4444' }} title="Quitar">
                              <X size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

              </div>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-tertiary)' }}>
            <Package size={64} style={{ opacity: 0.2, marginBottom: '1rem' }} />
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0, color: 'var(--text-secondary)' }}>Selecciona un estándar</h2>
            <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>o crea uno nuevo desde la barra lateral.</p>
          </div>
        )}
      </div>

      {/* CLICK OUTSIDE HANDLER FOR DROPDOWN */}
      {showProductDropdown && (
        <div 
          style={{ position: 'fixed', inset: 0, zIndex: 40 }} 
          onClick={() => setShowProductDropdown(false)}
        />
      )}
    </div>
  );
};

export default Estandares;
