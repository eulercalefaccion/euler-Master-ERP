async function testSearchEngines(cuit) {
  const cleanCuit = cuit.replace(/\D/g, '');

  // 1. DuckDuckGo HTML (No JS required)
  try {
    const url = `https://html.duckduckgo.com/html/?q=${cleanCuit}+cuit`;
    console.log("Testing DDG HTML:", url);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-parse-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      body: `q=${cleanCuit}`
    });
    console.log("DDG Status:", res.status);
    if (res.ok) {
      const html = await res.text();
      console.log("DDG Length:", html.length);

      // Search for snippets
      const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const idx = text.indexOf(cleanCuit);
      if (idx !== -1) {
        console.log("DDG Snippet:\n", text.substring(Math.max(0, idx - 100), Math.min(text.length, idx + 400)));
      }
    }
  } catch (e) {
    console.log("DDG error:", e.message);
  }

  // 2. Bing Search HTML
  try {
    const url = `https://www.bing.com/search?q=cuit+${cleanCuit}`;
    console.log("\nTesting Bing:", url);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });
    console.log("Bing Status:", res.status);
    if (res.ok) {
      const html = await res.text();
      console.log("Bing Length:", html.length);
      const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const idx = text.indexOf(cleanCuit);
      if (idx !== -1) {
        console.log("Bing Snippet:\n", text.substring(Math.max(0, idx - 100), Math.min(text.length, idx + 400)));
      }
    }
  } catch (e) {
    console.log("Bing error:", e.message);
  }
}

testSearchEngines('27319516277');
testSearchEngines('30500010912');
