'use strict';
module.exports=v=>!String(v[1]||'').trim()?null:v[9]?'process|'+String(v[9]):'process|legacy:'+require('node:crypto').createHash('sha256').update(JSON.stringify([v[1],v[2],v[3],v[6]])).digest('hex');

module.exports.version=v=>require('node:crypto').createHash('sha256').update(JSON.stringify(v)).digest('hex');
