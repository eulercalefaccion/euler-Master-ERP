async function inspectDetailPage() {
  const detailUrl = 'https://www.cuitonline.com/detalle/27319516277/alvarez-cindea-leonora.html';
  const res = await fetch(detailUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36'
    }
  });
  const html = await res.text();

  const title = html.match(/<title>([^<]+)<\/title>/i);
  console.log('Title:', title ? title[1] : '');

  const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  console.log('H1:', h1 ? h1[1] : '');

  const h2s = [...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/gi)].map(m => m[1]);
  console.log('H2s:', h2s);
}

inspectDetailPage();
