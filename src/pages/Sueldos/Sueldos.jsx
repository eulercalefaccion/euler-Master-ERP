import React, { useState, useEffect } from 'react';
import { Receipt, CheckCircle, Save, Settings, Info, CreditCard } from 'lucide-react';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot, query, doc, setDoc, writeBatch, serverTimestamp, getDoc } from 'firebase/firestore';

const Sueldos = () => {
  const [jornadasNoPagadas, setJornadasNoPagadas] = useState([]);
  const [paritarias, setParitarias] = useState({
    oficialEspecializado: 0,
    oficial: 0,
    medioOficial: 0
  });
  const [isSavingParitarias, setIsSavingParitarias] = useState(false);
  const [operarioConfigs, setOperarioConfigs] = useState({});
  const [isLiquidating, setIsLiquidating] = useState(false);

  // Escuchar Jornadas Terminadas y no pagadas
  useEffect(() => {
    const qJornadas = query(collection(db, 'jornadas'));
    const unsubJornadas = onSnapshot(qJornadas, (snap) => {
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(j => j.status === 'Finalizada' && !j.pagada);
      
      setJornadasNoPagadas(data);
    });

    // Cargar paritarias desde configuración
    const fetchParitarias = async () => {
      const docRef = doc(db, 'configuracion', 'paritarias');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setParitarias(docSnap.data());
      }
    };
    fetchParitarias();

    return () => unsubJornadas();
  }, []);

  const handleSaveParitarias = async () => {
    setIsSavingParitarias(true);
    try {
      await setDoc(doc(db, 'configuracion', 'paritarias'), paritarias);
      alert('Valores de Paritarias actualizados localmente.');
    } catch (e) {
      console.error(e);
      alert('Error guardando paritarias.');
    } finally {
      setIsSavingParitarias(false);
    }
  };

  const calculateDecimalHours = (start, end) => {
    if (!start || !end || start === '-' || end === '-') return 0;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    let diff = (h2 + m2 / 60) - (h1 + m1 / 60);
    if (diff < 0) diff += 24; 
    return diff;
  };

  // Agrupar jornadas por operario
  const agrupacionOperarios = {};
  jornadasNoPagadas.forEach(jor => {
    const name = jor.operario || 'Desconocido';
    if (!agrupacionOperarios[name]) {
      agrupacionOperarios[name] = {
        nombre: name,
        operarioId: jor.operarioId,
        jornadasIds: [],
        totalHoras: 0,
        cantidadJornadas: 0,
      };
    }
    agrupacionOperarios[name].jornadasIds.push(jor.id);
    agrupacionOperarios[name].totalHoras += calculateDecimalHours(jor.startTime, jor.endTime);
    agrupacionOperarios[name].cantidadJornadas += 1;
  });

  const liquidables = Object.values(agrupacionOperarios);

  const handleConfigChange = (operarioName, field, value) => {
    setOperarioConfigs(prev => ({
      ...prev,
      [operarioName]: {
        ...prev[operarioName],
        [field]: value
      }
    }));
  };

  const getValorHoraAplicable = (opName) => {
    const config = operarioConfigs[opName] || { categoria: 'oficial' };
    if (config.categoria === 'oficialEspecializado') return parseFloat(paritarias.oficialEspecializado) || 0;
    if (config.categoria === 'oficial') return parseFloat(paritarias.oficial) || 0;
    if (config.categoria === 'medioOficial') return parseFloat(paritarias.medioOficial) || 0;
    if (config.categoria === 'eventual') return parseFloat(config.valorEventual) || 0;
    return 0;
  };

  const handleLiquidarSueldo = async (op) => {
    const valorHora = getValorHoraAplicable(op.nombre);
    if (valorHora <= 0) {
      alert(`Debes definir un valor superior a $0 para ${op.nombre}. Si es Eventual, escribe su valor en la caja blanca.`);
      return;
    }
    
    const subtotal = op.totalHoras * valorHora;
    if (!window.confirm(`¿Confirmas liquidar el pago de $${subtotal.toLocaleString('es-AR')} a ${op.nombre} por ${op.totalHoras.toFixed(1)} horas trabajadas?`)) return;

    setIsLiquidating(true);
    try {
      const batch = writeBatch(db);
      
      // 1. Marcar jornadas como pagadas
      op.jornadasIds.forEach(id => {
        const jorRef = doc(db, 'jornadas', id);
        batch.update(jorRef, { pagada: true });
      });

      // 2. Transacción de Egreso en Balance
      const transRef = doc(collection(db, 'transacciones'));
      batch.set(transRef, {
        tipo: 'egreso',
        monto: subtotal,
        categoria: 'Mano de Obra',
        obraId: null, // Podría prorratearse, pero por ahora es global al operario
        obraName: '- Varias / Liquidación Quincenal -',
        descripcion: `Liquidación: ${op.nombre} (${op.cantidadJornadas} Turnos / ${op.totalHoras.toFixed(1)} hrs)`,
        fecha: new Date().toISOString().split('T')[0],
        createdAt: serverTimestamp()
      });

      await batch.commit();

      // Limpiar confi visual del operario liquidado
      const newConfigs = {...operarioConfigs};
      delete newConfigs[op.nombre];
      setOperarioConfigs(newConfigs);

    } catch (error) {
      console.error(error);
      alert("Hubo un error liquidando el sueldo.");
    } finally {
      setIsLiquidating(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', height: '100%', paddingBottom: '2rem' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Receipt size={24} color="var(--primary-600)" /> Liquidación de Sueldos
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Transformación de Jornadas de Campo en Pago de Mano de Obra
          </p>
        </div>
      </div>

      {/* Tarjeta de Paritarias Generales */}
      <div className="card" style={{ padding: '1.5rem', backgroundColor: 'var(--primary-50)', border: '1px solid var(--primary-100)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.125rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, color: 'var(--primary-700)' }}>
            <Settings size={20} /> Ajustes Base (Paritarias)
          </h3>
          <button 
             onClick={handleSaveParitarias} 
             disabled={isSavingParitarias}
             className="btn-primary" 
             style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
          >
            <Save size={16} /> {isSavingParitarias ? 'Guardando...' : 'Guardar Actualización'}
          </button>
        </div>
        
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div className="form-group">
            <label style={{ color: 'var(--primary-700)' }}>Oficial Especializado ($/hr)</label>
            <input 
              type="number" 
              className="input-field" 
              value={paritarias.oficialEspecializado} 
              onChange={e => setParitarias({...paritarias, oficialEspecializado: e.target.value})}
              style={{ backgroundColor: 'white' }}
            />
          </div>
          <div className="form-group">
            <label style={{ color: 'var(--primary-700)' }}>Oficial ($/hr)</label>
            <input 
              type="number" 
              className="input-field" 
              value={paritarias.oficial} 
              onChange={e => setParitarias({...paritarias, oficial: e.target.value})}
              style={{ backgroundColor: 'white' }}
            />
          </div>
          <div className="form-group">
            <label style={{ color: 'var(--primary-700)' }}>Medio Oficial ($/hr)</label>
            <input 
              type="number" 
              className="input-field" 
              value={paritarias.medioOficial} 
              onChange={e => setParitarias({...paritarias, medioOficial: e.target.value})}
              style={{ backgroundColor: 'white' }}
            />
          </div>
        </div>
      </div>

      {/* Lista de Liquidación */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)' }}>
          <h3 style={{ fontSize: '1.125rem', margin: 0 }}>Operarios con Jornadas Pendientes de Pago</h3>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Los cálculos son sobre horas netas desde Llegada hasta Finalizar Turno.</p>
        </div>
        
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-surface-hover)', borderBottom: '1px solid var(--border-light)' }}>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Operario</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Turnos Adeudados</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Horas Totales</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Categoría Union</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', textAlign: 'right' }}>Subtotal ($)</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', textAlign: 'center' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {liquidables.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                    <CheckCircle size={40} style={{ opacity: 0.5, marginBottom: '1rem' }} />
                    <div>No hay deudas operativas. Todas las jornadas recientes ya fueron liquidadas.</div>
                  </td>
                </tr>
              )}
              {liquidables.map(op => {
                const config = operarioConfigs[op.nombre] || { categoria: 'oficial', valorEventual: '' };
                const isEventual = config.categoria === 'eventual';
                const valorHora = getValorHoraAplicable(op.nombre);
                const subtotal = op.totalHoras * valorHora;
                
                return (
                  <tr key={op.nombre} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '1rem 1.5rem', fontWeight: '500' }}>{op.nombre}</td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <span className="badge" style={{ backgroundColor: 'var(--bg-surface-hover)', color: 'var(--text-secondary)' }}>
                        {op.cantidadJornadas} Turnos
                      </span>
                    </td>
                    <td style={{ padding: '1rem 1.5rem', fontWeight: '600', color: 'var(--primary-600)' }}>
                      {op.totalHoras.toFixed(1)} hrs
                    </td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <select 
                          className="input-field" 
                          style={{ padding: '0.5rem', fontSize: '0.875rem' }}
                          value={config.categoria}
                          onChange={e => handleConfigChange(op.nombre, 'categoria', e.target.value)}
                        >
                          <option value="oficialEspecializado">Oficial Especializado</option>
                          <option value="oficial">Oficial</option>
                          <option value="medioOficial">Medio Oficial</option>
                          <option value="eventual">EVENTUAL (Libre)</option>
                        </select>
                        {isEventual && (
                          <input 
                            type="number" 
                            className="input-field"
                            placeholder="Valor Ej. 2500"
                            style={{ width: '120px', padding: '0.5rem', border: '1px solid var(--warning)' }}
                            value={config.valorEventual}
                            onChange={e => handleConfigChange(op.nombre, 'valorEventual', e.target.value)}
                          />
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '1rem 1.5rem', fontSize: '1.125rem', fontWeight: '700', color: '#059669', textAlign: 'right' }}>
                      $ {subtotal.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </td>
                    <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
                      <button 
                        onClick={() => handleLiquidarSueldo(op)}
                        disabled={isLiquidating}
                        className="btn-primary" 
                        style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', backgroundColor: '#059669', borderColor: '#047857' }}
                      >
                        <CreditCard size={16} style={{ marginRight: '0.5rem' }} /> Pagar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      
    </div>
  );
};

export default Sueldos;
