'use strict';
(()=>{
 const $=id=>document.getElementById(id);let tab=null,offset=0,current=null,epoch=0,timer,canBrowseRaw=false;
 const legacyAreas={credits:'NCs e prazos',distribution:'Distribuições detalhadas',commitments:'NEs e liquidação',processes:'Processos e PRO',goals:'Base para metas',contracts:'Contratos e fiscais'};
 async function get(params){const r=await fetch('/api/central?fontes=1&'+new URLSearchParams(params),{credentials:'same-origin',cache:'no-store'}),d=await r.json();if(!r.ok){const e=Error(d.error||'Consulta indisponível.');e.status=r.status;throw e;}return d;}
 function cardSource(source){
  const card=document.createElement('article');card.className='source-overview-card';
  const title=document.createElement('h3');title.textContent=source.name;
  const paragraph=document.createElement('p');paragraph.textContent=source.purpose;
  const status=document.createElement('p');status.textContent=source.status;
  const date=document.createElement('p');date.textContent='Última sincronização confirmada: '+(source.lastSyncedAt?new Date(source.lastSyncedAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Não informada')+(source.lastSourceDate?' · Data da fonte: '+source.lastSourceDate:'');
  const link=document.createElement('a');link.textContent='Abrir planilha no Google Drive';link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';
  card.append(title,paragraph,status,date,link);return card;
 }
 function drawCatalog(catalog){
  $('sourceTabs').replaceChildren();
  for(const s of catalog){
   const a=document.createElement('a');a.textContent=s.title+(s.count===null?'':' · '+s.count);
   a.href=canBrowseRaw?'/central?tab='+encodeURIComponent(s.title):s.url;
   if(!canBrowseRaw){a.target='_blank';a.rel='noopener noreferrer';}
   a.setAttribute('aria-current',s.title===tab?'page':'false');
   if(canBrowseRaw)a.onclick=e=>{e.preventDefault();tab=s.title;offset=0;$('sourceSearch').value='';load();};
   $('sourceTabs').append(a);
  }
 }
 function overview(d){
  canBrowseRaw=d.canBrowseRaw===true;
  $('sourceOverview').replaceChildren(...(d.sources||[]).map(cardSource));
  $('sourceMeta').textContent='Última sincronização da base principal: '+(d.lastSyncAt?new Date(d.lastSyncAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Não informada')+' · Data da fonte: '+(d.sourceDate||'A conferir')+' · Última tentativa: '+(d.latestRun||'Não informada');
  $('sourceOverviewHelp').textContent='As planilhas são lidas para atualização do retrato no Neon. A leitura de referências SIAFI complementa a identificação de NC/NE, ND e PI. As alterações manuais e o histórico são mantidos separadamente no sistema. '+(canBrowseRaw?'Selecione uma aba abaixo para consultar os dados originais preservados.':'A consulta integral de linhas é restrita aos gestores. Os links das planilhas estão disponíveis conforme suas permissões no Drive.');
  $('sourceMessage').textContent=d.notice||'Fontes consultadas.';
  drawCatalog(d.tabs||[]);
 }

 async function load(){const generation=++epoch;$('sourceMessage').textContent='Consultando os dados preservados…';try{
  const d=await get({tab,q:$('sourceSearch').value,offset:String(offset)});if(generation!==epoch)return;current=d;drawCatalog(d.catalog);$('sourceAccess').hidden=true;$('sourceWorkspace').hidden=false;$('sourceTitle').textContent=tab;$('sourceMeta').textContent='Última sincronização: '+new Date(d.updatedAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+' · Data da fonte: '+(d.sourceDate||'A conferir');$('sourceMessage').textContent=d.notice;
  const width=Math.max(d.headers.length,...d.rows.map(r=>r.length));const headers=Array.from({length:width},(_,i)=>d.headers[i]||'Coluna '+(i+1));$('sourceContent').replaceChildren(CentralTable.create({title:tab,headers,rows:d.rows.map(cells=>({cells})),empty:d.available?'Nenhum registro nesta aba e pesquisa.':'Esta aba não está presente na última carga. Os outros registros continuam preservados.'}));$('sourcePrevious').disabled=offset===0;$('sourceNext').disabled=d.nextOffset===null;$('sourcePage').textContent=(d.total?offset+1:0)+'–'+Math.min(offset+d.rows.length,d.total)+' de '+d.total;
  const sheet=d.catalog.find(s=>s.title===tab);if(sheet)$('sourceDrive').href='https://docs.google.com/spreadsheets/d/1KKeA5lKttywZp-AvILAhsmfc6XjQ86nYs3OirjE0zco/edit#gid='+sheet.id;const url=new URL(window.location.href);url.search='';url.searchParams.set('tab',tab);window.history.replaceState(null,'',url.pathname+url.search);
 }catch(e){if(generation!==epoch)return;$('sourceMessage').textContent=e.message+(current?' Última consulta exibida.':'');if([401,403].includes(e.status)){current=null;$('sourceContent').replaceChildren();$('sourceWorkspace').hidden=true;$('sourceAccess').hidden=false;}}
 }
 $('sourceSearch').oninput=()=>{clearTimeout(timer);offset=0;timer=setTimeout(load,300);};$('sourceRefresh').onclick=async()=>{try{overview(await get({overview:'1'}));if(tab&&canBrowseRaw)await load();}catch(e){$('sourceMessage').textContent=e.message;}};$('sourcePrevious').onclick=()=>{offset=Math.max(0,offset-100);load();};$('sourceNext').onclick=()=>{if(current&&current.nextOffset!==null){offset=current.nextOffset;load();}};
 $('sourcePrint').onclick=()=>CentralExport.print('sources');$('sourceExcel').onclick=async()=>{const button=$('sourceExcel');button.disabled=true;try{const exportTab=tab,q=$('sourceSearch').value;const first=await get({tab:exportTab,q,offset:'0'}),rows=[...first.rows];let next=first.nextOffset;while(next!==null){const page=await get({tab:exportTab,q,offset:String(next)});if(page.runId!==first.runId)throw Error('A fonte foi atualizada durante a exportação. Tente novamente para gerar uma planilha consistente.');rows.push(...page.rows);next=page.nextOffset;}CentralExport.download(exportTab,first.headers,rows);}catch(e){$('sourceMessage').textContent=e.message;}finally{button.disabled=false;}};
 (async()=>{
  try{
   const d=await get({overview:'1'});overview(d);
   const requested=new URLSearchParams(window.location.search).get('tab');
   if(canBrowseRaw&&requested&&d.tabs.some(s=>s.title===requested)){tab=requested;await load();}
   else{$('sourceWorkspace').hidden=true;$('sourceTitle').textContent='Planilhas sincronizadas';}
  }catch(e){
   $('sourceMessage').textContent=e.message;
   $('sourceOverviewHelp').textContent='Não foi possível obter o catálogo. Entre novamente na Central ou confira o estado da sincronização.';
   $('sourceAccess').hidden=false;
  }
 })();
})();
