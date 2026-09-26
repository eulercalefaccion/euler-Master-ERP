async function testParse() {
  const cuit = '27319516277';
  const res = await fetch(`https://www.cuitonline.com/search.php?q=${cuit}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0'
    }
  });
  const html = await res.text();
  console.log('--- HTML TITLE & META ---');
  const title = html.match(/<title>([^<]+)<\/title>/i);
  console.log('Title:', title ? title[1] : 'NONE');

  const meta = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
  console.log('Meta desc:', meta ? meta[1] : 'NONE');

  const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  console.log('H1:', h1 ? h1[1] : 'NONE');

  const h2 = html.match(/<h2[^>]*>([^<]+)<\/h2>/i);
  console.log('H2:', h2 ? h2[1] : 'NONE');

  const h3 = html.match(/<h3[^>]*>([^<]+)<\/h3>/i);
  console.log('H3:', h3 ? h3[1] : 'NONE');

  const personaSpan = html.match(/class=["']persona-nombre["'][^>]*>([^<]+)/i) || html.match(/itemprop=["']name["'][^>]*>([^<]+)/i);
  console.log('Persona span/itemprop:', personaSpan ? personaSpan[1] : 'NONE');
}

testParse();
