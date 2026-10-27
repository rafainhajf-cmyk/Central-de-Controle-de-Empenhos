'use strict';
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt);
async function hashPassword(password){if(typeof password!=='string'||password.length<12||Buffer.byteLength(password)>1024)throw Error('Senha inválida');const salt=crypto.randomBytes(16);const hash=await scrypt(password,salt,64);return 'scrypt-v1$'+salt.toString('base64url')+'$'+hash.toString('base64url');}
async function verifyPassword(password,encoded){if(typeof password!=='string'||Buffer.byteLength(password)>1024||typeof encoded!=='string')return false;const parts=encoded.split('$');if(parts.length!==3||parts[0]!=='scrypt-v1')return false;const salt=Buffer.from(parts[1],'base64url'),expected=Buffer.from(parts[2],'base64url');if(salt.length!==16||expected.length!==64)return false;const actual=await scrypt(password,salt,64);return crypto.timingSafeEqual(actual,expected);}
module.exports={hashPassword,verifyPassword};
