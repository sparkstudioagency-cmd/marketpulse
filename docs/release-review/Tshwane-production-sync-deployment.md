# Tshwane production sync review — 9 November 2026

The local repair is ready for deployment review. Production deployment and read-back require approval of the sequence below. The release worktree is on `repair/two-market-production-imports-20261105`, based on GitHub `main` commit `83ee09e60b1dce7f8862cd0591bde324ebff6d1c`.

## What the repair accepts

Scheduled collections publish only `ACCEPTED` complete archives, subject to the main-branch and production enable guards. Normal source unavailability creates no substitute rows. Explicit partial acceptance is a separate manual replay path. It requires both production switches and the SHA-256 of the reviewed manifest. The original archive retains its `INCOMPLETE` status. The acceptance decision is `ACCEPTED_PARTIAL` and the resulting ingestion status is `PARTIAL`.

The partial policy is deliberately limited to one skipped package after three technical attempts with zero fields returned. It verifies the manifest and every listed file, one publication date, complete product visitation and final checkpoint, all available products and their package counts, unavailable-product HTML, and the package failure HTML and screenshot. It reprocesses the checkpoint in temporary local storage and compares the resulting clean rows before building a database payload. Other omissions require a separate review.

For 9 November, the evidence shows 180 products visited, 178 available products, 940 clean rows and one skipped package. Broccoli & Cauli Mix and PEAR PACKHAM'S TRIUMPH had legitimate source unavailability. The technical omission was APPLE GOLDEN DELICIOUS, product position 14, package 31. Its reported 47 packages reconcile to 46 saved rows and one omission. The other available products reconcile to their full package counts.

## Transaction and recovery behavior

`publish_tshwane_archive` resolves dimensions and writes prices, ingestion state and a receipt in one PostgreSQL transaction. It holds short table write locks while making the publication decision and committing. The receipt records the original manifest digest, payload digest, persisted price digest and acceptance evidence. The RPC treats identical payloads as no-ops, rejects unmanaged existing publications and rejects conflicting same-date inputs. Managed Tshwane dates also reject legacy table writes. The guard applies only to Tshwane rows. The Johannesburg workflow, importer and shared importer code are unchanged.

Complete recovery is append-only. It requires an `ACCEPTED` archive for the same date, the same unavailable-product set, every previously imported row with identical stored values, and at least one additional row confined to the omitted product. The original `PARTIAL` receipt remains available after a new `SUCCESS` receipt. A complete capture with changed or missing prior rows, changed unavailability or no recoverable new rows is rejected for review. This intentionally leaves revised publications outside the automatic recovery path.

## Modified files

- `.github/workflows/tshwane-collection.yml` — guarded automatic complete publication and manual artifact replay.
- `scripts/tshwane-archive-import.ts` — offline review, transactional publish and independent Supabase read-back.
- `scrapers/engine/tshwane-publication-policy.ts` — evidence, acceptance and normalized payload checks.
- `supabase/migrations/20261109203104_tshwane_atomic_publication.sql` — service-role RPCs, receipt and managed-date protection.
- `tests/tshwane-publication.spec.ts` — source policy, archive integrity and real-archive concurrency regressions.
- `tests/tshwane-atomic-publication.sql` — disposable PostgreSQL 17 integration fixture and assertions.
- `docs/release-review/Tshwane-production-sync-deployment.md` — release review and deployment sequence.

## Verification

TypeScript validation and all 35 focused Playwright tests passed. The suite included the actual preserved 9 November archive. The disposable PostgreSQL 17 suite passed partial status, duplicate detection, same-date conflicts, append-only recovery, immutable previously successful data, a late injected failure that rolled back prices and state, legacy write rejection, unrelated market writes, and read-back drift detection. Two simultaneous submissions of the real 940-row payload produced one `IMPORTED` result and one `ALREADY_IMPORTED` result. Independent local read-back verified `PARTIAL` and 940 rows. A separate concurrent conflict test allowed one winner and rejected the other payload.

Read-only production checks found zero Tshwane price rows and no ingestion run for 9 November at review time. PostgreSQL is 17.6 and the existing service role has the permissions needed for the invoker-rights RPCs. The new receipt table is not deployed. These checks must be repeated before deployment. The two-hour scraper was not rerun.

## Exact proposed deployment sequence

1. Confirm GitHub `main` is still `83ee09e60b1dce7f8862cd0591bde324ebff6d1c`, or review intervening changes before proceeding. Confirm both `MARKETPULSE_ENABLE_TSHWANE_IMPORT` and `MARKETPULSE_ENABLE_TSHWANE_PARTIAL_IMPORT` are unset or `false`. Check for pending Tshwane runs and other Tshwane publishers. Selectively commit the seven files listed above, push normally and merge the reviewed change. Exclude prior review notes and backup files from this release.
2. With write switches disabled, dispatch `tshwane-collection.yml` on `main` using the three inputs below. Verify `DRY_RUN`, `ACCEPTED_PARTIAL`, date `2026-11-09`, 940 rows and the exact omission. This uses the preserved GitHub artifact and does not start Chromium.
3. Check the linked Supabase project is `nkrwgbxbfusesxbnwalo`. Run `npx supabase migration list --linked` and `npx supabase db push --linked --dry-run`. Proceed with `npx supabase db push --linked` only if `20261109203104_tshwane_atomic_publication.sql` is the sole pending migration and the reviewed production schema and date state still match. Stop if an existing publication or unrelated migration appears.
4. Between scheduled collections, enable both Tshwane write switches and dispatch the same `main` workflow with the same inputs. The production step must emit `TSHWANE_IMPORT_VERIFIED date=2026-11-09 status=PARTIAL rows=940 outcome=IMPORTED`. An independently verified `ALREADY_IMPORTED` is valid only if an identical submission already committed.
5. Independently query `select public.tshwane_publication_state(date '2026-11-09');` in Supabase. Confirm `verified = true`, `status = PARTIAL`, `rows = 940` and the manifest SHA below. Confirm the ingestion run is `PARTIAL` with 940 found, 940 imported and zero updated. Confirm exactly 940 rows in `daily_prices` for `market_id = 1` and `market_date = '2026-11-09'`, and confirm the receipt records the Apple package omission and the two unavailable products.
6. Disable `MARKETPULSE_ENABLE_TSHWANE_PARTIAL_IMPORT` after the controlled replay. Leave the reviewed complete-sync switch enabled for scheduled complete publications. If the import or read-back fails, disable both switches and inspect the receipt and date state before retrying. Keep the receipts and imported prices available for diagnosis.

| Dispatch input | Value |
|---|---|
| `archive_run_id` | `42613549402` |
| `archive_name` | `tshwane-source-42613549402-1` |
| `partial_manifest_sha256` | `f50525ebc4a4cef84a7d169cec7010d2d3a4acf568433b568dc8ebd1aa9631d3` |

The archive is retained on [GitHub Actions run 42613549402](https://github.com/sparkstudioagency-cmd/marketpulse/actions/runs/42613549402) as artifact `13681092988`. GitHub reports ZIP SHA-256 `f826d044400ba1815f43c1e29e9770d52145c0de75f87b7e236216b0ce5bd603`. The workflow pins and verifies the reviewed manifest and its contents.
