async function lookupCuitWithGemini(cuit, apiKey) {
  const cleanCuit = cuit.replace(/\D/g, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const prompt = `
Eres un asistente experto en el Padrón de Contribuyentes de ARCA (ex AFIP) de Argentina.
Identifica la Razón Social oficial o Nombre Completo, Domicilio Fiscal, Localidad, Provincia y Condición Iva registrados para el CUIT ${cleanCuit}.

Responde ÚNICAMENTE en formato JSON estricto con la siguiente estructura:
{
  "cuit": "${cleanCuit}",
  "razonSocial": "NOMBRE COMPLETO O RAZON SOCIAL EN MAYUSCULAS",
  "domicilio": "Calle y Número si aplica, o vacio",
  "localidad": "Ciudad / Localidad",
  "provincia": "Provincia",
  "condicionIva": "Responsable Inscripto" | "Monotributo" | "Exento" | "Consumidor Final"
}
`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    const data = await res.json();
    console.log("Gemini REST Response Status:", res.status);
    console.log("Gemini Output:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Gemini Error:", err);
  }
}

const testKey = process.env.VITE_FIREBASE_API_KEY || "AIzaSyAUeB2_H8e5LpW8K0aDYcygfuY__SnN8mE";
lookupCuitWithGemini("27319516277", testKey);
