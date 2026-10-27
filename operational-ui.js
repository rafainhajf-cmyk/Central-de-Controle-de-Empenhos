'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OperationalUI=api;})(globalThis,()=>{
 function moneyToCents(input){
  let s=String(input??'').trim().replace(/^R\$\s*/,'');
  if(/^\d+\.\d{1,2}$/.test(s))s=s.replace('.',',');
  if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(s))throw Error('Informe um valor como 1.234,56, com até duas casas.');
  const [whole,fraction='']=s.replace(/\./g,'').split(',');const amount=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
  if(amount>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Valor acima do limite seguro.');return Number(amount);
 }
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=n=>Number.isSafeInteger(n)?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100):'Conferir valor';
 const labels={'create-nc':'Cadastrar NC','associate-ug':'Confirmar UG','update-nc-followup':'Atualizar prazo e observação','create-distribution':'Nova distribuição','close-distribution':'Cancelar ou concluir'};
 const issues={NATIVE_CELL_PRESENT:'Registro contém link ou chip que exige preservação manual',UG_PENDING:'UG pendente de confirmação',UG_MISMATCH:'UG divergente entre registros',NC_NOT_FOUND:'NC ausente da lista atual',NC_DUPLICATE:'Número de NC duplicado',REFERENCE_INVALID:'Referência exige conferência',FORMULA_PRESENT:'Registro contém fórmula',MONEY_INVALID:'Valores exigem conferência',STATUS_UNVERIFIED:'Situação exige conferência',OVER_RESERVED:'Reservas acima do disponível',OUTSIDE_FORMULA_RANGE:'Registro fora do intervalo das fórmulas'};
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 function mount({root,getToken,onRefresh=async()=>{},onDraftChange=()=>{}}){
  let moduleId='inicio',model=null,busy=false,loading=false,edited=false,message='';
  let state={version:1,actions:{creditos:'create-nc',distribuicao:'create-distribution'},drafts:{},pending:null};
  const formKey=()=>moduleId+':'+state.actions[moduleId];
  const currentDraft=()=>state.drafts[formKey()]||(state.drafts[formKey()]={date:today(),year:today().slice(0,4)});
  const changed=()=>{edited=true;onDraftChange();};
  const keyFor=r=>r.ref.kind+':'+(r.ref.id||r.ref.row);
  const records=kind=>kind==='nc'?(model?.ncs||[]):(model?.distributions||[]);
  const selected=(name)=>{const d=currentDraft(),kind=name==='ncRef'||moduleId==='creditos'?'nc':'distribution';return records(kind).find(r=>keyFor(r)===d[name]);};
  async function request(method,body,id){
   const token=getToken();if(!token)throw Error('Primeiro sincronize o Drive e informe a chave de acesso.');
   let r;try{r=await fetch('/api/operacoes'+(id?'?operationId='+encodeURIComponent(id):''),{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'});}catch{const e=Error(method==='POST'?'Sem confirmação do envio. Consulte o resultado antes de repetir.':'Não foi possível consultar a confirmação. Tente consultar novamente.');e.uncertain=method==='POST';throw e;}
   let data;try{data=await r.json();}catch{const e=Error('Resposta indisponível; confira a confirmação antes de repetir.');e.uncertain=method==='POST';throw e;}
   if(!r.ok){const e=Error(data.error||'Não foi possível concluir a operação.');e.uncertain=data.code==='RESULT_UNCERTAIN'||data.code==='OPERATION_CHANGED';e.code=data.code;e.status=r.status;throw e;}return data;
  }
  async function load(rebase=false){
   if(loading)return false;loading=true;let loaded=false;render();
   try{const result=await request('GET');if(!Array.isArray(result.ncs)||!Array.isArray(result.distributions))throw Error('Leitura operacional incompleta.');model=result;loaded=true;
    if(rebase&&!state.pending){for(const [key,d]of Object.entries(state.drafts)){const kind=key.startsWith('creditos:')?'nc':'distribution';if(d.record){const r=records(kind).find(r=>keyFor(r)===d.record);if(r)d._ref=r.ref;}if(d.ncRef){const r=records('nc').find(r=>keyFor(r)===d.ncRef);if(r)d._ncRef=r.ref;}}onDraftChange();}
   }catch(e){message=e.message;}finally{loading=false;render();}return loaded;
  }
  function field(name,label,{type='text',required=false,max=1200,options=null}={}){
   const value=currentDraft()[name]??'';return '<label class="op-field">'+esc(label)+(options?'<select id="op-'+name+'" name="'+name+'" '+(required?'required':'')+'>'+options.map(([v,t,disabled])=>'<option value="'+esc(v)+'"'+(String(v)===String(value)?' selected':'')+(disabled?' disabled':'')+'>'+esc(t)+'</option>').join('')+'</select>':type==='textarea'?'<textarea id="op-'+name+'" name="'+name+'" maxlength="'+max+'" '+(required?'required':'')+'>'+esc(value)+'</textarea>':'<input id="op-'+name+'" name="'+name+'" type="'+type+'" value="'+esc(value)+'" maxlength="'+max+'" '+(required?'required':'')+(type==='number'?' step="1"':'')+'>')+'</label>';
  }
  function recordOptions(kind){return [['','Selecione o registro'],...records(kind).map(r=>[keyFor(r),(r.ug||'UG a confirmar')+' • '+r.nc+(kind==='distribution'?' • '+r.sector+' • '+money(r.amountCents):' • ND '+r.nd)])];}
  function bodyFields(action){
   let html='';
   if(action==='create-nc')html+=field('ug','UG',{required:true,options:[['','Selecione'],['160111','160111'],['167111','167111']]})+field('year','Exercício',{type:'number',required:true,max:4})+field('nc','Número completo da NC',{required:true,max:12})+field('date','Data do recebimento',{type:'date',required:true})+field('nd','ND — seis dígitos',{required:true,max:6})+field('purpose','Finalidade do crédito',{type:'textarea',required:true})+field('received','Recebido (R$)',{required:true,max:30})+field('committed','Já empenhado (R$)',{required:true,max:30})+field('available','Disponível na fonte (R$)',{required:true,max:30})+field('deadline','Prazo informado na NC',{max:300});
   if(['associate-ug','update-nc-followup','close-distribution'].includes(action))html+=field('record',moduleId==='creditos'?'NC a acompanhar':'Distribuição a acompanhar',{required:true,options:recordOptions(moduleId==='creditos'?'nc':'distribution')});
   if(action==='associate-ug')html+=field('ug','UG conferida',{required:true,options:[['','Selecione'],['160111','160111'],['167111','167111']]});
   if(action==='update-nc-followup')html+=field('deadline','Prazo informado na NC',{max:300});
   if(action==='create-distribution')html+=field('ncRef','NC de origem',{required:true,options:recordOptions('nc')})+field('date','Data da distribuição',{type:'date',required:true})+field('sector','Setor destinatário',{required:true,max:100})+field('amount','Valor a distribuir (R$)',{required:true,max:30})+field('purpose','Finalidade',{type:'textarea',required:true})+field('nextAction','Próxima providência',{max:600});
   if(action==='close-distribution')html+=field('targetStatus','Encerramento',{required:true,options:[['','Selecione'],['Cancelada','Cancelada'],['Concluída','Concluída']]})+field('nextAction','Próxima providência, se houver',{max:600});
   return html+field('owner',action==='create-distribution'?'Responsável pela distribuição':'Responsável declarado',{required:true,max:100})+field('document','Documento ou referência de conferência',{required:true,max:300})+field('note',['associate-ug','close-distribution'].includes(action)?'Justificativa obrigatória':'Observação',{type:'textarea',required:['associate-ug','close-distribution'].includes(action)});
  }
  const canRetry=()=>!!state.pending?.lookedUp&&Date.now()-(state.pending.lastAttemptAt||Date.now())>=300000;
  function render(){
   root.classList.toggle('hidden',!['creditos','distribuicao'].includes(moduleId));if(root.classList.contains('hidden'))return;
   const action=state.actions[moduleId],d=currentDraft(),pending=state.pending,disabled=busy||!!pending;
   const availableActions=moduleId==='creditos'?['create-nc','associate-ug','update-nc-followup']:['create-distribution','associate-ug','close-distribution'];
   const source=selected(action==='create-distribution'?'ncRef':'record');
   let summary='';if(source){const problems=[...new Set([...(source.issues||[]),...(source.balance?.issues||[])])];summary='<div class="notice op-summary">'+esc(source.ug||'UG a confirmar')+' • '+esc(source.nc)+(source.balance?' • Disponível na fonte: '+esc(money(source.availableCents))+' • Reservado: '+esc(money(source.balance.reservedCents))+' • Livre: '+esc(money(source.balance.freeCents)):' • '+esc(source.status||''))+(problems.length?'<p>'+esc(problems.map(i=>issues[i]||'Conferência necessária').join(' · '))+'</p>':'')+'</div>';}
   const rows=moduleId==='creditos'?(model?.ncs||[]):(model?.distributions||[]);
   const list=rows.length?'<div class="tablewrap op-list"><table><thead><tr><th>UG / referência</th><th>'+(moduleId==='creditos'?'Disponível / livre':'Setor / valor')+'</th><th>Conferência</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.ug||'UG a confirmar')+'<br>'+esc(r.nc)+'</td><td>'+esc(moduleId==='creditos'?money(r.availableCents)+' / '+money(r.balance?.freeCents):r.sector+' / '+money(r.amountCents))+'</td><td>'+esc([r.status,...(r.issues||[]).map(i=>issues[i]||i)].filter(Boolean).join(' · '))+'</td></tr>').join('')+'</tbody></table></div>':'<p>Carregue os controles para consultar registros e vínculos pendentes.</p>';
   root.innerHTML='<div class="op-heading"><h2>Lançamentos de '+(moduleId==='creditos'?'NC':'distribuição')+'</h2><button class="btn" type="button" id="op-reload" '+(busy||loading?'disabled':'')+'>'+(loading?'Consultando...':'Atualizar controles')+'</button></div><p>Os novos registros são gravados na planilha e no histórico. Fonte financeira: '+esc(model?.sourceDate||'a consultar')+' • Consulta: '+esc(model?.readAt?new Date(model.readAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'a realizar')+'.</p>'+list+'<label class="op-field op-action">Operação<select id="op-action" '+(disabled?'disabled':'')+'>'+availableActions.map(a=>'<option value="'+a+'"'+(a===action?' selected':'')+'>'+labels[a]+'</option>').join('')+'</select></label>'+summary+'<form id="op-form"><fieldset '+(disabled?'disabled':'')+'><div class="op-grid">'+bodyFields(action)+'</div><p class="op-note">Confira os dados e a data da fonte antes de salvar. O cadastro manual de NC deve ser conferido com o SIAFI.</p><button class="btn primary" id="op-submit" type="submit">'+(busy?'Enviando...':'Conferir e salvar na planilha')+'</button></fieldset></form><div class="notice" role="status" id="op-result">'+esc(message||(pending?'Envio sem confirmação. Consulte o resultado antes de repetir.':'Nenhum envio iniciado.'))+'</div>'+(pending?'<button class="btn" id="op-check" '+(busy?'disabled':'')+'>Consultar confirmação do envio</button><details class="op-pending-summary"><summary>Dados originais do envio pendente</summary><pre>'+esc(pending.summary||commandSummary(pending.command))+'</pre></details>'+(canRetry()?'<button class="btn" id="op-retry" '+(busy?'disabled':'')+'>Repetir o mesmo envio</button>':'<p class="op-note">Consulte a confirmação. Uma nova tentativa manual ficará disponível após cinco minutos do último envio, usando os mesmos dados e identificador.</p>'):'')+'<details class="op-history"><summary>Últimas operações do aplicativo</summary>'+(model?.recentOperations||[]).map(e=>'<p>'+esc(new Date(e.at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}))+' • '+esc(labels[e.action]||e.action)+' • '+esc(e.ug)+' / '+esc(e.nc)+' • '+esc(e.owner)+(e.note?'<br>'+esc(e.note):'')+'</p>').join('')+'</details>';
   root.querySelector('#op-action').onchange=e=>{state.actions[moduleId]=e.target.value;changed();message='';render();};
   root.querySelector('#op-reload').onclick=()=>load(true);
   root.querySelector('#op-form').onsubmit=submit;
   const check=root.querySelector('#op-check');if(check)check.onclick=checkPending;const retry=root.querySelector('#op-retry');if(retry)retry.onclick=retryPending;
  }
  root.addEventListener('input',e=>{
   const el=e.target;if(!el.name||!el.closest('#op-form')||state.pending)return;const d=currentDraft();
   if(el.name==='record'){
    const old=d.record,r=records(moduleId==='creditos'?'nc':'distribution').find(r=>keyFor(r)===el.value);
    if(old&&old!==el.value&&state.actions[moduleId]==='update-nc-followup'&&(d.note||d.deadline)&&!confirm('Trocar de NC substitui os campos de acompanhamento deste formulário. Deseja continuar?')){el.value=old;return;}
    d.record=el.value;d._ref=r?.ref;if(r&&state.actions[moduleId]==='update-nc-followup'){d.deadline=r.deadline;d.note=r.note;}
   }else if(el.name==='ncRef'){d.ncRef=el.value;d._ncRef=records('nc').find(r=>keyFor(r)===el.value)?.ref;}
   else d[el.name]=el.value;
   changed();if(['record','ncRef'].includes(el.name))render();
  });
  function command(){
   const d=currentDraft(),action=state.actions[moduleId],c={operationId:crypto.randomUUID(),action,owner:d.owner||'',document:d.document||'',note:d.note||''};
   if(action==='create-nc')Object.assign(c,{ug:d.ug,year:Number(d.year),nc:(d.nc||'').toUpperCase(),date:d.date,nd:d.nd,purpose:d.purpose,receivedCents:moneyToCents(d.received),committedCents:moneyToCents(d.committed),availableCents:moneyToCents(d.available),deadline:d.deadline||''});
   else if(action==='create-distribution')Object.assign(c,{ncRef:d._ncRef,date:d.date,sector:d.sector,amountCents:moneyToCents(d.amount),purpose:d.purpose,nextAction:d.nextAction||''});
   else{c.ref=d._ref;if(action==='associate-ug')c.ug=d.ug;else if(action==='update-nc-followup')c.deadline=d.deadline||'';else Object.assign(c,{targetStatus:d.targetStatus,nextAction:d.nextAction||''});}
   return c;
  }
  async function accept(result){
   const pending=state.pending;if(pending&&JSON.stringify(state.drafts[pending.formKey])===pending.draftJson)delete state.drafts[pending.formKey];
   state.pending=null;message=result.state==='confirmed-with-conflict'?'Confirmado no histórico, com divergência posterior. Atualize e confira o registro.':'Confirmado na planilha e no histórico em '+new Date(result.at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+'.';
   try{await onDraftChange({flush:true});}catch{message+=' A confirmação foi recebida, mas a cópia local não pôde ser atualizada.';}const confirmation=message;try{await onRefresh();if(!await load())message=confirmation+' A consulta de atualização ainda precisa ser concluída.';}catch{message=confirmation+' A consulta de atualização ainda precisa ser concluída.';}
  }
  function commandSummary(c){
   const ref=c.ncRef||c.ref,record=ref?records(ref.kind).find(r=>ref.id?r.ref.id===ref.id:r.ref.row===ref.row):null;
   return [labels[c.action],c.nc||record?.nc||'Registro a conferir',c.ug||record?.ug||'',c.sector||'',c.date||'',c.amountCents!==undefined?'Distribuir: '+money(c.amountCents):'',c.receivedCents!==undefined?'Recebido: '+money(c.receivedCents)+'; empenhado: '+money(c.committedCents)+'; disponível: '+money(c.availableCents):'',c.targetStatus||'',c.deadline||'',c.purpose||'',c.nextAction||'','Responsável: '+c.owner,'Documento: '+c.document,c.note||''].filter(Boolean).join('\n');
  }
  async function performAttempt(pending,isRetry=false){
   const prior={state:pending.state,lastAttemptAt:pending.lastAttemptAt,lookedUp:pending.lookedUp};
   pending.state='sending';pending.lastAttemptAt=Date.now();pending.lookedUp=false;state.pending=pending;busy=true;edited=true;message='Guardando a identificação do envio...';render();
   try{await onDraftChange({flush:true});}catch{if(isRetry){Object.assign(pending,prior);state.pending=pending;}else state.pending=null;busy=false;message='Não foi possível guardar a cópia local. Nenhum novo envio foi iniciado. Confira o espaço do navegador ou desative a cópia local para continuar.';render();return;}
   try{const result=await request('POST',pending.command);await accept(result);}catch(e){
    if(e.uncertain||!e.status){pending.state='uncertain';state.pending=pending;message=e.message||'Envio sem confirmação. Consulte antes de repetir.';}else{state.pending=null;message=e.message;}
    try{await onDraftChange({flush:true});}catch{message+=' A cópia local não pôde ser atualizada; mantenha a página aberta.';}
   }finally{busy=false;render();}
  }
  async function submit(event){
   event.preventDefault();if(busy||state.pending)return;
   if(!getToken()){message='Primeiro sincronize o Drive e informe a chave de acesso.';render();return;}
   let c;try{c=command();}catch(e){message=e.message;render();return;}
   const summary=commandSummary(c);if(!confirm(summary+'\n\nGravar estes dados na planilha e no histórico?'))return;
   await performAttempt({command:c,formKey:formKey(),draftJson:JSON.stringify(currentDraft()),summary,state:'prepared'});
  }
  async function retryPending(){
   if(busy||!canRetry())return;const pending=state.pending;busy=true;render();
   try{
    const result=await request('GET',null,pending.command.operationId);
    if(result.state!=='not-found-yet'){await accept(result);return;}
    if(!confirm((pending.summary||commandSummary(pending.command))+'\n\nO envio ainda não foi localizado. Após conferir o histórico, deseja repetir exatamente os mesmos dados e identificador?'))return;
    busy=false;await performAttempt(pending,true);
   }catch(e){message=e.message;}finally{busy=false;render();}
  }
  async function checkPending(){
   if(busy||!state.pending)return;busy=true;render();try{const result=await request('GET',null,state.pending.command.operationId);if(result.state==='not-found-yet'){state.pending.lookedUp=true;message='O envio ainda não foi localizado. Isso não confirma falha. Confira o histórico na planilha. Após cinco minutos, você pode optar por repetir exatamente o mesmo envio.';try{await onDraftChange({flush:true});}catch{message+=' A cópia local não pôde ser atualizada.';}}else await accept(result);}catch(e){message=e.message;}finally{busy=false;render();}
  }
  function restoreDraft(saved){
   if(!saved||saved.version!==1||!saved.drafts||typeof saved.drafts!=='object')return;
   if(!edited){state.drafts=structuredClone(saved.drafts);if(saved.actions?.creditos&&['create-nc','associate-ug','update-nc-followup'].includes(saved.actions.creditos))state.actions.creditos=saved.actions.creditos;if(saved.actions?.distribuicao&&['create-distribution','associate-ug','close-distribution'].includes(saved.actions.distribuicao))state.actions.distribuicao=saved.actions.distribuicao;}
   if(saved.pending?.command?.operationId&&!state.pending){state.pending=structuredClone(saved.pending);state.pending.state='uncertain';state.pending.lastAttemptAt=Number.isFinite(state.pending.lastAttemptAt)?state.pending.lastAttemptAt:Date.now();message='Envio recuperado sem confirmação. Consulte o resultado antes de repetir.';}
   render();
  }
  return {show(id){moduleId=id;render();if(['creditos','distribuicao'].includes(id)&&!model&&getToken())load();},serializeDraft(){return structuredClone(state);},restoreDraft};
 }

 return {moneyToCents,mount};
});
