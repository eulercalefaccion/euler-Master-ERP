async function extractNameFromBing(cuit) {
  const cleanCuit = cuit.replace(/\D/g, '');
  const url = `https://www.bing.com/search?q=cuit+${cleanCuit}&mkt=es-AR`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8'
      }
    });

    const html = await res.text();

    // Match titles like: "BANCO DE LA NACION ARGENTINA - Cuit Online" or "ALVAREZ CINDEA LEONORA ..."
    const titleRegex = /<h2[^>]*><a[^>]*>(.*?)<\/a><\/h2>/gi;
    let match;
    let extractedName = '';

    while ((match = titleRegex.exec(html)) !== null) {
      let rawTitle = match[1].replace(/<[^>]+>/g, '').trim();

      // Clean up common suffix patterns
      rawTitle = rawTitle.replace(/\s*[-–—|]\s*(Cuit Online|AFIP|DATOK|Trade Nosis|Perfil|Buscador de CUIT|Argentina|CUIL).*$/gi, '');
      rawTitle = rawTitle.replace(/^Buscador de CUIT\s*[-–—|]\s*/gi, '');
      rawTitle = rawTitle.replace(/CUIT\s*\d{2}-?\d{8}-?\d/gi, '');

      rawTitle = rawTitle.trim();

      if (rawTitle && rawTitle.length >= 3 && !rawTitle.toLowerCase().includes('constancia') && !rawTitle.toLowerCase().includes('buscar') && !rawTitle.toLowerCase().includes('arca') && !rawTitle.toLowerCase().includes('afip')) {
        extractedName = rawTitle;
        break;
      }
    }

    console.log(`[BING EXTRACTOR] CUIT ${cleanCuit} => "${extractedName.toUpperCase()}"`);
  } catch (e) {
    console.error("Error Bing:", e.message);
  }
}

async function main() {
  await extractNameFromBing('27319516277');
  await extractNameFromBing('30500010912');
  await extractNameFromBing('20300000007');
}

main();
