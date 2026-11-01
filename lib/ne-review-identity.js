'use strict';
// Missing financial identity must not prevent assigning the responsible sector.
// Keep this administrative key independent of source ordering and later references.
module.exports=v=>/^20\d{2}NE\d{6}$/.test(String(v[0]))?'ne-review|'+require('node:crypto').createHash('sha256').update(JSON.stringify(v.slice(0,4))).digest('hex'):null;
