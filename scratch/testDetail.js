async function testDetail() {
  const cuits = ['27319516277', '30500010912'];

  for (const cuit of cuits) {
    const searchRes = await fetch(`https://www.cuitonline.com/search.php?q=${cuit}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0'
      }
    });
    const searchHtml = await searchRes.text();

    const detailPathMatch = searchHtml.match(/href=["'](detalle\/\d+\/[^"']+\.html)["']/i);
    if (detailPathMatch) {
      const detailUrl = `https://www.cuitonline.com/${detailPathMatch[1]}`;
      console.log('\nDetail URL:', detailUrl);

      const detailRes = await fetch(detailUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0'
        }
      });
      const detailHtml = await detailRes.text();
      console.log('Detail HTML length:', detailHtml.length);

      // Extract Domicilio / Direccion
      const domMatch = detailHtml.match(/(?:domicilio|direcci[oó]n)[^:]*:\s*<[^>]+>\s*([^<]+)/i) ||
                       detailHtml.match(/itemprop=["']streetAddress["'][^>]*>([^<]+)/i) ||
                       detailHtml.match(/domicilio[^<]*<[^>]+>\s*([^<]+)/i);
      console.log('Domicilio match:', domMatch ? domMatch[1].trim() : 'NONE');

      // Extract Localidad / Provincia
      const provMatch = detailHtml.match(/(Santa Fe|Buenos Aires|Córdoba|Cordoba|Mendoza|Entre R[íi]os|Tucum[áa]n|Salta|San Juan|San Luis|Chaco|Corrientes|Misiones|Neuqu[eé]n|R[íi]o Negro|Chubut|Santa Cruz|Jujuy|La Pampa|Formosa|Catamarca|La Rioja|Tierra del Fuego|CABA|Capital Federal)/i);
      console.log('Provincia/Localidad match:', provMatch ? provMatch[1] : 'NONE');

      // Extract Condicion IVA / Monotributo
      let condicionIva = 'Consumidor Final';
      if (detailHtml.includes('MONOTRIBUTO')) condicionIva = 'Monotributo';
      else if (detailHtml.includes('IVA EXENTO') || detailHtml.includes('EXENTO')) condicionIva = 'Exento';
      else if (detailHtml.includes('IVA RESPONSABLE INSCRIPTO') || detailHtml.includes('RESPONSABLE INSCRIPTO')) condicionIva = 'Responsable Inscripto';
      else if (cuit.startsWith('30') || cuit.startsWith('33')) condicionIva = 'Responsable Inscripto';
      console.log('Condicion IVA:', condicionIva);
    }
  }
}

testDetail();
