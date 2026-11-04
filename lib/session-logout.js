'use strict';
// Cookies owned by the installed Neon Auth SDK. Never clear unrelated cookies.
const prefix='__Secure-neon-auth',known=['.session_token','.local.session_data','.session_challenge','.session_challange'];
async function logout(db,req,res,neonServer){
 await require('./admin-password').logout(db,req,res);
 const names=new Set(known.map(n=>prefix+n));for(const pair of String(req.headers?.cookie||'').split(';')){const name=pair.trim().split('=')[0];if(/^__Secure-neon-auth[.][a-zA-Z0-9._-]+$/.test(name))names.add(name);}
 let providerRevoked=true;if(String(req.headers?.cookie||'').includes(prefix)){try{const r=await(await neonServer(req,res)).signOut();providerRevoked=!r.error;}catch{providerRevoked=false;}}
 const existing=res.getHeader?.('Set-Cookie')||[];res.setHeader('Set-Cookie',[...(Array.isArray(existing)?existing:[existing]),...Array.from(names,n=>n+'=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT')]);return {signedOut:true,providerRevoked};
}
module.exports={logout};
