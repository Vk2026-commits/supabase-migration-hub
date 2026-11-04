import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compile = s => ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const load = async s => import(`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`);
const {mapLegacyApplication,legacyEmailValid,legacyGroupConfirmed}=await load(compile(readFileSync('src/lib/legacyApplication.ts','utf8')));
const mapped=mapLegacyApplication({applicant_name:'Sample',application_data:{first_name:'Sample',is_18_or_older:true,level2_license:true,level3_license:false,ssn:'sensitive',signature_date:'2020-01-01',certification_acknowledged:true,full_form_data:{employer1:{name:'Sample Employer',jobTitle:'Officer'},reference1:{name:'Sample Reference'},highSchool:'Sample School'}}});
assert.equal(mapped.isAdult,'Yes');assert.deepEqual(mapped.licenseLevels,['Level II']);assert.equal(mapped.workHistory[0].employer,'Sample Employer');assert.equal(mapped.references[0].name,'Sample Reference');
assert(!('ssn' in mapped));assert(!('signature' in mapped));assert(!('consentAccepted' in mapped));
assert.deepEqual(mapLegacyApplication({application_data:{}}).licenseLevels,[]);
assert(!legacyEmailValid(''));assert(!legacyEmailValid('bad@'));assert(legacyEmailValid('sample@example.invalid'));
assert.equal(legacyGroupConfirmed('a', [{group_id:'a',claimed_at:'2026-11-03'}]), false);
assert.equal(legacyGroupConfirmed('a', [{group_id:'a',confirmed_at:'2026-11-03'}]), true);
assert.equal(legacyGroupConfirmed('b', [{group_id:'a',confirmed_at:'2026-11-03'}]), false);
assert.equal(legacyGroupConfirmed('a', [{group_id:'a',confirmed_at:null},{group_id:'a',confirmed_at:'2026-11-03'}]), true);
// Execute the actual edge handler with mocked auth, database and email transport.
let handler; let sends=0; let roleAllowed=true; let providerFails=false; let saved=[]; const reserved=new Set();
globalThis.Deno={env:{get:k=>k==='SUPABASE_SERVICE_ROLE_KEY'?'service':'synthetic'},serve:f=>handler=f};
class Query {
 constructor(table){this.table=table;}
 select(){return this;} eq(){return this;} is(){return this;} not(){return this;} limit(){return this;}
 update(value){saved.push(value);return this;}
 maybeSingle(){return Promise.resolve({data:{id:'source'}});}
 single(){return Promise.resolve({data:{company_name:'Kairos Security'}});}
 then(resolve){return Promise.resolve({data:[],error:null}).then(resolve);}
}
globalThis.mockCreateClient=(url,key)=>({auth:{getUser:async()=>({data:{user:{id:'staff'}}})},from:t=>new Query(t),rpc:async(name,args)=>{
 if(name==='company_team_has_access'){assert(args._allowed_roles.includes('hiring_manager'));return {data:roleAllowed};}
 if(name==='reserve_legacy_invitation'){
   const created=!reserved.has(args._request_id);reserved.add(args._request_id);
   assert.match(args._token_hash,/^[a-f0-9]{64}$/);
   return {data:{created,id:args._request_id,email:'sample@example.invalid',email_status:'accepted'}};
 }
 throw new Error(name);
}});
globalThis.fetch=async (url,options)=>{
 assert.equal(url,'https://api.resend.com/emails');
 const message=JSON.parse(options.body);
 sends++;assert.deepEqual(message.to,['sample@example.invalid']);assert.match(message.text,/already has your application/);assert.match(message.text,/imported-application\?token=/);assert(options.headers['Idempotency-Key']);
 return new Response(JSON.stringify(providerFails?{message:'Mock delivery failure'}:{id:'provider-synthetic'}),{status:providerFails?400:200});
};
const source=readFileSync('supabase/functions/legacy-applicant-invitations/index.ts','utf8').replace(/import \{ createClient \}[^;]+;/,'const createClient=globalThis.mockCreateClient;');
await load(compile(source));
const call=async overrides=>{const r=await handler(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify({action:'send',company_id:'company',job_id:'job',confirm:true,recipients:[{legacy_id:'source',request_id:'request1'}],...overrides})}));return {status:r.status,...await r.json()};};
roleAllowed=false;assert.equal((await call({})).status,403);assert.equal(sends,0);
roleAllowed=true;assert.equal((await call({confirm:false})).status,400);assert.equal(sends,0);
assert.equal((await call({})).results[0].status,'accepted');assert.equal(sends,1);
await call({});assert.equal(sends,1,'replayed request must not send twice');
providerFails=true;assert.equal((await call({recipients:[{legacy_id:'source',request_id:'request2'}]})).results[0].status,'failed');assert(saved.some(v=>v.email_status==='failed'));
await call({action:'refresh'});assert.equal(sends,2,'refresh must not send emails');
console.log('PASS: legacy field mapping, missing licenses, role checks, explicit confirmation, mocked delivery, replay, failure status, and refresh without sending. No network calls.');
