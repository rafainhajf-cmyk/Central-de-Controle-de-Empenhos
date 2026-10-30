(function(root,factory){
 'use strict';
 if(typeof module==='object'&&module.exports)module.exports=factory(require('node:crypto'));
 else root.ManagementSchema=factory(null);
})(typeof globalThis==='object'?globalThis:this,function(crypto){
 'use strict';
 const UGS=['160111','167111'];
 function fail(message,status=400,code='INVALID_MANAGEMENT_COMMAND'){const e=Error(message);e.status=status;e.code=code;throw e;}
 function plain(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));}
 function closed(value,allowed){if(!plain(value))fail('Objeto de cadastro inválido');for(const key of Object.keys(value))if(!allowed.includes(key)||['__proto__','constructor','prototype'].includes(key))fail('Campo não permitido: '+key);}
 const field=(name,label,type='text',extra={})=>({name,label,type,...extra});
 const text=(name,label,required=false)=>field(name,label,'text',{max:1200,required});
 const date=(name,label)=>field(name,label,'date');
 const long=(name,label)=>field(name,label,'textarea',{max:12000});
 const choice=(name,label,options)=>field(name,label,'select',{options});
 const identity=[field('ug','UG','select',{options:UGS,required:true}),field('year','Exercício','integer',{min:2000,max:2100,required:true}),field('number','Número da NE','ne',{required:true,max:12})];
 const ownership=[text('sector','Setor'),text('owner','Responsável')];
 const common=[text('reference','NC, NE, processo ou contrato'),...ownership,text('status','Situação'),long('observation','Observação integral')];
 const schemas={
  ne:[...identity,text('supplier','Fornecedor'),long('description','Descrição'),field('nd','Natureza da despesa','nd'),text('expenseType','Tipo de despesa'),...ownership,text('status','Situação do acompanhamento'),long('observation','Observação do acompanhamento'),field('holdingCredit','Segurando crédito','boolean'),date('notifiedOn','Notificado em'),text('administrativeProcess','Número do PA'),long('balanceDestination','Destino do saldo'),choice('serviceMode','Execução do serviço',['Única','Parcelada','Contínua']),date('servicePerformedOn','Serviço executado em'),date('invoiceCertifiedOn','NF atestada em'),date('holdingSince','Segurando crédito desde'),date('cancellationRequestedOn','Anulação pedida em'),date('contractEndsOn','Fim do contrato'),date('extendedUntil','Prorrogado até')],
  pending:[text('subject','O que falta resolver',true),...common,text('urgency','Urgência'),date('startedOn','Início'),date('dueOn','Prazo'),date('lastChargedOn','Última cobrança'),long('nextAction','Próximo passo'),date('completedOn','Concluído em')],
  activity:[text('subject','O que foi feito',true),date('activityOn','Data da atividade'),text('activityType','Tipo de providência'),...common,field('referenceCents','Valor de referência em centavos','cents'),long('nextAction','Próximo passo'),date('dueOn','Prazo')],
  process:[text('subject','Objeto',true),text('priority','Prioridade'),text('modality','Modalidade'),field('nd','Natureza da despesa','nd'),...ownership,date('startedOn','Lançamento'),date('budgetReadyOn','Orçamento pronto em'),text('proNumber','Número da PRO'),text('reference','Vínculo NC/NE'),text('linkedRecordId','Cadastro vinculado'),field('estimatedCents','Valor estimado em centavos','cents'),date('sentOn','Enviado ao sistema em'),date('dueOn','Prazo'),text('status','Situação'),text('resultingNE','NE gerada'),long('observation','Observação')],
  contract:[text('number','Número do contrato',true),field('year','Exercício','integer',{min:2000,max:2100,required:true}),text('supplier','Empresa'),long('subject','Objeto'),date('startsOn','Início da vigência'),date('endsOn','Fim da vigência'),text('owner','Fiscal titular'),text('substitute','Fiscal substituto'),text('sector','Setor'),long('nextAction','Providência'),date('lastChargedOn','Última cobrança'),date('extendedUntil','Prorrogado até'),text('status','Situação do acompanhamento'),date('closedOn','Encerramento confirmado em'),text('closureDocument','Documento de encerramento'),long('observation','Observação')],
  directory:[choice('category','Tipo',['sector','owner','status']),text('name','Nome',true),text('sector','Setor'),text('email','E-mail informado'),field('enabled','Disponível para novos usos','boolean'),long('observation','Observação')],
  goal:[text('name','Meta',true),date('startsOn','Início do período'),date('endsOn','Fim do período'),text('expenseType','Tipo de despesa'),text('sector','Setor'),field('ug','UG','select',{options:UGS}),choice('measure','Medida',['commitment','liquidation']),field('targetBasisPoints','Meta percentual (pontos-base)','integer',{min:0,max:10000}),field('targetCents','Meta em centavos','cents'),long('observation','Observação')],
  'distribution-followup':[text('distributionId','Distribuição vinculada',true),text('documentNumber','Número do DIEx'),date('deliveredOn','DIEx entregue em'),long('nextAction','Próximo passo'),long('observation','Observação')],
  'ne-reservation':[...identity,text('purpose','Finalidade',true),...ownership,field('amountCents','Reserva em centavos','cents',{min:1,required:true}),date('reservedOn','Data da reserva'),choice('status','Situação',['active','cancelled','completed']),long('observation','Observação')]
 };
 schemas.ne.push(field('subitem','Subitem','subitem'),text('serviceInspector','Fiscal do serviço'),date('assignedOn','NE passada ao responsável em'),date('sentToSupplierOn','Enviada ao fornecedor em'),date('deliveryDueOn','Prazo de entrega'),date('firstNotifiedOn','Primeira notificação em'),date('secondNotifiedOn','Segunda notificação em'),date('paOpenedOn','PA aberto em'));
 function schemaFor(kind){if(!Object.hasOwn(schemas,kind))fail('Tipo de cadastro inválido');return schemas[kind].map(f=>({...f,...(f.options?{options:[...f.options]}:{})}));}
 function validDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value&&+value.slice(0,4)>=2000&&+value.slice(0,4)<=2100;}
 function validateEntity(kind,input){
  const fields=schemaFor(kind);closed(input,fields.map(f=>f.name));const out={};
  for(const f of fields){
   const v=input[f.name];if(v===undefined){if(f.required)fail('Campo obrigatório: '+f.label);continue;}
   if(v===null||v===''){if(f.required)fail('Campo obrigatório: '+f.label);out[f.name]=v;continue;}
   if(f.type==='boolean'){if(typeof v!=='boolean')fail('Valor booleano inválido: '+f.label);}
   else if(['integer','cents'].includes(f.type)){if(!Number.isSafeInteger(v)||v<(f.min??0)||v>(f.max??Number.MAX_SAFE_INTEGER))fail('Valor inválido'+(f.type==='cents'?' em centavos':'')+': '+f.label);}
   else{
    if(typeof v!=='string')fail('Texto inválido: '+f.label);
    if(v.length>(f.max??1200))fail('Texto excede o limite: '+f.label);
    if(f.required&&!v.trim())fail('Campo obrigatório: '+f.label);
    if(f.type==='date'&&!validDate(v))fail('Data inválida: '+f.label);
    if(f.type==='select'&&!f.options.includes(v))fail('Opção inválida: '+f.label);
    if(f.type==='ne'&&!/^20\d{2}NE\d{6}$/.test(v))fail('Número de NE inválido');
    if(f.type==='nd'&&!/^\d{6}$/.test(v))fail('ND inválida');
    if(f.type==='subitem'&&!/^\d{2}$/.test(v))fail('Subitem inválido');
   }
   out[f.name]=v;
  }
  if(['ne','ne-reservation'].includes(kind)&&Number(out.number.slice(0,4))!==out.year)fail('NE incompatível com o exercício');
  if(out.startsOn&&out.endsOn&&out.startsOn>out.endsOn)fail('Fim anterior ao início');
  if(kind==='contract'&&out.closedOn&&!out.closureDocument?.trim())fail('Informe o documento de encerramento');
  return out;
 }
 function canonical(value){if(Array.isArray(value))return value.map(canonical);if(plain(value))return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])]));return value;}
 function versionOf(record){if(!crypto)fail('Versão é calculada no servidor');return crypto.createHash('sha256').update(JSON.stringify(canonical(record))).digest('hex');}
 function entityKey(kind,fields){const f=validateEntity(kind,fields);if(['ne','ne-reservation'].includes(kind))return kind+'|'+f.ug+'|'+f.year+'|'+f.number;if(kind==='contract')return kind+'|'+f.year+'|'+f.number.trim();return kind+'|'+versionOf(f);}
 const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
 const actions=['prepare','save','archive','restore','migrate','resolve-conflict','test-management-write'];
 function validateManagementCommand(input){
  closed(input,['operationId','action','owner','document','reason','ref','kind','fields','migrationIds']);
  if(typeof input.operationId!=='string'||!UUID.test(input.operationId))fail('Identificador de operação inválido');
  if(!actions.includes(input.action))fail('Ação inválida');
  for(const name of ['owner','document'])if(typeof input[name]!=='string'||!input[name].trim()||input[name].length>1200)fail('Informe '+name);
  const out={operationId:input.operationId.toLowerCase(),action:input.action,owner:input.owner,document:input.document,reason:input.reason??''};
  if(typeof out.reason!=='string'||out.reason.length>12000)fail('Justificativa inválida');
  if(['archive','restore','resolve-conflict'].includes(out.action)&&!out.reason.trim())fail('Informe a justificativa');
  if(input.ref!==undefined&&input.ref!==null){closed(input.ref,['id','kind','version']);const r=input.ref;if(typeof r.id!=='string'||!r.id||r.id.length>150||!Object.hasOwn(schemas,r.kind)||! /^[a-f0-9]{64}$/.test(r.version||''))fail('Referência ou versão inválida');out.ref={id:r.id,kind:r.kind,version:r.version};}
  else out.ref=null;
  if(['archive','restore'].includes(out.action)&&!out.ref)fail('Selecione o registro');
  if(input.kind!==undefined){schemaFor(input.kind);out.kind=input.kind;if(out.ref&&out.ref.kind!==out.kind)fail('Tipo diverge da referência');}
  if(input.fields!==undefined){if(!out.kind&&!out.ref)fail('Informe o tipo');out.fields=validateEntity(out.kind||out.ref.kind,input.fields);}
  if(out.action==='save'&&(!out.fields||!out.kind))fail('Cadastro incompleto');
  if(input.migrationIds!==undefined){if(!Array.isArray(input.migrationIds)||input.migrationIds.length>50||input.migrationIds.some(id=>typeof id!=='string'||!id||id.length>200)||new Set(input.migrationIds).size!==input.migrationIds.length)fail('Lista de migração inválida');out.migrationIds=[...input.migrationIds];}
  if(out.action==='migrate'&&!out.migrationIds?.length)fail('Selecione os registros para migrar');
  if(out.action==='resolve-conflict'&&(!out.fields||(!out.ref&&out.migrationIds?.length!==1)))fail('Selecione o registro e confirme os campos revisados');
  if(['prepare','test-management-write'].includes(out.action)&&(out.kind||out.fields||out.ref||out.migrationIds))fail('Preparação/teste não aceita alvos externos');
  return out;
 }
 return {UGS,fail,validDate,canonical,entityKey,validateManagementCommand,validateEntity,schemaFor,versionOf};
});
