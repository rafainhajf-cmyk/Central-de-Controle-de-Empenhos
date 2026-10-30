'use strict';
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store, private');res.setHeader('Referrer-Policy','no-referrer');
 try{
  if(req.method!=='GET')return res.status(405).end();
  const host=req.headers.host;if(!/^[a-z0-9.-]+$/i.test(host||''))return res.status(400).end();
  const {processAuthMiddleware}=await import('@neondatabase/auth/server');
  const request=new Request('https://'+host+req.url,{headers:{cookie:req.headers.cookie||'',host}});
  const result=await processAuthMiddleware({request,pathname:'/api/google-callback',skipRoutes:['/api/google-callback'],loginUrl:'/meu-dia',baseUrl:process.env.NEON_AUTH_BASE_URL,cookieSecret:process.env.NEON_AUTH_COOKIE_SECRET,sessionDataTtl:1,sameSite:'lax',logger:{debug(){},info(){},warn(){},error(){}}});
  if(result.cookies?.length)res.setHeader('Set-Cookie',result.cookies);
  res.setHeader('Location',result.action==='redirect_oauth'?result.redirectUrl.href:'/meu-dia');return res.status(303).end();
 }catch{res.setHeader('Location','/meu-dia?google=error');return res.status(303).end();}
};
