/* Persistent program UI. The initial Sheets snapshot is kept in the database, never reapplied on reload. */
(() => {
  'use strict';
  let revision = null, loading = false, calculation = null, creditRows = [], sectorOptions = [];
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
  const history = document.createElement('div'); history.className = 'panel hidden'; $('data').prepend(history);
  const dialog = document.createElement('dialog');
  dialog.style.cssText = 'max-width:850px;width:90%;max-height:85vh;background:#142438;color:#eef4fc;border:1px solid #39506c;border-radius:14px;padding:24px';
  document.body.append(dialog);
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
      for (const key of Object.keys(stores)) delete stores[key]; Object.assign(stores, d.datasets); revision = d.revision; calculation = d.calculation; creditRows = d.credits || []; sectorOptions = d.sectors || [];
      updateHome(); if (active !== 'inicio') render();
      $('notice').textContent = 'Banco do programa • ' + Object.keys(d.datasets).length + ' tabelas • Revisão ' + revision + ' • Importação preservada em ' + new Date(d.importedAt).toLocaleString('pt-BR') + '. Edições e indicadores recalculados no programa • ' + (calculation?.formulas || 0) + ' cálculos automáticos.' + (calculation?.errors?.length ? ' Atenção: há cálculos inválidos; confira os dados de origem.' : '');
      return true;
    } catch (e) { $('notice').textContent = e.message + ' Dados anteriores preservados.'; return false; }
    finally { loading = false; sync.disabled = false; }
  }
  sync.onclick = () => load(true);
  const oldRender = render;
  render = function () {
    oldRender();
    const creditView=active==='creditos'&&selected().tab==='NCs e prazos';
    $('creditDistribute').style.display=active==='creditos'?'':'none';
    $('programAdd').textContent=creditView?'Cadastrar NC':'Novo registro';
    $('columnControls').style.display=creditView?'none':'';
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
  function creditQuery(){const term=$('search').value.toLocaleLowerCase('pt-BR');return creditRows.filter(c=>[c.nc,c.nd,c.purpose,...c.sectorNames].join(' ').toLocaleLowerCase('pt-BR').includes(term));}
  const creditHeaders=['NC','ND','Recebido','Empenhado','Disponível na NC','Distribuído por nós','Saldo para distribuir','Setores'];
  const creditValues=c=>[c.nc,c.nd,money(c.receivedCents),money(c.committedCents),money(c.availableCents),money(c.distributedCents),money(c.freeCents),c.sectorNames.join(', ')];
  function renderCredits(){
    const rows=creditQuery();
    $('table').innerHTML='<p>“Distribuído por nós” soma as distribuições não canceladas. O saldo para distribuir desconta somente as reservas em aberto.</p><table><thead><tr>'+['NC','Distribuído por nós','Saldo para distribuir','Setores'].map(h=>'<th>'+esc(h)+'</th>').join('')+'<th>Ação</th></tr></thead><tbody>'+rows.map(c=>'<tr>'+'<td>'+esc(c.nc)+'<small style="display:block;color:#a7b6c9;white-space:normal">ND '+esc(c.nd)+'<br>Disponível na NC: '+esc(money(c.availableCents))+'</small></td><td style="font-weight:700;color:#67c8bd">'+esc(money(c.distributedCents))+'</td><td>'+esc(money(c.freeCents))+'</td><td style="white-space:normal">'+esc(c.sectorNames.join(', '))+'</td>'+'<td><button class="btn primary" data-distribute-row="'+c.row+'" '+(!c.canDistribute?'disabled':'')+'>Distribuir</button> <button class="btn" data-edit-credit="'+c.row+'">Editar NC</button>'+(c.issue?'<p>'+esc(c.issue)+'</p>':'')+'</td></tr>').join('')+'</tbody></table>';
    $('table').querySelectorAll('[data-distribute-row]').forEach(b=>b.onclick=()=>distributeCredit(Number(b.dataset.distributeRow)));
    $('table').querySelectorAll('[data-edit-credit]').forEach(b=>b.onclick=()=>edit(Number(b.dataset.editCredit)));
    $('moduleInfo').textContent=rows.length+' NCs • Distribuições internas por setor • Revisão '+revision;
  }
  function distributeCredit(ncRow=null){
    if(revision===null)return;
    const expectedRevision=revision;
    dialog.innerHTML='<form><h2>Distribuir crédito</h2><label style="display:block;margin:12px 0">NC<select name="ncRow" required style="display:block;width:100%;padding:10px"><option value="">Escolha a NC</option>'+creditRows.map(c=>'<option value="'+c.row+'" '+(!c.canDistribute?'disabled':'')+'>'+esc(c.nc+' • '+c.nd+' • Livre: '+money(c.freeCents))+'</option>').join('')+'</select></label><p id="creditBalance"></p><label style="display:block;margin:12px 0">Setor de destino<input name="sector" list="creditSectors" required maxlength="100" placeholder="Escolha ou digite o setor" style="display:block;width:100%;padding:10px"></label><datalist id="creditSectors">'+sectorOptions.map(s=>'<option value="'+esc(s)+'"></option>').join('')+'</datalist><label style="display:block;margin:12px 0">Quanto distribuir (R$)<input name="amount" required inputmode="decimal" placeholder="Ex.: 1.500,00" style="display:block;width:100%;padding:10px"></label><details><summary>Responsável e observação (opcional)</summary><label style="display:block;margin:12px 0">Responsável<input name="actor" maxlength="100" style="display:block;width:100%"></label><label style="display:block;margin:12px 0">Observação<textarea name="note" maxlength="1200" style="display:block;width:100%"></textarea></label></details><div class="actions" style="margin-top:18px"><button class="btn primary" type="submit">Confirmar distribuição</button><button class="btn" type="button" id="creditCancel">Cancelar</button></div><p id="creditResult" role="status"></p></form>';
    const form=dialog.querySelector('form');form.elements.actor.value=localStorage.getItem('central-actor')||'';
    if(ncRow!==null)form.elements.ncRow.value=String(ncRow);
    form.elements.ncRow.onchange=()=>{const c=creditRows.find(c=>c.row===Number(form.elements.ncRow.value));dialog.querySelector('#creditBalance').textContent=form.elements.ncRow.value&&c?'Já distribuído: '+money(c.distributedCents)+' • Saldo para distribuir: '+money(c.freeCents):'';};form.elements.ncRow.onchange();
    let pending=null;dialog.querySelector('#creditCancel').onclick=()=>dialog.close();
    form.onsubmit=async e=>{
      e.preventDefault();const value=form.elements.amount.value.trim();
      if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(value)){dialog.querySelector('#creditResult').textContent='Informe o valor em reais, por exemplo 1.500,00.';return;}
      const amountCents=Math.round(Number(value.replace(/\./g,'').replace(',','.'))*100);
      const credit=creditRows.find(c=>c.row===Number(form.elements.ncRow.value));
      if(!credit||!Number.isSafeInteger(amountCents)||amountCents<=0||amountCents>credit.freeCents){dialog.querySelector('#creditResult').textContent='Informe um valor maior que zero, dentro do saldo livre da NC.';return;}
      const command={id:pending?.id||crypto.randomUUID(),action:'distribute-credit',revision:expectedRevision,ncRow:credit.row,sector:form.elements.sector.value.trim(),amountCents,actor:form.elements.actor.value.trim()||'Operador do painel',note:form.elements.note.value.trim()};
      if(pending&&JSON.stringify(command)!==JSON.stringify(pending)){dialog.querySelector('#creditResult').textContent='Confirme o envio anterior com os mesmos dados antes de alterá-los.';return;}
      pending=command;const button=form.querySelector('[type=submit]');button.disabled=true;
      try{await request('/api/programa',command);if(form.elements.actor.value.trim())localStorage.setItem('central-actor',command.actor);dialog.close();await load();$('notice').textContent+=' Distribuição salva: '+money(amountCents)+' para '+command.sector+'.';}
      catch(error){if([400,401,409].includes(error.status))pending=null;dialog.querySelector('#creditResult').textContent=error.message+(error.status===409?' Feche o formulário e atualize os créditos.':' Mantenha o formulário aberto se o envio estiver sem confirmação.');}
      finally{button.disabled=false;}
    };dialog.showModal();
  }
  $('creditDistribute').onclick=()=>distributeCredit();
  const oldExport=$('export').onclick,oldPrint=$('printPdf').onclick;
  $('export').onclick=()=>{if(active!=='creditos'||selected().tab!=='NCs e prazos')return oldExport();const lines=[creditHeaders,...creditQuery().map(creditValues)].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(';')).join('\r\n');const url=URL.createObjectURL(new Blob(['\uFEFF'+lines],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='creditos-e-distribuicoes.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  $('printPdf').onclick=()=>active==='creditos'&&selected().tab==='NCs e prazos'?window.print():oldPrint();
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
  $('programAdd').onclick = () => edit();
  $('programHistory').onclick = async () => {
    history.classList.remove('hidden'); history.textContent = 'Consultando histórico...';
    try { const { events } = await request('/api/programa?history=1'); history.innerHTML = '<h2>Alterações no programa</h2>' + (events.length ? events.map(e => '<details><summary>Revisão ' + e.revision + ' • ' + esc(e.actor) + ' • ' + esc(e.after_data?.tab) + ' • ' + new Date(e.created_at).toLocaleString('pt-BR') + '</summary><p>' + esc(e.reason) + '</p><p>Antes: ' + esc(JSON.stringify(e.before_data?.values)) + '</p><p>Depois: ' + esc(JSON.stringify(e.after_data?.values)) + '</p></details>').join('') : '<p>Nenhuma edição após a importação.</p>'); }
    catch (e) { history.textContent = e.message; }
  };
  // Existing bearer sessions are exchanged once for a secure, HttpOnly cookie.
  load();
})();
