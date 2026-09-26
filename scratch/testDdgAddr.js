async function test() {
  const cuits = ['27319516277', '30500010912'];
  for (const cuit of cuits) {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=cuit+${cuit}+cuitonline`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0' }
    });
    const t = await res.text();
    
    console.log(`\n=== CUIT ${cuit} ===`);
    
    // Extract ALL snippets
    const snippetRegex = /class=["']result__snippet["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    let address = '';
    let localidad = '';
    
    while ((match = snippetRegex.exec(t)) !== null) {
      const clean = match[1].replace(/<[^>]+>/g, '').trim();
      
      // Try to extract address from snippet
      const addrMatch = clean.match(/Persona\s+(?:F[ií]sica|Jur[ií]dica)(?:\s*\([^)]*\))?\s+(.+?)\s+Localidad:/i);
      if (addrMatch && addrMatch[1] && !address) {
        address = addrMatch[1].trim();
      }
      
      const locMatch = clean.match(/Localidad:\s*([A-Za-záéíóúñÁÉÍÓÚÑ ]+?)(?:\s+(?:Ganancias|Fecha|IVA|No Inscripto)|$)/i);
      if (locMatch && locMatch[1] && !localidad) {
        localidad = locMatch[1].trim();
      }
    }
    
    console.log('  Address:', address || 'NONE');
    console.log('  Localidad:', localidad || 'NONE');
  }
}
test();
