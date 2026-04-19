import React, { useState, useEffect } from 'react';
import { BadgeDollarSign, TrendingUp, Presentation, AlertCircle, Wrench, HardHat, Pickaxe, MapPin, Wallet } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

const Dashboard = () => {
  const [bnaRate, setBnaRate] = useState(null);
  const [bnaLoading, setBnaLoading] = useState(true);

  // Estados basados en Firebase
  const [obrasActivas, setObrasActivas] = useState([]);
  const [jornadasHoy, setJornadasHoy] = useState([]);
  const [presupuestosPendientes, setPresupuestosPendientes] = useState(0);

  // Estados vacíos por defecto hasta que se desarrollen los módulos financieros/SSTT
  const [alertasSSTT, setAlertasSSTT] = useState([]);
  const [metricasKpi, setMetricasKpi] = useState({
    rentabilidadMesGloba: 0,
    obrasEnAprobacion: 0,
    ventasMesActual: 0
  });

  const ventasAnuales = [
    { name: 'Ene', ventas: 0 }, { name: 'Feb', ventas: 0 }, { name: 'Mar', ventas: 0 },
    { name: 'Abr', ventas: 0 }, { name: 'May', ventas: 0 }, { name: 'Jun', ventas: 0 },
    { name: 'Jul', ventas: 0 }, { name: 'Ago', ventas: 0 }, { name: 'Sep', ventas: 0 },
    { name: 'Oct', ventas: 0 }, { name: 'Nov', ventas: 0 }, { name: 'Dic', ventas: 0 }
  ];

  useEffect(() => {
    // Oficial BNA API
    const fetchBnaRate = async () => {
      try {
        const response = await fetch('https://dolarapi.com/v1/dolares/oficial');
        const data = await response.json();
        setBnaRate(data.venta);
      } catch (error) {
        setBnaRate('N/A');
      } finally {
        setBnaLoading(false);
      }
    };
    fetchBnaRate();

    // Firebase Listeners
    const unsubObras = onSnapshot(collection(db, 'obras'), (snap) => {
      const obras = snap.docs.map(doc => ({id: doc.id, ...doc.data()}));
      setObrasActivas(obras);
    });

    const unsubJornadas = onSnapshot(collection(db, 'jornadas'), (snap) => {
      const hoy = new Date().toLocaleDateString('es-AR');
      const jor = snap.docs
        .map(doc => ({id: doc.id, ...doc.data()}))
        .filter(j => j.date === hoy);
      setJornadasHoy(jor);
    });

    const unsubPresupuestos = onSnapshot(collection(db, 'presupuestos'), (snap) => {
      let count = 0;
      snap.docs.forEach(doc => {
        const status = doc.data().status;
        if (status === 'seguimiento' || status === 'enviado' || status === 'calculo') {
          count++;
        }
      });
      setPresupuestosPendientes(count);
    });

    return () => {
      unsubObras();
      unsubJornadas();
      unsubPresupuestos();
    };
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
            <h3 style={{ fontSize: '1.75rem', margin: 0 }}>{metricasKpi.rentabilidadMesGloba}%</h3>
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
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>Presupuestos Activos</p>
            <h3 style={{ fontSize: '1.75rem', margin: 0 }}>{presupuestosPendientes}</h3>
          </div>
        </div>
        {/* KPI: Ventas Mensuales */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid var(--primary-600)' }}>
          <div style={{ backgroundColor: 'var(--primary-50)', color: 'var(--primary-600)', padding: '0.75rem', borderRadius: '50%' }}>
            <Wallet size={24} />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>Ventas Mes Actual</p>
            <h3 style={{ fontSize: '1.75rem', margin: 0 }}>$ {(metricasKpi.ventasMesActual / 1000000).toFixed(1)} M</h3>
          </div>
        </div>
      </div>

      {/* Gráfico de Ventas Anuales */}
      <div className="card" style={{ padding: '1.5rem', width: '100%', minHeight: '300px' }}>
        <h3 style={{ fontSize: '1.125rem', marginBottom: '1.5rem' }}>Evolución de Ventas Anuales</h3>
        <div style={{ width: '100%', height: '250px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ventasAnuales} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
            <span className="badge badge-primary">{obrasActivas.length} Activas</span>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {obrasActivas.map(obra => (
              <div key={obra.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: '600' }}>{obra.name || obra.clientName || 'Sin Nombre'}</h4>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Fase: {obra.phase || 'N/A'}</p>
                </div>
                <div style={{ width: '100px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ flex: 1, backgroundColor: 'var(--border-light)', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${obra.progress || 0}%`, backgroundColor: 'var(--primary-500)', height: '100%' }}></div>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{obra.progress || 0}%</span>
                </div>
              </div>
            ))}
            {obrasActivas.length === 0 && (
              <p style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', textAlign: 'center', padding: '1rem 0' }}>No hay obras activas en la nube actualmente.</p>
            )}
          </div>
        </div>

        {/* Jornadas del Día */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '1.125rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Pickaxe size={20} color="var(--success)" /> Cuadrillas Activas (Hoy)
            </h3>
            <span className="badge badge-success" style={{ backgroundColor: '#d1fae5', color: '#059669' }}>{jornadasHoy.length} HOY</span>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {jornadasHoy.map(jornada => (
              <div key={jornada.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px dashed var(--border-light)' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: '600' }}>{jornada.operario}</h4>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    <MapPin size={10} /> {jornada.obra || 'Desconocido'}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', backgroundColor: jornada.status === 'Activa' ? '#d1fae5' : '#f3f4f6', color: jornada.status === 'Activa' ? '#059669' : '#374151' }}>
                    {jornada.status}
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: '500', color: 'var(--text-secondary)' }}>Desde {jornada.startTime}</span>
                </div>
              </div>
            ))}
            {jornadasHoy.length === 0 && (
              <p style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', textAlign: 'center', padding: '1rem 0' }}>Ninguna cuadrilla ha fichado el día de hoy.</p>
            )}
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
          {alertasSSTT.map(sstt => (
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
          {alertasSSTT.length === 0 && (
            <p style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', textAlign: 'center', padding: '1rem 0' }}>No existen servicios técnicos pendientes para hoy.</p>
          )}
        </div>
      </div>

    </div>
  );
};

export default Dashboard;
