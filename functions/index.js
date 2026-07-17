const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');

admin.initializeApp();

// Endpoint proxy to Gemini. Reemplaza el uso de API key en el cliente.
exports.askGemini = functions.https.onCall(async (data, context) => {
  // 1. Verificación de seguridad: solo usuarios autenticados.
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'El usuario debe estar autenticado para usar el asistente de IA.'
    );
  }

  const { prompt } = data;
  if (!prompt || typeof prompt !== 'string') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Se requiere un prompt válido.'
    );
  }

  // 2. Leer la API key del entorno del servidor.
  // IMPORTANTE: Debes configurar esta variable en Firebase usando:
  // firebase functions:secrets:set GEMINI_API_KEY
  // O como variable de entorno estándar en gen2. Para gen1 usamos process.env (si está en .env local)
  // o functions.config() si se usa la configuración antigua.
  // Aquí usamos process.env que es compatible si usamos Firebase secrets o variables de entorno en el panel.
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY no está configurada en el entorno del servidor.');
    throw new functions.https.HttpsError(
      'internal',
      'El servicio de IA no está configurado correctamente en el servidor.'
    );
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return { response: text };
  } catch (error) {
    console.error('Error al llamar a Gemini API:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Hubo un problema al procesar la solicitud con la IA.'
    );
  }
});
