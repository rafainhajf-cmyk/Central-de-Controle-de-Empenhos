'use strict';
(()=>{
 const panel=document.getElementById('loginPanel');if(!panel)return;panel.hidden=false;
 const make=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
 const section=make('section');section.className='panel';section.append(make('h3','Acesso do administrador'),make('p','Entre com seu e-mail e a senha própria da Central.'));
 const status=make('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 function field(form,label,type,id,autocomplete){const l=make('label',label),n=make('input');n.type=type;n.id=id;n.autocomplete=autocomplete;n.required=true;n.maxLength=type==='email'?254:128;if(autocomplete==='new-password')n.minLength=12;l.append(n);form.append(l);return n;}
 const login=make('form');login.className='form';
 const email=field(login,'E-mail do administrador','email','adminEmail','username');
 const password=field(login,'Senha da Central','password','adminPassword','current-password');
 const enter=make('button','Entrar como administrador');login.append(enter);section.append(login,status);
 const details=make('details');details.append(make('summary','Definir a primeira senha do administrador'),make('p','Use a chave atual do painel uma única vez. A senha será vinculada ao perfil de administrador existente.'));
 const setup=make('form');setup.className='form';
 const owner=field(setup,'E-mail do administrador','email','adminSetupEmail','username');
 const key=field(setup,'Chave atual do painel','password','adminSetupKey','off');key.maxLength=1024;
 const next=field(setup,'Nova senha da Central (mínimo 12 caracteres)','password','adminSetupPassword','new-password');
 const confirm=field(setup,'Repita a nova senha','password','adminSetupConfirm','new-password');
 const save=make('button','Definir senha do administrador');setup.append(save);details.append(setup);section.append(details);panel.prepend(section);
 fetch('/api/identidade?login=1',{credentials:'same-origin',cache:'no-store'}).then(async r=>{if(!r.ok)return;const data=await r.json();if(data.adminPasswordConfigured===true)details.hidden=true;else if(data.adminPasswordConfigured===false)status.textContent='A senha local do administrador ainda não foi ativada neste sistema. Use “Definir a primeira senha do administrador”.';}).catch(()=>{});
 async function post(body,token){
  const response=await fetch('/api/identidade',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Central-Request':'1',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({...body,action:'admin-'+body.action})});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível confirmar o acesso.');return data;
 }
 login.onsubmit=async e=>{e.preventDefault();enter.disabled=true;status.textContent='Verificando acesso…';const secret=password.value;password.value='';try{await post({action:'login',email:email.value,password:secret});window.location.assign('/gerencial');}catch(e){status.textContent=e.message;}finally{enter.disabled=false;}};
 setup.onsubmit=async e=>{e.preventDefault();if(next.value!==confirm.value){status.textContent='As senhas precisam ser iguais.';return;}save.disabled=true;const secret=next.value,token=key.value,mail=owner.value;key.value=next.value=confirm.value='';status.textContent='Configurando a senha…';try{await post({action:'setup',email:mail,password:secret},token);email.value=mail;details.open=false;details.hidden=true;status.textContent='Senha definida. Entre acima com seu e-mail e a senha da Central.';}catch(e){status.textContent=e.message;}finally{save.disabled=false;}};
})();
