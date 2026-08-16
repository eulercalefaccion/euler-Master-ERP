import React, { useState } from 'react';
import { Zap, Upload, AlertTriangle, FileText, Check, FileImage } from 'lucide-react';
import PlanUploader from './components/PlanUploader';
import AiAnalysisReview from './components/AiAnalysisReview';
import EnvironmentsEditor from './components/EnvironmentsEditor';
import CalculationParameters from './components/CalculationParameters';
import FinalBalance from './components/FinalBalance';
import { functions } from '../../services/firebaseConfig';
import { httpsCallable } from 'firebase/functions';

const BalanceTermico = () => {
  const [step, setStep] = useState(1);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiData, setAiData] = useState(null);
  const [environments, setEnvironments] = useState([]);
  const [calcParams, setCalcParams] = useState({
    zonaIram: 'Zona I - NOA / NEA (0°C)',
    tempExterior: -5,
    tempInterior: 20,
    tipoEnvolvente: 'Media (ladrillo hueco)',
    tipoVidrio: 'Simple',
    margenSeguridad: 15,
    coefVolumetrico: 42,  // Kcal/h·m³ — Zona I, Media envolvente
  });

  const handleFileUpload = async (files) => {
    setIsAnalyzing(true);
    try {
      let allEnvs = [];
      let finalAiData = null;
      let combinedObservaciones = [];
      let combinedRiesgos = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const base64 = await convertToBase64(file);
        // Remove prefix data:image/...;base64,
        const base64Data = base64.split(',')[1];
        
        const analyzeFloorPlan = httpsCallable(functions, 'analyzeFloorPlan');
        const response = await analyzeFloorPlan({
          fileBase64: base64Data,
          mediaType: file.type
        });

        const parsedData = response.data.data;
        if (i === 0) {
          finalAiData = parsedData; // Base the final review on the first plan
        } else {
          // Combine some useful texts if needed
          if (parsedData.observaciones) combinedObservaciones.push(parsedData.observaciones);
          if (parsedData.riesgos) combinedRiesgos.push(...parsedData.riesgos);
        }
        
        if (parsedData.ambientes) {
          allEnvs = [...allEnvs, ...parsedData.ambientes];
        }
      }

      if (finalAiData) {
        if (combinedObservaciones.length > 0) {
           finalAiData.observaciones = finalAiData.observaciones + '\n\nOtras observaciones: ' + combinedObservaciones.join(' | ');
        }
        if (combinedRiesgos.length > 0) {
           finalAiData.riesgos = [...(finalAiData.riesgos || []), ...combinedRiesgos];
        }
        setAiData(finalAiData);
      }
      
      // Initialize environments from AI
      if (allEnvs.length > 0) {
        const envs = allEnvs.map((env, i) => ({
          id: i.toString(),
          nombre: env.nombre || 'Local Sin Nombre',
          planta: env.planta || 'Baja', // Allow AI to return planta if possible
          superficie: env.superficie || 0,
          altura: env.altura || 2.8,
          orientacion: env.orientacion || 'No indicada',
          tipoVidrio: env.tipo_vidrio || 'Simple',
          porcentajeVidrio: env.porcentaje_vidrio || 10,
          calefaccion: env.calefaccion !== undefined ? env.calefaccion : true,
          confianza: env.confianza || 'Media',
          motivo: env.motivo || ''
        }));
        setEnvironments(envs);
      }

      setStep(2);
    } catch (error) {
      console.error("Error analizando plano:", error);
      alert("Hubo un error al analizar los planos: " + error.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const convertToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', height: '100%', paddingBottom: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Zap size={24} color="var(--primary-600)" /> Balance Térmico IA
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Sube un plano para extraer ambientes automáticamente y calcular el balance térmico preliminar.
          </p>
        </div>
      </div>

      {step === 1 && (
        <PlanUploader onUpload={handleFileUpload} isAnalyzing={isAnalyzing} />
      )}

      {step >= 2 && aiData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <AiAnalysisReview aiData={aiData} />
          
          <EnvironmentsEditor 
            environments={environments} 
            setEnvironments={setEnvironments}
          />
          
          {step === 2 && (
            <CalculationParameters 
              params={calcParams}
              setParams={setCalcParams}
            />
          )}

          {step === 2 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button 
                className="btn btn-primary" 
                onClick={() => setStep(3)}
                style={{ padding: '0.75rem 2rem', fontSize: '1rem', fontWeight: '500' }}
              >
                Generar Cómputo del Balance
              </button>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <FinalBalance 
          environments={environments} 
          params={calcParams} 
          onBack={() => setStep(2)}
        />
      )}
    </div>
  );
};

export default BalanceTermico;
