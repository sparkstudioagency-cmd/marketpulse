import reviewed from '../markets/johannesburg-reviewed-mappings.json';
import {check} from './accepted-archive';
import type {ExistingSourceMapping} from './johannesburg-archive-bridge';

export interface CanonicalProductEvidence {
  id: number;
  name: string;
  is_active: boolean | null;
  analytics_category: string;
}
const key=(s:string)=>s.trim().replace(/\s+/g,' ').toUpperCase();
// One individually reviewed spelling pair, never a general fuzzy matching rule.
const spellingPairs=new Set(['128|BRUSSELS SPROUTS|158|Brussel Sprouts']);

/** Applies a finite, evidence-reviewed list; never searches for new name matches. */
export function applyReviewedMappings(
  persisted: ExistingSourceMapping[],
  products: CanonicalProductEvidence[],
  configuration=reviewed,
): ExistingSourceMapping[] {
  check(configuration.version===1 && configuration.project==='nkrwgbxbfusesxbnwalo' && configuration.marketId===3,'REVIEWED_MAPPING_SCOPE_MISMATCH');
  check(new Set(configuration.rows.map(r=>r.sourceProductId)).size===configuration.rows.length,'DUPLICATE_REVIEWED_SOURCE_ID');
  const result=[...persisted];
  for(const row of configuration.rows) {
    const exactName=key(row.sourceProductName)===key(row.productName);
    const reviewedSpelling=spellingPairs.has([row.sourceProductId,row.sourceProductName,row.productId,row.productName].join('|'));
    check(Number.isSafeInteger(row.productId) && row.productId>0 && row.sourceProductId.trim().length>0 && row.sourceProductName.trim().length>0 && (exactName||reviewedSpelling),'INVALID_REVIEWED_NAME_MAPPING');
    const matches=products.filter(p=>p.id===row.productId);
    check(matches.length===1 && matches[0].name===row.productName && matches[0].is_active===true && matches[0].analytics_category===row.category,'REVIEWED_CANONICAL_PRODUCT_CHANGED: '+row.sourceProductId);
    const refs=persisted.filter(p=>p.sourceProductId===row.sourceProductId);
    check(refs.every(p=>key(p.sourceProductName)===key(row.sourceProductName) && p.productId===row.productId && p.productName===row.productName && p.category===row.category && p.active===true),'REVIEWED_MAPPING_CONFLICTS_WITH_DATABASE: '+row.sourceProductId);
    // Preserve the local aggregation restriction even if a matching reference is later added.
    for(let i=result.length-1;i>=0;i--)if(result[i].sourceProductId===row.sourceProductId)result.splice(i,1);
    check(['fresh_produce','non_produce','source_artifact'].includes(row.category),'INVALID_REVIEWED_CATEGORY');
    result.push({...row,active:true,category:row.category as ExistingSourceMapping['category'],mappingEvidence:exactName?'reviewed_unique_exact_name':'reviewed_explicit_spelling_pair',allowCanonicalAggregation:row.allowCanonicalAggregation});
  }
  return result;
}

export const reviewedCanonicalProductIds=[...new Set(reviewed.rows.map(r=>r.productId))];
