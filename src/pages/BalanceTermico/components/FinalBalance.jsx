import React, { useState, useEffect } from 'react';
import { ArrowLeft, AlertTriangle, Info, Download, Send } from 'lucide-react';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import generarPDFBalanceTermico from '../../../services/pdfBalanceTermico';

const FinalBalance = ({ environments, params, onBack }) => {
  const coef = params.coefVolumetrico ?? 45; // Kcal/h·m³
  const rendimientoElemento = params.rendimientoElemento ?? 145;
  const margenMultiplier = 1 + (params.margenSeguridad / 100);

  // Estado para la configuración de emisores por ambiente
  const [emitterChoices, setEmitterChoices] = useState({});
  const [budgets, setBudgets] = useState([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    // Inicializar emitterChoices con valores por defecto
    const initialChoices = {};
    environments.filter(e => e.calefaccion).forEach(env => {
      const isBathroom = env.nombre.toLowerCase().includes('baño') || env.nombre.toLowerCase().includes('toilette');
      
      const totalKcal = (parseFloat(env.superficie) || 0) * (parseFloat(env.altura) || 2.8) * coef * margenMultiplier;
      const calcElements = Math.ceil(totalKcal / rendimientoElemento);
      
      initialChoices[env.id] = {
        type: isBathroom ? 'Toallero 80cm' : 'Radiador',
        splitMode: calcElements > 12 ? 2 : 1
      };
    });
    setEmitterChoices(initialChoices);

    // Cargar presupuestos pendientes y en calculo
    const fetchBudgets = async () => {
      try {
        const q = query(collection(db, 'presupuestos'), where('deleted', '!=', true));
        const querySnapshot = await getDocs(q);
        const activeBudgets = querySnapshot.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(b => b.status === 'pendiente' || b.status === 'en_calculo')
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

  // Cálculo correcto por coeficiente volumétrico (método estándar Argentina)
  const computedEnvs = environments.filter(e => e.calefaccion).map(env => {
    const superficie = parseFloat(env.superficie) || 0;
    const altura = parseFloat(env.altura) || 2.8;
    const volumen = superficie * altura;

    // Distribución típica: 65% transmisión, 35% infiltración
    const totalKcal = volumen * coef;
    const transmisionKcal = totalKcal * 0.65;
    const infiltracionKcal = totalKcal * 0.35;

    const totalKcalMargin = totalKcal * margenMultiplier;

    // Emisores calculation
    const choice = emitterChoices[env.id] || { type: 'Radiador', splitMode: 1 };
    const elementsNeeded = Math.ceil(totalKcalMargin / rendimientoElemento);
    
    let emitterSummary = '';
    
    if (choice.type === 'Radiador') {
      if (choice.splitMode > 1) {
        const elementsPerRadiator = Math.ceil(elementsNeeded / choice.splitMode);
        emitterSummary = `${choice.splitMode} Radiadores de ${elementsPerRadiator} elem.`;
      } else {
        emitterSummary = `1 Radiador de ${elementsNeeded} elem.`;
      }
    } else {
      emitterSummary = `1 ${choice.type} (${choice.type.includes('80') ? '3' : '5'} elem. eq.)`;
    }

    return {
      ...env,
      volumen,
      transmisionW: transmisionKcal * 1.163,
      infiltracionW: infiltracionKcal * 1.163,
      totalW: totalKcal * 1.163,
      totalKcal,
      totalKcalMargin,
      elementsNeeded,
      choice,
      emitterSummary
    };
  });

  const totalKcal = computedEnvs.reduce((acc, e) => acc + e.totalKcal, 0);
  const totalWatts = totalKcal * 1.163;
  const totalKcalMargin = totalKcal * margenMultiplier;
  const totalWattsMargin = totalWatts * margenMultiplier;
  const totalVolumen = computedEnvs.reduce((acc, e) => acc + e.volumen, 0);
  const totalElementos = computedEnvs.reduce((acc, e) => acc + e.elementsNeeded, 0);

  const handleExportPDF = () => {
    generarPDFBalanceTermico({ environments: computedEnvs, params, totalKcal, totalKcalMargin, totalWattsMargin, totalVolumen, totalElementos });
  };

  const handleExportToBudget = async () => {
    if (!selectedBudgetId) return;
    setIsExporting(true);
    try {
      // Formatear el informe térmico como texto para las notas
      let notasAdicionales = `\n\n--- BALANCE TÉRMICO IA ---\nFecha: ${new Date().toLocaleDateString('es-AR')}\n\n`;
      notasAdicionales += `Parámetros de Cálculo:\n- Coeficiente volumétrico: ${coef} Kcal/h·m³\n- Margen de seguridad: ${params.margenSeguridad}%\n- Rendimiento por elemento: ${rendimientoElemento} Kcal/h\n\n`;
      notasAdicionales += `Resultados Totales:\n- Volumen Total: ${totalVolumen.toFixed(1)} m³\n- Potencia Efectiva: ${Math.round(totalKcal).toLocaleString('es-AR')} Kcal/h\n- Potencia con Margen: ${Math.round(totalKcalMargin).toLocaleString('es-AR')} Kcal/h\n- Total Elementos Eq.: ${totalElementos}\n\n`;
      notasAdicionales += `Detalle por Ambiente:\n`;
      
      computedEnvs.forEach(env => {
        notasAdicionales += `• ${env.nombre}:\n`;
        notasAdicionales += `  Sup: ${env.superficie.toFixed(1)} m² | Vol: ${env.volumen.toFixed(1)} m³ | Kcal/h (C/Margen): ${Math.round(env.totalKcalMargin)}\n`;
        notasAdicionales += `  Emisor Sugerido: ${env.emitterSummary}\n`;
      });

      // Actualizar el documento del presupuesto
      const { doc, getDoc, updateDoc } = await import('firebase/firestore');
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
        <h3 style={{ fontSize: '1.25rem', margin: 0 }}>Balance Térmico — Resultado Preliminar</h3>
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

        <div className="card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-light)', backgroundColor: '#f0fdf4' }}>
          <span style={{ fontSize: '0.875rem', textTransform: 'uppercase', color: '#166534' }}>Elementos Necesarios</span>
          <h2 style={{ fontSize: '2.5rem', margin: '0.5rem 0', fontWeight: '700', color: '#15803d' }}>{totalElementos}</h2>
          <span style={{ fontSize: '1rem', color: '#166534' }}>A {rendimientoElemento} Kcal/h c/u</span>
        </div>
      </div>

      {/* Dato de verificación */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '0.75rem 1.25rem', backgroundColor: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
        <Info size={18} color="#2563eb" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: '0.875rem', color: '#1e40af' }}>
          <strong>{totalVolumen.toFixed(1)} m³</strong> con calefacción × <strong>{coef} Kcal/h·m³</strong> = <strong>{Math.round(totalKcal).toLocaleString('es-AR')} Kcal/h efectivas</strong> &nbsp;|&nbsp; Margen: {params.margenSeguridad}%
        </span>
      </div>

      {/* Tabla de detalle */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)' }}>
          <h3 style={{ fontSize: '1.125rem', margin: 0 }}>Detalle por Ambiente y Selección de Emisores</h3>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-surface-hover)', borderBottom: '1px solid var(--border-light)' }}>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>AMBIENTE</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'right' }}>SUP. (M²)</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: '#2563eb', textAlign: 'right', fontWeight: '600' }}>KCAL/H<br/>(Con Margen)</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>TIPO DE EMISOR</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>CONFIGURACIÓN</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: '#15803d', fontWeight: '600' }}>RESUMEN</th>
              </tr>
            </thead>
            <tbody>
              {computedEnvs.map(env => (
                <tr key={env.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                    {env.nombre}
                  </td>
                  <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', textAlign: 'right' }}>{env.superficie.toFixed(1)}</td>
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
                    {env.choice.type === 'Radiador' && env.elementsNeeded > 12 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <select 
                          className="input-field"
                          style={{ padding: '0.4rem', fontSize: '0.875rem', width: 'auto' }}
                          value={env.choice.splitMode}
                          onChange={(e) => handleChoiceChange(env.id, 'splitMode', parseInt(e.target.value))}
                        >
                          <option value={1}>1 Radiador grande</option>
                          <option value={2}>Dividir en 2</option>
                          <option value={3}>Dividir en 3</option>
                        </select>
                      </div>
                    ) : env.choice.type === 'Radiador' ? (
                      <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Único radiador</span>
                    ) : (
                      <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Pared</span>
                    )}
                  </td>
                  
                  <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', color: '#15803d', fontWeight: '600' }}>
                    {env.emitterSummary}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
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
      
      <div className="card" style={{ padding: '1.5rem', backgroundColor: '#fffbeb', border: '1px solid #fde68a', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
        <AlertTriangle color="#d97706" style={{ flexShrink: 0 }} />
        <div>
          <h4 style={{ margin: '0 0 0.5rem 0', color: '#b45309', fontSize: '1rem' }}>Metodología de cálculo</h4>
          <p style={{ margin: 0, color: '#92400e', fontSize: '0.875rem', lineHeight: '1.5' }}>
            Se utiliza el <strong>método del coeficiente volumétrico</strong> (estándar en la industria Argentina): <em>Q = Volumen × {coef} Kcal/h·m³</em>. 
            La distribución 65% transmisión / 35% infiltración es estimativa. Para un balance definitivo, debe validarse el coeficiente con datos del proyecto.
          </p>
        </div>
      </div>
    </div>
  );
};

export default FinalBalance;
