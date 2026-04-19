import React, { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
import { db } from '../../../services/firebaseConfig';
import { collection, onSnapshot, getDoc, doc } from 'firebase/firestore';

const TabInicio = () => {
  const [totalColabs, setTotalColabs] = useState(0);
  const [paritarias, setParitarias] = useState({
    mesVigente: '-',
    especializado: 0,
    oficial: 0,
    medioOficial: 0
  });

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'colaboradores'), (snap) => {
      setTotalColabs(snap.docs.length);
    });

    const fetchConfig = async () => {
      const d = await getDoc(doc(db, 'configuracion', 'paritarias'));
      if (d.exists()) setParitarias(d.data());
    };
    fetchConfig();

    return () => unsub();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Resumen Superior */}
      <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <p style={{ margin: 0, color: 'var(--primary-600)', fontWeight: '600', fontSize: '0.875rem' }}>Mes Vigente</p>
        <h2 style={{ fontSize: '2rem', margin: '0.25rem 0 0 0', textTransform: 'uppercase' }}>{paritarias.mesVigente}</h2>
        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Paritaria: {paritarias.mesVigente}</p>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem' }}>
        <div className="card" style={{ padding: '1.5rem', textAlign: 'center' }}>
           <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Especializado</p>
           <h3 style={{ margin: 0, fontSize: '1.5rem' }}>${paritarias.especializado}</h3>
        </div>
        <div className="card" style={{ padding: '1.5rem', textAlign: 'center' }}>
           <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Oficial</p>
           <h3 style={{ margin: 0, fontSize: '1.5rem' }}>${paritarias.oficial}</h3>
        </div>
        <div className="card" style={{ padding: '1.5rem', textAlign: 'center' }}>
           <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Medio Oficial</p>
           <h3 style={{ margin: 0, fontSize: '1.5rem' }}>${paritarias.medioOficial}</h3>
        </div>
        <div className="card" style={{ padding: '1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
             <Users size={16} /> Plantilla
           </div>
           <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{totalColabs} <span style={{fontSize: '0.875rem', fontWeight:'400'}}>colaboradores</span></h3>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '1rem' }}>
         <div className="card" style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>
            [ Gráfico: Evolución de Salarios ]
         </div>
         <div className="card" style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>
            [ Gráfico: Producción Bocas ]
         </div>
      </div>

    </div>
  );
};

export default TabInicio;
