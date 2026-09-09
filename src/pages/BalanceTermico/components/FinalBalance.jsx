import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, AlertTriangle, Info, Download, Send } from 'lucide-react';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import generarPDFBalanceTermico from '../../../services/pdfBalanceTermico';

const FinalBalance = ({ environments, params, onBack, isEmbedded = false, onSave = null }) => {
  const coef = params.coefVolumetrico ?? 45; // Kcal/h·m³
  const rendimientoElemento = params.rendimientoElemento ?? 145;
  const margenMultiplier = 1 + (params.margenSeguridad / 100);
  const esPisoRadiante = params.sistemaEmision === 'Piso Radiante';

  // Estado para la configuración de emisores por ambiente (Solo Radiadores)
  const [emitterChoices, setEmitterChoices] = useState({});
  const [budgets, setBudgets] = useState([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const initialChoices = {};
    setEmitterChoices(prev => {
      const updated = { ...prev };
      environments.filter(e => e.calefaccion).forEach(env => {
        if (!updated[env.id]) {
          const isBathroom = env.nombre.toLowerCase().includes('baño') || env.nombre.toLowerCase().includes('toilette');
          updated[env.id] = env.choice || {
            type: isBathroom ? 'Toallero 80cm' : 'Radiador',
            customRads: null
          };
        } else if (env.choice && env.choice !== updated[env.id] && (!updated[env.id].customRads || !env.choice.customRads)) {
          updated[env.id] = { ...updated[env.id], ...env.choice };
        }
      });
      return updated;
    });

    if (!isEmbedded) {
      // Cargar presupuestos pendientes y en calculo
      const fetchBudgets = async () => {
        try {
          const q = query(collection(db, 'presupuestos'));
          const querySnapshot = await getDocs(q);
          const activeBudgets = querySnapshot.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(b => {
              const st = b.status || 'pendiente';
              return b.deleted !== true && (st === 'pendiente' || st === 'en_calculo' || st === 'en calculo');
            })
            .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
          setBudgets(activeBudgets);
        } catch (err) {
          console.error("Error fetching budgets:", err);
        }
      };
      fetchBudgets();
    }
  }, [environments, isEmbedded]);

  // Si estamos incrustados, reportamos cambios de choices hacia arriba para que el guardado pueda tomar el último estado
  useEffect(() => {
    if (isEmbedded && onSave) {
      // Pasamos un callback para que el padre pueda disparar el guardado si lo requiere, 
      // o simplemente avisamos el estado actual.
      onSave(emitterChoices);
    }
  }, [emitterChoices, isEmbedded]);

  const handleChoiceChange = (envId, field, value) => {
    setEmitterChoices(prev => ({
      ...prev,
      [envId]: { ...prev[envId], [field]: value }
    }));
  };

  // Helper para calcular la propuesta automática óptima de radiadores
  const getAutoRads = (needed) => {
    if (needed <= 0) return [0];
    let splits = 1;
    if (needed > 12) splits = 2;
    if (needed > 24) splits = 3;
    if (needed > 36) splits = 4;
    const base = Math.floor(needed / splits);
    const remainder = needed % splits;
    return Array.from({ length: splits }, (_, i) => base + (i < remainder ? 1 : 0));
  };

  // Cálculo de entornos
  const computedEnvs = useMemo(() => {
    return environments.filter(e => e.calefaccion).map(env => {
      const superficie = parseFloat(env.superficie) || 0;
      const altura = parseFloat(env.altura) || 2.8;
      const volumen = superficie * altura;

      const envCoef = (env.coefVolumetrico !== undefined && env.coefVolumetrico !== null && env.coefVolumetrico !== '' && !isNaN(parseFloat(env.coefVolumetrico)))
        ? parseFloat(env.coefVolumetrico)
        : (params.coefVolumetrico ?? 45);

      const totalKcal = volumen * envCoef;
      const transmisionKcal = totalKcal * 0.65;
      const infiltracionKcal = totalKcal * 0.35;
      const totalKcalMargin = totalKcal * margenMultiplier;
      const totalW = totalKcal * 1.163;
      const wattsPorM2 = superficie > 0 ? totalW / superficie : 0;

      let envResult = {
        ...env,
        coefVolumetrico: envCoef,
        volumen,
        transmisionW: transmisionKcal * 1.163,
        infiltracionW: infiltracionKcal * 1.163,
        totalW,
        totalKcal,
        totalKcalMargin,
        wattsPorM2
      };

      if (!esPisoRadiante) {
        const baseElementsNeeded = Math.ceil(totalKcalMargin / rendimientoElemento);
        const choice = emitterChoices[env.id] || { type: 'Radiador', customRads: null };
        const autoRads = getAutoRads(baseElementsNeeded);
        let emitterSummary = '';
        let finalElements = 0;
        let radsArray = [];

        if (choice.type === 'Radiador') {
          if (choice.customRads !== null && Array.isArray(choice.customRads) && choice.customRads.length > 0) {
            radsArray = choice.customRads;
          } else {
            radsArray = autoRads;
          }

          const validRads = radsArray.filter(n => !isNaN(n) && n > 0);
          finalElements = validRads.reduce((a, b) => a + b, 0);

          if (validRads.length === 0) {
            emitterSummary = '0 elementos';
          } else {
            const counts = {};
            validRads.forEach(p => { counts[p] = (counts[p] || 0) + 1; });
            emitterSummary = Object.entries(counts).map(([size, count]) => {
               return count === 1 ? `1 Radiador de ${size} elem.` : `${count} Radiadores de ${size} elem.`;
            }).join(' + ');
          }
          envResult.radsArray = radsArray;
          envResult.autoRads = autoRads;
        } else {
          // Toalleros
          finalElements = choice.type.includes('80') ? 3 : 5;
          emitterSummary = `1 ${choice.type} (${finalElements} elem. eq.)`;
          envResult.radsArray = [];
          envResult.autoRads = [];
        }
        
        envResult.elementsNeeded = finalElements;
        envResult.choice = choice;
        envResult.emitterSummary = emitterSummary;
        envResult.baseElementsNeeded = baseElementsNeeded;
      } else {
        // Lógica Piso Radiante
        const paso = params.pasoTubo || 20;
        const densidad = 100 / paso; // ej: 100/20 = 5 m/m2
        const tuboTotal = superficie * densidad;
        const maxCircuito = params.longitudMaxTubo || 100;
        // La longitud mínima razonable que dijiste es 50m. Si es un local muy chico (ej un baño de 4m2 -> 20m), igual contará como 1 circuito, pero podría unirse a otro. Simplificamos a 1 circuito min.
        const circuitos = Math.max(1, Math.ceil(tuboTotal / maxCircuito));
        const isBathroom = env.nombre.toLowerCase().includes('baño') || env.nombre.toLowerCase().includes('toilette');
        
        // Temp superficial aproximada: T_ambiente (20 o 22) + (W/m2 / 11)
        const tAmb = isBathroom ? 22 : 20;
        const tempSup = Math.min(29, Math.round(tAmb + (wattsPorM2 / 10.5)));

        envResult.tuboTotal = Math.round(tuboTotal);
        envResult.circuitos = circuitos;
        envResult.tempSup = tempSup;
      }

      return envResult;
    });
  }, [environments, coef, margenMultiplier, esPisoRadiante, emitterChoices, rendimientoElemento, params.pasoTubo, params.longitudMaxTubo]);

  // Cálculos totales
  const totalKcal = computedEnvs.reduce((acc, e) => acc + e.totalKcal, 0);
  const totalWatts = totalKcal * 1.163;
  const totalKcalMargin = totalKcal * margenMultiplier;
  const totalWattsMargin = totalWatts * margenMultiplier;
  const totalVolumen = computedEnvs.reduce((acc, e) => acc + e.volumen, 0);
  const totalSup = computedEnvs.reduce((acc, e) => acc + e.superficie, 0);
  
  // Totales específicos
  const totalElementos = !esPisoRadiante ? computedEnvs.reduce((acc, e) => acc + e.elementsNeeded, 0) : 0;
  const totalTubos = esPisoRadiante ? computedEnvs.reduce((acc, e) => acc + e.tuboTotal, 0) : 0;
  
  // Colectores para Piso Radiante (Agrupados por Planta)
  const colectores = useMemo(() => {
    if (!esPisoRadiante) return [];
    const grupos = {};
    computedEnvs.forEach(env => {
      const p = env.planta || 'Baja';
      if (!grupos[p]) grupos[p] = { planta: p, circuitos: 0, longitudMax: 0 };
      grupos[p].circuitos += env.circuitos;
      const longPorCircuito = env.tuboTotal / env.circuitos;
      if (longPorCircuito > grupos[p].longitudMax) grupos[p].longitudMax = longPorCircuito;
    });
    return Object.values(grupos);
  }, [computedEnvs, esPisoRadiante]);

  const handleExportPDF = () => {
    generarPDFBalanceTermico({ 
      environments: computedEnvs, 
      params, 
      totalKcal, 
      totalKcalMargin, 
      totalWattsMargin, 
      totalVolumen, 
      totalElementos, 
      totalSup,
      colectores,
      totalTubos
    });
  };

  const handleExportToBudget = async () => {
    if (!selectedBudgetId) return;
    setIsExporting(true);
    try {
      const budgetRef = doc(db, 'presupuestos', selectedBudgetId);
      const budgetSnap = await getDoc(budgetRef);
      
      if (budgetSnap.exists()) {
        const currentData = budgetSnap.data();
        const currentNotas = currentData.notas || '';
        const notasAdicionales = `\n\n[SISTEMA] Balance Térmico IA actualizado el ${new Date().toLocaleDateString('es-AR')}.\nIngresá a la pestaña de "Balance Térmico" para verlo.`;
        
        const balanceData = {
          environments: environments.map(e => ({
            id: e.id,
            nombre: e.nombre,
            modoCalculo: e.modoCalculo,
            largo: e.largo,
            ancho: e.ancho,
            superficie: e.superficie,
            altura: e.altura,
            coefVolumetrico: e.coefVolumetrico,
            planta: e.planta,
            calefaccion: e.calefaccion,
            choice: emitterChoices[e.id] || null
          })),
          params,
          exportedAt: new Date().toISOString()
        };

        await updateDoc(budgetRef, {
          balanceIA: balanceData,
          notas: currentNotas + notasAdicionales
        });
        alert('Balance térmico exportado con éxito al presupuesto. Podés abrirlo desde el panel de presupuestos.');
      } else {
        alert('No se encontró el presupuesto especificado.');
      }
    } catch (err) {
      console.error("Error exporting to budget:", err);
      alert('Ocurrió un error al exportar: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '1.25rem', margin: 0 }}>Balance Térmico — {params.sistemaEmision}</h3>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={handleExportPDF} className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'var(--primary-600)', color: 'white', border: 'none' }}>
            <Download size={16} /> Descargar Informe PDF
          </button>
          {!isEmbedded && onBack && (
            <button onClick={onBack} className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid var(--border-light)', backgroundColor: 'white' }}>
              <ArrowLeft size={16} /> Volver a edición
            </button>
          )}
        </div>
      </div>

      {/* KPIs principales */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
        <div className="card" style={{ padding: '2rem', backgroundColor: '#3b82f6', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.9 }}>Potencia Efectiva</span>
          <h2 style={{ fontSize: '2.5rem', margin: '0.5rem 0', fontWeight: '700' }}>{(totalWatts / 1000).toFixed(1)}</h2>
          <span style={{ fontSize: '1rem', opacity: 0.9 }}>kW</span>
        </div>
        
        <div className="card" style={{ padding: '2rem', backgroundColor: '#2563eb', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.9 }}>Con Margen {params.margenSeguridad}%</span>
          <h2 style={{ fontSize: '2.5rem', margin: '0.5rem 0', fontWeight: '700' }}>{(totalWattsMargin / 1000).toFixed(1)}</h2>
          <span style={{ fontSize: '1rem', opacity: 0.9 }}>kW</span>
        </div>

        <div className="card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-light)' }}>
          <span style={{ fontSize: '0.875rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Kcal/h con Margen</span>
          <h2 style={{ fontSize: '2.5rem', margin: '0.5rem 0', fontWeight: '700', color: 'var(--text-primary)' }}>{Math.round(totalKcalMargin).toLocaleString('es-AR')}</h2>
          <span style={{ fontSize: '1rem', color: 'var(--text-tertiary)' }}>Kcal/h totales calculadas</span>
        </div>

        {!esPisoRadiante ? (
          <div className="card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-light)', backgroundColor: '#f0fdf4' }}>
            <span style={{ fontSize: '0.875rem', textTransform: 'uppercase', color: '#166534' }}>Elementos Necesarios</span>
            <h2 style={{ fontSize: '2.5rem', margin: '0.5rem 0', fontWeight: '700', color: '#15803d' }}>{totalElementos}</h2>
            <span style={{ fontSize: '1rem', color: '#166534' }}>A {rendimientoElemento} Kcal/h c/u</span>
          </div>
        ) : (
          <div className="card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-light)', backgroundColor: '#fff7ed' }}>
            <span style={{ fontSize: '0.875rem', textTransform: 'uppercase', color: '#9a3412' }}>Metros de Tubo</span>
            <h2 style={{ fontSize: '2.5rem', margin: '0.5rem 0', fontWeight: '700', color: '#c2410c' }}>{totalTubos}</h2>
            <span style={{ fontSize: '1rem', color: '#9a3412' }}>Ø {params.diametroTubo}mm | Paso {params.pasoTubo}cm</span>
          </div>
        )}
      </div>

      {/* Tabla de detalle */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)' }}>
          <h3 style={{ fontSize: '1.125rem', margin: 0 }}>
            {esPisoRadiante ? 'Cargas por zona y densidad de emisión' : 'Detalle por Ambiente y Selección de Emisores'}
          </h3>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-surface-hover)', borderBottom: '1px solid var(--border-light)' }}>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>AMBIENTE</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'right' }}>SUP. (M²)</th>
                
                {esPisoRadiante ? (
                  <>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: '#2563eb', textAlign: 'right', fontWeight: '600' }}>Q TOTAL [W]</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'right' }}>W/M²</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'right' }}>TEMP. LOSA</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: '#c2410c', textAlign: 'right', fontWeight: '600' }}>CIRCUITOS</th>
                  </>
                ) : (
                  <>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: '#2563eb', textAlign: 'right', fontWeight: '600' }}>KCAL/H (C/M)</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>TIPO DE EMISOR</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>CONFIGURACIÓN</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: '#15803d', fontWeight: '600' }}>RESUMEN</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {computedEnvs.map(env => (
                <tr key={env.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                    <div>
                      {env.planta ? `${env.planta.substring(0, 2).toUpperCase()} · ` : ''}{env.nombre}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
                      Coef: <span style={{ fontWeight: '600', color: '#1e40af' }}>{env.coefVolumetrico}</span> Kcal/h·m³
                    </div>
                  </td>
                  <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right' }}>{env.superficie.toFixed(1)}</td>
                  
                  {esPisoRadiante ? (
                    <>
                      <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right', color: '#2563eb', fontWeight: '600' }}>{Math.round(env.totalW).toLocaleString('es-AR')}</td>
                      <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right' }}>{Math.round(env.wattsPorM2)}</td>
                      <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right' }}>{env.tempSup} °C</td>
                      <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right', color: '#c2410c', fontWeight: '600' }}>{env.circuitos} ({env.tuboTotal}m)</td>
                    </>
                  ) : (
                    <>
                      <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right', color: '#2563eb', fontWeight: '600' }}>{Math.round(env.totalKcalMargin).toLocaleString('es-AR')}</td>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <select 
                          className="input-field" 
                          style={{ padding: '0.4rem', fontSize: '0.875rem' }}
                          value={env.choice.type}
                          onChange={(e) => handleChoiceChange(env.id, 'type', e.target.value)}
                        >
                          <option value="Radiador">Radiador</option>
                          <option value="Toallero 80cm">Toallero 80cm</option>
                          <option value="Toallero 120cm">Toallero 120cm</option>
                        </select>
                      </td>
                      <td style={{ padding: '0.75rem 1.25rem' }}>
                        {env.choice.type === 'Radiador' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                            {/* Selector de cantidad de radiadores + botón auto */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500' }}>Radiadores:</span>
                                <select 
                                  value={env.radsArray.length}
                                  onChange={(e) => {
                                    const newCount = parseInt(e.target.value) || 1;
                                    const currentSum = env.radsArray.reduce((acc, curr) => acc + (parseInt(curr) || 0), 0);
                                    const targetElements = currentSum > 0 ? currentSum : env.baseElementsNeeded;
                                    const base = Math.floor(targetElements / newCount);
                                    const rem = targetElements % newCount;
                                    const newRads = Array.from({ length: newCount }, (_, i) => Math.max(1, base + (i < rem ? 1 : 0)));
                                    handleChoiceChange(env.id, 'customRads', newRads);
                                  }}
                                  style={{
                                    padding: '0.2rem 0.4rem',
                                    fontSize: '0.8rem',
                                    borderRadius: '4px',
                                    border: '1px solid #cbd5e1',
                                    background: 'white',
                                    fontWeight: '600',
                                    color: '#0f172a'
                                  }}
                                >
                                  <option value="1">1 Radiador</option>
                                  <option value="2">2 Radiadores</option>
                                  <option value="3">3 Radiadores</option>
                                  <option value="4">4 Radiadores</option>
                                  <option value="5">5 Radiadores</option>
                                  <option value="6">6 Radiadores</option>
                                </select>
                              </div>

                              {env.choice.customRads !== null && (
                                <button 
                                  type="button"
                                  onClick={() => handleChoiceChange(env.id, 'customRads', null)}
                                  style={{ 
                                    background: '#eff6ff', 
                                    border: '1px solid #bfdbfe', 
                                    borderRadius: '4px', 
                                    color: '#2563eb', 
                                    fontSize: '0.72rem', 
                                    padding: '0.2rem 0.45rem', 
                                    cursor: 'pointer', 
                                    fontWeight: '600',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.2rem'
                                  }}
                                  title="Restablecer a la configuración sugerida por el sistema"
                                >
                                  ↺ Sugerido
                                </button>
                              )}
                            </div>

                            {/* Inputs para modificar elementos de cada radiador */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                              {env.radsArray.map((rad, idx) => (
                                <div 
                                  key={idx} 
                                  style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    backgroundColor: '#f8fafc', 
                                    border: '1px solid #cbd5e1', 
                                    borderRadius: '4px', 
                                    padding: '0.15rem 0.35rem',
                                    gap: '0.25rem'
                                  }}
                                >
                                  {env.radsArray.length > 1 && (
                                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600' }}>
                                      R{idx + 1}:
                                    </span>
                                  )}
                                  <input 
                                    type="number"
                                    min="1"
                                    max="40"
                                    value={rad === 0 ? '' : rad}
                                    onFocus={e => e.target.select()}
                                    style={{ 
                                      width: '42px', 
                                      padding: '0.2rem', 
                                      border: '1px solid #94a3b8', 
                                      borderRadius: '3px', 
                                      textAlign: 'center', 
                                      fontSize: '0.85rem', 
                                      fontWeight: '600',
                                      background: 'white',
                                      color: '#0f172a'
                                    }}
                                    onChange={(e) => {
                                      const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                                      let newRads = [...env.radsArray];
                                      newRads[idx] = isNaN(val) ? 0 : val;
                                      handleChoiceChange(env.id, 'customRads', newRads);
                                    }}
                                  />
                                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>elem.</span>
                                </div>
                              ))}
                            </div>

                            {/* Estado informativo */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.72rem' }}>
                              {env.choice.customRads === null ? (
                                <span style={{ color: '#166534', fontWeight: '500', background: '#dcfce7', padding: '0.1rem 0.35rem', borderRadius: '3px' }}>
                                  ✓ Sugerido por sistema ({env.baseElementsNeeded} elem.)
                                </span>
                              ) : (
                                <span style={{ 
                                  color: env.elementsNeeded !== env.baseElementsNeeded ? '#b45309' : '#15803d', 
                                  fontWeight: '500',
                                  background: env.elementsNeeded !== env.baseElementsNeeded ? '#fef3c7' : '#dcfce7',
                                  padding: '0.1rem 0.35rem',
                                  borderRadius: '3px'
                                }}>
                                  Configurado: {env.elementsNeeded} elem. {env.elementsNeeded !== env.baseElementsNeeded ? `(Cálculo: ${env.baseElementsNeeded} elem.)` : '(coincide con cálculo)'}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Instalación en pared</span>
                        )}
                      </td>
                      <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', color: '#15803d', fontWeight: '600' }}>
                        {env.emitterSummary}
                      </td>
                    </>
                  )}
                </tr>
              ))}
              
              {/* FILA DE TOTALES PISO RADIANTE */}
              {esPisoRadiante && (
                <tr style={{ backgroundColor: '#f8fafc', fontWeight: '600', borderTop: '2px solid var(--border-light)' }}>
                  <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem' }}>TOTAL</td>
                  <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right' }}>{totalSup.toFixed(1)}</td>
                  <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right', color: '#2563eb' }}>{Math.round(totalWatts).toLocaleString('es-AR')}</td>
                  <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right' }}>{Math.round(totalWatts / (totalSup || 1))}</td>
                  <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right', color: '#c2410c' }}>{colectores.reduce((a,c)=>a+c.circuitos,0)} Vías</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {esPisoRadiante && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)' }}>
            <h3 style={{ fontSize: '1.125rem', margin: 0 }}>Diseño de circuitos y balance hidráulico</h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-surface-hover)', borderBottom: '1px solid var(--border-light)' }}>
                  <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>COLECTOR</th>
                  <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>CIRCUITOS</th>
                  <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>LONGITUD MÁX.</th>
                  <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>PASO</th>
                </tr>
              </thead>
              <tbody>
                {colectores.map(col => (
                  <tr key={col.planta} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Colector {col.planta} ({col.circuitos} vías)</td>
                    <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem' }}>{col.circuitos}</td>
                    <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem' }}>{Math.round(col.longitudMax)} m</td>
                    <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem' }}>{params.pasoTubo} cm</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {/* Export to Budget */}
      {!isEmbedded && (
        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h4 style={{ margin: 0, fontSize: '1.125rem' }}>Exportar a Presupuesto CRM</h4>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Podés adjuntar este balance térmico a un presupuesto existente en estado "Pendiente" o "En Cálculo". El informe se adjuntará en las notas del presupuesto automáticamente.
          </p>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <select 
              className="input-field" 
              style={{ maxWidth: '400px' }}
              value={selectedBudgetId}
              onChange={(e) => setSelectedBudgetId(e.target.value)}
            >
              <option value="">-- Seleccionar presupuesto --</option>
              {budgets.map(b => (
                <option key={b.id} value={b.id}>
                  {b.presupuestoNumber || 'S/N'} - {b.name || b.clientName || 'Cliente sin nombre'} ({b.status})
                </option>
              ))}
            </select>
            <button 
              className="btn" 
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#10b981', color: 'white', border: 'none' }}
              disabled={!selectedBudgetId || isExporting}
              onClick={handleExportToBudget}
            >
              <Send size={16} /> {isExporting ? 'Exportando...' : 'Asignar a Presupuesto'}
            </button>
          </div>
        </div>
      )}
      
    </div>
  );
};

export default FinalBalance;
