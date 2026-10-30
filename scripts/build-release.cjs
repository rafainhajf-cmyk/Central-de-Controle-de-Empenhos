'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const preview=process.argv.includes('--browser-fixture');
if(process.env.FINANCIAL_TEST_ENDPOINT){
 const financial=spawnSync(process.execPath,['scripts/verify-financial-neon.cjs'],{stdio:'inherit'});
 if(financial.status!==0)process.exit(financial.status||1);
}
const check=spawnSync(process.execPath,['scripts/release-check.cjs',...(preview?['--browser-fixture']:[])],{stdio:'inherit'});
if(check.status!==0)process.exit(check.status||1);
fs.mkdirSync('public',{recursive:true});
for(const name of fs.readdirSync('.'))if(/\.(?:html|css|js)$/.test(name)&&fs.statSync(name).isFile())fs.copyFileSync(name,path.join('public',name));
// Keep the user's existing /central address on the same Neon-backed dashboard.
fs.copyFileSync('gerencial.html','public/central.html');
if(preview){fs.mkdirSync('public/release-checks',{recursive:true});fs.copyFileSync('release-checks/index.html','public/release-checks/index.html');}
console.log('STATIC_RELEASE_READY browser_fixture='+preview);

