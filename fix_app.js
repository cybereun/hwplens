const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf8');

// Remove DOM mappings
code = code.replace(/ctxOpenCode: document\.getElementById\('ctxOpenCode'\),/g, '');
code = code.replace(/ctxOpenNotepad: document\.getElementById\('ctxOpenNotepad'\),/g, '');

// Remove toggle disabled
code = code.replace(/els\.ctxOpenCode\.classList\.toggle\('disabled', !isFile\);/g, '');
code = code.replace(/els\.ctxOpenNotepad\.classList\.toggle\('disabled', !isFile\);/g, '');

// Remove event listeners block using a regex that matches until the next section
code = code.replace(/els\.ctxOpenCode\.addEventListener\('click', \(\) => \{[\s\S]*?\}\);/g, '');
code = code.replace(/els\.ctxOpenNotepad\.addEventListener\('click', \(\) => \{[\s\S]*?\}\);/g, '');

fs.writeFileSync('public/app.js', code, 'utf8');
