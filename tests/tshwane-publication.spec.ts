import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { SourceCapture, sha256 } from '../scrapers/engine/source-capture-archive';
import { loadTshwanePublication, tshwanePricePayload } from '../scrapers/engine/tshwane-publication-policy';
import { main } from '../scripts/tshwane-archive-import';

const date = '2026-11-09';
const row = { market: 'Tshwane', marketDate: date, product: 'APPLE GOLDEN DELICIOUS', valueOfSales: 10, quantitySold: 1 };
const unavailable = ['Broccoli & Cauli Mix', "PEAR PACKHAM'S TRIUMPH"];

function capture(root: string, complete: boolean, records = [row]) {
  const source = new SourceCapture(root, 'tshwane');
  const sourceStatus = {
    marketDate: date, successfulRecords: records.length, status: complete ? 'COMPLETE' : 'PARTIAL',
    technicalFailureCount: complete ? 0 : 1, skippedPackageCount: complete ? 0 : 1,
    technicalFailureProducts: complete ? [] : [row.product], unavailableProducts: unavailable, unavailableProductCount: 2,
  };
  source.writeJson(`normalized/tshwane-clean-${date}.json`, records);
  source.writeJson(`scraper-output/tshwane-run-status-${date}.json`, sourceStatus);
  const finalized = source.finalize({ accepted: complete, publicationDate: date, records: records.length,
    diagnostics: { completeCoverage: true, limited: false, exitCode: 0, rawHtmlAvailable: true, sourceStatus }, semantic: records });
  const manifestFile = path.join(finalized.directory, 'manifest.json');
  return { ...finalized, manifestFile, digest: sha256(fs.readFileSync(manifestFile)) };
}

test('normal source unavailability is allowed without creating substitute price rows', ({}, info) => {
  const root = info.outputPath('archive');
  capture(root, true);
  const publication = loadTshwanePublication(root);
  expect(publication.acceptance).toBe('ACCEPTED');
  expect(publication.unavailable).toEqual(unavailable);
  expect(tshwanePricePayload(publication.records).map(r => r.product)).toEqual([row.product]);
  const invalid = info.outputPath('invalid');
  capture(invalid, true, [row, { ...row, product: unavailable[0], valueOfSales: 0 }]);
  expect(() => loadTshwanePublication(invalid)).toThrow('UNAVAILABLE_PRODUCT_HAS_PRICE_ROWS');
});

test('technical omissions cannot enter the complete route or be approved with the wrong digest', ({}, info) => {
  const root = info.outputPath('archive');
  const archived = capture(root, false);
  expect(() => loadTshwanePublication(root)).toThrow('PARTIAL_MANIFEST_APPROVAL_REQUIRED');
  expect(() => loadTshwanePublication(root, '0'.repeat(64))).toThrow('PARTIAL_MANIFEST_APPROVAL_REQUIRED');
  expect(() => loadTshwanePublication(root, archived.digest)).toThrow(); // missing checkpoint and source evidence
});

test('manifest and file tampering fail even when the other digest still matches', ({}, info) => {
  const root = info.outputPath('archive');
  const archived = capture(root, false);
  fs.appendFileSync(path.join(archived.directory, 'capture-start.json'), ' ');
  expect(() => loadTshwanePublication(root, archived.digest)).toThrow('ARCHIVE_HASH_MISMATCH');
  fs.appendFileSync(archived.manifestFile, ' ');
  expect(() => loadTshwanePublication(root, archived.digest)).toThrow('PARTIAL_MANIFEST_APPROVAL_REQUIRED');
});

test('rejects duplicates after normalizing dimensions and invalid numeric payloads', () => {
  expect(() => tshwanePricePayload([{ ...row, grade: 'x' }, { ...row, grade: ' X ' }])).toThrow('DUPLICATE_MARKET_PRODUCT_KEY');
  expect(() => tshwanePricePayload([{ ...row, valueOfSales: '10' }])).toThrow('INVALID_NUMERIC_FIELD');
  expect(() => tshwanePricePayload([{ ...row, quantitySold: 1.5 }])).toThrow('INVALID_NUMERIC_FIELD');
  expect(() => tshwanePricePayload([{ ...row, valueOfSales: Number.NaN }])).toThrow('INVALID_NUMERIC_FIELD');
});

test('partial production import requires its separate switch before any client is opened', async () => {
  const original = { ...process.env };
  try {
    process.env.MARKETPULSE_ENABLE_TSHWANE_IMPORT = 'true';
    delete process.env.MARKETPULSE_ENABLE_TSHWANE_PARTIAL_IMPORT;
    await expect(main(['--commit', `--approve-partial-manifest-sha256=${'a'.repeat(64)}`])).rejects.toThrow('PARTIAL_IMPORT_NOT_ENABLED');
  } finally {
    if (original.MARKETPULSE_ENABLE_TSHWANE_IMPORT === undefined) delete process.env.MARKETPULSE_ENABLE_TSHWANE_IMPORT;
    else process.env.MARKETPULSE_ENABLE_TSHWANE_IMPORT = original.MARKETPULSE_ENABLE_TSHWANE_IMPORT;
    if (original.MARKETPULSE_ENABLE_TSHWANE_PARTIAL_IMPORT !== undefined) process.env.MARKETPULSE_ENABLE_TSHWANE_PARTIAL_IMPORT = original.MARKETPULSE_ENABLE_TSHWANE_PARTIAL_IMPORT;
  }
});

test('preserved 9 November archive admits exactly 940 real rows only as an explicitly approved partial', () => {
  const root = process.env.TSHWANE_REVIEW_ARCHIVE_ROOT;
  test.skip(!root, 'Set TSHWANE_REVIEW_ARCHIVE_ROOT to the preserved source artifact');
  const approved = 'f50525ebc4a4cef84a7d169cec7010d2d3a4acf568433b568dc8ebd1aa9631d3';
  expect(() => loadTshwanePublication(root!)).toThrow('PARTIAL_MANIFEST_APPROVAL_REQUIRED');
  const result = loadTshwanePublication(root!, approved);
  expect(result.acceptance).toBe('ACCEPTED_PARTIAL');
  expect(result.records).toHaveLength(940);
  expect(new Set(result.records.map(r => r.product)).size).toBe(178);
  expect(result.unavailable).toEqual(unavailable);
  expect(result.omission).toMatchObject({ product: row.product, productPosition: 14, packageNumber: 31 });
  expect(tshwanePricePayload(result.records)).toHaveLength(940);
});

test('disposable PostgreSQL serializes real archive retries and conflicting publishers', async () => {
  const root = process.env.TSHWANE_REVIEW_ARCHIVE_ROOT;
  const container = process.env.TSHWANE_TEST_POSTGRES_CONTAINER;
  test.skip(!root || !container, 'Requires the preserved archive and disposable SQL fixture');
  test.setTimeout(60_000);
  expect(container).toBe('marketpulse-tshwane-atomic-review');
  const inspect = spawnSync('docker', ['inspect', '--format', '{{.HostConfig.NetworkMode}}', container!], { encoding: 'utf8' });
  expect(inspect.status).toBe(0);
  expect(inspect.stdout.trim()).toBe('none');

  const approved = 'f50525ebc4a4cef84a7d169cec7010d2d3a4acf568433b568dc8ebd1aa9631d3';
  const publication = loadTshwanePublication(root!, approved);
  const rows = tshwanePricePayload(publication.records);
  const evidence = { acceptance: publication.acceptance, unavailable: [...publication.unavailable].sort(), omission: publication.omission };
  const dollarJson = (data: unknown) => {
    const json = JSON.stringify(data);
    expect(json).not.toContain('$review_json$');
    return `$review_json$${json}$review_json$::jsonb`;
  };
  function psql(sql: string) {
    return new Promise<{ code: number | null; out: string; err: string }>((resolve, reject) => {
      const child = spawn('docker', ['exec', '-i', container!, 'psql', '-XAtq', '-U', 'postgres', '-d', 'tshwane_atomic_test', '-v', 'ON_ERROR_STOP=1'], { windowsHide: true });
      let out = '';
      let err = '';
      child.stdout.on('data', chunk => { out += chunk; });
      child.stderr.on('data', chunk => { err += chunk; });
      child.on('error', reject);
      child.stdin.on('error', reject);
      child.on('close', code => resolve({ code, out, err }));
      child.stdin.end(`set role service_role;\n${sql}\n`);
    });
  }
  const partial = `select public.publish_tshwane_archive('2026-11-09', 'PARTIAL', '${approved}', ${dollarJson(evidence)}, ${dollarJson(rows)});`;
  const retries = await Promise.all([psql(partial), psql(partial)]);
  expect(retries.map(result => result.code), retries.map(result => result.err).join('\n')).toEqual([0, 0]);
  const outcomes = retries.map(result => JSON.parse(result.out).outcome).sort();
  expect(outcomes).toEqual(['ALREADY_IMPORTED', 'IMPORTED']);
  const state = await psql("select public.tshwane_publication_state('2026-11-09');");
  expect(JSON.parse(state.out)).toMatchObject({ status: 'PARTIAL', rows: 940, verified: true, manifestSha256: approved });

  const complete = { acceptance: 'ACCEPTED', unavailable: [], omission: null };
  const contenders = await Promise.all([10, 11].map(sales => psql(
    `select public.publish_tshwane_archive('2026-11-20', 'SUCCESS', '${approved}', ${dollarJson(complete)}, ${dollarJson([{ ...rows[0], total_sales: sales }])});`,
  )));
  expect(contenders.filter(result => result.code === 0)).toHaveLength(1);
  expect(contenders.find(result => result.code !== 0)?.err).toContain('CONFLICTING_TSHWANE_PUBLICATION');
  const completeState = await psql("select public.tshwane_publication_state('2026-11-20');");
  expect(JSON.parse(completeState.out)).toMatchObject({ status: 'SUCCESS', rows: 1, verified: true });
});
