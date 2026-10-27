/* Persistent program UI. The initial Sheets snapshot is kept in the database, never reapplied on reload. */
(() => {
  'use strict';
  let revision = null, loading = false, calculation = null;
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
  controls.innerHTML = '<button class="btn primary" id="programAdd">Novo registro</button><button class="btn" id="programHistory">Histórico de alterações</button>';
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
      for (const key of Object.keys(stores)) delete stores[key]; Object.assign(stores, d.datasets); revision = d.revision; calculation = d.calculation;
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
    const { data } = selected(); if (!data || revision === null) return;
    const table = $('table').querySelector('table'); if (!table) return;
    const th = document.createElement('th'); th.textContent = 'Ação'; table.querySelector('thead tr').append(th);
    table.querySelectorAll('tbody tr').forEach((tr, index) => {
      const td = document.createElement('td'), button = document.createElement('button'); button.className = 'btn'; button.textContent = 'Editar';
      button.onclick = () => edit(data.rows.indexOf(filtered[index])); td.append(button); tr.append(td);
    });
    $('moduleInfo').textContent = selected().tab + ' • ' + filtered.length + ' registros • Banco do programa • Revisão ' + revision;
  };
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
