'use strict';
(function(root){
  function make(tag,text,className){
    const e=document.createElement(tag);
    if(text!==undefined)e.textContent=text;
    if(className)e.className=className;
    return e;
  }
  const money=v=>Number.isSafeInteger(v)?(v/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'A conferir';
  function create(state){
    const wrapper=make('section',undefined,'goals-dashboard');
    wrapper.append(make('h2','Controle de metas · execução por tipo, setor, ND e PI'));
    wrapper.append(make('p','Dados informados pela fonte: execução dos empenhos de 2026. Metas oficiais por despesa são mostradas separadamente. A conciliação com SIAFI e RPNP deve ser confirmada.','goals-explanation'));
    const opts=make('div',undefined,'goals-filters'),body=make('div',undefined,'goals-results');
    const cols=[['expenseType','Tipo de despesa'],['sector','Setor'],['nd','ND'],['pi','PI']];
    const controls={};
    for(const [key,label] of cols){
      const holder=make('label',label),select=make('select');select.setAttribute('aria-label',label);controls[key]=select;
      holder.append(select);opts.append(holder);
    }
    wrapper.append(opts,body);
    const source=(state.commitments||[]).filter(r=>r && (r.year===2026 || /^2026NE/.test(r.number||'')));
    const value=(r,key)=>String(r[key]||'').trim()||'Não classificado';
    function selectedAt(index){
      return source.filter(r=>cols.slice(0,index).every(([key])=>!controls[key].value||value(r,key)===controls[key].value));
    }
    function fillOptions(){
      for(let i=0;i<cols.length;i++){
        const [key,label]=cols[i],s=controls[key],prior=s.value;
        const options=[...new Set(selectedAt(i).map(r=>value(r,key)))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
        s.replaceChildren(new Option('Todos — '+label,''));
        for(const o of options)s.add(new Option(o,o));
        s.value=options.includes(prior)?prior:'';
      }
    }
    function render(){
      body.replaceChildren();
      const records=selectedAt(cols.length),invalid=records.filter(r=>!Number.isSafeInteger(r.committedCents)||!Number.isSafeInteger(r.liquidatedCents)||!Number.isSafeInteger(r.remainingCents));
      const total=k=>records.reduce((sum,r)=>sum+(Number.isSafeInteger(r[k])?r[k]:0),0);
      const metric=make('div',undefined,'goals-metrics');
      for(const [label,val] of [['NEs no filtro',String(records.length)],['Empenhado (2026)',invalid.length?'A conferir':money(total('committedCents'))],['Liquidado (2026)',invalid.length?'A conferir':money(total('liquidatedCents'))],['Saldo a liquidar informado',invalid.length?'A conferir':money(total('remainingCents'))]]){
        const box=make('div',undefined,'metric');box.append(make('span',label),make('strong',val));metric.append(box);
      }
      body.append(metric);
      const notices=[];
      if(invalid.length)notices.push(invalid.length+' NE(s) com valor não confirmado; totais suspensos.');
      const comparison=total('committedCents')-total('liquidatedCents')-total('remainingCents');
      if(!invalid.length && comparison!==0)notices.push('Há diferença de '+money(Math.abs(comparison))+' entre empenhado, liquidado e saldo informado. Não é possível atribuí-la automaticamente a anulações.');
      if(!state.globalAccess)notices.push('Visão limitada aos setores autorizados do usuário.');
      if(notices.length)body.append(make('p',notices.join(' '),'goals-warning'));
      const group=new Map();
      for(const r of records){
        const key=value(r,'sector')+'\u0000'+value(r,'nd');
        if(!group.has(key))group.set(key,{sector:value(r,'sector'),nd:value(r,'nd'),count:0,committed:0,liquidated:0,remaining:0,invalid:false,items:[]});
        const g=group.get(key);g.count++;g.items.push(r);
        if(['committedCents','liquidatedCents','remainingCents'].some(k=>!Number.isSafeInteger(r[k])))g.invalid=true;
        else{g.committed+=r.committedCents;g.liquidated+=r.liquidatedCents;g.remaining+=r.remainingCents;}
      }
      const section=make('section',undefined,'data-section');
      const heading=make('div',undefined,'table-heading');
      heading.append(make('h2','Execução por setor e ND'),make('span',group.size+' grupos'));
      section.append(heading);
      const table=make('table',undefined,'goals-table'),thead=make('thead'),tr=make('tr');
      for(const h of ['Setor / ND','NEs','Empenhado','Liquidado','A liquidar','% liquidado','Ação'])tr.append(make('th',h));
      thead.append(tr);table.append(thead);
      const tbody=make('tbody');
      for(const g of [...group.values()].sort((a,b)=>b.remaining-a.remaining)){
        const row=make('tr');
        const cell=make('td');cell.append(make('strong',g.sector),make('small',g.nd));row.append(cell);
        const rate=!g.invalid&&g.committed>0?(100*g.liquidated/g.committed).toFixed(1).replace('.',',')+'%':'A conferir';
        for(const v of [String(g.count),g.invalid?'A conferir':money(g.committed),g.invalid?'A conferir':money(g.liquidated),g.invalid?'A conferir':money(g.remaining),rate])row.append(make('td',v));
        const action=make('td'),details=make('details'),summary=make('summary','Ver NEs');
        const list=make('ul');
        for(const r of g.items.sort((a,b)=>(b.remainingCents||0)-(a.remainingCents||0)).slice(0,100)){
          const li=make('li');li.append(make('strong',r.number+' · '+money(r.remainingCents)),document.createTextNode(' — '+(r.owner||'Responsável pendente')+' · '+(r.nextAction||'Verificar entrega, atesto e liquidação')));
          list.append(li);
        }
        details.append(summary,list);action.append(details);row.append(action);tbody.append(row);
      }
      table.append(tbody);section.append(table);body.append(section);
      if(!records.length)body.append(make('p','Nenhuma NE encontrada para esses filtros.','empty'));
      const goals=make('section',undefined,'goals-official');
      goals.append(make('h2','Metas por tipo de despesa · fonte original'));
      const typeFilter=controls.expenseType.value;
      const listGoals=(state.goals||[]).filter(g=>!typeFilter||g.subject.toLocaleLowerCase('pt-BR')===typeFilter.toLocaleLowerCase('pt-BR'));
      if(!listGoals.length)goals.append(make('p','Não há meta cadastrada nesta seleção; nenhuma meta foi presumida.','empty'));
      for(const g of listGoals){
        const c=make('article',undefined,'goal-card');
        c.append(make('h3',g.subject));
        c.append(make('p','Crédito da fonte: '+money(g.receivedCents)+' · Liquidado + pago informado: '+money(g.liquidatedPlusPaidCents)));
        for(const t of g.targets||[])c.append(make('p','Meta '+t.label+': '+(t.percentage||'A conferir')+' · falta informada: '+money(t.gapCents)));
        c.append(make('small','Base original da meta não conciliada com a execução das NEs por setor; não somar crédito da mesma NC repetido por ND ou setor.'));
        goals.append(c);
      }
      body.append(goals);
    }
    cols.forEach(([key],i)=>controls[key].addEventListener('change',()=>{
      for(let j=i+1;j<cols.length;j++)controls[cols[j][0]].value='';
      fillOptions();render();
    }));
    fillOptions();render();
    return wrapper;
  }
  root.CentralGoalsUI={create};
})(window);
