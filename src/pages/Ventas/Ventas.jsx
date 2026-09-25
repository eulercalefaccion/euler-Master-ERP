import React, { useState, useEffect } from 'react';
import { Tag, Plus, Filter, Search, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { getVentas, crearComprobanteVenta } from '../../services/ventasService';
import { getEmpresas } from '../../services/empresasService';
import { ALICUOTAS_IVA } from '../../services/comprasService';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot } from 'firebase/firestore';

const Ventas = () => {
  const [ventas, setVentas] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [obras, setObras] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [empresaFiltro, setEmpresaFiltro] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    empresaId: 'euler-calefaccion',
    clienteNombre: '',
    clienteCuit: '',
    obraId: '',
    tipoComprobante: 'FAA',
    puntoVenta: '6',
    numeroComprobante: '',
    fechaEmision: new Date().toISOString().split('T')[0],
    fechaContable: new Date().toISOString().split('T')[0],
    lineas: [
      {
        descripcion: '',
        cantidad: 1,
        precioUnitario: 0,
        alicuotaIva: 0.21,
        cuentaCodigo: '4.1.01',
        centroCosto: 'General'
      }
    ]
  });

  const cargarDatos = async () => {
    const listE = await getEmpresas();
    setEmpresas(listE);
    const dataV = await getVentas(empresaFiltro || null);
    setVentas(dataV);
  };

  useEffect(() => {
    cargarDatos();
  }, [empresaFiltro]);

  useEffect(() => {
    const unsubO = onSnapshot(collection(db, 'obras'), snap => {
      setObras(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubC = onSnapshot(collection(db, 'clientes'), snap => {
      setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubO(); unsubC(); };
  }, []);

  const handleAddLinea = () => {
    setFormData(prev => ({
      ...prev,
      lineas: [
        ...prev.lineas,
        { descripcion: '', cantidad: 1, precioUnitario: 0, alicuotaIva: 0.21, cuentaCodigo: '4.1.01', centroCosto: 'General' }
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
    if (!formData.clienteNombre || !formData.numeroComprobante) {
      alert('Por favor complete el cliente y el número de comprobante.');
      return;
    }

    setIsSubmitting(true);
    try {
      await crearComprobanteVenta(formData);
      setIsModalOpen(false);
      await cargarDatos();
      alert('Comprobante de venta registrado con éxito.');
    } catch (err) {
      console.error(err);
      alert('Error al registrar venta: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const ventasFiltradas = ventas.filter(v => {
    const term = searchTerm.toLowerCase();
    const matchTerm = !term || v.clienteNombre?.toLowerCase().includes(term) || v.numeroOriginal?.includes(term);
    return matchTerm;
  });

  const totalVentasDevengadas = ventasFiltradas.reduce((acc, v) => acc + (v.totalComprobante || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Tag size={24} color="var(--primary-600)" /> Ventas & Cuentas por Cobrar (AR)
          </h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Emisión y registro de facturación de ventas, notas de crédito, vinculación con obras y presupuestos.
          </p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={18} /> Nueva Venta / Comprobante
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
              placeholder="Buscar por cliente o número..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)}
              style={{ width: '280px', paddingLeft: '2.25rem' }}
            />
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total Ventas Devengadas</span>
          <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#059669' }}>$ {totalVentasDevengadas.toLocaleString('es-AR')}</h3>
        </div>
      </div>

      {/* Tabla Ventas */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-surface-hover)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
              <th style={{ padding: '0.75rem 1rem' }}>Fecha</th>
              <th style={{ padding: '0.75rem 1rem' }}>Comprobante</th>
              <th style={{ padding: '0.75rem 1rem' }}>Cliente / CUIT</th>
              <th style={{ padding: '0.75rem 1rem' }}>Neto</th>
              <th style={{ padding: '0.75rem 1rem' }}>IVA</th>
              <th style={{ padding: '0.75rem 1rem' }}>Total ($)</th>
              <th style={{ padding: '0.75rem 1rem' }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {ventasFiltradas.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No se encontraron comprobantes de venta.
                </td>
              </tr>
            ) : (
              ventasFiltradas.map(v => (
                <tr key={v.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '0.75rem 1rem' }}>{v.fechaEmision}</td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: '600' }}>{v.tipoComprobante} {v.numeroOriginal}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div>{v.clienteNombre}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{v.clienteCuit}</div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>$ {Number(v.subtotalNeto || 0).toLocaleString('es-AR')}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>$ {Number(v.totalIva || 0).toLocaleString('es-AR')}</td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: '700', color: v.esNotaCredito ? '#dc2626' : '#059669' }}>
                    {v.esNotaCredito ? '-' : ''}$ {Number(v.totalComprobante || 0).toLocaleString('es-AR')}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span style={{
                      padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600',
                      backgroundColor: v.saldoPendiente <= 0 ? '#d1fae5' : '#fef3c7',
                      color: v.saldoPendiente <= 0 ? '#059669' : '#d97706'
                    }}>
                      {v.saldoPendiente <= 0 ? 'Cobrado' : `Pendiente ($ ${Number(v.saldoPendiente).toLocaleString('es-AR')})`}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Nueva Venta */}
      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem', backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'white', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '850px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600' }}>Registrar Comprobante de Venta</h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>
            
            <form onSubmit={handleSubmit} style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
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
                    <option value="FAX">Factura Exportación / Especial (FAX)</option>
                    <option value="NCA">Nota de Crédito A (NCA)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.875rem', fontWeight: '500' }}>N° Comprobante</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input type="number" className="input-field" style={{ width: '80px' }} value={formData.puntoVenta} onChange={e => setFormData({...formData, puntoVenta: e.target.value})} placeholder="00006" required />
                    <input type="number" className="input-field" value={formData.numeroComprobante} onChange={e => setFormData({...formData, numeroComprobante: e.target.value})} placeholder="00000289" required />
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.875rem', fontWeight: '500' }}>Cliente</label>
                  <input type="text" className="input-field" placeholder="Nombre / Cliente" value={formData.clienteNombre} onChange={e => setFormData({...formData, clienteNombre: e.target.value})} required />
                </div>
                <div>
                  <label style={{ fontSize: '0.875rem', fontWeight: '500' }}>CUIT / DNI</label>
                  <input type="text" className="input-field" placeholder="20-12345678-9" value={formData.clienteCuit} onChange={e => setFormData({...formData, clienteCuit: e.target.value})} />
                </div>
                <div>
                  <label style={{ fontSize: '0.875rem', fontWeight: '500' }}>Obra Asociada</label>
                  <select className="input-field" value={formData.obraId} onChange={e => setFormData({...formData, obraId: e.target.value})}>
                    <option value="">Venta General / Sin Obra</option>
                    {obras.map(o => <option key={o.id} value={o.id}>{o.name || o.clientName}</option>)}
                  </select>
                </div>
              </div>

              {/* Ítems */}
              <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: '600' }}>Líneas de Venta</h4>
                
                {formData.lineas.map((linea, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1.5fr 1fr auto', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                    <input type="text" className="input-field" placeholder="Descripción servicio / producto" value={linea.descripcion} onChange={e => handleLineaChange(idx, 'descripcion', e.target.value)} required />
                    <input type="number" className="input-field" placeholder="Cant." value={linea.cantidad} onChange={e => handleLineaChange(idx, 'cantidad', e.target.value)} min="1" required />
                    <input type="number" className="input-field" placeholder="Precio Unit. ($)" value={linea.precioUnitario} onChange={e => handleLineaChange(idx, 'precioUnitario', e.target.value)} min="0" step="0.01" required />
                    <select className="input-field" value={linea.alicuotaIva} onChange={e => handleLineaChange(idx, 'alicuotaIva', Number(e.target.value))}>
                      {ALICUOTAS_IVA.map(a => <option key={a.val} value={a.val}>{a.label}</option>)}
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
                  {isSubmitting ? 'Guardando...' : 'Guardar Venta & Asiento'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default Ventas;
