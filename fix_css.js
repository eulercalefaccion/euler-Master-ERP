import fs from 'fs';

const lines = fs.readFileSync('src/servicios_app/index.css', 'utf-8').split('\n');

let rootBlock = [];
let keyframesBlocks = [];
let otherLines = [];

let inRoot = false;
let inKeyframes = false;
let braceCount = 0;
let currentBlock = [];

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (!inRoot && !inKeyframes) {
        if (line.includes(':root {')) {
            inRoot = true;
            braceCount = 1;
            currentBlock.push(line);
        } else if (line.includes('@keyframes')) {
            inKeyframes = true;
            braceCount = 1;
            currentBlock.push(line);
        } else {
            // Replace body with & to apply to the wrapper
            if (line.trim() === 'body {') {
                otherLines.push('& {');
            } else {
                otherLines.push(line);
            }
        }
    } else {
        currentBlock.push(line);
        
        // Count braces
        const openBraces = (line.match(/{/g) || []).length;
        const closeBraces = (line.match(/}/g) || []).length;
        braceCount += openBraces - closeBraces;
        
        if (braceCount === 0) {
            if (inRoot) {
                rootBlock = [...currentBlock];
                inRoot = false;
            } else if (inKeyframes) {
                keyframesBlocks = [...keyframesBlocks, ...currentBlock, '\n'];
                inKeyframes = false;
            }
            currentBlock = [];
        }
    }
}

const newCss = `${rootBlock.join('\n')}\n\n.servicios-app {\n${otherLines.join('\n')}\n}\n\n${keyframesBlocks.join('\n')}`;

fs.writeFileSync('src/servicios_app/index.css', newCss);
console.log('CSS processed perfectly!');
