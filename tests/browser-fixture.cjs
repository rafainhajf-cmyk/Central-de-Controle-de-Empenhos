'use strict';
const fs=require('node:fs'),path=require('node:path');
function build(){
 const {fixture}=require('./fixtures/management'),state=fixture();state.manualFields={'ne|160111|2026|2026NE000001':{fields:{},version:1},'contract|CONTRATO-1':{fields:{},version:1}};
 const view=require('../lib/budget/source-adapter').projectManagement(state,{userId:'fixture',name:'Teste isolado',active:true,role:'admin',sectors:[]},'2026-10-28');view.permissions={canEditAssignment:true};view.sync={canSync:true,updatedAt:'2026-10-28T12:00:00Z'};
 const start='<aside style="background:#ffeb99;padding:12px">TESTE ISOLADO · DADOS FICTÍCIOS</aside><p id="printProof"></p><script>const sample='+JSON.stringify(view).replaceAll('<','\\u003c')+';window.fetch=async url=>({ok:true,status:200,json:async()=>url.includes("campos-gerenciais")?{events:[{at:"2026-10-28T12:00:00Z",actor_name:"Administrador de teste",kind:"manual-edited",after_data:{observation:"Conferência de teste"}}],nextOffset:null}:sample});window.print=()=>{document.getElementById("printProof").textContent="Impressão solicitada";window.dispatchEvent(new Event("afterprint"));};</script>';
 fs.mkdirSync(path.join(process.cwd(),'release-checks'),{recursive:true});fs.writeFileSync('release-checks/index.html',fs.readFileSync('gerencial.html','utf8').replace('<body>','<body>'+start));
 console.log('BROWSER_FIXTURE_READY fictional_data_only=true');
}
module.exports={build};
if(require.main===module)build();
