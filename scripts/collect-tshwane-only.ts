import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { SourceCapture, collectionArguments, canonical, filesIn } from '../scrapers/engine/source-capture-archive';
import { processMarketCheckpoint } from '../scrapers/engine/processor';
import { parseTshwaneCheckpoint } from '../scrapers/engine/saver';

export function validateTshwaneEvidence(directory: string, limited=false, exitCode=0) {
  const statuses=filesIn(directory).filter(n=>/tshwane-run-status-\d{4}-\d{2}-\d{2}\.json$/.test(n));
  if(statuses.length!==1)throw new Error('EXACTLY_ONE_PUBLICATION_STATUS_REQUIRED');
  const status=JSON.parse(fs.readFileSync(path.join(directory,statuses[0]),'utf8'));
  const date=status.marketDate as string;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw new Error('INVALID_PUBLICATION_DATE');
  const checkpointPath=path.join(directory,'scraper-output','tshwane-checkpoint-'+date+'.json');
  const checkpoint=parseTshwaneCheckpoint(JSON.parse(fs.readFileSync(checkpointPath,'utf8')),date);
  const parsed=processMarketCheckpoint(date,path.join(directory,'scraper-output'),path.join(directory,'normalized'));
  const records=JSON.parse(fs.readFileSync(parsed.cleanJsonPath,'utf8')) as Record<string,unknown>[];
  if(!records.length||records.length!==checkpoint.records.length||status.successfulRecords!==records.length||records.some(r=>r.marketDate!==date||!['Tshwane','Tshwane Fresh Produce Market'].includes(String(r.market))))throw new Error('PUBLICATION_RECORD_COVERAGE_MISMATCH');
  const keys=records.map(r=>canonical([r.product,r.container,r.grade,r.mass,r.count,r.province]));
  if(new Set(keys).size!==keys.length||parsed.summary.invalidNumericValues>0)throw new Error('INVALID_OR_DUPLICATE_SOURCE_ROWS');
  return {date,records,status,checkpoint,accepted:!limited&&exitCode===0&&status.status==='COMPLETE'&&status.technicalFailureCount===0&&status.skippedPackageCount===0,summary:parsed.summary};
}
export async function collectTshwane(args: string[]) {
  const options=collectionArguments(args);const repository=path.resolve(__dirname,'..');
  const max=Number(args.find(a=>a.startsWith('--max-products='))?.slice(15)??0);
  const timeout=Number(args.find(a=>a.startsWith('--timeout-ms='))?.slice(13)??9000000);
  if(!Number.isSafeInteger(max)||max<0||max>10000||!Number.isSafeInteger(timeout)||timeout<1000||timeout>9000000)throw new Error('INVALID_COLLECTION_LIMIT');
  const capture=new SourceCapture(options.root,'tshwane');let exitCode=0;
  try {
    if(options.archive) {
      for(const n of filesIn(options.archive))if(n.startsWith('scraper-output/')||n.startsWith('processed-output/')||n.startsWith('raw/')||n.startsWith('scraper-diagnostics/'))capture.write(n,fs.readFileSync(path.join(options.archive,n)));
      // Recovery archives contain multiple dated checkpoints; only the single run-status date is admitted.
    } else {
      const env={...process.env,CI:'true',MARKETPULSE_COLLECTION_CAPTURE:capture.directory};
      for(const key of Object.keys(env))if(/SUPABASE|DATABASE_URL|DB_PASSWORD|PGPASSWORD|GH_TOKEN|START_PRODUCT_INDEX|MAX_PRODUCTS|NODE_OPTIONS/i.test(key))delete (env as NodeJS.ProcessEnv)[key];
      (env as NodeJS.ProcessEnv).NODE_OPTIONS='--require='+JSON.stringify(path.join(repository,'scripts/collection-tshwane-preload.cjs'));
      if(max>0)(env as NodeJS.ProcessEnv).MAX_PRODUCTS=String(max);
      const child=spawn(process.execPath,['--require',path.join(repository,'scripts/collection-tshwane-preload.cjs'),path.join(repository,'node_modules/tsx/dist/cli.mjs'),path.join(repository,'scrapers/markets/tshwane.ts')],{cwd:capture.directory,env,windowsHide:true});
      const log=fs.openSync(path.join(capture.directory,'collector.log'),'wx');
      child.stdout.on('data',b=>{fs.writeSync(log,b);const lines=String(b).split('\n').filter(l=>/market date|Products completed|records saved|SCRAPER|FAILED/i.test(l));if(lines.length)console.log(lines.join('\n'));});child.stderr.on('data',b=>fs.writeSync(log,b));
      let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill();},timeout);
      exitCode=await new Promise<number>((resolve,reject)=>{child.once('error',reject);child.once('close',c=>resolve(c??1));});clearTimeout(timer);fs.closeSync(log);
      if(timedOut)capture.writeJson('timeout.json',{timeoutMs:timeout,partialEvidenceRetained:true});
    }
    const v=validateTshwaneEvidence(capture.directory,max>0,exitCode);
    // No captured HTML may advertise a different publication than the admitted checkpoint.
    const dates=new Set<string>();for(const n of filesIn(capture.directory).filter(n=>n.startsWith('raw/')&&n.endsWith('.html'))){const t=fs.readFileSync(path.join(capture.directory,n),'utf8').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');const m=t.match(/Market\s+Daily\s+Statistics\s*:?\s*Product\s+Search(?:\s+Results)?\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);if(m){const months=['January','February','March','April','May','June','July','August','September','October','November','December'];dates.add(m[3]+'-'+String(months.findIndex(x=>x.toLowerCase()===m[2].toLowerCase())+1).padStart(2,'0')+'-'+m[1].padStart(2,'0'));}}
    if([...dates].some(d=>d!==v.date)||fs.existsSync(path.join(capture.directory,'raw-capture-errors.log')))throw new Error('RAW_CAPTURE_INCOMPLETE_OR_PUBLICATION_CHANGED');
    const logPath=path.join(capture.directory,'collector.log');
    const found=fs.existsSync(logPath)?fs.readFileSync(logPath,'utf8').match(/Found (\d+) products/):null;
    const completeCoverage=!!options.archive||(!!found&&v.checkpoint.progress?.nextProductIndex===Number(found[1])&&dates.size===1);
    const accepted=v.accepted&&completeCoverage;
    const result=capture.finalize({accepted,publicationDate:v.date,records:v.records.length,diagnostics:{...v.summary,sourceStatus:v.status,limited:max>0,exitCode,rawHtmlAvailable:dates.size>0,historicalProcessorUnchanged:true,completeCoverage},semantic:{publicationDate:v.date,rows:v.records.map(({raw,scrapedAt,...r})=>r)}});
    if(!accepted)console.error('Incomplete source retained at '+result.directory);return result;
  } catch(error){const message=error instanceof Error?error.message:'COLLECTION_FAILED';capture.writeJson('failure.json',{message,exitCode});const result=capture.finalize({accepted:false,publicationDate:null,records:0,diagnostics:{error:message,exitCode,partialEvidenceRetained:true},semantic:{incomplete:true,files:filesIn(capture.directory)}});console.error('Partial evidence retained at '+result.directory);throw error;}
}
if(require.main===module)collectTshwane(process.argv.slice(2)).then(r=>{console.log(JSON.stringify({directory:r.directory,...r.manifest}));if(r.manifest.status!=='ACCEPTED')process.exitCode=1;}).catch(e=>{console.error(e instanceof Error?e.message:'COLLECTION_FAILED');process.exitCode=1;});
