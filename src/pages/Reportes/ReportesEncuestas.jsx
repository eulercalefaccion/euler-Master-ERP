import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';
import { Loader } from 'lucide-react';

const ReportesEncuestas = () => {
  const [encuestas, setEncuestas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'encuestas_obra'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEncuestas(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Calcular promedios
  const calcPromedio = (field) => {
    const valid = encuestas.filter(e => e.respuestas && typeof e.respuestas[field] === 'number');
    if (valid.length === 0) return 0;
    const sum = valid.reduce((acc, curr) => acc + curr.respuestas[field], 0);
    return (sum / valid.length).toFixed(1);
  };

  const promedios = {
    general: calcPromedio('general'),
    tiempo: calcPromedio('tiempo'),
    limpieza: calcPromedio('limpieza'),
    amabilidad: calcPromedio('amabilidad'),
    recomendacion: calcPromedio('recomendacion'),
  };

  const promedioTotal = encuestas.length > 0 
    ? ((parseFloat(promedios.general) + parseFloat(promedios.tiempo) + parseFloat(promedios.limpieza) + parseFloat(promedios.amabilidad) + parseFloat(promedios.recomendacion)) / 5).toFixed(1)
    : 0;

  const outsiders = encuestas.filter(e => {
    if (!e.respuestas) return false;
    const avg = (e.respuestas.general + e.respuestas.tiempo + e.respuestas.limpieza + e.respuestas.amabilidad + e.respuestas.recomendacion) / 5;
    return avg < 7; // Puntajes promedios menores a 7
  });

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><Loader className="spin" size={32} /></div>;
  }

  return (
    <div className="report-card" style={{ flex: 1, overflowY: 'auto' }}>
      <h3 style={{ margin: 0, color: 'var(--text-primary)', marginBottom: '1rem' }}>Análisis de Encuestas de Obra</h3>
      
      <div className="kpi-grid">
        <div className="kpi-card" style={{ backgroundColor: 'var(--success)', color: 'white', borderColor: 'var(--success)' }}>
          <span className="kpi-label" style={{ color: '#ecfdf5' }}>Satisfacción Global</span>
          <span className="kpi-value" style={{ color: 'white' }}>{promedioTotal} <span style={{ fontSize: '1rem' }}>/ 10</span></span>
          <span style={{ fontSize: '0.75rem', color: '#ecfdf5' }}>Basado en {encuestas.length} encuestas</span>
        </div>
        
        <div className="kpi-card">
          <span className="kpi-label">Atención Gral.</span>
          <span className="kpi-value">{promedios.general}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Tiempo</span>
          <span className="kpi-value">{promedios.tiempo}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Limpieza</span>
          <span className="kpi-value">{promedios.limpieza}</span>
        </div>
      </div>

      <h4 style={{ marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>Outsiders (Alertas de Bajo Puntaje - Menor a 7)</h4>
      {outsiders.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>No hay encuestas con puntajes críticos recientes.</p>
      ) : (
        <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              <th style={{ padding: '0.5rem' }}>Cliente</th>
              <th style={{ padding: '0.5rem' }}>Fecha</th>
              <th style={{ padding: '0.5rem' }}>Puntaje Prom.</th>
              <th style={{ padding: '0.5rem' }}>Comentario</th>
            </tr>
          </thead>
          <tbody>
            {outsiders.map(out => {
              const avg = ((out.respuestas.general + out.respuestas.tiempo + out.respuestas.limpieza + out.respuestas.amabilidad + out.respuestas.recomendacion) / 5).toFixed(1);
              return (
                <tr key={out.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: '500' }}>{out.clienteNombre}</td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>{new Date(out.createdAt?.toDate()).toLocaleDateString('es-AR')}</td>
                  <td style={{ padding: '0.75rem 0.5rem', color: 'var(--danger)', fontWeight: 'bold' }}>{avg}</td>
                  <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {out.comentarios || 'Sin comentarios'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default ReportesEncuestas;
