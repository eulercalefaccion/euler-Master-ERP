import React from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { MapPin, Calendar, CheckCircle, Tag, DollarSign } from 'lucide-react';

const KanbanCard = ({ item, index }) => {
  const getPaymentBadge = (status) => {
    switch(status) {
      case 'Pago Completo':
        return <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><CheckCircle size={12}/> Pagado</span>;
      case 'Seña Abonada':
        return <span className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><DollarSign size={12}/> Seña</span>;
      default:
        return <span className="badge badge-neutral" style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>Pendiente</span>;
    }
  };

  return (
    <Draggable draggableId={item.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          style={{
            ...provided.draggableProps.style,
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
            transition: 'background-color 0.2s',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: '600', margin: 0, paddingRight: '1rem' }}>{item.name}</h4>
            {/* Si tiene status de pago distinto a null o pendiente normal de inicio, mostrarlo (generalmente para Aprobado o Seguimiento Avanzado) */}
            {(item.paymentStatus && item.paymentStatus !== 'Pendiente' || item.amount) && (
               getPaymentBadge(item.paymentStatus)
            )}
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
              <MapPin size={12} />
              <span>{item.location}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
              <Calendar size={12} />
              <span>{item.date} • {item.canal}</span>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.5rem', borderRadius: '4px', backgroundColor: 'var(--primary-50)', color: 'var(--primary-700)', border: '1px solid var(--primary-100)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              <Tag size={10} />
              {item.type}
            </span>
            {item.amount && (
              <span style={{ fontSize: '0.7rem', fontWeight: '600', padding: '0.1rem 0.5rem', color: 'var(--text-secondary)' }}>
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
