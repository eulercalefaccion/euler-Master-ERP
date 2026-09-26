async function inspectHtml() {
  const cuit = '27319516277';
  const res = await fetch(`https://www.cuitonline.com/search.php?q=${cuit}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0'
    }
  });
  const html = await res.text();

  // Search for 'alvarez' or links or divs
  const lines = html.split('\n');
  lines.forEach((line, idx) => {
    if (line.toLowerCase().includes('alvarez') || line.toLowerCase().includes('cindea') || line.toLowerCase().includes('27-31951627-7')) {
      console.log(`L${idx + 1}: ${line.trim()}`);
    }
  });
}

inspectHtml();
