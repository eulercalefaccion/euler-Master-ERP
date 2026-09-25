import React, { useState, useEffect } from 'react';
import { Landmark, ArrowUpRight, ArrowDownRight, Plus, CreditCard, CheckCircle, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { registrarReciboCobro, registrarOrdenPago, MEDIOS_PAGO } from '../../services/tesoreriaService';
import { getEmpresas } from '../../services/empresasService';

const Tesoreria = () => {
  const [recibos, setRecibos] = useState([]);
  const [ordenesPago, setOrdenesPago] = useState([]);
  const [tarjetas, setTarjetas] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [activeTab, setActiveTab] = useState('recibos'); // recibos, opas, tarjetas
  const [isReciboModalOpen, setIsReciboModalOpen] = useState(false);
  const [isOpaModalOpen, setIsOpaModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Recibo State
  const [reciboForm, setReciboForm] = useState({
    empresaId: 'euler-calefaccion',
    clienteNombre: '',
    numeroRecibo: '00001-00000214',
    fechaEmision: new Date().toISOString().split('T')[0],
    medioId: 'tarjeta',
    monto: '',
    observaciones: ''
  });

  // OPA State
  const [opaForm, setOpaForm] = useState({
    empresaId: 'euler-calefaccion',
    proveedorNombre: '',
    numeroOPA: '0001-00001406',
    fechaEmision: new Date().toISOString().split('T')[0],
    medioId: 'banco',
    monto: '',
    esImputacionDirecta: false,
    conceptoDirecto: 'Fletes y Acarreos Varios',
    cuentaCodigoDirecto: '5.2.01',
    centroCostoDirecto: 'COSTO VARIABLE'
  });

  useEffect(() => {
    (async () => {
      setEmpresas(await getEmpresas());
    })();

    const unsubR = onSnapshot(query(collection(db, 'recibos'), orderBy('createdAt', 'desc')), snap => {
      setRecibos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubO = onSnapshot(query(collection(db, 'ordenes_pago'), orderBy('createdAt', 'desc')), snap => {
      setOrdenesPago(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubT = onSnapshot(query(collection(db, 'tarjetas_cobrar'), orderBy('createdAt', 'desc')), snap => {
      setTarjetas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubR(); unsubO(); unsubT(); };
  }, []);

  const handleCrearRecibo = async (e) => {
    e.preventDefault();
    if (!reciboForm.clienteNombre || !reciboForm.monto) return;
    setIsSubmitting(true);
    try {
      await registrarReciboCobro({
        empresaId: reciboForm.empresaId,
        clienteNombre: reciboForm.clienteNombre,
        numeroRecibo: reciboForm.numeroRecibo,
        fechaEmision: reciboForm.fechaEmision,
        mediosPago: [
          { medioId: reciboForm.medioId, monto: Number(reciboForm.monto) }
        ],
        observaciones: reciboForm.observaciones
      });
      setIsReciboModalOpen(false);
      alert('Recibo de cobro registrado correctamente.');
    } catch (err) {
      console.error(err);
      alert('Error: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCrearOPA = async (e) => {
    e.preventDefault();
    if (!opaForm.proveedorNombre || !opaForm.monto) return;
    setIsSubmitting(true);
    try {
      await registrarOrdenPago({
        empresaId: opaForm.empresaId,
        proveedorNombre: opaForm.proveedorNombre,
        numeroOPA: opaForm.numeroOPA,
        fechaEmision: opaForm.fechaEmision,
        mediosPago: [
          { medioId: opaForm.medioId, monto: Number(opaForm.monto) }
        ],
        imputacionDirecta: opaForm.esImputacionDirecta ? {
          concepto: opaForm.conceptoDirecto,
          cuentaCodigo: opaForm.cuentaCodigoDirecto,
          cuentaNombre: opaForm.conceptoDirecto,
          centroCosto: opaForm.centroCostoDirecto,
          monto: Number(opaForm.monto)
        } : null
      });
      setIsOpaModalOpen(false);
      alert('Orden de pago registrada correctamente.');
    } catch (err) {
      console.error(err);
      alert('Error: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalCobrado = recibos.reduce((acc, r) => acc + (r.totalRecibo || 0), 0);
  const totalPagado = ordenesPago.reduce((acc, o) => acc + (o.totalOPA || 0), 0);
  const totalTarjetasPendientes = tarjetas.filter(t => t.estado === 'pendiente_acreditacion').reduce((acc, t) => acc + (t.montoBruto || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Landmark size={24} color="var(--primary-600)" /> Tesorería & Caja / Bancos
          </h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Gestión de recibos de cobro, órdenes de pago, tarjetas a cobrar, cheques y conciliación bancaria.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={() => setIsReciboModalOpen(true)} className="btn btn-primary" style={{ backgroundColor: '#059669', borderColor: '#047857' }}>
            + Cobro Recibo (REC)
          </button>
          <button onClick={() => setIsOpaModalOpen(true)} className="btn btn-primary" style={{ backgroundColor: '#dc2626', borderColor: '#b91c1c' }}>
            - Orden de Pago (OPA)
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        <div className="card" style={{ borderLeft: '4px solid #059669', padding: '1rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total Cobranzas (Recibos)</span>
          <h3 style={{ margin: '0.25rem 0 0', color: '#059669' }}>$ {totalCobrado.toLocaleString('es-AR')}</h3>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #dc2626', padding: '1rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total Pagos Realizados (OPAs)</span>
          <h3 style={{ margin: '0.25rem 0 0', color: '#dc2626' }}>$ {totalPagado.toLocaleString('es-AR')}</h3>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #3b82f6', padding: '1rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Tarjetas Pendientes de Acreditación</span>
          <h3 style={{ margin: '0.25rem 0 0', color: '#2563eb' }}>$ {totalTarjetasPendientes.toLocaleString('es-AR')}</h3>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--border-light)', gap: '1rem' }}>
        <button 
          onClick={() => setActiveTab('recibos')} 
          style={{ padding: '0.5rem 1rem', border: 'none', background: 'none', fontWeight: '600', cursor: 'pointer', color: activeTab === 'recibos' ? 'var(--primary-600)' : '#64748b', borderBottom: activeTab === 'recibos' ? '2px solid var(--primary-600)' : 'none' }}
        >
          Recibos de Cobro ({recibos.length})
        </button>
        <button 
          onClick={() => setActiveTab('opas')} 
          style={{ padding: '0.5rem 1rem', border: 'none', background: 'none', fontWeight: '600', cursor: 'pointer', color: activeTab === 'opas' ? 'var(--primary-600)' : '#64748b', borderBottom: activeTab === 'opas' ? '2px solid var(--primary-600)' : 'none' }}
        >
          Órdenes de Pago ({ordenesPago.length})
        </button>
        <button 
          onClick={() => setActiveTab('tarjetas')} 
          style={{ padding: '0.5rem 1rem', border: 'none', background: 'none', fontWeight: '600', cursor: 'pointer', color: activeTab === 'tarjetas' ? 'var(--primary-600)' : '#64748b', borderBottom: activeTab === 'tarjetas' ? '2px solid var(--primary-600)' : 'none' }}
        >
          Tarjetas a Cobrar ({tarjetas.length})
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'recibos' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-hover)', borderBottom: '1px solid var(--border-light)' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Fecha</th>
                <th style={{ padding: '0.75rem 1rem' }}>Recibo N°</th>
                <th style={{ padding: '0.75rem 1rem' }}>Cliente</th>
                <th style={{ padding: '0.75rem 1rem' }}>Medio de Pago</th>
                <th style={{ padding: '0.75rem 1rem' }}>Monto Total ($)</th>
              </tr>
            </thead>
            <tbody>
              {recibos.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '0.75rem 1rem' }}>{r.fechaEmision}</td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: '600' }}>{r.numeroRecibo}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{r.clienteNombre}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {r.mediosPago?.map(m => m.medioId).join(', ') || 'Efectivo'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: '700', color: '#059669' }}>
                    $ {Number(r.totalRecibo || 0).toLocaleString('es-AR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'opas' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-hover)', borderBottom: '1px solid var(--border-light)' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Fecha</th>
                <th style={{ padding: '0.75rem 1rem' }}>OPA N°</th>
                <th style={{ padding: '0.75rem 1rem' }}>Proveedor / Beneficiario</th>
                <th style={{ padding: '0.75rem 1rem' }}>Tipo Imputación</th>
                <th style={{ padding: '0.75rem 1rem' }}>Monto Total ($)</th>
              </tr>
            </thead>
            <tbody>
              {ordenesPago.map(o => (
                <tr key={o.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '0.75rem 1rem' }}>{o.fechaEmision}</td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: '600' }}>{o.numeroOPA}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{o.proveedorNombre}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {o.imputacionDirecta ? (
                      <span style={{ color: '#d97706', fontSize: '0.75rem', fontWeight: '600' }}>
                        Imputación Directa ({o.imputacionDirecta.concepto})
                      </span>
                    ) : 'Cancelación Facturas'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: '700', color: '#dc2626' }}>
                    $ {Number(o.totalOPA || 0).toLocaleString('es-AR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'tarjetas' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-hover)', borderBottom: '1px solid var(--border-light)' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Fecha Cobro</th>
                <th style={{ padding: '0.75rem 1rem' }}>Cliente</th>
                <th style={{ padding: '0.75rem 1rem' }}>Monto Bruto ($)</th>
                <th style={{ padding: '0.75rem 1rem' }}>Neto Acreditar ($)</th>
                <th style={{ padding: '0.75rem 1rem' }}>Estado Acreditación</th>
              </tr>
            </thead>
            <tbody>
              {tarjetas.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '0.75rem 1rem' }}>{t.fechaCobro}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{t.clienteNombre}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>$ {Number(t.montoBruto || 0).toLocaleString('es-AR')}</td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: '600' }}>$ {Number(t.montoNetoAcreditar || 0).toLocaleString('es-AR')}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600', backgroundColor: '#fef3c7', color: '#d97706' }}>
                      {t.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Crear Recibo */}
      {isReciboModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem', backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'white', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '500px', padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem' }}>Nuevo Recibo de Cobro (REC)</h3>
            <form onSubmit={handleCrearRecibo} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.875rem' }}>Empresa</label>
                <select className="input-field" value={reciboForm.empresaId} onChange={e => setReciboForm({...reciboForm, empresaId: e.target.value})}>
                  {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.875rem' }}>Nombre Cliente</label>
                <input type="text" className="input-field" value={reciboForm.clienteNombre} onChange={e => setReciboForm({...reciboForm, clienteNombre: e.target.value})} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.875rem' }}>Monto ($)</label>
                  <input type="number" className="input-field" value={reciboForm.monto} onChange={e => setReciboForm({...reciboForm, monto: e.target.value})} required />
                </div>
                <div>
                  <label style={{ fontSize: '0.875rem' }}>Medio de Pago</label>
                  <select className="input-field" value={reciboForm.medioId} onChange={e => setReciboForm({...reciboForm, medioId: e.target.value})}>
                    {MEDIOS_PAGO.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                <button type="button" onClick={() => setIsReciboModalOpen(false)} className="btn-secondary">Cancelar</button>
                <button type="submit" className="btn-primary" disabled={isSubmitting}>Guardar Cobro</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Crear OPA */}
      {isOpaModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem', backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'white', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '500px', padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem' }}>Nueva Orden de Pago (OPA)</h3>
            <form onSubmit={handleCrearOPA} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.875rem' }}>Empresa</label>
                <select className="input-field" value={opaForm.empresaId} onChange={e => setOpaForm({...opaForm, empresaId: e.target.value})}>
                  {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.875rem' }}>Proveedor / Beneficiario</label>
                <input type="text" className="input-field" value={opaForm.proveedorNombre} onChange={e => setOpaForm({...opaForm, proveedorNombre: e.target.value})} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.875rem' }}>Monto Pago ($)</label>
                  <input type="number" className="input-field" value={opaForm.monto} onChange={e => setOpaForm({...opaForm, monto: e.target.value})} required />
                </div>
                <div>
                  <label style={{ fontSize: '0.875rem' }}>Medio de Salida</label>
                  <select className="input-field" value={opaForm.medioId} onChange={e => setOpaForm({...opaForm, medioId: e.target.value})}>
                    {MEDIOS_PAGO.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.5rem 0' }}>
                <input type="checkbox" id="impDirectaCheck" checked={opaForm.esImputacionDirecta} onChange={e => setOpaForm({...opaForm, esImputacionDirecta: e.target.checked})} />
                <label htmlFor="impDirectaCheck" style={{ fontSize: '0.875rem', cursor: 'pointer' }}>Pago de Imputación Directa (Sin factura previa en compras)</label>
              </div>

              {opaForm.esImputacionDirecta && (
                <div>
                  <label style={{ fontSize: '0.875rem' }}>Concepto Gasto</label>
                  <input type="text" className="input-field" value={opaForm.conceptoDirecto} onChange={e => setOpaForm({...opaForm, conceptoDirecto: e.target.value})} placeholder="Ej: Fletes y Acarreos Varios" />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                <button type="button" onClick={() => setIsOpaModalOpen(false)} className="btn-secondary">Cancelar</button>
                <button type="submit" className="btn-primary" disabled={isSubmitting}>Guardar Pago</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default Tesoreria;
