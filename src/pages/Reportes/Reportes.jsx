import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import ReportesTiempos from './ReportesTiempos';
import ReportesEncuestas from './ReportesEncuestas';
import ReportesIA from './ReportesIA';
import { BarChart2, MessageSquare, Clock, Lock } from 'lucide-react';
import './Reportes.css';

const Reportes = () => {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('tiempos');

  // ─── Guard: solo administradores ──────────────────────────────────────────
  const isAdmin = currentUser?.role === 'administrador' || currentUser?.email === 'nicolas@euler.com.ar';

  if (!isAdmin) {
    return (
      <div className="reportes-container">
        <div className="reportes-header">
          <h2 className="reportes-title">Reportes y Análisis</h2>
        </div>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4rem 2rem',
          gap: '1rem',
          textAlign: 'center',
        }}>
          <Lock size={48} color="var(--text-tertiary)" />
          <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.1rem' }}>
            Acceso Restringido
          </h3>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem', maxWidth: '320px' }}>
            Los reportes y KPIs son visibles únicamente para administradores del sistema.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="reportes-container">
      <div className="reportes-header">
        <h2 className="reportes-title">Reportes y Análisis</h2>
        <p className="reportes-subtitle">
          Analizá los indicadores clave de la empresa mediante reportes específicos o consultando a nuestra IA.
        </p>
      </div>

      <div className="reportes-tabs">
        <button
          className={`reportes-tab ${activeTab === 'tiempos' ? 'active' : ''}`}
          onClick={() => setActiveTab('tiempos')}
        >
          <Clock size={18} /> KPIs de Tiempos
        </button>
        <button
          className={`reportes-tab ${activeTab === 'encuestas' ? 'active' : ''}`}
          onClick={() => setActiveTab('encuestas')}
        >
          <BarChart2 size={18} /> Encuestas de Obra
        </button>
        <button
          className={`reportes-tab ${activeTab === 'ia' ? 'active' : ''}`}
          onClick={() => setActiveTab('ia')}
        >
          <MessageSquare size={18} /> Asistente de IA
        </button>
      </div>

      <div className="reportes-content">
        {activeTab === 'tiempos'   && <ReportesTiempos />}
        {activeTab === 'encuestas' && <ReportesEncuestas />}
        {activeTab === 'ia'        && <ReportesIA />}
      </div>
    </div>
  );
};

export default Reportes;
