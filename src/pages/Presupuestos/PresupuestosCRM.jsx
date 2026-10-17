import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { SquareKanban, LayoutList } from 'lucide-react';
import KanbanBoard from '../../components/Kanban/KanbanBoard';
import ListadoPresupuestos from '../Listados/ListadoPresupuestos';

/**
 * Presupuestos — pantalla única con dos pestañas:
 *  - Tablero (?vista=tablero, por defecto): seguimiento comercial tipo kanban (con sus vistas lista/mapa).
 *  - Listado (?vista=listado): listado comercial/financiero con KPIs, filtros y exportación.
 * La ruta anterior /listado-presupuestos redirige a /presupuestos?vista=listado.
 */
const VISTAS = [
  { id: 'tablero', label: 'Tablero', icon: SquareKanban, hint: 'Seguimiento de cada presupuesto por etapa' },
  { id: 'listado', label: 'Listado', icon: LayoutList, hint: 'Listado con totales, filtros y exportación a Excel' },
];

const PresupuestosCRM = () => {
  const [params, setParams] = useSearchParams();
  const vista = params.get('vista') === 'listado' ? 'listado' : 'tablero';

  const cambiarVista = (id) => {
    const next = new URLSearchParams(params);
    if (id === 'tablero') next.delete('vista'); else next.set('vista', id);
    setParams(next, { replace: true });
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div role="tablist" aria-label="Vistas de presupuestos" style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border-light)', marginBottom: '1rem', flexShrink: 0 }}>
        {VISTAS.map((v) => {
          const { id, label, hint } = v;
          const Icono = v.icon;
          const activa = vista === id;
          return (
            <button
              key={id}
              id={`presupuestos-tab-${id}`}
              role="tab"
              aria-selected={activa}
              title={hint}
              onClick={() => cambiarVista(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '0.6rem 1rem', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.88rem',
                fontWeight: activa ? 700 : 500, color: activa ? '#0D2A4E' : 'var(--text-secondary)',
                borderBottom: `3px solid ${activa ? '#F5A623' : 'transparent'}`, marginBottom: -1, fontFamily: 'inherit',
              }}
            >
              <Icono size={16} /> {label}
            </button>
          );
        })}
      </div>

      {vista === 'tablero' ? <KanbanBoard /> : <ListadoPresupuestos embedded />}
    </div>
  );
};

export default PresupuestosCRM;
