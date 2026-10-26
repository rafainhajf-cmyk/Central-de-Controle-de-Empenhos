'use strict';
// A cache is an optional local copy, never the official source or a credential store.
globalThis.EncryptedCache=(()=>{
 const encode=bytes=>{const data=new Uint8Array(bytes);let text='';for(let i=0;i<data.length;i+=8192)text+=String.fromCharCode(...data.subarray(i,i+8192));return btoa(text);};
 const decode=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
 async function key(secret,salt){const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:210000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
 return {
 async seal(value,secret){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(secret,salt),new TextEncoder().encode(JSON.stringify(value)));return JSON.stringify({version:1,salt:encode(salt),iv:encode(iv),data:encode(encrypted)});},
 async open(text,secret){const d=JSON.parse(text);if(d.version!==1)throw Error('Versão de cópia inválida');const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(d.iv)},await key(secret,decode(d.salt)),decode(d.data));return JSON.parse(new TextDecoder().decode(clear));}
 };
})();
