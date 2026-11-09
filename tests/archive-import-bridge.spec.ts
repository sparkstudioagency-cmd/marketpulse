import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import type {SupabaseClient} from '@supabase/supabase-js';
import {SourceCapture} from '../scrapers/engine/source-capture-archive';
import {canonicalPlan,loadJohannesburgArchive,type ExistingSourceMapping} from '../scrapers/engine/johannesburg-archive-bridge';
import {acceptedArchive} from '../scrapers/engine/accepted-archive';
import {loadTshwaneArchive} from '../scripts/tshwane-archive-import';
import {importRecords,verifiedExistingProducts} from '../scrapers/engine/supabase-importer';
import {commitPlan,main as johannesburgMain} from '../scripts/johannesburg-archive-import';
import {main as tshwaneMain} from '../scripts/tshwane-archive-import';

const date='2026-11-05';
const source={sourceProductId:'148',sourceProductName:'DHANYA'};
const summary={...source,totalSales:25.12,soldQuantity:2,totalMass:4,quantityAvailable:8,mtd:{totalSales:100,soldQuantity:8,totalMass:16}};
const mapping:ExistingSourceMapping={...source,productId:106,productName:'Coriander',active:true,category:'fresh_produce'};
const build=(maps:ExistingSourceMapping[]=[mapping])=>canonicalPlan(date,[source],[summary],maps);

test('reuses database canonical ID and keeps unknown summary dimensions and prices null',()=>{
  const p=build(); expect(p.productIds.get('Coriander')).toBe(106);
  expect(p.records[0]).toMatchObject({product:'Coriander',lowestPrice:null,averagePrice:null,highestPrice:null,mass:null,container:null,valueOfSales:25.12,quantitySold:2});
  expect(p.mtd[0]).toMatchObject({canonicalProductId:106,total_sales:100});
});
test('only combines aliases explicitly sharing a persisted product ID and reports them',()=>{
  const other={...source,sourceProductId:'143',sourceProductName:'CORIANDER/DHANYA'};
  const p=canonicalPlan(date,[source,other],[summary,{...summary,...other}],[mapping,{...mapping,...other}]);
  expect(p.records).toHaveLength(1);expect(p.records[0].valueOfSales).toBe(50.24);
  expect(p.aliases).toEqual([{productId:106,productName:'Coriander',sourceProductIds:['148','143']}]);
});
test('does not infer IDs from similar or exact product names',()=>{expect(()=>build([])).toThrow('UNMAPPED_SOURCE');});
test('rejects conflicting IDs and changed source labels',()=>{
  expect(()=>build([mapping,{...mapping,productId:999}])).toThrow('AMBIGUOUS_SOURCE');
  expect(()=>build([{...mapping,sourceProductName:'ANOTHER PRODUCT'}])).toThrow('SOURCE_NAME_CHANGED');
});
test('rejects inactive, invalid and inconsistently classified products',()=>{
  expect(()=>build([{...mapping,active:false}])).toThrow('INVALID_CANONICAL_PRODUCT');
  expect(()=>build([{...mapping,productId:NaN}])).toThrow('INVALID_CANONICAL_PRODUCT');
  expect(()=>build([mapping,{...mapping,category:'non_produce'}])).toThrow('AMBIGUOUS_SOURCE');
});
test('preserves stored non-produce and artifact categories',()=>{
  expect(build([{...mapping,category:'source_artifact'}]).decisions[0].category).toBe('source_artifact');
});
test('rejects missing/duplicate summaries, signed metrics and fractional quantities',()=>{
  expect(()=>canonicalPlan(date,[source],[],[mapping])).toThrow('COVERAGE');
  expect(()=>canonicalPlan(date,[source,source],[summary,summary],[mapping])).toThrow('DUPLICATE_SOURCE_ID');
  expect(()=>canonicalPlan(date,[source],[{...summary,totalSales:-1}],[mapping])).toThrow('SIGNED');
  expect(()=>canonicalPlan(date,[source],[{...summary,soldQuantity:1.5}],[mapping])).toThrow('NONINTEGER');
});

function archive(root:string,market:'johannesburg'|'tshwane',accepted=true) {
  const c=new SourceCapture(root,market);
  if(market==='tshwane')c.writeJson(`normalized/tshwane-clean-${date}.json`,[{market:'Tshwane',marketDate:date,product:'Coriander'}]);
  else {
    const detail={...source,marketDate:date};
    c.writeJson('catalogue.json',[source]);c.writeJson('summary.json',[summary]);c.writeJson('detailed.json',[detail]);
    c.writeJson('normalized-source-observations.json',[{...detail,sourceRowIndex:0,detailedHtmlSha256:'a'.repeat(64)}]);
    c.writeJson('reconciliation.json',[{sourceProductId:'148',detailVsAggregate:{pass:true},summaryPass:true,sidecars:true}]);
  }
  return c.finalize({accepted,publicationDate:date,records:1,diagnostics:market==='tshwane'?{completeCoverage:true,sourceStatus:{status:'COMPLETE',technicalFailureCount:0,skippedPackageCount:0}}:{collisions:0,sourceCommodities:1,observations:1},semantic:{market,date}});
}
for(const market of ['johannesburg','tshwane'] as const) {
  test(`${market}: accepted bridge preserves capture bytes`,({},info)=>{
    const root=info.outputPath('archive');const c=archive(root,market);
    const before=fs.readFileSync(path.join(c.directory,'manifest.json'),'utf8');
    const result=market==='johannesburg'?loadJohannesburgArchive(root):loadTshwaneArchive(root);
    expect(result.date).toBe(date);expect(fs.readFileSync(path.join(c.directory,'manifest.json'),'utf8')).toBe(before);
  });
  test(`${market}: rejects incomplete, duplicate and tampered captures`,({},info)=>{
    const root=info.outputPath('incomplete');archive(root,market,false);
    expect(()=>acceptedArchive(root,market)).toThrow('NOT_ACCEPTED');
    const duplicateRoot=info.outputPath('duplicate');archive(duplicateRoot,market);archive(duplicateRoot,market);
    expect(()=>acceptedArchive(duplicateRoot,market)).toThrow('EXACTLY_ONE');
    const tamperRoot=info.outputPath('tamper');const c=archive(tamperRoot,market);
    fs.appendFileSync(path.join(c.directory,'capture-start.json'),' ');
    expect(()=>acceptedArchive(tamperRoot,market)).toThrow('HASH_MISMATCH');
  });
}
test('strict product lookup is read only and rejects changed database identity before ingestion writes',async()=>{
  const calls:string[]=[];
  const db={from:(table:string)=>{calls.push(table);expect(table).toBe('products');return {select:()=>({in:async()=>({data:[{id:107,name:'Coriander',is_active:true}],error:null})})};}} as unknown as SupabaseClient;
  await expect(importRecords(db,build().records,'SUCCESS',{existingProductIds:build().productIds})).rejects.toThrow('STRICT_EXISTING_PRODUCTS_CHANGED');
  expect(calls).toEqual(['products']);
});
test('strict product lookup accepts the verified IDs without product upsert',async()=>{
  const db={from:()=>({select:()=>({in:async()=>({data:[{id:106,name:'Coriander',is_active:true}],error:null})})})} as unknown as SupabaseClient;
  expect(await verifiedExistingProducts(db,build().records,build().productIds)).toEqual(new Map([['Coriander',106]]));
});
test('both workflows require explicit enable switches and retain source archives',()=>{
  for(const market of ['johannesburg','tshwane']) {
    const text=fs.readFileSync(path.resolve(`.github/workflows/${market}-collection.yml`),'utf8');
    expect(text).toContain(`vars.MARKETPULSE_ENABLE_${market.toUpperCase()}_IMPORT == 'true'`);
    expect(text).toContain(`scripts/${market}-archive-import.ts --commit`);
    expect(text).toContain('if: ${{ always() }}');expect(text).toContain('scraper-diagnostics/collection-only/');
  }
});

function importDatabase(options:{count?:number;run?:any;periodCount?:number;badMtd?:boolean}={}) {
  let imported=false;let periods:any[]=[];
  const db={from:(table:string)=>({
    select:(_columns:string,selectOptions?:any)=>{
      const q:any={eq:()=>q};
      q.then=(resolve:any)=>{
        if(table==='daily_prices')return Promise.resolve(resolve({count:imported?1:options.count??0,error:null}));
        if(table==='ingestion_runs')return Promise.resolve(resolve({data:imported?[{status:'SUCCESS',records_found:1,records_imported:1}]:options.run?[options.run]:[],error:null}));
        if(table==='market_product_period_metrics')return Promise.resolve(resolve(selectOptions?.head?{count:options.periodCount??0,error:null}:{data:options.badMtd?[]:periods,error:null}));
        throw new Error('Unexpected table: '+table);
      };return q;
    },
    upsert:async(rows:any[])=>{expect(table).toBe('market_product_period_metrics');periods=rows;return {error:null};},
  })} as unknown as SupabaseClient;
  return {db,finish:()=>{imported=true;},getPeriods:()=>periods};
}
test('Johannesburg import guard rejects existing publications, unsafe runs and existing MTD before invoking importer',async({},info)=>{
  const root=info.outputPath('capture');archive(root,'johannesburg');const capture=loadJohannesburgArchive(root);
  for(const [options,message] of [[{count:1},'EXISTING_PUBLICATION'],[{run:{status:'SUCCESS'}},'UNSAFE_EXISTING'],[{periodCount:1},'EXISTING_PERIOD']] as const) {
    const fake=importDatabase(options);let called=false;
    await expect(commitPlan(fake.db,capture,build(),async()=>{called=true;})).rejects.toThrow(message);
    expect(called).toBe(false);
  }
});
test('Johannesburg bridge verifies MTD and final ingestion results using canonical IDs',async({},info)=>{
  const root=info.outputPath('capture');archive(root,'johannesburg');const capture=loadJohannesburgArchive(root);const fake=importDatabase();
  await commitPlan(fake.db,capture,build(),async(_db,records,status,options)=>{
    expect(status).toBe('SUCCESS');expect(records).toHaveLength(1);expect(options?.existingProductIds?.get('Coriander')).toBe(106);
    await options!.afterDailyPricesUpsert!({marketId:3,marketDate:date,productIds:new Map([['Coriander',106]]),marketProductIds:new Map(),marketProductIdsByRecordIndex:[900]});fake.finish();
  });
  expect(fake.getPeriods()[0]).toMatchObject({market_product_id:900,period_start:'2026-11-01',period_end:date,total_sales:100});
});
test('Johannesburg bridge rejects failed MTD verification and false success after import',async({},info)=>{
  const root=info.outputPath('capture');archive(root,'johannesburg');const capture=loadJohannesburgArchive(root);
  const fake=importDatabase({badMtd:true});
  await expect(commitPlan(fake.db,capture,build(),async(_db,_records,_status,options)=>{
    await options!.afterDailyPricesUpsert!({marketId:3,marketDate:date,productIds:new Map(),marketProductIds:new Map(),marketProductIdsByRecordIndex:[900]});
  })).rejects.toThrow('MTD_VERIFICATION_FAILED');
  await expect(commitPlan(importDatabase().db,capture,build(),async()=>{})).rejects.toThrow('POST_IMPORT_VERIFICATION_FAILED');
});
test('both commands reject unrecognized arguments before accessing database or archives',async()=>{
  await expect(johannesburgMain(['--force'])).rejects.toThrow('UNKNOWN_IMPORT_ARGUMENT');
  await expect(tshwaneMain(['--force'])).rejects.toThrow('UNKNOWN_IMPORT_ARGUMENT');
});
test('offline review command produces a canonical plan without database credentials',({},info)=>{
  const root=info.outputPath('capture');archive(root,'johannesburg');
  const snapshot=info.outputPath('snapshot.json');const output=info.outputPath('review.json');
  fs.writeFileSync(snapshot,JSON.stringify({project:'nkrwgbxbfusesxbnwalo',marketId:3,mappings:[mapping]}));
  const result=spawnSync(process.execPath,[path.resolve('node_modules/tsx/dist/cli.mjs'),'scripts/review-johannesburg-archive.ts',`--archive-root=${root}`,`--mapping-snapshot=${snapshot}`,`--output=${output}`],{encoding:'utf8',env:{...process.env,SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:''}});
  expect(result.status,result.stderr).toBe(0);
  const report=JSON.parse(fs.readFileSync(output,'utf8'));
  expect(report.mode).toBe('OFFLINE_REVIEW_NO_DATABASE_ACCESS');expect(report.canonicalDaily[0].product).toBe('Coriander');expect(report.decisions[0].productId).toBe(106);
});
