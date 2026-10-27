'use strict';
const {calculate,rulesFromSheets,address}=require('./calculation-engine');
const ENGINE_VERSION=1;
let cached;
async function loadRules(sql){
 if(cached)return cached;
 const [row]=await sql.query('SELECT rules, report FROM budget_calculation_rules WHERE id = 1');
 if(!row)throw Error('CALCULATION_RULES_MISSING');
 cached={...row.rules,report:row.report};return cached;
}
function baselineFromSheets(sheets){
 const data={};for(const s of sheets){const rows=(s.data?.[0]?.rowData||[]).map(r=>(r.values||[]).map(c=>c.formattedValue??''));data[s.properties.title]={headers:rows[0]||[],rows:rows.slice(1)};}return data;
}
function validateConversion(sheets){
 const rules=rulesFromSheets(sheets),baseline=baselineFromSheets(sheets),result=calculate(baseline,rules,{timeZone:'Etc/GMT'});let count=0;const differences=[];
 for(const s of sheets)for(const block of s.data||[])for(const [ri,row]of (block.rowData||[]).entries())for(const [ci,cell]of (row.values||[]).entries()){
  if(!cell.userEnteredValue?.formulaValue)continue;
  count++;const at=address(ri+(block.startRow||0),ci+(block.startColumn||0)),v=cell.effectiveValue||{},expected=v.numberValue??v.stringValue??v.boolValue??'',actual=result.typed[s.properties.title]?.[at];
  const different=typeof expected==='number'&&typeof actual==='number'?Math.abs(expected-actual)>1e-6:expected!==actual;
  if(different)differences.push({tab:s.properties.title,cell:at});
 }
 if(differences.length||result.errors.length){const e=Error('CALCULATION_COMPARISON_FAILED');e.differences=differences;e.count=count;throw e;}
 return {rules,report:{engineVersion:ENGINE_VERSION,formulas:count,differences:0,errors:0,verifiedAt:new Date().toISOString()}};
}
async function installRules(sql){
 await sql.query(`CREATE TABLE IF NOT EXISTS budget_calculation_rules (id integer PRIMARY KEY CHECK(id=1),rules jsonb NOT NULL,report jsonb NOT NULL,installed_at timestamptz NOT NULL DEFAULT now())`);
 const [existing]=await sql.query('SELECT report FROM budget_calculation_rules WHERE id=1');
 if(existing?.report?.engineVersion===ENGINE_VERSION){console.log('CALCULATIONS_OK formulas='+existing.report.formulas+' verified=true existing_rules_preserved=true');return existing.report;}
 const {accessToken,googleJson}=require('./google-sheets'),catalog=require('../sheet-catalog');
 const token=await accessToken('https://www.googleapis.com/auth/spreadsheets.readonly');
 const base='https://sheets.googleapis.com/v4/spreadsheets/1KKeA5lKttywZp-AvILAhsmfc6XjQ86nYs3OirjE0zco';
 const meta=await googleJson(base+'?fields=sheets(properties(title,gridProperties(rowCount,columnCount)))',token);
 const column=n=>{let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;};
 const ranges=catalog.map(s=>{const p=meta.sheets.find(x=>x.properties.title===s.title)?.properties;if(!p||p.gridProperties.rowCount>10000)throw Error('CALCULATION_SOURCE_INCOMPLETE');return "'"+s.title.replace(/'/g,"''")+"'!A1:"+column(p.gridProperties.columnCount)+p.gridProperties.rowCount;});
 const fields='sheets(properties(title),data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue,formattedValue,effectiveFormat(numberFormat)))))';
 const response=await googleJson(base+'?includeGridData=true&fields='+encodeURIComponent(fields)+'&'+ranges.map(r=>'ranges='+encodeURIComponent(r)).join('&'),token);
 if(response.sheets?.length!==catalog.length)throw Error('CALCULATION_SOURCE_INCOMPLETE');
 const {rules,report}=validateConversion(response.sheets);
 // Verify current program edits against the new engine without replacing the imported or edited input data.
 const [current]=await sql.query('SELECT datasets FROM budget_program WHERE id=1');
 const preview=calculate(current.datasets,rules);if(preview.errors.length)throw Error('CURRENT_DATA_CALCULATION_ERROR');
 await sql.query('INSERT INTO budget_calculation_rules (id,rules,report) VALUES(1,$1::jsonb,$2::jsonb) ON CONFLICT(id) DO UPDATE SET rules=excluded.rules,report=excluded.report,installed_at=now()',[JSON.stringify(rules),JSON.stringify(report)]);
 cached={...rules,report};
 console.log('CALCULATIONS_OK formulas='+report.formulas+' differences=0 source_errors=0 current_data_errors=0 edited_inputs_preserved=true');return report;
}
function calculatedCells(rules){const out={};for(const [tab,fs]of Object.entries(rules.formulas))if(Object.keys(fs).length)out[tab]=Object.keys(fs);return out;}
module.exports={installRules,loadRules,validateConversion,baselineFromSheets,calculatedCells,ENGINE_VERSION};
