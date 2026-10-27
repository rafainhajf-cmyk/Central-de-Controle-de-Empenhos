/* Persistent program UI. The initial Sheets snapshot is kept in the database, never reapplied on reload. */
(() => {
  'use strict';
  let revision = null, loading = false, calculation = null, creditRows = [], sectorOptions = [], directoryData = {sectors:[],responsibles:[]}, directoryOpen=false, distributionRows=[], distributionGroups=[];
  const sync = $('sync');
  clearInterval(autoSyncTimer);
  document.removeEventListener('visibilitychange', runDailySync);
  operationalController = null;
  $('operational').classList.add('hidden');
  $('testWrite').style.display = 'none';
  $('keepCache').closest('.controls').style.display = 'none';
  $('file').closest('label').style.display = 'none';
  $('saveEntry').closest('.panel').style.display = 'none';
  document.querySelector('.sidebar-note').textContent = 'Dados salvos no banco do programa. A planilha foi utilizada para a importação inicial.';
  document.querySelector('.foot').textContent = 'Central Orçamentária • Edições e histórico permanentes no programa • Confira saldos oficiais no SIAFI.';
  $('home').querySelector('.grid section:last-child').innerHTML = '<h2>Trabalho no programa</h2><p>1. Abra a área desejada e escolha Editar no registro.</p><p>2. Confira os campos e salve com responsável e motivo.</p><p>3. Consulte o histórico das alterações. O programa preserva a importação original.</p><p>4. Exporte a consulta em CSV ou use Gerar PDF.</p>';
  sync.textContent = 'Atualizar dados do programa';
  const controls = document.createElement('div'); controls.className = 'controls';
  controls.innerHTML = '<button class="btn primary" id="creditDistribute" style="display:none">Distribuir crédito</button><button class="btn primary" id="programAdd">Novo registro</button><button class="btn" id="programHistory">Histórico de alterações</button>';
  $('columnControls').before(controls);
  const fiscalPanel=document.createElement('section');fiscalPanel.className='panel hidden';$('data').prepend(fiscalPanel);
  const history = document.createElement('div'); history.className = 'panel hidden'; $('data').prepend(history);
  const dialog = document.createElement('dialog');
  dialog.style.cssText = 'max-width:850px;width:90%;max-height:85vh;background:#142438;color:#eef4fc;border:1px solid #39506c;border-radius:14px;padding:24px';
  document.body.append(dialog);
  const directoryPanel=document.createElement('section');directoryPanel.className='panel hidden';$('data').after(directoryPanel);
  const directoryNav=document.createElement('button');directoryNav.className='nav';directoryNav.textContent='Cadastros';directoryNav.id='directoryNav';$('navs').prepend(directoryNav);
  const previousNav=nav;nav=function(id){directoryOpen=false;directoryPanel.classList.add('hidden');directoryNav.classList.remove('active');previousNav(id);};
  directoryNav.onclick=()=>{directoryOpen=true;$('home').classList.add('hidden');$('data').classList.add('hidden');$('operational').classList.add('hidden');directoryPanel.classList.remove('hidden');document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b===directoryNav));$('pageTitle').textContent='Cadastros';$('pageDesc').textContent='Setores e responsáveis vinculados ou isolados';renderDirectory();};
  function renderDirectory(){
    directoryPanel.classList.remove('hidden');
    const sectorName=id=>directoryData.sectors.find(s=>s.id===id)?.name||'Responsável isolado';
    directoryPanel.innerHTML='<h2>Setores e responsáveis</h2><p>Cadastre o setor e vincule os responsáveis. Para alguém sem setor, selecione “Responsável isolado”.</p><div class="actions"><button class="btn primary" id="newSector">Novo setor</button><button class="btn primary" id="newResponsible">Novo responsável</button></div><h3>Setores</h3><div class="tablewrap"><table><thead><tr><th>Setor</th><th>Responsáveis vinculados</th><th>Ação</th></tr></thead><tbody>'+directoryData.sectors.map(s=>'<tr><td>'+esc(s.name)+(s.active?'':' • inativo')+'</td><td>'+esc(directoryData.responsibles.filter(p=>p.sectorId===s.id&&p.active).map(p=>p.name).join(', ')||'Nenhum')+'</td><td><button class="btn" data-edit-sector="'+esc(s.id)+'">Editar setor</button></td></tr>').join('')+'</tbody></table></div><h3>Responsáveis</h3><div class="tablewrap"><table><thead><tr><th>Nome</th><th>Setor / vínculo</th><th>Ação</th></tr></thead><tbody>'+directoryData.responsibles.map(p=>'<tr><td>'+esc(p.name)+(p.active?'':' • inativo')+'</td><td>'+esc(p.sectorId?sectorName(p.sectorId):'Responsável isolado')+'</td><td><button class="btn" data-edit-responsible="'+esc(p.id)+'">Editar responsável</button></td></tr>').join('')+'</tbody></table></div>';
    directoryPanel.querySelector('#newSector').onclick=()=>directoryDialog('sector');directoryPanel.querySelector('#newResponsible').onclick=()=>directoryDialog('responsible');
    directoryPanel.querySelectorAll('[data-edit-sector]').forEach(b=>b.onclick=()=>directoryDialog('sector',directoryData.sectors.find(s=>s.id===b.dataset.editSector)));
    directoryPanel.querySelectorAll('[data-edit-responsible]').forEach(b=>b.onclick=()=>directoryDialog('responsible',directoryData.responsibles.find(p=>p.id===b.dataset.editResponsible)));
  }
  function directoryDialog(kind,record=null){
    if(revision===null){$('notice').textContent='Abra sua sessão antes de cadastrar.';return;}const expectedRevision=revision;
    dialog.innerHTML='<form><h2>'+(record?'Editar ':'Novo ')+(kind==='sector'?'setor':'responsável')+'</h2><label style="display:block;margin:12px 0">Nome<input name="name" required maxlength="100" style="display:block;width:100%;padding:10px"></label>'+(kind==='responsible'?'<label style="display:block;margin:12px 0">Vínculo<select name="sectorId" style="display:block;width:100%;padding:10px"><option value="">Responsável isolado (sem setor)</option>'+directoryData.sectors.filter(s=>s.active).map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>').join('')+'</select></label>':'')+'<label><input type="checkbox" name="active" checked> Cadastro ativo</label><div class="actions" style="margin-top:18px"><button class="btn primary" type="submit">Salvar cadastro</button><button class="btn" type="button" id="directoryCancel">Cancelar</button></div><p id="directoryResult" role="status"></p></form>';
    const form=dialog.querySelector('form');if(record){form.elements.name.value=record.name;form.elements.active.checked=record.active;if(kind==='responsible')form.elements.sectorId.value=record.sectorId||'';}
    let pending=null;dialog.querySelector('#directoryCancel').onclick=()=>dialog.close();
    form.onsubmit=async e=>{e.preventDefault();const command={id:pending?.id||crypto.randomUUID(),action:'save-directory',revision:expectedRevision,kind,name:form.elements.name.value.trim(),active:form.elements.active.checked,actor:localStorage.getItem('central-actor')||'Operador do painel',...(record?{recordId:record.id}:{}),...(kind==='responsible'?{sectorId:form.elements.sectorId.value||null}:{})};
      if(pending&&JSON.stringify(command)!==JSON.stringify(pending)){dialog.querySelector('#directoryResult').textContent='Confirme o envio anterior com os mesmos dados.';return;}pending=command;const button=form.querySelector('[type=submit]');button.disabled=true;
      try{await request('/api/programa',command);dialog.close();await load();$('notice').textContent+=' Cadastro salvo.';}catch(err){if([400,401,409].includes(err.status))pending=null;dialog.querySelector('#directoryResult').textContent=err.message;}finally{button.disabled=false;}
    };dialog.showModal();
  }
  function selected() { const m = modules.find(x => x[0] === active); const tab = $('dataset').dataset.selected || m[3]; return { tab, data: stores[tab] || stores[m[3]] }; }
  async function request(path, body) {
    const r = await fetch(path, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store' });
    const d = await r.json();
    if (!r.ok) { const e = Error(d.error || 'Falha na consulta'); e.status = r.status; throw e; }
    return d;
  }
  async function login(interactive) {
    let key = sessionKey;
    if (!key && interactive) key = prompt('Informe a chave do painel uma vez neste dispositivo. A sessão ficará aberta por 30 dias.');
    if (!key) return false;
    const r = await fetch('/api/sessao', { method: 'POST', headers: { Authorization: 'Bearer ' + key } });
    if (!r.ok) { rememberSessionKey(''); throw Error('Chave não reconhecida.'); }
    rememberSessionKey(''); return true;
  }
  async function load(interactive = false) {
    if (loading) return false; loading = true; sync.disabled = true;
    try {
      let d;
      try { d = await request('/api/programa'); } catch (e) {
        if (e.status !== 401) throw e;
        if (!(await login(interactive))) { $('notice').textContent = 'Abra sua sessão em Atualizar dados do programa. Os lançamentos permanecem salvos no banco.'; return false; }
        d = await request('/api/programa');
      }
      for (const sheet of SheetCatalog) if (!d.datasets?.[sheet.title]?.headers || !Array.isArray(d.datasets[sheet.title].rows)) throw Error('Consulta incompleta. Dados anteriores preservados.');
      for (const key of Object.keys(stores)) delete stores[key]; Object.assign(stores, d.datasets); revision = d.revision; calculation = d.calculation; creditRows = d.credits || []; sectorOptions = d.sectors || []; distributionRows=d.distributions?.rows||[];distributionGroups=d.distributions?.groups||[]; directoryData=d.directory||{sectors:sectorOptions.map((name,i)=>({id:String(i),name,active:true})),responsibles:[]};
      updateHome(); const pendingCredits=creditRows.filter(c=>c.fiscalPending);const card=document.createElement('div');card.className='card';card.innerHTML='<small>Pendências do fiscal</small><strong>'+pendingCredits.length+' NCs</strong><button class="btn" id="openFiscalCredits">Ver créditos não distribuídos</button>';$('cards').append(card);card.querySelector('button').onclick=()=>nav('pendencias'); if (active !== 'inicio') render(); if(directoryOpen)renderDirectory();
      $('notice').textContent = 'Banco do programa • ' + Object.keys(d.datasets).length + ' tabelas • Revisão ' + revision + ' • Importação preservada em ' + new Date(d.importedAt).toLocaleString('pt-BR') + '. Edições e indicadores recalculados no programa • ' + (calculation?.formulas || 0) + ' cálculos automáticos.' + (calculation?.errors?.length ? ' Atenção: há cálculos inválidos; confira os dados de origem.' : '');
      return true;
    } catch (e) { $('notice').textContent = e.message + ' Dados anteriores preservados.'; return false; }
    finally { loading = false; sync.disabled = false; }
  }
  sync.onclick = () => load(true);
  const oldRender = render;
  render = function () {
    oldRender();
    renderFiscalPendencies();
    const creditView=active==='creditos'&&selected().tab==='NCs e prazos';
    $('creditDistribute').style.display=active==='creditos'?'':'none';
    $('programAdd').textContent=creditView?'Cadastrar NC':'Novo registro';
    $('columnControls').style.display=(creditView||active==='distribuicao')?'none':'';
    $('dataset').style.display=active==='distribuicao'?'none':'';
    if(active==='distribuicao'&&revision!==null){$('programAdd').textContent='Nova distribuição';renderDistributions();return;}
    if(creditView&&revision!==null){renderCredits();return;}
    const { data } = selected(); if (!data || revision === null) return;
    const table = $('table').querySelector('table'); if (!table) return;
    const th = document.createElement('th'); th.textContent = 'Ação'; table.querySelector('thead tr').append(th);
    table.querySelectorAll('tbody tr').forEach((tr, index) => {
      const td = document.createElement('td'), button = document.createElement('button'); button.className = 'btn'; button.textContent = 'Editar';
      button.onclick = () => edit(data.rows.indexOf(filtered[index])); td.append(button); tr.append(td);
    });
    $('moduleInfo').textContent = selected().tab + ' • ' + filtered.length + ' registros • Banco do programa • Revisão ' + revision;
  };
  const money=cents=>cents===null||cents===undefined?'A conferir':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
  function creditQuery(){const term=$('search').value.toLocaleLowerCase('pt-BR');return creditRows.filter(c=>[c.nc,c.nd,c.purpose,c.lastAction?.diex,c.lastAction?.note,...c.sectorNames].join(' ').toLocaleLowerCase('pt-BR').includes(term));}
  const creditHeaders=['NC','ND','Recebido','Empenhado','Disponível na NC','Distribuído por nós','Saldo para distribuir','Setores','Responsável pelo saldo não distribuído','Providência / DIEx'];
  const creditValues=c=>[c.nc,c.nd,money(c.receivedCents),money(c.committedCents),money(c.availableCents),money(c.distributedCents),money(c.freeCents),c.sectorNames.join(', '),c.fiscalPending?'Fiscal':'',actionText(c.lastAction)];
  function renderCredits(){
    const rows=creditQuery();
    $('table').innerHTML='<p>“Distribuído por nós” soma as distribuições não canceladas. O saldo para distribuir desconta somente as reservas em aberto.</p><table><thead><tr>'+['NC','Distribuído por nós','Saldo para distribuir','Setores'].map(h=>'<th>'+esc(h)+'</th>').join('')+'<th>Ação</th></tr></thead><tbody>'+rows.map(c=>'<tr>'+'<td>'+esc(c.nc)+'<small style="display:block;color:#a7b6c9;white-space:normal">ND '+esc(c.nd)+'<br>Disponível na NC: '+esc(money(c.availableCents))+'</small>'+creditNote(c)+'</td><td style="font-weight:700;color:#67c8bd">'+esc(money(c.distributedCents))+'</td><td>'+esc(money(c.freeCents))+'</td><td style="white-space:normal">'+esc(c.sectorNames.join(', '))+'</td>'+'<td><button class="btn primary" data-distribute-row="'+c.row+'" '+(!c.canDistribute?'disabled':'')+'>Distribuir</button> <button class="btn" data-edit-credit="'+c.row+'">Editar NC</button> <button class="btn" data-credit-request="'+c.row+'" '+(!c.canDistribute?'disabled':'')+'>Providência</button>'+(c.issue?'<p>'+esc(c.issue)+'</p>':'')+'</td></tr>').join('')+'</tbody></table>';
    $('table').querySelectorAll('[data-distribute-row]').forEach(b=>b.onclick=()=>distributeCredit(Number(b.dataset.distributeRow)));
    $('table').querySelectorAll('[data-credit-request]').forEach(b=>b.onclick=()=>distributeCredit(Number(b.dataset.creditRequest),'recollection'));
    $('table').querySelectorAll('[data-edit-credit]').forEach(b=>b.onclick=()=>edit(Number(b.dataset.editCredit)));
    $('moduleInfo').textContent=rows.length+' NCs • Distribuições internas por setor • Revisão '+revision;
  }
  const distributionHeaders=['NC','Setor','Responsável','Saldo distribuído em aberto','Recebimento pelo setor','Dias com o setor','Observação'];
  const distributionValues=r=>[r.nc,r.sector||(r.responsible?'Sem setor — responsável isolado':'Destino a confirmar'),r.responsible||'Não informado',money(r.amountCents),r.receivedDisplay,r.days===null?'Data a confirmar':String(r.days),r.note];
  function distributionQuery(){const term=$('search').value.toLocaleLowerCase('pt-BR');return distributionRows.filter(r=>[r.nc,r.sector,r.responsible,r.note].join(' ').toLocaleLowerCase('pt-BR').includes(term));}
  function renderDistributions(){
    const rows=distributionQuery(),sum=rows.reduce((n,r)=>n+(r.amountCents||0),0),unknown=rows.some(r=>r.amountCents===null);
    $('pageDesc').textContent='Saldos de NC distribuídos e tempo de recebimento por setor e responsável';
    $('moduleInfo').textContent=rows.length+' distribuições em aberto • Saldo: '+(unknown?'A conferir':money(sum))+' • Dias corridos desde o recebimento pelo destinatário';
    $('table').innerHTML='<p>Somente NCs distribuídas em aberto. A contagem começa no dia em que o setor ou responsável recebeu cada distribuição.</p><div class="controls">'+distributionGroups.map(g=>'<div style="padding:10px;border:1px solid #39506c;border-radius:8px"><strong>'+esc(g.name)+'</strong><small style="display:block">'+esc(g.uncertain?'Saldo a conferir':money(g.amountCents))+' • '+g.count+' distribuição(ões)'+(g.oldestDays!==null?' • mais antiga: '+g.oldestDays+' dias':'')+'</small></div>').join('')+'</div><table><thead><tr>'+['NC','Dias com o setor','Setor / responsável','Saldo distribuído','Recebimento pelo setor'].map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.nc)+(r.note?'<small style="display:block;white-space:normal;max-width:180px;color:#a7b6c9">'+esc(r.note)+'</small>':'')+'</td><td style="font-size:18px;font-weight:700;color:#67c8bd;white-space:normal">'+esc(r.days===null?'Data a confirmar':r.days+' dias')+'</td><td style="white-space:normal">'+esc(r.sector||(r.responsible?'Responsável isolado':'Destino a confirmar'))+'<small style="display:block">'+esc(r.responsible||'Responsável não informado')+'</small></td><td>'+esc(money(r.amountCents))+(r.issue?'<small>'+esc(r.issue)+'</small>':'')+'</td><td>'+esc(r.receivedDisplay)+'<button style="display:block;margin-top:6px" class="btn" data-received-row="'+r.row+'">'+(r.days===null?'Informar recebimento':'Corrigir recebimento')+'</button></td></tr>').join('')+'</tbody></table>'+(rows.length?'':'<p>Nenhum saldo de NC distribuído em aberto para esta pesquisa.</p>');
    $('table').querySelectorAll('[data-received-row]').forEach(b=>b.onclick=()=>receivedDialog(Number(b.dataset.receivedRow)));
  }
  function receivedDialog(row){
    const record=distributionRows.find(r=>r.row===row);if(!record)return;const expectedRevision=revision;
    dialog.innerHTML='<form><h2>Recebimento pelo setor</h2><p>'+esc(record.nc+' • '+(record.sector||record.responsible||'Destino a confirmar'))+'</p><label>Data real de recebimento<input name="receivedDate" type="date" required style="display:block;width:100%;padding:12px"></label><div class="actions" style="margin-top:18px"><button class="btn primary" type="submit">Salvar recebimento</button><button class="btn" id="receivedCancel" type="button">Cancelar</button></div><p id="receivedResult" role="status"></p></form>';
    const form=dialog.querySelector('form');form.elements.receivedDate.value=record.receivedDate||'';let pending=null;dialog.querySelector('#receivedCancel').onclick=()=>dialog.close();
    form.onsubmit=async e=>{e.preventDefault();const command={id:pending?.id||crypto.randomUUID(),action:'distribution-received-date',revision:expectedRevision,row,receivedDate:form.elements.receivedDate.value,actor:localStorage.getItem('central-actor')||'Operador do painel'};
      if(pending&&JSON.stringify(command)!==JSON.stringify(pending)){dialog.querySelector('#receivedResult').textContent='Confirme o envio anterior com a mesma data.';return;}pending=command;const button=form.querySelector('[type=submit]');button.disabled=true;
      try{await request('/api/programa',command);dialog.close();await load();$('notice').textContent+=' Data de recebimento salva; contagem de dias atualizada.';}catch(err){if([400,401,409].includes(err.status))pending=null;dialog.querySelector('#receivedResult').textContent=err.message;}finally{button.disabled=false;}
    };dialog.showModal();
  }
  function actionText(a){return a?(a.kind==='distribution'?'Distribuído para '+a.sector:(a.kind==='recollection'?'Sol. recolhimento':'Mudança de ND → '+a.targetNd)+' • DIEx '+a.diex)+(a.note?' • '+a.note:''):'';}
  function creditNote(c){return '<small style="display:block;white-space:normal;margin-top:6px;color:#f4cf83">'+(c.fiscalPending?'Pendência do fiscal'+(c.freeCents!==null?' • '+esc(money(c.freeCents))+' não distribuídos':' • conferir saldo'):'')+'</small>'+(c.lastAction?'<small style="display:block;white-space:normal;color:#a7b6c9">'+esc(actionText(c.lastAction))+'</small>':'');}
  function renderFiscalPendencies(){
    fiscalPanel.classList.toggle('hidden',active!=='pendencias');if(active!=='pendencias')return;
    const rows=creditRows.filter(c=>c.fiscalPending);
    fiscalPanel.innerHTML='<h2>Pendências do fiscal — créditos não distribuídos</h2><p>O saldo sem distribuição permanece sob responsabilidade do fiscal, inclusive quando já há DIEx de recolhimento ou mudança de ND aguardando execução.</p>'+rows.map(c=>'<div style="padding:10px;border-bottom:1px solid #39506c"><strong>'+esc(c.nc)+' • '+esc(money(c.freeCents))+'</strong><small style="display:block">'+esc(c.issue||actionText(c.lastAction)||'Definir a destinação do crédito')+'</small><button class="btn" data-fiscal-credit="'+c.row+'">Registrar providência</button></div>').join('')+(rows.length?'':'<p>Nenhum crédito não distribuído.</p>');
    fiscalPanel.querySelectorAll('[data-fiscal-credit]').forEach(b=>b.onclick=()=>distributeCredit(Number(b.dataset.fiscalCredit),'recollection'));
  }
  function distributeCredit(ncRow=null,kind='distribution'){
    if(revision===null)return;const expectedRevision=revision;
    dialog.innerHTML='<form><h2>Destinação do crédito</h2><label style="display:block;margin:12px 0">Ação<select name="kind" style="display:block;width:100%;padding:10px"><option value="distribution">Distribuir para setor</option><option value="recollection">Solicitar recolhimento</option><option value="nd-change">Solicitar mudança de ND</option></select></label><label style="display:block;margin:12px 0">NC<select name="ncRow" required style="display:block;width:100%;padding:10px"><option value="">Escolha a NC</option>'+creditRows.map(c=>'<option value="'+c.row+'" '+(!c.canDistribute?'disabled':'')+'>'+esc(c.nc+' • '+c.nd+' • Livre: '+money(c.freeCents))+'</option>').join('')+'</select></label><p id="creditBalance"></p><label style="display:block;margin:12px 0">Setor de destino<input name="sector" list="creditSectors" maxlength="100" style="display:block;width:100%;padding:10px"></label><datalist id="creditSectors">'+sectorOptions.map(s=>'<option value="'+esc(s)+'"></option>').join('')+'</datalist><label style="display:block;margin:12px 0">Responsável pelo crédito<select name="responsibleId" style="display:block;width:100%;padding:10px"><option value="">Sem responsável definido</option></select></label><label style="display:block;margin:12px 0">Recebimento da NC pelo setor<input name="receivedDate" type="date" style="display:block;width:100%;padding:10px"></label><label style="display:block;margin:12px 0">Valor (R$)<input name="amount" required inputmode="decimal" placeholder="Ex.: 1.500,00" style="display:block;width:100%;padding:10px"></label><label style="display:block;margin:12px 0">Número do DIEx<input name="diex" maxlength="100" placeholder="Ex.: 123/2026" style="display:block;width:100%;padding:10px"></label><label style="display:block;margin:12px 0">Nova ND<input name="targetNd" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="Ex.: 339039" style="display:block;width:100%;padding:10px"></label><label style="display:block;margin:12px 0">Observação curta (opcional)<input name="note" maxlength="300" placeholder="Escreva um breve acompanhamento" style="display:block;width:100%;padding:10px"></label><details><summary>Responsável pelo registro (opcional)</summary><input name="actor" maxlength="100" style="width:100%"></details><p id="creditRequestInfo" style="font-size:12px">A solicitação fica pendente com o fiscal. Saldo e ND só mudam quando a execução for confirmada nos dados do crédito.</p><div class="actions" style="margin-top:18px"><button class="btn primary" type="submit">Confirmar distribuição</button><button class="btn" type="button" id="creditCancel">Cancelar</button></div><p id="creditResult" role="status"></p></form>';
    const form=dialog.querySelector('form');form.elements.actor.value=localStorage.getItem('central-actor')||'';form.elements.kind.value=kind;form.elements.receivedDate.value=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());if(ncRow!==null)form.elements.ncRow.value=String(ncRow);
    const updateResponsible=()=>{const old=form.elements.responsibleId.value,sector=directoryData.sectors.find(s=>s.active&&s.name.toLocaleLowerCase('pt-BR')===form.elements.sector.value.trim().toLocaleLowerCase('pt-BR'));const people=directoryData.responsibles.filter(p=>p.active&&(!p.sectorId||p.sectorId===sector?.id));form.elements.responsibleId.innerHTML='<option value="">Sem responsável definido</option>'+people.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name+(p.sectorId?'':' • isolado'))+'</option>').join('');if(people.some(p=>p.id===old))form.elements.responsibleId.value=old;const person=people.find(p=>p.id===form.elements.responsibleId.value);form.elements.sector.required=form.elements.kind.value==='distribution'&&!(person&&!person.sectorId);};
    form.elements.sector.oninput=updateResponsible;form.elements.responsibleId.onchange=updateResponsible;updateResponsible();
    const toggle=()=>{const isDistribution=form.elements.kind.value==='distribution',isNd=form.elements.kind.value==='nd-change';for(const[name,show]of [['sector',isDistribution],['receivedDate',isDistribution],['diex',!isDistribution],['targetNd',isNd]]){form.elements[name].closest('label').style.display=show?'block':'none';form.elements[name].required=show;}form.elements.responsibleId.closest('label').style.display=isDistribution?'block':'none';updateResponsible();dialog.querySelector('#creditRequestInfo').style.display=isDistribution?'none':'block';form.querySelector('[type=submit]').textContent=isDistribution?'Confirmar distribuição':'Registrar solicitação';};form.elements.kind.onchange=toggle;toggle();
    form.elements.ncRow.onchange=()=>{const c=creditRows.find(c=>c.row===Number(form.elements.ncRow.value));dialog.querySelector('#creditBalance').textContent=form.elements.ncRow.value&&c?'Já distribuído: '+money(c.distributedCents)+' • Saldo para destinar: '+money(c.freeCents):'';};form.elements.ncRow.onchange();
    let pending=null;dialog.querySelector('#creditCancel').onclick=()=>dialog.close();
    form.onsubmit=async e=>{
      e.preventDefault();const value=form.elements.amount.value.trim();if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(value)){dialog.querySelector('#creditResult').textContent='Informe o valor em reais, por exemplo 1.500,00.';return;}
      const amountCents=Math.round(Number(value.replace(/\./g,'').replace(',','.'))*100),credit=creditRows.find(c=>c.row===Number(form.elements.ncRow.value));
      if(!credit||!Number.isSafeInteger(amountCents)||amountCents<=0||amountCents>credit.freeCents){dialog.querySelector('#creditResult').textContent='Informe um valor maior que zero, dentro do saldo livre da NC.';return;}
      const isDistribution=form.elements.kind.value==='distribution';const command={id:pending?.id||crypto.randomUUID(),action:isDistribution?'distribute-credit':'credit-request',revision:expectedRevision,ncRow:credit.row,amountCents,actor:form.elements.actor.value.trim()||'Operador do painel',note:form.elements.note.value.trim(),...(isDistribution?{sector:form.elements.sector.value.trim(),receivedDate:form.elements.receivedDate.value,...(form.elements.responsibleId.value?{responsibleId:form.elements.responsibleId.value}:{})}:{kind:form.elements.kind.value,diex:form.elements.diex.value.trim(),targetNd:form.elements.kind.value==='nd-change'?form.elements.targetNd.value.trim():''})};
      if(pending&&JSON.stringify(command)!==JSON.stringify(pending)){dialog.querySelector('#creditResult').textContent='Confirme o envio anterior com os mesmos dados antes de alterá-los.';return;}
      pending=command;const button=form.querySelector('[type=submit]');button.disabled=true;
      try{await request('/api/programa',command);if(form.elements.actor.value.trim())localStorage.setItem('central-actor',command.actor);dialog.close();await load();$('notice').textContent+=isDistribution?' Distribuição salva.':' Solicitação registrada com DIEx '+command.diex+' • acompanhamento do fiscal.';}
      catch(error){if([400,401,409].includes(error.status))pending=null;dialog.querySelector('#creditResult').textContent=error.message+(error.status===409?' Feche o formulário e atualize os créditos.':' Mantenha o formulário aberto se o envio estiver sem confirmação.');}finally{button.disabled=false;}
    };dialog.showModal();
  }
  $('creditDistribute').onclick=()=>distributeCredit();
  const oldExport=$('export').onclick,oldPrint=$('printPdf').onclick;
  $('export').onclick=()=>{if(active==='distribuicao'){const lines=[distributionHeaders,...distributionQuery().map(distributionValues)].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(';')).join('\r\n');const url=URL.createObjectURL(new Blob(['\uFEFF'+lines],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='saldos-nc-por-setor.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}if(active!=='creditos'||selected().tab!=='NCs e prazos')return oldExport();const lines=[creditHeaders,...creditQuery().map(creditValues)].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(';')).join('\r\n');const url=URL.createObjectURL(new Blob(['\uFEFF'+lines],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='creditos-e-distribuicoes.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  $('printPdf').onclick=()=>active==='distribuicao'||active==='creditos'&&selected().tab==='NCs e prazos'?window.print():oldPrint();
  function edit(row = null) {
    const { tab, data } = selected();
    if (!data || revision === null) return;
    if (tab === 'Lançamentos do aplicativo' && row !== null) { alert('O histórico original é permanente. Use Novo registro para acrescentar uma correção.'); return; }
    const original = row === null ? [] : data.rows[row];
    const size = Math.max(data.headers.length, original.length);
    const expectedRevision = revision;
    dialog.innerHTML = '<form><h2>' + (row === null ? 'Novo registro' : 'Editar registro ' + (row + 1)) + ' — ' + esc(tab) + '</h2><p>Confira os campos antes de salvar. Os campos calculados são atualizados automaticamente após salvar os dados de origem.</p><div id="programFields"></div><label style="display:block;margin:12px 0">Responsável<input name="actor" required maxlength="100" style="display:block;width:95%"></label><label style="display:block;margin:12px 0">Motivo da alteração<textarea name="reason" required minlength="5" maxlength="1200" style="display:block;width:95%"></textarea></label><div class="actions"><button class="btn primary" type="submit">Salvar no programa</button><button class="btn" type="button" id="programCancel">Cancelar</button></div><p id="programResult" role="status"></p></form>';
    const fields = dialog.querySelector('#programFields');
    for (let i = 0; i < size; i++) {
      const label = document.createElement('label'); label.style.cssText = 'display:block;margin:10px 0'; label.textContent = data.headers[i] || 'Coluna ' + (i + 1);
      const input = document.createElement('textarea'); input.name = 'field-' + i;
      let letters='';for(let n=i+1;n;n=Math.floor((n-1)/26))letters=String.fromCharCode(65+(n-1)%26)+letters;
      const calculated=(row===null&&(calculation?.templateColumns?.[tab]||[]).includes(i))||(calculation?.cells?.[tab]||[]).includes(letters+(row===null?data.rows.length+2:row+2));
      if(calculated){input.readOnly=true;input.title='Calculado automaticamente a partir dos dados de origem';label.append(document.createTextNode(' • calculado'));input.style.opacity='0.65';} input.value = original[i] ?? ''; input.maxLength = 10000; input.rows = input.value.length > 100 ? 3 : 1; input.style.cssText = 'display:block;width:95%;padding:8px'; label.append(input); fields.append(label);
    }
    const form = dialog.querySelector('form'); form.elements.actor.value = localStorage.getItem('central-actor') || '';
    let pending = null;
    dialog.querySelector('#programCancel').onclick = () => dialog.close();
    form.onsubmit = async e => {
      e.preventDefault();
      const command = { id: pending?.id || crypto.randomUUID(), action: row === null ? 'add-row' : 'edit-row', tab, row, revision: expectedRevision, actor: form.elements.actor.value.trim(), reason: form.elements.reason.value.trim(), values: Array.from({ length: size }, (_, i) => form.elements['field-' + i].value) };
      if (pending && JSON.stringify(command) !== JSON.stringify(pending)) { dialog.querySelector('#programResult').textContent = 'O envio anterior está sem confirmação. Mantenha os mesmos dados e tente confirmar antes de alterar os campos.'; return; }
      pending = command;
      const button = form.querySelector('[type=submit]'); button.disabled = true;
      try {
        await request('/api/programa', command); localStorage.setItem('central-actor', command.actor); dialog.close(); await load(); $('notice').textContent += ' Alteração salva com histórico.';
      } catch (err) {
        if (err.status) pending = null;
        dialog.querySelector('#programResult').textContent = err.status === 409 ? err.message + ' Copie sua edição e feche o formulário para atualizar os dados.' : err.message + ' Sem confirmação de gravação; mantenha este formulário aberto e tente novamente com os mesmos dados.';
      } finally { button.disabled = false; }
    };
    dialog.showModal();
  }
  $('programAdd').onclick = () => active==='distribuicao'?distributeCredit():edit();
  $('programHistory').onclick = async () => {
    history.classList.remove('hidden'); history.textContent = 'Consultando histórico...';
    try { const { events } = await request('/api/programa?history=1'); history.innerHTML = '<h2>Alterações no programa</h2>' + (events.length ? events.map(e => '<details><summary>Revisão ' + e.revision + ' • ' + esc(e.actor) + ' • ' + esc(e.after_data?.tab) + ' • ' + new Date(e.created_at).toLocaleString('pt-BR') + '</summary><p>' + esc(e.reason) + '</p><p>Antes: ' + esc(JSON.stringify(e.before_data?.values)) + '</p><p>Depois: ' + esc(JSON.stringify(e.after_data?.values)) + '</p></details>').join('') : '<p>Nenhuma edição após a importação.</p>'); }
    catch (e) { history.textContent = e.message; }
  };
  // Existing bearer sessions are exchanged once for a secure, HttpOnly cookie.
  load();
})();
