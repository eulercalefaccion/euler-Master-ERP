import React, { useState, useEffect } from 'react';
import { HardHat, Search, Plus, MapPin, User, Pickaxe, Thermometer, Calendar, X, Save, Building } from 'lucide-react';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot, query, addDoc } from 'firebase/firestore';

const Obras = () => {
  const [obras, setObras] = useState([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPhase, setFilterPhase] = useState('Todas');

  const phases = ['Todas', 'Obra', 'Instalación', 'Finalizada'];

  useEffect(() => {
    // Escuchar Obras
    const qObras = query(collection(db, 'obras')); 
    const unsubObras = onSnapshot(qObras, (snapshot) => {
      setObras(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => unsubObras();
  }, []);

  const filteredObras = obras.filter(obra => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = (obra.name && obra.name.toLowerCase().includes(term)) || 
                          (obra.clientName && obra.clientName.toLowerCase().includes(term));
    
    if (filterPhase === 'Todas') return matchesSearch;
    if (filterPhase === 'Finalizada') return matchesSearch && (obra.estado === 'Instalación Finalizada' || obra.estado === 'Finalizada');
    return matchesSearch && obra.phase === filterPhase;
  });

  const getStatusBadge = (estado) => {
    switch(estado) {
      case 'Pendiente de Inicio': return <span className="badge badge-neutral">{estado}</span>;
      case 'En Proceso': return <span className="badge badge-primary">{estado}</span>;
      case 'Finalizada': return <span className="badge badge-success" style={{ backgroundColor: 'var(--success)', color: 'white' }}>{estado}</span>;
      case 'Instalación Pendiente': return <span className="badge badge-warning">{estado}</span>;
      case 'Instalación en Proceso': return <span className="badge badge-primary" style={{ backgroundColor: 'var(--primary-600)', color: 'white' }}>{estado}</span>;
      case 'Instalación Finalizada': return <span className="badge badge-success" style={{ backgroundColor: 'var(--success)', color: 'white' }}>{estado}</span>;
      default: return <span className="badge badge-neutral">{estado}</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0 }}>Gestión de Obras</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Control y trazabilidad de Ejecución e Instalaciones
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flexGrow: 1, maxWidth: '400px' }}>
          <Search size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input 
            type="text" 
            placeholder="Buscar por nombre de obra o cliente..." 
            className="input-field"
            style={{ paddingLeft: '2.5rem' }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {phases.map(fase => (
            <button 
              key={fase}
              onClick={() => setFilterPhase(fase)}
              className={filterPhase === fase ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.875rem' }}
            >
              {fase}
            </button>
          ))}
        </div>
      </div>

      {/* Grid de Tarjetas */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem', paddingBottom: '2rem' }}>
        {filteredObras.map(obra => (
          <div key={obra.id} className="card hover-card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', cursor: 'pointer' }}>
            
            {/* Tarjeta - Cabecera */}
            <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface-hover)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: '600', margin: 0, paddingRight: '1rem' }}>{obra.name}</h3>
                {getStatusBadge(obra.estado)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                <MapPin size={14} /> {obra.location || 'Sin ubicación'}
              </div>
            </div>

            {/* Tarjeta - Cuerpo (Datos) */}
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: '600' }}>Cliente / Dueño</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem', fontWeight: '500' }}>
                    <User size={14} color="var(--primary-600)" /> {obra.clientName || 'No asignado'}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: '600' }}>Operarios Asignados</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem' }}>
                    <HardHat size={14} color="var(--accent-600)" /> {obra.operarios || 'Sin asignar'}
                  </div>
                </div>

              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: 'var(--bg-primary)', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                <Thermometer size={16} color="var(--warning)" />
                <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>{obra.system}</span>
              </div>
            </div>

            {/* Tarjeta - Progress & Footer */}
            <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border-light)', backgroundColor: '#fafafa' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                <span>Progreso ({obra.phase})</span>
                <span style={{ fontWeight: '600' }}>{obra.progress}%</span>
              </div>
              <div style={{ width: '100%', backgroundColor: 'var(--border-light)', height: '6px', borderRadius: '3px', overflow: 'hidden', marginBottom: '1rem' }}>
                <div style={{ width: `${obra.progress}%`, backgroundColor: obra.phase === 'Obra' ? 'var(--primary-500)' : 'var(--success)', height: '100%' }}></div>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Última anotación (Bitácora):</span>
                <p style={{ fontSize: '0.875rem', margin: 0, color: 'var(--text-primary)', fontStyle: 'italic', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  "{obra.bitacoraPreview || 'Aprobada, pendiente de contacto técnico.'}"
                </p>
              </div>
            </div>

          </div>
        ))}
        {filteredObras.length === 0 && (
           <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', gridColumn: '1 / -1' }}>
             No hay obras para mostrar. (Las obras nacen al aprobarse un presupuesto).
           </div>
        )}
      </div>

      <style>{`
        .hover-card { transition: transform 0.2s; }
        .hover-card:hover {
          transform: translateY(-4px);
          box-shadow: var(--shadow-md);
        }
      `}</style>
    </div>
  );
};

export default Obras;

