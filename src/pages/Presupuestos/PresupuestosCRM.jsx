import React from 'react';
import KanbanBoard from '../../components/Kanban/KanbanBoard';
import { Plus } from 'lucide-react';

const PresupuestosCRM = () => {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <KanbanBoard />
    </div>
  );
};

export default PresupuestosCRM;
