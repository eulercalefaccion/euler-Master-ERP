import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';
import { Key, Send, Loader, Trash2 } from 'lucide-react';

const ReportesIA = () => {
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_api_key') || '');
  const [isKeyConfigured, setIsKeyConfigured] = useState(!!localStorage.getItem('gemini_api_key'));
  const [messages, setMessages] = useState([
    { role: 'model', text: '¡Hola! Soy tu Analista de Datos de Euler. Puedo responder preguntas sobre tiempos de venta, métricas de obras, encuestas y clientes. ¿En qué te ayudo hoy?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [contextData, setContextData] = useState(null);
  
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const saveApiKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem('gemini_api_key', apiKey.trim());
      setIsKeyConfigured(true);
    }
  };

  const removeApiKey = () => {
    localStorage.removeItem('gemini_api_key');
    setApiKey('');
    setIsKeyConfigured(false);
  };

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

      setContextData({ presupuestos, obras, encuestas });
    } catch (e) {
      console.error('Error cargando contexto', e);
    }
  };

  useEffect(() => {
    if (isKeyConfigured) {
      loadContextData();
    }
  }, [isKeyConfigured]);

  const handleSend = async () => {
    if (!input.trim() || !isKeyConfigured) return;
    
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

      const promptPayload = {
        contents: [
          {
            role: "user",
            parts: [{ text: systemContext + "\n\nPregunta del usuario: " + userMessage }]
          }
        ],
        generationConfig: { temperature: 0.2 }
      };

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(promptPayload)
      });
      
      if (!res.ok) {
        throw new Error(`Error de API: ${res.status}`);
      }

      const json = await res.json();
      const botReply = json.candidates[0].content.parts[0].text;

      setMessages(prev => [...prev, { role: 'model', text: botReply }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'model', text: 'Hubo un error de conexión con la IA. Verifica tu API Key o conexión a internet.' }]);
    } finally {
      setLoading(false);
    }
  };

  if (!isKeyConfigured) {
    return (
      <div className="report-card" style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{ backgroundColor: 'var(--primary-50)', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
          <Key size={32} color="var(--primary-700)" />
        </div>
        <h3 style={{ margin: 0, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Configurar Asistente IA</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
          Para usar el analista de datos basado en inteligencia artificial, necesitas ingresar tu clave API de Google Gemini (gratuita).
        </p>
        <input
          type="password"
          placeholder="Pega tu API Key de Gemini aquí..."
          className="input-field"
          style={{ width: '100%', marginBottom: '1rem', textAlign: 'center' }}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={saveApiKey}>
          Guardar y Activar Analista IA
        </button>
      </div>
    );
  }

  return (
    <div className="ai-chat-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
        <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <MessageSquare size={18} color="var(--primary-600)" /> 
          Asistente IA (Gemini 1.5)
        </h4>
        <button 
          onClick={removeApiKey} 
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem' }}
          title="Eliminar API Key"
        >
          <Trash2 size={14} /> Cambiar Key
        </button>
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
