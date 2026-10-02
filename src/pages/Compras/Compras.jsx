import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ShoppingBag, Plus, Filter, Search, FileText, CheckCircle, AlertTriangle, 
  Camera, Upload, Sparkles, Trash2, Check, HelpCircle, RefreshCw, Settings, 
  ExternalLink, ChevronDown, Box, ArrowRight, X, ArrowUpRight
} from 'lucide-react';
import { getCompras, crearComprobanteCompra, ALICUOTAS_IVA } from '../../services/comprasService';
import { getEmpresas } from '../../services/empresasService';
import { getPlanCuentas, CENTROS_COSTO_BASE } from '../../services/contabilidadService';
import { parseFacturaConIA } from '../../services/aiOcrService';
import { matchArticleWithCatalog, crearArticuloEnERP } from '../../services/productMatcherService';
import { getTipoCambio } from '../../services/tipoCambioService';
import { datosIniciales } from '../ListaPrecios/datosIniciales';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot } from 'firebase/firestore';
import './Compras.css';

const Compras = () => {
  const [compras, setCompras] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [obras, setObras] = useState([]);
  const [planCuentas, setPlanCuentas] = useState([]);
  const [catalogoArticulos, setCatalogoArticulos] = useState([]);
  const [tipoCambio, setTipoCambio] = useState(null);

  const [empresaFiltro, setEmpresaFiltro] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScanningIA, setIsScanningIA] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Selector manual de artículo para enlazar
  const [selectingItemForLineIdx, setSelectingItemForLineIdx] = useState(null);
  const [catalogSearchTerm, setCatalogSearchTerm] = useState('');

  // Configuración de API Key opcional
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState('');

  // Form State
  const initialForm = {
    empresaId: 'euler-calefaccion',
    proveedorNombre: '',
    proveedorCuit: '',
    tipoComprobante: 'FAA',
    puntoVenta: '1',
    numeroComprobante: '',
    fechaEmision: new Date().toISOString().split('T')[0],
    fechaContable: new Date().toISOString().split('T')[0],
    ingresaStock: true,
    adjuntoUrl: null,
    lineas: []
  };

  const [formData, setFormData] = useState(initialForm);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  // Carga inicial de datos
  const cargarDatos = async () => {
    try {
      const listE = await getEmpresas();
      setEmpresas(listE);
      const listC = await getPlanCuentas();
      setPlanCuentas(listC);
      const dataCom = await getCompras(empresaFiltro || null);
      setCompras(dataCom);
    } catch (e) {
      console.error('Error cargando compras:', e);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, [empresaFiltro]);

  // Cargar Tipo de Cambio actual
  useEffect(() => {
    getTipoCambio().then(setTipoCambio).catch(console.error);
  }, []);

  // Suscripción a Obras y Lista de Precios / Stock
  useEffect(() => {
    const unsubO = onSnapshot(collection(db, 'obras'), snap => {
      setObras(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubLP = onSnapshot(collection(db, 'lista_precios'), snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (items.length > 0) {
        setCatalogoArticulos(items);
      } else {
        setCatalogoArticulos(datosIniciales.map((it, idx) => ({ id: `init_${idx}`, ...it })));
      }
    }, err => {
      console.warn('Error escuchando lista_precios:', err);
      setCatalogoArticulos(datosIniciales.map((it, idx) => ({ id: `init_${idx}`, ...it })));
    });

    return () => { 
      unsubO(); 
      unsubLP(); 
    };
  }, []);

  const catalogoDisponible = useMemo(() => {
    if (catalogoArticulos && catalogoArticulos.length > 0) return catalogoArticulos;
    return datosIniciales.map((it, idx) => ({ id: `init_${idx}`, ...it }));
  }, [catalogoArticulos]);

  // Cotejo inteligente con el catálogo
  const cotejarLineasConERP = (lineasExtraidas, catalogo) => {
    return lineasExtraidas.map(linea => {
      const match = matchArticleWithCatalog(linea.descripcion, linea.codigoArticulo, catalogo);

      let itemId = null;
      let matchStatus = match.status;

      if (match.status === 'EXACT' && match.item) {
        itemId = match.item.id;
      }

      return {
        ...linea,
        cantidad: Number(linea.cantidad) || 1,
        precioUnitario: Number(linea.precioUnitario) || 0,
        total: Number(linea.total) || (Number(linea.cantidad || 1) * Number(linea.precioUnitario || 0)),
        alicuotaIva: Number(linea.alicuotaIva) || 0.21,
        cuentaCodigo: linea.cuentaCodigo || '5.1.01',
        centroCosto: linea.centroCosto || 'COSTO VARIABLE',
        obraId: linea.obraId || '',
        itemId,
        matchStatus,
        suggestedItem: match.item || null,
        matchScore: match.score || 0,
        matchReason: match.reason || '',
        nuevoArticuloData: match.suggestedNewItem || null
      };
    });
  };

  // Procesar archivo de factura
  const procesarArchivoFactura = async (file) => {
    if (!file) return;

    setIsScanningIA(true);
    setScanMessage('Extrayendo artículos y datos de la factura con motor inteligente...');
    setUploadedFileName(file.name);

    try {
      const parsedData = await parseFacturaConIA(file);

      const lineasCotejadas = cotejarLineasConERP(parsedData.lineas || [], catalogoDisponible);

      setFormData(prev => ({
        ...prev,
        proveedorNombre: parsedData.proveedorNombre || prev.proveedorNombre,
        proveedorCuit: parsedData.proveedorCuit || prev.proveedorCuit,
        tipoComprobante: parsedData.tipoComprobante || prev.tipoComprobante,
        puntoVenta: parsedData.puntoVenta || prev.puntoVenta,
        numeroComprobante: parsedData.numeroComprobante || prev.numeroComprobante,
        fechaEmision: parsedData.fechaEmision || prev.fechaEmision,
        adjuntoUrl: parsedData.adjuntoUrl || prev.adjuntoUrl,
        lineas: lineasCotejadas.length > 0 ? lineasCotejadas : prev.lineas
      }));

      const exactos = lineasCotejadas.filter(l => l.matchStatus === 'EXACT').length;
      const similares = lineasCotejadas.filter(l => l.matchStatus === 'SIMILAR').length;
      const nuevos = lineasCotejadas.filter(l => l.matchStatus === 'NONE').length;

      if (lineasCotejadas.length > 0) {
        setScanMessage(`✓ Factura analizada: ${lineasCotejadas.length} artículos detectados (${exactos} coincidentes, ${similares} sugeridos, ${nuevos} nuevos).`);
      } else {
        setScanMessage('⚠️ No se detectaron líneas de artículos automáticamente en este archivo.');
      }
    } catch (err) {
      console.error('Error al procesar archivo:', err);
      alert('Hubo un inconveniente al analizar la factura: ' + err.message);
    } finally {
      setIsScanningIA(false);
    }
  };

  // Manejadores de Drag & Drop
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await procesarArchivoFactura(files[0]);
    }
  };

  // Acciones sobre líneas
  const handleAddLinea = () => {
    setFormData(prev => ({
      ...prev,
      lineas: [
        ...prev.lineas,
        {
          descripcion: '',
          codigoArticulo: '',
          cantidad: 1,
          precioUnitario: 0,
          total: 0,
          alicuotaIva: 0.21,
          cuentaCodigo: '5.1.01',
          centroCosto: 'COSTO VARIABLE',
          obraId: '',
          itemId: null,
          matchStatus: 'NONE',
          suggestedItem: null,
          nuevoArticuloData: null
        }
      ]
    }));
  };

  const handleRemoveLinea = (idx) => {
    setFormData(prev => ({
      ...prev,
      lineas: prev.lineas.filter((_, i) => i !== idx)
    }));
  };

  const handleLineaChange = (idx, field, val) => {
    setFormData(prev => {
      const lineas = [...prev.lineas];
      lineas[idx] = { ...lineas[idx], [field]: val };
      if (field === 'cantidad' || field === 'precioUnitario') {
        const cant = Number(field === 'cantidad' ? val : lineas[idx].cantidad) || 0;
        const pu = Number(field === 'precioUnitario' ? val : lineas[idx].precioUnitario) || 0;
        lineas[idx].total = Math.round(cant * pu * 100) / 100;
      }
      return { ...prev, lineas };
    });
  };

  const handleConfirmarSimilar = (idx) => {
    setFormData(prev => {
      const lineas = [...prev.lineas];
      const linea = lineas[idx];
      if (linea.suggestedItem) {
        lineas[idx] = {
          ...linea,
          itemId: linea.suggestedItem.id,
          matchStatus: 'CONFIRMED'
        };
      }
      return { ...prev, lineas };
    });
  };

  const handleMarcarComoNuevo = (idx) => {
    setFormData(prev => {
      const lineas = [...prev.lineas];
      lineas[idx] = {
        ...lineas[idx],
        itemId: null,
        matchStatus: 'NEW_PENDING'
      };
      return { ...prev, lineas };
    });
  };

  const handleAsignarArticuloManual = (idx, item) => {
    setFormData(prev => {
      const lineas = [...prev.lineas];
      lineas[idx] = {
        ...lineas[idx],
        itemId: item.id,
        suggestedItem: item,
        matchStatus: 'CONFIRMED'
      };
      return { ...prev, lineas };
    });
    setSelectingItemForLineIdx(null);
    setCatalogSearchTerm('');
  };

  const handleConfirmarTodosSimilares = () => {
    setFormData(prev => {
      const lineas = prev.lineas.map(l => {
        if (l.matchStatus === 'SIMILAR' && l.suggestedItem) {
          return { ...l, itemId: l.suggestedItem.id, matchStatus: 'CONFIRMED' };
        }
        return l;
      });
      return { ...prev, lineas };
    });
  };

  const handleAprobarTodosNuevos = () => {
    setFormData(prev => {
      const lineas = prev.lineas.map(l => {
        if (l.matchStatus === 'NONE') {
          return { ...l, matchStatus: 'NEW_PENDING' };
        }
        return l;
      });
      return { ...prev, lineas };
    });
  };

  // Totales
  const totalesCalculados = useMemo(() => {
    let subtotalNeto = 0;
    let totalIva = 0;

    formData.lineas.forEach(l => {
      const cant = Number(l.cantidad) || 0;
      const pu = Number(l.precioUnitario) || 0;
      const net = cant * pu;
      subtotalNeto += net;
      totalIva += net * (Number(l.alicuotaIva) || 0.21);
    });

    subtotalNeto = Math.round(subtotalNeto * 100) / 100;
    totalIva = Math.round(totalIva * 100) / 100;
    const totalComprobante = Math.round((subtotalNeto + totalIva) * 100) / 100;

    return { subtotalNeto, totalIva, totalComprobante };
  }, [formData.lineas]);

  const conteoEstados = useMemo(() => {
    const exactos = formData.lineas.filter(l => l.matchStatus === 'EXACT').length;
    const confirmados = formData.lineas.filter(l => l.matchStatus === 'CONFIRMED').length;
    const similares = formData.lineas.filter(l => l.matchStatus === 'SIMILAR').length;
    const nuevos = formData.lineas.filter(l => l.matchStatus === 'NONE' || l.matchStatus === 'NEW_PENDING').length;
    return { exactos, confirmados, similares, nuevos };
  }, [formData.lineas]);

  // Guardar factura
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.proveedorNombre || !formData.numeroComprobante) {
      alert('Por favor complete el proveedor y el número de comprobante.');
      return;
    }

    if (formData.lineas.length === 0) {
      alert('Debe cargar al menos un artículo o línea de detalle.');
      return;
    }

    if (conteoEstados.similares > 0) {
      const confirmContinue = window.confirm(
        `Hay ${conteoEstados.similares} artículo(s) similares pendientes de revisión. ¿Desea continuar de todos modos?`
      );
      if (!confirmContinue) return;
    }

    setIsSubmitting(true);
    try {
      const lineasFinales = [...formData.lineas];
      let articulosCreadosCount = 0;

      for (let i = 0; i < lineasFinales.length; i++) {
        const l = lineasFinales[i];
        if (!l.itemId && (l.matchStatus === 'NEW_PENDING' || l.matchStatus === 'NONE')) {
          const nuevoArticuloData = {
            descripcion: l.descripcion,
            codigoGesdatta: l.codigoArticulo || null,
            proveedor: formData.proveedorNombre,
            categoria: l.nuevoArticuloData?.categoria,
            unidad: l.nuevoArticuloData?.unidad || 'unidad',
            tipo: 'material',
            markup: 1.35,
            stockInicial: formData.ingresaStock ? Number(l.cantidad || 0) : 0,
            stockMinimo: 5
          };

          const nuevoItemCreado = await crearArticuloEnERP(
            nuevoArticuloData,
            Number(l.precioUnitario || 0),
            tipoCambio
          );

          lineasFinales[i].itemId = nuevoItemCreado.id;
          articulosCreadosCount++;
        }
      }

      const compraPayload = {
        ...formData,
        subtotalNeto: totalesCalculados.subtotalNeto,
        totalIva: totalesCalculados.totalIva,
        totalComprobante: totalesCalculados.totalComprobante,
        lineas: lineasFinales
      };

      await crearComprobanteCompra(compraPayload);

      setIsModalOpen(false);
      setFormData(initialForm);
      setUploadedFileName('');
      setScanMessage('');
      await cargarDatos();

      let msg = '✓ Factura de compra registrada con éxito en el sistema.';
      if (articulosCreadosCount > 0) {
        msg += ` Se crearon ${articulosCreadosCount} nuevos artículos en el catálogo de Stock / Lista de Precios.`;
      }
      if (formData.ingresaStock) {
        msg += ' Se ingresó la mercadería al stock físico.';
      }
      alert(msg);
    } catch (err) {
      console.error('Error al registrar compra:', err);
      alert('Error al registrar la compra: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveGeminiKey = () => {
    if (geminiApiKeyInput.trim()) {
      localStorage.setItem('gemini_api_key', geminiApiKeyInput.trim());
      alert('✓ Clave de Gemini guardada correctamente.');
    } else {
      localStorage.removeItem('gemini_api_key');
      alert('Clave de Gemini removida.');
    }
    setIsKeyModalOpen(false);
  };

  const comprasFiltradas = compras.filter(c => {
    const term = searchTerm.toLowerCase();
    const matchTerm = !term || c.proveedorNombre?.toLowerCase().includes(term) || c.numeroOriginal?.includes(term);
    return matchTerm;
  });

  const totalComprasAcumulado = comprasFiltradas.reduce((acc, c) => acc + (c.totalComprobante || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Header Superior */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShoppingBag size={24} color="var(--primary-600)" /> Compras & Gastos (Cuentas por Pagar)
          </h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Lector Inteligente IA de facturas por foto/PDF con cotejo automático contra Stock y Lista de Precios.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button 
            onClick={() => {
              setGeminiApiKeyInput(localStorage.getItem('gemini_api_key') || '');
              setIsKeyModalOpen(true);
            }} 
            className="btn btn-secondary" 
            title="Configurar Clave IA"
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.825rem' }}
          >
            <Settings size={16} /> IA Gemini (Opcional)
          </button>
          <button 
            onClick={() => {
              setFormData(initialForm);
              setUploadedFileName('');
              setScanMessage('');
              setIsModalOpen(true);
            }} 
            className="btn btn-primary" 
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Plus size={18} /> Cargar Factura / Gasto
          </button>
        </div>
      </div>

      {/* KPI & Filtros */}
      <div className="card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', backgroundColor: 'var(--bg-surface-hover)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Filter size={18} color="var(--text-secondary)" />
          <select className="input-field" value={empresaFiltro} onChange={e => setEmpresaFiltro(e.target.value)} style={{ width: '220px' }}>
            <option value="">Todas las Empresas</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
          <div style={{ position: 'relative' }}>
            <input 
              type="text" 
              className="input-field" 
              placeholder="Buscar por proveedor o número..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)}
              style={{ width: '280px', paddingLeft: '2.25rem' }}
            />
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total Compras Devengadas</span>
          <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#dc2626' }}>$ {totalComprasAcumulado.toLocaleString('es-AR')}</h3>
        </div>
      </div>

      {/* Tabla Compras Registradas */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-surface-hover)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
              <th style={{ padding: '0.75rem 1rem' }}>Fecha</th>
              <th style={{ padding: '0.75rem 1rem' }}>Comprobante</th>
              <th style={{ padding: '0.75rem 1rem' }}>Proveedor / CUIT</th>
              <th style={{ padding: '0.75rem 1rem' }}>Neto</th>
              <th style={{ padding: '0.75rem 1rem' }}>IVA</th>
              <th style={{ padding: '0.75rem 1rem' }}>Total ($)</th>
              <th style={{ padding: '0.75rem 1rem' }}>Comprobante Real</th>
              <th style={{ padding: '0.75rem 1rem' }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {comprasFiltradas.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No se encontraron comprobantes de compra.
                </td>
              </tr>
            ) : (
              comprasFiltradas.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '0.75rem 1rem' }}>{c.fechaEmision}</td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: '600' }}>{c.tipoComprobante} {c.numeroOriginal}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div>{c.proveedorNombre}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{c.proveedorCuit}</div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>$ {Number(c.subtotalNeto || 0).toLocaleString('es-AR')}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>$ {Number(c.totalIva || 0).toLocaleString('es-AR')}</td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: '700', color: '#dc2626' }}>$ {Number(c.totalComprobante || 0).toLocaleString('es-AR')}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {c.adjuntoUrl ? (
                      <a href={c.adjuntoUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#2563eb', fontWeight: '600', textDecoration: 'none', fontSize: '0.75rem' }}>
                        <FileText size={14} /> Ver Factura
                      </a>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>Sin adjunto</span>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span style={{
                      padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600',
                      backgroundColor: c.saldoPendiente <= 0 ? '#d1fae5' : '#fee2e2',
                      color: c.saldoPendiente <= 0 ? '#059669' : '#dc2626'
                    }}>
                      {c.saldoPendiente <= 0 ? 'Pagado' : `Pendiente ($ ${Number(c.saldoPendiente).toLocaleString('es-AR')})`}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* =========================================================================
          MODAL DE CARGA DE FACTURA - PANTALLA COMPLETA & DRAG AND DROP
          ========================================================================= */}
      {isModalOpen && (
        <div className="compras-modal-overlay">
          <div className="compras-modal-container">
            
            {/* Header del Modal */}
            <div className="compras-modal-header">
              <div>
                <h3 className="compras-modal-title">
                  <Sparkles size={20} color="#2563eb" /> Lector Inteligente de Facturas con IA & Cotejo ERP
                </h3>
                <span style={{ fontSize: '0.775rem', color: '#64748b' }}>
                  Arrastrá tu factura en PDF o imagen para lectura automática, cotejo de stock y carga en tiempo real.
                </span>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '1.25rem' }}
              >
                ✕
              </button>
            </div>

            {/* Formulario */}
            <form onSubmit={handleSubmit} className="compras-modal-form">
              
              <div className="compras-modal-body">
                
                {/* ZONA DE ARRASTRE COMPACTA O BANNER DE ARCHIVO YA SUBIDO */}
                {!formData.adjuntoUrl && !isScanningIA ? (
                  <div 
                    className={`drag-drop-zone-compact ${isDragging ? 'dragging' : ''}`}
                    onDragEnter={handleDragEnter}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="drag-drop-left">
                      <div className="drag-drop-icon-small">
                        <Upload size={18} />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#1e3a8a' }}>
                          {isDragging ? '¡Soltá tu factura acá!' : 'Arrastrá tu factura acá (PDF o Imagen) o hacé clic para buscar'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          Soporta cualquier factura PDF (AFIP, REHAU, Pronto, etc.) o fotos JPG/PNG
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }} onClick={e => e.stopPropagation()}>
                      <button 
                        type="button" 
                        onClick={() => fileInputRef.current?.click()} 
                        className="btn btn-primary" 
                        style={{ fontSize: '0.775rem', padding: '0.35rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                      >
                        <Upload size={14} /> Seleccionar Archivo
                      </button>
                      <button 
                        type="button" 
                        onClick={() => cameraInputRef.current?.click()} 
                        className="btn btn-secondary" 
                        style={{ fontSize: '0.775rem', padding: '0.35rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                      >
                        <Camera size={14} /> Sacar Foto
                      </button>
                    </div>

                    <input 
                      ref={fileInputRef} 
                      type="file" 
                      accept="application/pdf,image/*" 
                      style={{ display: 'none' }} 
                      onChange={e => e.target.files?.[0] && procesarArchivoFactura(e.target.files[0])} 
                    />
                    <input 
                      ref={cameraInputRef} 
                      type="file" 
                      accept="image/*" 
                      capture="environment" 
                      style={{ display: 'none' }} 
                      onChange={e => e.target.files?.[0] && procesarArchivoFactura(e.target.files[0])} 
                    />
                  </div>
                ) : (
                  <div className="uploaded-file-banner">
                    <div className="uploaded-file-info">
                      {isScanningIA ? (
                        <RefreshCw size={16} className="animate-spin" style={{ color: '#2563eb' }} />
                      ) : (
                        <FileText size={18} style={{ color: '#059669' }} />
                      )}
                      <span>
                        {isScanningIA ? 'Procesando archivo...' : `Archivo: ${uploadedFileName || 'Factura'}`}
                      </span>
                      {scanMessage && (
                        <span style={{ fontSize: '0.75rem', color: isScanningIA ? '#2563eb' : '#059669', marginLeft: '0.5rem', fontWeight: '500' }}>
                          {scanMessage}
                        </span>
                      )}
                      {formData.adjuntoUrl && (
                        <a href={formData.adjuntoUrl} target="_blank" rel="noopener noreferrer" className="uploaded-file-link">
                          <ExternalLink size={12} /> Ver Comprobante
                        </a>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button 
                        type="button" 
                        onClick={() => fileInputRef.current?.click()} 
                        className="btn-change-file"
                        disabled={isScanningIA}
                      >
                        <RefreshCw size={12} /> Cambiar Archivo
                      </button>
                      <input 
                        ref={fileInputRef} 
                        type="file" 
                        accept="application/pdf,image/*" 
                        style={{ display: 'none' }} 
                        onChange={e => e.target.files?.[0] && procesarArchivoFactura(e.target.files[0])} 
                      />
                    </div>
                  </div>
                )}

                {/* DATOS DE CABECERA COMPACTOS */}
                <div className="invoice-header-compact">
                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '0.15rem' }}>Empresa Receptora</label>
                    <select className="input-field" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }} value={formData.empresaId} onChange={e => setFormData({...formData, empresaId: e.target.value})}>
                      {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '0.15rem' }}>Tipo Comprobante</label>
                    <select className="input-field" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }} value={formData.tipoComprobante} onChange={e => setFormData({...formData, tipoComprobante: e.target.value})}>
                      <option value="FAA">Factura A (FAA)</option>
                      <option value="FAB">Factura B (FAB)</option>
                      <option value="FAC">Factura C (FAC)</option>
                      <option value="TICKET">Ticket / Interno</option>
                      <option value="NCA">Nota de Crédito (NCA)</option>
                      <option value="NDA">Nota de Débito (NDA)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '0.15rem' }}>Pto - Número</label>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <input type="text" className="input-field" style={{ width: '65px', padding: '0.3rem 0.4rem', fontSize: '0.8rem' }} value={formData.puntoVenta} onChange={e => setFormData({...formData, puntoVenta: e.target.value})} placeholder="0001" required />
                      <input type="text" className="input-field" style={{ flex: 1, padding: '0.3rem 0.4rem', fontSize: '0.8rem' }} value={formData.numeroComprobante} onChange={e => setFormData({...formData, numeroComprobante: e.target.value})} placeholder="00012345" required />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '0.15rem' }}>Proveedor (Razón Social)</label>
                    <input type="text" className="input-field" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }} placeholder="Nombre Proveedor" value={formData.proveedorNombre} onChange={e => setFormData({...formData, proveedorNombre: e.target.value})} required />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '0.15rem' }}>CUIT Proveedor</label>
                    <input type="text" className="input-field" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }} placeholder="30-XXXXXXXX-X" value={formData.proveedorCuit} onChange={e => setFormData({...formData, proveedorCuit: e.target.value})} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '0.15rem' }}>Fecha Emisión</label>
                    <input type="date" className="input-field" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }} value={formData.fechaEmision} onChange={e => setFormData({...formData, fechaEmision: e.target.value})} required />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', paddingBottom: '0.3rem' }}>
                    <input type="checkbox" id="ingresaStockCheck" checked={formData.ingresaStock} onChange={e => setFormData({...formData, ingresaStock: e.target.checked})} style={{ width: '15px', height: '15px', cursor: 'pointer' }} />
                    <label htmlFor="ingresaStockCheck" style={{ fontSize: '0.775rem', fontWeight: '700', color: '#1e293b', cursor: 'pointer' }}>
                      Ingresar a Stock físico
                    </label>
                  </div>
                </div>

                {/* ASISTENTE INTELIGENTE DE COTEJO CON ERP */}
                {formData.lineas.length > 0 && (
                  <div className="matching-summary-bar">
                    <div className="matching-badges-group">
                      <span style={{ fontSize: '0.775rem', fontWeight: '700', color: '#334155' }}>
                        Cotejo con Stock / Lista de Precios ({formData.lineas.length} ítems):
                      </span>
                      {conteoEstados.exactos > 0 && (
                        <span className="badge-exact">
                          <Check size={13} /> {conteoEstados.exactos} Coincidentes
                        </span>
                      )}
                      {conteoEstados.confirmados > 0 && (
                        <span className="badge-confirmed">
                          <CheckCircle size={13} /> {conteoEstados.confirmados} Confirmados
                        </span>
                      )}
                      {conteoEstados.similares > 0 && (
                        <span className="badge-similar">
                          <AlertTriangle size={13} /> {conteoEstados.similares} Similares
                        </span>
                      )}
                      {conteoEstados.nuevos > 0 && (
                        <span className="badge-new">
                          <Box size={13} /> {conteoEstados.nuevos} Nuevos para crear
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      {conteoEstados.similares > 0 && (
                        <button 
                          type="button" 
                          onClick={handleConfirmarTodosSimilares}
                          className="btn-inline-confirm"
                        >
                          ✓ Confirmar todos los similares
                        </button>
                      )}
                      {conteoEstados.nuevos > 0 && (
                        <button 
                          type="button" 
                          onClick={handleAprobarTodosNuevos}
                          className="btn-inline-create"
                        >
                          ➕ Aprobar creación de todos los nuevos
                        </button>
                      )}
                      <button 
                        type="button" 
                        onClick={handleAddLinea} 
                        className="btn btn-secondary" 
                        style={{ fontSize: '0.725rem', padding: '0.2rem 0.6rem' }}
                      >
                        + Agregar Fila
                      </button>
                    </div>
                  </div>
                )}

                {/* TABLA DE LÍNEAS / ARTÍCULOS DETECTADOS - CON SCROLL REAL Y VISIBILIDAD COMPLETA */}
                <div className="lines-table-container">
                  <table className="lines-table">
                    <thead>
                      <tr>
                        <th style={{ width: '32px' }}>#</th>
                        <th style={{ width: '28%' }}>Artículo en Factura</th>
                        <th style={{ width: '32%' }}>Estado en ERP (Stock / Lista de Precios)</th>
                        <th style={{ width: '70px', textAlign: 'right' }}>Cant.</th>
                        <th style={{ width: '100px', textAlign: 'right' }}>Precio U. ($)</th>
                        <th style={{ width: '100px', textAlign: 'right' }}>Total ($)</th>
                        <th style={{ width: '80px' }}>IVA</th>
                        <th style={{ width: '130px' }}>Centro Costo</th>
                        <th style={{ width: '120px' }}>Obra</th>
                        <th style={{ width: '36px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.lineas.length === 0 ? (
                        <tr>
                          <td colSpan="10" style={{ padding: '3.5rem 1rem', textAlign: 'center', color: '#64748b' }}>
                            <FileText size={36} style={{ margin: '0 auto 0.5rem', color: '#cbd5e1' }} />
                            <div style={{ fontSize: '0.95rem', fontWeight: '600' }}>No hay artículos cargados todavía.</div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                              Arrastrá una factura PDF arriba o hacé clic en "+ Agregar Fila".
                            </div>
                          </td>
                        </tr>
                      ) : (
                        formData.lineas.map((linea, idx) => (
                          <tr key={idx}>
                            <td style={{ color: '#94a3b8', fontWeight: '600', textAlign: 'center' }}>{idx + 1}</td>
                            
                            {/* Artículo de la factura */}
                            <td>
                              <input 
                                type="text" 
                                className="input-field" 
                                style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem', width: '100%' }}
                                value={linea.descripcion} 
                                onChange={e => handleLineaChange(idx, 'descripcion', e.target.value)} 
                                required 
                              />
                              {linea.codigoArticulo && (
                                <span style={{ fontSize: '0.675rem', color: '#64748b', display: 'inline-block', marginTop: '2px' }}>
                                  Ref: <strong>{linea.codigoArticulo}</strong>
                                </span>
                              )}
                            </td>

                            {/* Estado en ERP / Pregunta interactiva */}
                            <td>
                              {linea.matchStatus === 'EXACT' && linea.suggestedItem && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                                  <span className="badge-exact" title={linea.matchReason}>
                                    <Check size={12} /> {linea.suggestedItem.descripcion}
                                  </span>
                                  <button 
                                    type="button" 
                                    onClick={() => setSelectingItemForLineIdx(idx)}
                                    className="btn-inline-choose"
                                  >
                                    Cambiar
                                  </button>
                                </div>
                              )}

                              {linea.matchStatus === 'CONFIRMED' && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                                  <span className="badge-confirmed">
                                    <CheckCircle size={12} /> {linea.suggestedItem?.descripcion || 'Enlazado a ERP'}
                                  </span>
                                  <button 
                                    type="button" 
                                    onClick={() => setSelectingItemForLineIdx(idx)}
                                    className="btn-inline-choose"
                                  >
                                    Cambiar
                                  </button>
                                </div>
                              )}

                              {linea.matchStatus === 'SIMILAR' && linea.suggestedItem && (
                                <div className="similar-resolution-box">
                                  <div style={{ fontSize: '0.75rem', color: '#854d0e', fontWeight: '600' }}>
                                    ¿Es el mismo artículo que: <u>{linea.suggestedItem.descripcion}</u>?
                                  </div>
                                  <div className="similar-actions-row">
                                    <button 
                                      type="button" 
                                      onClick={() => handleConfirmarSimilar(idx)}
                                      className="btn-inline-confirm"
                                      title="Confirmar que es este artículo en el ERP"
                                    >
                                      ✓ Sí, es este
                                    </button>
                                    <button 
                                      type="button" 
                                      onClick={() => setSelectingItemForLineIdx(idx)}
                                      className="btn-inline-choose"
                                      title="Buscar y seleccionar otro artículo del ERP"
                                    >
                                      🔍 Elegir otro
                                    </button>
                                    <button 
                                      type="button" 
                                      onClick={() => handleMarcarComoNuevo(idx)}
                                      className="btn-inline-create"
                                      title="Dar de alta como artículo nuevo en el catálogo"
                                    >
                                      ➕ Crear como nuevo
                                    </button>
                                  </div>
                                </div>
                              )}

                              {(linea.matchStatus === 'NONE' || linea.matchStatus === 'NEW_PENDING') && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                                  <span className="badge-new" style={{ backgroundColor: '#f3e8ff', color: '#6b21a8', borderColor: '#d8b4fe' }}>
                                    <Box size={12} /> Se creará nuevo en Catálogo
                                  </span>
                                  <button 
                                    type="button" 
                                    onClick={() => setSelectingItemForLineIdx(idx)}
                                    className="btn-inline-choose"
                                  >
                                    🔍 Vincular a existente
                                  </button>
                                </div>
                              )}
                            </td>

                            {/* Cantidad */}
                            <td>
                              <input 
                                type="number" 
                                className="input-field" 
                                style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem', width: '100%', textAlign: 'right' }}
                                value={linea.cantidad} 
                                onChange={e => handleLineaChange(idx, 'cantidad', e.target.value)} 
                                min="0.01" 
                                step="any"
                                required 
                              />
                            </td>

                            {/* Precio Unitario */}
                            <td>
                              <input 
                                type="number" 
                                className="input-field" 
                                style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem', width: '100%', textAlign: 'right' }}
                                value={linea.precioUnitario} 
                                onChange={e => handleLineaChange(idx, 'precioUnitario', e.target.value)} 
                                min="0" 
                                step="0.0001"
                                required 
                              />
                            </td>

                            {/* Total Línea */}
                            <td style={{ textAlign: 'right', fontWeight: '700', color: '#1e293b', whiteSpace: 'nowrap' }}>
                              $ {Number(linea.total || (linea.cantidad * linea.precioUnitario)).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>

                            {/* Alícuota IVA */}
                            <td>
                              <select 
                                className="input-field" 
                                style={{ fontSize: '0.775rem', padding: '0.3rem 0.25rem', width: '100%' }}
                                value={linea.alicuotaIva} 
                                onChange={e => handleLineaChange(idx, 'alicuotaIva', Number(e.target.value))}
                              >
                                {ALICUOTAS_IVA.map(a => <option key={a.val} value={a.val}>{a.label}</option>)}
                              </select>
                            </td>

                            {/* Centro de Costo */}
                            <td>
                              <select 
                                className="input-field" 
                                style={{ fontSize: '0.775rem', padding: '0.3rem 0.25rem', width: '100%' }}
                                value={linea.centroCosto} 
                                onChange={e => handleLineaChange(idx, 'centroCosto', e.target.value)}
                              >
                                {CENTROS_COSTO_BASE.map(cc => <option key={cc} value={cc}>{cc}</option>)}
                              </select>
                            </td>

                            {/* Obra */}
                            <td>
                              <select 
                                className="input-field" 
                                style={{ fontSize: '0.775rem', padding: '0.3rem 0.25rem', width: '100%' }}
                                value={linea.obraId} 
                                onChange={e => handleLineaChange(idx, 'obraId', e.target.value)}
                              >
                                <option value="">Gasto General</option>
                                {obras.map(o => <option key={o.id} value={o.id}>{o.name || o.clientName}</option>)}
                              </select>
                            </td>

                            {/* Eliminar Fila */}
                            <td style={{ textAlign: 'center' }}>
                              <button 
                                type="button" 
                                onClick={() => handleRemoveLinea(idx)} 
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}
                                title="Eliminar línea"
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

              </div>

              {/* FOOTER TOTALES Y ACCIONES FIJO */}
              <div className="compras-modal-footer">
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  {conteoEstados.nuevos > 0 && (
                    <span style={{ color: '#7e22ce', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Box size={14} /> Se crearán {conteoEstados.nuevos} artículos nuevos en el catálogo de Stock / Lista de Precios al guardar.
                    </span>
                  )}
                  {formData.ingresaStock && (
                    <span style={{ color: '#059669', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '2px' }}>
                      <CheckCircle size={14} /> Ingresará el stock físico automáticamente.
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                  <div className="totals-group">
                    <div className="total-pill">
                      <span className="total-pill-label">Neto Gravado</span>
                      <span className="total-pill-value">$ {totalesCalculados.subtotalNeto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="total-pill">
                      <span className="total-pill-label">IVA Total</span>
                      <span className="total-pill-value">$ {totalesCalculados.totalIva.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="total-pill">
                      <span className="total-pill-label">TOTAL FACTURA</span>
                      <span className="total-pill-value highlight">$ {totalesCalculados.totalComprobante.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-secondary">
                      Cancelar
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={isSubmitting} style={{ minWidth: '160px' }}>
                      {isSubmitting ? 'Guardando en ERP...' : 'Cargar Factura'}
                    </button>
                  </div>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL DE BÚSQUEDA / VINCULACIÓN MANUAL CON CATÁLOGO
          ========================================================================= */}
      {selectingItemForLineIdx !== null && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '1rem', backdropFilter: 'blur(3px)' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', width: '100%', maxWidth: '650px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '700' }}>
                Vincular Línea con Artículo del Catálogo
              </h4>
              <button onClick={() => setSelectingItemForLineIdx(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1, overflowY: 'auto' }}>
              <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                Línea de Factura: <strong>"{formData.lineas[selectingItemForLineIdx]?.descripcion}"</strong>
              </div>

              <div style={{ position: 'relative' }}>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="Buscar en Stock / Lista de Precios por nombre, código o proveedor..." 
                  value={catalogSearchTerm} 
                  onChange={e => setCatalogSearchTerm(e.target.value)}
                  autoFocus
                  style={{ paddingLeft: '2.25rem' }}
                />
                <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', maxHeight: '350px', overflowY: 'auto' }}>
                {catalogoDisponible
                  .filter(item => {
                    if (!catalogSearchTerm) return true;
                    const term = catalogSearchTerm.toLowerCase();
                    return item.descripcion?.toLowerCase().includes(term) ||
                           item.proveedor?.toLowerCase().includes(term) ||
                           item.codigoGesdatta?.toLowerCase().includes(term);
                  })
                  .slice(0, 50)
                  .map(item => (
                    <div 
                      key={item.id} 
                      onClick={() => handleAsignarArticuloManual(selectingItemForLineIdx, item)}
                      style={{ padding: '0.65rem 0.85rem', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background-color 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#eff6ff'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#1e293b' }}>{item.descripcion}</div>
                        <div style={{ fontSize: '0.725rem', color: '#64748b' }}>
                          {item.categoria} {item.proveedor ? `• Proveedor: ${item.proveedor}` : ''} {item.codigoGesdatta ? `• Cód: ${item.codigoGesdatta}` : ''}
                        </div>
                      </div>
                      <button type="button" className="btn-inline-confirm" style={{ fontSize: '0.75rem' }}>
                        Seleccionar
                      </button>
                    </div>
                  ))}
              </div>
            </div>

            <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
              <button 
                type="button" 
                onClick={() => {
                  handleMarcarComoNuevo(selectingItemForLineIdx);
                  setSelectingItemForLineIdx(null);
                }} 
                className="btn-inline-create"
                style={{ padding: '0.35rem 0.75rem' }}
              >
                ➕ Crear como artículo nuevo
              </button>
              <button type="button" onClick={() => setSelectingItemForLineIdx(null)} className="btn btn-secondary">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL DE CONFIGURACIÓN DE CLAVE GEMINI (OPCIONAL)
          ========================================================================= */}
      {isKeyModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1rem', backdropFilter: 'blur(3px)' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', width: '100%', maxWidth: '520px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Sparkles size={20} color="#2563eb" /> Clave Gemini AI (Opcional)
              </h4>
              <button onClick={() => setIsKeyModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <p style={{ margin: 0, fontSize: '0.825rem', color: '#475569', lineHeight: 1.5 }}>
              Para procesar <strong>fotos sacadas con la cámara o imágenes JPG/PNG</strong>, podés ingresar una clave gratuita de <strong>Google AI Studio</strong>. 
              <br /><br />
              💡 <em>Nota: Para facturas en PDF electrónicas (AFIP o de tus proveedores como REHAU y Pronto Distribuidora), el sistema las lee al 100% de manera directa y automática sin necesidad de claves externas.</em>
            </p>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '0.35rem' }}>
                Gemini API Key (AIzaSy...)
              </label>
              <input 
                type="password" 
                className="input-field" 
                placeholder="Pegá tu clave de Google AI Studio acá..."
                value={geminiApiKeyInput} 
                onChange={e => setGeminiApiKeyInput(e.target.value)} 
              />
              <span style={{ fontSize: '0.725rem', color: '#64748b', display: 'block', marginTop: '0.25rem' }}>
                Podés obtener una clave gratis en <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>Google AI Studio</a>. Se guarda localmente en tu navegador.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="button" onClick={() => setIsKeyModalOpen(false)} className="btn btn-secondary">
                Cancelar
              </button>
              <button type="button" onClick={handleSaveGeminiKey} className="btn btn-primary">
                Guardar Clave
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Compras;
