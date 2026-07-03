/**
 * cli/commands/inspect.ts
 *   inspect [--doc <id>] [--diff]
 *
 * No --doc  → list every manifest doc with its pipeline status flags.
 * --doc <id> → detail: chunk / cross-link / graph-role / alert breakdown.
 * --diff     → raw vs cleaned line counts + a short preview (per doc).
 */

import { getStr, getBool, type ParsedArgs } from '../lib/parseArgs.ts';
import {
  readManifest,
  findEntryByDocId,
  exists,
  readText,
  readJson,
  rawPath,
  cleanMdPath,
  topicsPath,
  chunksPath,
} from '../lib/workspace.ts';

import type { Chunk, TopicsArtifact } from '../types.ts';

const short = (id: string): string => (id.length > 12 ? `${id.slice(0, 8)}…` : id);
const flag = (b: boolean): string => (b ? '✓' : '·');

export async function run(args: ParsedArgs): Promise<void> {
  const doc = getStr(args, 'doc');
  const diff = getBool(args, 'diff');

  if (doc) {
    printDocDetail(doc, diff);
    return;
  }

  printList();
  if (diff) {
    console.log('\nRaw vs cleaned (line counts):');
    for (const entry of readManifest().docs) printDiffLine(entry.docId);
  }
}

// ─── list mode ────────────────────────────────────────────────────────────────

function printList(): void {
  const { docs } = readManifest();
  if (docs.length === 0) {
    console.log('No docs in manifest. Run "ingest crawl" first.');
    return;
  }

  console.log(`\n${docs.length} doc(s)  [clean chunk memory]\n`);
  for (const d of docs) {
    const flags = `${flag(d.pipeline.cleaned)} ${flag(d.pipeline.chunked)} ${flag(d.pipeline.memory)}`;
    console.log(`  [${flags}]  ${short(d.docId)}  ${d.title || d.url || ''}`);
  }
  console.log('');
}

// ─── detail mode ──────────────────────────────────────────────────────────────

function printDocDetail(docId: string, diff: boolean): void {
  const entry = findEntryByDocId(docId);

  console.log(`\nDoc: ${docId}`);
  if (entry) {
    console.log(`  Title:  ${entry.title || '—'}`);
    console.log(`  URL:    ${entry.url || '—'}`);
    console.log(`  Source: ${entry.source}   Words: ${entry.wordCount}`);
    console.log(
      `  Pipeline: clean=${entry.pipeline.cleaned} chunk=${entry.pipeline.chunked} memory=${entry.pipeline.memory}`,
    );
  } else {
    console.log('  (no manifest entry — inspecting files on disk)');
  }

  if (exists(topicsPath(docId))) {
    const topics = readJson<TopicsArtifact>(topicsPath(docId));
    const byType: Record<string, number> = {};
    for (const a of topics.alerts) byType[a.type] = (byType[a.type] ?? 0) + 1;
    const alertSummary = Object.entries(byType)
      .map(([t, n]) => `${t}=${n}`)
      .join(', ');
    console.log(`  Topics: ${topics.topics.length}   Alerts: ${topics.alerts.length}${alertSummary ? ` (${alertSummary})` : ''}`);
  } else {
    console.log('  Topics: (not cleaned yet)');
  }

  if (exists(chunksPath(docId))) {
    const chunks = readJson<Chunk[]>(chunksPath(docId));
    const roles = { root: 0, branch: 0, leaf: 0 };
    let crossLinked = 0;
    let tokenSum = 0;
    for (const c of chunks) {
      if (c.graph_role && c.graph_role in roles) roles[c.graph_role] += 1;
      if ((c.related_ids ?? []).length > 0) crossLinked += 1;
      tokenSum += c.token_count;
    }
    const avg = chunks.length ? Math.round(tokenSum / chunks.length) : 0;
    console.log(
      `  Chunks: ${chunks.length} (root=${roles.root} branch=${roles.branch} leaf=${roles.leaf}), ` +
        `avg ~${avg} tokens, ${crossLinked} cross-linked`,
    );
  } else {
    console.log('  Chunks: (not chunked yet)');
  }

  if (diff) printDiffLine(docId, true);
  console.log('');
}

// ─── diff ──────────────────────────────────────────────────────────────────────

function printDiffLine(docId: string, preview = false): void {
  const rawExists = exists(rawPath(docId));
  const cleanExists = exists(cleanMdPath(docId));
  if (!rawExists && !cleanExists) {
    console.log(`  ${short(docId)}: (no raw or cleaned file)`);
    return;
  }

  const rawText = rawExists ? readText(rawPath(docId)) : '';
  const cleanText = cleanExists ? readText(cleanMdPath(docId)) : '';
  const rawLines = rawText ? rawText.split('\n').length : 0;
  const cleanLines = cleanText ? cleanText.split('\n').length : 0;

  console.log(`  ${short(docId)}: raw ${rawLines} lines → cleaned ${cleanLines} lines`);

  if (preview) {
    console.log('\n  --- raw (first 500 chars) ---');
    console.log(indent(rawText.slice(0, 500)));
    console.log('\n  --- cleaned (first 500 chars) ---');
    console.log(indent(cleanText.slice(0, 500)));
  }
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((l) => `    ${l}`)
    .join('\n');
}
