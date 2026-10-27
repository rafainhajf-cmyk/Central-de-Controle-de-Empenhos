'use strict';
const crypto=require('node:crypto');
function authorized(req){
 if(process.env.APP_ACCESS_EXPIRES_AT&&!(Date.now()<Number(process.env.APP_ACCESS_EXPIRES_AT)))return false;
 const secret=process.env.APP_ACCESS_TOKEN||'';
 const cookie=String(req.headers?.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('central_session='))?.slice(16);
 if(secret.length>=24&&cookie){const [expires,signature]=cookie.split('.');if(/^\d+$/.test(expires)&&Number(expires)>Date.now()/1000&&Number(expires)<=Date.now()/1000+31*86400){const expected=crypto.createHmac('sha256',secret).update('program-session:'+expires).digest('base64url');const a=Buffer.from(signature||''),b=Buffer.from(expected);if(a.length===b.length&&crypto.timingSafeEqual(a,b))return true;}}
 const sent=String(req.headers?.authorization||'').replace(/^Bearer\s+/i,'');
 const a=Buffer.from(secret),b=Buffer.from(sent);return secret.length>=24&&a.length===b.length&&crypto.timingSafeEqual(a,b);
}
async function accessToken(scope='https://www.googleapis.com/auth/spreadsheets'){
 const email=process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,key=(process.env.GOOGLE_PRIVATE_KEY||'').replace(/\\n/g,'\n');
 if(!email||!key)throw Error('CONFIG_MISSING');
 const now=Math.floor(Date.now()/1000),b=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const input=b({alg:'RS256',typ:'JWT'})+'.'+b({iss:email,scope,aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
 const assertion=input+'.'+crypto.sign('RSA-SHA256',Buffer.from(input),key).toString('base64url');
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('GOOGLE_OAUTH_'+r.status);const d=await r.json();if(typeof d.access_token!=='string'||!d.access_token)throw Error('GOOGLE_OAUTH_RESPONSE');return d.access_token;
}
async function googleJson(url,token,options={}){
 const r=await fetch(url,{...options,headers:{Authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(20000),cache:'no-store'});
 if(!r.ok){const e=Error('GOOGLE_HTTP_'+r.status);e.status=r.status;throw e;}return r.json();
}
module.exports={authorized,accessToken,googleJson};
