import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../services/firebaseConfig';
import { Loader, Sparkles, AlertTriangle } from 'lucide-react';

const questionsMap = {
  q1: 'Presupuesto',
  q2: 'Obra Finalizada',
  q3: 'Instaladores',
  q5: 'Oficina Técnica',
  q6: 'Tiempos',
  q7: 'Satisfacción Global'
};

const ReportesEncuestas = () => {
  const [encuestas, setEncuestas] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState('');

  useEffect(() => {
    // Escuchar todas las obras y filtrar localmente las que tienen encuesta
    const unsub = onSnapshot(collection(db, 'obras'), (snap) => {
      const data = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(obra => obra.encuesta && obra.encuesta.respuestas)
        .map(obra => ({
          ...obra.encuesta,
          obraId: obra.id,
          clienteNombre: obra.clientName || 'Sin Nombre'
        }))
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha)); // Orden desc
      
      setEncuestas(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Helpers de fecha para filtrar últimos 6 meses
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  
  const recientes = encuestas.filter(e => new Date(e.fecha) >= sixMonthsAgo);

  const calcAvg = (list, qId) => {
    const valid = list.filter(e => e.respuestas[qId] > 0);
    if (valid.length === 0) return 0;
    const sum = valid.reduce((acc, curr) => acc + curr.respuestas[qId], 0);
    // Escalar de 1-5 a 1-10
    return ((sum / valid.length) * 2).toFixed(1);
  };

  const getKpis = (list) => {
    const kpis = {};
    let totalSum = 0;
    let count = 0;
    Object.keys(questionsMap).forEach(qId => {
      kpis[qId] = parseFloat(calcAvg(list, qId));
      if (kpis[qId] > 0) {
        totalSum += kpis[qId];
        count++;
      }
    });
    kpis.global = count > 0 ? (totalSum / count).toFixed(1) : 0;
    return kpis;
  };

  const promediosHistoricos = getKpis(encuestas);
  const promediosRecientes = getKpis(recientes);

  const outsiders = encuestas.filter(e => {
    if (!e.respuestas) return false;
    const vals = Object.values(e.respuestas).filter(v => v > 0);
    if (vals.length === 0) return false;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return avg < 3.5; // Menor a 7/10
  });

  const handleAIAnalysis = async () => {
    setAiLoading(true);
    setAiAnalysis('');
    
    try {
      const comentarios = recientes.map(e => `- ${e.comentarios}`).filter(c => c.length > 5).join('\n');
      
      const prompt = `
Eres un consultor experto en experiencia del cliente para una empresa de calefacción por agua llamada Euler.
Analiza estos KPIs de encuestas de satisfacción (escala 1 al 10):
- Satisfacción Global: ${promediosRecientes.global} (Histórico: ${promediosHistoricos.global})
${Object.keys(questionsMap).map(k => `- ${questionsMap[k]}: ${promediosRecientes[k]} (Histórico: ${promediosHistoricos[k]})`).join('\n')}

Comentarios recientes de clientes:
${comentarios}

Elabora un reporte breve en Markdown que incluya:
1. Resumen ejecutivo del rendimiento (identifica fortalezas y debilidades comparando recientes vs históricos).
2. Patrones clave detectados en los KPIs y comentarios.
3. Propuesta de plan de acción (3 a 5 puntos claros) para mejorar las métricas más bajas.
No uses títulos gigantes, usa h3 (###) o negritas. Sé directo y profesional.`;

      const askGemini = httpsCallable(functions, 'askGemini');
      const response = await askGemini({ prompt });
      setAiAnalysis(response.data.response);
    } catch (err) {
      console.error(err);
      setAiAnalysis(`Error al generar análisis: ${err.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><Loader className="spin" size={32} /></div>;
  }

  return (
    <div className="report-card" style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            📊 Análisis de Encuestas de Obra
          </h3>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Métricas de calidad y satisfacción evaluadas del 1 al 10.
          </p>
        </div>
        <button 
          onClick={handleAIAnalysis}
          disabled={aiLoading}
          className="btn" 
          style={{ 
            display: 'flex', alignItems: 'center', gap: '0.5rem', 
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', border: 'none' 
          }}
        >
          {aiLoading ? <Loader size={16} className="spin" /> : <Sparkles size={16} />}
          Analizar con IA
        </button>
      </div>

      {aiAnalysis && (
        <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
          <h4 style={{ margin: '0 0 1rem 0', color: '#5b21b6', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={18} /> Resultados del Análisis IA
          </h4>
          <div className="markdown-body" style={{ fontSize: '0.875rem', color: '#4c1d95', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: aiAnalysis.replace(/\n/g, '<br/>').replace(/### (.*?)\<br\/\>/g, '<h3>$1</h3>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
        </div>
      )}

      <div style={{ marginBottom: '2rem' }}>
        <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-primary)' }}>Promedios Generales</h4>
        <div className="kpi-grid">
          <div className="kpi-card" style={{ backgroundColor: 'var(--success)', color: 'white', borderColor: 'var(--success)', gridColumn: 'span 2' }}>
            <span className="kpi-label" style={{ color: '#ecfdf5' }}>Satisfacción Global (6 Meses)</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span className="kpi-value" style={{ color: 'white', fontSize: '2.5rem' }}>{promediosRecientes.global} <span style={{ fontSize: '1rem' }}>/ 10</span></span>
              {promediosHistoricos.global && (
                <span style={{ fontSize: '0.85rem', color: '#ecfdf5', opacity: 0.9 }}>
                  Histórico: {promediosHistoricos.global}
                </span>
              )}
            </div>
            <span style={{ fontSize: '0.75rem', color: '#ecfdf5', marginTop: '0.5rem', display: 'block' }}>Basado en {recientes.length} encuestas recientes (Total histórico: {encuestas.length})</span>
          </div>
          
          {Object.entries(questionsMap).map(([qId, label]) => (
            <div key={qId} className="kpi-card">
              <span className="kpi-label" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={label}>{label}</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                <span className="kpi-value">{promediosRecientes[qId]}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>/ 10</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>
                Histórico: {promediosHistoricos[qId]}
              </div>
            </div>
          ))}
        </div>
      </div>

      <h4 style={{ marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <AlertTriangle size={18} color="var(--danger)" /> Outsiders (Alertas de Bajo Puntaje - Menor a 7)
      </h4>
      {outsiders.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>No hay encuestas con puntajes críticos recientes.</p>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border-strong)', borderRadius: '8px' }}>
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f8fafc', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Cliente</th>
                <th style={{ padding: '0.75rem 1rem' }}>Fecha</th>
                <th style={{ padding: '0.75rem 1rem' }}>Puntaje Prom.</th>
                <th style={{ padding: '0.75rem 1rem' }}>Comentario</th>
              </tr>
            </thead>
            <tbody>
              {outsiders.map(out => {
                const vals = Object.values(out.respuestas).filter(v => v > 0);
                const avg = ((vals.reduce((a, b) => a + b, 0) / vals.length) * 2).toFixed(1);
                return (
                  <tr key={out.obraId} style={{ borderTop: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: '500' }}>{out.clienteNombre}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{new Date(out.fecha).toLocaleDateString('es-AR')}</td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--danger)', fontWeight: 'bold' }}>{avg} / 10</td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {out.comentarios || 'Sin comentarios'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ReportesEncuestas;
