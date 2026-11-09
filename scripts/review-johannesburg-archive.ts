/** Offline review only. The snapshot supplies evidence, never production write authority. */
import fs from 'node:fs';
import path from 'node:path';
import {check,readJson} from '../scrapers/engine/accepted-archive';
import {canonicalPlan,loadJohannesburgArchive,type ExistingSourceMapping} from '../scrapers/engine/johannesburg-archive-bridge';
import {applyReviewedMappings,type CanonicalProductEvidence} from '../scrapers/engine/johannesburg-reviewed-mappings';

function main() {
  const args=process.argv.slice(2);
  check(args.length===3 && args.every(a=>['--archive-root=','--mapping-snapshot=','--output='].some(p=>a.startsWith(p))), 'REVIEW_REQUIRES_ARCHIVE_ROOT_MAPPING_SNAPSHOT_AND_OUTPUT');
  function option(prefix:string) { const values=args.filter(a=>a.startsWith(prefix));check(values.length===1,'DUPLICATE_OR_MISSING_OPTION');return values[0].slice(prefix.length); }
  const archive=loadJohannesburgArchive(option('--archive-root='));
  const snapshot=readJson<{project:string;marketId:number;mappings:ExistingSourceMapping[];products?:CanonicalProductEvidence[]}>(option('--mapping-snapshot='));
  check(snapshot.project==='nkrwgbxbfusesxbnwalo' && snapshot.marketId===3 && Array.isArray(snapshot.mappings),'WRONG_MAPPING_SNAPSHOT');
  const mappings=snapshot.products ? applyReviewedMappings(snapshot.mappings,snapshot.products) : snapshot.mappings;
  const plan=canonicalPlan(archive.date,archive.catalogue,archive.summary,mappings);
  const output=path.resolve(option('--output='));
  // Review reports must remain outside the sealed source capture.
  const relative=path.relative(archive.directory,output);
  check(relative.startsWith('..'+path.sep) || path.isAbsolute(relative),'REVIEW_OUTPUT_INSIDE_CAPTURE');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify({mode:'OFFLINE_REVIEW_NO_DATABASE_ACCESS',captureId:archive.manifest.captureId,publicationDate:archive.date,archiveContentSha256:archive.manifest.contentSha256,observationDigest:archive.observationDigest,observations:archive.manifest.records,sourceProducts:archive.catalogue.length,canonicalProducts:plan.records.length,decisions:plan.decisions,aliases:plan.aliases,canonicalDaily:plan.records,canonicalMtd:plan.mtd},null,2)+'\n',{flag:'wx'});
  console.log(`OFFLINE_MAPPING_VERIFIED date=${archive.date} sources=${archive.catalogue.length} canonical=${plan.records.length} observations=${archive.manifest.records} aliases=${plan.aliases.length}`);
}
if(require.main===module)try{main();}catch(e){console.error(e instanceof Error?e.message:String(e));process.exitCode=1;}
