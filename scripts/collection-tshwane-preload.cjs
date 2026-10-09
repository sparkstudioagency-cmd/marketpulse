// Only the isolated collection child loads this guard. No hosted client or env discovery.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const directory=process.env.MARKETPULSE_COLLECTION_CAPTURE;
if(!directory||!path.isAbsolute(directory))throw Error('COLLECTION_CAPTURE_REQUIRED');
process.loadEnvFile=()=>undefined;
for(const key of Object.keys(process.env))if(/SUPABASE|DATABASE_URL|DB_PASSWORD|PGPASSWORD|GH_TOKEN/i.test(key))delete process.env[key];
const load=Module._load;
Module._load=function(name,...args){if(/supabase|supabase-importer|source-revision-adapter|tshwane-pipeline|check-publication|ingestion-state/i.test(name))throw Error('DATABASE_MODULE_FORBIDDEN_IN_COLLECTION');return load.call(this,name,...args);};
const {chromium}=require('@playwright/test');
const launch=chromium.launch.bind(chromium);let count=0;const pending=[];
chromium.launch=async options=>{
 const browser=await launch(options);const newContext=browser.newContext.bind(browser);
 browser.newContext=async options=>{
  const context=await newContext(options);
  context.setDefaultTimeout(30000);context.setDefaultNavigationTimeout(30000);
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());
   return u.protocol==='https:'&&u.hostname==='tfpm.tshwane.gov.za'?route.continue():route.abort('blockedbyclient');
  });
  context.on('response',response=>{
   if(response.request().resourceType()!=='document'||new URL(response.url()).hostname!=='tfpm.tshwane.gov.za')return;
   const index=++count;
   pending.push((async()=>{
    const body=await response.body();if(body.length>8*1024*1024)throw Error('SOURCE_RESPONSE_TOO_LARGE');
    const name='document-'+String(index).padStart(6,'0')+'.html';const raw=path.join(directory,'raw');fs.mkdirSync(raw,{recursive:true});fs.writeFileSync(path.join(raw,name),body,{flag:'wx'});
    fs.appendFileSync(path.join(raw,'responses.jsonl'),JSON.stringify({file:name,url:response.url(),method:response.request().method(),status:response.status(),capturedAt:new Date().toISOString(),postDataSha256:response.request().postData()?require('node:crypto').createHash('sha256').update(response.request().postData()).digest('hex'):null})+'\n');
   })().catch(e=>{fs.appendFileSync(path.join(directory,'raw-capture-errors.log'),String(e.message)+'\n');}));
  });
  return context;
 };
 const close=browser.close.bind(browser);browser.close=async(...args)=>{await Promise.allSettled(pending);return close(...args);};return browser;
};
