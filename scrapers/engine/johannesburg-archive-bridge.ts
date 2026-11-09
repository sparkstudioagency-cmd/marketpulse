import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { acceptedArchive, check, readJson } from './accepted-archive';
import { canonical, sha256 } from './source-capture-archive';
import type { Commodity, Summary, Detail } from '../markets/johannesburg-detailed';
import type { CleanMarketRecord, ProductAnalyticsCategory } from './supabase-importer';
import {applyReviewedMappings,reviewedCanonicalProductIds} from './johannesburg-reviewed-mappings';

export interface ExistingSourceMapping extends Commodity {
  productId: number; productName: string; active: boolean; category: ProductAnalyticsCategory;
  mappingEvidence?: string;
  allowCanonicalAggregation?: boolean;
}
const nameKey = (s: string) => s.trim().replace(/\s+/g, ' ').toUpperCase();
const categories = ['fresh_produce', 'non_produce', 'source_artifact'];

// Only explicit persisted or individually reviewed mappings are accepted. No inferred IDs.
function verifiedPeachesAggregation(
  previous: Summary[],
  next: Summary,
  productId: number,
  detailed?: Detail[],
): boolean {
  if (!detailed || productId !== 27935) return false;

  const sources = [...previous, next];
  if (
    sources.length !== 2 ||
    sources.some(s => nameKey(s.sourceProductName) !== 'PEACHES') ||
    new Set(sources.map(s => s.sourceProductId)).size !== 2 ||
    !sources.some(s => s.sourceProductId === '73') ||
    !sources.some(s => s.sourceProductId === '102')
  ) return false;

  const cents = (n: number) => Math.round(n * 100);
  const metrics = ['totalSales', 'soldQuantity', 'totalMass'] as const;
  const dimensions = [
    'container', 'unitMass', 'variety', 'class',
    'size', 'count', 'colour',
  ] as const;

  const detailsBySource = new Map<string, Detail[]>();

  for (const source of sources) {
    const rows = detailed.filter(
      d => d.sourceProductId === source.sourceProductId
        && nameKey(d.sourceProductName) === 'PEACHES',
    );
    if (rows.length === 0) return false;

    for (const metric of metrics) {
      const total = rows.reduce((sum, r) => {
        const value = r[metric];
        return sum + (typeof value === 'number' && Number.isFinite(value)
          ? cents(value) : Number.NaN);
      }, 0);
      if (!Number.isSafeInteger(total)) return false;

      const expected = cents(source[metric]);

      // Published whole-kg mass may be rounded from detailed fractional kg.
      // Sales and quantities must always reconcile exactly.
      const exact = total === expected;
      const roundedMass =
        metric === 'totalMass' &&
        Number.isInteger(source.totalMass) &&
        total % 100 === 50 &&
        Math.round(total / 100) === source.totalMass;

      if (!exact && !roundedMass) return false;
    }
    detailsBySource.set(source.sourceProductId, rows);
  }

  const key = (d: Detail) => JSON.stringify(
    dimensions.map(field => {
      const v = d[field];
      return v === null || v === undefined
        ? null : String(v).trim().toUpperCase();
    }),
  );

  const first = new Set((detailsBySource.get('73') ?? []).map(key));
  return !(detailsBySource.get('102') ?? []).some(d => first.has(key(d)));
}
export function canonicalPlan(date: string, catalogue: Commodity[], summary: Summary[], mappings: ExistingSourceMapping[], detailed?: Detail[]) {
  check(catalogue.length > 0 && summary.length === catalogue.length, 'CATALOGUE_SUMMARY_COVERAGE_MISMATCH');
  check(new Set(catalogue.map(c => c.sourceProductId)).size === catalogue.length, 'DUPLICATE_SOURCE_ID');
  const groups = new Map<number, { mapping: ExistingSourceMapping; sources: Summary[] }>();
  const decisions: ExistingSourceMapping[] = [];
  for (const source of catalogue) {
    check(typeof source.sourceProductId === 'string' && source.sourceProductId.length > 0 && typeof source.sourceProductName === 'string' && source.sourceProductName.trim().length > 0, 'INVALID_SOURCE_IDENTITY');
    const refs = mappings.filter(m => m.sourceProductId === source.sourceProductId);
    check(refs.length > 0, 'UNMAPPED_SOURCE: ' + source.sourceProductId);
    check(refs.every(m => nameKey(m.sourceProductName) === nameKey(source.sourceProductName)), 'SOURCE_NAME_CHANGED: ' + source.sourceProductId);
    check(new Set(refs.map(m => canonical([m.productId, m.productName, m.category, m.active]))).size === 1, 'AMBIGUOUS_SOURCE: ' + source.sourceProductId);
    const mapping = refs[0];
    check(Number.isSafeInteger(mapping.productId) && mapping.productId > 0 && mapping.active === true && mapping.productName.trim() === mapping.productName && mapping.productName.length > 0 && categories.includes(mapping.category), 'INVALID_CANONICAL_PRODUCT');
    const rows = summary.filter(s => s.sourceProductId === source.sourceProductId);
    check(rows.length === 1 && nameKey(rows[0].sourceProductName) === nameKey(source.sourceProductName), 'SUMMARY_SOURCE_MISMATCH');
    const row = rows[0];
    check(row.mtd && [row.totalSales,row.soldQuantity,row.totalMass,row.quantityAvailable,row.mtd.totalSales,row.mtd.soldQuantity,row.mtd.totalMass].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0), 'UNSUPPORTED_SIGNED_OR_INVALID_METRICS');
    check(Number.isSafeInteger(row.soldQuantity) && Number.isSafeInteger(row.quantityAvailable) && Number.isSafeInteger(row.mtd.soldQuantity), 'NONINTEGER_QUANTITY');
    const group = groups.get(mapping.productId) ?? { mapping, sources: [] };
    check(group.mapping.productName === mapping.productName && group.mapping.category === mapping.category, 'CONFLICTING_CANONICAL_METADATA');
    check(group.sources.length===0 || (group.mapping.allowCanonicalAggregation!==false && mapping.allowCanonicalAggregation!==false) || verifiedPeachesAggregation(group.sources,row,mapping.productId,detailed),'REVIEWED_ALIAS_AGGREGATION_REQUIRES_REVIEW: '+mapping.productId);
    group.sources.push(row); groups.set(mapping.productId, group); decisions.push(mapping);
  }
  check(new Set(decisions.map(m => m.productName)).size === groups.size, 'CANONICAL_NAME_ID_CONFLICT');
  const canonicalGroups = [...groups.values()].sort((a,b) => a.mapping.productId-b.mapping.productId);
  const sum = (sources: Summary[], get: (s: Summary) => number) => {
    const n = sources.reduce((a,s) => a + Math.round(get(s)*100), 0);
    check(Number.isSafeInteger(n), 'UNSAFE_METRIC_SUM'); return n/100;
  };
  const records: CleanMarketRecord[] = canonicalGroups.map(({mapping,sources}) => ({
    market: 'Johannesburg Market', marketDate: date, product: mapping.productName,
    // Source summaries have no package, grade, unit mass or price range.
    grade: null, container: null, count: null, mass: null, province: 'UNSPECIFIED',
    lowestPrice: null, averagePrice: null, highestPrice: null,
    quantitySold: sum(sources,s=>s.soldQuantity), totalMass: sum(sources,s=>s.totalMass),
    valueOfSales: sum(sources,s=>s.totalSales), quantityOnHand: sum(sources,s=>s.quantityAvailable),
    raw: { sourceProductIds: sources.map(s=>s.sourceProductId), aggregation: 'explicit_existing_product_mappings' },
  }));
  const mtd = canonicalGroups.map(({mapping,sources}) => ({
    canonicalProductId: mapping.productId, canonicalProductName: mapping.productName,
    sold_quantity: sum(sources,s=>s.mtd.soldQuantity), total_mass: sum(sources,s=>s.mtd.totalMass), total_sales: sum(sources,s=>s.mtd.totalSales),
  }));
  return { records, mtd, decisions, aliases: canonicalGroups.filter(g=>g.sources.length>1).map(g=>({productId:g.mapping.productId,productName:g.mapping.productName,sourceProductIds:g.sources.map(s=>s.sourceProductId)})),
    productIds: new Map(decisions.map(m=>[m.productName,m.productId])) };
}

export function loadJohannesburgArchive(root: string) {
  const capture = acceptedArchive(root, 'johannesburg');
  const {directory,manifest,date} = capture;
  const catalogue = readJson<Commodity[]>(path.join(directory,'catalogue.json'));
  const summary = readJson<Summary[]>(path.join(directory,'summary.json'));
  const detailed = readJson<Detail[]>(path.join(directory,'detailed.json'));
  const observations = readJson<Array<Detail & {sourceRowIndex:number;detailedHtmlSha256:string}>>(path.join(directory,'normalized-source-observations.json'));
  const reconciliation = readJson<any[]>(path.join(directory,'reconciliation.json'));
  check([catalogue,summary,detailed,observations,reconciliation].every(Array.isArray), 'ARCHIVE_ARRAY_REQUIRED');
  check(detailed.length === manifest.records && observations.length === detailed.length, 'OBSERVATION_COUNT_MISMATCH');
  check(manifest.diagnostics?.collisions === 0 && manifest.diagnostics?.sourceCommodities === catalogue.length && manifest.diagnostics?.observations === observations.length, 'INCOMPLETE_SOURCE_COVERAGE');
  check(reconciliation.length === catalogue.length && catalogue.every(c=>reconciliation.filter(r=>r.sourceProductId===c.sourceProductId && r.detailVsAggregate?.pass===true && r.summaryPass===true && r.sidecars===true).length===1), 'SOURCE_RECONCILIATION_REQUIRED');
  check(detailed.every((r,i)=>r.marketDate===date && catalogue.some(c=>c.sourceProductId===r.sourceProductId && c.sourceProductName===r.sourceProductName) && Object.entries(r).every(([k,v])=>canonical((observations[i] as any)[k])===canonical(v)) && Number.isSafeInteger(observations[i].sourceRowIndex) && /^[a-f0-9]{64}$/.test(observations[i].detailedHtmlSha256)), 'DETAIL_OBSERVATION_MISMATCH');
  return {...capture,catalogue,summary,detailed,observationDigest:sha256(canonical(observations))};
}

export async function loadExistingMappings(db: SupabaseClient): Promise<ExistingSourceMapping[]> {
  const result: ExistingSourceMapping[] = [];
  for(let offset=0;;offset+=500) {
    const {data,error} = await db.from('market_product_source_refs').select('source_product_id,source_product_name,market_products!inner(product_id,products!inner(id,name,is_active,analytics_category))').eq('market_id',3).order('id',{ascending:true}).range(offset,offset+499);
    check(!error && data, 'SOURCE_MAPPING_LOOKUP_FAILED: '+error?.message);
    for(const row of data as unknown as any[]) {
      const p=row.market_products?.products;
      check(p && !Array.isArray(p) && p.id===row.market_products.product_id, 'INVALID_MAPPING_JOIN');
      result.push({sourceProductId:row.source_product_id,sourceProductName:row.source_product_name,productId:p.id,productName:p.name,active:p.is_active,category:p.analytics_category,mappingEvidence:'database_source_reference'});
    }
    if(data.length<500)break;
  }
  const {data:products,error}=await db.from('products').select('id,name,is_active,analytics_category').in('id',reviewedCanonicalProductIds);
  check(!error && products,'REVIEWED_PRODUCT_LOOKUP_FAILED: '+error?.message);
  return applyReviewedMappings(result,products);
}
