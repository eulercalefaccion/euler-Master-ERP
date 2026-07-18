import React from 'react';
import { Tag, MapPin, Calendar } from 'lucide-react';

const CrmListView = ({ items, onCardClick, globalLabels = {}, columns, columnOrder }) => {
  // If columns are not provided, fallback to a single group
  const grouped = columns ? columnOrder.map(colId => ({
    col: columns[colId],
    items: items.filter(item => (item.status || 'pendiente') === colId)
  })) : [{ col: { id: 'all', title: 'Todos los Presupuestos' }, items }];

  return (
    <div style={{ background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-light)', overflowX: 'auto', padding: '1rem' }}>
      
      {grouped.map(group => {
        if (group.items.length === 0) return null;
        return (
          <div key={group.col.id} style={{ marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--primary-800)', borderBottom: '2px solid var(--primary-200)', paddingBottom: '0.5rem', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {group.col.title} ({group.items.length})
            </h3>
            
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface-hover)' }}>
                  <th style={{ padding: '0.75rem 1rem', color: 'var(--text-tertiary)', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Presupuesto</th>
                  <th style={{ padding: '0.75rem 1rem', color: 'var(--text-tertiary)', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cliente</th>
                  <th style={{ padding: '0.75rem 1rem', color: 'var(--text-tertiary)', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Monto</th>
                  <th style={{ padding: '0.75rem 1rem', color: 'var(--text-tertiary)', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Etiquetas</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map(item => {
                  const hasRevisions = (item.revision || 0) > 0;
                  const isCanal2 = item.canal === 'canal2';
                  return (
                    <tr 
                      key={item.id} 
                      onClick={() => onCardClick(item)}
                      style={{ borderBottom: '1px solid var(--border-light)', cursor: 'pointer', transition: 'background-color 0.15s' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '1rem', verticalAlign: 'middle' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--primary-700)' }}>
                          {item.presupuestoNumber || 'S/N'}{hasRevisions ? `-V${item.revision}` : ''}
                        </div>
                        {isCanal2 && (
                          <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', backgroundColor: '#fef3c7', color: '#92400e', borderRadius: '4px', fontWeight: '700', marginTop: '0.2rem', display: 'inline-block' }}>
                            Ch2
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '1rem', verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '0.875rem' }}>{item.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.2rem' }}>
                          <MapPin size={12} /> {item.location || 'S/D'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.2rem' }}>
                          <Calendar size={12} /> {item.date}
                        </div>
                      </td>
                      <td style={{ padding: '1rem', verticalAlign: 'middle', fontWeight: '600', color: 'var(--text-primary)' }}>
                        {item.amount > 0 ? `$ ${item.amount.toLocaleString('es-AR')}` : '-'}
                      </td>
                      <td style={{ padding: '1rem', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                          {item.labels && item.labels.map(lblId => {
                            const lInfo = globalLabels[lblId];
                            if (!lInfo) return null;
                            return (
                              <span key={lblId} style={{ backgroundColor: lInfo.color, color: 'white', fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: '600' }}>
                                {lInfo.name}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      {items.length === 0 && (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No se encontraron presupuestos.
        </div>
      )}
    </div>
  );
};

export default CrmListView;
