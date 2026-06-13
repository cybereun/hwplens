const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf8');

// Remove ctxShare toggle disabled
code = code.replace(/document\.getElementById\('ctxShare'\)\.classList\.add\('disabled'\);/g, '');

fs.writeFileSync('public/app.js', code, 'utf8');
