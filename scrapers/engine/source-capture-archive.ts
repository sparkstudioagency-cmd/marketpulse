import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export type CollectionMarket = 'johannesburg' | 'tshwane';
export const canonical = (v: unknown): string => JSON.stringify(sort(v));
function sort(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sort);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,x]) => [k,sort(x)]));
  return v;
}
export const sha256 = (v: string | Buffer): string => createHash('sha256').update(v).digest('hex');
export function filesIn(root: string): string[] {
  const result: string[] = [];
  function walk(dir: string) { for (const e of fs.readdirSync(dir,{withFileTypes:true})) {
    if (e.isSymbolicLink()) throw new Error('ARCHIVE_SYMLINK_REJECTED');
    const p=path.join(dir,e.name); if(e.isDirectory()) walk(p); else if(e.isFile()) result.push(path.relative(root,p).replaceAll('\\','/'));
  }}
  walk(root); return result.sort();
}
export function inside(root: string, file: string): string {
  const r=path.resolve(root),p=path.resolve(file);
  if(!p.startsWith(r+path.sep)) throw new Error('ARCHIVE_PATH_ESCAPE');
  return p;
}
export interface CaptureValidation {
  accepted: boolean; publicationDate: string | null; records: number;
  diagnostics: Record<string,unknown>; semantic: unknown;
}
export class SourceCapture {
  readonly root: string; readonly directory: string; readonly id: string; readonly startedAt=new Date().toISOString();
  constructor(root: string,readonly market: CollectionMarket) {
    this.root=path.resolve(root); this.id=this.startedAt.replace(/[-:.]/g,'')+'-'+randomUUID();
    this.directory=inside(this.root,path.join(this.root,'.pending',market+'-'+this.id));
    fs.mkdirSync(this.directory,{recursive:true});
    this.writeJson('capture-start.json',{captureId:this.id,market,startedAt:this.startedAt,mode:'COLLECTION_ONLY',databaseAccess:false});
  }
  private sealed=false;
  write(name: string,bytes: string|Buffer): void {
    if(this.sealed) throw new Error('CAPTURE_SEALED');
    if(!name||name.split(/[\\/]/).some(p=>!p||p==='.'||p==='..')) throw new Error('ARCHIVE_PATH_ESCAPE');
    const file=inside(this.directory,path.join(this.directory,name));fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes,{flag:'wx'});
  }
  writeJson(name: string,value: unknown): void {this.write(name,JSON.stringify(value,null,2)+'\n');}
  finalize(v: CaptureValidation) {
    const date=v.publicationDate;
    if(date && (!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)) throw new Error('INVALID_PUBLICATION_DATE');
    if(v.accepted&&(!date||!Number.isSafeInteger(v.records)||v.records<1)) throw new Error('INCOMPLETE_ACCEPTANCE');
    const digest=sha256(canonical(v.semantic));
    const parent=inside(this.root,path.join(this.root,this.market,date??'UNKNOWN',digest));
    let duplicateOf: string|null=null;
    if(fs.existsSync(parent)) for(const e of fs.readdirSync(parent,{withFileTypes:true})) if(e.isDirectory()) {
      const previous=path.join(parent,e.name,'manifest.json');if(fs.existsSync(previous)){verifyCapture(path.dirname(previous)); const m=JSON.parse(fs.readFileSync(previous,'utf8'));if(m.status==='ACCEPTED'&&v.accepted){duplicateOf=path.dirname(previous);break;}}
    }
    const fileHashes=Object.fromEntries(filesIn(this.directory).map(n=>[n,sha256(fs.readFileSync(path.join(this.directory,n)))]));
    const manifest={version:1,market:this.market,captureId:this.id,publicationDate:date,startedAt:this.startedAt,finishedAt:new Date().toISOString(),contentSha256:digest,status:v.accepted?'ACCEPTED':'INCOMPLETE',records:v.records,duplicateOf,stages:{collected:v.records>0,validated:v.accepted,archived:true,imported:false,reconciled:false},databaseAccess:false,diagnostics:v.diagnostics,files:fileHashes};
    this.writeJson('manifest.json',manifest);this.sealed=true;
    fs.mkdirSync(parent,{recursive:true});const destination=inside(this.root,path.join(parent,this.id));
    // Both absolute endpoints are within this explicitly owned archive root; no overwrite.
    inside(this.root,this.directory);inside(this.root,destination);if(fs.existsSync(destination))throw new Error('CAPTURE_ALREADY_EXISTS');fs.renameSync(this.directory,destination);
    verifyCapture(destination);return {directory:destination,manifest};
  }
}
export function verifyCapture(dir: string): void {
  const m=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8')) as {files:Record<string,string>};
  const actual=filesIn(dir).filter(n=>n!=='manifest.json');if(canonical(actual)!==canonical(Object.keys(m.files).sort()))throw new Error('ARCHIVE_FILE_SET_CHANGED');
  for(const[n,h]of Object.entries(m.files))if(sha256(fs.readFileSync(inside(dir,path.join(dir,n))))!==h)throw new Error('ARCHIVE_HASH_MISMATCH');
}
export function collectionArguments(args: string[]) {
  const allowed=['--collect-public','--from-archive=','--output-root=','--max-products=','--timeout-ms='];
  for(const a of args)if(!allowed.some(p=>p.endsWith('=')?a.startsWith(p):a===p))throw new Error('COLLECTION_ONLY_ARGUMENT_REJECTED: '+a);
  const archive=args.find(a=>a.startsWith('--from-archive='))?.slice(15);
  if(!!archive===args.includes('--collect-public'))throw new Error('CHOOSE_ONE_PUBLIC_COLLECTION_OR_ARCHIVE_DRY_RUN');
  return {archive,root:args.find(a=>a.startsWith('--output-root='))?.slice(14)??'scraper-diagnostics/collection-only'};
}
