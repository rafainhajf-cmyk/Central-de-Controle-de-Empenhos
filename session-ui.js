'use strict';
globalThis.CentralSessionUI=(()=>{
 const header=document.querySelector('header'),box=document.createElement('div'),label=document.createElement('span'),button=document.createElement('button');box.className='session-controls';box.hidden=true;button.type='button';button.textContent='Sair';button.className='secondary';button.id='sessionLogout';label.id='sessionUser';box.append(label,button);header?.append(box);let user=null;
 function show(value){user=value;box.hidden=!value;label.textContent=value?.name||'';}
 button.onclick=async()=>{button.disabled=true;button.textContent='Saindo…';try{const r=await fetch('/api/identidade',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Central-Request':'1'},body:JSON.stringify({action:'logout'})}),v=await r.json();if(!r.ok||!v.signedOut)throw Error(v.error||'Não foi possível sair. Tente novamente.');show(null);document.querySelector('main')?.replaceChildren();window.location.replace('/meu-dia?saida=1');}catch(e){button.textContent='Tentar sair novamente';button.disabled=false;label.textContent=e.message;}};
 window.addEventListener('pageshow',event=>{if(event.persisted)window.location.reload();});
 fetch('/api/identidade',{credentials:'same-origin',cache:'no-store'}).then(async r=>{if(r.ok)show((await r.json()).user||null);}).catch(()=>{});
 return {show};
})();
