import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.VITE_FIREBASE_API_KEY;

async function testGeminiCuit(cuit) {
  if (!GEMINI_API_KEY) {
    console.log('No GEMINI_API_KEY available in process.env');
    return;
  }
  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
Eres una base de datos y validador del Padrón de ARCA (ex AFIP) de Argentina.
Consulta el CUIT ${cuit} y devuelve en formato JSON estricto:

{
  "cuit": "${cuit}",
  "razonSocial": "Razón social o Nombre completo exacto registrado en ARCA",
  "tipoPersona": "JURIDICA" | "FISICA",
  "condicionIva": "Responsable Inscripto" | "Monotributo" | "Exento" | "Consumidor Final",
  "direccion": "Domicilio fiscal registrado o ciudad principal",
  "localidad": "Localidad o Ciudad",
  "provincia": "Provincia"
}

Responde ÚNICAMENTE con el JSON válido.
`;

    const result = await model.generateContent(prompt);
    console.log("Gemini Response:\n", result.response.text());
  } catch (err) {
    console.error("Gemini Error:", err.message);
  }
}

testGeminiCuit("30-50001091-2");
