import React, { useState, useEffect } from 'react';
import { Save, AlertCircle } from 'lucide-react';
import { db } from '../../../services/firebaseConfig';
import { collection, doc, getDoc, setDoc } from 'firebase/firestore';

const TabParitarias = () => {
  const [isSaving, setIsSaving] = useState(false);
  const [paritarias, setParitarias] = useState({
    mesVigente: 'ABRIL 2026',
    especializado: 6011,
    oficial: 5142,
    medioOficial: 4752,
    bocaNueva: 25000,
    bocaRefaccion: 32000
  });

  useEffect(() => {
    const fetchValores = async () => {
      const d = await getDoc(doc(db, 'configuracion', 'paritarias'));
      if (d.exists()) {
        setParitarias(prev => ({ ...prev, ...d.data() }));
      }
    };
    fetchValores();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'configuracion', 'paritarias'), paritarias);
      alert('Valores actualizados exitosamente en la base de datos.');
    } catch (error) {
      console.error(error);
      alert('Error guardando paritarias');
    }
    setIsSaving(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
           <h3 style={{ fontSize: '1.25rem', margin: 0 }}>Paritarias y Valores Base</h3>
           <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Configuración global de importes sindicales y de producción por bocas.</p>
        </div>
        <button className="btn-primary" onClick={handleSave} disabled={isSaving} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Save size={18} /> {isSaving ? 'Guardando...' : 'Guardar Valores'}
        </button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
        
        {/* Salarios por Hora */}
        <div className="card">
           <h4 style={{ margin: '0 0 1.5rem 0', fontSize: '1.125rem', color: 'var(--primary-700)', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>Valores por Hora Hombre ($)</h4>
           
           <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
             <div className="form-group">
               <label>Mes / Año Vigente</label>
               <input className="input-field" value={paritarias.mesVigente} onChange={e => setParitarias({...paritarias, mesVigente: e.target.value})} placeholder="EJ: MAYO 2026" />
             </div>
             <div className="form-group">
               <label>Oficial Especializado</label>
               <input type="number" className="input-field" value={paritarias.especializado} onChange={e => setParitarias({...paritarias, especializado: Number(e.target.value)})} />
             </div>
             <div className="form-group">
               <label>Oficial</label>
               <input type="number" className="input-field" value={paritarias.oficial} onChange={e => setParitarias({...paritarias, oficial: Number(e.target.value)})} />
             </div>
             <div className="form-group">
               <label>Medio Oficial</label>
               <input type="number" className="input-field" value={paritarias.medioOficial} onChange={e => setParitarias({...paritarias, medioOficial: Number(e.target.value)})} />
             </div>
           </div>
        </div>

        {/* Valores Producción Bocas */}
        <div className="card">
           <h4 style={{ margin: '0 0 1.5rem 0', fontSize: '1.125rem', color: '#059669', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>Producción por Bocas ($)</h4>
           <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
             <div className="form-group">
               <label>Boca - Obra Nueva</label>
               <input type="number" className="input-field" value={paritarias.bocaNueva} onChange={e => setParitarias({...paritarias, bocaNueva: Number(e.target.value)})} />
             </div>
             <div className="form-group">
               <label>Boca - Refacción</label>
               <input type="number" className="input-field" value={paritarias.bocaRefaccion} onChange={e => setParitarias({...paritarias, bocaRefaccion: Number(e.target.value)})} />
             </div>

             <div style={{ padding: '1rem', backgroundColor: '#e0f2fe', color: '#0284c7', borderRadius: '8px', fontSize: '0.875rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginTop: '1rem' }}>
                <AlertCircle size={20} />
                <p style={{ margin: 0 }}>El pago por "Boca" ignora las horas trabajadas en el día, ya que es un pago por rendimiento unitario.</p>
             </div>
           </div>
        </div>

      </div>

    </div>
  );
};

export default TabParitarias;
