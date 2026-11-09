import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acceptedArchive, check, readJson } from './accepted-archive';
import { canonical, filesIn, inside, sha256, verifyCapture } from './source-capture-archive';
import { processMarketCheckpoint } from './processor';
import { parseTshwaneCheckpoint } from './saver';
import type { CleanMarketRecord } from './supabase-importer';

interface Omission {
  product: string;
  productPosition: number;
  packageNumber: number;
  htmlSha256: string;
}

function absentProducts(status: { unavailableProducts?: string[]; unavailableProductCount?: number }, records: CleanMarketRecord[]) {
  const names = status.unavailableProducts ?? [];
  check(Array.isArray(names) && names.every(n => typeof n === 'string' && n.trim() === n && n.length > 0), 'INVALID_UNAVAILABLE_PRODUCTS');
  check(new Set(names).size === names.length && names.length === (status.unavailableProductCount ?? 0), 'UNAVAILABLE_COUNT_MISMATCH');
  check(records.every(r => !names.includes(r.product)), 'UNAVAILABLE_PRODUCT_HAS_PRICE_ROWS');
  return names;
}

function validatePartial(directory: string, date: string, records: CleanMarketRecord[], diagnostics: Record<string, unknown>): Omission {
  check(diagnostics.completeCoverage === true && diagnostics.rawHtmlAvailable === true && diagnostics.limited === false && diagnostics.exitCode === 0, 'PARTIAL_COLLECTION_COVERAGE_REQUIRED');
  const fileNames = filesIn(directory);
  check(!fileNames.some(n => ['failure.json', 'timeout.json', 'raw-capture-errors.log'].includes(n)), 'PARTIAL_CAPTURE_HAS_ERRORS');
  const status = readJson<{ marketDate: string; status: string; successfulRecords: number; technicalFailureCount: number; skippedPackageCount: number; technicalFailureProducts: string[]; unavailableProducts: string[]; unavailableProductCount: number }>(path.join(directory, 'scraper-output', `tshwane-run-status-${date}.json`));
  check(canonical(status) === canonical(diagnostics.sourceStatus) && status.marketDate === date && status.status === 'PARTIAL' && status.successfulRecords === records.length, 'PARTIAL_STATUS_MISMATCH');
  check(status.technicalFailureCount === 1 && status.skippedPackageCount === 1 && Array.isArray(status.technicalFailureProducts) && status.technicalFailureProducts.length === 1, 'EXACTLY_ONE_TECHNICAL_PACKAGE_OMISSION_REQUIRED');
  const unavailable = absentProducts(status, records);
  const checkpoint = parseTshwaneCheckpoint(readJson(path.join(directory, 'scraper-output', `tshwane-checkpoint-${date}.json`)), date);
  const log = fs.readFileSync(path.join(directory, 'collector.log'), 'utf8').replace(/\r\n/g, '\n');
  const counts = [...log.matchAll(/^Found (\d+) products$/gm)];
  const products = [...log.matchAll(/^Product (\d+) of (\d+): (.+)$/gm)];
  const total = Number(counts[0]?.[1]);
  check(counts.length === 1 && total > 1 && products.length === total && products.every((p, i) => Number(p[1]) === i + 1 && Number(p[2]) === total), 'PARTIAL_CATALOGUE_NOT_FULLY_VISITED');
  check(checkpoint.progress?.nextProductIndex === total && checkpoint.progress.activeProduct === null && log.includes(`Products completed: ${total} of ${total}\n`), 'PARTIAL_CHECKPOINT_NOT_FINISHED');
  const names = products.map(p => p[3]);
  const coveredNames = new Set([...records.map(r => r.product), ...unavailable]);
  check(new Set(names).size === total && coveredNames.size === total && names.every(n => coveredNames.has(n)), 'PARTIAL_PRODUCT_COVERAGE_MISMATCH');

  for (const name of unavailable) {
    const position = names.indexOf(name) + 1;
    const evidence = fileNames.filter(n => n.startsWith(`scraper-diagnostics/${position}-`) && n.endsWith('-product-page-failure.html'));
    check(evidence.length === 1 && /No Results Found/i.test(fs.readFileSync(path.join(directory, evidence[0]), 'utf8')), 'SOURCE_UNAVAILABILITY_EVIDENCE_MISSING');
  }

  const omissions = [...log.matchAll(/^Skipped package 1 of 1\nProduct: (.+)\nProduct position: (\d+)\nPackage number: (\d+)\nAttempts made: 3\nExpected fields: 16\nActual fields: 0\nPage title: .*\nPage URL: https:\/\/tfpm\.tshwane\.gov\.za\/ViewDailyStats\.aspx\nMessage: .*\nScreenshot: .*\nHTML snapshot: (.+)$/gm)];
  check(omissions.length === 1, 'TECHNICAL_OMISSION_EVIDENCE_MISSING');
  const [, product, positionText, packageText, snapshot] = omissions[0];
  const productPosition = Number(positionText);
  const packageNumber = Number(packageText);
  check(names[productPosition - 1] === product && status.technicalFailureProducts[0] === product && records.some(r => r.product === product) && Number.isSafeInteger(packageNumber) && packageNumber > 0, 'TECHNICAL_OMISSION_IDENTITY_MISMATCH');
  const evidence = `scraper-diagnostics/${path.posix.basename(snapshot)}`;
  check(evidence.startsWith(`scraper-diagnostics/${productPosition}-`) && evidence.endsWith(`-package-${packageNumber}.html`) && fileNames.includes(evidence) && fileNames.includes(evidence.replace(/\.html$/, '.png')), 'TECHNICAL_PACKAGE_SNAPSHOT_MISSING');
  const html = fs.readFileSync(path.join(directory, evidence));
  check(html.length > 0, 'EMPTY_TECHNICAL_PACKAGE_SNAPSHOT');
  check(log.includes(`Skipping ${product}, package ${packageNumber}.`), 'TECHNICAL_PACKAGE_SKIP_NOT_RECORDED');
  const packageReports = [...log.matchAll(/^Packages found for (.+): (\d+)$/gm)];
  for (const name of names.filter(n => !unavailable.includes(n))) {
    const counts = packageReports.filter(report => report[1] === name);
    const expected = records.filter(r => r.product === name).length + (name === product ? 1 : 0);
    check(counts.length === 1 && Number(counts[0][2]) === expected, `PARTIAL_PACKAGE_COVERAGE_MISMATCH: ${name}`);
    if (name === product) check(packageNumber <= expected, 'OMITTED_PACKAGE_OUTSIDE_PRODUCT');
  }

  const dates = new Set<string>();
  for (const name of fileNames.filter(n => n.startsWith('raw/') && n.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(directory, name), 'utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const match = html.match(/Market\s+Daily\s+Statistics\s*:?\s*Product\s+Search(?:\s+Results)?\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);
    if (match) {
      const month = ['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(match[2].toLowerCase()) + 1;
      dates.add(`${match[3]}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}`);
    }
  }
  check(dates.size === 1 && dates.has(date), 'PARTIAL_RAW_PUBLICATION_DATE_MISMATCH');

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'marketpulse-tshwane-review-'));
  try {
    const replay = processMarketCheckpoint(date, path.join(directory, 'scraper-output'), scratch);
    check(replay.summary.invalidNumericValues === 0 && replay.summary.inventoryMismatchRecords === 0 && replay.summary.massMismatchRecords === 0, 'PARTIAL_NUMERIC_REPLAY_FAILED');
    check(canonical(readJson(replay.cleanJsonPath)) === canonical(records), 'PARTIAL_CLEAN_ROWS_DIFFER_FROM_CHECKPOINT');
  } finally {
    fs.rmSync(inside(os.tmpdir(), scratch), { recursive: true, force: true });
  }
  return { product, productPosition, packageNumber, htmlSha256: sha256(html) };
}

export function loadTshwanePublication(root: string, approvedPartialManifestSha256?: string) {
  check(fs.existsSync(root), 'COLLECTION_ARCHIVE_MISSING');
  const manifests = filesIn(root).filter(n => n.startsWith('tshwane/') && n.endsWith('/manifest.json'));
  check(manifests.length === 1, 'EXACTLY_ONE_TSHWANE_CAPTURE_REQUIRED');
  const directory = path.dirname(path.join(root, manifests[0]));
  const manifestPath = path.join(directory, 'manifest.json');
  const manifestSha256 = sha256(fs.readFileSync(manifestPath));
  const manifest = readJson<{
    version: number; market: string; status: string; publicationDate: string; records: number;
    stages: { collected: boolean; validated: boolean; archived: boolean; imported: boolean };
    databaseAccess: boolean;
    diagnostics: Record<string, unknown> & { sourceStatus?: Parameters<typeof absentProducts>[0] & {status: string; technicalFailureCount: number; skippedPackageCount: number} };
  }>(manifestPath);
  const partial = manifest.status === 'INCOMPLETE';
  if (partial) {
    check(approvedPartialManifestSha256 && approvedPartialManifestSha256 === manifestSha256, 'PARTIAL_MANIFEST_APPROVAL_REQUIRED');
    verifyCapture(directory);
    check(manifest.version === 1 && manifest.market === 'tshwane' && manifest.stages?.archived === true && manifest.stages.collected === true && manifest.stages.validated === false && manifest.stages.imported === false && manifest.databaseAccess === false, 'INVALID_PARTIAL_MANIFEST');
  } else {
    check(!approvedPartialManifestSha256, 'PARTIAL_APPROVAL_USED_ON_COMPLETE_ARCHIVE');
    acceptedArchive(root, 'tshwane');
    check(manifest.diagnostics?.completeCoverage === true && manifest.diagnostics.sourceStatus?.status === 'COMPLETE' && manifest.diagnostics.sourceStatus.technicalFailureCount === 0 && manifest.diagnostics.sourceStatus.skippedPackageCount === 0, 'COMPLETE_SOURCE_COVERAGE_REQUIRED');
  }
  const date = manifest.publicationDate;
  check(/^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date, 'INVALID_MARKET_DATE');
  const records = readJson<CleanMarketRecord[]>(path.join(directory, 'normalized', `tshwane-clean-${date}.json`));
  check(Array.isArray(records) && records.length > 0 && records.length === manifest.records && records.every(r => r.marketDate === date && ['Tshwane', 'Tshwane Fresh Produce Market'].includes(r.market)), 'PUBLICATION_RECORD_COVERAGE_MISMATCH');
  const unavailable = absentProducts(manifest.diagnostics.sourceStatus ?? {}, records);
  const omission = partial ? validatePartial(directory, date, records, manifest.diagnostics) : null;
  const acceptance = omission ? 'ACCEPTED_PARTIAL' : 'ACCEPTED';
  return { records, date, manifestSha256, acceptance, unavailable, omission } as const;
}

export function tshwanePricePayload(records: CleanMarketRecord[]) {
  const keys = new Set<string>();
  function number(value: unknown, field: string, whole = false) {
    if (value === null || value === undefined) return null;
    check(typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1e12 && (whole ? Number.isSafeInteger(value) : Number(value.toFixed(2)) === value), `INVALID_NUMERIC_FIELD: ${field}`);
    return value;
  }
  return records.map(r => {
    check(typeof r.product === 'string' && r.product.trim().length > 0 && (r.isCorrection === undefined || typeof r.isCorrection === 'boolean'), 'INVALID_PRODUCT_OR_CORRECTION_FLAG');
    const code = (value: string | null | undefined) => value?.trim().toUpperCase() || 'UNSPECIFIED';
    const count = number(r.count, 'count', true);
    const product = r.product.trim();
    const container = code(r.container);
    const grade = code(r.grade);
    const province = code(r.province);
    const mass = number(r.mass, 'mass');
    const unit = count === null ? null : String(count);
    const key = canonical([product, container, grade, province, mass, unit]);
    check(!keys.has(key), 'DUPLICATE_MARKET_PRODUCT_KEY');
    keys.add(key);
    number(r.voided, 'voided', true);
    // The processor keeps extra precision in this derived field. It is not written by this importer.
    check(r.randPerKg == null || (typeof r.randPerKg === 'number' && Number.isFinite(r.randPerKg)), 'INVALID_NUMERIC_FIELD: randPerKg');
    check((mass === null || mass >= 0) && (count === null || count >= 0), 'INVALID_PACKAGE_DIMENSIONS');
    return {
      product, container, grade, province, mass, unit,
      low_price: number(r.lowestPrice, 'lowestPrice'),
      average_price: number(r.averagePrice, 'averagePrice'),
      high_price: number(r.highestPrice, 'highestPrice'),
      sold_quantity: number(r.quantitySold, 'quantitySold', true),
      opening_quantity: number(r.openingBalance, 'openingBalance', true),
      quantity_on_hand: number(r.quantityOnHand, 'quantityOnHand', true),
      total_mass: number(r.totalMass, 'totalMass'),
      total_sales: number(r.valueOfSales, 'valueOfSales'),
      is_correction: r.isCorrection === true,
    };
  });
}
