import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, DollarSign, RefreshCw, X, Save, Edit2, Trash2, Package, Wrench, Upload, Tag, TrendingUp, Layers, AlertCircle } from 'lucide-react';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDocs, writeBatch } from 'firebase/firestore';
import { getTipoCambio, forzarActualizacionTC, calcularPrecios, calcularPrecioManoDeObra, getEstadoTC } from '../../services/tipoCambioService';
import { useAuth } from '../../context/AuthContext';
import { datosIniciales, categoriasIniciales } from './datosIniciales';
import './ListaPrecios.css';

const formatARS = (n) => n != null ? `$ ${n.toLocaleString('es-AR')}` : '—';
const formatUSD = (n) => n != null ? `U$D ${n.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : null;

const TIPO_LABELS = { material: 'Material', mano_de_obra: 'Mano de obra', servicio: 'Servicio', kit: 'Kit' };

const ListaPrecios = () => {
  const { currentUser } = useAuth();
  const [items, setItems] = useState([]);
  const [tc, setTc] = useState(null);
  const [tcLoading, setTcLoading] = useState(true);
  const [tcRefreshing, setTcRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('Todas');
  const [activeType, setActiveType] = useState('todos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  const emptyForm = { descripcion: '', proveedor: '', categoria: '', tipo: 'material', costoUSD: '', markup: '1.4', precioVentaUSD: '', unidad: 'unidad', activo: true };
  const [formData, setFormData] = useState(emptyForm);

  // Load items
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'lista_precios'), (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // Load TC
  useEffect(() => {
    (async () => {
      try {
        const data = await getTipoCambio();
        setTc(data);
      } catch (e) { console.error(e); }
      setTcLoading(false);
    })();
  }, []);

  const handleRefreshTC = async () => {
    setTcRefreshing(true);
    try {
      const data = await forzarActualizacionTC(currentUser?.uid);
      setTc({ valor: data.valor, fechaActualizacion: data.fechaActualizacion, ultimaConsultaApi: data.ultimaConsultaApi, desactualizado: false, errorApi: false });
    } catch (e) { console.error(e); alert('Error al actualizar TC'); }
    setTcRefreshing(false);
  };

  // Categories from data
  const categories = useMemo(() => {
    const cats = [...new Set(items.map(i => i.categoria).filter(Boolean))].sort();
    return ['Todas', ...cats];
  }, [items]);

  // Filtered items
  const filtered = useMemo(() => {
    return items.filter(item => {
      const term = searchTerm.toLowerCase();
      const matchSearch = !term || item.descripcion?.toLowerCase().includes(term) || item.proveedor?.toLowerCase().includes(term) || item.codigoGesdatta?.toLowerCase().includes(term);
      const matchCat = activeCategory === 'Todas' || item.categoria === activeCategory;
      const matchType = activeType === 'todos' || item.tipo === activeType;
      return matchSearch && matchCat && matchType;
    });
  }, [items, searchTerm, activeCategory, activeType]);

  // Stats
  const stats = useMemo(() => ({
    total: items.length,
    conPrecio: items.filter(i => i.costoUSD || i.precioVentaUSD).length,
    categorias: new Set(items.map(i => i.categoria).filter(Boolean)).size,
    sinPrecio: items.filter(i => !i.costoUSD && !i.precioVentaUSD).length,
  }), [items]);

  const tcEstado = tc ? getEstadoTC(tc.ultimaConsultaApi, tc.errorApi) : null;

  // Price calculation helper
  const getPrices = (item) => {
    if (!tc) return null;
    if (item.tipo === 'mano_de_obra' || (item.tipo === 'servicio' && item.precioVentaUSD)) {
      return calcularPrecioManoDeObra(item.precioVentaUSD, tc.valor);
    }
    return calcularPrecios(item.costoUSD, item.markup, tc.valor);
  };

  // CRUD
  const openCreate = () => { setEditingItem(null); setFormData(emptyForm); setIsModalOpen(true); };
  const openEdit = (item) => {
    setEditingItem(item);
    setFormData({
      descripcion: item.descripcion || '', proveedor: item.proveedor || '', categoria: item.categoria || '',
      tipo: item.tipo || 'material', costoUSD: item.costoUSD ?? '', markup: item.markup ?? '',
      precioVentaUSD: item.precioVentaUSD ?? '', unidad: item.unidad || 'unidad', activo: item.activo !== false,
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.descripcion) return;
    setIsSubmitting(true);
    const isMO = formData.tipo === 'mano_de_obra' || (formData.tipo === 'servicio' && formData.precioVentaUSD);
    const payload = {
      descripcion: formData.descripcion, proveedor: formData.proveedor || null, categoria: formData.categoria,
      tipo: formData.tipo, unidad: formData.unidad, activo: formData.activo,
      costoUSD: isMO ? null : (formData.costoUSD ? Number(formData.costoUSD) : null),
      markup: isMO ? null : (formData.markup ? Number(formData.markup) : null),
      precioVentaUSD: isMO ? (formData.precioVentaUSD ? Number(formData.precioVentaUSD) : null) : null,
      actualizadoEn: new Date().toISOString(),
    };
    try {
      if (editingItem) {
        await updateDoc(doc(db, 'lista_precios', editingItem.id), payload);
      } else {
        payload.creadoEn = new Date().toISOString();
        await addDoc(collection(db, 'lista_precios'), payload);
      }
      setIsModalOpen(false);
    } catch (err) { console.error(err); alert('Error al guardar'); }
    setIsSubmitting(false);
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`¿Eliminar "${item.descripcion}"?`)) return;
    try { await deleteDoc(doc(db, 'lista_precios', item.id)); } catch (e) { alert('Error al eliminar'); }
  };

  // Import
  const handleImport = async () => {
    console.log('Import started, items:', datosIniciales.length);
    setImporting(true);
    setImportProgress(0);
    const batchSize = 400;
    try {
      for (let i = 0; i < datosIniciales.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = datosIniciales.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i/batchSize)+1}, items ${i} to ${i+chunk.length}`);
        for (const item of chunk) {
          const ref = doc(collection(db, 'lista_precios'));
          batch.set(ref, { ...item, creadoEn: new Date().toISOString(), actualizadoEn: new Date().toISOString() });
        }
        await batch.commit();
        const progress = Math.min(100, Math.round(((i + chunk.length) / datosIniciales.length) * 100));
        setImportProgress(progress);
        console.log(`Batch committed, progress: ${progress}%`);
      }
      console.log('Import complete!');
      alert(`✓ ${datosIniciales.length} ítems importados correctamente.`);
    } catch (e) {
      console.error('Import error:', e);
      alert('Error en la importación: ' + e.message);
    }
    setImporting(false);
  };

  // Form preview prices
  const previewPrices = useMemo(() => {
    if (!tc) return null;
    const isMO = formData.tipo === 'mano_de_obra' || (formData.tipo === 'servicio' && formData.precioVentaUSD);
    if (isMO && formData.precioVentaUSD) return calcularPrecioManoDeObra(Number(formData.precioVentaUSD), tc.valor);
    if (!isMO && formData.costoUSD && formData.markup) return calcularPrecios(Number(formData.costoUSD), Number(formData.markup), tc.valor);
    return null;
  }, [formData, tc]);

  const isManoDeObra = formData.tipo === 'mano_de_obra' || formData.tipo === 'servicio';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* TC Banner */}
      <div className="lp-tc-banner">
        <div className="lp-tc-left">
          <div className="lp-tc-icon"><DollarSign size={22} /></div>
          <div className="lp-tc-info">
            <div className="lp-tc-label">Dólar BNA Venta</div>
            <div className="lp-tc-valor">
              {tcLoading ? '...' : tc ? <>{tc.valor.toLocaleString('es-AR', { minimumFractionDigits: 2 })} <span>ARS/USD</span></> : 'Error'}
            </div>
          </div>
        </div>
        <div className="lp-tc-right">
          {tcEstado && (
            <div className="lp-tc-status" data-nivel={tcEstado.nivel}>
              <div className="lp-tc-dot" />
              {tcEstado.label}
            </div>
          )}
          {tc?.fechaActualizacion && (
            <div className="lp-tc-fecha">
              BNA: {new Date(tc.fechaActualizacion).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
          <button className={`lp-tc-btn-refresh ${tcRefreshing ? 'rotating' : ''}`} onClick={handleRefreshTC} disabled={tcRefreshing}>
            <RefreshCw size={14} /> Actualizar TC
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="lp-stats">
        <div className="lp-stat-card">
          <div className="lp-stat-icon blue"><Package size={20} /></div>
          <div className="lp-stat-content"><div className="lp-stat-value">{stats.total}</div><div className="lp-stat-label">Ítems totales</div></div>
        </div>
        <div className="lp-stat-card">
          <div className="lp-stat-icon green"><TrendingUp size={20} /></div>
          <div className="lp-stat-content"><div className="lp-stat-value">{stats.conPrecio}</div><div className="lp-stat-label">Con precio USD</div></div>
        </div>
        <div className="lp-stat-card">
          <div className="lp-stat-icon orange"><AlertCircle size={20} /></div>
          <div className="lp-stat-content"><div className="lp-stat-value">{stats.sinPrecio}</div><div className="lp-stat-label">Pendientes de precio</div></div>
        </div>
        <div className="lp-stat-card">
          <div className="lp-stat-icon purple"><Layers size={20} /></div>
          <div className="lp-stat-content"><div className="lp-stat-value">{stats.categorias}</div><div className="lp-stat-label">Categorías</div></div>
        </div>
      </div>

      {/* Import banner */}
      {items.length === 0 && !importing && (
        <div className="lp-import-banner">
          <div className="lp-import-info">
            <div className="icon"><Upload size={22} /></div>
            <div className="lp-import-text">
              <h4>Importar catálogo inicial</h4>
              <p>{datosIniciales.length} ítems (Gesdatta + precios Excel) listos para cargar</p>
            </div>
          </div>
          <button className="lp-btn-import" onClick={handleImport}><Upload size={16} /> Importar datos</button>
        </div>
      )}
      {importing && (
        <div className="lp-import-banner">
          <div className="lp-import-info" style={{flex:1}}>
            <div className="icon"><Upload size={22} /></div>
            <div className="lp-import-text" style={{flex:1}}>
              <h4>Importando... {importProgress}%</h4>
              <div className="lp-progress"><div className="lp-progress-bar" style={{ width: `${importProgress}%` }} /></div>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="lp-toolbar">
        <div className="lp-toolbar-row">
          <div className="lp-search">
            <Search size={18} className="lp-search-icon" />
            <input type="text" className="input-field" style={{ paddingLeft: '2.5rem' }} placeholder="Buscar por descripción, proveedor o código..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <select className="input-field lp-filter-select" value={activeType} onChange={e => setActiveType(e.target.value)}>
            <option value="todos">Todos los tipos</option>
            <option value="material">Materiales</option>
            <option value="mano_de_obra">Mano de obra</option>
            <option value="servicio">Servicios</option>
            <option value="kit">Kits</option>
          </select>
          <button className="btn btn-primary" onClick={openCreate}><Plus size={18} /> Nuevo Ítem</button>
        </div>
        <div className="lp-tabs">
          {categories.map(cat => {
            const count = cat === 'Todas' ? items.length : items.filter(i => i.categoria === cat).length;
            return (
              <button key={cat} className={`lp-tab ${activeCategory === cat ? 'active' : ''}`} onClick={() => setActiveCategory(cat)}>
                {cat}<span className="lp-tab-count">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="lp-table-container">
        <div className="lp-table-scroll">
          <table className="lp-table">
            <thead>
              <tr>
                <th className="col-desc">Descripción</th>
                <th>Proveedor</th>
                <th>Tipo</th>
                <th className="col-price">Costo USD</th>
                <th className="col-price" style={{textAlign:'center'}}>Markup</th>
                <th className="col-price">Minorista s/IVA</th>
                <th className="col-price">Mayorista s/IVA</th>
                <th className="col-price">Minorista c/IVA</th>
                <th className="col-price" style={{textAlign:'center'}}>Margen</th>
                <th style={{textAlign:'right'}}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const prices = getPrices(item);
                const isMO = item.tipo === 'mano_de_obra' || (item.tipo === 'servicio' && item.precioVentaUSD);
                const hasCost = isMO ? !!item.precioVentaUSD : !!item.costoUSD;

                return (
                  <tr key={item.id}>
                    <td className="col-desc">
                      <div className="lp-item-name">{item.descripcion}</div>
                      {item.codigoGesdatta && <div className="lp-item-code">{item.codigoGesdatta}</div>}
                    </td>
                    <td><span className="lp-badge-cat">{item.proveedor || '—'}</span></td>
                    <td><span className={`lp-badge-tipo ${item.tipo}`}>{TIPO_LABELS[item.tipo] || item.tipo}</span></td>
                    <td className="col-price">
                      {isMO ? (
                        item.precioVentaUSD ? <span className="lp-price-usd">{formatUSD(item.precioVentaUSD)}</span> : <span className="lp-price-null">Sin precio</span>
                      ) : (
                        item.costoUSD ? <span className="lp-price-usd">{formatUSD(item.costoUSD)}</span> : <span className="lp-price-null">Sin costo</span>
                      )}
                    </td>
                    <td className="col-price" style={{textAlign:'center'}}>
                      {!isMO && item.markup ? <span style={{fontWeight:600}}>{item.markup}x</span> : <span className="lp-price-null">—</span>}
                    </td>
                    <td className="col-price">
                      {prices ? <span className="lp-price-ars">{formatARS(prices.minoristaNetoARS)}</span> : <span className="lp-price-null">{hasCost ? '...' : '—'}</span>}
                    </td>
                    <td className="col-price">
                      {prices?.mayoristaNetoARS ? <span className="lp-price-ars-secondary">{formatARS(prices.mayoristaNetoARS)}</span> : <span className="lp-price-null">—</span>}
                    </td>
                    <td className="col-price">
                      {prices ? <span className="lp-price-iva">{formatARS(prices.minoristaConIVAARS)}</span> : <span className="lp-price-null">—</span>}
                    </td>
                    <td className="col-price" style={{textAlign:'center'}}>
                      {prices?.margenPorcentaje != null ? (
                        <span className={`lp-margen ${prices.margenPorcentaje >= 30 ? 'high' : prices.margenPorcentaje >= 20 ? 'medium' : 'low'}`}>{prices.margenPorcentaje}%</span>
                      ) : <span className="lp-price-null">—</span>}
                    </td>
                    <td>
                      <div className="lp-actions">
                        <button className="lp-action-btn edit" onClick={() => openEdit(item)} title="Editar"><Edit2 size={14} /></button>
                        <button className="lp-action-btn delete" onClick={() => handleDelete(item)} title="Eliminar"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan="10" className="lp-empty">{items.length === 0 ? 'No hay ítems cargados. Importá el catálogo inicial para comenzar.' : 'No se encontraron ítems con los filtros aplicados.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="lp-table-footer">
            <span>Mostrando {filtered.length} de {items.length} ítems</span>
            <span>{stats.conPrecio} con precio · {stats.sinPrecio} pendientes</span>
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="lp-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false); }}>
          <div className="lp-modal">
            <div className="lp-modal-header">
              <h3>{editingItem ? 'Editar Ítem' : 'Nuevo Ítem'}</h3>
              <button className="lp-modal-close" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
            </div>
            <form className="lp-form" onSubmit={handleSave}>
              <div className="form-group" style={{marginBottom:0}}>
                <label className="form-label">Descripción <span style={{color:'var(--accent-600)'}}>*</span></label>
                <input required type="text" className="input-field" value={formData.descripcion} onChange={e => setFormData({...formData, descripcion: e.target.value})} placeholder="Ej: Caldera Baxi Eco Nova 24" />
              </div>
              <div className="lp-form-row">
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="form-label">Tipo</label>
                  <select className="input-field" value={formData.tipo} onChange={e => setFormData({...formData, tipo: e.target.value})}>
                    <option value="material">Material</option>
                    <option value="mano_de_obra">Mano de obra</option>
                    <option value="servicio">Servicio</option>
                    <option value="kit">Kit</option>
                  </select>
                </div>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="form-label">Categoría</label>
                  <input type="text" className="input-field" list="categorias-list" value={formData.categoria} onChange={e => setFormData({...formData, categoria: e.target.value})} placeholder="Seleccionar o escribir nueva" />
                  <datalist id="categorias-list">
                    {[...new Set([...categoriasIniciales, ...categories.filter(c => c !== 'Todas')])].sort().map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
              </div>
              <div className="lp-form-row">
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="form-label">Proveedor</label>
                  <input type="text" className="input-field" value={formData.proveedor} onChange={e => setFormData({...formData, proveedor: e.target.value})} placeholder="Ej: REHAU" />
                </div>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="form-label">Unidad</label>
                  <select className="input-field" value={formData.unidad} onChange={e => setFormData({...formData, unidad: e.target.value})}>
                    <option value="unidad">Unidad</option>
                    <option value="metro">Metro</option>
                    <option value="m2">M²</option>
                    <option value="rollo">Rollo</option>
                    <option value="kg">Kg</option>
                    <option value="litro">Litro</option>
                  </select>
                </div>
              </div>

              {isManoDeObra ? (
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="form-label">Precio de venta USD</label>
                  <input type="number" step="0.01" min="0" className="input-field" value={formData.precioVentaUSD} onChange={e => setFormData({...formData, precioVentaUSD: e.target.value})} placeholder="Ej: 35.00" />
                </div>
              ) : (
                <div className="lp-form-row">
                  <div className="form-group" style={{marginBottom:0}}>
                    <label className="form-label">Costo USD (con descuento)</label>
                    <input type="number" step="0.01" min="0" className="input-field" value={formData.costoUSD} onChange={e => setFormData({...formData, costoUSD: e.target.value})} placeholder="Ej: 850.00" />
                  </div>
                  <div className="form-group" style={{marginBottom:0}}>
                    <label className="form-label">Markup (factor)</label>
                    <input type="number" step="0.01" min="1" className="input-field" value={formData.markup} onChange={e => setFormData({...formData, markup: e.target.value})} placeholder="Ej: 1.4" />
                  </div>
                </div>
              )}

              {previewPrices && (
                <div className="lp-preview-prices">
                  <h4>Vista previa de precios (TC: {tc?.valor})</h4>
                  <div className="lp-preview-grid">
                    <div className="lp-preview-item"><span className="label">Minorista s/IVA</span><span className="value">{formatARS(previewPrices.minoristaNetoARS)}</span></div>
                    <div className="lp-preview-item"><span className="label">Minorista c/IVA</span><span className="value">{formatARS(previewPrices.minoristaConIVAARS)}</span></div>
                    {previewPrices.mayoristaNetoARS && <div className="lp-preview-item"><span className="label">Mayorista s/IVA</span><span className="value">{formatARS(previewPrices.mayoristaNetoARS)}</span></div>}
                    {previewPrices.margenPorcentaje != null && <div className="lp-preview-item"><span className="label">Margen</span><span className="value">{previewPrices.margenPorcentaje}%</span></div>}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}><Save size={16} /> {editingItem ? 'Guardar cambios' : 'Crear ítem'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ListaPrecios;
