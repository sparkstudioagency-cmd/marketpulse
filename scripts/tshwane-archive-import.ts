import path from 'node:path';
import { check } from '../scrapers/engine/accepted-archive';
import { createSupabaseAdminClient } from '../scrapers/engine/supabase-importer';
import { loadTshwanePublication, tshwanePricePayload } from '../scrapers/engine/tshwane-publication-policy';

export const loadTshwaneArchive = loadTshwanePublication;

export async function main(args = process.argv.slice(2)): Promise<void> {
  const commit = args.includes('--commit');
  const options = ['--archive-root=', '--approve-partial-manifest-sha256='];
  check(args.every(arg => arg === '--commit' || options.some(option => arg.startsWith(option))) && new Set(args).size === args.length, 'UNKNOWN_IMPORT_ARGUMENT');
  function option(prefix: string) {
    const matches = args.filter(arg => arg.startsWith(prefix));
    check(matches.length <= 1, 'DUPLICATE_IMPORT_ARGUMENT');
    return matches[0]?.slice(prefix.length);
  }
  const approval = option(options[1]);
  check(approval === undefined || /^[0-9a-f]{64}$/.test(approval), 'INVALID_PARTIAL_APPROVAL_DIGEST');
  if (commit) {
    check(process.env.MARKETPULSE_ENABLE_TSHWANE_IMPORT === 'true', 'IMPORT_NOT_ENABLED');
    check(!approval || process.env.MARKETPULSE_ENABLE_TSHWANE_PARTIAL_IMPORT === 'true', 'PARTIAL_IMPORT_NOT_ENABLED');
    check(process.env.SUPABASE_URL?.replace(/\/$/, '') === 'https://nkrwgbxbfusesxbnwalo.supabase.co', 'PRODUCTION_PROJECT_MISMATCH');
    check(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SERVICE_ROLE_KEY_MISSING');
  }

  const publication = loadTshwanePublication(path.resolve(option(options[0]) || 'scraper-diagnostics/collection-only'), approval);
  const rows = tshwanePricePayload(publication.records);
  const status = publication.acceptance === 'ACCEPTED_PARTIAL' ? 'PARTIAL' : 'SUCCESS';
  const evidence = { acceptance: publication.acceptance, unavailable: [...publication.unavailable].sort(), omission: publication.omission };
  console.log(JSON.stringify({ mode: commit ? 'COMMIT' : 'DRY_RUN', date: publication.date, status, rows: rows.length, manifestSha256: publication.manifestSha256, evidence }));
  if (!commit) return;

  const db = createSupabaseAdminClient();
  const write = await db.rpc('publish_tshwane_archive', {
    p_date: publication.date, p_status: status, p_manifest_sha256: publication.manifestSha256,
    p_evidence: evidence, p_rows: rows,
  });
  check(!write.error && write.data?.verified === true && write.data.status === status && write.data.rows === rows.length && ['IMPORTED', 'ALREADY_IMPORTED'].includes(write.data.outcome), `ATOMIC_TSHWANE_IMPORT_FAILED: ${write.error?.message ?? 'invalid receipt'}`);
  const read = await db.rpc('tshwane_publication_state', { p_date: publication.date });
  check(!read.error && read.data?.verified === true && read.data.status === status && read.data.rows === rows.length && read.data.payloadSha256 === write.data.payloadSha256 && read.data.manifestSha256 === write.data.manifestSha256, `TSHWANE_READBACK_FAILED: ${read.error?.message ?? 'receipt mismatch'}`);
  console.log(`TSHWANE_IMPORT_VERIFIED date=${publication.date} status=${status} rows=${rows.length} outcome=${write.data.outcome}`);
}

if (require.main === module) main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
