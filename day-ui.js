(function(){
 'use strict';
 const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const roleNames={admin:'Administrador',manager:'Gestor','sector-lead':'Responsável de setor',operator:'Operador'};
 const states={open:'Aberta','in-progress':'Em andamento',waiting:'Aguardando retorno',completed:'Concluída'};
 const actions={charge:'Cobrei',partial:'Realizei parcialmente',wait:'Aguardando retorno',progress:'Registrar avanço',complete:'Concluir',reopen:'Reabrir',assign:'Atribuir',create:'Criar',generated:'Gerada da fonte'};
 const issueNames={ESTIMATED_DISPATCH:'Entrega estimada: conferir a data do envio',DATE_PENDING:'Marco de data ausente',SECTOR_PENDING:'Setor a confirmar',RESPONSIBLE_USER_PENDING:'Responsável individual a atribuir',UG_OR_IDENTITY_PENDING:'UG / identidade a confirmar',UG_PENDING:'UG a confirmar',SOURCE_CONFLICT:'Divergência entre fontes',CLASSIFICATION_PENDING:'Classificação a conferir',SERVICE_INSPECTOR_PENDING:'Fiscal a confirmar',APRV_NE_DEADLINE_EXCLUDED:'APRV: sem contagem de prazo de NE',SOURCE_REVIEW_REQUIRED:'Origem exige conferência',DISTRIBUTION_ID_PENDING:'Identidade da distribuição a confirmar'};
 let canApprove=false,accessState=null,deadlineVersion=0;
 let user=null,view='day',rows=[],nextOffset=null,directory={people:[],sectors:[]},lastReport=null,epoch=0;const drafts=new Map();
 function message(text){$('message').textContent=text;}
 const client=DayClient.create({onChange:s=>{
  $('recovery').hidden=!s.pending;$('retry').hidden=!s.pending||!s.checked;
  $('lookup').disabled=s.busy;$('retry').disabled=s.busy;
  for(const b of document.querySelectorAll('#workspace form button, #generate'))b.disabled=s.busy||!!s.pending;
 }});
 const request=(url,body,headers)=>client.request(url,body,headers);
 function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
 async function run(fn,button){if(button)button.disabled=true;try{return await fn();}catch(e){message(e.message+(client.state().pending?' O envio está sem confirmação; consulte o resultado.':''));if(e.status===401&&user){epoch++;user=null;rows=[];drafts.clear();showSession();}}finally{if(button&&!client.state().pending)button.disabled=false;}}
 function showSession(){
  $('loginPanel').hidden=!!user;$('workspace').hidden=!user;$('logout').hidden=!user&&!accessState;
  $('identityLabel').textContent=user?user.name+' · '+roleNames[user.role]:'';
  const canManage=user?.role==='admin',canGenerate=['admin','manager','sector-lead'].includes(user?.role);
  $('adminTab').hidden=!canManage;$('generate').hidden=!canGenerate;$('createPanel').hidden=!canGenerate;
  if(!user){$('activities').replaceChildren();$('userList').replaceChildren();$('reportResult').replaceChildren();$('dayCards').replaceChildren();}
 }
 async function loadDirectory(){directory=await request('/api/meu-dia?directory=1');const previous=$('sectorFilter').value;$('sectorFilter').replaceChildren(new Option('Todos os setores permitidos',''));$('sectors').replaceChildren();for(const sector of directory.sectors){$('sectorFilter').add(new Option(sector,sector));const o=el('option');o.value=sector;$('sectors').append(o);}$('sectorFilter').value=directory.sectors.includes(previous)?previous:'';}
 function canRespond(r){return ['admin','manager','sector-lead'].includes(user.role)||r.assigneeId===user.userId||(!r.assigneeId&&user.sectors.includes(r.sector));}
 function field(label,type='text',value=''){const l=el('label',label),n=el(type==='textarea'?'textarea':'input');if(type!=='textarea')n.type=type;n.value=value??'';l.append(n);return {label:l,input:n};}
 async function submit(command){const id=command.id;const r=await client.submit({operationId:crypto.randomUUID(),...command});if(id)drafts.delete(id);message('Providência confirmada e registrada no histórico individual.');await loadActivities();return r;}
 function activityCard(r){
  const card=el('article',undefined,'activity');card.dataset.activityId=r.id;card.append(el('h3',r.subject));
  const person=directory.people.find(p=>p.user_id===r.assigneeId)?.name|| (r.assigneeId?'Responsável atribuído':'Sem responsável individual');
  card.append(el('div',[r.reference||'Sem referência',r.ug?'UG '+r.ug:'UG não informada',r.sector||'Setor a confirmar',person].join(' · '),'meta'));
  const badges=el('div',undefined,'badges');badges.append(el('span',states[r.state], 'badge'));
  const isLate=r.state!=='completed'&&r.dueOn&&r.dueOn<today();badges.append(el('span',r.dueOn?'Prazo: '+r.dueOn+(isLate?' · atrasada':''):'Sem prazo verificável','badge'+(isLate?' overdue':'')));
  for(const issue of r.issues||[])if(issue!=='RESPONSIBLE_USER_PENDING'||!r.assigneeId)badges.append(el('span',issueNames[issue]||'Conferir informação da origem','badge'));
  card.append(badges);if(r.nextAction)card.append(el('p','Próximo passo: '+r.nextAction,'note'));
  const source=el('details'),summary=el('summary','Consultar origem preservada');source.append(summary,el('p','Consulta: '+(r.source?.readAt||'não informada')+' · '+(r.source?.sourceDate||'data financeira não informada')));
  const original=r.source?.originalAlmox;if(original)source.append(el('h4','Anotação original do Almox'),el('p',(original.status||'')+'\n'+(original.observation||''),'note'));
  source.append(el('pre',JSON.stringify(r.source,null,2)));card.append(source);
  const details=el('details');details.append(el('summary','Responder / consultar histórico'));
  if(canRespond(r)){
   const draft=drafts.get(r.id)||{},form=el('form',undefined,'form'),sel=el('select');sel.setAttribute('aria-label','Resposta rápida');
   for(const key of (r.state==='completed'?['reopen']:['charge','partial','wait','progress','complete']))sel.add(new Option(actions[key],key));if(draft.action)sel.value=draft.action;
   const actionLabel=el('label','Resposta rápida');actionLabel.append(sel);
   const note=field('O que foi feito / justificativa','textarea',draft.note||''),next=field('Próximo passo','textarea',draft.nextAction??r.nextAction),due=field('Prazo (opcional)','date',draft.dueOn??r.dueOn);
   note.input.required=true;note.input.maxLength=next.input.maxLength=12000;
   const save=el('button','Registrar resposta');save.type='submit';form.append(actionLabel,note.label,next.label,due.label,save);
   form.addEventListener('input',()=>drafts.set(r.id,{action:sel.value,note:note.input.value,nextAction:next.input.value,dueOn:due.input.value}));
   form.onsubmit=e=>{e.preventDefault();run(async()=>{if(['complete','reopen'].includes(sel.value)&&!confirm(actions[sel.value]+' esta atividade com a justificativa informada?'))return;await submit({action:sel.value,id:r.id,version:r.version,note:note.input.value,nextAction:next.input.value,dueOn:due.input.value||null});},save);};details.append(form);
  }
  if(['admin','manager','sector-lead'].includes(user.role)&&r.state!=='completed'){
   const form=el('form',undefined,'form'),sector=field('Atribuir ao setor','text',r.sector||'');sector.input.setAttribute('list','sectors');sector.input.required=true;
   const owner=el('select');owner.setAttribute('aria-label','Responsável individual');const ownerLabel=el('label','Responsável individual');ownerLabel.append(owner);
   const fill=()=>{owner.replaceChildren(new Option('Disponível ao setor',''));for(const p of directory.people.filter(p=>p.sectors.includes(sector.input.value)))owner.add(new Option(p.name,p.user_id));owner.value=r.assigneeId||'';};fill();sector.input.onchange=fill;
   const why=field('Motivo da atribuição');why.input.required=true;const btn=el('button','Salvar atribuição');form.append(sector.label,ownerLabel,why.label,btn);form.onsubmit=e=>{e.preventDefault();run(()=>submit({action:'assign',id:r.id,version:r.version,sector:sector.input.value,assigneeId:owner.value||null,note:why.input.value}),btn);};details.append(form);
  }
  const hist=el('div'),histButton=el('button','Carregar histórico','secondary');histButton.type='button';let historyOffset=0;
  histButton.onclick=()=>run(async()=>{const data=await request('/api/meu-dia?id='+encodeURIComponent(r.id)+'&offset='+historyOffset);for(const e of data.events){const item=el('div');item.append(el('p',new Date(e.at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+' · '+e.actor_name+' · '+(actions[e.action]||e.action)+' · '+(e.sector||'Sem setor')),el('p',e.note,'note'));hist.append(item);}histButton.hidden=data.nextOffset===null;historyOffset=data.nextOffset;},histButton);
  details.append(histButton,hist);card.append(details);return card;
 }
 function renderActivities(){
  const needle=$('daySearch').value.toLocaleLowerCase('pt-BR'),list=rows.filter(r=>(r.subject+' '+r.reference+' '+(r.nextAction||'')).toLocaleLowerCase('pt-BR').includes(needle));
  $('activities').replaceChildren();if(!list.length)$('activities').append(el('div',view==='sector'&&!$('sectorFilter').value?'Escolha um setor para consultar.':'Nenhuma atividade nesta consulta. Gere atividades das fontes ou peça a atribuição ao responsável.','panel'));
  for(const r of list)$('activities').append(activityCard(r));
  const counts=[['Abertas carregadas',list.filter(r=>r.state!=='completed').length],['Atrasadas',list.filter(r=>r.state!=='completed'&&r.dueOn&&r.dueOn<today()).length],['Previstas para hoje',list.filter(r=>r.state!=='completed'&&r.dueOn===today()).length],['Aguardando retorno',list.filter(r=>r.state==='waiting').length],['Sem prazo verificável',list.filter(r=>r.state!=='completed'&&!r.dueOn).length]];
  $('dayCards').replaceChildren();for(const [label,n]of counts){const c=el('div',undefined,'stat');c.append(el('strong',String(n)),el('span',label));$('dayCards').append(c);}
  $('more').hidden=nextOffset===null;
 }
 async function loadActivities(more=false){
  if(view==='reports'||view==='admin')return;if(view==='sector'&&!$('sectorFilter').value){rows=[];nextOffset=null;renderActivities();return;}
  const current=epoch,params=new URLSearchParams({view,offset:String(more?nextOffset||0:0),completed:$('showCompleted').checked?'1':'0'});if($('sectorFilter').value)params.set('sector',$('sectorFilter').value);
  const data=await request('/api/meu-dia?'+params);if(current!==epoch)return;rows=more?[...rows,...data.activities]:data.activities;nextOffset=data.nextOffset;renderActivities();
 }
 async function setView(next){view=next;for(const b of $('viewTabs').querySelectorAll('button'))b.classList.toggle('active',b.dataset.view===view);$('activityArea').hidden=['reports','admin'].includes(view);$('filters').hidden=view==='admin';$('reportPanel').hidden=view!=='reports';$('adminPanel').hidden=view!=='admin';if(view==='admin')await loadAdmin();else if(view==='reports')await loadReport();else await loadActivities();}
 async function loadReport(){const p=new URLSearchParams({report:$('reportPeriod').value,date:$('reportDate').value});if($('sectorFilter').value)p.set('sector',$('sectorFilter').value);lastReport=null;$('exportReport').disabled=$('excelReport').disabled=$('printReport').disabled=true;const r=await request('/api/meu-dia?'+p);lastReport=r;$('reportResult').replaceChildren(el('p',r.label+' · '+r.timezone+' · consulta '+new Date(r.readAt).toLocaleString('pt-BR')));const names={new:'Novas',completed:'Conclusões registradas',reopened:'Reaberturas',charged:'Cobranças',partial:'Respostas parciais',progress:'Avanços',waiting:'Aguardando retorno',openAtEnd:'Abertas ao fim do período',currentOpen:'Carteira aberta atual'};const stats=el('div',undefined,'stats');for(const [k,name]of Object.entries(names)){const c=el('div',undefined,'stat');c.append(el('strong',String(r.totals[k])),el('span',name));stats.append(c);}$('reportResult').append(stats,el('p','Produção por setor usa a atribuição no momento do evento. Carteira atual usa a atribuição atual. '+r.source));const table=el('table'),head=el('tr');for(const title of ['Setor histórico','Providência','Quantidade'])head.append(el('th',title));table.append(head);for(const e of r.eventsBySector){const tr=el('tr');for(const value of [e.sector||'A conferir',actions[e.action]||e.action,String(e.count)])tr.append(el('td',value));table.append(tr);}$('reportResult').append(table);$('exportReport').disabled=$('excelReport').disabled=$('printReport').disabled=false;}
 async function loadApprovals(){
  if(!$('approvalPanel'))return;$('approvalPanel').hidden=!canApprove;if(!canApprove)return;
  const data=await request('/api/identidade?requests=1');$('accessRequests').replaceChildren();
  if(!data.requests.length)$('accessRequests').append(el('p','Nenhuma solicitação pendente.'));
  for(const u of data.requests){const form=el('form',undefined,'form'),role=el('select'),label=el('label','Perfil de acesso');for(const [k,v]of Object.entries(roleNames))role.add(new Option(v,k));role.value='operator';label.append(role);const sectors=field('Setores (vírgula)'),approve=el('button','Autorizar acesso'),deny=el('button','Recusar','secondary');deny.type='button';form.append(el('p',u.name+' · '+u.email),label,sectors.label,approve,deny);
   const decide=decision=>run(async()=>{await request('/api/identidade',{action:'access-decision',request:{userId:u.user_id,decision,role:role.value,sectors:sectors.input.value.split(',').map(s=>s.trim()).filter(Boolean)}});message(decision==='approve'?'Acesso autorizado.':'Solicitação recusada.');await loadAdmin();},decision==='approve'?approve:deny);form.onsubmit=e=>{e.preventDefault();decide('approve');};deny.onclick=()=>decide('deny');$('accessRequests').append(form);
  }
 }
 async function loadAdmin(){await loadApprovals();await loadRules();
  const data=await request('/api/identidade?users=1');$('userList').replaceChildren();
  for(const u of data.users){const form=el('form',undefined,'form'),name=el('p',u.name+' · '+u.email),role=el('select'),roles=el('label','Permissão');for(const [k,v]of Object.entries(roleNames))role.add(new Option(v,k));role.value=u.role;roles.append(role);const sectors=field('Setores (vírgula)','text',u.sectors.join(', ')),active=el('input');active.type='checkbox';active.checked=u.active;const activeLabel=el('label','Ativo','inline');activeLabel.append(active);const button=el('button','Atualizar perfil');form.append(name,roles,sectors.label,activeLabel,button);form.onsubmit=e=>{e.preventDefault();run(async()=>{await request('/api/identidade',{action:'update-user',profile:{userId:u.user_id,role:role.value,sectors:sectors.input.value.split(',').map(s=>s.trim()).filter(Boolean),active:active.checked}});message('Perfil atualizado; histórico preservado.');await loadAdmin();},button);};$('userList').append(form);}
  const c=await request('/api/meu-dia?calendar=1');$('calendarList').replaceChildren(el('p',c.notice));for(const d of c.calendar)$('calendarList').append(el('p',d.day+' · '+(d.kind==='national'?'Nacional':'Local')+' · '+d.label));
 }
 async function entered(identity){accessState=null;const status=await request('/api/identidade?access=1');canApprove=status.canApprove===true;user=identity;epoch++;client.clear();showSession();await loadDirectory();await setView('day');message('Acesso individual confirmado. Confira o calendário e as informações pendentes antes de cobrar prazos.');}
 if($('googleLogin'))$('googleLogin').onclick=()=>run(async()=>{const r=await request('/api/identidade',{action:'google-start'});window.location.assign(r.url);},$('googleLogin'));
 $('loginForm').onsubmit=e=>{e.preventDefault();const password=$('loginPassword').value;$('loginPassword').value='';run(async()=>{const r=await request('/api/identidade',{action:'login',email:$('loginEmail').value,password});await entered(r.user);},e.submitter);};
 $('bootstrapForm').onsubmit=e=>{e.preventDefault();const key=$('bootstrapKey').value,password=$('bootstrapPassword').value;$('bootstrapKey').value=$('bootstrapPassword').value='';run(async()=>{await request('/api/identidade',{action:'bootstrap',profile:{name:$('bootstrapName').value,email:$('bootstrapEmail').value,password,role:'admin',sectors:[]}},{Authorization:'Bearer '+key});message('Administrador configurado. Entre com seu e-mail e senha individual.');$('loginEmail').value=$('bootstrapEmail').value;},e.submitter);};
 $('logout').onclick=()=>run(async()=>{if(client.state().pending&&!confirm('Há envio sem confirmação. Sair e descartar o rascunho desta página?'))return;await request('/api/identidade',{action:'logout'});epoch++;user=null;accessState=null;canApprove=false;rows=[];drafts.clear();client.clear();showSession();message('Você saiu. O histórico foi preservado.');},$('logout'));
 $('refresh').onclick=()=>run(async()=>{await loadDirectory();await setView(view);message('Consulta atualizada.');},$('refresh'));
 $('viewTabs').onclick=e=>{const b=e.target.closest('button[data-view]');if(b)run(()=>setView(b.dataset.view),b);};
 $('daySearch').oninput=renderActivities;$('sectorFilter').onchange=()=>run(()=>view==='reports'?loadReport():loadActivities());$('showCompleted').onchange=()=>run(()=>loadActivities());$('more').onclick=()=>run(()=>loadActivities(true),$('more'));
 $('generate').onclick=()=>run(async()=>{const r=await client.submit({operationId:crypto.randomUUID(),action:'generate'});message(r.generated+' atividades geradas; '+r.existing+' já existentes preservadas. As planilhas não foram alteradas.');await loadDirectory();await loadActivities();},$('generate'));
 $('lookup').onclick=()=>run(async()=>{const r=await client.lookup();if(r.state==='confirmed'){if(r.activity?.id)drafts.delete(r.activity.id);message('Gravação localizada e confirmada.');await loadActivities();}else message('Operação ainda não localizada. Isso não confirma falha; a repetição manual mantém o mesmo identificador.');},$('lookup'));
 $('retry').onclick=()=>run(async()=>{if(confirm('Repetir exatamente os mesmos dados e identificador?')){const result=await client.retry();if(result.activity?.id)drafts.delete(result.activity.id);message('Operação confirmada sem duplicação.');await loadActivities();}},$('retry'));
 $('createForm').onsubmit=e=>{e.preventDefault();run(async()=>{await submit({action:'create',subject:$('createSubject').value,reference:$('createReference').value,sector:$('createSector').value,dueOn:$('createDue').value||null,nextAction:$('createNext').value,note:$('createNote').value});$('createForm').reset();},e.submitter);};

 async function loadRules(){const data=await request('/api/regras');deadlineVersion=data.version;const form=$('deadlineRules');form.replaceChildren();for(const [key,label]of Object.entries({dispatchDays:'Envio ao fornecedor',deliveryDays:'Entrega pelo fornecedor',noticeDays:'Resposta à primeira notificação',secondNoticeDays:'Resposta à segunda notificação',paDays:'Revisão de PA aberto'})){const f=field(label+' (dias corridos)','number',data.rules[key]);f.input.name=key;f.input.min='1';f.input.max='365';f.input.required=true;form.append(f.label);}const button=el('button','Salvar regras gerais');form.append(button);}
 $('deadlineRules').onsubmit=e=>{e.preventDefault();run(async()=>{const rules=Object.fromEntries([...$('deadlineRules').querySelectorAll('input')].map(n=>[n.name,Number(n.value)]));await request('/api/regras',{rules,expectedVersion:deadlineVersion});await loadRules();message('Regras salvas com histórico. Prazos de atividades existentes foram preservados.');},e.submitter);};
 $('excelReport').onclick=()=>{if(!lastReport)return;CentralExport.download('Relatório '+lastReport.label,['Indicador','Quantidade'],[...Object.entries(lastReport.totals),[],['Setor histórico','Providência','Quantidade'],...lastReport.eventsBySector.map(e=>[e.sector||'A conferir',actions[e.action]||e.action,e.count])]);};
 $('printReport').onclick=()=>{if(lastReport)CentralExport.print('report');};
 $('reportDate').value=today();$('reportForm').onsubmit=e=>{e.preventDefault();run(loadReport,e.submitter);};
 $('exportReport').onclick=()=>{if(!lastReport)return;const safe=s=>{const value=String(s??'');return '"'+(/^[=+@\-\t\r]/.test(value)?"'":'')+value.replaceAll('"','""')+'"';};const data=[['Período',lastReport.label],['Fuso',lastReport.timezone],['Consultado em',lastReport.readAt],...Object.entries(lastReport.totals),[],['Setor histórico','Providência','Quantidade'],...lastReport.eventsBySector.map(e=>[e.sector||'A conferir',actions[e.action]||e.action,e.count])].map(r=>r.map(safe).join(';')).join('\r\n');const url=URL.createObjectURL(new Blob(['\uFEFF'+data],{type:'text/csv;charset=utf-8'})),a=el('a');a.href=url;a.download='relatorio-'+lastReport.period+'-'+lastReport.label+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 $('userForm').onsubmit=e=>{e.preventDefault();const password=$('userPassword').value;$('userPassword').value='';run(async()=>{await request('/api/identidade',{action:'create-user',profile:{name:$('userName').value,email:$('userEmail').value,password,role:$('userRole').value,sectors:$('userSectors').value.split(',').map(s=>s.trim()).filter(Boolean)}});$('userForm').reset();message('Usuário criado. Oriente a troca da senha no primeiro acesso.');await loadDirectory();await loadAdmin();},e.submitter);};
 $('calendarForm').onsubmit=e=>{e.preventDefault();run(async()=>{await request('/api/meu-dia',{action:'calendar',day:$('calendarDay').value,kind:$('calendarKind').value,label:$('calendarLabel').value});message('Calendário salvo. Prazos já atribuídos são preservados; confira atividades existentes antes de ajustá-los.');await loadAdmin();},e.submitter);};
 $('passwordForm').onsubmit=e=>{e.preventDefault();const currentPassword=$('currentPassword').value,newPassword=$('newPassword').value;$('passwordForm').reset();run(async()=>{await request('/api/identidade',{action:'change-password',currentPassword,newPassword});message('Senha alterada. Entre novamente com sua senha atual.');epoch++;user=null;accessState=null;showSession();},e.submitter);};
 window.addEventListener('beforeunload',e=>{if(client.state().pending||drafts.size){e.preventDefault();e.returnValue='';}});
 run(async()=>{const r=await request('/api/identidade?access=1');if(r.user)await entered(r.user);else{accessState=r.access;showSession();const notice=r.access==='pending'?'Aguardando autorização do administrador. Após a aprovação, atualize esta página.':r.access==='denied'?'Sua solicitação de acesso foi recusada.':r.access==='inactive'?'Seu acesso está inativo. Consulte o administrador.':'Entre com sua senha da Central ou com Google.';message(notice);if($('accessNotice'))$('accessNotice').textContent=notice;}}).then(()=>{if(!user)showSession();});
})();

