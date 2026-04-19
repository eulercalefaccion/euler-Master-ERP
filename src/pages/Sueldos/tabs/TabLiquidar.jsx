import React, { useState, useEffect } from 'react';
import { db } from '../../../services/firebaseConfig';
import { collection, onSnapshot, getDoc, doc, addDoc, serverTimestamp } from 'firebase/firestore';

const TabLiquidar = ({ onNavigate }) => {
  const [colaboradores, setColaboradores] = useState([]);
  const [paritarias, setParitarias] = useState({});
  const [selectedColabId, setSelectedColabId] = useState('');
  
  const [semana, setSemana] = useState({ numero: 16, anio: new Date().getFullYear() });
  const [horas, setHoras] = useState({
    Lunes: 0, Martes: 0, Miercoles: 0, Jueves: 0, Viernes: 0, Sabado: 0, Domingo: 0
  });

  const [bocas, setBocas] = useState({
    obraNueva2p: { cant: 0, detalle: '' },
    obraNueva3p: { cant: 0, detalle: '' },
    refaccion2p: { cant: 0, detalle: '' },
    refaccion3p: { cant: 0, detalle: '' }
  });

  const [adicionales, setAdicionales] = useState({ vacacion: 0, bono: 0, aguinaldo: 0, retroactivo: 0 });
  const [gastos, setGastos] = useState([]); // { monto, detalle }
  const [nuevoGasto, setNuevoGasto] = useState({ monto: 0, detalle: '' });
  const [descuento, setDescuento] = useState(0);
  const [notas, setNotas] = useState('');

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const unsubC = onSnapshot(collection(db, 'colaboradores'), snap => {
      setColaboradores(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const fetchP = async () => {
      const d = await getDoc(doc(db, 'configuracion', 'paritarias'));
      if (d.exists()) setParitarias(d.data());
    };
    fetchP();
    return () => unsubC();
  }, []);

  const selectedColab = colaboradores.find(c => c.id === selectedColabId);
  
  // Math Base
  let valorHoraBase = 0;
  if (selectedColab) {
    if (selectedColab.categoriaBase === 'Oficial Especializado') valorHoraBase = paritarias.especializado;
    if (selectedColab.categoriaBase === 'Oficial') valorHoraBase = paritarias.oficial;
    if (selectedColab.categoriaBase === 'Medio Oficial') valorHoraBase = paritarias.medioOficial;
    // Pct Adicional
    const pct = selectedColab.adicionalPct || 0;
    valorHoraBase = valorHoraBase * (1 + (pct / 100));
  }

  const totalHoras = Object.values(horas).reduce((a,b) => a + Number(b), 0);
  const totalSalarioHoras = totalHoras * valorHoraBase;

  // Bocas (simplificado usando precios default de Paritarias para el layout visual)
  const totalBocas = 
    (bocas.obraNueva2p.cant * (paritarias.bocaNueva || 25000)) +
    (bocas.obraNueva3p.cant * (paritarias.bocaNueva || 25000)) +
    (bocas.refaccion2p.cant * (paritarias.bocaRefaccion || 32000)) + 
    (bocas.refaccion3p.cant * (paritarias.bocaRefaccion || 32000));

  const totalAdic = Number(adicionales.vacacion) + Number(adicionales.bono) + Number(adicionales.aguinaldo) + Number(adicionales.retroactivo);
  const totalGastosE = gastos.reduce((a,b) => a + Number(b.monto), 0);
  
  const totalSalarioFinal = totalSalarioHoras + totalBocas + totalAdic - Number(descuento);

  const handleSaveLiquidacion = async () => {
    if (!selectedColab) return alert("Selecciona un colaborador");
    
    setIsSaving(true);
    try {
      const payload = {
        colaboradorId: selectedColab.id,
        colaboradorNombre: selectedColab.nombre,
        semana: semana.numero,
        anio: semana.anio,
        horas: horas,
        bocas: bocas,
        adicionales: adicionales,
        gastos: gastos,
        descuento: descuento,
        notas: notas,
        resumen: {
           valorHoraAplicado: valorHoraBase,
           totalHoras: totalHoras,
           totalDineroHoras: totalSalarioHoras,
           totalDineroBocas: totalBocas,
           totalSalarioPuro: totalSalarioFinal,
           totalGastosExtras: totalGastosE,
           totalAPagar: totalSalarioFinal + totalGastosE
        },
        fechaStamp: new Date().toISOString()
      };

      await addDoc(collection(db, 'liquidaciones'), payload);

      // Integrar con Balance
      await addDoc(collection(db, 'transacciones'), {
        tipo: 'egreso',
        monto: totalSalarioFinal + totalGastosE,
        categoria: 'Mano de Obra',
        obraName: 'Liquidación Semana ' + semana.numero,
        descripcion: `Pago ${selectedColab.nombre} (Semana ${semana.numero})`,
        fecha: new Date().toISOString().split('T')[0],
        createdAt: serverTimestamp()
      });

      alert("Liquidación guardada y dinero descontado de Balance!");
      if (onNavigate) onNavigate('historial');
    } catch (e) {
       console.error(e);
       alert("Error al liquidar");
    }
    setIsSaving(false);
  };

  const handleAddGasto = () => {
    if (nuevoGasto.monto > 0) {
      setGastos([...gastos, { ...nuevoGasto }]);
      setNuevoGasto({ monto: 0, detalle: '' });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Settings Panel */}
      <div className="card">
         <h4 style={{ margin: '0 0 1rem 0' }}>Liquidar Sueldo Semanal</h4>
         <div className="form-group" style={{ marginBottom: '1rem' }}>
           <label>Colaborador</label>
           <select className="input-field" value={selectedColabId} onChange={e=>setSelectedColabId(e.target.value)}>
             <option value="">Seleccionar colaborador...</option>
             {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.categoriaBase})</option>)}
           </select>
         </div>
         <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            <div className="form-group">
               <label>Tipo Sem.</label>
               <select className="input-field"><option>Estándar (Lun-Dom)</option></select>
            </div>
            <div className="form-group">
               <label>Semana</label>
               <input type="number" className="input-field" value={semana.numero} onChange={e=>setSemana({...semana, numero: e.target.value})}/>
            </div>
            <div className="form-group">
               <label>Año</label>
               <input type="number" className="input-field" value={semana.anio} onChange={e=>setSemana({...semana, anio: e.target.value})}/>
            </div>
         </div>
         <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#e0e7ff', color: '#4338ca', textAlign: 'center', borderRadius: '8px', fontWeight: '600' }}>
           Semana {semana.numero} - Año {semana.anio}
         </div>
      </div>

      {/* Horas Grid */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
           <h4 style={{ margin: 0 }}>Horas Trabajadas masculinas</h4>
           <span style={{ fontWeight: '600' }}>Total: {totalHoras.toFixed(1)} hs</span>
        </div>
        {['Lunes','Martes','Miercoles','Jueves','Viernes','Sabado','Domingo'].map(dia => (
          <div key={dia} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 0', borderBottom: '1px solid var(--border-light)' }}>
            <span style={{ width: '100px', fontSize: '0.875rem' }}>{dia}</span>
            <input 
               type="number" step="0.5" className="input-field" style={{ flex: 1 }}
               value={horas[dia]} onChange={e => setHoras({...horas, [dia]: e.target.value})}
            />
            <span style={{ width: '40px', textAlign: 'right', fontWeight: '500' }}>{Number(horas[dia]).toFixed(1)}h</span>
          </div>
        ))}
      </div>

      {/* Bocas Produccion */}
      <div className="card">
         <h4 style={{ margin: '0 0 1rem 0' }}>Producción Bocas</h4>
         {/* Simple map for bocas state */}
         <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
           
           <div style={{ backgroundColor: '#fdf4ff', padding: '1rem', border: '1px solid #fbcfe8', borderRadius: '8px' }}>
             <p style={{ margin: '0 0 0.5rem 0', fontWeight: '600', color: '#86198f', fontSize: '0.75rem' }}>OBRA NUEVA</p>
             <div style={{ display: 'flex', gap: '1rem' }}>
               <input type="number" placeholder="Cant." className="input-field" style={{ width: '80px' }} value={bocas.obraNueva2p.cant} onChange={e=>setBocas({...bocas, obraNueva2p: {...bocas.obraNueva2p, cant: e.target.value}})} />
               <input type="text" placeholder="Nombre de la obra" className="input-field" value={bocas.obraNueva2p.detalle} onChange={e=>setBocas({...bocas, obraNueva2p: {...bocas.obraNueva2p, detalle: e.target.value}})} />
             </div>
           </div>
           
           <div style={{ backgroundColor: '#faf5ff', padding: '1rem', border: '1px solid #e9d5ff', borderRadius: '8px' }}>
             <p style={{ margin: '0 0 0.5rem 0', fontWeight: '600', color: '#6b21a8', fontSize: '0.75rem' }}>REFACCIÓN</p>
             <div style={{ display: 'flex', gap: '1rem' }}>
               <input type="number" placeholder="Cant." className="input-field" style={{ width: '80px' }} value={bocas.refaccion2p.cant} onChange={e=>setBocas({...bocas, refaccion2p: {...bocas.refaccion2p, cant: e.target.value}})} />
               <input type="text" placeholder="Nombre de la obra" className="input-field" value={bocas.refaccion2p.detalle} onChange={e=>setBocas({...bocas, refaccion2p: {...bocas.refaccion2p, detalle: e.target.value}})} />
             </div>
           </div>

           <div style={{ textAlign: 'right', fontWeight: '600', color: '#059669' }}>Total Bocas: ${totalBocas.toLocaleString('es-AR')}</div>
         </div>
      </div>

      {/* Adicionales y Descuentos */}
      <div className="card">
         <h4 style={{ margin: '0 0 1rem 0' }}>Adicionales</h4>
         <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
           <div style={{ display: 'flex', gap: '1rem' }}>
             <span style={{ width: '100px', fontSize: '0.875rem', alignSelf: 'center' }}>Vacaciones</span>
             <input type="number" className="input-field" style={{ width: '150px' }} value={adicionales.vacacion} onChange={e=>setAdicionales({...adicionales, vacacion: e.target.value})} />
           </div>
           <div style={{ display: 'flex', gap: '1rem' }}>
             <span style={{ width: '100px', fontSize: '0.875rem', alignSelf: 'center' }}>Bono UOCRA</span>
             <input type="number" className="input-field" style={{ width: '150px' }} value={adicionales.bono} onChange={e=>setAdicionales({...adicionales, bono: e.target.value})} />
           </div>
         </div>
      </div>

      {/* Gastos */}
      <div className="card">
         <h4 style={{ margin: '0 0 1rem 0' }}>Gastos (transferencia aparte)</h4>
         <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
           <input type="number" placeholder="$ Monto" className="input-field" style={{ width: '150px' }} value={nuevoGasto.monto} onChange={e=>setNuevoGasto({...nuevoGasto, monto: e.target.value})} />
           <input type="text" placeholder="Concepto (Ej. Nafta)" className="input-field" value={nuevoGasto.detalle} onChange={e=>setNuevoGasto({...nuevoGasto, detalle: e.target.value})} />
           <button type="button" className="btn-primary" onClick={handleAddGasto}>+ Agregar</button>
         </div>
         {gastos.map((g, i) => (
           <div key={i} style={{ padding: '0.5rem', borderBottom: '1px solid #eee', fontSize: '0.875rem' }}>- {g.detalle}: ${g.monto}</div>
         ))}
         <div style={{ textAlign: 'right', fontWeight: '600', color: '#2563eb' }}>Total Gastos: ${totalGastosE.toLocaleString('es-AR')}</div>
      </div>

      {/* RESUMEN FINAL */}
      <div style={{ backgroundColor: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: '12px', padding: '1.5rem' }}>
         <h3 style={{ margin: '0 0 1rem 0', color: '#047857' }}>Resumen de Liquidación</h3>
         
         <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
           <span>Horas ({totalHoras.toFixed(1)}h × ${valorHoraBase.toFixed(2)})</span>
           <span style={{ fontWeight: '500' }}>${totalSalarioHoras.toLocaleString('es-AR')}</span>
         </div>
         <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
           <span>Bocas Producción</span>
           <span style={{ fontWeight: '500' }}>${totalBocas.toLocaleString('es-AR')}</span>
         </div>
         <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', color: '#dc2626' }}>
           <span>DESCUENTO / ADELANTO</span>
           <input type="number" className="input-field" style={{ width: '120px', padding: '0.25rem', color: '#dc2626', borderColor: '#fca5a5' }} value={descuento} onChange={e=>setDescuento(e.target.value)} />
         </div>

         <div style={{ borderTop: '2px dashed #a7f3d0', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600' }}>
             <span>TOTAL SALARIO (Básico + Bocas + Adic - Desc)</span>
             <span>${totalSalarioFinal.toLocaleString('es-AR')}</span>
           </div>
           <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2563eb', fontWeight: '600' }}>
             <span>TOTAL GASTOS</span>
             <span>${totalGastosE.toLocaleString('es-AR')}</span>
           </div>
         </div>

         <div style={{ backgroundColor: '#d1fae5', padding: '1rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', marginTop: '1rem', fontSize: '1.25rem', fontWeight: '800', color: '#047857' }}>
           <span>A PAGAR:</span>
           <span>${(totalSalarioFinal + totalGastosE).toLocaleString('es-AR')}</span>
         </div>

         <button 
           onClick={handleSaveLiquidacion} disabled={isSaving}
           style={{ width: '100%', marginTop: '1.5rem', backgroundColor: '#059669', color: 'white', padding: '1rem', fontWeight: 'bold', fontSize: '1.125rem', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
         >
           {isSaving ? 'GUARDANDO...' : 'GUARDAR LIQUIDACIÓN'}
         </button>
      </div>

    </div>
  );
};

export default TabLiquidar;
