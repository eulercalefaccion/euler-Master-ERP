import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Boxes, Search, Plus, Edit2, X, Save, Power, Tag, Package, Layers,
  CheckCircle2, XCircle, Hash, DollarSign, FileText, ChevronUp, ChevronDown,
} from 'lucide-react';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot, addDoc, updateDoc, doc } from 'firebase/firestore';

/* ═══════════════════════════════════════════════════════════════════
   ARTÍCULOS — Maestro de artículos (sin precios)
   Usa la misma colección `lista_precios` que Lista de Precios y Stock.
   Patrón SAP/Odoo: maestro de ítems separado de la lista de precios.
   ═══════════════════════════════════════════════════════════════════ */

const COLLECTION = 'lista_precios';
const PAGE_SIZE = 300;

const TIPO_LABELS = { material: 'Material', mano_de_obra: 'Mano de obra', servicio: 'Servicio', kit: 'Kit' };
const TIPO_STYLES = {
  material: { background: '#eff6ff', color: '#2563eb' },
  mano_de_obra: { background: '#fef3c7', color: '#92400e' },
  servicio: { background: '#f0fdf4', color: '#15803d' },
  kit: { background: '#f5f3ff', color: '#7c3aed' },
};
const UNIDADES_BASE = [
  { value: 'unidad', label: 'Unidad' },
  { value: 'metro', label: 'Metro' },
  { value: 'm2', label: 'M²' },
  { value: 'rollo', label: 'Rollo' },
  { value: 'kg', label: 'Kg' },
  { value: 'litro', label: 'Litro' },
];

const EMPTY_FORM = {
  codigoGesdatta: '', descripcion: '', tipo: 'material', categoria: '', proveedor: '',
  unidad: 'unidad', activo: true, folletoUrl: '',
};

const COLUMNS = [
  { key: 'codigoGesdatta', label: 'Código', width: 120 },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'tipo', label: 'Tipo', width: 120 },
  { key: 'categoria', label: 'Categoría', width: 170 },
  { key: 'proveedor', label: 'Proveedor', width: 150 },
  { key: 'unidad', label: 'Unidad', width: 90 },
  { key: 'activo', label: 'Estado', width: 100 },
];

const norm = (v) => (v == null ? '' : String(v)).toLowerCase();

/* ── Estilos reutilizables (inline, siguiendo la convención del proyecto) ── */
const S = {
  card: {
    background: 'var(--bg-surface)', border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)',
  },
  th: {
    padding: '0.7rem 0.875rem', fontSize: '0.68rem', textTransform: 'uppercase',
    color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: '0.03em',
    borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap', textAlign: 'left',
    userSelect: 'none', background: 'var(--bg-surface-hover)', position: 'sticky', top: 0, zIndex: 5,
  },
  td: { padding: '0.55rem 0.875rem', borderBottom: '1px solid var(--border-light)', verticalAlign: 'middle' },
  pill: {
    display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.15rem 0.55rem',
    borderRadius: '9999px', fontSize: '0.68rem', fontWeight: 600, whiteSpace: 'nowrap',
  },
  chip: {
    display: 'inline-flex', alignItems: 'center', padding: '0.15rem 0.5rem', borderRadius: '4px',
    fontSize: '0.7rem', fontWeight: 500, background: 'var(--bg-surface-hover)',
    color: 'var(--text-secondary)', whiteSpace: 'nowrap',
  },
  actionBtn: {
    padding: '0.3rem', background: 'var(--bg-surface-hover)', border: 'none', borderRadius: '4px',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  formRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' },
  formGroup: { marginBottom: 0 },
};

const KpiCard = ({ icon, value, label, bg, color, onClick, active }) => (
  <div
    onClick={onClick}
    style={{
      ...S.card, borderRadius: 'var(--radius-md)', padding: '0.6rem 0.875rem',
      display: 'flex', alignItems: 'center', gap: '0.65rem',
      cursor: onClick ? 'pointer' : 'default', transition: 'all 0.2s',
      outline: active ? '2px solid var(--primary-600)' : 'none',
    }}
  >
    <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-sm)', background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {React.createElement(icon, { size: 18 })}
    </div>
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
        {value.toLocaleString('es-AR')}
      </span>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
    </div>
  </div>
);

const Articulos = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategoria, setFilterCategoria] = useState('todas');
  const [filterTipo, setFilterTipo] = useState('todos');
  const [filterEstado, setFilterEstado] = useState('activos');
  const [onlySinCodigo, setOnlySinCodigo] = useState(false);
  const [sort, setSort] = useState({ key: 'descripcion', dir: 'asc' });
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  // Suscripción en tiempo real a la colección compartida
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, COLLECTION),
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('Error cargando artículos:', err);
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  // Listas derivadas
  const categorias = useMemo(
    () => [...new Set(items.map((i) => i.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [items],
  );
  const proveedores = useMemo(
    () => [...new Set(items.map((i) => i.proveedor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [items],
  );
  const unidades = useMemo(() => {
    const base = new Set(UNIDADES_BASE.map((u) => u.value));
    const extra = [...new Set(items.map((i) => i.unidad).filter((u) => u && !base.has(u)))].sort();
    return [...UNIDADES_BASE, ...extra.map((u) => ({ value: u, label: u }))];
  }, [items]);

  // KPIs
  const stats = useMemo(() => {
    const activos = items.filter((i) => i.activo !== false).length;
    return {
      total: items.length,
      activos,
      inactivos: items.length - activos,
      categorias: categorias.length,
      sinCodigo: items.filter((i) => !String(i.codigoGesdatta || '').trim()).length,
    };
  }, [items, categorias]);

  // Filtrado + orden
  const filtered = useMemo(() => {
    const term = norm(searchTerm).trim();
    const result = items.filter((item) => {
      if (term) {
        const hay = norm(item.descripcion).includes(term)
          || norm(item.codigoGesdatta).includes(term)
          || norm(item.proveedor).includes(term)
          || norm(item.categoria).includes(term);
        if (!hay) return false;
      }
      if (filterCategoria !== 'todas' && item.categoria !== filterCategoria) return false;
      if (filterTipo !== 'todos' && item.tipo !== filterTipo) return false;
      const isActive = item.activo !== false;
      if (filterEstado === 'activos' && !isActive) return false;
      if (filterEstado === 'inactivos' && isActive) return false;
      if (onlySinCodigo && String(item.codigoGesdatta || '').trim()) return false;
      return true;
    });

    const { key, dir } = sort;
    const factor = dir === 'asc' ? 1 : -1;
    result.sort((a, b) => {
      let va;
      let vb;
      if (key === 'activo') {
        va = a.activo !== false ? 1 : 0;
        vb = b.activo !== false ? 1 : 0;
        return (va - vb) * factor;
      }
      if (key === 'tipo') {
        va = TIPO_LABELS[a.tipo] || a.tipo || '';
        vb = TIPO_LABELS[b.tipo] || b.tipo || '';
      } else {
        va = a[key] == null ? '' : String(a[key]);
        vb = b[key] == null ? '' : String(b[key]);
      }
      // Vacíos siempre al final
      if (!va && vb) return 1;
      if (va && !vb) return -1;
      return va.localeCompare(vb, 'es', { numeric: true, sensitivity: 'base' }) * factor;
    });
    return result;
  }, [items, searchTerm, filterCategoria, filterTipo, filterEstado, onlySinCodigo, sort]);

  const visibleItems = filtered.slice(0, visibleCount);
  const resetPaging = () => setVisibleCount(PAGE_SIZE);

  const handleSort = (key) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
    resetPaging();
  };

  const clearFilters = () => {
    setSearchTerm('');
    setFilterCategoria('todas');
    setFilterTipo('todos');
    setFilterEstado('todos');
    setOnlySinCodigo(false);
    resetPaging();
  };

  // ── CRUD ────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditingItem(null);
    setFormData(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setFormData({
      codigoGesdatta: item.codigoGesdatta || '',
      descripcion: item.descripcion || '',
      tipo: item.tipo || 'material',
      categoria: item.categoria || '',
      proveedor: item.proveedor || '',
      unidad: item.unidad || 'unidad',
      activo: item.activo !== false,
      folletoUrl: item.folletoUrl || '',
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isSubmitting) return;
    setIsModalOpen(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const descripcion = formData.descripcion.trim();
    if (!descripcion) return;

    const codigo = formData.codigoGesdatta.trim();
    if (codigo) {
      const dup = items.find((i) => i.id !== editingItem?.id && String(i.codigoGesdatta || '').trim().toLowerCase() === codigo.toLowerCase());
      if (dup && !window.confirm(`El código "${codigo}" ya está asignado a "${dup.descripcion}". ¿Guardar de todos modos?`)) return;
    }

    setIsSubmitting(true);
    const now = new Date().toISOString();
    // Sólo campos del maestro: los precios (costoUSD, markup, precioVentaUSD) no se tocan al editar.
    const masterFields = {
      codigoGesdatta: codigo || null,
      descripcion,
      tipo: formData.tipo,
      categoria: formData.categoria.trim(),
      proveedor: formData.proveedor.trim() || null,
      unidad: formData.unidad,
      activo: !!formData.activo,
      folletoUrl: formData.folletoUrl.trim() || null,
      actualizadoEn: now,
    };
    try {
      if (editingItem) {
        await updateDoc(doc(db, COLLECTION, editingItem.id), masterFields);
      } else {
        await addDoc(collection(db, COLLECTION), {
          ...masterFields,
          costoUSD: null,
          markup: null,
          precioVentaUSD: null,
          creadoEn: now,
        });
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      alert('Error al guardar el artículo');
    }
    setIsSubmitting(false);
  };

  const handleToggleActivo = async (item) => {
    const isActive = item.activo !== false;
    const msg = isActive
      ? `¿Desactivar "${item.descripcion}"? No aparecerá en nuevas cargas, pero se conserva su historial y precios.`
      : `¿Reactivar "${item.descripcion}"?`;
    if (!window.confirm(msg)) return;
    setTogglingId(item.id);
    try {
      await updateDoc(doc(db, COLLECTION, item.id), { activo: !isActive, actualizadoEn: new Date().toISOString() });
    } catch (err) {
      console.error(err);
      alert('Error al cambiar el estado');
    }
    setTogglingId(null);
  };

  const setField = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const hasFilters = searchTerm || filterCategoria !== 'todas' || filterTipo !== 'todos' || filterEstado !== 'todos' || onlySinCodigo;

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0.75rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
          <div style={{
            width: 44, height: 44, borderRadius: 'var(--radius-md)', flexShrink: 0,
            background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
          }}>
            <Boxes size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              Artículos
            </h1>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)', maxWidth: 720 }}>
              Maestro de productos, materiales y servicios: código, categoría, proveedor y unidad. Los precios se gestionan en Lista de Precios.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/lista-precios')} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <DollarSign size={16} /> Ver precios
          </button>
          <button type="button" className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Plus size={16} /> Nuevo artículo
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.625rem' }}>
        <KpiCard icon={Package} value={stats.total} label="Total artículos" bg="#eff6ff" color="#3b82f6"
          onClick={() => { setFilterEstado('todos'); setOnlySinCodigo(false); resetPaging(); }} />
        <KpiCard icon={CheckCircle2} value={stats.activos} label="Activos" bg="#ecfdf5" color="#10b981"
          active={filterEstado === 'activos'} onClick={() => { setFilterEstado('activos'); resetPaging(); }} />
        <KpiCard icon={XCircle} value={stats.inactivos} label="Inactivos" bg="#fef2f2" color="#ef4444"
          active={filterEstado === 'inactivos'} onClick={() => { setFilterEstado('inactivos'); resetPaging(); }} />
        <KpiCard icon={Layers} value={stats.categorias} label="Categorías" bg="#f5f3ff" color="#8b5cf6" />
        <KpiCard icon={Hash} value={stats.sinCodigo} label="Sin código" bg="#fff7ed" color="#f97316"
          active={onlySinCodigo} onClick={() => { setOnlySinCodigo((v) => !v); resetPaging(); }} />
      </div>

      {/* Toolbar */}
      <div style={{ ...S.card, padding: '0.625rem 0.875rem', display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 250, maxWidth: 420 }}>
          <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
          <input
            type="text"
            className="input-field"
            style={{ paddingLeft: '2.25rem' }}
            placeholder="Buscar por descripción, código, proveedor o categoría..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); resetPaging(); }}
          />
        </div>
        <select className="input-field" style={{ minWidth: 180, width: 'auto' }} value={filterCategoria}
          onChange={(e) => { setFilterCategoria(e.target.value); resetPaging(); }}>
          <option value="todas">Todas las categorías</option>
          {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="input-field" style={{ minWidth: 150, width: 'auto' }} value={filterTipo}
          onChange={(e) => { setFilterTipo(e.target.value); resetPaging(); }}>
          <option value="todos">Todos los tipos</option>
          <option value="material">Materiales</option>
          <option value="mano_de_obra">Mano de obra</option>
          <option value="servicio">Servicios</option>
          <option value="kit">Kits</option>
        </select>
        <select className="input-field" style={{ minWidth: 130, width: 'auto' }} value={filterEstado}
          onChange={(e) => { setFilterEstado(e.target.value); resetPaging(); }}>
          <option value="activos">Activos</option>
          <option value="inactivos">Inactivos</option>
          <option value="todos">Todos</option>
        </select>
        {onlySinCodigo && (
          <span style={{ ...S.pill, background: '#fff7ed', color: '#c2410c' }}>
            <Hash size={12} /> Sin código
            <button type="button" onClick={() => { setOnlySinCodigo(false); resetPaging(); }} title="Quitar filtro"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', display: 'flex' }}>
              <X size={12} />
            </button>
          </span>
        )}
        {hasFilters && (
          <button type="button" onClick={clearFilters}
            style={{ background: 'none', border: 'none', color: 'var(--primary-600)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Tabla */}
      <div style={{ ...S.card, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr>
                {COLUMNS.map((col) => {
                  const isSorted = sort.key === col.key;
                  return (
                    <th key={col.key} onClick={() => handleSort(col.key)} title="Ordenar"
                      style={{ ...S.th, width: col.width, cursor: 'pointer', color: isSorted ? 'var(--primary-600)' : S.th.color }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                        {col.label}
                        {isSorted && (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                      </span>
                    </th>
                  );
                })}
                <th style={{ ...S.th, textAlign: 'right', width: 90 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => {
                const isActive = item.activo !== false;
                return (
                  <tr key={item.id} style={{ opacity: isActive ? 1 : 0.6 }}>
                    <td style={S.td}>
                      {item.codigoGesdatta
                        ? <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 600 }}>{item.codigoGesdatta}</span>
                        : <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic', fontSize: '0.72rem' }}>Sin código</span>}
                    </td>
                    <td style={{ ...S.td, minWidth: 240 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>{item.descripcion || '—'}</span>
                        {item.folletoUrl && (
                          <a href={item.folletoUrl} target="_blank" rel="noopener noreferrer" title="Ver folleto PDF"
                            style={{ display: 'inline-flex', color: 'var(--primary-600)' }}>
                            <FileText size={13} />
                          </a>
                        )}
                      </div>
                    </td>
                    <td style={S.td}>
                      <span style={{ ...S.pill, ...(TIPO_STYLES[item.tipo] || { background: 'var(--bg-surface-hover)', color: 'var(--text-secondary)' }) }}>
                        {TIPO_LABELS[item.tipo] || item.tipo || '—'}
                      </span>
                    </td>
                    <td style={S.td}>
                      {item.categoria
                        ? <span style={S.chip}><Tag size={11} style={{ marginRight: 4 }} />{item.categoria}</span>
                        : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                    </td>
                    <td style={{ ...S.td, color: 'var(--text-secondary)' }}>{item.proveedor || '—'}</td>
                    <td style={{ ...S.td, color: 'var(--text-secondary)' }}>{item.unidad || '—'}</td>
                    <td style={S.td}>
                      <span style={{
                        ...S.pill,
                        background: isActive ? '#ecfdf5' : '#f1f5f9',
                        color: isActive ? '#047857' : '#64748b',
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? '#10b981' : '#94a3b8' }} />
                        {isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={S.td}>
                      <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => openEdit(item)} title="Editar"
                          style={{ ...S.actionBtn, color: 'var(--primary-600)' }}>
                          <Edit2 size={14} />
                        </button>
                        <button type="button" onClick={() => handleToggleActivo(item)} disabled={togglingId === item.id}
                          title={isActive ? 'Desactivar' : 'Activar'}
                          style={{ ...S.actionBtn, color: isActive ? '#dc2626' : '#059669', opacity: togglingId === item.id ? 0.5 : 1 }}>
                          <Power size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length + 1} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    {items.length === 0
                      ? 'No hay artículos cargados todavía.'
                      : 'No se encontraron artículos con los filtros aplicados.'}
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={COLUMNS.length + 1} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    Cargando artículos...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {filtered.length > visibleCount && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '0.85rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
                Mostrar más ({Math.min(PAGE_SIZE, filtered.length - visibleCount)} de {filtered.length - visibleCount} restantes)
              </button>
            </div>
          )}
        </div>
        {filtered.length > 0 && (
          <div style={{
            padding: '0.65rem 1rem', background: 'var(--bg-surface-hover)', borderTop: '1px solid var(--border-light)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)',
          }}>
            <span>Mostrando {visibleItems.length.toLocaleString('es-AR')} de {filtered.length.toLocaleString('es-AR')} filtrados · {items.length.toLocaleString('es-AR')} en total</span>
            <span>{stats.activos.toLocaleString('es-AR')} activos · {stats.inactivos.toLocaleString('es-AR')} inactivos</span>
          </div>
        )}
      </div>

      {/* Modal crear / editar */}
      {isModalOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
        >
          <div style={{
            background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
            width: 580, maxWidth: '95vw', maxHeight: '88vh', overflowY: 'auto', padding: '1.5rem',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-light)',
            }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Boxes size={18} style={{ color: 'var(--primary-600)' }} />
                {editingItem ? 'Editar artículo' : 'Nuevo artículo'}
              </h3>
              <button type="button" onClick={closeModal}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '0.25rem', display: 'flex' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={S.formRow}>
                <div className="form-group" style={S.formGroup}>
                  <label className="form-label">Código</label>
                  <input type="text" className="input-field" value={formData.codigoGesdatta} onChange={setField('codigoGesdatta')}
                    placeholder="Ej: CAL-001" style={{ fontFamily: 'monospace' }} />
                </div>
                <div className="form-group" style={S.formGroup}>
                  <label className="form-label">Tipo</label>
                  <select className="input-field" value={formData.tipo} onChange={setField('tipo')}>
                    <option value="material">Material</option>
                    <option value="mano_de_obra">Mano de obra</option>
                    <option value="servicio">Servicio</option>
                    <option value="kit">Kit</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={S.formGroup}>
                <label className="form-label">Descripción <span style={{ color: 'var(--accent-600)' }}>*</span></label>
                <input required type="text" className="input-field" value={formData.descripcion} onChange={setField('descripcion')}
                  placeholder="Ej: Caldera Baxi Eco Nova 24" autoFocus />
              </div>

              <div style={S.formRow}>
                <div className="form-group" style={S.formGroup}>
                  <label className="form-label">Categoría</label>
                  <input type="text" className="input-field" list="articulos-categorias-list" value={formData.categoria}
                    onChange={setField('categoria')} placeholder="Seleccionar o escribir nueva" />
                  <datalist id="articulos-categorias-list">
                    {categorias.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div className="form-group" style={S.formGroup}>
                  <label className="form-label">Proveedor</label>
                  <input type="text" className="input-field" list="articulos-proveedores-list" value={formData.proveedor}
                    onChange={setField('proveedor')} placeholder="Ej: REHAU" />
                  <datalist id="articulos-proveedores-list">
                    {proveedores.map((p) => <option key={p} value={p} />)}
                  </datalist>
                </div>
              </div>

              <div style={S.formRow}>
                <div className="form-group" style={S.formGroup}>
                  <label className="form-label">Unidad</label>
                  <select className="input-field" value={formData.unidad} onChange={setField('unidad')}>
                    {unidades.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                </div>
                <div className="form-group" style={S.formGroup}>
                  <label className="form-label">Estado</label>
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', height: 38,
                    fontSize: '0.85rem', color: 'var(--text-primary)',
                  }}>
                    <input type="checkbox" checked={formData.activo} onChange={setField('activo')} />
                    {formData.activo ? 'Activo' : 'Inactivo'}
                  </label>
                </div>
              </div>

              <div className="form-group" style={S.formGroup}>
                <label className="form-label">URL del folleto PDF</label>
                <input type="text" className="input-field" value={formData.folletoUrl} onChange={setField('folletoUrl')}
                  placeholder="Ej: https://firebasestorage.googleapis.com/.../folleto.pdf" />
              </div>

              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 0.85rem',
                background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 'var(--radius-md)',
                fontSize: '0.78rem', color: '#1e40af',
              }}>
                <DollarSign size={14} style={{ flexShrink: 0 }} />
                <span>
                  {editingItem
                    ? 'Los precios (costo, markup y venta) no se modifican desde aquí.'
                    : 'El artículo se crea sin precio.'}{' '}
                  <button type="button" onClick={() => navigate('/lista-precios')}
                    style={{ background: 'none', border: 'none', padding: 0, color: '#1d4ed8', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit' }}>
                    Gestionar en Lista de Precios
                  </button>
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={isSubmitting}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Save size={16} /> {isSubmitting ? 'Guardando...' : editingItem ? 'Guardar cambios' : 'Crear artículo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Articulos;
