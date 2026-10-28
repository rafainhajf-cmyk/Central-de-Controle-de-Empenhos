(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory();else root.DayClient=factory();})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const clone=v=>JSON.parse(JSON.stringify(v));
 function create({transport=(path,options)=>fetch(path,options),onChange=()=>{}}={}){
  let pending=null,busy=false,lastResult=null,checked=false;
  const state=()=>clone({pending,busy,lastResult,checked});const notify=()=>{try{onChange(state());}catch{}};
  async function request(path,body,extraHeaders){
   const r=await transport(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{...(body?{'Content-Type':'application/json','x-central-request':'1'}:{}),...extraHeaders},...(body?{body:JSON.stringify(body)}:{})});
   let data;try{data=await r.json();}catch{throw Error('Resposta não pôde ser confirmada.');}
   if(!r.ok){const e=Error(data.error||'Solicitação não confirmada.');Object.assign(e,{status:r.status,code:data.code});throw e;}return data;
  }
  function accept(r){if(r.state!=='confirmed'||r.operationId!==pending?.operationId)throw Error('Confirmação divergente.');lastResult=r;pending=null;checked=false;notify();return r;}
  async function send(){try{return accept(await request('/api/meu-dia',pending));}catch(e){if(e.status>=400&&e.status<500&&e.status!==429){pending=null;checked=false;}throw e;}}
  async function submit(command){if(busy||pending)throw Error('Consulte o envio pendente antes de continuar.');busy=true;pending=clone(command);checked=false;notify();try{return await send();}finally{busy=false;notify();}}
  async function lookup(){if(!pending||busy)throw Error('Nenhuma consulta disponível.');busy=true;notify();try{const r=await request('/api/meu-dia?operationId='+encodeURIComponent(pending.operationId));if(r.state==='confirmed')return accept(r);if(r.state!=='not-found-yet'||r.operationId!==pending.operationId)throw Error('Consulta divergente.');checked=true;return r;}finally{busy=false;notify();}}
  async function retry(){if(!pending||busy||!checked)throw Error('Consulte o resultado antes de repetir.');busy=true;notify();try{return await send();}finally{busy=false;notify();}}
  function clear(){pending=null;busy=false;lastResult=null;checked=false;notify();}
  return {request,submit,lookup,retry,clear,state};
 }
 return {create};
});
