import React, { useState } from 'react';
import { Home, Calculator, History, Settings, Users, Receipt } from 'lucide-react';
import TabInicio from './tabs/TabInicio';
import TabLiquidar from './tabs/TabLiquidar';
import TabHistorial from './tabs/TabHistorial';
import TabParitarias from './tabs/TabParitarias';
import TabPersonas from './tabs/TabPersonas';

const Sueldos = () => {
  const [activeTab, setActiveTab] = useState('inicio');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%', paddingBottom: '2rem' }}>
      
      {/* Module Header & Tab Navigation */}
      <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <Receipt size={24} color="var(--primary-600)" /> Liquidación de Sueldos
        </h2>
        
        <div style={{ display: 'flex', gap: '2rem', overflowX: 'auto', paddingBottom: '2px' }}>
          <button 
            onClick={() => setActiveTab('inicio')}
            style={{ 
               background: 'none', border: 'none', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', padding: '0.5rem 0',
               color: activeTab === 'inicio' ? 'var(--primary-600)' : 'var(--text-secondary)',
               borderBottom: activeTab === 'inicio' ? '2px solid var(--primary-600)' : '2px solid transparent'
            }}
          >
             <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Home size={18}/> Inicio</div>
          </button>
          
          <button 
            onClick={() => setActiveTab('liquidar')}
            style={{ 
               background: 'none', border: 'none', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', padding: '0.5rem 0',
               color: activeTab === 'liquidar' ? 'var(--primary-600)' : 'var(--text-secondary)',
               borderBottom: activeTab === 'liquidar' ? '2px solid var(--primary-600)' : '2px solid transparent'
            }}
          >
             <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Calculator size={18}/> Liquidar</div>
          </button>
          
          <button 
            onClick={() => setActiveTab('historial')}
            style={{ 
               background: 'none', border: 'none', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', padding: '0.5rem 0',
               color: activeTab === 'historial' ? 'var(--primary-600)' : 'var(--text-secondary)',
               borderBottom: activeTab === 'historial' ? '2px solid var(--primary-600)' : '2px solid transparent'
            }}
          >
             <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><History size={18}/> Historial</div>
          </button>

          <button 
            onClick={() => setActiveTab('paritarias')}
            style={{ 
               background: 'none', border: 'none', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', padding: '0.5rem 0',
               color: activeTab === 'paritarias' ? 'var(--primary-600)' : 'var(--text-secondary)',
               borderBottom: activeTab === 'paritarias' ? '2px solid var(--primary-600)' : '2px solid transparent'
            }}
          >
             <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Settings size={18}/> Paritarias</div>
          </button>

          <button 
            onClick={() => setActiveTab('personas')}
            style={{ 
               background: 'none', border: 'none', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', padding: '0.5rem 0',
               color: activeTab === 'personas' ? 'var(--primary-600)' : 'var(--text-secondary)',
               borderBottom: activeTab === 'personas' ? '2px solid var(--primary-600)' : '2px solid transparent'
            }}
          >
             <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Users size={18}/> Personas</div>
          </button>
        </div>
      </div>

      {/* Tab Content Rendering */}
      <div style={{ flex: 1 }}>
        {activeTab === 'inicio' && <TabInicio />}
        {activeTab === 'liquidar' && <TabLiquidar onNavigate={setActiveTab} />}
        {activeTab === 'historial' && <TabHistorial />}
        {activeTab === 'paritarias' && <TabParitarias />}
        {activeTab === 'personas' && <TabPersonas />}
      </div>

    </div>
  );
};

export default Sueldos;
