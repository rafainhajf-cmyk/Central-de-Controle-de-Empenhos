'use strict';
globalThis.SyncState={
 async readAll(readPage,maxPages=10001){
  let headers=null,rows=[];
  for(let page=0;page<maxPages;page++){
   const d=await readPage(page);
   if(!d||!Array.isArray(d.headers)||!Array.isArray(d.rows)||!d.rows.every(Array.isArray)||typeof d.hasMore!=='boolean')throw Error('Resposta inválida; dados anteriores preservados.');
   if(headers&&JSON.stringify(headers)!==JSON.stringify(d.headers))throw Error('As colunas mudaram durante a consulta; sincronize novamente.');
   headers=d.headers;rows.push(...d.rows);
   if(!d.hasMore)return {headers,rows,updatedAt:new Date().toISOString(),origin:'Google Sheets'};
  }
  throw Error('Consulta incompleta; dados anteriores preservados.');
 }
};
