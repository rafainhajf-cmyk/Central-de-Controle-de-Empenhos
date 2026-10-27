'use strict';
const fs = require('node:fs');
fs.mkdirSync('public', { recursive: true });
for (const path of ['index.html', 'sheet-catalog.js', 'encrypted-cache.js', 'sync-state.js', 'operational-ui.js', 'operational-ui.css', 'program-ui.js']) fs.copyFileSync(path, 'public/' + path);
console.log('STATIC_BUILD_OK');
