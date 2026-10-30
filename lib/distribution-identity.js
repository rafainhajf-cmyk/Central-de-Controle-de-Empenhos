'use strict';
const crypto=require('node:crypto');
const {value}=require('./operational-store'),{stable}=require('./budget/primitives');
const hash=v=>crypto.createHash('sha256').update(stable(v)).digest('hex');
function sourceVersion(v){return hash([0,1,2,3,4,5,10].map(i=>v[i]??''));}
function keyFor(v){if(!v[1])return null;return v[11]?'distribution|'+String(v[11]):'distribution|legacy:'+sourceVersion(v);}
function identities(table=[]){const rows=table.map(cells=>(cells||[]).map(value)),keys=rows.map((v,i)=>i?keyFor(v):null),counts=new Map();for(const k of keys)if(k)counts.set(k,(counts.get(k)||0)+1);return keys.map(k=>k&&counts.get(k)===1?k:null);}
module.exports={sourceVersion,keyFor,identities};
