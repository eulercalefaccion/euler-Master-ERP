import React from 'react';
import KanbanBoard from '../../components/Kanban/KanbanBoard';
import { Plus } from 'lucide-react';

const PresupuestosCRM = () => {
  return (
    <div style={{ height: '100%', overflow: 'hidden', maxHeight: 'calc(100vh - 130px)' }}>
      <KanbanBoard />
    </div>
  );
};

export default PresupuestosCRM;
