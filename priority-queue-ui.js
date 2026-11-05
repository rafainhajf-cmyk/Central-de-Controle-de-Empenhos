'use strict';
(function(){
 const $=id=>document.getElementById(id),make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(cls)e.className=cls;return e;};
 const money=n=>Number.isSafeInteger(n)?(n/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'A conferir';
 const day=n=>Number.isInteger(n)?n+' dia'+(n===1?'':'s'):'Data a conferir';
 function link(url,text){const a=make('a',text);a.href=url;return a;}
 function table(title,items){
  const section=make('section',undefined,'data-section');
  section.append(make('h2',title));
  if(!items.length){section.append(make('p','Nenhuma pendência neste grupo.','empty'));return section;}
  const tbl=make('table',undefined,'queue-table'),head=make('tr');
  for(const name of ['Referência','Objeto / setor','Responsável','Saldo','Dias','Próxima providência'])head.append(make('th',name));
  const thead=make('thead');thead.append(head);tbl.append(thead);
  const body=make('tbody');
  for(const item of items){
   const row=make('tr');
   const subject=make('td');subject.append(make('strong',item.subject),make('small',item.sector||''));
   for(const val of [item.number])row.append(make('td',val||'A conferir'));
   row.append(subject);
   for(const val of [item.owner||'Responsável a definir',money(item.amountCents),item.daysLabel?day(item.days):'—',item.nextAction||'A definir'])row.append(make('td',val));
   body.append(row);
  }
  tbl.append(body);section.append(tbl);return section;
 }
 function render(state,view,sector,search=''){
  const out=$('activities'),cards=$('dayCards');out.replaceChildren();cards.replaceChildren();
  const queue=CentralPriorityQueue.queue(state),needle=String(search).trim().toLocaleLowerCase('pt-BR');const filtered=items=>!needle?items:items.filter(i=>[i.number,i.subject,i.owner,i.sector,i.nextAction].join(' ').toLocaleLowerCase('pt-BR').includes(needle));
  if(view==='mine'){
   cards.append(make('h2','Minhas pendências · créditos que preciso distribuir'));
   cards.append(make('p','O saldo ainda não distribuído permanece sob sua responsabilidade. Valores reservados para setores não são cobrados aqui.'));
   out.append(table('Créditos não distribuídos',filtered(queue.mine)));
   if(queue.uncertain.length)out.append(make('p',queue.uncertain.length+' NC(s) com identificação ou conciliação pendente: não tratadas como saldo livre.','goals-warning'));
   const a=make('p');a.append(link('/gerencial?area=credits','Abrir Créditos e NCs para distribuir'));out.append(a);
  }else{
   cards.append(make('h2','Pendências por Setor · ordem de cobrança'));
   cards.append(make('p','1. Créditos distribuídos e não empenhados · 2. Empenhos segurando crédito · 3. Serviços ND 339039 · 4. Demais empenhos. O responsável cadastrado pode direcionar a pendência da Fiscalização ao ALMOX ou à APRV.'));
   const sectors=sector?[CentralPriorityQueue.sectorOf(sector)||sector]:queue.order;
   for(const s of sectors){
    if(!queue.groups[s])continue;
    const section=make('section',undefined,'queue-sector');section.append(make('h2',s));
    for(const group of queue.groups[s])section.append(table(group.label,filtered(group.items)));
    out.append(section);
   }
   if(!sectors.some(s=>queue.groups[s]))out.append(make('p','O setor selecionado não pertence aos grupos ALMOX, APRV ou Fiscalização.','empty'));
   const a=make('p');a.append(link('/gerencial?area=commitments','Conferir Empenhos e Liquidação'));out.append(a);
  }
  $('more').hidden=true;
 }
 window.CentralPriorityUI={render};
})();
