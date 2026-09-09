import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot, doc, setDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { 
  Plus, Search, Trash2, Save, FileText, Package, Check, X, AlertTriangle, 
  ArrowUp, ArrowDown, Copy, CheckCircle, RefreshCw, AlertCircle, Edit3
} from 'lucide-react';

const Estandares = () => {
  const [estandares, setEstandares] = useState([]);
  const [listaPrecios, setListaPrecios] = useState([]);
  
  const [selectedStandard, setSelectedStandard] = useState(null);
  const [editingStandard, setEditingStandard] = useState(null);

  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');

  // Estados de guardado y feedback
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const hasAutoSelectedRef = useRef(false);

  // ─── INIT DATA ───
  useEffect(() => {
    const unsubEstandares = onSnapshot(collection(db, 'estandares'), (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setEstandares(items);

      // Auto-seleccionar el primer estándar en carga inicial si no hay ninguno seleccionado
      if (!hasAutoSelectedRef.current && items.length > 0) {
        hasAutoSelectedRef.current = true;
        setSelectedStandard(items[0]);
        setEditingStandard(JSON.parse(JSON.stringify(items[0])));
      }
    });
    
    const unsubLista = onSnapshot(collection(db, 'lista_precios'), (snap) => {
      setListaPrecios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubEstandares(); unsubLista(); };
  }, []);

  // ─── DETECTAR CAMBIOS PENDIENTES ───
  const hasUnsavedChanges = useMemo(() => {
    if (!editingStandard || !selectedStandard) return false;
    return JSON.stringify(editingStandard) !== JSON.stringify(selectedStandard);
  }, [editingStandard, selectedStandard]);

  // ─── SEARCH DROPDOWN CATÁLOGO ───
  const filteredProducts = useMemo(() => {
    if (!productSearch) return [];
    const term = productSearch.toLowerCase();
    return listaPrecios.filter(item => 
      (item.descripcion || '').toLowerCase().includes(term) || 
      (item.codigoGesdatta || '').toLowerCase().includes(term)
    ).slice(0, 50);
  }, [listaPrecios, productSearch]);

  // ─── FILTRO SIDEBAR ───
  const filteredEstandares = useMemo(() => {
    if (!sidebarSearch.trim()) return estandares;
    const term = sidebarSearch.toLowerCase();
    return estandares.filter(est => (est.nombre || '').toLowerCase().includes(term));
  }, [estandares, sidebarSearch]);

  // ─── SELECTION & NEW ───
  const handleSelectStandard = (est) => {
    if (hasUnsavedChanges) {
      const confirmDiscard = window.confirm("Tienes cambios sin guardar en este estándar. ¿Deseas descartarlos y cambiar de estándar?");
      if (!confirmDiscard) return;
    }
    setSelectedStandard(est);
    setEditingStandard(JSON.parse(JSON.stringify(est)));
    setProductSearch('');
    setShowProductDropdown(false);
    setSaveSuccess(false);
    setErrorMessage(null);
  };

  const handleNewStandard = () => {
    if (hasUnsavedChanges) {
      const confirmDiscard = window.confirm("Tienes cambios sin guardar. ¿Deseas descartarlos para crear uno nuevo?");
      if (!confirmDiscard) return;
    }
    const newEst = { id: 'new', nombre: 'Nuevo Estándar', items: [] };
    setSelectedStandard(newEst);
    setEditingStandard(newEst);
    setProductSearch('');
    setShowProductDropdown(false);
    setSaveSuccess(false);
    setErrorMessage(null);
  };

  const handleDuplicateStandard = () => {
    if (!editingStandard) return;
    const duplicated = {
      id: 'new',
      nombre: `${editingStandard.nombre} (Copia)`,
      items: JSON.parse(JSON.stringify(editingStandard.items || []))
    };
    setSelectedStandard(duplicated);
    setEditingStandard(duplicated);
    setSaveSuccess(false);
    setErrorMessage(null);
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
      items: [...(editingStandard.items || []), newItem]
    });
    setProductSearch('');
    setShowProductDropdown(false);
    setSaveSuccess(false);
  };

  const handleAddManualItem = () => {
    if (!editingStandard) return;
    const newItem = {
      itemId: 'manual_' + Date.now(),
      descripcion: 'Nuevo concepto o artículo personalizado',
      tipo: 'material',
      unidad: 'unidad',
      defaultQty: 1
    };
    setEditingStandard({
      ...editingStandard,
      items: [...(editingStandard.items || []), newItem]
    });
    setSaveSuccess(false);
  };

  const handleRemoveItem = (index) => {
    if (!editingStandard) return;
    const newItems = [...editingStandard.items];
    newItems.splice(index, 1);
    setEditingStandard({ ...editingStandard, items: newItems });
    setSaveSuccess(false);
  };

  const handleMoveItem = (index, direction) => {
    if (!editingStandard) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= (editingStandard.items?.length || 0)) return;
    const newItems = [...editingStandard.items];
    const temp = newItems[index];
    newItems[index] = newItems[targetIndex];
    newItems[targetIndex] = temp;
    setEditingStandard({ ...editingStandard, items: newItems });
    setSaveSuccess(false);
  };

  const handleQtyChange = (index, value) => {
    if (!editingStandard) return;
    const num = parseFloat(value);
    const newItems = [...editingStandard.items];
    newItems[index] = { ...newItems[index], defaultQty: isNaN(num) ? 0 : num };
    setEditingStandard({ ...editingStandard, items: newItems });
    setSaveSuccess(false);
  };

  const handleDescChange = (index, value) => {
    if (!editingStandard) return;
    const newItems = [...editingStandard.items];
    newItems[index] = { ...newItems[index], descripcion: value };
    setEditingStandard({ ...editingStandard, items: newItems });
    setSaveSuccess(false);
  };

  const handleTypeChange = (index, value) => {
    if (!editingStandard) return;
    const newItems = [...editingStandard.items];
    newItems[index] = { ...newItems[index], tipo: value };
    setEditingStandard({ ...editingStandard, items: newItems });
    setSaveSuccess(false);
  };

  const handleUnitChange = (index, value) => {
    if (!editingStandard) return;
    const newItems = [...editingStandard.items];
    newItems[index] = { ...newItems[index], unidad: value };
    setEditingStandard({ ...editingStandard, items: newItems });
    setSaveSuccess(false);
  };

  const handleNameChange = (e) => {
    if (!editingStandard) return;
    setEditingStandard({ ...editingStandard, nombre: e.target.value });
    setSaveSuccess(false);
  };

  // ─── SAVE & DELETE ───
  const handleSave = async () => {
    if (!editingStandard || !editingStandard.nombre.trim()) {
      alert("El estándar debe tener un nombre.");
      return;
    }
    
    setIsSaving(true);
    setErrorMessage(null);

    try {
      let savedId = editingStandard.id;
      if (editingStandard.id === 'new') {
        const { id, ...dataToSave } = editingStandard;
        const docRef = await addDoc(collection(db, 'estandares'), dataToSave);
        savedId = docRef.id;
      } else {
        const docRef = doc(db, 'estandares', editingStandard.id);
        const { id, ...dataToSave } = editingStandard;
        await setDoc(docRef, dataToSave, { merge: true });
      }

      // PERMANECER en el estándar actual con los cambios confirmados
      const updated = { ...editingStandard, id: savedId };
      setSelectedStandard(JSON.parse(JSON.stringify(updated)));
      setEditingStandard(updated);

      // Confirmación visual
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
      }, 4000);
    } catch (error) {
      console.error("Error guardando el estándar:", error);
      setErrorMessage("Ocurrió un error al guardar los cambios en la base de datos.");
    } finally {
      setIsSaving(false);
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
        width: '340px', background: 'var(--bg-surface)', borderRight: '1px solid var(--border-light)',
        display: 'flex', flexDirection: 'column', zIndex: 10, flexShrink: 0
      }}>
        <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>Estándares</h1>
            <button onClick={handleNewStandard} className="btn-primary" style={{ padding: '0.4rem 0.65rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Plus size={16} /> Nuevo
            </button>
          </div>
          <p style={{ margin: '0.4rem 0 0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Plantillas predefinidas para cargar rápido en presupuestos.
          </p>

          {/* Buscador de estándares en sidebar */}
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input 
              type="text"
              placeholder="Filtrar estándares..."
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              style={{
                width: '100%', padding: '0.45rem 0.6rem 0.45rem 2rem',
                border: '1px solid var(--border-light)', borderRadius: '6px',
                fontSize: '0.8rem', outline: 'none', background: 'var(--bg-body)'
              }}
            />
          </div>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
          {filteredEstandares.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.85rem', marginTop: '2rem' }}>
              {estandares.length === 0 ? 'No hay estándares creados.' : 'No se encontraron resultados.'}
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {filteredEstandares.map(est => {
                const isSelected = selectedStandard?.id === est.id;
                return (
                  <li key={est.id} 
                    onClick={() => handleSelectStandard(est)}
                    style={{
                      padding: '0.85rem 1rem', borderRadius: '8px', cursor: 'pointer',
                      background: isSelected ? 'var(--primary-50)' : 'var(--bg-surface)',
                      border: isSelected ? '1px solid var(--primary-400)' : '1px solid var(--border-light)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ 
                        fontWeight: isSelected ? 700 : 600, 
                        color: isSelected ? 'var(--primary-700)' : 'var(--text-primary)', 
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        fontSize: '0.9rem'
                      }}>
                        {est.nombre}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>{est.items?.length || 0} artículos</span>
                        {isSelected && hasUnsavedChanges && (
                          <span style={{ color: '#d97706', fontWeight: 600 }}>• Modificado</span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ─── EDITOR ─── */}
      <div style={{ flex: 1, background: 'var(--bg-body)', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
        {editingStandard ? (
          <>
            {/* Header del Editor */}
            <div style={{ 
              padding: '1rem 2rem', background: 'var(--bg-surface)', 
              borderBottom: '1px solid var(--border-light)', 
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)', zIndex: 5
            }}>
              <div style={{ flex: 1, maxWidth: '650px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input 
                  type="text" 
                  value={editingStandard.nombre}
                  onChange={handleNameChange}
                  placeholder="Nombre del Estándar (ej: RADIADORES LLAVE EN MANO)"
                  style={{ 
                    width: '100%', fontSize: '1.25rem', fontWeight: 700, padding: '0.5rem 0.75rem', 
                    border: '1px solid var(--border-light)', borderRadius: '6px',
                    color: 'var(--text-primary)', background: 'white',
                    outline: 'none', transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--primary-400)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border-light)'}
                />
                
                {/* Indicador de cambios */}
                {hasUnsavedChanges ? (
                  <span style={{ 
                    fontSize: '0.75rem', background: '#fef3c7', color: '#92400e', 
                    border: '1px solid #fde68a', padding: '0.3rem 0.65rem', borderRadius: '20px', 
                    fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap' 
                  }}>
                    <AlertCircle size={13} /> Modificado
                  </span>
                ) : (
                  <span style={{ 
                    fontSize: '0.75rem', background: '#f0fdf4', color: '#166534', 
                    border: '1px solid #bbf7d0', padding: '0.3rem 0.65rem', borderRadius: '20px', 
                    fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap' 
                  }}>
                    <Check size={13} /> Confirmado
                  </span>
                )}
              </div>

              {/* Botones de acción */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <button 
                  onClick={handleDuplicateStandard} 
                  className="btn" 
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
                  title="Duplicar como nuevo estándar"
                >
                  <Copy size={15} /> Duplicar
                </button>

                {editingStandard.id !== 'new' && (
                  <button 
                    onClick={() => handleDelete(editingStandard.id)} 
                    className="btn" 
                    style={{ color: '#ef4444', borderColor: '#fecaca', background: '#fef2f2', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
                  >
                    <Trash2 size={15} /> Eliminar
                  </button>
                )}

                {/* BOTÓN DE GUARDAR Y CONFIRMAR */}
                <button 
                  onClick={handleSave} 
                  disabled={isSaving}
                  className="btn-primary" 
                  style={{ 
                    padding: '0.55rem 1.25rem', 
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    fontWeight: 600, fontSize: '0.9rem',
                    backgroundColor: saveSuccess ? '#10b981' : undefined,
                    borderColor: saveSuccess ? '#059669' : undefined,
                    transition: 'all 0.3s ease'
                  }}
                >
                  {isSaving ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" /> Guardando...
                    </>
                  ) : saveSuccess ? (
                    <>
                      <CheckCircle size={16} /> ¡Estándar Guardado!
                    </>
                  ) : (
                    <>
                      <Save size={16} /> Guardar Estándar
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Contenido Scrollable */}
            <div style={{ padding: '1.75rem 2rem', flex: 1, overflowY: 'auto' }}>
              {/* Notificación de éxito post-guardado */}
              {saveSuccess && (
                <div style={{ 
                  background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', 
                  padding: '0.85rem 1.25rem', borderRadius: '8px', 
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                  marginBottom: '1.5rem', boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <CheckCircle size={20} color="#059669" />
                    <div>
                      <strong style={{ fontWeight: 700 }}>¡Estándar confirmado y guardado con éxito!</strong>
                      <div style={{ fontSize: '0.8rem', color: '#047857', marginTop: '0.1rem' }}>
                        Todos los artículos y cantidades actualizadas están listos para utilizarse en nuevos presupuestos.
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setSaveSuccess(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065f46' }}>
                    <X size={18} />
                  </button>
                </div>
              )}

              {/* Mensaje de error si falla */}
              {errorMessage && (
                <div style={{ 
                  background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', 
                  padding: '0.85rem 1.25rem', borderRadius: '8px', 
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                  marginBottom: '1.5rem' 
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <AlertTriangle size={20} color="#dc2626" />
                    <span>{errorMessage}</span>
                  </div>
                  <button onClick={() => setErrorMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b' }}>
                    <X size={18} />
                  </button>
                </div>
              )}

              {/* Tarjeta de Artículos del Estándar */}
              <div style={{ 
                background: 'var(--bg-surface)', borderRadius: '12px', 
                border: '1px solid var(--border-light)', padding: '1.5rem', 
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.04)' 
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                      <Package size={20} color="var(--primary-600)"/> Artículos de este estándar
                    </h3>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Puedes modificar las descripciones, cambiar cantidades, reordenar artículos o añadir nuevos.
                    </p>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                      onClick={handleAddManualItem}
                      className="btn" 
                      style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <Plus size={14} /> Ítem personalizado
                    </button>
                  </div>
                </div>

                {/* Buscador para agregar artículos desde el catálogo */}
                <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input 
                      type="text"
                      placeholder="Buscar artículo en el catálogo para agregar a este estándar..."
                      value={productSearch}
                      onChange={(e) => {
                        setProductSearch(e.target.value);
                        setShowProductDropdown(true);
                      }}
                      onFocus={() => setShowProductDropdown(true)}
                      style={{
                        width: '100%', padding: '0.8rem 1rem 0.8rem 2.75rem',
                        border: '1px solid var(--primary-300)', borderRadius: '8px',
                        fontSize: '0.9rem', outline: 'none', background: 'white',
                        boxShadow: showProductDropdown && productSearch ? '0 0 0 3px rgba(37, 99, 235, 0.1)' : 'none'
                      }}
                    />
                  </div>
                  
                  {showProductDropdown && productSearch && (
                    <div style={{ 
                      position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, 
                      background: 'white', border: '1px solid var(--border-light)', 
                      borderRadius: '8px', zIndex: 50, 
                      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)', maxHeight: '320px', overflowY: 'auto' 
                    }}>
                      {filteredProducts.length === 0 ? (
                        <div style={{ padding: '1.25rem', color: 'var(--text-tertiary)', textAlign: 'center', fontSize: '0.85rem' }}>
                          No se encontraron artículos con ese término en el catálogo.
                        </div>
                      ) : (
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                          {filteredProducts.map(prod => (
                            <li 
                              key={prod.id}
                              onClick={() => handleAddItem(prod)}
                              style={{ 
                                padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-light)', 
                                cursor: 'pointer', transition: 'background 0.15s',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                            >
                              <div style={{ flex: 1, minWidth: 0, paddingRight: '1rem' }}>
                                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{prod.descripcion}</div>
                                {prod.codigoGesdatta && <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '0.1rem' }}>Cód: {prod.codigoGesdatta}</div>}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.7rem', background: 'var(--bg-body)', padding: '0.2rem 0.5rem', borderRadius: '4px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                                  {prod.tipo || 'N/A'}
                                </span>
                                <button className="btn-primary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                                  + Agregar
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {/* Tabla de artículos */}
                {(!editingStandard.items || editingStandard.items.length === 0) ? (
                  <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--text-tertiary)', background: 'var(--bg-body)', borderRadius: '8px', border: '1px dashed var(--border-light)' }}>
                    <FileText size={42} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
                    <p style={{ margin: 0, fontWeight: 500, fontSize: '0.95rem', color: 'var(--text-secondary)' }}>El estándar aún no tiene artículos.</p>
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>Usa el buscador de arriba o el botón "+ Ítem personalizado" para agregar elementos a esta plantilla.</p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="table" style={{ borderCollapse: 'collapse', width: '100%' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-body)', borderBottom: '2px solid var(--border-light)' }}>
                          <th style={{ width: '45px', textAlign: 'center', padding: '0.75rem 0.5rem' }}>#</th>
                          <th style={{ width: '60px', textAlign: 'center', padding: '0.75rem 0.5rem' }}>Orden</th>
                          <th style={{ padding: '0.75rem 0.75rem' }}>Descripción (Editable)</th>
                          <th style={{ width: '140px', padding: '0.75rem 0.5rem' }}>Tipo</th>
                          <th style={{ width: '200px', padding: '0.75rem 0.5rem' }}>Cant. Sugerida</th>
                          <th style={{ width: '50px', textAlign: 'center', padding: '0.75rem 0.5rem' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {editingStandard.items.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                            {/* Número de fila */}
                            <td style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontWeight: 600, fontSize: '0.8rem' }}>
                              {idx + 1}
                            </td>

                            {/* Controles para reordenar (subir / bajar) */}
                            <td style={{ textAlign: 'center', padding: '0.4rem 0.2rem' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                <button
                                  type="button"
                                  onClick={() => handleMoveItem(idx, 'up')}
                                  disabled={idx === 0}
                                  title="Subir posición"
                                  style={{
                                    border: 'none', background: 'transparent', cursor: idx === 0 ? 'default' : 'pointer',
                                    color: idx === 0 ? '#d1d5db' : 'var(--text-secondary)', padding: '2px'
                                  }}
                                >
                                  <ArrowUp size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveItem(idx, 'down')}
                                  disabled={idx === editingStandard.items.length - 1}
                                  title="Bajar posición"
                                  style={{
                                    border: 'none', background: 'transparent', cursor: idx === editingStandard.items.length - 1 ? 'default' : 'pointer',
                                    color: idx === editingStandard.items.length - 1 ? '#d1d5db' : 'var(--text-secondary)', padding: '2px'
                                  }}
                                >
                                  <ArrowDown size={14} />
                                </button>
                              </div>
                            </td>

                            {/* Descripción editable */}
                            <td style={{ padding: '0.5rem 0.75rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <input
                                  type="text"
                                  value={item.descripcion || ''}
                                  onChange={(e) => handleDescChange(idx, e.target.value)}
                                  placeholder="Descripción del artículo..."
                                  style={{
                                    width: '100%', fontSize: '0.85rem', fontWeight: 600,
                                    border: '1px solid transparent', borderRadius: '4px',
                                    padding: '0.4rem 0.5rem', background: 'transparent',
                                    color: 'var(--text-primary)', outline: 'none',
                                    transition: 'all 0.15s'
                                  }}
                                  onFocus={(e) => {
                                    e.target.style.background = 'white';
                                    e.target.style.borderColor = 'var(--primary-300)';
                                    e.target.style.boxShadow = '0 0 0 2px rgba(37, 99, 235, 0.1)';
                                  }}
                                  onBlur={(e) => {
                                    e.target.style.background = 'transparent';
                                    e.target.style.borderColor = 'transparent';
                                    e.target.style.boxShadow = 'none';
                                  }}
                                />
                                <Edit3 size={13} style={{ color: 'var(--text-tertiary)', flexShrink: 0, opacity: 0.6 }} />
                              </div>
                              {item.itemId === 'unknown' && (
                                <span style={{ fontSize: '0.7rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.2rem', marginTop: '0.15rem', paddingLeft: '0.5rem' }}>
                                  <AlertTriangle size={12}/> No vinculado a lista actual
                                </span>
                              )}
                            </td>

                            {/* Selector de Tipo */}
                            <td style={{ padding: '0.5rem' }}>
                              <select
                                value={item.tipo || 'material'}
                                onChange={(e) => handleTypeChange(idx, e.target.value)}
                                style={{
                                  fontSize: '0.75rem', padding: '0.35rem 0.5rem',
                                  borderRadius: '6px', border: '1px solid var(--border-light)',
                                  background: 'var(--bg-body)', color: 'var(--text-secondary)',
                                  fontWeight: 600, outline: 'none', width: '100%'
                                }}
                              >
                                <option value="material">MATERIAL</option>
                                <option value="mano_de_obra">MANO DE OBRA</option>
                                <option value="servicio">SERVICIO</option>
                              </select>
                            </td>

                            {/* Cantidad sugerida y unidad */}
                            <td style={{ padding: '0.5rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <input 
                                  type="number" 
                                  min="0" step="0.01"
                                  value={item.defaultQty}
                                  onChange={(e) => handleQtyChange(idx, e.target.value)}
                                  className="input"
                                  style={{ 
                                    padding: '0.4rem', width: '85px', textAlign: 'right',
                                    fontWeight: 600, fontSize: '0.85rem'
                                  }}
                                />
                                <input 
                                  type="text"
                                  value={item.unidad || 'unidad'}
                                  onChange={(e) => handleUnitChange(idx, e.target.value)}
                                  title="Unidad de medida (ej: unidad, m, servicio)"
                                  style={{
                                    width: '75px', fontSize: '0.75rem', padding: '0.4rem 0.35rem',
                                    border: '1px solid var(--border-light)', borderRadius: '4px',
                                    background: 'var(--bg-body)', color: 'var(--text-secondary)',
                                    textAlign: 'center'
                                  }}
                                />
                              </div>
                            </td>

                            {/* Botón Quitar */}
                            <td style={{ textAlign: 'center', padding: '0.5rem' }}>
                              <button 
                                onClick={() => handleRemoveItem(idx)} 
                                className="btn-icon" 
                                style={{ color: '#ef4444', padding: '0.35rem' }} 
                                title="Eliminar del estándar"
                              >
                                <X size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

              </div>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-tertiary)' }}>
            <Package size={64} style={{ opacity: 0.2, marginBottom: '1rem' }} />
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0, color: 'var(--text-secondary)' }}>Selecciona un estándar</h2>
            <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>o crea uno nuevo desde el botón "+ Nuevo" en la barra lateral.</p>
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
