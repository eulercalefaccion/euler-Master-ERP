import React, { useState, useEffect } from 'react';
import { Wallet, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Plus, Search, Filter } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import NuevaTransaccionModal from './components/NuevaTransaccionModal';

const Balance = () => {
  const [transacciones, setTransacciones] = useState([]);
  const [obrasActivas, setObrasActivas] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filtroObra, setFiltroObra] = useState('');

  // Agrupación mensual para el gráfico
  const [monthlyData, setMonthlyData] = useState([]);

  useEffect(() => {
    // Escuchar transacciones
    const qTrans = query(collection(db, 'transacciones'), orderBy('fecha', 'desc'));
    const unsubTrans = onSnapshot(qTrans, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTransacciones(data);
      
      // Armar gráfica mensual de los últimos 6 meses
      const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const currentMonth = new Date().getMonth();
      const chartDataMap = {};
      
      data.forEach(t => {
        if (!t.fecha) return;
        const d = new Date(t.fecha);
        // Filtrar transacciones del año actual (o ajustar a mobile range)
        if (d.getFullYear() === new Date().getFullYear()) {
          const m = meses[d.getMonth()];
          if (!chartDataMap[m]) chartDataMap[m] = { name: m, Ingresos: 0, Egresos: 0, sort: d.getMonth() };
          
          if (t.tipo === 'ingreso') chartDataMap[m].Ingresos += t.monto;
          if (t.tipo === 'egreso') chartDataMap[m].Egresos += t.monto;
        }
      });
      
      const sortedData = Object.values(chartDataMap).sort((a,b) => a.sort - b.sort);
      setMonthlyData(sortedData);
    });

    // Escuchar obras para los filtros
    const qObras = query(collection(db, 'obras'));
    const unsubObras = onSnapshot(qObras, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setObrasActivas(data);
    });

    return () => {
      unsubTrans();
      unsubObras();
    };
  }, []);

  // Filtrado
  const transaccionesFiltradas = filtroObra 
    ? transacciones.filter(t => t.obraId === filtroObra) 
    : transacciones;

  // KPIs
  const totalIngresos = transaccionesFiltradas.reduce((acc, curr) => curr.tipo === 'ingreso' ? acc + curr.monto : acc, 0);
  const totalEgresos = transaccionesFiltradas.reduce((acc, curr) => curr.tipo === 'egreso' ? acc + curr.monto : acc, 0);
  const rentabilidadNeta = totalIngresos - totalEgresos;
  const margen = totalIngresos > 0 ? ((rentabilidadNeta / totalIngresos) * 100).toFixed(1) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', height: '100%', paddingBottom: '2rem' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Wallet size={24} color="var(--primary-600)" /> Balance General
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Control financiero, ingresos, egresos y rentabilidad. Vista visible para toda la empresa.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={18} /> Nueva Transacción
        </button>
      </div>

      {/* Control Filtros */}
      <div className="card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', backgroundColor: 'var(--bg-surface-hover)', border: '1px solid var(--border-light)' }}>
        <Filter size={18} color="var(--text-secondary)" />
        <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>Analizar Rentabilidad de:</span>
        <select 
          className="input-field" 
          value={filtroObra} 
          onChange={(e) => setFiltroObra(e.target.value)}
          style={{ maxWidth: '300px', backgroundColor: 'white' }}
        >
          <option value="">Balance Global (Todas las operaciones)</option>
          <optgroup label="Obras Activas">
            {obrasActivas.map(o => (
              <option key={o.id} value={o.id}>{o.name || o.clientName}</option>
            ))}
          </optgroup>
        </select>
      </div>

      {/* KPI Row */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
        
        {/* KPI: Ingresos */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', borderLeft: '4px solid #059669' }}>
          <div style={{ backgroundColor: '#d1fae5', color: '#059669', padding: '1rem', borderRadius: '50%' }}>
            <TrendingUp size={28} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>Total Ingresos Brutos</p>
            <h3 style={{ fontSize: '1.875rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              $ {totalIngresos.toLocaleString('es-AR')}
              <ArrowUpRight size={18} color="#059669" />
            </h3>
          </div>
        </div>

        {/* KPI: Egresos */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', borderLeft: '4px solid #dc2626' }}>
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '1rem', borderRadius: '50%' }}>
            <TrendingDown size={28} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>Total Egresos (Costos/Pagos)</p>
            <h3 style={{ fontSize: '1.875rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              $ {totalEgresos.toLocaleString('es-AR')}
              <ArrowDownRight size={18} color="#dc2626" />
            </h3>
          </div>
        </div>

        {/* KPI: Rentabilidad */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', borderLeft: rentabilidadNeta >= 0 ? '4px solid var(--primary-500)' : '4px solid #dc2626' }}>
          <div style={{ backgroundColor: rentabilidadNeta >= 0 ? 'var(--primary-100)' : '#fee2e2', color: rentabilidadNeta >= 0 ? 'var(--primary-700)' : '#dc2626', padding: '1rem', borderRadius: '50%' }}>
            <Wallet size={28} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>Flujo de Caja (Neta)</p>
            <h3 style={{ fontSize: '1.875rem', margin: 0 }}>
              $ {rentabilidadNeta.toLocaleString('es-AR')}
            </h3>
            <span style={{ fontSize: '0.75rem', color: rentabilidadNeta >= 0 ? '#059669' : '#dc2626', fontWeight: '500' }}>
              Margen Global: {margen}%
            </span>
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'revert', gap: '1.5rem', display: 'grid' }}>
        
        {/* Gráfico */}
        {!filtroObra && (
          <div className="card" style={{ padding: '1.5rem', minHeight: '350px' }}>
            <h3 style={{ fontSize: '1.125rem', marginBottom: '1.5rem' }}>Evolución Financiera del Año</h3>
            <div style={{ width: '100%', height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 12, fill: 'var(--text-tertiary)' }}
                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip 
                    cursor={{ fill: 'var(--bg-surface-hover)' }}
                    formatter={(value) => [`$ ${value.toLocaleString('es-AR')}`]}
                  />
                  <Legend verticalAlign="top" height={36}/>
                  <Bar dataKey="Ingresos" fill="#059669" radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar dataKey="Egresos" fill="#dc2626" radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Tabla de Movimientos */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1.125rem', margin: 0 }}>Historial de Movimientos</h3>
          </div>
          
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-surface-hover)', borderBottom: '1px solid var(--border-light)' }}>
                  <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: '600' }}>Fecha</th>
                  <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: '600' }}>Tipo/Concepto</th>
                  <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: '600' }}>Categoría</th>
                  <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: '600' }}>Obra Asociada</th>
                  <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: '600', textAlign: 'right' }}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {transaccionesFiltradas.length > 0 ? transaccionesFiltradas.map(t => (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border-light)', transition: 'background var(--transition-fast)' }} className="table-row-hover">
                    <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      {t.fecha ? new Date(t.fecha).toLocaleDateString('es-AR') : 'N/A'}
                    </td>
                    <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {t.tipo === 'ingreso' ? <ArrowUpRight size={16} color="#059669" /> : <ArrowDownRight size={16} color="#dc2626" />}
                        <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{t.descripcion || 'Sin detalle'}</span>
                      </div>
                    </td>
                    <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem' }}>
                      <span className="badge" style={{ backgroundColor: 'var(--bg-surface-hover)', color: 'var(--text-secondary)' }}>
                        {t.categoria}
                      </span>
                    </td>
                    <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      {t.obraName || '- Global -'}
                    </td>
                    <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', fontWeight: '600', textAlign: 'right', color: t.tipo === 'ingreso' ? '#059669' : '#dc2626' }}>
                      {t.tipo === 'ingreso' ? '+' : '-'} $ {t.monto.toLocaleString('es-AR')}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="5" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
                      No se encontraron movimientos financieros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isModalOpen && <NuevaTransaccionModal onClose={() => setIsModalOpen(false)} obrasActivas={obrasActivas} />}
    </div>
  );
};

export default Balance;
