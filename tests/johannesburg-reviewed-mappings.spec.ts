import {expect,test} from '@playwright/test';
import configuration from '../scrapers/markets/johannesburg-reviewed-mappings.json';
import {applyReviewedMappings,type CanonicalProductEvidence} from '../scrapers/engine/johannesburg-reviewed-mappings';
import {canonicalPlan,type ExistingSourceMapping} from '../scrapers/engine/johannesburg-archive-bridge';

const products:CanonicalProductEvidence[]=configuration.rows.map(r=>({id:r.productId,name:r.productName,is_active:true,analytics_category:r.category}));
const summary=(id:string,name:string)=>({sourceProductId:id,sourceProductName:name,totalSales:10,soldQuantity:1,totalMass:2,quantityAvailable:3,mtd:{totalSales:30,soldQuantity:3,totalMass:6}});

test('reviewed mappings verify six existing and thirteen approved canonical IDs',()=>{
  const rows=applyReviewedMappings([],products);
  expect(rows.map(r=>[r.sourceProductId,r.productId])).toEqual([
  ['100',28054],['102',27935],['104',1204],
  ['128',158],['195',31613],['270',404],
  ['42',31642],['106',31643],['160',31644],
  ['171',31645],['223',31646],['245',31647],
  ['247',31648],['271',31649],['287',31650],
  ['312',31651],['362',31652],['387',31653],
  ['924',31654],
]);
  expect(rows[0].category).toBe('non_produce');
  for(const r of rows) {
    const plan=canonicalPlan('2026-11-06',[r],[summary(r.sourceProductId,r.sourceProductName)],rows);
    expect(plan.productIds.get(r.productName)).toBe(r.productId);
    expect(plan.records[0].valueOfSales).toBe(10);
  }
});
test('rejects missing, renamed, inactive, duplicated or reclassified canonical evidence',()=>{
  expect(()=>applyReviewedMappings([],products.slice(1))).toThrow('REVIEWED_CANONICAL_PRODUCT_CHANGED');
  for(const patch of [{name:'Other'},{is_active:false},{analytics_category:'fresh_produce'}]) {
    expect(()=>applyReviewedMappings([],[{...products[0],...patch},...products.slice(1)])).toThrow('REVIEWED_CANONICAL_PRODUCT_CHANGED');
  }
  expect(()=>applyReviewedMappings([],[products[0],...products])).toThrow('REVIEWED_CANONICAL_PRODUCT_CHANGED');
});
test('rejects conflict with any existing source reference instead of replacing database authority',()=>{
  const persisted:ExistingSourceMapping={sourceProductId:'100',sourceProductName:'HONEY',productId:1,productName:'Other',active:true,category:'non_produce'};
  expect(()=>applyReviewedMappings([persisted],products)).toThrow('REVIEWED_MAPPING_CONFLICTS_WITH_DATABASE');
});
test('does not resolve unreviewed sources by fuzzy spelling, cultivar or generic name',()=>{
  const rows=applyReviewedMappings([],products);
  for(const [id,name] of [['99942','LITCHIS'],['999387','HABISCUS'],['999362','MACADAMIA (SHELL)'],['999924','JAM']]) {
    expect(()=>canonicalPlan('2026-11-06',[{sourceProductId:id,sourceProductName:name}],[summary(id,name)],rows)).toThrow('UNMAPPED_SOURCE');
  }
});
test('PEACHES identity does not authorize combining source totals in either catalogue order',()=>{
  const persisted:ExistingSourceMapping={sourceProductId:'73',sourceProductName:'PEACHES',productId:27935,productName:'Peaches',active:true,category:'fresh_produce'};
  const rows=applyReviewedMappings([persisted],products);
  const cats=[{sourceProductId:'73',sourceProductName:'PEACHES'},{sourceProductId:'102',sourceProductName:'PEACHES'}];
  for(const ordered of [cats,[...cats].reverse()]) {
    expect(()=>canonicalPlan('2026-11-06',ordered,ordered.map(r=>summary(r.sourceProductId,r.sourceProductName)),rows)).toThrow('REVIEWED_ALIAS_AGGREGATION_REQUIRES_REVIEW');
  }
});
test('adding an identical persisted reference does not lift the reviewed aggregation restriction',()=>{
  const rows=applyReviewedMappings([],products);
  const again=applyReviewedMappings(rows,products);
  expect(again).toHaveLength(19);expect(again.find(r=>r.sourceProductId==='102')?.allowCanonicalAggregation).toBe(false);
});
test('spelling permission applies only to the reviewed source and product identity',()=>{
  const changed={...configuration,rows:configuration.rows.map(r=>r.sourceProductId==='128'?{...r,sourceProductId:'999'}:r)};
  expect(()=>applyReviewedMappings([],products,changed)).toThrow('INVALID_REVIEWED_NAME_MAPPING');
});
