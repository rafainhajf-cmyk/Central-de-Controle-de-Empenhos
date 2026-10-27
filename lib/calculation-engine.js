'use strict';
// A bounded expression interpreter: no eval, scripts, network calls or mutable spreadsheet dependency.
class CalcError extends Error { constructor(code) { super(code); this.code = code; } }
const fail = code => { throw new CalcError(code); };
const flat = v => Array.isArray(v) ? v.flat(Infinity) : [v];
const scalar = v => Array.isArray(v) ? scalar(v[0]) : v;
const text = v => v == null ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v);
function number(v) { v = scalar(v); if (v == null || v === '') return 0; if (typeof v === 'number') return v; if (typeof v === 'boolean') return +v; const n = Number(v); return Number.isFinite(n) ? n : fail('#VALUE!'); }
function truth(v) { v = scalar(v); return v !== null && v !== '' && v !== false && v !== 0; }
function parseLocale(v) { if (typeof v !== 'string') return v; const clean = v.trim().replace(/R\$|\s/g, ''); if (!clean) return null; const n = Number(clean.replace(/\./g, '').replace(',', '.').replace('%','')); if (!Number.isFinite(n)) fail('#VALUE!'); return clean.endsWith('%') ? n / 100 : n; }
function col(s) { return [...s.toUpperCase()].reduce((n,c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1; }
function address(r,c) { let s = ''; for (let n = c+1; n; n = Math.floor((n-1)/26)) s = String.fromCharCode(65+(n-1)%26)+s; return s+(r+1); }
function parse(formula) {
 const tokens = []; let p = 1;
 while (p < formula.length) {
  if (/\s/.test(formula[p])) {p++;continue;}
  const tail = formula.slice(p); let m;
  if (formula[p] === '"') { let value = ''; p++; let closed = false; while(p<formula.length) {if(formula[p]==='"'){if(formula[p+1]==='"'){value+='"';p+=2;}else{p++;closed=true;break;}}else value+=formula[p++];} if(!closed)fail('#PARSE!');tokens.push({t:'value',v:value});continue; }
  if ((m = tail.match(/^'((?:[^']|'')+)'!/))) {tokens.push({t:'sheet',v:m[1].replace(/''/g,"'")});p+=m[0].length;continue;}
  if ((m = tail.match(/^([A-Za-z_][A-Za-z0-9_.]*)!/))) {tokens.push({t:'sheet',v:m[1]});p+=m[0].length;continue;}
  if ((m = tail.match(/^\$?([A-Z]{1,3})\$?(\d+)(?![A-Za-z0-9_])/i))) {tokens.push({t:'ref',r:Number(m[2])-1,c:col(m[1])});p+=m[0].length;continue;}
  if ((m = tail.match(/^\d+(?:[.,]\d+)?/))) {tokens.push({t:'value',v:Number(m[0].replace(',','.'))});p+=m[0].length;continue;}
  if ((m = tail.match(/^[A-Z_][A-Z0-9_.]*/i))) {tokens.push({t:'name',v:m[0].toUpperCase()});p+=m[0].length;continue;}
  if ((m = tail.match(/^(?:<>|<=|>=|[+\-*/^&=<>():;])/))) {tokens.push({t:m[0]});p+=m[0].length;continue;}
  fail('#PARSE!');
 }
 let i = 0; const take = t => tokens[i]?.t === t ? tokens[i++] : fail('#PARSE!');
 const prec = { '=':1,'<>':1,'<':1,'>':1,'<=':1,'>=':1,'&':2,'+':3,'-':3,'*':4,'/':4,'^':5 };
 function expression(min = 0) {
  let a, t = tokens[i++]; if (!t)fail('#PARSE!');
  if (t.t==='value') a={k:'value',v:t.v};
  else if (t.t==='name') {
   if (['TRUE','FALSE'].includes(t.v) && tokens[i]?.t!=='(') a={k:'value',v:t.v==='TRUE'};
   else {take('(');const args=[];if(tokens[i]?.t!==')'){do{args.push(expression());if(tokens[i]?.t!==';')break;i++;}while(true);}take(')');a={k:'fn',name:t.v,args};}
  } else if (t.t==='sheet'||t.t==='ref') {
   const ref=t.t==='sheet'?take('ref'):t;a={k:'ref',sheet:t.t==='sheet'?t.v:null,r:ref.r,c:ref.c};
   if(tokens[i]?.t===':'){i++;const end=take('ref');a={...a,k:'range',r2:end.r,c2:end.c};}
  } else if(t.t==='('){a=expression();take(')');}
  else if(t.t==='-'||t.t==='+')a={k:'unary',op:t.t,a:expression(5)};
  else fail('#PARSE!');
  while(prec[tokens[i]?.t]!==undefined&&prec[tokens[i].t]>=min){const op=tokens[i++].t;a={k:'binary',op,a,b:expression(prec[op]+(op==='^'?0:1))};}
  return a;
 }
 const tree=expression();if(i!==tokens.length)fail('#PARSE!');return tree;
}
function compare(a,b) {
 a=scalar(a); b=scalar(b);
 if(a==null)a=typeof b==='number'?0:'';if(b==null)b=typeof a==='number'?0:'';
 if(typeof a==='string'&&typeof b==='string'){a=a.toLocaleLowerCase('pt-BR');b=b.toLocaleLowerCase('pt-BR');}
 return a===b?0:a<b?-1:1;
}
function binary(op,a,b) {
 if(Array.isArray(a)||Array.isArray(b)){const aa=Array.isArray(a)?a:null,bb=Array.isArray(b)?b:null;const n=aa?.length||bb.length;return Array.from({length:n},(_,i)=>binary(op,aa?aa[i]:a,bb?bb[i]:b));}
 if(op==='&')return text(a)+text(b);
 if(['=','<>','<','>','<=','>='].includes(op)){const c=compare(a,b);return {'=':c===0,'<>':c!==0,'<':c<0,'>':c>0,'<=':c<=0,'>=':c>=0}[op];}
 a=number(a);b=number(b);if(op==='/'&&b===0)fail('#DIV/0!');const n=({'+':()=>a+b,'-':()=>a-b,'*':()=>a*b,'/':()=>a/b,'^':()=>a**b})[op]();if(!Number.isFinite(n))fail('#NUM!');return n;
}
function matches(v,criterion) {
 if(typeof criterion!=='string')return compare(v,criterion)===0;
 const m=criterion.match(/^(<>|<=|>=|=|<|>)(.*)$/),op=m?.[1]||'=',term=m?m[2]:criterion;
 if(term==='')return op==='<>'?(v!=null&&v!==''):(v==null||v==='');
 const numeric=Number(term), target=term.trim()!==''&&Number.isFinite(numeric)?numeric:term;
 if(typeof target==='string'&&/[?*~]/.test(target)&&['=','<>'].includes(op)){
  let pattern='';for(let i=0;i<target.length;i++){const c=target[i];if(c==='~'&&i+1<target.length)pattern+=target[++i].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');else pattern+=c==='*'?'.*':c==='?'?'.':c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
  const match=new RegExp('^'+pattern+'$','iu').test(text(v));return op==='='?match:!match;
 }
 if(typeof target==='number'&&typeof v!=='number'){if(v==null||v==='')v=0;else{const numericValue=Number(v);if(!Number.isFinite(numericValue))return op==='<>';v=numericValue;}}
 return binary(op,v,target);
}
function calculate(datasets, rules, options = {}) {
 const now=options.now||new Date(), cache=new Map(), active=new Set(), errors=[];
 rules=expandRules(rules,datasets);
 const entries=rules.formulas||{},inputs=rules.inputs||{};
 const compiled=options.compiled||new Map();
 function cell(tab,r,c) {
  const key=tab+'!'+address(r,c);if(cache.has(key))return cache.get(key);if(active.has(key))fail('#CYCLE!');
  const f=entries[tab]?.[address(r,c)];let value;
  if(f){active.add(key);try{let ast=compiled.get(f.formula);if(!ast){ast=parse(f.formula);compiled.set(f.formula,ast);}value=scalar(run(ast,tab));if(value==null)value='';}finally{active.delete(key);}}
  else {value = r===0?datasets[tab]?.headers[c]:datasets[tab]?.rows[r-1]?.[c];value ??= null;const type=inputs[tab]?.[address(r,c)]||(r>0&&rules.columnTypes?.[tab]?.[c]?{type:rules.columnTypes[tab][c]}:null);if(type?.type==='number'&&value!==null&&value!==''){value=String(value)===type.display?type.value:parseLocale(value);}else if(type?.type==='bool'&&typeof value==='string')value=value.toUpperCase()==='TRUE';}
  cache.set(key,value);return value;
 }
 function run(n,tab) {
  if(n.k==='value')return n.v;
  if(n.k==='ref')return cell(n.sheet||tab,n.r,n.c);
  if(n.k==='range'){const out=[];const end=(n.sheet||tab)==='Distribuições detalhadas'&&n.r===1&&n.r2>=99?Math.max(n.r2,datasets[n.sheet||tab]?.rows.length||0):n.r2;for(let r=n.r;r<=end;r++)out.push(Array.from({length:n.c2-n.c+1},(_,c)=>cell(n.sheet||tab,r,n.c+c)));return out;}
  if(n.k==='unary')return n.op==='-'?-number(run(n.a,tab)):number(run(n.a,tab));
  if(n.k==='binary')return binary(n.op,run(n.a,tab),run(n.b,tab));
  const ev=i=>run(n.args[i],tab),name=n.name;
  if(name==='IF')return truth(ev(0))?ev(1):(n.args[2]?ev(2):false);
  if(name==='IFERROR'){try{return ev(0);}catch(e){if(e instanceof CalcError)return n.args[1]?ev(1):'';throw e;}}
  if(name==='OR')return n.args.some((_,i)=>flat(ev(i)).some(truth));
  const a=n.args.map((_,i)=>ev(i)),values=flat(a);
  switch(name){
   case 'SUM': return values.reduce((s,v)=>s+(typeof v==='number'?v:0),0);
   case 'MAX': {const nums=values.filter(v=>typeof v==='number');return nums.length?Math.max(...nums):0;}
   case 'MIN': {const nums=values.filter(v=>typeof v==='number');return nums.length?Math.min(...nums):0;}
   case 'COUNTA': return values.filter(v=>v!==null&&v!==undefined).length;
   case 'COUNTIF': return flat(a[0]).filter(v=>matches(v,scalar(a[1]))).length;
   case 'COUNTIFS': {const ranges=a.filter((_,i)=>i%2===0).map(flat);return ranges[0].reduce((s,_,i)=>s+(ranges.every((r,j)=>matches(r[i],scalar(a[j*2+1])))?1:0),0);}
   case 'SUMIF': {const tests=flat(a[0]), sums=flat(a[2]??a[0]);return tests.reduce((sum,v,i)=>sum+(matches(v,scalar(a[1]))&&typeof sums[i]==='number'?sums[i]:0),0);}
   case 'SUMIFS': {const sums=flat(a[0]);return sums.reduce((sum,v,i)=>sum+(a.every((_,j)=>j===0||j%2===0||matches(flat(a[j])[i],scalar(a[j+1])))&&typeof v==='number'?v:0),0);}
   case 'INDEX': {const range=Array.isArray(a[0])?a[0]:[[a[0]]],row=number(a[1]),column=n.args[2]?number(a[2]):1;if(row<1||row>range.length)fail('#REF!');return Array.isArray(range[row-1])?range[row-1][column-1]??null:range[row-1];}
   case 'MATCH': {if(n.args[2]&&number(a[2])!==0)fail('#UNSUPPORTED!');const i=flat(a[1]).findIndex(v=>compare(v,scalar(a[0]))===0);if(i<0)fail('#N/A');return i+1;}
   case 'FILTER': {const rows=a[0];const out=rows.filter((_,i)=>a.slice(1).every(condition=>truth(flat(condition)[i])));if(!out.length)fail('#N/A');return out;}
   case 'UNIQUE': {const seen=new Set();return (Array.isArray(a[0])?a[0]:[[a[0]]]).filter(v=>{const key=JSON.stringify(v);if(seen.has(key))return false;seen.add(key);return true;});}
   case 'TEXTJOIN': return flat(a.slice(2)).filter(v=>!truth(a[1])||v!==null&&v!=='').map(text).join(text(a[0]));
   case 'UPPER': return text(scalar(a[0])).toUpperCase();
   case 'REGEXMATCH': return new RegExp(text(a[1])).test(text(scalar(a[0])));
   case 'LEFT': return text(scalar(a[0])).slice(0,n.args[1]?number(a[1]):1);
   case 'RIGHT': {const count=n.args[1]?number(a[1]):1;return count?text(scalar(a[0])).slice(-count):'';}
   case 'MID': return text(scalar(a[0])).slice(number(a[1])-1,number(a[1])-1+number(a[2]));
   case 'VALUE': {const str=text(scalar(a[0]));if(!str.trim())fail('#VALUE!');return parseLocale(str);}
   case 'DATE': {let y=number(a[0]);if(y>=0&&y<1900)y+=1900;return (Date.UTC(y,number(a[1])-1,number(a[2]))-Date.UTC(1899,11,30))/86400000;}
   case 'TODAY': {const parts=new Intl.DateTimeFormat('en-CA',{timeZone:options.timeZone||'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return (Date.UTC(+p.year,+p.month-1,+p.day)-Date.UTC(1899,11,30))/86400000;}
   case 'HYPERLINK': return a[1]??a[0];
   default: fail('#UNSUPPORTED!');
  }
 }
 const output=structuredClone(datasets),typed={};let count=0;
 for(const [tab,fs]of Object.entries(entries)){
  if(!output[tab])continue;typed[tab]={};
  for(const [at,f]of Object.entries(fs)){
   const m=at.match(/^([A-Z]+)(\d+)$/),r=+m[2]-1,c=col(m[1]);let value;
   try{value=cell(tab,r,c);}catch(e){if(!(e instanceof CalcError))throw e;value=e.code;errors.push({tab,cell:at,code:e.code});}
   typed[tab][at]=value;count++;
   const display=format(value,f.format);if(r===0)output[tab].headers[c]=display;else{
    // Keep prefilled empty formulas out of the visible row count, except genuinely populated results.
    if(r>output[tab].rows.length&&(display===''||display==='0'))continue;
    while(output[tab].rows.length<r)output[tab].rows.push([]);
    output[tab].rows[r-1][c]=display;
   }
  }
 }
 return {datasets:output,typed,errors,count,cells:Object.fromEntries(Object.entries(entries).filter(([,v])=>Object.keys(v).length).map(([tab,v])=>[tab,Object.keys(v)]))};
}
function format(v,fmt) {
 if(v==null)return '';if(typeof v!=='number')return text(v);
 if(fmt?.type==='PERCENT'){const places=(fmt.pattern.match(/\.(0+)/)?.[1]||'').length;return new Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:places,maximumFractionDigits:places}).format(v).replace(/\s/g,'');}
 if(fmt?.type==='NUMBER'){const places=(fmt.pattern.match(/\.(0+)/)?.[1]||'').length;return new Intl.NumberFormat('pt-BR',{useGrouping:fmt.pattern.includes(','),minimumFractionDigits:places,maximumFractionDigits:places}).format(v);}
 return new Intl.NumberFormat('pt-BR',{useGrouping:false,maximumFractionDigits:10}).format(Object.is(v,-0)?0:v);
}
function rulesFromSheets(sheets) {
 const rules={version:1,formulas:{},inputs:{},columnTypes:{},templates:{},sourceRows:{},capturedAt:new Date().toISOString()};
 for(const s of sheets){const tab=s.properties.title;rules.sourceRows[tab]=Math.max(1,...(s.data||[]).map(b=>(b.startRow||0)+(b.rowData||[]).length));rules.formulas[tab]={};rules.inputs[tab]={};for(const block of s.data||[])for(const [ri,row]of (block.rowData||[]).entries())for(const [ci,c]of (row.values||[]).entries()){
  const at=address(ri+(block.startRow||0),ci+(block.startColumn||0)),f=c.userEnteredValue?.formulaValue,v=c.effectiveValue;
  if(f)rules.formulas[tab][at]={formula:f,format:c.effectiveFormat?.numberFormat};
  else if(v&&'numberValue'in v)rules.inputs[tab][at]={type:'number',value:v.numberValue,display:c.formattedValue,format:c.effectiveFormat?.numberFormat};
  else if(v&&'boolValue'in v)rules.inputs[tab][at]={type:'bool'};
  else if(v&&'stringValue'in v)rules.inputs[tab][at]={type:'text'};
 }}
 for(const [tab,inputs]of Object.entries(rules.inputs)){const columns={};for(const[at,input]of Object.entries(inputs)){const m=at.match(/^([A-Z]+)(\d+)$/);if(+m[2]===1)continue;const c=col(m[1]);columns[c]||={number:0,total:0};columns[c].total++;if(input.type==='number')columns[c].number++;}rules.columnTypes[tab]=Object.fromEntries(Object.entries(columns).filter(([,n])=>n.number>0&&n.number/n.total>=0.75).map(([c])=>[c,'number']));}
 const entityTables=['NEs e liquidação','APRV liquidar até fev 27','Base para metas','Contratos e fiscais','NEs segurando crédito'];
 for(const tab of entityTables){const groups={};for(const[at,f]of Object.entries(rules.formulas[tab]||{})){const m=at.match(/^([A-Z]+)(\d+)$/);const normalized=shiftFormula(f.formula,2-Number(m[2]));const key=m[1]+'|'+normalized;(groups[key]||=[]).push({at,f,row:Number(m[2]),column:col(m[1])});}const chosen={};for(const rows of Object.values(groups))if(rows.length>=3){const first=rows.sort((a,b)=>a.row-b.row)[0];if(!chosen[first.column]||chosen[first.column].count<rows.length)chosen[first.column]={...first,count:rows.length};}rules.templates[tab]=Object.values(chosen);}
 return rules;
}
function shiftFormula(formula,delta){return formula.replace(/"(?:[^"]|"")*"|'(?:[^']|'')*'!|\$?[A-Z]{1,3}(\$?)(\d+)/g,(whole,absolute,row)=>row&&!absolute?whole.slice(0,-row.length)+(Number(row)+delta):whole);}
function expandRules(rules,datasets){const formulas={...rules.formulas};for(const[tab,templates]of Object.entries(rules.templates||{})){if(!datasets[tab])continue;formulas[tab]={...formulas[tab]};const last=datasets[tab].rows.length+1;for(const t of templates)for(let r=Math.max(t.row,(rules.sourceRows?.[tab]||0)+1);r<=last;r++){const at=address(r-1,t.column);if(!formulas[tab][at])formulas[tab][at]={...t.f,formula:shiftFormula(t.f.formula,r-t.row)};}}return {...rules,formulas};}
module.exports={expandRules,shiftFormula,calculate,parse,rulesFromSheets,format,address,parseLocale,CalcError};
