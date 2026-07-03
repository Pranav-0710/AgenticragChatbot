/**
 * cli/commands/ingest.ts
 * ─────────────────────────────────────────────────────────────────────────────
 *   ingest crawl --url <site> [--max-pages 50] [--skip-existing]
 *
 * Discovers pages via the production crawler (sitemap-first, link-crawl
 * fallback), scrapes each through Jina Reader, and writes clean markdown to
 * cli/workspace/raw/<docId>.md — recording every doc in manifest.json.
 *
 * Zero database access. The only env var consulted is JINA_API_KEY (optional).
 *
 *   ingest sync   → phase-2 stub (pull from R2); not implemented in v1.
 */

import { randomUUID } from 'node:crypto';

import { getStr, getNum, getBool, type ParsedArgs } from '../lib/parseArgs.ts';
import { loadEnv } from '../lib/env.ts';
import { ensureDirs, rawPath, writeText, findEntryByUrl, upsertEntry } from '../lib/workspace.ts';

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

  if (sub === 'sync') {
    console.log('ingest sync: not implemented — complete the R2 Worker first (phase 2).');
    return;
  }
  if (sub !== 'crawl') {
    throw new Error(`Unknown ingest subcommand: ${sub ?? '(none)'} — expected "crawl".`);
  }

  const url = getStr(args, 'url');
  if (!url) {
    throw new Error('ingest crawl requires --url <site>');
  }
  const maxPages = getNum(args, 'max-pages') ?? 50;
  const skipExisting = getBool(args, 'skip-existing');

  const { JINA_API_KEY } = loadEnv();
  ensureDirs();

  console.log(`\n[ingest] Crawling ${url} (max ${maxPages} pages)…`);
  const pages = await crawlSite(url, maxPages, {});
  console.log(`[ingest] Discovered ${pages.length} page(s).\n`);

  let scraped = 0;
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
      const result = await scrapeWithJina(page.url, { JINA_API_KEY });
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
      upsertEntry(entry);

      console.log(`  ✓  ${label} → raw/${docId}.md (${result.wordCount} words)`);
      scraped++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  ✗  ${label} — ${msg}`);
      failed++;
    }

    await sleep(POLITE_DELAY_MS);
  }

  console.log(
    `\n[ingest] Done. scraped=${scraped} skipped=${skipped} failed=${failed}. ` +
      `Raw markdown in cli/workspace/raw/.\n`,
  );
}
