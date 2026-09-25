import React, { useState, useEffect } from 'react';
import { Wallet, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Plus, Search, Filter, Landmark, Tag, ShoppingBag, ShieldAlert } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import NuevaTransaccionModal from './components/NuevaTransaccionModal';
import { getEmpresas } from '../../services/empresasService';

const Balance = () => {
  const [transacciones, setTransacciones] = useState([]);
  const [compras, setCompras] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [recibos, setRecibos] = useState([]);
  const [ordenesPago, setOrdenesPago] = useState([]);
  const [obrasActivas, setObrasActivas] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [filtroObra, setFiltroObra] = useState('');
  const [excluirParticular, setExcluirParticular] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    (async () => {
      setEmpresas(await getEmpresas());
    })();

    const unsubTrans = onSnapshot(query(collection(db, 'transacciones'), orderBy('fecha', 'desc')), snap => {
      setTransacciones(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubObras = onSnapshot(query(collection(db, 'obras')), snap => {
      setObrasActivas(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubCompras = onSnapshot(query(collection(db, 'comprobantes_compra')), snap => {
      setCompras(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubVentas = onSnapshot(query(collection(db, 'comprobantes_venta')), snap => {
      setVentas(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubRecibos = onSnapshot(query(collection(db, 'recibos')), snap => {
      setRecibos(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubOPAs = onSnapshot(query(collection(db, 'ordenes_pago')), snap => {
      setOrdenesPago(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubTrans(); unsubObras(); unsubCompras(); unsubVentas(); unsubRecibos(); unsubOPAs();
    };
  }, []);

  // Filtrado por Obra / Empresa
  const filterByContext = (item) => {
    if (filtroEmpresa && item.empresaId && item.empresaId !== filtroEmpresa) return false;
    if (filtroObra && item.obraId && item.obraId !== filtroObra) return false;
    return true;
  };

  const ventasFiltradas = ventas.filter(filterByContext);
  const comprasFiltradas = compras.filter(c => filterByContext(c) && (!excluirParticular || c.centroCosto !== 'DE APLICACIÓN PARTICULAR'));
  const recibosFiltrados = recibos.filter(filterByContext);
  const opasFiltradas = ordenesPago.filter(filterByContext);
  const transaccionesFiltradas = transacciones.filter(filterByContext);

  // Totales Devengados (Económicos)
  const totalVentasDevengadas = ventasFiltradas.reduce((acc, v) => acc + (v.totalComprobante || 0), 0);
  const totalComprasDevengadas = comprasFiltradas.reduce((acc, c) => acc + (c.totalComprobante || 0), 0);
  const egresosPlanos = transaccionesFiltradas.reduce((acc, t) => t.tipo === 'egreso' ? acc + (t.monto || 0) : acc, 0);
  const ingresosPlanos = transaccionesFiltradas.reduce((acc, t) => t.tipo === 'ingreso' ? acc + (t.monto || 0) : acc, 0);

  // Totales Percibidos (Flujo de Caja Real)
  const totalCobradoRecibos = recibosFiltrados.reduce((acc, r) => acc + (r.totalRecibo || 0), 0) + ingresosPlanos;
  const totalPagadoOPAs = opasFiltradas.reduce((acc, o) => acc + (o.totalOPA || 0), 0) + egresosPlanos;
  const flujoCajaNeto = totalCobradoRecibos - totalPagadoOPAs;

  // Cuentas por Cobrar & Pagar (Saldos)
  const totalDeudaClientes = ventasFiltradas.reduce((acc, v) => acc + (v.saldoPendiente || 0), 0);
  const totalDeudaProveedores = comprasFiltradas.reduce((acc, c) => acc + (c.saldoPendiente || 0), 0);

  // Rentabilidad Económica Real (No cobros - pagos)
  const costoTotal = totalComprasDevengadas + egresosPlanos;
  const ingresosDevengadosTotal = totalVentasDevengadas + ingresosPlanos;
  const rentabilidadEconomicaReal = ingresosDevengadosTotal - costoTotal;
  const margenReal = ingresosDevengadosTotal > 0 ? ((rentabilidadEconomicaReal / ingresosDevengadosTotal) * 100).toFixed(1) : 0;

  // Impuestos (IVA Débito - IVA Crédito)
  const totalIvaDebito = ventasFiltradas.reduce((acc, v) => acc + (v.totalIva || 0), 0);
  const totalIvaCredito = comprasFiltradas.reduce((acc, c) => acc + (c.totalIva || 0), 0);
  const saldoIva = totalIvaDebito - totalIvaCredito;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Wallet size={24} color="var(--primary-600)" /> Balance General & Rentabilidad Integrada
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Consolidado por período, empresa y obra. Distingue resultado devengado, flujo de caja, impuestos y cuentas corrientes.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={18} /> Nueva Transacción Simple
        </button>
      </div>

      {/* Filtros Contextuales */}
      <div className="card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', backgroundColor: 'var(--bg-surface-hover)' }}>
        <Filter size={18} color="var(--text-secondary)" />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>Empresa:</span>
          <select className="input-field" value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)} style={{ width: '200px' }}>
            <option value="">Todas las Empresas</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>Obra:</span>
          <select className="input-field" value={filtroObra} onChange={e => setFiltroObra(e.target.value)} style={{ width: '220px' }}>
            <option value="">Balance Global (Todas)</option>
            {obrasActivas.map(o => <option key={o.id} value={o.id}>{o.name || o.clientName}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}>
          <input type="checkbox" id="excluirPart" checked={excluirParticular} onChange={e => setExcluirParticular(e.target.checked)} />
          <label htmlFor="excluirPart" style={{ fontSize: '0.85rem', cursor: 'pointer' }}>Excluir Centros "DE APLICACIÓN PARTICULAR"</label>
        </div>
      </div>

      {/* KPI Row 1: Resultado Económico Devengado vs Flujo de Caja */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
        
        <div className="card" style={{ borderLeft: rentabilidadEconomicaReal >= 0 ? '4px solid #059669' : '4px solid #dc2626' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Rentabilidad Económica Real (Devengado)</span>
          <h3 style={{ fontSize: '1.75rem', margin: '0.25rem 0', color: rentabilidadEconomicaReal >= 0 ? '#059669' : '#dc2626' }}>
            $ {rentabilidadEconomicaReal.toLocaleString('es-AR')}
          </h3>
          <span style={{ fontSize: '0.75rem', fontWeight: '600', color: rentabilidadEconomicaReal >= 0 ? '#059669' : '#dc2626' }}>
            Margen Operativo: {margenReal}% (Ventas: ${ingresosDevengadosTotal.toLocaleString('es-AR')} - Costos: ${costoTotal.toLocaleString('es-AR')})
          </span>
        </div>

        <div className="card" style={{ borderLeft: '4px solid #2563eb' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Flujo de Caja Real (Percibido)</span>
          <h3 style={{ fontSize: '1.75rem', margin: '0.25rem 0', color: '#2563eb' }}>
            $ {flujoCajaNeto.toLocaleString('es-AR')}
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Cobrado: ${totalCobradoRecibos.toLocaleString('es-AR')} | Pagado: ${totalPagadoOPAs.toLocaleString('es-AR')}
          </span>
        </div>

        <div className="card" style={{ borderLeft: '4px solid #d97706' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Posición Fiscal IVA (Estimada)</span>
          <h3 style={{ fontSize: '1.75rem', margin: '0.25rem 0', color: saldoIva >= 0 ? '#dc2626' : '#059669' }}>
            $ {Math.abs(saldoIva).toLocaleString('es-AR')}
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {saldoIva >= 0 ? 'IVA a Pagar (Débito > Crédito)' : 'Saldo a Favor IVA (Crédito > Débito)'}
          </span>
        </div>

      </div>

      {/* KPI Row 2: Cuentas Corrientes y Saldos Pendientes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
        <div className="card" style={{ padding: '1rem', backgroundColor: '#f0fdf4' }}>
          <span style={{ fontSize: '0.75rem', color: '#166534', fontWeight: '600' }}>Cuentas por Cobrar (Clientes me deben)</span>
          <h4 style={{ margin: '0.25rem 0 0', fontSize: '1.35rem', color: '#15803d' }}>
            $ {totalDeudaClientes.toLocaleString('es-AR')}
          </h4>
        </div>
        <div className="card" style={{ padding: '1rem', backgroundColor: '#fef2f2' }}>
          <span style={{ fontSize: '0.75rem', color: '#991b1b', fontWeight: '600' }}>Cuentas por Pagar (Debo a Proveedores)</span>
          <h4 style={{ margin: '0.25rem 0 0', fontSize: '1.35rem', color: '#b91c1c' }}>
            $ {totalDeudaProveedores.toLocaleString('es-AR')}
          </h4>
        </div>
      </div>

      {/* Historial Transacciones / Movimientos */}
      <div className="card" style={{ padding: '1rem' }}>
        <h4 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>Movimientos Recientes de Balance</h4>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-surface-hover)', textAlign: 'left', color: 'var(--text-secondary)' }}>
              <th style={{ padding: '0.5rem 0.75rem' }}>Fecha</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>Tipo</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>Categoría / Concepto</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>Obra</th>
              <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Monto ($)</th>
            </tr>
          </thead>
          <tbody>
            {transaccionesFiltradas.slice(0, 10).map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                <td style={{ padding: '0.5rem 0.75rem' }}>{t.fecha}</td>
                <td style={{ padding: '0.5rem 0.75rem', fontWeight: '600', color: t.tipo === 'ingreso' ? '#059669' : '#dc2626' }}>
                  {t.tipo?.toUpperCase()}
                </td>
                <td style={{ padding: '0.5rem 0.75rem' }}>{t.categoria} - {t.descripcion}</td>
                <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-secondary)' }}>{t.obraName || 'Global'}</td>
                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: '700', color: t.tipo === 'ingreso' ? '#059669' : '#dc2626' }}>
                  $ {Number(t.monto || 0).toLocaleString('es-AR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && <NuevaTransaccionModal onClose={() => setIsModalOpen(false)} obrasActivas={obrasActivas} />}

    </div>
  );
};

export default Balance;
