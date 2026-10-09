/** Phase 1 source model. Deliberately independent of the production importer. */
export const SOURCE = 'https://joburgmarket.co.za/jhb-market/dailyprices.php';
export const DETAIL_HEADERS = ['Container', 'Unit Mass', 'Product Combination', 'Total Value Sold', 'Total Qty Sold', 'Total Kg Sold', 'Average', 'Highest Price', 'Ave per Kg', 'Highest Price per Kg'];
export const CONTAINER_HEADERS = ['Container', 'Qty Available', 'Value Sold', 'Qty Sold', 'Kg Sold', 'Average Price per Kg'];
export const SUMMARY_HEADERS = ['Commodity', 'Total Value Sold', 'Total Qty Sold', 'Total Kg Sold', 'Qty Available'];
export interface Commodity { sourceProductId: string; sourceProductName: string }
export interface Totals { totalSales: number; soldQuantity: number; totalMass: number }
export interface Dimensions { variety: string | null; class: string | null; size: string | null; count: string | null; colour: string | null; rawProductCombination: string }
export interface Detail extends Commodity, Totals, Dimensions { marketDate: string; container: string; unitMass: number; averagePrice: number; highestPrice: number; randPerKg: number; highestRandPerKg: number; lowestPrice: null; sourceUrl: string; rawCells: string[] }
export interface ContainerRow extends Totals { container: string; quantityAvailable: number; mtd: Totals; randPerKg: number; rawCells: string[] }
export interface Summary extends Commodity, Totals { quantityAvailable: number; mtd: Totals }
export function text(html: string): string {
  return html.replace(/<br\s*\/?>/gi, ' / ').replace(/<[^>]+>/g, '').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, ' ').trim();
}
export function numeric(raw: string): number {
  const value = raw.trim().replace(/^R\s*/, '');
  if (!/^-?(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?|\.\d{1,2})$/.test(value)) throw new Error(`Malformed decimal: ${raw}`);
  const result = Number(value.replace(/,/g, ''));
  if (!Number.isSafeInteger(Math.round(result * 100))) throw new Error(`Unsafe numeric: ${raw}`);
  return result;
}

export function unitMassNumeric(raw: string): number {
  const value = raw.trim().replace(/^R\s*/, '');
  if (!/^-?(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,3})?|\.\d{1,3})$/.test(value)) throw new Error(`Malformed Unit Mass decimal: ${raw}`);
  const result = Number(value.replace(/,/g, ''));
  if (!Number.isSafeInteger(Math.round(result * 1000))) throw new Error(`Unsafe Unit Mass numeric: ${raw}`);
  return result;
}
export function combination(raw: string): Dimensions {
  const positions = raw.split(',').map(x => x.trim());
  if (positions.length !== 5 || positions.some(x => !x)) throw new Error(`Product Combination requires five nonempty positions: ${raw}`);
  const [variety, sourceClass, size, count, colour] = positions.map(x => x === '*' ? null : x);
  return { variety, class: sourceClass, size, count, colour, rawProductCombination: raw };
}
export function publicationDate(html: string): string {
  const match = text(html).match(/This information is for\s+(\d{1,2}) ([A-Za-z]+) (\d{4})/);
  if (!match) throw new Error('Missing publication date');
  const month = ['January','February','March','April','May','June','July','August','September','October','November','December'].findIndex(m => m.toLowerCase() === match[2].toLowerCase()) + 1;
  const date = `${match[3]}-${String(month).padStart(2,'0')}-${match[1].padStart(2,'0')}`;
  if (!month || new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) !== date) throw new Error(`Invalid publication date: ${date}`);
  return date;
}
export function catalogue(html: string): Commodity[] {
  const select = html.match(/<select\b[^>]*name=["']commodity["'][^>]*>([\s\S]*?)<\/select>/i);
  if (!select) throw new Error('Missing commodity select');
  const rows = [...select[1].matchAll(/<option\b[^>]*value=["'](\d+)["'][^>]*>([\s\S]*?)<\/option>/gi)].map(m => ({ sourceProductId: m[1], sourceProductName: text(m[2]) }));
  if (!rows.length || rows.some(r => !r.sourceProductName) || new Set(rows.map(r => r.sourceProductId)).size !== rows.length || new Set(rows.map(r => r.sourceProductName)).size !== rows.length) throw new Error('Empty or duplicate catalogue');
  return rows.sort((a,b) => Number(a.sourceProductId)-Number(b.sourceProductId));
}
export function tableRows(html: string, headers: string[]): string[][] {
  const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map(m => [...m[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(r => [...r[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => text(c[1]))));
  const candidates = tables.filter(t => t.some(r => r[0] === headers[0]));
  if (candidates.length !== 1) throw new Error(`Expected one ${headers[0]} table; found ${candidates.length}`);
  const table = candidates[0]; const index = table.findIndex(r => r[0] === headers[0]);
  if (JSON.stringify(table[index]) !== JSON.stringify(headers)) throw new Error(`Unexpected headers: ${JSON.stringify(table[index])}`);
  const rows = table.slice(index + 1);
  for (const [i,row] of rows.entries()) if (row.length !== headers.length || row.some(c => c === '')) throw new Error(`Malformed row ${i+1}: ${JSON.stringify(row)}`);
  return rows;
}
function period(raw: string): { daily: number; mtd: number } {
  const m = raw.match(/^(.+?)\s*\/\s*(?:MTD|MDT):\s*(.+)$/i);
  if (!m) throw new Error(`Expected daily / MTD: ${raw}`);
  return { daily: numeric(m[1]), mtd: numeric(m[2]) };
}
export function summaries(html: string, commodities: Commodity[]): Summary[] {
  const byName = new Map(commodities.map(c => [c.sourceProductName,c]));
  const rows = tableRows(html, SUMMARY_HEADERS).map(c => {
    const commodity = byName.get(c[0]); if (!commodity) throw new Error(`Unknown summary commodity: ${c[0]}`);
    const sales=period(c[1]), qty=period(c[2]), mass=period(c[3]);
    return { ...commodity, totalSales:sales.daily, soldQuantity:qty.daily, totalMass:mass.daily, quantityAvailable:numeric(c[4]), mtd:{ totalSales:sales.mtd, soldQuantity:qty.mtd, totalMass:mass.mtd } };
  });
  if (rows.length !== commodities.length || new Set(rows.map(r => r.sourceProductId)).size !== rows.length) throw new Error('Missing/duplicate summary rows');
  return rows.sort((a,b) => Number(a.sourceProductId)-Number(b.sourceProductId));
}
export function containers(html: string): ContainerRow[] {
  return tableRows(html, CONTAINER_HEADERS).map(c => { const sales=period(c[2]), qty=period(c[3]), mass=period(c[4]); return { container:c[0], quantityAvailable:numeric(c[1]), totalSales:sales.daily, soldQuantity:qty.daily, totalMass:mass.daily, mtd:{totalSales:sales.mtd,soldQuantity:qty.mtd,totalMass:mass.mtd},randPerKg:numeric(c[5]),rawCells:c }; });
}
export function details(html: string, commodity: Commodity, marketDate: string): Detail[] {
  if (publicationDate(html) !== marketDate) throw new Error('Publication changed during extraction');
  return tableRows(html, DETAIL_HEADERS).map(c => ({ ...commodity, marketDate, container:c[0],unitMass:unitMassNumeric(c[1]),...combination(c[2]),totalSales:numeric(c[3]),soldQuantity:numeric(c[4]),totalMass:numeric(c[5]),averagePrice:numeric(c[6]),highestPrice:numeric(c[7]),randPerKg:numeric(c[8]),highestRandPerKg:numeric(c[9]),lowestPrice:null,sourceUrl:`${SOURCE}?commodity=${commodity.sourceProductId}&containerall=2`,rawCells:c }));
}
export function identity(row: Detail): string { return JSON.stringify([row.marketDate,row.sourceProductId,row.container,row.unitMass,row.variety,row.class,row.size,row.count,row.colour]); }
export function duplicates(rows: Detail[]): { identity:string; rowIndexes:number[] }[] {
  const groups=new Map<string,number[]>(); rows.forEach((r,i) => { const key=identity(r); groups.set(key,[...(groups.get(key) ?? []),i]); });
  return [...groups].filter(([,indexes]) => indexes.length>1).map(([identity,rowIndexes]) => ({identity,rowIndexes}));
}
export function totals(rows: Totals[]): Totals {
  return Object.fromEntries(['totalSales','soldQuantity','totalMass'].map(key => [key, rows.reduce((sum,r) => sum+Math.round(r[key as keyof Totals]*100),0)/100])) as unknown as Totals;
}
export function compare(actual: Totals, expected: Totals) {
  const metrics = Object.fromEntries((['totalSales','soldQuantity','totalMass'] as const).map(key => { const delta=(Math.round(actual[key]*100)-Math.round(expected[key]*100))/100; return [key,{actual:actual[key],expected:expected[key],delta,pass:delta===0}]; }));
  return { metrics, pass:Object.values(metrics).every(m => m.pass) };
}
