import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, query, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../services/firebaseConfig';
import { dbSueldos } from '../../services/firebaseSueldos';
import { Send, Loader, Trash2, MessageSquare } from 'lucide-react';

const ReportesIA = () => {
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem('gemini_chat_history');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return [
      { role: 'model', text: '¡Hola! Soy tu Analista de Datos de Euler. Puedo responder preguntas sobre tiempos de venta, métricas de obras, encuestas, clientes, sueldos y liquidaciones del personal. ¿En qué te ayudo hoy?' }
    ];
  });
  
  useEffect(() => {
    localStorage.setItem('gemini_chat_history', JSON.stringify(messages));
  }, [messages]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [contextData, setContextData] = useState(null);
  
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Pre-cargar datos del ERP para inyectar como contexto
  const loadContextData = async () => {
    try {
      // Tomamos una muestra representativa reciente para no exceder tokens
      const presQuery = query(collection(db, 'presupuestos'), orderBy('createdAt', 'desc'), limit(100));
      const obrasQuery = query(collection(db, 'obras'), orderBy('createdAt', 'desc'), limit(100));
      const encuestasQuery = query(collection(db, 'encuestas_obra'), orderBy('createdAt', 'desc'), limit(100));

      const [presSnap, obrasSnap, encuestasSnap] = await Promise.all([
        getDocs(presQuery), getDocs(obrasQuery), getDocs(encuestasQuery)
      ]);

      const presupuestos = presSnap.docs.map(d => ({
        estado: d.data().status,
        monto: d.data().amount,
        fecha: d.data().date,
        historial: d.data().statusHistory || []
      }));
      
      const obras = obrasSnap.docs.map(d => ({
        estado: d.data().estado,
        fechaInicio: d.data().fechaInicio,
        progreso: d.data().progress
      }));
      
      const encuestas = encuestasSnap.docs.map(d => ({
        general: d.data().respuestas?.general,
        fecha: d.data().createdAt?.toDate()
      }));

      // Cargar datos de Sueldos
      let sueldosData = {};
      try {
        const sueldosRef = doc(dbSueldos, 'eulerData', 'mainData');
        const sueldosSnap = await getDoc(sueldosRef);
        if (sueldosSnap.exists()) {
          const sData = sueldosSnap.data();
          sueldosData = {
            empleados: (sData.employees || []).map(e => ({ nombre: e.name, rol: e.category, base: e.baseSalary })),
            historialParitarias: sData.paritariasHistory || [],
            ultimasLiquidaciones: (sData.liquidations || []).map(l => ({ 
              empleado: l.employeeName, 
              salario: l.calculations?.totalSalario || 0,
              gastos: l.calculations?.totalGastos || 0,
              totalAbonado: l.calculations?.total || 0, 
              semana: l.week,
              mes: l.monthName,
              año: l.year,
              fecha: l.createdAt 
            }))
          };
        }
      } catch (err) {
        console.warn("No se pudo cargar la info de sueldos:", err);
      }

      setContextData({ presupuestos, obras, encuestas, sueldos: sueldosData });
    } catch (e) {
      console.error('Error cargando contexto', e);
    }
  };

  useEffect(() => {
    loadContextData();
  }, []);

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setLoading(true);

    try {
      const systemContext = `
Eres un analista de datos avanzado para una empresa de calefacción y climatización llamada Euler.
Aquí tienes los datos recientes (en formato JSON resuelto) para responder:
${JSON.stringify(contextData)}
Responde la pregunta del usuario basándote SOLO en estos datos si te pide métricas. Si es una consulta general, sé amable y profesional. Responde corto y al punto, usando formato markdown. No expongas el JSON al usuario.`;

      const askGemini = httpsCallable(functions, 'askGemini');
      const response = await askGemini({
        prompt: systemContext + "\n\nPregunta del usuario: " + userMessage
      });
      
      const botReply = response.data.response;
      setMessages(prev => [...prev, { role: 'model', text: botReply }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'model', text: `Hubo un error de conexión con la IA. Detalle: ${error.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ai-chat-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
        <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <MessageSquare size={18} color="var(--primary-600)" /> 
          Asistente IA (Gemini 1.5)
        </h4>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            onClick={() => {
              if(window.confirm('¿Borrar todo el historial de conversación?')) {
                setMessages([{ role: 'model', text: '¡Hola! Soy tu Analista de Datos de Euler. Puedo responder preguntas sobre tiempos de venta, métricas de obras, encuestas, clientes, sueldos y liquidaciones del personal. ¿En qué te ayudo hoy?' }]);
              }
            }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem' }}
          >
            <Trash2 size={14} /> Limpiar Chat
          </button>
        </div>
      </div>

      <div className="ai-chat-messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`ai-message ${msg.role === 'user' ? 'user' : 'bot'}`}>
            <div dangerouslySetInnerHTML={{ __html: msg.text.replace(/\n/g, '<br/>') }} />
          </div>
        ))}
        {loading && (
          <div className="ai-message bot" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Loader size={16} className="spin" /> <em>Analizando miles de datos...</em>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="ai-chat-input">
        <input 
          type="text" 
          placeholder="Preguntá lo que quieras sobre tus presupuestos o encuestas..." 
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          disabled={loading || !contextData}
        />
        <button onClick={handleSend} disabled={loading || !input.trim() || !contextData}>
          <Send size={18} />
        </button>
      </div>
    </div>
  );
};

export default ReportesIA;
