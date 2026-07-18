import React from 'react';
import { MapPin, User } from 'lucide-react';

const ObrasListView = ({ obras, onOpenDetail, getStatusBadge }) => {
  return (
    <div style={{ background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-light)', overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'var(--bg-surface-hover)', color: 'var(--text-tertiary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-light)' }}>Obra</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-light)' }}>Ubicación</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-light)' }}>Cliente</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-light)' }}>Estado</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid var(--border-light)', textAlign: 'right' }}>Progreso</th>
            </tr>
          </thead>
          <tbody>
            {obras.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>No hay obras para mostrar con los filtros actuales.</td>
              </tr>
            ) : (
              obras.map(obra => (
                <tr 
                  key={obra.id} 
                  onClick={() => onOpenDetail(obra)}
                  style={{ borderBottom: '1px solid var(--border-light)', cursor: 'pointer' }}
                  className="hover-row"
                >
                  <td style={{ padding: '1rem', verticalAlign: 'middle' }}>
                    {obra.otNumber && <div style={{ fontSize: '0.7rem', color: 'var(--primary-600)', fontWeight: '600' }}>{obra.otNumber}</div>}
                    <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{obra.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{obra.system || 'Sin sistema'}</div>
                  </td>
                  <td style={{ padding: '1rem', verticalAlign: 'middle', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <MapPin size={14} /> {obra.location || 'S/D'}
                    </div>
                  </td>
                  <td style={{ padding: '1rem', verticalAlign: 'middle', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <User size={14} /> {obra.clientName || 'S/D'}
                    </div>
                  </td>
                  <td style={{ padding: '1rem', verticalAlign: 'middle' }}>
                    <div style={{ transform: 'scale(0.85)', transformOrigin: 'left center' }}>
                      {getStatusBadge(obra.estado, obra.phase)}
                    </div>
                  </td>
                  <td style={{ padding: '1rem', verticalAlign: 'middle', textAlign: 'right' }}>
                    <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>{obra.progress || 0}%</div>
                    <div style={{ width: '60px', height: '4px', background: 'var(--border-light)', borderRadius: '2px', marginLeft: 'auto', overflow: 'hidden' }}>
                      <div style={{ width: `${obra.progress || 0}%`, height: '100%', background: 'var(--primary-500)', borderRadius: '2px' }} />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <style>{`
        .hover-row:hover {
          background-color: var(--bg-surface-hover);
        }
      `}</style>
    </div>
  );
};

export default ObrasListView;
