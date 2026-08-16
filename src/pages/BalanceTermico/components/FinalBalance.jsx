import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, AlertTriangle, Info, Download, Send } from 'lucide-react';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import generarPDFBalanceTermico from '../../../services/pdfBalanceTermico';

const FinalBalance = ({ environments, params, onBack }) => {
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
    // Inicializar emitterChoices con valores por defecto (solo relevante si es radiadores)
    const initialChoices = {};
    environments.filter(e => e.calefaccion).forEach(env => {
      const isBathroom = env.nombre.toLowerCase().includes('baño') || env.nombre.toLowerCase().includes('toilette');
      initialChoices[env.id] = {
        type: isBathroom ? 'Toallero 80cm' : 'Radiador',
        customText: null
      };
    });
    setEmitterChoices(initialChoices);

    // Cargar presupuestos pendientes y en calculo
    const fetchBudgets = async () => {
      try {
        const q = query(collection(db, 'presupuestos'));
        const querySnapshot = await getDocs(q);
        const activeBudgets = querySnapshot.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(b => b.deleted !== true && (b.status === 'pendiente' || b.status === 'en_calculo'))
          .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
        setBudgets(activeBudgets);
      } catch (err) {
        console.error("Error fetching budgets:", err);
      }
    };
    fetchBudgets();
  }, [environments, coef, rendimientoElemento, margenMultiplier]);

  const handleChoiceChange = (envId, field, value) => {
    setEmitterChoices(prev => ({
      ...prev,
      [envId]: { ...prev[envId], [field]: value }
    }));
  };

  // Cálculo de entornos
  const computedEnvs = useMemo(() => {
    return environments.filter(e => e.calefaccion).map(env => {
      const superficie = parseFloat(env.superficie) || 0;
      const altura = parseFloat(env.altura) || 2.8;
      const volumen = superficie * altura;

      const totalKcal = volumen * coef;
      const transmisionKcal = totalKcal * 0.65;
      const infiltracionKcal = totalKcal * 0.35;
      const totalKcalMargin = totalKcal * margenMultiplier;
      const totalW = totalKcal * 1.163;
      const wattsPorM2 = superficie > 0 ? totalW / superficie : 0;

      let envResult = {
        ...env,
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
        const choice = emitterChoices[env.id] || { type: 'Radiador', customText: null };
        let emitterSummary = '';
        let finalElements = 0;
        let radsArray = [];

        if (choice.type === 'Radiador') {
          if (choice.customText !== null) {
            // Usuario escribió algo personalizado, ej "14, 7, 7"
            radsArray = choice.customText.split(',')
              .map(s => parseInt(s.trim()))
              .filter(n => !isNaN(n) && n > 0);
          } else {
            // Auto cálculo
            let splits = 1;
            if (baseElementsNeeded > 12) splits = 2;
            if (baseElementsNeeded > 24) splits = 3;
            if (baseElementsNeeded > 36) splits = 4;
            const perRad = Math.ceil(baseElementsNeeded / splits);
            radsArray = Array(splits).fill(perRad);
          }

          finalElements = radsArray.reduce((a, b) => a + b, 0);

          if (radsArray.length === 0) {
            emitterSummary = '0 elementos';
          } else {
            const counts = {};
            radsArray.forEach(p => { counts[p] = (counts[p] || 0) + 1; });
            emitterSummary = Object.entries(counts).map(([size, count]) => {
               return count === 1 ? `1 Radiador de ${size} elem.` : `${count} Radiadores de ${size} elem.`;
            }).join(' + ');
          }
          envResult.displayRadsStr = choice.customText !== null ? choice.customText : radsArray.join(', ');
        } else {
          // Toalleros
          finalElements = choice.type.includes('80') ? 3 : 5;
          emitterSummary = `1 ${choice.type} (${finalElements} elem. eq.)`;
          envResult.displayRadsStr = '';
        }
        
        envResult.elementsNeeded = finalElements;
        envResult.choice = choice;
        envResult.emitterSummary = emitterSummary;
        envResult.baseElementsNeeded = baseElementsNeeded; // para mostrar advertencias si difiere mucho
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
      let notasAdicionales = `\n\n--- BALANCE TÉRMICO IA ---\nFecha: ${new Date().toLocaleDateString('es-AR')}\n`;
      notasAdicionales += `Sistema: ${params.sistemaEmision}\n\n`;
      notasAdicionales += `Parámetros:\n- Coeficiente volumétrico: ${coef} Kcal/h·m³\n- Margen de seguridad: ${params.margenSeguridad}%\n`;
      
      if (!esPisoRadiante) {
        notasAdicionales += `- Rendimiento por elemento: ${rendimientoElemento} Kcal/h\n\n`;
        notasAdicionales += `Resultados Totales:\n- Volumen Total: ${totalVolumen.toFixed(1)} m³\n- Potencia Efectiva: ${Math.round(totalKcal).toLocaleString('es-AR')} Kcal/h\n- Total Elementos Eq.: ${totalElementos}\n\n`;
      } else {
        notasAdicionales += `- Separación de tubo: ${params.pasoTubo} cm\n- Diámetro: ${params.diametroTubo} mm\n\n`;
        notasAdicionales += `Resultados Totales:\n- Superficie Total: ${totalSup.toFixed(1)} m²\n- Potencia con Margen: ${Math.round(totalKcalMargin).toLocaleString('es-AR')} Kcal/h\n- Metros de Tubo: ${totalTubos} m\n\n`;
      }

      notasAdicionales += `Detalle por Ambiente:\n`;
      
      computedEnvs.forEach(env => {
        notasAdicionales += `• ${env.nombre}:\n`;
        if (!esPisoRadiante) {
          notasAdicionales += `  Sup: ${env.superficie.toFixed(1)} m² | Kcal/h: ${Math.round(env.totalKcalMargin)}\n`;
          notasAdicionales += `  Emisor: ${env.emitterSummary}\n`;
        } else {
          notasAdicionales += `  Sup: ${env.superficie.toFixed(1)} m² | W/m²: ${Math.round(env.wattsPorM2)} | Tubo: ${env.tuboTotal} m | Circuitos: ${env.circuitos}\n`;
        }
      });

      const budgetRef = doc(db, 'presupuestos', selectedBudgetId);
      const budgetSnap = await getDoc(budgetRef);
      
      if (budgetSnap.exists()) {
        const currentData = budgetSnap.data();
        const currentNotas = currentData.notas || '';
        await updateDoc(budgetRef, {
          notas: currentNotas + notasAdicionales
        });
        alert('Balance térmico exportado con éxito a las notas del presupuesto.');
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
          <button onClick={onBack} className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid var(--border-light)', backgroundColor: 'white' }}>
            <ArrowLeft size={16} /> Volver a edición
          </button>
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
                    {env.planta ? `${env.planta.substring(0, 2).toUpperCase()} · ` : ''}{env.nombre}
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
                      <td style={{ padding: '1rem 1.5rem' }}>
                        {env.choice.type === 'Radiador' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <input 
                              type="text"
                              className="input-field"
                              style={{ padding: '0.4rem', fontSize: '0.875rem', width: '120px' }}
                              placeholder="Ej: 14, 7, 7"
                              value={env.displayRadsStr}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val.trim() === '') {
                                  handleChoiceChange(env.id, 'customText', null);
                                } else {
                                  handleChoiceChange(env.id, 'customText', val);
                                }
                              }}
                            />
                            {env.elementsNeeded !== env.baseElementsNeeded && (
                              <span style={{ fontSize: '0.7rem', color: '#d97706', fontWeight: '500' }}>Req: {env.baseElementsNeeded} elem.</span>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Pared</span>
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
      
    </div>
  );
};

export default FinalBalance;
