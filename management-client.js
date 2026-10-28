(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory();else root.ManagementClient=factory();})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
 const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
 function validateView(view){if(!view||typeof view.setupRequired!=='boolean'||!['records','sourceRecords','legacyCandidates','conflicts','movements','reconciliations'].every(k=>Array.isArray(view[k]))||typeof view.sourceDate!=='string'||typeof view.readAt!=='string')throw Error('Consulta de gestão incompleta; dados anteriores preservados.');return view;}
 function create({transport=(path,options)=>fetch(path,options),getToken=()=>'',onChange=()=>{},persistDraft=async()=>{},now=()=>Date.now()}={}){
  let view=null,pending=null,draft={},lastResult=null,busy=false,cacheWarning='',error='',dirty=false,restoreDisabled=false;
  const state=()=>clone({view,pending,draft,lastResult,busy,cacheWarning,error});
  function notify(){try{onChange(state());}catch{/* A render failure cannot erase a confirmed server result. */}}
  async function persist(flush){return persistDraft({flush});}
  async function request(path,options={}){
   const token=getToken();if(!token)throw Error('Primeiro sincronize a Central e informe a chave.');
   const response=await transport(path,{...options,method:options.method||'GET',headers:{Authorization:'Bearer '+token,...(options.method==='POST'?{'Content-Type':'application/json'}:{})},cache:'no-store'});
   let data;try{data=await response.json();}catch{throw Error('Resposta de gestão não pôde ser confirmada.');}
   if(!response.ok){const e=Error(data.error||'Falha na consulta de gestão');e.status=response.status;e.code=data.code;throw e;}return data;
  }
  function applyView(value){validateView(value);view=clone(value);notify();return clone(view);}
  async function load({commit=true}={}){const next=validateView(await request('/api/gestao'));return commit?applyView(next):clone(next);}
  async function accepted(result){
   if(!['confirmed','confirmed-with-conflict'].includes(result?.state)||!pending||result.operationId!==pending.command.operationId)throw Error('A gravação ainda não foi confirmada.');
   lastResult=clone(result);pending=null;error='';
   try{await persist(true);}catch{cacheWarning='Gravação confirmada. Não foi possível atualizar a cópia local; confira a Central antes de fechar.';}
   notify();return clone(lastResult);
  }
  async function send(){
   const current=pending;if(!current)throw Error('Nenhum envio pendente.');
   try{await persist(true);}catch(e){pending.state='not-sent';error='Cópia local não foi salva; nenhum comando foi enviado. Desative a cópia ou libere espaço e tente novamente.';notify();throw Error(error);}
   pending.state='sending';notify();
   try{return await accepted(await request('/api/gestao',{method:'POST',body:JSON.stringify(current.command)}));}
   catch(e){
    if(pending){if(e.status>=400&&e.status<500&&e.status!==429){pending=null;error=e.message;}else{pending.state='uncertain';error='Sem confirmação de gravação. Consulte o resultado antes de repetir. '+e.message;}}
    try{await persist(true);}catch{cacheWarning='Não foi possível guardar o resultado incerto. Mantenha a página aberta.';}
    notify();throw e;
   }
  }
  async function submit(command){
   if(busy)throw Error('Há uma operação em andamento.');if(pending)throw Error('Consulte a operação pendente antes de novo envio.');
   if(typeof command?.operationId!=='string'||!UUID.test(command.operationId))throw Error('Identificador de operação inválido.');
   if(!getToken())throw Error('Primeiro sincronize a Central e informe a chave.');
   busy=true;error='';cacheWarning='';pending={command:clone(command),startedAt:now(),state:'prepared',lastCheckedAt:null};notify();
   try{return await send();}finally{busy=false;notify();}
  }
  async function lookup(){
   if(!pending)throw Error('Nenhuma operação pendente.');
   const result=await request('/api/gestao?operationId='+encodeURIComponent(pending.command.operationId));
   if(result.operationId!==pending.command.operationId)throw Error('Identificador divergente na confirmação.');
   if(['confirmed','confirmed-with-conflict'].includes(result.state))return accepted(result);
   if(result.state!=='not-found-yet')throw Error('Resposta de confirmação inválida.');
   pending.lastCheckedAt=now();pending.state='uncertain';error='O registro ainda não foi localizado. Isso não confirma que o envio falhou.';
   try{await persist(true);}catch{cacheWarning='Cópia local indisponível; mantenha a página aberta.';}notify();return result;
  }
  async function confirmPending(){if(busy)throw Error('Há uma operação em andamento.');busy=true;notify();try{return await lookup();}finally{busy=false;notify();}}
  async function retryPending(){
   if(busy)throw Error('Há uma operação em andamento.');if(!pending)throw Error('Nenhuma operação pendente.');
   if(pending.state!=='not-sent'&&(pending.lastCheckedAt===null||now()-pending.startedAt<300000))throw Error('Consulte o resultado e aguarde cinco minutos antes de repetir manualmente.');
   busy=true;notify();try{if(pending.state!=='not-sent'){const checked=await lookup();if(checked.state!=='not-found-yet')return checked;}return await send();}finally{busy=false;notify();}
  }
  function serializeDraft(){return clone({version:1,pending,draft,lastResult});}
  function restoreDraft(saved){
   if(restoreDisabled||!saved||saved.version!==1)return;
   if(!pending&&saved.pending&&typeof saved.pending.command?.operationId==='string'&&UUID.test(saved.pending.command.operationId)&&Number.isFinite(saved.pending.startedAt))pending={command:clone(saved.pending.command),startedAt:saved.pending.startedAt,state:saved.pending.state==='not-sent'?'not-sent':'uncertain',lastCheckedAt:Number.isFinite(saved.pending.lastCheckedAt)?saved.pending.lastCheckedAt:null};
   if(!dirty&&saved.draft&&typeof saved.draft==='object'&&!Array.isArray(saved.draft))draft=clone(saved.draft);
   if(!lastResult&&saved.lastResult)lastResult=clone(saved.lastResult);notify();
  }
  function setDraft(value){draft=clone(value);dirty=true;notify();Promise.resolve(persist(false)).catch(()=>{cacheWarning='Não foi possível guardar o rascunho local.';notify();});}
  function forget(){restoreDisabled=true;notify();}
  return {load,applyView,submit,confirmPending,retryPending,serializeDraft,restoreDraft,setDraft,forget,getState:state};
 }
 return {create,validateView};
});
