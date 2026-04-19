import React, { useState, useEffect } from 'react';
import { db } from '../../../services/firebaseConfig';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

const TabHistorial = () => {
  const [liquidaciones, setLiquidaciones] = useState([]);

  useEffect(() => {
    const q = query(collection(db, 'liquidaciones'), orderBy('fechaStamp', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setLiquidaciones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const totalHoras = liquidaciones.reduce((a,b) => a + (b.resumen?.totalHoras || 0), 0);
  const totalPagado = liquidaciones.reduce((a,b) => a + (b.resumen?.totalAPagar || 0), 0);
  const totalSalarios = liquidaciones.reduce((a,b) => a + (b.resumen?.totalSalarioPuro || 0), 0);
  const totalGastos = liquidaciones.reduce((a,b) => a + (b.resumen?.totalGastosExtras || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Filtros mockup */}
      <div className="card">
         <h4 style={{ margin: '0 0 1rem 0' }}>Historial de Liquidaciones</h4>
         <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
            <select className="input-field"><option>Año: Todos</option></select>
            <select className="input-field"><option>Mes: Todos</option></select>
            <select className="input-field"><option>Semana: Todas</option></select>
            <select className="input-field"><option>Colaborador: Todos</option></select>
         </div>
      </div>

      {/* Totales */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
         <div style={{ backgroundColor: '#e0f2fe', color: '#0369a1', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>HORAS TOTALES</div>
            <div style={{ fontSize: '1.5rem', fontWeight: '800' }}>{totalHoras.toFixed(1)} hs</div>
         </div>
         <div style={{ backgroundColor: '#ecfdf5', color: '#047857', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>TOTAL A PAGAR</div>
            <div style={{ fontSize: '1.5rem', fontWeight: '800' }}>${totalPagado.toLocaleString('es-AR')}</div>
         </div>
         <div style={{ backgroundColor: '#f3f4f6', color: '#374151', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>SALARIOS</div>
            <div style={{ fontSize: '1.25rem', fontWeight: '600' }}>${totalSalarios.toLocaleString('es-AR')}</div>
         </div>
         <div style={{ backgroundColor: '#f3f4f6', color: '#374151', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>GASTOS</div>
            <div style={{ fontSize: '1.25rem', fontWeight: '600' }}>${totalGastos.toLocaleString('es-AR')}</div>
         </div>
      </div>

      {/* Lista de Recibos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
         {liquidaciones.map(liq => (
            <div key={liq.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem' }}>
               <div>
                 <h4 style={{ margin: '0 0 0.25rem 0', textTransform: 'uppercase' }}>{liq.colaboradorNombre}</h4>
                 <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Semana {liq.semana} - Año {liq.anio}
                 </div>
               </div>
               <div style={{ textAlign: 'right' }}>
                 <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#059669' }}>
                   ${liq.resumen?.totalAPagar?.toLocaleString('es-AR')}
                 </div>
                 <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {new Date(liq.fechaStamp).toLocaleDateString('es-AR')}
                 </div>
               </div>
            </div>
         ))}
         {liquidaciones.length === 0 && (
           <p style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>No hay liquidaciones registradas.</p>
         )}
      </div>

    </div>
  );
};

export default TabHistorial;
