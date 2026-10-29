'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CentralFinancialClient=factory();})(globalThis,()=>{
 function create({transport,persist=async()=>{},now=()=>Date.now()}){
  let pending=null,busy=false,lastNotFoundAt=null,warning='';
  const copy=x=>x===null?null:JSON.parse(JSON.stringify(x));
  async function clear(){pending=null;lastNotFoundAt=null;try{await persist(null);}catch{warning='Operação confirmada no servidor. Não foi possível limpar a cópia local; consulte a confirmação ao recuperá-la.';}}
  async function send(){
   try{const result=await transport('POST',copy(pending.command));if(result.state!=='confirmed')throw Error('Resposta sem confirmação. Consulte o resultado antes de repetir.');await clear();return result;}
   catch(e){if(e.definitive){pending=null;lastNotFoundAt=null;try{await persist(null);}catch{warning='Comando recusado. A cópia local deve ser conferida antes de ser recuperada.';}}throw e;}
  }
  return {
   pending:()=>copy(pending),busy:()=>busy,warning:()=>warning,
   async submit(command){if(busy||pending)throw Error('Consulte o comando pendente antes de enviar outro.');busy=true;try{const next={app:'central-financial-v1',command:copy(command),submittedAt:now()};await persist(copy(next));pending=next;lastNotFoundAt=null;return await send();}finally{busy=false;}},
   async confirm(){if(busy||!pending)throw Error('Nenhum comando pendente disponível.');busy=true;try{const result=await transport('GET',{operationId:pending.command.operationId});if(result.state==='confirmed')await clear();else if(result.state==='not-found-yet')lastNotFoundAt=now();else throw Error('Resposta de confirmação inválida.');return result;}finally{busy=false;}},
   async retry(){if(busy||!pending||lastNotFoundAt===null||now()-lastNotFoundAt>30000||now()-pending.submittedAt<300000)throw Error('Consulte novamente o resultado e aguarde cinco minutos desde o envio antes de repetir.');busy=true;lastNotFoundAt=null;try{return await send();}finally{busy=false;}},
   restore(value){if(busy||pending)throw Error('Já existe um comando pendente.');if(value?.app!=='central-financial-v1'||!value.command||typeof value.command.operationId!=='string'||typeof value.command.key!=='string'||!Number.isFinite(value.submittedAt)||value.submittedAt>now())throw Error('Cópia de comando inválida.');pending=copy(value);lastNotFoundAt=null;}
  };
 }
 return {create};
});
