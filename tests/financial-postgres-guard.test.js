'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{checkEnvironment}=require('../scripts/verify-financial-neon.cjs');
test('Postgres probe refuses production and any endpoint other than its explicit isolated endpoint',()=>{
 const env={VERCEL_ENV:'preview',FINANCIAL_TEST_ENDPOINT:'ep-test.neon.tech',DATABASE_URL:'postgresql://user:password@ep-test.neon.tech/neondb'};
 assert.equal(checkEnvironment(env),'ep-test.neon.tech');
 assert.throws(()=>checkEnvironment({...env,VERCEL_ENV:'production'}));assert.throws(()=>checkEnvironment({...env,FINANCIAL_TEST_ENDPOINT:'ep-other.neon.tech'}));
 assert.throws(()=>checkEnvironment({...env,FINANCIAL_TEST_ENDPOINT:'ep-rapid-night-b59crsz4.c-7.us-east-2.aws.neon.tech',DATABASE_URL:'postgresql://u:p@ep-rapid-night-b59crsz4.c-7.us-east-2.aws.neon.tech/neondb'}));
});
