const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Anthropic = require('@anthropic-ai/sdk');

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

// Endpoint para analizar planos de Balance Térmico usando Claude 3.5 Sonnet
exports.analyzeFloorPlan = functions.runWith({
  timeoutSeconds: 300,
  memory: '1GB'
}).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'El usuario debe estar autenticado.'
    );
  }

  const { fileBase64, mediaType } = data;
  if (!fileBase64) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Se requiere fileBase64.'
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY no está configurada.');
    throw new functions.https.HttpsError(
      'internal',
      'La API Key de Anthropic no está configurada.'
    );
  }

  try {
    const anthropic = new Anthropic({ apiKey });

    // Determinar si es PDF o imagen
    let content = [];
    if (mediaType === 'application/pdf') {
      content.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: fileBase64,
        }
      });
    } else {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType, // ej: image/jpeg, image/png, image/webp
          data: fileBase64,
        }
      });
    }

    content.push({
      type: 'text',
      text: `Analiza este plano de arquitectura para realizar un balance térmico.
El objetivo es extraer los ambientes, sus dimensiones (superficie), altura de cielorraso y porcentaje de vidrio estimado para aberturas al exterior.

Reglas importantes:
1. Extrae todos los locales/ambientes (ej. Cocina, Comedor, Living, Dormitorio, Baño, etc.).
2. Si un local no tiene el texto escrito, INFIERE qué tipo de local es mirando los muebles sanitarios o de cocina y dale un nombre apropiado.
3. Si la altura del cielorraso no está anotada en el plano, ASUME SIEMPRE 2.80 metros (esto es muy importante).
4. El porcentaje de vidrio debe ser estimado de acuerdo a la proporción de ventana sobre muro exterior.
5. Si encuentras detalles del tipo de vidrio (simple/DVH) o muros (ladrillo hueco, etc), anótalos.

Tu respuesta DEBE ser ÚNICAMENTE un JSON válido sin markdown ni texto extra. La estructura debe ser exactamente así:

{
  "resumen": "Resumen del caso (tipo de vivienda, etc.)",
  "observaciones": "Observaciones para el asesor (ej. se requiere validación de medidas)",
  "datos_no_detectados": [
    { "dato": "Localidad", "importancia": "Alto", "comentario": "Falta información para zona IRAM." }
  ],
  "preguntas": ["¿Pregunta 1?", "¿Pregunta 2?"],
  "riesgos": ["Riesgo 1", "Riesgo 2"],
  "ambientes": [
    {
      "nombre": "Living",
      "superficie": 18.0,
      "altura": 3.25,
      "porcentaje_vidrio": 25,
      "tipo_vidrio": "Simple",
      "calefaccion": true,
      "orientacion": "No indicada",
      "confianza": "Media",
      "motivo": "Superficie estimada por cotas..."
    }
  ]
}`
    });

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      temperature: 0.2,
      messages: [
        {
          role: 'user',
          content: content
        }
      ]
    });

    let textResponse = msg.content[0].text;
    
    // Limpiar si vino con markdown (```json ... ```)
    textResponse = textResponse.replace(/^```json/m, '').replace(/```$/m, '').trim();
    
    const parsedData = JSON.parse(textResponse);
    return { data: parsedData };
  } catch (error) {
    console.error('Error al llamar a Anthropic API:', error);
    throw new functions.https.HttpsError(
      'internal',
      error.message || 'Error procesando el plano con IA.'
    );
  }
});
