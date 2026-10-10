import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { SourceCapture, collectionArguments, canonical, sha256 } from '../scrapers/engine/source-capture-archive';
import { SOURCE, publicationDate, catalogue, summaries, details, containers, identity, duplicates, totals, compare, type Detail, type Summary } from '../scrapers/markets/johannesburg-detailed';

export async function collectJohannesburg(args: string[]) {
  const options=collectionArguments(args);
  if(args.some(a=>a.startsWith('--max-products=')))throw new Error('JOHANNESBURG_REQUIRES_COMPLETE_CATALOGUE');
  const capture=new SourceCapture(options.root,'johannesburg');
  let date: string|null=null;let rows: Detail[]=[];
  const requests: Record<string,unknown>[]=[];const started=Date.now();
  const timeout=Number(args.find(a=>a.startsWith('--timeout-ms='))?.slice(13)??900000);
  if(!Number.isSafeInteger(timeout)||timeout<1000||timeout>1800000)throw new Error('INVALID_TIMEOUT');
  async function get(name: string,url: string): Promise<string> {
    if(options.archive){const f=path.join(options.archive,'raw',name);const b=fs.readFileSync(f);capture.write('raw/'+name,b);return b.toString('utf8');}
    const parsed=new URL(url),source=new URL(SOURCE);
    if(parsed.origin!==source.origin||parsed.pathname!==source.pathname)throw new Error('PUBLIC_SOURCE_TARGET_REJECTED');
    for(let attempt=0;attempt<2;attempt++) {
      if(Date.now()-started>timeout)throw new Error('COLLECTION_DEADLINE_EXCEEDED');
      await delay(1000);
      let r: Response;
      let bytes: Buffer;

      try {
        r = await fetch(url, {
          redirect: 'error',
          signal: AbortSignal.timeout(
            Math.min(30000, Math.max(1, timeout - (Date.now() - started)))
          ),
          headers: {
            'User-Agent': 'MarketPulse collection-only evidence preservation'
          }
        });

        bytes = Buffer.from(await r.arrayBuffer());
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : 'UNKNOWN_TRANSPORT_ERROR';

        requests.push({
          url,
          attempt,
          status: 'TRANSPORT_ERROR',
          capturedAt: new Date().toISOString(),
          error: message
        });

        if (attempt === 1) {
          throw new Error(
            `SOURCE_TRANSPORT_RETRIES_EXHAUSTED: ${url}: ${message}`
          );
        }

        const remaining = timeout - (Date.now() - started);

        if (remaining <= 3000) {
          throw new Error('COLLECTION_DEADLINE_EXCEEDED');
        }

        await delay(3000);
        continue;
      }
      if(bytes.length>8*1024*1024)throw new Error('SOURCE_RESPONSE_TOO_LARGE');
      requests.push({url,attempt,status:r.status,capturedAt:new Date().toISOString(),bytes:bytes.length,sha256:sha256(bytes)});
      if(r.ok){capture.write('raw/'+name,bytes);return bytes.toString('utf8');}
      capture.write('raw/failed-'+name+'-'+attempt,bytes);
      if(attempt===1||(![429,500,502,503,504].includes(r.status)))throw new Error('SOURCE_HTTP_'+r.status);
      const retry=Number(r.headers.get('retry-after')??2);if(!Number.isFinite(retry)||retry>60)throw new Error('SOURCE_BACKOFF_REQUIRED');await delay(Math.max(2000,retry*1000));
    }
    throw new Error('SOURCE_REQUEST_FAILED');
  }
  try {
    const start=await get('index-start.html',SOURCE);date=publicationDate(start);
    const cats = catalogue(start);

    const nameCounts = new Map<string, number>();
    for (const commodity of cats) {
      nameCounts.set(
        commodity.sourceProductName,
        (nameCounts.get(commodity.sourceProductName) ?? 0) + 1
      );
    }

    const ambiguous = cats.filter(
      commodity => (nameCounts.get(commodity.sourceProductName) ?? 0) > 1
    );

    const preloadedAggregates = new Map<
      string,
      ReturnType<typeof containers>
    >();

    for (const commodity of ambiguous) {
      const html = await get(
        'commodity-' + commodity.sourceProductId + '-aggregate.html',
        SOURCE + '?commodity=' + commodity.sourceProductId + '&containerall=1'
      );

      if (publicationDate(html) !== date) {
        throw new Error('PUBLICATION_CHANGED');
      }

      preloadedAggregates.set(
        commodity.sourceProductId,
        containers(html)
      );
    }

    const summary = summaries(start, cats, preloadedAggregates);
    const aggregate: Record<string,unknown>[]=[];
    const reconciliation: Record<string,unknown>[]=[];
    for(const [i,c]of cats.entries()) {
      const detailed=await get('commodity-'+c.sourceProductId+'-detailed.html',SOURCE+'?commodity='+c.sourceProductId+'&containerall=2');
      const agg = preloadedAggregates.has(c.sourceProductId)
        ? fs.readFileSync(
            path.join(capture.directory, 'raw', 'commodity-' + c.sourceProductId + '-aggregate.html'),
            'utf8'
          )
        : await get(
            'commodity-' + c.sourceProductId + '-aggregate.html',
            SOURCE + '?commodity=' + c.sourceProductId + '&containerall=1'
          );
      if(publicationDate(agg)!==date)throw new Error('PUBLICATION_CHANGED');
      const dr=details(detailed,c,date),ar=containers(agg);rows.push(...dr);
      aggregate.push(...ar.map(r=>({...c,marketDate:date,...r})));
      const s=summary.find(s=>s.sourceProductId===c.sourceProductId)!;
      const t=totals(dr),a=totals(ar);const exact=compare(t,a);
      const summaryPass=t.totalSales===s.totalSales&&t.soldQuantity===s.soldQuantity&&(t.totalMass===s.totalMass||Math.round(t.totalMass)===s.totalMass);
      const inventory=ar.reduce((n,r)=>n+Math.round(r.quantityAvailable*100),0)/100;
      const mtd=totals(ar.map(r=>r.mtd));
      const mtdMassDelta=mtd.totalMass-s.mtd.totalMass;
      const displayedMtdRounding=ar.every(r=>Number.isInteger(r.mtd.totalMass))&&Number.isInteger(s.mtd.totalMass)&&Math.abs(mtdMassDelta)<=(ar.length+1)/2;
      const mtdSalesRounding=mtd.totalSales===s.mtd.totalSales||Math.round(mtd.totalSales*10)/10===s.mtd.totalSales;
      const sidecars=inventory===s.quantityAvailable&&mtdSalesRounding&&mtd.soldQuantity===s.mtd.soldQuantity&&(mtdMassDelta===0||displayedMtdRounding);
      reconciliation.push({sourceProductId:c.sourceProductId,detailedRows:dr.length,detailVsAggregate:exact,summaryPass,sidecars,mtdSalesDifference:mtd.totalSales-s.mtd.totalSales,mtdSalesRounding,mtdMassDelta,displayedMtdRounding,summaryMassRoundingDifference:t.totalMass!==s.totalMass});
      if(!exact.pass||!summaryPass||!sidecars)throw new Error('SOURCE_RECONCILIATION_FAILED: '+c.sourceProductId);
      if(i%10===0)console.log('Johannesburg: '+(i+1)+'/'+cats.length+' commodities archived; publication '+date);
    }
    const end=await get('index-end.html',SOURCE);
    if(publicationDate(end)!==date||canonical(catalogue(end))!==canonical(cats)||canonical(summaries(end,cats,preloadedAggregates))!==canonical(summary))throw new Error('PUBLICATION_CHANGED_DURING_CAPTURE');
    const sourceDuplicates=duplicates(rows);
    const canonicalIdentities=rows.map(r=>canonical([r.sourceProductId,r.sourceProductName,r.container,r.unitMass,r.variety,r.class,r.size,r.count,r.colour,'UNSPECIFIED',null]));
    if(sourceDuplicates.length||new Set(canonicalIdentities).size!==rows.length||!rows.length)throw new Error('IDENTITY_COLLISION_OR_EMPTY_SNAPSHOT');
    capture.writeJson('catalogue.json',cats);capture.writeJson('summary.json',summary);capture.writeJson('detailed.json',rows);capture.writeJson('aggregate.json',aggregate);capture.writeJson('reconciliation.json',reconciliation);
    const normalized=rows.map((r,index)=>({...r,sourceRowIndex:rows.slice(0,index).filter(p=>p.sourceProductId===r.sourceProductId).length,rawPositions:r.rawProductCombination.split(',').map(s=>s.trim()),detailedHtmlSha256:sha256(fs.readFileSync(path.join(capture.directory,'raw','commodity-'+r.sourceProductId+'-detailed.html')))}));
    capture.writeJson('normalized-source-observations.json',normalized);capture.writeJson('requests.json',requests);
    const metrics={sourceCommodities:cats.length,observations:rows.length,dailyCandidates:rows.filter(r=>[r.totalSales,r.soldQuantity,r.totalMass].some(v=>v!==0)).length,zeroTrade:rows.filter(r=>[r.totalSales,r.soldQuantity,r.totalMass].every(v=>v===0)).length,signed:rows.filter(r=>[r.totalSales,r.soldQuantity,r.totalMass].some(v=>v<0)).length,inventory:summary.length,mtd:summary.length,collisions:0,summaryMassRoundingDifferences:reconciliation.filter(r=>r.summaryMassRoundingDifference).length};
    const semanticRows=rows.map(({rawCells,rawProductCombination,sourceUrl,...r})=>r).sort((a,b)=>canonical(a)<canonical(b)?-1:canonical(a)>canonical(b)?1:0);
    return capture.finalize({accepted:true,publicationDate:date,records:rows.length,diagnostics:{...metrics,requests:requests.length,freshPublicCollection:!options.archive},semantic:{publicationDate:date,rows:semanticRows,summary}});
  } catch(error) {
    const message=error instanceof Error?error.message:'COLLECTION_FAILED';
    capture.writeJson('failure.json',{message,publicationDate:date,requests});
    const saved=capture.finalize({accepted:false,publicationDate:date,records:rows.length,diagnostics:{error:message,requests:requests.length},semantic:{publicationDate:date,incomplete:true,rows}});
    console.error('Evidence retained at '+saved.directory);throw error;
  }
}
if(require.main===module)collectJohannesburg(process.argv.slice(2)).then(r=>console.log(JSON.stringify({directory:r.directory,...r.manifest}))).catch(e=>{console.error(e instanceof Error?e.message:'COLLECTION_FAILED');process.exitCode=1;});
