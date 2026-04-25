/**
 * Sueldos — Módulo integrado desde Euler Sueldos
 * Tabs: Inicio | Liquidar | Historial | Paritarias
 */
import React, { useState } from 'react';
import { SueldosProvider } from './SueldosContext';
import SueldosDashboard from './SueldosDashboard';
import SueldosLiquidar from './SueldosLiquidar';
import SueldosHistorial from './SueldosHistorial';
import SueldosParitarias from './SueldosParitarias';
import { Calendar, FileText, History, DollarSign } from 'lucide-react';

const tabs = [
  { id: 'inicio', label: 'Inicio', icon: Calendar },
  { id: 'liquidar', label: 'Liquidar', icon: FileText },
  { id: 'historial', label: 'Historial', icon: History },
  { id: 'paritarias', label: 'Paritarias', icon: DollarSign },
];

function SueldosContent() {
  const [activeTab, setActiveTab] = useState('inicio');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Tab Bar */}
      <div style={{
        display: 'flex', gap: '4px',
        background: 'var(--bg-surface)', padding: '4px',
        borderRadius: '12px', border: '1px solid var(--border-light)',
        width: 'fit-content'
      }}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', border: 'none', borderRadius: '8px',
                fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer',
                background: isActive ? 'var(--primary-500)' : 'transparent',
                color: isActive ? 'white' : 'var(--text-secondary)',
                transition: 'all 0.2s ease',
              }}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {activeTab === 'inicio' && <SueldosDashboard />}
      {activeTab === 'liquidar' && <SueldosLiquidar />}
      {activeTab === 'historial' && <SueldosHistorial />}
      {activeTab === 'paritarias' && <SueldosParitarias />}
    </div>
  );
}

export default function Sueldos() {
  return (
    <SueldosProvider>
      <SueldosContent />
    </SueldosProvider>
  );
}
