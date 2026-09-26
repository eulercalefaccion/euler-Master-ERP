async function test() {
  const res = await fetch('https://html.duckduckgo.com/html/?q=ALVAREZ+CINDEA+LEONORA+27319516277+domicilio', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const t = await res.text();
  
  // Extract all snippets
  const snippetRegex = /class=["']result__snippet["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  let i = 0;
  while ((match = snippetRegex.exec(t)) !== null) {
    i++;
    const clean = match[1].replace(/<[^>]+>/g, '').trim();
    console.log(`Snippet ${i}: ${clean.substring(0, 300)}`);
    console.log('---');
  }
  
  // Also check for "pasaje bensuley" or any address pattern
  const lines = t.split('\n');
  lines.forEach((l, idx) => {
    if (l.toLowerCase().includes('bensuley') || l.toLowerCase().includes('pasaje')) {
      console.log(`L${idx+1} (bensuley/pasaje): ${l.substring(0, 300)}`);
    }
  });
}
test();
