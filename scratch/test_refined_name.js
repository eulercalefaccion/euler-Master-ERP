async function testRefinedName(cuit) {
  const url = `https://www.cuitonline.com/search.php?q=${cuit}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();

  let name = '';
  const metaMatch = html.match(/CuitOnline\.\s*([^-\d<]+)\s*-\s*\d{11}/i) ||
                    html.match(/meta name="description" content="[^"]*?\b([a-zA-Z\sÑñÁÉÍÓÚáéíóú.-]+)\s*-\s*\d{11}/i);

  if (metaMatch && metaMatch[1]) {
    name = metaMatch[1].replace(/regímenes y actividades con CuitOnline\.?/gi, '').trim();
  }

  if (!name || name.length < 3) {
    const h3Match = html.match(/<h3[^>]*>\s*([a-zA-Z\sÑñÁÉÍÓÚáéíóú.-]+)\s*<\/h3>/i);
    if (h3Match && h3Match[1] && !h3Match[1].toLowerCase().includes('bloqueador')) {
      name = h3Match[1].trim();
    }
  }

  console.log(`CUIT ${cuit} => Name: "${name.toUpperCase()}"`);
}

testRefinedName('27319516277');
testRefinedName('30500010912');
