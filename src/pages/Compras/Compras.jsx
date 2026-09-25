import React, { useState, useEffect } from 'react';
import { ShoppingBag, Plus, Filter, Search, FileText, CheckCircle, Clock, AlertTriangle, ArrowDownRight, Camera, Upload, Sparkles, ExternalLink } from 'lucide-react';
import { getCompras, crearComprobanteCompra, ALICUOTAS_IVA } from '../../services/comprasService';
import { getEmpresas } from '../../services/empresasService';
import { getPlanCuentas, CENTROS_COSTO_BASE } from '../../services/contabilidadService';
import { parseFacturaConIA } from '../../services/aiOcrService';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot, query } from 'firebase/firestore';

const Compras = () => {
  const [compras, setCompras] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [obras, setObras] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [planCuentas, setPlanCuentas] = useState([]);
  const [empresaFiltro, setEmpresaFiltro] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScanningIA, setIsScanningIA] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    empresaId: 'euler-calefaccion',
    proveedorNombre: '',
    proveedorCuit: '',
    tipoComprobante: 'FAA',
    puntoVenta: '1',
    numeroComprobante: '',
    fechaEmision: new Date().toISOString().split('T')[0],
    fechaContable: new Date().toISOString().split('T')[0],
    ingresaStock: false,
    adjuntoUrl: null,
    lineas: [
      {
        descripcion: '',
        cantidad: 1,
        precioUnitario: 0,
        alicuotaIva: 0.21,
        cuentaCodigo: '5.1.01',
        centroCosto: 'COSTO VARIABLE',
        obraId: ''
      }
    ]
  });

  const cargarDatos = async () => {
    const listE = await getEmpresas();
    setEmpresas(listE);
    const listC = await getPlanCuentas();
    setPlanCuentas(listC);
    const dataCom = await getCompras(empresaFiltro || null);
    setCompras(dataCom);
  };

  useEffect(() => {
    cargarDatos();
  }, [empresaFiltro]);

  useEffect(() => {
    const unsubO = onSnapshot(collection(db, 'obras'), snap => {
      setObras(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubP = onSnapshot(collection(db, 'clientes'), snap => {
      setProveedores(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubO(); unsubP(); };
  }, []);

  const handleFileUploadIA = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsScanningIA(true);
    try {
      const parsedData = await parseFacturaConIA(file);
      
      setFormData(prev => ({
        ...prev,
        proveedorNombre: parsedData.proveedorNombre || prev.proveedorNombre,
        proveedorCuit: parsedData.proveedorCuit || prev.proveedorCuit,
        tipoComprobante: parsedData.tipoComprobante || prev.tipoComprobante,
        puntoVenta: parsedData.puntoVenta || prev.puntoVenta,
        numeroComprobante: parsedData.numeroComprobante || prev.numeroComprobante,
        fechaEmision: parsedData.fechaEmision || prev.fechaEmision,
        adjuntoUrl: parsedData.adjuntoUrl || prev.adjuntoUrl,
        lineas: parsedData.lineas && parsedData.lineas.length > 0 ? parsedData.lineas : prev.lineas
      }));

      alert('✨ Factura analizada por IA. Por favor revise los campos y presione "Cargar Factura".');
    } catch (err) {
      console.error(err);
      alert('Hubo un inconveniente al analizar la factura, pero el archivo fue adjuntado.');
    } finally {
      setIsScanningIA(false);
    }
  };

  const handleAddLinea = () => {
    setFormData(prev => ({
      ...prev,
      lineas: [
        ...prev.lineas,
        { descripcion: '', cantidad: 1, precioUnitario: 0, alicuotaIva: 0.21, cuentaCodigo: '5.1.01', centroCosto: 'COSTO VARIABLE', obraId: '' }
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
      return { ...prev, lineas };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.proveedorNombre || !formData.numeroComprobante) {
      alert('Por favor complete el proveedor y el número de comprobante.');
      return;
    }

    setIsSubmitting(true);
    try {
      await crearComprobanteCompra(formData);
      setIsModalOpen(false);
      await cargarDatos();
      alert('Comprobante de compra registrado con éxito.');
    } catch (err) {
      console.error(err);
      alert('Error al registrar compra: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const comprasFiltradas = compras.filter(c => {
    const term = searchTerm.toLowerCase();
    const matchTerm = !term || c.proveedorNombre?.toLowerCase().includes(term) || c.numeroOriginal?.includes(term);
    return matchTerm;
  });

  const totalComprasAcumulado = comprasFiltradas.reduce((acc, c) => acc + (c.totalComprobante || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShoppingBag size={24} color="var(--primary-600)" /> Compras & Gastos (Cuentas por Pagar)
          </h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Carga inteligente de facturas por foto/PDF con IA y registro permanente de comprobantes.
          </p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={18} /> Cargar Factura / Gasto
        </button>
      </div>

      {/* KPI & Filters */}
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

      {/* Tabla Compras */}
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

      {/* Modal Nueva Compra */}
      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem', backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'white', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '850px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600' }}>Cargar Factura o Gasto de Compra</h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>
            
            <form onSubmit={handleSubmit} style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              {/* Bloque Carga por Foto / PDF con IA */}
              <div style={{ border: '2px dashed #3b82f6', borderRadius: 'var(--radius-md)', padding: '1.25rem', backgroundColor: '#eff6ff', textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#1d4ed8', fontWeight: '700', marginBottom: '0.5rem' }}>
                  <Sparkles size={20} /> Lectura Inteligente de Factura con IA & Archivo Permanente
                </div>
                <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: '#475569' }}>
                  Subí o sacá una foto de la factura (JPG, PNG o PDF). La IA leerá automáticamente los datos y guardará la factura real en el sistema.
                </p>

                <label className="btn btn-primary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#2563eb' }}>
                  <Camera size={18} /> {isScanningIA ? 'Analizando documento con IA...' : 'Sacar Foto / Subir Factura PDF'}
                  <input type="file" accept="image/*,application/pdf" capture="environment" onChange={handleFileUploadIA} disabled={isScanningIA} style={{ display: 'none' }} />
                </label>

                {formData.adjuntoUrl && (
                  <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#059669', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                    <CheckCircle size={16} /> Comprobante real adjuntado: <a href={formData.adjuntoUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#059669' }}>Ver Archivo Guardado</a>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.875rem', fontWeight: '500' }}>Empresa Emisora</label>
                  <select className="input-field" value={formData.empresaId} onChange={e => setFormData({...formData, empresaId: e.target.value})}>
                    {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.875rem', fontWeight: '500' }}>Tipo Comprobante</label>
                  <select className="input-field" value={formData.tipoComprobante} onChange={e => setFormData({...formData, tipoComprobante: e.target.value})}>
                    <option value="FAA">Factura A (FAA)</option>
                    <option value="FAB">Factura B (FAB)</option>
                    <option value="FAC">Factura C (FAC)</option>
                    <option value="TICKET">Ticket / Comprobante Interno</option>
                    <option value="NCA">Nota de Crédito (NCA)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.875rem', fontWeight: '500' }}>N° Comprobante</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input type="number" className="input-field" style={{ width: '80px' }} value={formData.puntoVenta} onChange={e => setFormData({...formData, puntoVenta: e.target.value})} placeholder="00001" required />
                    <input type="number" className="input-field" value={formData.numeroComprobante} onChange={e => setFormData({...formData, numeroComprobante: e.target.value})} placeholder="00012345" required />
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.875rem', fontWeight: '500' }}>Proveedor</label>
                  <input type="text" className="input-field" placeholder="Nombre o Razón Social" value={formData.proveedorNombre} onChange={e => setFormData({...formData, proveedorNombre: e.target.value})} required />
                </div>
                <div>
                  <label style={{ fontSize: '0.875rem', fontWeight: '500' }}>CUIT Proveedor</label>
                  <input type="text" className="input-field" placeholder="30-12345678-9" value={formData.proveedorCuit} onChange={e => setFormData({...formData, proveedorCuit: e.target.value})} />
                </div>
                <div>
                  <label style={{ fontSize: '0.875rem', fontWeight: '500' }}>Fecha Emisión</label>
                  <input type="date" className="input-field" value={formData.fechaEmision} onChange={e => setFormData({...formData, fechaEmision: e.target.value})} required />
                </div>
              </div>

              <div style={{ margin: '0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" id="ingresaStockCheck" checked={formData.ingresaStock} onChange={e => setFormData({...formData, ingresaStock: e.target.checked})} />
                <label htmlFor="ingresaStockCheck" style={{ fontSize: '0.875rem', fontWeight: '500', cursor: 'pointer' }}>Ingresar mercadería automáticamente a Stock físico</label>
              </div>

              {/* Ítems / Líneas */}
              <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: '600' }}>Líneas de Detalle / Imputación (Verificadas)</h4>
                
                {formData.lineas.map((linea, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.5fr 1fr auto', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                    <input type="text" className="input-field" placeholder="Descripción artículo / concepto" value={linea.descripcion} onChange={e => handleLineaChange(idx, 'descripcion', e.target.value)} required />
                    <input type="number" className="input-field" placeholder="Cant." value={linea.cantidad} onChange={e => handleLineaChange(idx, 'cantidad', e.target.value)} min="1" required />
                    <input type="number" className="input-field" placeholder="Precio U. ($)" value={linea.precioUnitario} onChange={e => handleLineaChange(idx, 'precioUnitario', e.target.value)} min="0" step="0.01" required />
                    <select className="input-field" value={linea.alicuotaIva} onChange={e => handleLineaChange(idx, 'alicuotaIva', Number(e.target.value))}>
                      {ALICUOTAS_IVA.map(a => <option key={a.val} value={a.val}>{a.label}</option>)}
                    </select>
                    <select className="input-field" value={linea.centroCosto} onChange={e => handleLineaChange(idx, 'centroCosto', e.target.value)}>
                      {CENTROS_COSTO_BASE.map(cc => <option key={cc} value={cc}>{cc}</option>)}
                    </select>
                    <select className="input-field" value={linea.obraId} onChange={e => handleLineaChange(idx, 'obraId', e.target.value)}>
                      <option value="">Gasto General</option>
                      {obras.map(o => <option key={o.id} value={o.id}>{o.name || o.clientName}</option>)}
                    </select>
                    {formData.lineas.length > 1 && (
                      <button type="button" onClick={() => handleRemoveLinea(idx)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}>✕</button>
                    )}
                  </div>
                ))}

                <button type="button" onClick={handleAddLinea} className="btn-secondary" style={{ marginTop: '0.5rem', fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}>
                  + Agregar Línea
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', borderTop: '1px solid var(--border-light)', paddingTop: '1rem', marginTop: '1rem' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">Cancelar</button>
                <button type="submit" className="btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Guardando...' : 'Cargar Factura'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default Compras;
