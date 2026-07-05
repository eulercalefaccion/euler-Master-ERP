import React from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { MapPin, Calendar, CheckCircle, Tag, DollarSign } from 'lucide-react';

const KanbanCard = ({ item, index, onCardClick }) => {
  const getPaymentBadge = (status) => {
    switch(status) {
      case 'Pago Completo':
        return <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><CheckCircle size={12}/> Pagado</span>;
      case 'Seña Abonada':
        return <span className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><DollarSign size={12}/> Seña</span>;
      default:
        return null;
    }
  };

  const hasRevisions = (item.revision || 0) > 0;
  const isCanal2 = item.canal === 'canal2';

  return (
    <Draggable draggableId={item.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onCardClick && onCardClick(item)}
          style={{
            userSelect: 'none',
            padding: '1rem',
            margin: '0 0 0.75rem 0',
            backgroundColor: snapshot.isDragging ? 'var(--bg-surface-hover)' : 'var(--bg-surface)',
            color: 'var(--text-primary)',
            borderRadius: 'var(--radius-md)',
            boxShadow: snapshot.isDragging ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
            border: '1px solid var(--border-light)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            cursor: 'pointer',
            position: 'relative',
            ...provided.draggableProps.style,
          }}
        >
          {/* Badges de revisión y canal arriba a la derecha */}
          <div style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', display: 'flex', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', backgroundColor: '#e0e7ff', color: '#3730a3', borderRadius: '8px', fontWeight: '700' }}>
              {item.presupuestoNumber || 'S/N'}{hasRevisions ? `-V${item.revision}` : ''}
            </span>
            {isCanal2 && (
              <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', backgroundColor: '#fef3c7', color: '#92400e', borderRadius: '8px', fontWeight: '700' }}>
                💵 Ch2
              </span>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingRight: hasRevisions || isCanal2 ? '3rem' : '0' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: '600', margin: 0 }}>{item.name}</h4>
            {getPaymentBadge(item.paymentStatus)}
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
              <MapPin size={12} />
              <span>{item.location || 'S/D'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
              <Calendar size={12} />
              <span>{item.date} • {item.source || 'S/D'}</span>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.5rem', borderRadius: '4px', backgroundColor: 'var(--primary-50)', color: 'var(--primary-700)', border: '1px solid var(--primary-100)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              <Tag size={10} />
              {item.paramSistema || item.type || 'S/D'}
            </span>
            {item.amount > 0 && (
              <span style={{ fontSize: '0.7rem', fontWeight: '600', padding: '0.1rem 0.5rem', color: 'var(--primary-700)', backgroundColor: '#f0f9ff', borderRadius: '4px', border: '1px solid #bae6fd' }}>
                $ {item.amount.toLocaleString('es-AR')}
              </span>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
};

export default KanbanCard;
