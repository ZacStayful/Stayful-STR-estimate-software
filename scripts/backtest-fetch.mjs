#!/usr/bin/env node
/**
 * Pull the raw comps behind Airbtics reports we have ALREADY paid for, so the
 * income model can be backtested offline (scripts/backtest.mjs).
 *
 * Reads with GET /report?id=<report_id> ONLY. Reading an existing report is
 * free (see readReport in src/lib/apis/airbtics.ts); creating one (POST
 * /report/all) costs credits, and this script has no code path that does it.
 *
 * Where the report ids come from (airbtics_report_cache: cache_key → report_id):
 *   - Supabase, when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set, or
 *   - --keys <file.json>: [{ "cache_key": "HP111SA_4bed", "report_id": "…" }, …]
 *
 * Usage:
 *   AIRBTICS_API_KEY=… node scripts/backtest-fetch.mjs [--keys f.json] [--limit N] [--first KEY,KEY] [--retry]
 *
 *   --limit N    fetch at most N reports this run (already-saved ones don't count)
 *   --first K,…  fetch these cache keys before any others
 *   --retry      re-try reports previously recorded as unreadable
 *
 * Output (gitignored): scripts/.backtest-data/reports/<cache_key>.json
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '.backtest-data', 'reports');
const BASE_URL = process.env.AIRBTICS_BASE_URL || 'https://crap0y5bx5.execute-api.us-east-2.amazonaws.com/prod';
const CONCURRENCY = 2;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function loadKeys() {
  const file = arg('--keys');
  if (file) return JSON.parse(readFileSync(file, 'utf8'));
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('No report ids: pass --keys <file.json> or set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
  }
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.from('airbtics_report_cache').select('cache_key, report_id');
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

/** GET an existing report. Never creates one. */
async function readReport(reportId, apiKey) {
  const res = await fetch(`${BASE_URL}/report?id=${encodeURIComponent(reportId)}`, {
    method: 'GET',
    headers: { 'x-api-key': apiKey },
  });
  if (!res.ok) return { ok: false, status: res.status };
  const body = await res.json();
  const report = body?.message ?? body;
  const comps = Array.isArray(report?.comps) ? report.comps : null;
  if (comps && (report.comps_status === 'success' || comps.length > 0)) {
    return { ok: true, report };
  }
  return { ok: false, status: res.status, compsStatus: report?.comps_status ?? null };
}

async function main() {
  const apiKey = process.env.AIRBTICS_API_KEY;
  if (!apiKey) throw new Error('AIRBTICS_API_KEY is not set');
  mkdirSync(OUT_DIR, { recursive: true });

  const rows = (await loadKeys()).filter((r) => r?.cache_key && r?.report_id);
  const first = (arg('--first') ?? '').split(',').filter(Boolean);
  rows.sort((a, b) => {
    const fa = first.indexOf(a.cache_key);
    const fb = first.indexOf(b.cache_key);
    if (fa !== fb) return (fa === -1 ? Infinity : fa) - (fb === -1 ? Infinity : fb);
    return a.cache_key.localeCompare(b.cache_key);
  });

  const retry = process.argv.includes('--retry');
  const pending = rows.filter((r) => {
    if (existsSync(join(OUT_DIR, `${r.cache_key}.json`))) return false;
    if (!retry && existsSync(join(OUT_DIR, `${r.cache_key}.unreadable.json`))) return false;
    return true;
  });
  const limit = arg('--limit') ? Number(arg('--limit')) : Infinity;
  const batch = pending.slice(0, limit);
  console.log(`${rows.length} cached report ids; ${rows.length - pending.length} already handled; fetching ${batch.length} now (GET only).`);

  let ok = 0;
  let bad = 0;
  let comps = 0;
  const queue = [...batch];
  async function worker() {
    while (queue.length > 0) {
      const row = queue.shift();
      try {
        const result = await readReport(row.report_id, apiKey);
        if (result.ok) {
          writeFileSync(
            join(OUT_DIR, `${row.cache_key}.json`),
            JSON.stringify({ cache_key: row.cache_key, report_id: row.report_id, fetched_at: new Date().toISOString(), report: result.report }),
          );
          ok += 1;
          comps += result.report.comps.length;
          console.log(`  ok   ${row.cache_key}: ${result.report.comps.length} comps`);
        } else {
          writeFileSync(join(OUT_DIR, `${row.cache_key}.unreadable.json`), JSON.stringify({ ...row, ...result, at: new Date().toISOString() }));
          bad += 1;
          console.log(`  miss ${row.cache_key}: HTTP ${result.status}${result.compsStatus ? ` comps_status=${result.compsStatus}` : ''}`);
        }
      } catch (err) {
        bad += 1;
        console.log(`  fail ${row.cache_key}: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const saved = readdirSync(OUT_DIR).filter((f) => f.endsWith('.json') && !f.endsWith('.unreadable.json')).length;
  console.log(`\nThis run: ${ok} readable (${comps} comps), ${bad} unreadable. Saved reports on disk: ${saved}.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
