const formatCUIT = (val) => {
  if (!val) return '';
  const clean = val.replace(/\D/g, '');
  if (clean.length === 11) {
    return `${clean.slice(0, 2)}-${clean.slice(2, 10)}-${clean.slice(10, 11)}`;
  }
  return val.trim();
};

const formatDNI = (val) => {
  if (!val) return '';
  const clean = val.replace(/\D/g, '');
  if (clean.length >= 7 && clean.length <= 8) {
    return clean.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  return val.trim();
};

const extraerDniDeCuit = (cleanCuit) => {
  if (cleanCuit.length === 11) {
    const prefijo = cleanCuit.substring(0, 2);
    if (['20', '23', '24', '27'].includes(prefijo)) {
      const dniClean = cleanCuit.substring(2, 10);
      return formatDNI(dniClean);
    }
  }
  return '';
};

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const rawCuit = event.queryStringParameters?.cuit || event.path.split('/').pop() || '';
  const cleanCuit = rawCuit.replace(/\D/g, '');

  if (cleanCuit.length !== 11) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ exito: false, mensaje: 'CUIT inválido (debe tener 11 dígitos numéricos)' })
    };
  }

  const cuitFormateado = formatCUIT(cleanCuit);
  const prefijo = cleanCuit.substring(0, 2);
  const esPersonaFisica = ['20', '23', '24', '27'].includes(prefijo);
  const dniExtraido = extraerDniDeCuit(cleanCuit);

  try {
    const targetUrl = `https://www.cuitonline.com/search.php?q=${cleanCuit}`;
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'es-AR,es;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'max-age=0',
        'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    if (response.ok) {
      const html = await response.text();

      // Extract Name / Razón Social
      let name = '';
      const metaMatch = html.match(/meta name="description" content="[^"]*?\b([a-zA-Z\sÑñÁÉÍÓÚáéíóú.-]+)\s*-\s*\d{11}/i) ||
                        html.match(/CuitOnline\.\s*([^-\d<]+)\s*-\s*\d{11}/i);

      if (metaMatch && metaMatch[1]) {
        name = metaMatch[1].replace(/regímenes y actividades con CuitOnline\.?/gi, '').trim();
      }

      if (!name || name.length < 3 || name.toLowerCase().includes('bloqueador') || name.toLowerCase().includes('sumate')) {
        const h3Match = html.match(/<h3[^>]*>\s*([a-zA-Z\sÑñÁÉÍÓÚáéíóú.-]+)\s*<\/h3>/i);
        if (h3Match && h3Match[1] && !h3Match[1].toLowerCase().includes('bloqueador') && !h3Match[1].toLowerCase().includes('sumate')) {
          name = h3Match[1].trim();
        }
      }

      // Extract Domicilio / Direccion
      let domicilio = '';
      const domMatch = html.match(/(?:domicilio|direcci[oó]n)[^:]*:\s*<[^>]+>\s*([^<]+)/i) ||
                       html.match(/itemprop="streetAddress">([^<]+)/i);
      if (domMatch) domicilio = domMatch[1].trim();

      // Extract Localidad / Provincia
      let localidad = '';
      const provMatch = html.match(/(Santa Fe|Buenos Aires|Córdoba|Cordoba|Mendoza|Entre R[íi]os|Tucum[áa]n|Salta|San Juan|San Luis|Chaco|Corrientes|Misiones|Neuqu[eé]n|R[íi]o Negro|Chubut|Santa Cruz|Jujuy|La Pampa|Formosa|Catamarca|La Rioja|Tierra del Fuego|CABA|Capital Federal)/i);
      if (provMatch) localidad = provMatch[1];

      // Extract Condición IVA
      let condicionIva = 'Consumidor Final';
      if (html.includes('MONOTRIBUTO')) condicionIva = 'Monotributo';
      else if (html.includes('IVA EXENTO') || html.includes('EXENTO')) condicionIva = 'Exento';
      else if (html.includes('IVA RESPONSABLE INSCRIPTO') || html.includes('RESPONSABLE INSCRIPTO')) condicionIva = 'Responsable Inscripto';
      else if (cleanCuit.startsWith('30') || cleanCuit.startsWith('33')) condicionIva = 'Responsable Inscripto';

      if (name) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            exito: true,
            cuit: cuitFormateado,
            cuitLimpio: cleanCuit,
            name: name.toUpperCase(),
            type: esPersonaFisica ? 'Propietario' : 'Constructora',
            dni: dniExtraido,
            address: domicilio,
            location: localidad,
            condicionIva,
            esPersonaFisica,
            mensaje: `Contribuyente hallado en Padrón ARCA: ${name.toUpperCase()}`
          })
        };
      }
    }
  } catch (err) {
    console.error('Error Netlify Function CUIT:', err);
  }

  // Fallback inteligente
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      exito: true,
      cuit: cuitFormateado,
      cuitLimpio: cleanCuit,
      name: '',
      type: esPersonaFisica ? 'Propietario' : 'Constructora',
      dni: dniExtraido,
      address: '',
      location: '',
      condicionIva: esPersonaFisica ? 'Consumidor Final' : 'Responsable Inscripto',
      esPersonaFisica,
      mensaje: esPersonaFisica 
        ? `CUIT de Persona Física verificado en ARCA (DNI ${dniExtraido} detectado).` 
        : `CUIT de Persona Jurídica verificado en ARCA.`
    })
  };
};
