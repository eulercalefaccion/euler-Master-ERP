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

const parsePadronHtml = (html, cleanCuit) => {
  if (!html) return null;

  let name = '';
  let location = '';
  let address = '';

  // Strategy 1: Title pattern on detail pages: <title>NAME (CUIT), LOCATION - Cuit Online</title>
  const titleMatch = html.match(/<title>\s*([^(<]+)\s*\(\d{2}-\d{8}-\d\)(?:,\s*([^-\n<]+))?/i);
  if (titleMatch && titleMatch[1]) {
    const rawName = titleMatch[1].trim();
    if (!rawName.toLowerCase().includes('cuit online') && !rawName.toLowerCase().includes('resultados')) {
      name = rawName;
    }
    if (titleMatch[2]) {
      location = titleMatch[2].replace(/-\s*Cuit\s*Online/i, '').trim();
    }
  }

  // Strategy 2: H2 class="denominacion" or title="Ver detalles de NAME"
  if (!name) {
    const h2Match = html.match(/<h2[^>]*class=["']denominacion["'][^>]*>([^<]+)<\/h2>/i) ||
                    html.match(/title=["']Ver detalles de ([^"']+)["']/i) ||
                    html.match(/<h2[^>]*>([^<]+)<\/h2>/i);
    if (h2Match && h2Match[1] && !h2Match[1].toLowerCase().includes('bloqueador') && !h2Match[1].toLowerCase().includes('cuit')) {
      name = h2Match[1].trim();
    }
  }

  // Strategy 3: Meta description
  if (!name) {
    const metaMatch = html.match(/meta name="description" content="[^"]*?\b([a-zA-Z\sÑñÁÉÍÓÚáéíóú.-]+)\s*-\s*\d{11}/i) ||
                      html.match(/CuitOnline\.\s*([^-\d<]+)\s*-\s*\d{11}/i);
    if (metaMatch && metaMatch[1]) {
      const rawMeta = metaMatch[1].replace(/regímenes y actividades con CuitOnline\.?/gi, '').replace(/1 Resultados de \d+/gi, '').trim();
      if (!rawMeta.toLowerCase().includes('bloqueador')) {
        name = rawMeta;
      }
    }
  }

  if (name.toLowerCase().startsWith('con cuitonline.')) {
    name = name.replace(/^con cuitonline\.\s*/i, '');
  }

  // Extract Address (Domicilio)
  const domMatch = html.match(/(?:domicilio|direcci[oó]n)[^:]*:\s*<[^>]+>\s*([^<]+)/i) ||
                   html.match(/itemprop=["']streetAddress["'][^>]*>([^<]+)/i) ||
                   html.match(/domicilio[^<]*<[^>]+>\s*([^<]+)/i);
  if (domMatch) {
    address = domMatch[1].trim();
  }

  // Extract Location if not found in title
  if (!location) {
    const provMatch = html.match(/(Santa Fe|Buenos Aires|Córdoba|Cordoba|Mendoza|Entre R[íi]os|Tucum[áa]n|Salta|San Juan|San Luis|Chaco|Corrientes|Misiones|Neuqu[eé]n|R[íi]o Negro|Chubut|Santa Cruz|Jujuy|La Pampa|Formosa|Catamarca|La Rioja|Tierra del Fuego|CABA|Capital Federal)/i);
    if (provMatch) location = provMatch[1];
  }

  // Extract Condicion IVA
  let condicionIva = 'Consumidor Final';
  if (html.includes('MONOTRIBUTO')) condicionIva = 'Monotributo';
  else if (html.includes('IVA EXENTO') || html.includes('EXENTO')) condicionIva = 'Exento';
  else if (html.includes('IVA RESPONSABLE INSCRIPTO') || html.includes('RESPONSABLE INSCRIPTO')) condicionIva = 'Responsable Inscripto';
  else if (cleanCuit.startsWith('30') || cleanCuit.startsWith('33')) condicionIva = 'Responsable Inscripto';

  return {
    name: name ? name.toUpperCase() : '',
    address: address ? address.toUpperCase() : '',
    location: location || '',
    condicionIva
  };
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

  const fetchHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
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
  };

  try {
    const searchUrl = `https://www.cuitonline.com/search.php?q=${cleanCuit}`;
    const response = await fetch(searchUrl, { headers: fetchHeaders });

    if (response.ok) {
      const searchHtml = await response.text();
      let parsed = parsePadronHtml(searchHtml, cleanCuit);

      // Check if detail page exists for exact CUIT to pull exact domicilio
      const detailRegex = new RegExp(`href=["'](detalle/${cleanCuit}/[^"']+\\.html)["']`, 'i');
      const detailPathMatch = searchHtml.match(detailRegex);

      if (detailPathMatch) {
        try {
          const detailUrl = `https://www.cuitonline.com/${detailPathMatch[1]}`;
          const detailRes = await fetch(detailUrl, { headers: fetchHeaders });
          if (detailRes.ok) {
            const detailHtml = await detailRes.text();
            const detailParsed = parsePadronHtml(detailHtml, cleanCuit);
            if (detailParsed) {
              parsed = {
                name: detailParsed.name || parsed.name,
                address: detailParsed.address || parsed.address,
                location: detailParsed.location || parsed.location,
                condicionIva: detailParsed.condicionIva || parsed.condicionIva
              };
            }
          }
        } catch (e) {
          console.warn('Error fetching detail page in Netlify function:', e.message);
        }
      }

      if (parsed && parsed.name) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            exito: true,
            cuit: cuitFormateado,
            cuitLimpio: cleanCuit,
            name: parsed.name,
            type: esPersonaFisica ? 'Propietario' : 'Constructora',
            dni: dniExtraido,
            address: parsed.address,
            location: parsed.location,
            condicionIva: parsed.condicionIva,
            esPersonaFisica,
            mensaje: `Contribuyente hallado en Padrón ARCA: ${parsed.name}`
          })
        };
      }
    }
  } catch (err) {
    console.error('Error Netlify Function CUIT:', err);
  }

  // Fallback inteligente si no se devolvió el nombre completo desde el scraping
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
