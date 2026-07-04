import React, { useState, useEffect, useMemo } from 'react';
import { Search, Package, AlertTriangle, Wrench, Thermometer, Archive, Minus, Plus, Edit2, TrendingDown, CheckCircle, XCircle, DollarSign } from 'lucide-react';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { getTipoCambio, calcularPrecios, calcularPrecioManoDeObra } from '../../services/tipoCambioService';

const formatARS = (n) => n != null ? `$ ${n.toLocaleString('es-AR')}` : '—';

const Stock = () => {
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('Todas');
  const [filterStock, setFilterStock] = useState('todos'); // todos, bajo, sinstock
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [tc, setTc] = useState(null);

  // Unified collection — same as Lista de Precios
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'lista_precios'), (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // Load TC for inventory value
  useEffect(() => {
    (async () => {
      try { setTc(await getTipoCambio()); } catch (e) { console.error(e); }
    })();
  }, []);

  // Categories from data
  const categories = useMemo(() => {
    const cats = [...new Set(items.map(i => i.categoria).filter(Boolean))].sort();
    return ['Todas', ...cats];
  }, [items]);

  // Filtered
  const filtered = useMemo(() => {
    return items.filter(item => {
      // Only show materials/kits (skip mano_de_obra/servicio for stock)
      if (item.tipo === 'mano_de_obra' || item.tipo === 'servicio') return false;

      const term = searchTerm.toLowerCase();
      const matchSearch = !term || item.descripcion?.toLowerCase().includes(term) || item.proveedor?.toLowerCase().includes(term);
      const matchCat = activeTab === 'Todas' || item.categoria === activeTab;
      
      const stock = item.stock ?? 0;
      const minimo = item.stockMinimo ?? 0;
      let matchStock = true;
      if (filterStock === 'bajo') matchStock = stock > 0 && stock <= minimo;
      if (filterStock === 'sinstock') matchStock = stock === 0;
      
      return matchSearch && matchCat && matchStock;
    });
  }, [items, searchTerm, activeTab, filterStock]);

  // Stats
  const stats = useMemo(() => {
    const materiales = items.filter(i => i.tipo !== 'mano_de_obra' && i.tipo !== 'servicio');
    const conStock = materiales.filter(i => (i.stock ?? 0) > 0);
    const bajoStock = materiales.filter(i => {
      const s = i.stock ?? 0;
      const m = i.stockMinimo ?? 0;
      return s > 0 && m > 0 && s <= m;
    });
    const sinStock = materiales.filter(i => (i.stock ?? 0) === 0 && (i.stockMinimo ?? 0) > 0);

    // Inventory value
    let valorTotal = 0;
    if (tc) {
      for (const item of conStock) {
        if (item.costoUSD) {
          valorTotal += item.costoUSD * (item.stock ?? 0) * tc.valor;
        }
      }
    }

    return { total: materiales.length, conStock: conStock.length, bajoStock: bajoStock.length, sinStock: sinStock.length, valorTotal };
  }, [items, tc]);

  // Quick stock adjust
  const adjustStock = async (item, amount) => {
    const newQty = Math.max(0, (item.stock ?? 0) + amount);
    try {
      await updateDoc(doc(db, 'lista_precios', item.id), {
        stock: newQty,
        stockActualizadoEn: new Date().toISOString()
      });
    } catch (e) { console.error(e); }
  };

  // Inline edit
  const startEdit = (item) => {
    setEditingId(item.id);
    setEditValues({ stock: item.stock ?? 0, stockMinimo: item.stockMinimo ?? 0 });
  };

  const saveEdit = async (itemId) => {
    try {
      await updateDoc(doc(db, 'lista_precios', itemId), {
        stock: Number(editValues.stock) || 0,
        stockMinimo: Number(editValues.stockMinimo) || 0,
        stockActualizadoEn: new Date().toISOString()
      });
    } catch (e) { console.error(e); }
    setEditingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  const getStockStatus = (item) => {
    const stock = item.stock ?? 0;
    const reservado = item.stockReservado ?? 0;
    const disponible = Math.max(0, stock - reservado);
    const minimo = item.stockMinimo ?? 0;
    if (minimo === 0 && stock === 0) return { label: 'Sin datos', color: 'gray', icon: null };
    if (disponible === 0 && stock === 0) return { label: 'Sin stock', color: 'red', icon: <XCircle size={14} /> };
    if (disponible === 0 && stock > 0) return { label: 'Todo reservado', color: 'orange', icon: <AlertTriangle size={14} /> };
    if (minimo > 0 && disponible <= minimo) return { label: 'Bajo', color: 'orange', icon: <AlertTriangle size={14} /> };
    return { label: 'OK', color: 'green', icon: <CheckCircle size={14} /> };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Stats */}
      <div className="lp-stats" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <div className="lp-stat-card">
          <div className="lp-stat-icon blue"><Package size={18} /></div>
          <div className="lp-stat-content"><div className="lp-stat-value">{stats.total}</div><div className="lp-stat-label">Artículos</div></div>
        </div>
        <div className="lp-stat-card">
          <div className="lp-stat-icon green"><CheckCircle size={18} /></div>
          <div className="lp-stat-content"><div className="lp-stat-value">{stats.conStock}</div><div className="lp-stat-label">Con stock</div></div>
        </div>
        <div className="lp-stat-card">
          <div className="lp-stat-icon orange"><AlertTriangle size={18} /></div>
          <div className="lp-stat-content"><div className="lp-stat-value">{stats.bajoStock}</div><div className="lp-stat-label">Stock bajo</div></div>
        </div>
        <div className="lp-stat-card">
          <div className="lp-stat-icon" style={{ background: '#fef2f2', color: '#dc2626' }}><XCircle size={18} /></div>
          <div className="lp-stat-content"><div className="lp-stat-value">{stats.sinStock}</div><div className="lp-stat-label">Sin stock</div></div>
        </div>
        <div className="lp-stat-card">
          <div className="lp-stat-icon purple"><DollarSign size={18} /></div>
          <div className="lp-stat-content"><div className="lp-stat-value">{formatARS(Math.round(stats.valorTotal))}</div><div className="lp-stat-label">Valor inventario</div></div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="lp-toolbar">
        <div className="lp-toolbar-row">
          <div className="lp-search">
            <Search size={18} className="lp-search-icon" />
            <input type="text" className="input-field" style={{ paddingLeft: '2.5rem' }} placeholder="Buscar artículo o proveedor..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <select className="input-field lp-filter-select" value={filterStock} onChange={e => setFilterStock(e.target.value)}>
            <option value="todos">Todos</option>
            <option value="bajo">⚠ Stock bajo</option>
            <option value="sinstock">✕ Sin stock</option>
          </select>
        </div>
        <div className="lp-tabs">
          {categories.map(cat => {
            const count = cat === 'Todas'
              ? items.filter(i => i.tipo !== 'mano_de_obra' && i.tipo !== 'servicio').length
              : items.filter(i => i.categoria === cat && i.tipo !== 'mano_de_obra' && i.tipo !== 'servicio').length;
            return (
              <button key={cat} className={`lp-tab ${activeTab === cat ? 'active' : ''}`} onClick={() => setActiveTab(cat)}>
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
                <th className="col-desc">Artículo</th>
                <th>Proveedor</th>
                <th>Categoría</th>
                <th style={{ textAlign: 'center' }}>Estado</th>
                <th style={{ textAlign: 'center' }}>Stock Total</th>
                <th style={{ textAlign: 'center', background: '#fef9c3', color: '#92400e' }}>Reservado</th>
                <th style={{ textAlign: 'center', background: '#f0fdf4', color: '#166534' }}>Disponible</th>
                <th style={{ textAlign: 'center' }}>Mínimo</th>
                <th>Unidad</th>
                <th className="col-price">Costo USD</th>
                <th className="col-price">Valor stock ARS</th>
                <th style={{ textAlign: 'center' }}>Ajustar</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const status = getStockStatus(item);
                const stock = item.stock ?? 0;
                const minimo = item.stockMinimo ?? 0;
                const reservado = item.stockReservado ?? 0;
                const disponible = Math.max(0, stock - reservado);
                const isEditing = editingId === item.id;
                const valorLinea = tc && item.costoUSD ? Math.round(item.costoUSD * stock * tc.valor) : null;

                return (
                  <tr key={item.id} style={status.color === 'red' ? { background: 'rgba(220,38,38,0.04)' } : status.color === 'orange' ? { background: 'rgba(245,158,11,0.04)' } : {}}>
                    <td className="col-desc">
                      <div className="lp-item-name">{item.descripcion}</div>
                      {item.codigoGesdatta && <div className="lp-item-code">{item.codigoGesdatta}</div>}
                    </td>
                    <td><span className="lp-badge-cat">{item.proveedor || '—'}</span></td>
                    <td><span className="lp-badge-cat">{item.categoria || '—'}</span></td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                        padding: '0.15rem 0.5rem', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 600,
                        background: status.color === 'green' ? '#ecfdf5' : status.color === 'orange' ? '#fff7ed' : status.color === 'red' ? '#fef2f2' : '#f8fafc',
                        color: status.color === 'green' ? '#059669' : status.color === 'orange' ? '#d97706' : status.color === 'red' ? '#dc2626' : '#94a3b8',
                      }}>
                        {status.icon} {status.label}
                      </span>
                    </td>
                    {/* Stock Total */}
                    <td style={{ textAlign: 'center' }}>
                      {isEditing ? (
                        <input type="number" min="0" className="input-field" style={{ width: '70px', textAlign: 'center', padding: '0.25rem' }}
                          value={editValues.stock} onChange={e => setEditValues({ ...editValues, stock: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(item.id); if (e.key === 'Escape') cancelEdit(); }}
                          autoFocus />
                      ) : (
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: status.color === 'red' ? '#dc2626' : status.color === 'orange' ? '#d97706' : 'var(--text-primary)' }}>{stock}</span>
                      )}
                    </td>
                    {/* Reservado */}
                    <td style={{ textAlign: 'center', background: reservado > 0 ? '#fefce8' : 'transparent' }}>
                      {reservado > 0 ? (
                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#92400e', background: '#fef3c7', padding: '0.1rem 0.4rem', borderRadius: '6px' }}>
                          {reservado}
                        </span>
                      ) : (
                        <span style={{ color: '#cbd5e1', fontSize: '0.8rem' }}>—</span>
                      )}
                    </td>
                    {/* Disponible */}
                    <td style={{ textAlign: 'center', background: disponible === 0 && stock > 0 ? '#fef2f2' : disponible <= minimo && minimo > 0 ? '#fff7ed' : 'transparent' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem', color: disponible === 0 ? '#dc2626' : disponible <= minimo && minimo > 0 ? '#d97706' : '#059669' }}>
                        {disponible}
                      </span>
                    </td>
                    {/* Mínimo */}
                    <td style={{ textAlign: 'center' }}>
                      {isEditing ? (
                        <input type="number" min="0" className="input-field" style={{ width: '70px', textAlign: 'center', padding: '0.25rem' }}
                          value={editValues.stockMinimo} onChange={e => setEditValues({ ...editValues, stockMinimo: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(item.id); if (e.key === 'Escape') cancelEdit(); }} />
                      ) : (
                        <span style={{ color: 'var(--text-secondary)' }}>{minimo || '—'}</span>
                      )}
                    </td>
                    <td><span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{item.unidad || 'unidad'}</span></td>
                    <td className="col-price">
                      {item.costoUSD ? <span className="lp-price-usd">U$D {item.costoUSD.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span> : <span className="lp-price-null">—</span>}
                    </td>
                    <td className="col-price">
                      {valorLinea ? <span className="lp-price-ars">{formatARS(valorLinea)}</span> : <span className="lp-price-null">—</span>}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
                          <button className="lp-action-btn edit" onClick={() => saveEdit(item.id)} title="Guardar" style={{ color: '#059669' }}>✓</button>
                          <button className="lp-action-btn delete" onClick={cancelEdit} title="Cancelar">✕</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center', alignItems: 'center' }}>
                          <button className="lp-action-btn delete" onClick={() => adjustStock(item, -1)} title="-1" style={{ color: '#dc2626', fontWeight: 700 }}><Minus size={14} /></button>
                          <button className="lp-action-btn edit" onClick={() => startEdit(item)} title="Editar stock"><Edit2 size={13} /></button>
                          <button className="lp-action-btn edit" onClick={() => adjustStock(item, 1)} title="+1" style={{ color: '#059669', fontWeight: 700 }}><Plus size={14} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan="10" className="lp-empty">No se encontraron artículos con los filtros aplicados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="lp-table-footer">
            <span>Mostrando {filtered.length} artículos</span>
            <span>{stats.bajoStock} con stock bajo · {stats.sinStock} sin stock</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Stock;
