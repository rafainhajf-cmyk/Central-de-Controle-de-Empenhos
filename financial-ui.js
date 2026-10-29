'use strict';
globalThis.CentralFinancialUI=(()=>{
 const labels={liquidation:'Liquidação informada',cancellation:'Anulação informada',reversal:'Estorno',reserve:'Reserva interna','cancel-reservation':'Reserva cancelada','complete-reservation':'Reserva concluída',reconcile:'Conciliação da fonte'};
 const money=v=>Number.isSafeInteger(v)?(v/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'A conferir';
 const storageKey='central-financial-pending-v1';let recoveryRoot,copyEnabled,passphrase,pendingBox,stored=null,recovered=false;const listeners=new Map();
 function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
 async function request(method,body){const url='/api/financeiro'+(method==='GET'?'?'+new URLSearchParams(body):'');const response=await fetch(url,{method,credentials:'same-origin',cache:'no-store',headers:method==='POST'?{'Content-Type':'application/json','X-Central-Request':'1'}:{},body:method==='POST'?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});const data=await response.json();if(!response.ok){const e=Error(data.error||'Não foi possível confirmar a operação financeira.');e.definitive=response.status>=400&&response.status<500&&![408,429].includes(response.status);throw e;}return data;}
 async function persist(value){
  if(value){if(stored&&!recovered)throw Error('Recupere o comando criptografado salvo antes de iniciar outro.');if(!copyEnabled?.checked)return;if(passphrase.value.length<12)throw Error('Use pelo menos 12 caracteres na senha exclusiva da cópia.');const cipher=await EncryptedCache.seal(value,passphrase.value);localStorage.setItem(storageKey,cipher);stored=cipher;recovered=true;}
  else if(recovered){localStorage.removeItem(storageKey);stored=null;recovered=false;}
 }
 const client=CentralFinancialClient.create({transport:request,persist});
 function status(message){const target=recoveryRoot?.querySelector('[role="status"]');if(target)target.textContent=message;}
 function pendingControls(){
  if(!pendingBox)return;pendingBox.replaceChildren();const pending=client.pending();if(!pending)return;
  pendingBox.append(node('p','Há um comando aguardando confirmação: '+pending.command.operationId+'. Não envie outro antes de consultá-lo.'));
  const check=node('button','Consultar confirmação'),retry=node('button','Repetir o mesmo comando');check.type=retry.type='button';retry.className='secondary';pendingBox.append(check,retry);
  check.onclick=async()=>{check.disabled=true;try{const result=await client.confirm();status(result.state==='confirmed'?'Operação confirmada no servidor. '+client.warning():'Ainda não localizada. Aguarde cinco minutos desde o envio e consulte novamente antes de repetir.');if(result.state==='confirmed')await listeners.get(pending.command.key)?.();}catch(e){status(e.message);}finally{pendingControls();}};
  retry.onclick=async()=>{retry.disabled=true;try{const result=await client.retry();status('Operação confirmada. '+client.warning());if(result.state==='confirmed')await listeners.get(pending.command.key)?.();}catch(e){status(e.message);}finally{pendingControls();}};
 }
 function init(root){
  recoveryRoot=root;const details=node('details'),content=node('div',undefined,'financial-recovery');details.append(node('summary','Cópia opcional e recuperação de comando financeiro'));
  const enableLabel=node('label');copyEnabled=node('input');copyEnabled.type='checkbox';enableLabel.append(copyEnabled,document.createTextNode(' Guardar comando pendente criptografado neste navegador'));
  const passwordLabel=node('label','Senha exclusiva da cópia');passphrase=node('input');passphrase.type='password';passphrase.autocomplete='off';passphrase.minLength=12;passwordLabel.append(passphrase);
  const recover=node('button','Recuperar comando salvo');recover.type='button';
  content.append(node('p','Sem a cópia opcional, um envio pendente fica somente nesta página. Fechar a página pode perder o identificador necessário para consultar a confirmação.'),enableLabel,passwordLabel,recover);details.append(content);pendingBox=node('div',undefined,'financial-pending');const message=node('p');message.setAttribute('role','status');message.setAttribute('aria-live','polite');root.append(details,message,pendingBox);
  try{stored=localStorage.getItem(storageKey);if(stored)status('Existe um comando criptografado salvo. Recupere-o antes de novo envio.');}catch{status('Armazenamento local indisponível. Comandos pendentes ficarão somente na memória desta página.');}
  recover.onclick=async()=>{try{if(!stored)throw Error('Não há comando salvo neste navegador.');const value=await EncryptedCache.open(stored,passphrase.value);client.restore(value);recovered=true;copyEnabled.checked=true;status('Comando recuperado. Consulte a confirmação antes de repetir.');pendingControls();}catch{status('Não foi possível recuperar. Confira a senha e se já existe um comando pendente nesta página.');}};
  window.addEventListener('beforeunload',event=>{if(client.pending()){event.preventDefault();event.returnValue='';}});
 }
 function field(form,label,{type='text',textarea=false,required=true,value='',max=1200}={}){const l=node('label',label),input=node(textarea?'textarea':'input');if(!textarea)input.type=type;input.required=required;input.value=value;input.maxLength=max;l.append(input);form.append(l);return input;}
 function amount(text){if(!/^\d+(?:,\d{1,2})?$/.test(text.trim()))throw Error('Informe o valor sem separador de milhar, por exemplo 1234,56.');const [whole,decimal='']=text.trim().split(',');const n=BigInt(whole)*100n+BigInt(decimal.padEnd(2,'0'));if(n<=0n||n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Valor monetário inválido.');return Number(n);}
 function mount(record,onChanged=()=>{}){
  const panel=node('details',undefined,'financial-panel'),content=node('div'),message=node('p');message.setAttribute('role','status');panel.append(node('summary','Movimentos e reservas'),message,content);let view=null,loading=false;
  function note(messageText){message.textContent=messageText;status(messageText);}
  async function send(form,action,fields){if(client.pending()){pendingControls();throw Error('Consulte o comando financeiro pendente antes de enviar outro.');}const button=form.querySelector('button[type="submit"]');button.disabled=true;try{
   const command={operationId:crypto.randomUUID(),key:record.id,expectedVersion:view.book.version,sourceVersion:view.source.version,action,...fields};const result=await client.submit(command);note('Registro confirmado. '+client.warning());onChanged(result.position);await load();
  }catch(e){note(e.message);pendingControls();throw e;}finally{button.disabled=false;}}
  function formBlock(title,action,options={}){
   const details=node('details'),form=node('form',undefined,'financial-form');form.dataset.financialAction=action;details.append(node('summary',title),form);
   let value,purpose;if(['liquidation','cancellation','reserve'].includes(action)){value=field(form,'Valor (R$)');value.inputMode='decimal';value.placeholder='1234,56';}
   if(action==='reserve')purpose=field(form,'Finalidade');
   const on=field(form,'Data',{type:'date'}),documentField=field(form,'Documento',{max:200}),reason=field(form,'Justificativa',{textarea:true,max:12000});
   const submit=node('button','Confirmar registro');submit.type='submit';form.append(submit);form.onsubmit=async e=>{e.preventDefault();try{await send(form,action,{...options,on:on.value,document:documentField.value,note:reason.value,...value?{amountCents:amount(value.value)}:{},...purpose?{purpose:purpose.value}:{}});}catch{}};
   return details;
  }
  function reconcile(){
   const details=node('details'),form=node('form',undefined,'financial-form');details.append(node('summary','Conferir fonte e conciliar'),form);form.append(node('p','Marque somente os movimentos deste livro que já estão contabilizados nos valores da fonte. Os demais serão aplicados separadamente. Movimentos já incorporados permanecem marcados.'));
   const included=new Set(view.book.baseline?.includedMovementIds||[]),checks=[];
   for(const movement of view.book.movements){const label=node('label'),input=node('input');input.type='checkbox';input.checked=included.has(movement.id);input.disabled=input.checked;label.append(input,document.createTextNode(' '+movement.document+' · '+labels[movement.kind]+' · '+money(movement.amountCents)));checks.push({input,id:movement.id});form.append(label);}
   const reason=field(form,'Justificativa da conciliação',{textarea:true,max:12000}),ackLabel=node('label'),ack=node('input');ack.type='checkbox';ack.required=true;ackLabel.append(ack,document.createTextNode(' Conferi a fonte e os movimentos incorporados'));form.append(ackLabel);const save=node('button','Confirmar conciliação');save.type='submit';form.append(save);form.onsubmit=async e=>{e.preventDefault();try{await send(form,'reconcile',{includedMovementIds:checks.filter(c=>c.input.checked).map(c=>c.id),note:reason.value});}catch{}};return details;
  }
  function render(){
   content.replaceChildren();const p=view.position,source=view.source,dl=node('dl');
   for(const [label,value]of [['UG / exercício',record.ug+' / '+record.year],['Data da fonte',source.sourceDate],['Saldo a liquidar na fonte',money(source.remainingCents)],['Liquidado na fonte',money(source.liquidatedCents)],['Anulado na fonte',money(source.cancelledCents)]])dl.append(node('dt',label),node('dd',value??'A conferir'));
   content.append(node('p','Fonte importada e registros informados são apresentados separadamente. Registrar aqui não lança valores no SIAFI nem libera crédito.'),dl,node('p',p.notice,'source-note'));
   if(p.status==='ready'){const totals=node('dl');for(const [label,value]of [['Saldo operacional informado',p.availableCents],['Liquidação operacional informada',p.liquidatedCents],['Anulação operacional informada',p.cancelledCents],['Reservas internas ativas',p.reservedCents],['Livre para reserva interna',p.freeInternalCents]])totals.append(node('dt',label),node('dd',money(value)));content.append(totals);}
   if(view.canWrite&&source.valid&&view.present){content.append(reconcile());if(p.status==='ready')content.append(formBlock('Registrar liquidação informada','liquidation'),formBlock('Registrar anulação informada','cancellation'),formBlock('Criar reserva interna','reserve'));}
   if(view.book.movements.length){content.append(node('h4','Movimentos informados'));const reversed=new Set(view.book.movements.filter(m=>m.kind==='reversal').map(m=>m.movementId));for(const m of view.book.movements){const row=node('article',undefined,'financial-event');row.append(node('strong',m.document),node('p',labels[m.kind]+' · '+money(m.amountCents)+' · '+m.on+' · '+m.actorName+' · setor à época: '+(m.sector||'A conferir')),node('p',m.note));
    if(m.kind!=='reversal'&&view.canWrite&&p.status==='ready'&&!reversed.has(m.id)){const button=node('button','Preparar estorno');button.type='button';button.className='secondary';button.onclick=()=>{const f=formBlock('Estorno de '+m.document,'reversal',{movementId:m.id});f.open=true;row.append(f);button.remove();};row.append(button);}else if(reversed.has(m.id))row.append(node('p','Estornado; movimento original preservado.'));content.append(row);}}
   if(view.book.reservations.length){content.append(node('h4','Reservas internas'));for(const r of view.book.reservations){const row=node('article',undefined,'financial-event');row.append(node('strong',r.document+' · '+r.purpose),node('p',money(r.amountCents)+' · '+({active:'Ativa',cancelled:'Cancelada',completed:'Concluída'}[r.state])+' · '+r.actorName));if(view.canWrite&&source.valid&&r.state==='active')for(const [action,label]of [['cancel-reservation','Cancelar reserva'],['complete-reservation','Concluir reserva']]){const details=node('details'),form=node('form',undefined,'financial-form');details.append(node('summary',label),form);form.append(node('p','Encerrar a reserva não altera a fonte nem registra liquidação ou liberação de crédito.'));const reason=field(form,'Motivo do encerramento',{textarea:true,max:12000}),save=node('button','Confirmar encerramento');save.type='submit';form.append(save);form.onsubmit=async e=>{e.preventDefault();try{await send(form,action,{reservationId:r.id,note:reason.value});}catch{}};row.append(details);}content.append(row);}}
   const history=node('details'),items=node('div');history.append(node('summary','Auditoria financeira por usuário'),items);function appendEvents(events){for(const event of events)items.append(node('p',new Date(event.at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+' · '+event.actorName+' · '+labels[event.action]+' · '+event.note));}appendEvents(view.events);content.append(history);
   if(view.nextOffset!==null){let offset=view.nextOffset;const more=node('button','Mais eventos financeiros');more.type='button';more.onclick=async()=>{more.disabled=true;try{const next=await request('GET',{key:record.id,offset});appendEvents(next.events);offset=next.nextOffset;more.hidden=offset===null;}catch(e){note(e.message);}finally{more.disabled=false;}};history.append(more);}
  }
  async function load(){if(loading)return;loading=true;try{const next=await request('GET',{key:record.id});view=next;onChanged(next.position);render();}catch(e){note(e.message+' A última consulta permanece disponível.');}finally{loading=false;}}
  panel.addEventListener('toggle',()=>{if(panel.open&&!view)load();});listeners.set(record.id,load);return panel;
 }
 return {init,mount};
})();
