import React, { useState, useEffect } from 'react';
import { dashboardData } from './mockDataDashboard';
import { BadgeDollarSign, TrendingUp, Presentation, AlertCircle, Wrench, HardHat, Pickaxe, MapPin, Wallet } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const Dashboard = () => {
  const [bnaRate, setBnaRate] = useState(null);
  const [bnaLoading, setBnaLoading] = useState(true);

  useEffect(() => {
    // Obtener cotización Dólar Oficial Vendedor mediante DolarAPI
    const fetchBnaRate = async () => {
      try {
        const response = await fetch('https://dolarapi.com/v1/dolares/oficial');
        const data = await response.json();
        setBnaRate(data.venta);
      } catch (error) {
        console.error("Error obteniendo Dólar BNA", error);
        setBnaRate('N/A');
      } finally {
        setBnaLoading(false);
      }
    };
    fetchBnaRate();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>
      <div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0 }}>Dashboard Principal</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>Resumen operativo y comercial de Euler</p>
      </div>

      {/* KPI Row */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
        
        {/* KPI: Rentabilidad */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid var(--success)' }}>
          <div style={{ backgroundColor: '#d1fae5', color: '#059669', padding: '0.75rem', borderRadius: '50%' }}>
            <TrendingUp size={24} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>Rentabilidad Global (Mes)</p>
            <h3 style={{ fontSize: '1.75rem', margin: 0 }}>{dashboardData.metricasKpi.rentabilidadMesGloba}%</h3>
          </div>
        </div>

        {/* KPI: Dólar BNA */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid var(--primary-500)' }}>
          <div style={{ backgroundColor: 'var(--primary-100)', color: 'var(--primary-700)', padding: '0.75rem', borderRadius: '50%' }}>
            <BadgeDollarSign size={24} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>Cotización USD BNA (Vendedor)</p>
            <h3 style={{ fontSize: '1.75rem', margin: 0 }}>
              {bnaLoading ? <span style={{ fontSize: '1rem', color: 'var(--text-tertiary)' }}>Cargando...</span> : `$ ${bnaRate}`}
            </h3>
          </div>
        </div>

        {/* KPI: Presupuestos en Seguimiento */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid var(--warning)' }}>
          <div style={{ backgroundColor: '#fef3c7', color: '#d97706', padding: '0.75rem', borderRadius: '50%' }}>
            <Presentation size={24} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>Presupuestos Pendientes</p>
            <h3 style={{ fontSize: '1.75rem', margin: 0 }}>{dashboardData.metricasKpi.presupuestosEnviados}</h3>
          </div>
        </div>
        {/* KPI: Ventas Mensuales */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid var(--primary-600)' }}>
          <div style={{ backgroundColor: 'var(--primary-50)', color: 'var(--primary-600)', padding: '0.75rem', borderRadius: '50%' }}>
            <Wallet size={24} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>Ventas Mes Actual</p>
            <h3 style={{ fontSize: '1.75rem', margin: 0 }}>$ {(dashboardData.metricasKpi.ventasMesActual / 1000000).toFixed(1)} M</h3>
          </div>
        </div>
      </div>

      {/* Gráfico de Ventas Anuales */}
      <div className="card" style={{ padding: '1.5rem', width: '100%', minHeight: '300px' }}>
        <h3 style={{ fontSize: '1.125rem', marginBottom: '1.5rem' }}>Evolución de Ventas Anuales</h3>
        <div style={{ width: '100%', height: '250px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dashboardData.ventasAnuales} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 12, fill: 'var(--text-tertiary)' }}
                tickFormatter={(value) => `$${value / 1000000}M`}
              />
              <Tooltip 
                cursor={{ fill: 'var(--bg-surface-hover)' }}
                formatter={(value) => [`$ ${value.toLocaleString('es-AR')}`, 'Ventas']}
              />
              <Bar dataKey="ventas" fill="var(--primary-500)" radius={[4, 4, 0, 0]} barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Control Operativo Row */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
        
        {/* Obras en Curso */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '1.125rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <HardHat size={20} color="var(--primary-600)" /> Obras e Instalaciones en curso
            </h3>
            <span className="badge badge-primary">{dashboardData.obrasActivas.length} Activas</span>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {dashboardData.obrasActivas.map(obra => (
              <div key={obra.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: '600' }}>{obra.name}</h4>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Fase: {obra.status}</p>
                </div>
                <div style={{ width: '100px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ flex: 1, backgroundColor: 'var(--border-light)', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${obra.progress}%`, backgroundColor: 'var(--primary-500)', height: '100%' }}></div>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{obra.progress}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Jornadas del Día */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '1.125rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Pickaxe size={20} color="var(--success)" /> Cuadrillas Activas (Hoy)
            </h3>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {dashboardData.jornadasHoy.map(jornada => (
              <div key={jornada.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px dashed var(--border-light)' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: '600' }}>{jornada.operario}</h4>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    <MapPin size={10} /> {jornada.location}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', backgroundColor: jornada.statusColor, color: 'white' }}>
                    {jornada.status}
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: '500', color: 'var(--text-secondary)' }}>{jornada.tiempo}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Alertas Post Venta */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
          <AlertCircle size={20} color="var(--accent-500)" />
          <h3 style={{ fontSize: '1.125rem', margin: 0 }}>Asistencia y Post-Venta (SSTT Pendientes)</h3>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {dashboardData.alertasSSTT.map(sstt => (
            <div key={sstt.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', backgroundColor: '#fef2f2', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid #fecaca' }}>
              <Wrench size={18} color="var(--accent-600)" />
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: 0, fontSize: '0.875rem', color: 'var(--accent-600)' }}>{sstt.problema}</h4>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Cliente: {sstt.cliente}</p>
              </div>
              <span className="badge badge-warning" style={{ backgroundColor: '#fee2e2', color: 'var(--accent-600)' }}>
                Hace {sstt.dias} días
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default Dashboard;
