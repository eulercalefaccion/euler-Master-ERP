import React, { useState } from 'react';
import ReportesTiempos from './ReportesTiempos';
import ReportesEncuestas from './ReportesEncuestas';
import ReportesIA from './ReportesIA';
import { BarChart2, MessageSquare, Clock } from 'lucide-react';
import './Reportes.css';

const Reportes = () => {
  const [activeTab, setActiveTab] = useState('tiempos');

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
          <Clock size={18} /> Tiempos y Kanban
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
        {activeTab === 'tiempos' && <ReportesTiempos />}
        {activeTab === 'encuestas' && <ReportesEncuestas />}
        {activeTab === 'ia' && <ReportesIA />}
      </div>
    </div>
  );
};

export default Reportes;
