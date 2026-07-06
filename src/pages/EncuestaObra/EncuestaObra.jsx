import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';
import { Star, CheckCircle, Loader } from 'lucide-react';
import './EncuestaObra.css';

const questions = [
  { id: 'q1', text: '¿Cómo calificas el tiempo y la calidad del presupuesto recibido?' },
  { id: 'q2', text: '¿Cómo calificas la calidad de la obra finalizada?' },
  { id: 'q3', text: '¿Cómo evaluas la presencia y el profesionalismo de los instaladores?' },
  { id: 'q5', text: '¿Cómo evaluas el tiempo de respuesta y el conocimiento de la oficina técnica?' },
  { id: 'q6', text: '¿Consideras que la obra se realizó en los tiempos acordados?' },
  { id: 'q7', text: '¿Cuál es tu nivel de satisfacción general con el resultado final de la obra y la atención del equipo?' }
];

export default function EncuestaObra() {
  const { id } = useParams(); // obraId
  const [obra, setObra] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  
  const [answers, setAnswers] = useState({
    q1: 0, q2: 0, q3: 0, q5: 0, q6: 0, q7: 0
  });
  
  const [comentarios, setComentarios] = useState('');

  useEffect(() => {
    const fetchObra = async () => {
      try {
        const docRef = doc(db, 'obras', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setObra(data);
          if (data.encuesta) {
            setSubmitted(true);
          }
        } else {
          setError('No encontramos la obra indicada.');
        }
      } catch (err) {
        console.error(err);
        setError('Error al cargar la información.');
      } finally {
        setLoading(false);
      }
    };
    fetchObra();
  }, [id]);

  const handleStarClick = (qId, value) => {
    setAnswers(prev => ({ ...prev, [qId]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const allAnswered = Object.values(answers).every(v => v > 0);
    if (!allAnswered) {
      alert('Por favor, respondé a todas las preguntas seleccionando las estrellas.');
      return;
    }
    setSubmitting(true);
    try {
      const sum = Object.values(answers).reduce((acc, curr) => acc + curr, 0);
      const average = sum / questions.length;
      
      const encuestaData = {
        respuestas: answers,
        comentarios: comentarios.trim(),
        promedio: parseFloat(average.toFixed(2)),
        fecha: new Date().toISOString()
      };

      await updateDoc(doc(db, 'obras', id), {
        encuesta: encuestaData
      });
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      alert('Error al enviar la encuesta: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="encuesta-container center-content">
        <Loader className="spin text-primary" size={48} />
        <p>Cargando encuesta...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="encuesta-container center-content">
        <h2 className="text-danger">¡Ocurrió un error!</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="encuesta-container center-content fade-in">
        <div className="success-icon-wrap">
          <CheckCircle size={64} className="text-success" />
        </div>
        <h2 className="text-primary mt-4">¡Muchas gracias!</h2>
        <p className="mt-2 text-secondary">
          Tu opinión es fundamental para ayudarnos a mejorar cada día. <br/>
          Recibimos tus respuestas correctamente.
        </p>
        <div className="logo-footer mt-4">
          <strong>EULER</strong> <br/>
          <span>Calefacción por Agua</span>
        </div>
      </div>
    );
  }

  return (
    <div className="encuesta-container fade-in">
      <div className="encuesta-card">
        <div className="encuesta-header">
          <h1>Encuesta de Calidad</h1>
          <p>
            ¡Hola! En <strong>Euler</strong> valoramos mucho tu experiencia. Te pedimos unos minutos para calificar nuestro trabajo en la obra de <strong>{obra?.direccionObra || obra?.clientName || 'tu domicilio'}</strong>.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="encuesta-form">
          {questions.map((q, idx) => (
            <div key={q.id} className="question-block">
              <label>{idx + 1}. {q.text}</label>
              <div className="stars-container">
                {[1, 2, 3, 4, 5].map(star => (
                  <Star
                    key={star}
                    size={32}
                    className={`star-icon ${answers[q.id] >= star ? 'filled' : ''}`}
                    onClick={() => handleStarClick(q.id, star)}
                  />
                ))}
              </div>
            </div>
          ))}

          <div className="question-block mt-4">
            <label>¿Tenés algún comentario adicional? (Opcional)</label>
            <textarea
              className="encuesta-textarea"
              rows="4"
              placeholder="Dejanos tus sugerencias o comentarios..."
              value={comentarios}
              onChange={e => setComentarios(e.target.value)}
            />
          </div>

          <button type="submit" className="encuesta-submit-btn" disabled={submitting}>
            {submitting ? <Loader className="spin" size={20} /> : 'Enviar Encuesta'}
          </button>
        </form>
      </div>
    </div>
  );
}
