import fs from 'fs';
let css = fs.readFileSync('src/servicios_app/index.css', 'utf-8');

const rootMatch = css.match(/:root\s*{[^}]*}/);
if (rootMatch) {
    const rootBlock = rootMatch[0];
    let restOfCss = css.slice(rootMatch.index + rootBlock.length);
    restOfCss = restOfCss.replace(/body\s*{/, '& {');
    
    // Exact match for the keyframes block in index.css
    const keyframesBlock = `@keyframes spin {
  to { transform: rotate(360deg); }
}`;

    if (restOfCss.includes(keyframesBlock)) {
        restOfCss = restOfCss.replace(keyframesBlock, '');
    } else {
        console.warn("Could not find exact keyframes block");
    }
    
    const newCss = `${rootBlock}\n\n.servicios-app {\n${restOfCss}\n}\n\n${keyframesBlock}`;
    fs.writeFileSync('src/servicios_app/index.css', newCss);
    console.log("CSS scoped successfully!");
} else {
    console.log("Could not find :root block");
}
