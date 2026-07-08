/**
 * cli/commands/ingest.ts
 * ─────────────────────────────────────────────────────────────────────────────
 *   ingest crawl --url <site> [--max-pages 50] [--skip-existing] [--no-push]
 *   ingest sync  [--force]
 *
 * crawl: discovers pages via the production crawler (sitemap-first, link-crawl
 * fallback), scrapes each through Jina Reader, writes markdown to
 * cli/workspace/raw/<docId>.md, records each in manifest.json — and, when the
 * kb-storage Worker is configured (KB_STORAGE_URL/KB_STORAGE_TOKEN), also
 * pushes a copy to R2 (dual-write). A failed cloud push never fails the crawl.
 *
 * sync: pulls every kb/<domain>/... markdown object from R2 down into the
 * local workspace (skipping docs already present unless --force), so a fresh
 * machine can hydrate the KB without re-crawling.
 *
 * Zero database access. Env consulted: JINA_API_KEY (optional),
 * KB_STORAGE_URL/KB_STORAGE_TOKEN (optional — offline-only without them).
 */

import { randomUUID } from 'node:crypto';

import { getStr, getNum, getBool, type ParsedArgs } from '../lib/parseArgs.ts';
import { loadEnv } from '../lib/env.ts';
import {
  ensureDirs,
  rawPath,
  writeText,
  exists,
  findEntryByUrl,
  findEntryByDocId,
  upsertEntry,
  readManifest,
  writeManifest,
} from '../lib/workspace.ts';
import { isConfigured, docKey, pushDoc, listRemote, fetchDoc } from '../lib/r2Client.ts';

import { crawlSite as _crawlSite } from '../../src/services/crawler.js';
import { scrapeWithJina as _scrapeWithJina } from '../../src/services/jina.js';

import type { CrawledPage, JinaResult, ManifestEntry } from '../types.ts';

// Typed boundary over the untyped src/services JS. Cast through `unknown`:
// both functions are `async` at runtime, but their JSDoc `@returns {Array<…>}`
// makes tsc infer a synchronous return, so a direct cast to Promise<…> is
// rejected. The double cast is the intended escape hatch here.
const crawlSite = _crawlSite as unknown as (
  baseUrl: string,
  maxPages: number,
  env: unknown,
) => Promise<CrawledPage[]>;
const scrapeWithJina = _scrapeWithJina as unknown as (
  pageUrl: string,
  env: { JINA_API_KEY?: string },
) => Promise<JinaResult>;

const POLITE_DELAY_MS = 250;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function run(args: ParsedArgs): Promise<void> {
  const sub = args.positionals[1];
  if (sub === 'crawl') return crawl(args);
  if (sub === 'sync') return sync(args);
  throw new Error(`Unknown ingest subcommand: ${sub ?? '(none)'} — expected "crawl" or "sync".`);
}

// ─── ingest crawl ─────────────────────────────────────────────────────────────

async function crawl(args: ParsedArgs): Promise<void> {
  const url = getStr(args, 'url');
  if (!url) {
    throw new Error('ingest crawl requires --url <site>');
  }
  const maxPages = getNum(args, 'max-pages') ?? 50;
  const skipExisting = getBool(args, 'skip-existing');
  const noPush = getBool(args, 'no-push');

  const env = loadEnv();
  const pushEnabled = !noPush && isConfigured(env);
  ensureDirs();

  console.log(`\n[ingest] Crawling ${url} (max ${maxPages} pages)…`);
  console.log(
    pushEnabled
      ? `[ingest] R2 dual-write ON → ${env.KB_STORAGE_URL}`
      : `[ingest] R2 dual-write off (${noPush ? '--no-push' : 'KB_STORAGE_URL/TOKEN not set'}) — local only`,
  );
  const pages = await crawlSite(url, maxPages, {});
  console.log(`[ingest] Discovered ${pages.length} page(s).\n`);

  let scraped = 0;
  let pushed = 0;
  let skipped = 0;
  let failed = 0;

  for (const [i, page] of pages.entries()) {
    const label = `(${i + 1}/${pages.length}) ${page.url}`;

    if (skipExisting && findEntryByUrl(page.url)) {
      console.log(`  ⏭  ${label} — already in manifest, skipping`);
      skipped++;
      continue;
    }

    try {
      const result = await scrapeWithJina(page.url, { JINA_API_KEY: env.JINA_API_KEY });
      const docId = randomUUID();

      writeText(rawPath(docId), result.markdown);

      const entry: ManifestEntry = {
        docId,
        url: page.url,
        title: result.title || page.title || page.url,
        source: 'jina-crawl',
        scrapedAt: new Date().toISOString(),
        rawPath: `raw/${docId}.md`,
        charCount: result.markdown.length,
        wordCount: result.wordCount,
        pipeline: { cleaned: false, chunked: false, memory: false },
      };

      // Dual-write: cloud copy is best-effort — a push failure logs a warning
      // but never fails the crawl (local save already succeeded).
      if (pushEnabled) {
        try {
          const key = docKey(page.url, docId);
          await pushDoc(env, key, result.markdown, { url: page.url, title: entry.title });
          entry.r2Key = key;
          pushed++;
        } catch (pushErr) {
          const msg = pushErr instanceof Error ? pushErr.message : String(pushErr);
          console.warn(`  ⚠  ${label} — R2 push failed (local copy OK): ${msg}`);
        }
      }

      upsertEntry(entry);
      console.log(
        `  ✓  ${label} → raw/${docId}.md (${result.wordCount} words)${entry.r2Key ? '  ↑R2' : ''}`,
      );
      scraped++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  ✗  ${label} — ${msg}`);
      failed++;
    }

    await sleep(POLITE_DELAY_MS);
  }

  console.log(
    `\n[ingest] Done. scraped=${scraped} pushed=${pushed} skipped=${skipped} failed=${failed}. ` +
      `Raw markdown in cli/workspace/raw/.\n`,
  );
}

// ─── ingest sync ──────────────────────────────────────────────────────────────

async function sync(args: ParsedArgs): Promise<void> {
  const force = getBool(args, 'force');
  const env = loadEnv();

  if (!isConfigured(env)) {
    throw new Error(
      'ingest sync needs KB_STORAGE_URL and KB_STORAGE_TOKEN (cli/config/.env or root .env).',
    );
  }
  ensureDirs();

  console.log(`\n[sync] Listing ${env.KB_STORAGE_URL} …`);
  const objects = (await listRemote(env, 'kb/'))
    .filter((o) => o.key.endsWith('.md'))
    // kb/memory/ is the audit-file namespace (memory-index.md etc.), not
    // crawled source docs — syncing those into raw/ would feed index files
    // into the pipeline as if they were content.
    .filter((o) => !o.key.startsWith('kb/memory/'));
  console.log(`[sync] ${objects.length} crawled markdown object(s) in R2 (kb/memory/ audit files excluded).\n`);

  let downloaded = 0;
  let skipped = 0;

  for (const obj of objects) {
    // docId = filename without .md — same value crawl used to build the key.
    const docId = obj.key.split('/').pop()!.slice(0, -'.md'.length);

    if (!force && exists(rawPath(docId))) {
      console.log(`  ⏭  ${obj.key} — raw/${docId}.md already local, skipping (use --force to overwrite)`);
      skipped++;
      continue;
    }

    const doc = await fetchDoc(env, obj.key);
    writeText(rawPath(docId), doc.markdown);

    const existing = findEntryByDocId(docId);
    upsertEntry({
      docId,
      url: doc.url || existing?.url || '',
      title: doc.title || existing?.title || docId,
      source: existing?.source ?? 'r2-sync',
      scrapedAt: existing?.scrapedAt ?? obj.uploaded,
      rawPath: `raw/${docId}.md`,
      charCount: doc.markdown.length,
      wordCount: existing?.wordCount ?? 0,
      pipeline: existing?.pipeline ?? { cleaned: false, chunked: false, memory: false },
      r2Key: obj.key,
    });

    console.log(`  ✓  ${obj.key} → raw/${docId}.md (${doc.markdown.length} chars)`);
    downloaded++;
  }

  // touch manifest timestamp even if everything was skipped
  writeManifest(readManifest());

  console.log(
    `\n[sync] Done. downloaded=${downloaded} skipped=${skipped}. ` +
      `Run "pipeline run --all" to process.\n`,
  );
}
