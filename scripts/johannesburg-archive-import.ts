import fs from 'node:fs';
import path from 'node:path';
import { check } from '../scrapers/engine/accepted-archive';
import { canonicalPlan, loadExistingMappings, loadJohannesburgArchive } from '../scrapers/engine/johannesburg-archive-bridge';
import { createSupabaseAdminClient, importRecords } from '../scrapers/engine/supabase-importer';

export async function main(args = process.argv.slice(2)) {
  check(args.every(a=>a==='--commit'), 'UNKNOWN_IMPORT_ARGUMENT');
  const commit=args.includes('--commit');
  check(process.env.SUPABASE_URL?.replace(/\/$/,'')==='https://nkrwgbxbfusesxbnwalo.supabase.co', 'PRODUCTION_PROJECT_MISMATCH');
  check(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SERVICE_ROLE_KEY_MISSING');
  check(!commit || process.env.MARKETPULSE_ENABLE_JOHANNESBURG_IMPORT==='true', 'IMPORT_NOT_ENABLED');
  const archive=loadJohannesburgArchive(path.resolve('scraper-diagnostics/collection-only'));
  const db=createSupabaseAdminClient();
  const {data:market,error:marketError}=await db.from('markets').select('id,name').eq('id',3).single();
  check(!marketError && market?.name==='Johannesburg Market','MARKET_IDENTITY_MISMATCH');
  const plan=canonicalPlan(archive.date,archive.catalogue,archive.summary,await loadExistingMappings(db),archive.detailed);
  const reportDirectory=path.resolve('scraper-diagnostics/import-plans');
  fs.mkdirSync(reportDirectory,{recursive:true});
  const report={mode:commit?'commit':'dry-run',captureId:archive.manifest.captureId,archive:archive.directory,marketDate:archive.date,archiveContentSha256:archive.manifest.contentSha256,observationDigest:archive.observationDigest,observationCount:archive.manifest.records,mappingEvidence:'persisted source references plus individually reviewed explicit mappings; all canonical IDs revalidated',decisions:plan.decisions,aliases:plan.aliases,canonicalDaily:plan.records,canonicalMtd:plan.mtd};
  fs.writeFileSync(path.join(reportDirectory,`johannesburg-${archive.manifest.captureId}-${commit ? "commit" : "dry-run"}.json`),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(`MAPPING_VERIFIED date=${archive.date} sources=${plan.decisions.length} canonical=${plan.records.length} aliases=${plan.aliases.length}`);
  if(!commit) { console.log('DRY_RUN_NO_DATABASE_WRITES'); return; }
  await commitPlan(db,archive,plan);
}

export async function commitPlan(
  db: ReturnType<typeof createSupabaseAdminClient>,
  archive: ReturnType<typeof loadJohannesburgArchive>,
  plan: ReturnType<typeof canonicalPlan>,
  importer = importRecords,
) {
  async function state() {
    const {count,error}=await db.from('daily_prices').select('id',{count:'exact',head:true}).eq('market_id',3).eq('market_date',archive.date);
    check(!error && count!==null,'PRICE_COUNT_FAILED');
    const {data,error:runError}=await db.from('ingestion_runs').select('status,records_found,records_imported,records_updated').eq('market_id',3).eq('scrape_date',archive.date);
    check(!runError && data && data.length<=1,'INGESTION_LOOKUP_FAILED');
    return {count,run:data[0]};
  }
  const before=await state();
  // Counts alone cannot prove the same archive was imported. Require review of any existing publication.
  check(before.count===0,'EXISTING_PUBLICATION_REQUIRES_REVIEW');
  check(!before.run || (before.run.status==='FAILED' && before.run.records_imported===0 && before.run.records_updated===0),'UNSAFE_EXISTING_INGESTION_STATE');
  const {count:periodCount,error:periodError}=await db.from('market_product_period_metrics').select('id',{count:'exact',head:true}).eq('market_id',3).eq('as_of_date',archive.date);
  check(!periodError && periodCount===0,'EXISTING_PERIOD_METRICS_REQUIRE_REVIEW');
  await importer(db,plan.records,'SUCCESS',{
    existingProductIds:plan.productIds,
    afterDailyPricesUpsert:async context=>{
      check(context.marketId===3 && context.marketDate===archive.date && context.marketProductIdsByRecordIndex.length===plan.records.length,'IMPORT_CONTEXT_MISMATCH');
      const rows=plan.mtd.map((r,i)=>({market_id:3,market_product_id:context.marketProductIdsByRecordIndex[i],as_of_date:archive.date,period_type:'MTD',period_start:archive.date.slice(0,7)+'-01',period_end:archive.date,sold_quantity:r.sold_quantity,total_mass:r.total_mass,total_sales:r.total_sales}));
      const {error}=await db.from('market_product_period_metrics').upsert(rows,{onConflict:'market_id,market_product_id,as_of_date,period_type'});
      check(!error,'MTD_IMPORT_FAILED: '+error?.message);
      const {data,error:readError}=await db.from('market_product_period_metrics').select('market_product_id,sold_quantity,total_mass,total_sales').eq('market_id',3).eq('as_of_date',archive.date).eq('period_type','MTD');
      check(!readError && data?.length===rows.length && rows.every(r=>data.some(d=>d.market_product_id===r.market_product_id && Number(d.sold_quantity)===r.sold_quantity && Number(d.total_mass)===r.total_mass && Number(d.total_sales)===r.total_sales)),'MTD_VERIFICATION_FAILED');
    },
  });
  const after=await state();
  check(after.count===plan.records.length && after.run?.status==='SUCCESS' && after.run.records_found===plan.records.length && after.run.records_imported===plan.records.length,'POST_IMPORT_VERIFICATION_FAILED');
  console.log(`PRODUCTION_IMPORT_VERIFIED market=Johannesburg date=${archive.date} rows=${after.count}`);
}
if(require.main===module)main().catch(e=>{console.error('JOHANNESBURG_IMPORT_FAILED:',e instanceof Error?e.message:String(e));process.exitCode=1;});
