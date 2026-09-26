async function testTitleParserBanco() {
  const detailUrl = 'https://www.cuitonline.com/detalle/30500010912/banco-de-la-nacion-argentina.html';
  const res = await fetch(detailUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36'
    }
  });
  const html = await res.text();

  const titleMatch = html.match(/<title>\s*([^(<]+)\s*\(\d{2}-\d{8}-\d\)(?:,\s*([^-\n<]+))?/i);
  if (titleMatch) {
    console.log('Parsed Name:', titleMatch[1].trim());
    console.log('Parsed Location/Prov:', titleMatch[2] ? titleMatch[2].trim() : 'NONE');
  }

  const domMatch = html.match(/(?:domicilio|direcci[oó]n)[^:]*:\s*<[^>]+>\s*([^<]+)/i) ||
                   html.match(/itemprop=["']streetAddress["'][^>]*>([^<]+)/i) ||
                   html.match(/domicilio[^<]*<[^>]+>\s*([^<]+)/i);
  console.log('Parsed Address:', domMatch ? domMatch[1].trim() : 'NONE');
}

testTitleParserBanco();
