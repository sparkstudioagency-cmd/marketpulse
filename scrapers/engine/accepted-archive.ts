import fs from 'node:fs';
import path from 'node:path';
import { filesIn, verifyCapture, type CollectionMarket } from './source-capture-archive';

export function check(value: unknown, reason: string): asserts value {
  if (!value) throw new Error(reason);
}
export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}
export function acceptedArchive(root: string, market: CollectionMarket) {
  const manifests = filesIn(root).filter(n => n.startsWith(market + '/') && n.endsWith('/manifest.json'));
  check(manifests.length === 1, 'EXACTLY_ONE_CAPTURE_REQUIRED');
  const directory = path.dirname(path.join(root, manifests[0]));
  verifyCapture(directory);
  const manifest = readJson<any>(path.join(directory, 'manifest.json'));
  check(manifest.version === 1 && manifest.market === market, 'WRONG_CAPTURE_MARKET_OR_VERSION');
  check(manifest.status === 'ACCEPTED' && manifest.stages?.validated === true && manifest.stages?.archived === true, 'COLLECTION_NOT_ACCEPTED');
  const date = manifest.publicationDate;
  check(typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date, 'INVALID_MARKET_DATE');
  check(Number.isSafeInteger(manifest.records) && manifest.records > 0, 'EMPTY_PUBLICATION');
  return { directory, manifest, date };
}
