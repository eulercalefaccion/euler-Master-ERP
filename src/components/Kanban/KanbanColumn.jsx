import React from 'react';
import { Droppable } from '@hello-pangea/dnd';
import KanbanCard from './KanbanCard';

const KanbanColumn = ({ column, items, onCardClick }) => {
  const totalAmount = items.reduce((acc, item) => item.amount ? acc + item.amount : acc, 0);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minWidth: '280px',
      width: '280px',
      backgroundColor: 'var(--bg-surface-hover)',
      borderRadius: 'var(--radius-lg)',
      padding: '0.75rem',
      height: '100%',
    }}>
      <div style={{ padding: '0.5rem 0.5rem 1rem 0.5rem', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
            {column.title}
          </h3>
          <span style={{ backgroundColor: 'var(--bg-surface)', padding: '0.1rem 0.5rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-tertiary)', border: '1px solid var(--border-light)' }}>
            {items.length}
          </span>
        </div>
        {totalAmount > 0 && (
          <div style={{ fontSize: '0.75rem', fontWeight: '500', color: 'var(--primary-600)', marginTop: '0.25rem' }}>
            $ {totalAmount.toLocaleString('es-AR')}
          </div>
        )}
      </div>

      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            style={{
              flexGrow: 1,
              minHeight: '100px',
              transition: 'background-color 0.2s',
              backgroundColor: snapshot.isDraggingOver ? 'var(--primary-50)' : 'transparent',
              borderRadius: 'var(--radius-md)',
            }}
          >
            {items.map((item, index) => (
              <KanbanCard key={item.id} item={item} index={index} onCardClick={onCardClick} />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
};

export default KanbanColumn;
