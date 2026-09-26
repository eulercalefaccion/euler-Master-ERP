async function testBanco() {
  const cuit = '30500010912';
  const res = await fetch(`https://www.cuitonline.com/search.php?q=${cuit}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0'
    }
  });
  const html = await res.text();
  
  const h2Match = html.match(/<h2[^>]*class=["']denominacion["'][^>]*>([^<]+)<\/h2>/i) ||
                  html.match(/title=["']Ver detalles de ([^"']+)["']/i) ||
                  html.match(/<h2[^>]*>([^<]+)<\/h2>/i);
  console.log('Banco H2 Match:', h2Match ? h2Match[1].trim() : 'NONE');
}

testBanco();
