const assert=require('node:assert/strict');
process.env.CRM_CAPTURE_ENABLED='true';process.env.CRM_CAPTURE_PARTIAL_URL='https://crm.example.com/partial';
const partial=require('../api/lead-partial');
async function invoke(body){const r={setHeader(){},end(x){this.body=x?JSON.parse(x):null;}};await partial({method:'POST',headers:{},socket:{remoteAddress:'fixture'},body},r);return r;}
(async()=>{
 const raw={nome:'Legacy Fixture',email:'fixture@example.com',cargo:'socio-empresario'};let sent=[];
 global.fetch=async(url,init)=>{sent.push({url,body:JSON.parse(init.body),headers:init.headers});return Response.json({received:true});};
 const result=await invoke(raw);assert.equal(result.statusCode,200,'Cached partial without identity must reach CRM');assert.deepEqual(sent[0].body.answers,raw);assert.equal(sent[0].headers['Idempotency-Key'],sent[0].body.submission_id);
 sent=[];assert.equal((await invoke({...raw,submission_id:'incomplete_identity'})).statusCode,503);assert.equal(sent.length,0,'Supplied incomplete identity must be rejected');
 global.fetch=async()=>Response.json({ok:true});assert.equal((await invoke(raw)).statusCode,503,'Require CRM received receipt');
 console.log('PASS cached partial, original answers, identity validation and receipt gating');
})().catch(e=>{console.error(e);process.exitCode=1;});
