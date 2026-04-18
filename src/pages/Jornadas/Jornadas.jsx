import React, { useState, useEffect } from 'react';
import { Play, Pause, Square, MapPin, AlertTriangle, User, Compass, Clock, CheckCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/firebaseConfig';
import { collection, addDoc, updateDoc, doc, onSnapshot, query, orderBy } from 'firebase/firestore';

const Jornadas = () => {
  const { currentUser } = useAuth();
  const [jornadas, setJornadas] = useState([]);
  const [obrasDisponibles, setObrasDisponibles] = useState([]);
  
  // Estado para Simulador Móvil
  const [selectedObra, setSelectedObra] = useState('');
  const [forceGpsError, setForceGpsError] = useState(false);
  const [myShiftTime, setMyShiftTime] = useState('00:00:00');
  
  // Estado derivado
  const [activeShift, setActiveShift] = useState(null);
  const currentShiftStatus = activeShift ? activeShift.status : 'Inactivo';

  // Escuchar a Firebase para listar jornadas y obras
  useEffect(() => {
    const qJornadas = query(collection(db, 'jornadas'), orderBy('createdAt', 'desc'));
    const unsubJornadas = onSnapshot(qJornadas, (snapshot) => {
      const jorData = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      setJornadas(jorData);
      
      if (currentUser?.uid) {
         const myActive = jorData.find(j => j.operarioId === currentUser.uid && j.status !== 'Finalizada');
         setActiveShift(myActive || null);
         if (myActive && myActive.obra) setSelectedObra(myActive.obra);
      }
    });

    const qObras = query(collection(db, 'obras'));
    const unsubObras = onSnapshot(qObras, (snapshot) => {
       const obrasVivas = snapshot.docs
          .map(d => d.data().name)
          .filter(Boolean); // filtra vacios
       setObrasDisponibles(obrasVivas);
    });

    return () => {
       unsubJornadas();
       unsubObras();
    };
  }, [currentUser]);

  // Temporizador para simular el reloj corriendo
  useEffect(() => {
    let interval;
    if (activeShift && (currentShiftStatus === 'Activa' || currentShiftStatus === 'En Almuerzo')) {
      interval = setInterval(() => {
        const startMillis = activeShift.createdAt && activeShift.createdAt.toMillis ? activeShift.createdAt.toMillis() : Date.now();
        const diffInSeconds = Math.floor((Date.now() - startMillis) / 1000);
        // Si el timestamp no es válido o está en el futuro (puede pasar milisegundos), asume 0
        const safeDiff = diffInSeconds > 0 ? diffInSeconds : 0;
        const hrs = String(Math.floor(safeDiff / 3600)).padStart(2, '0');
        const mins = String(Math.floor((safeDiff % 3600) / 60)).padStart(2, '0');
        const secs = String(safeDiff % 60).padStart(2, '0');
        setMyShiftTime(`${hrs}:${mins}:${secs}`);
      }, 1000);
    } else {
      setMyShiftTime('00:00:00');
    }
    return () => clearInterval(interval);
  }, [activeShift, currentShiftStatus]);

  const handleStartShift = async () => {
    if (!selectedObra) {
      alert("Debes seleccionar una Obra antes de iniciar la jornada.");
      return;
    }
    if (!currentUser) {
      alert("Sessión inválida.");
      return;
    }

    try {
      await addDoc(collection(db, 'jornadas'), {
        operario: currentUser.name || currentUser.email || 'Operario',
        operarioId: currentUser.uid,
        date: new Date().toLocaleDateString('es-AR'),
        startTime: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
        endTime: '-',
        obra: selectedObra,
        status: 'Activa',
        locationType: forceGpsError ? 'Desconocido' : 'Obra/Oficina',
        alert: forceGpsError,
        alertReason: forceGpsError ? 'Fuera de rango geocerca (> 300m)' : '',
        createdAt: new Date()
      });
    } catch (error) {
      console.error("Error starting shift:", error);
    }
  };

  const handlePauseShift = async () => {
    if (!activeShift) return;
    try {
      await updateDoc(doc(db, 'jornadas', activeShift.id), {
        status: 'En Almuerzo'
      });
    } catch (error) {
       console.error("Error pausing shift:", error);
    }
  };

  const handleEndShift = async () => {
    if (!activeShift) return;
    try {
      await updateDoc(doc(db, 'jornadas', activeShift.id), {
        status: 'Finalizada',
        endTime: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
      });
      setSelectedObra('');
    } catch (error) {
      console.error("Error ending shift:", error);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', height: '100%' }}>
      {/* Header General */}
      <div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0 }}>Módulo de Jornadas</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
          Trazabilidad de campo (App Móvil) y Control de RRHH
        </p>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '1.5rem' }}>
        
        {/* LADO IZQUIERDO: SIMULADOR APP MÓVIL OPERARIO */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          
          <div style={{ marginBottom: '1rem', textAlign: 'center', width: '100%' }}>
            <h3 style={{ fontSize: '1.125rem', color: 'var(--primary-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
               Simulador "App Operario"
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Interfaz móvil para la cuadrilla</p>
          </div>

          <div style={{ 
            width: '320px', height: '600px', backgroundColor: '#111827', borderRadius: '40px', padding: '12px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '6px solid #e5e7eb', position: 'relative'
          }}>
            <div style={{ width: '100%', height: '100%', backgroundColor: 'var(--bg-primary)', borderRadius: '30px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              
              {/* Celular Header */}
              <div style={{ backgroundColor: 'var(--primary-600)', color: 'white', padding: '1.5rem 1rem 2rem 1rem', textAlign: 'center', borderBottomLeftRadius: '20px', borderBottomRightRadius: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                  <span>{new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                  <div style={{ display: 'flex', gap: '0.25rem' }}><MapPin size={14}/></div>
                </div>
                <h4 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '500' }}>Hola, {currentUser?.name || 'Operario'}</h4>
                <p style={{ margin: 0, opacity: 0.8, fontSize: '0.875rem', marginTop: '0.25rem' }}>Marcar jornada de trabajo</p>
              </div>

              {/* Celular Body */}
              <div style={{ padding: '1.5rem 1rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                
                {currentShiftStatus === 'Inactivo' ? (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <label style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-primary)' }}>1. Selecciona tu Destino</label>
                      <select 
                        className="input-field" 
                        value={selectedObra} 
                        onChange={(e) => setSelectedObra(e.target.value)}
                        style={{ padding: '0.75rem', fontSize: '1rem', borderRadius: '12px' }}
                      >
                        <option value="" disabled>-- Elige una obra --</option>
                        {obrasDisponibles.map(o => <option key={o} value={o}>{o}</option>)}
                        {obrasDisponibles.length === 0 && <option value="" disabled>No hay obras activas en la nube</option>}
                      </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
                      <label style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-primary)' }}>2. Registrar Ingreso</label>
                      <button 
                        onClick={handleStartShift}
                        style={{ 
                          backgroundColor: 'var(--success)', color: 'white', border: 'none', borderRadius: '16px',
                          padding: '1.25rem', fontSize: '1.125rem', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', cursor: 'pointer',
                          boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.3)'
                        }}
                      >
                        <Play fill="white" size={24} /> LLEGADA A OBRA
                      </button>
                    </div>

                    <div style={{ marginTop: 'auto', padding: '1rem', backgroundColor: '#fef2f2', borderRadius: '12px', border: '1px dashed #fca5a5' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--accent-600)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={forceGpsError} onChange={(e) => setForceGpsError(e.target.checked)} />
                        Fichar a +300m (Provocar Alerta)
                      </label>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem' }}>Tiempo Transcurrido</div>
                      <div style={{ fontSize: '3rem', fontWeight: '300', color: 'var(--primary-700)', fontFamily: 'monospace' }}>{myShiftTime}</div>
                      
                      <div style={{ marginTop: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', backgroundColor: currentShiftStatus === 'Activa' ? '#d1fae5' : '#fef3c7', color: currentShiftStatus === 'Activa' ? '#059669' : '#d97706', padding: '0.5rem 1rem', borderRadius: '20px', fontSize: '0.875rem', fontWeight: '600' }}>
                        {currentShiftStatus === 'Activa' ? <CheckCircle size={16} /> : <Clock size={16} />}
                        {currentShiftStatus}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginTop: 'auto' }}>
                      {currentShiftStatus === 'Activa' && (
                        <button 
                          onClick={handlePauseShift}
                          style={{ backgroundColor: '#f59e0b', color: 'white', border: 'none', borderRadius: '16px', padding: '1rem', fontSize: '1rem', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: 'pointer' }}
                        >
                          <Pause fill="white" size={20} /> INICIO ALMUERZO
                        </button>
                      )}

                      {currentShiftStatus === 'En Almuerzo' && (
                        <button 
                          onClick={() => setCurrentShiftStatus('Activa')}
                          style={{ backgroundColor: 'var(--primary-500)', color: 'white', border: 'none', borderRadius: '16px', padding: '1rem', fontSize: '1rem', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: 'pointer' }}
                        >
                          <Play fill="white" size={20} /> RETOMAR JORNADA
                        </button>
                      )}

                      <button 
                        onClick={handleEndShift}
                        style={{ backgroundColor: 'white', color: 'var(--accent-600)', border: '2px solid var(--accent-600)', borderRadius: '16px', padding: '1rem', fontSize: '1rem', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: 'pointer' }}
                      >
                        <Square fill="var(--accent-600)" size={20} /> FINALIZAR TURNO
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>


        {/* LADO DERECHO: PANEL ADMINISTRADOR RRHH */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.125rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
               Panel de RRHH (Control de Campo)
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Monitoreo GPS e Historial</p>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ backgroundColor: 'var(--bg-surface-hover)', borderBottom: '1px solid var(--border-light)' }}>
                  <tr>
                    <th style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Operario</th>
                    <th style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Horario</th>
                    <th style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Obra Destino</th>
                    <th style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {jornadas.map(jor => (
                    <tr key={jor.id} style={{ borderBottom: '1px solid var(--border-light)', backgroundColor: jor.alert ? '#fef2f2' : 'transparent' }}>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500' }}>
                          <User size={16} color="var(--primary-600)" /> {jor.operario}
                        </div>
                      </td>
                      <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                        {jor.startTime} a {jor.endTime}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>{jor.obra}</div>
                        
                        {jor.alert ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--accent-600)', marginTop: '0.25rem' }}>
                            <AlertTriangle size={12} /> {jor.alertReason}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--success)', marginTop: '0.25rem' }}>
                            <Compass size={12} /> Geocerca OK ({jor.locationType})
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <span style={{ 
                          fontSize: '0.75rem', fontWeight: '600', padding: '0.25rem 0.6rem', borderRadius: '12px',
                          backgroundColor: jor.status === 'Activa' ? '#d1fae5' : jor.status === 'En Almuerzo' ? '#fef3c7' : '#f3f4f6',
                          color: jor.status === 'Activa' ? '#059669' : jor.status === 'En Almuerzo' ? '#d97706' : '#6b7280'
                        }}>
                          {jor.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Jornadas;
