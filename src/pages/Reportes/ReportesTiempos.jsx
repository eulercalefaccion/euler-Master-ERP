import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';
import { Loader } from 'lucide-react';

const ReportesTiempos = () => {
  const [presupuestos, setPresupuestos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'presupuestos'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPresupuestos(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const calculateAverageHours = (startStatus, endStatus) => {
    let totalHours = 0;
    let count = 0;

    presupuestos.forEach(p => {
      // Usar createdAt si estamos midiendo desde "pendiente" y no hay history inicial
      let startTime = null;
      let endTime = null;

      if (startStatus === 'pendiente') {
        const firstPendiente = (p.statusHistory || []).find(h => h.status === 'pendiente');
        startTime = firstPendiente ? new Date(firstPendiente.date) : (p.createdAt?.toDate() || new Date(p.date));
      } else {
        const firstStart = (p.statusHistory || []).find(h => h.status === startStatus);
        if (firstStart) startTime = new Date(firstStart.date);
      }

      const firstEnd = (p.statusHistory || []).find(h => h.status === endStatus);
      if (firstEnd) endTime = new Date(firstEnd.date);

      if (startTime && endTime && endTime > startTime) {
        const diffMs = endTime - startTime;
        totalHours += diffMs / (1000 * 60 * 60);
        count++;
      }
    });

    if (count === 0) return { avg: 0, count: 0 };
    return { avg: (totalHours / count).toFixed(1), count };
  };

  const metrics = [
    { label: '1 a 2 (Pendiente a Enviado)', data: calculateAverageHours('pendiente', 'enviado') },
    { label: '3 a 4 (Enviado a Seguimiento)', data: calculateAverageHours('enviado', 'seguimiento') },
    { label: '4 a 5 (Seguimiento a Aprobado)', data: calculateAverageHours('seguimiento', 'aprobado') },
    { label: '1 a 5 (Pendiente a Aprobado)', data: calculateAverageHours('pendiente', 'aprobado') },
    { label: '3 a 5 (Enviado a Aprobado)', data: calculateAverageHours('enviado', 'aprobado') },
  ];

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><Loader className="spin" size={32} /></div>;
  }

  return (
    <div className="report-card" style={{ flex: 1, overflowY: 'auto' }}>
      <h3 style={{ margin: 0, color: 'var(--text-primary)', marginBottom: '1rem' }}>Tiempos de Ciclo de Presupuestos</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Tiempo promedio que transcurre entre cada columna del Kanban. Valores expresados en horas.
      </p>

      <div className="kpi-grid">
        {metrics.map((m, idx) => (
          <div key={idx} className="kpi-card">
            <span className="kpi-label">{m.label}</span>
            <span className="kpi-value">{m.data.avg} <span style={{ fontSize: '1rem', color: 'var(--text-tertiary)' }}>horas</span></span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Muestra: {m.data.count} casos</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ReportesTiempos;
