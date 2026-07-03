/**
 * cli/lib/pipeline-run.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared orchestration for the clean → chunk → memory pipeline, file-based.
 *
 * The three granular steps (runClean / runChunk / runMemory) are the single
 * source of truth: the split commands (pipeline clean|chunk|memory) call one
 * each, and `pipeline run` calls runDoc() which chains all three sharing an
 * in-memory memory index. So `run` and the split commands emit byte-identical
 * artifacts — there is no second implementation of the pipeline logic.
 *
 * buildMemoryMap() is duplicated (not imported) from server.js on purpose: it's
 * a private helper there, and the plan forbids editing server.js.
 */

import {
  cleanMarkdown,
  renderTopicTree,
  chunkTopicTree,
  buildMemoryIndex,
  renderMemoryMd,
  renderGlobalMemoryIndex,
} from './pipeline-imports.ts';
import {
  rawPath,
  cleanMdPath,
  topicsPath,
  chunksPath,
  memoryJsonPath,
  memoryMdPath,
  globalIndexPath,
  readText,
  writeText,
  readJson,
  writeJson,
  exists,
  ensureEntry,
  setPipelineFlag,
} from './workspace.ts';
import { loadAllMemoryMaps, loadLocalMemoryIndex } from './localMemory.ts';
import { backfillRelatedIds } from './localBackfill.ts';

import type {
  CleanResult,
  Chunk,
  MemoryIndex,
  MemoryMap,
  TopicsArtifact,
} from '../types.ts';

// ─── buildMemoryMap — duplicated from server.js (private helper there) ─────────

interface DocRef {
  id: string;
  url: string;
  title: string;
}

function buildMemoryMap(doc: DocRef, chunks: Chunk[]): MemoryMap {
  return {
    version: '1.1.0',
    docId: doc.id,
    sourceUrl: doc.url,
    title: doc.title,
    timestamp: new Date().toISOString(),
    chunks: chunks.map((c) => ({
      id: c.id,
      index: c.index,
      slug: c.slug,
      headingPath: c.heading_path,
      tokenCount: c.token_count,
      graphRole: c.graph_role,
      hasImages: c.has_images,
      relatedIds: c.related_ids ?? [],
      connections: {
        prev: c.prev_id,
        next: c.next_id,
        parent: c.parent_id,
        children: c.children_ids,
      },
    })),
    graphStats: {
      total: chunks.length,
      roots: chunks.filter((c) => c.graph_role === 'root').length,
      branches: chunks.filter((c) => c.graph_role === 'branch').length,
      leaves: chunks.filter((c) => c.graph_role === 'leaf').length,
    },
  };
}

// ─── Step 1: CLEAN ────────────────────────────────────────────────────────────

export function runClean(docId: string): CleanResult {
  if (!exists(rawPath(docId))) {
    throw new Error(`No raw markdown for "${docId}" (expected cli/workspace/raw/${docId}.md). Run ingest first.`);
  }
  const raw = readText(rawPath(docId));
  const { frontMatter, topics, alerts, stats } = cleanMarkdown(raw, docId);

  // <docId>.clean.md — same renderer server.js uses for the Neon cleaned copy
  writeText(cleanMdPath(docId), renderTopicTree(frontMatter, topics));

  // <docId>.topics.json — bundles frontMatter WITH topics so `pipeline chunk`
  // can run standalone (chunkTopicTree needs frontMatter as a separate arg).
  const artifact: TopicsArtifact = { docId, frontMatter, topics, alerts, stats };
  writeJson(topicsPath(docId), artifact);

  setPipelineFlag(docId, 'cleaned', true);
  return { frontMatter, topics, alerts, stats };
}

// ─── Step 2: CHUNK ────────────────────────────────────────────────────────────

export function runChunk(docId: string, memoryIndex: MemoryIndex): Chunk[] {
  if (!exists(topicsPath(docId))) {
    throw new Error(`No topics.json for "${docId}". Run "pipeline clean --doc ${docId}" first.`);
  }
  const { frontMatter, topics } = readJson<TopicsArtifact>(topicsPath(docId));
  const chunks = chunkTopicTree(topics, frontMatter, docId, memoryIndex);

  writeJson(chunksPath(docId), chunks);
  setPipelineFlag(docId, 'chunked', true);
  return chunks;
}

// ─── Step 3: MEMORY ───────────────────────────────────────────────────────────

export interface MemoryResult {
  chunkCount: number;
  crossLinks: number;
  backfilled: number;
}

export function runMemory(docId: string): MemoryResult {
  if (!exists(chunksPath(docId))) {
    throw new Error(`No chunks.json for "${docId}". Run "pipeline chunk --doc ${docId}" first.`);
  }
  const chunks = readJson<Chunk[]>(chunksPath(docId));
  const entry = ensureEntry(docId);

  // Machine memory map (mirrors what server.js saves to kb_chunk_memory).
  const memoryMap = buildMemoryMap({ id: docId, url: entry.url, title: entry.title }, chunks);
  writeJson(memoryJsonPath(docId), memoryMap);

  // Reverse cross-doc links: point OTHER docs' chunks at this new doc.
  const backfilled = backfillRelatedIds(chunks, docId);

  // Human-readable audit files, rebuilt from the now-complete memory set.
  const allMemories = loadAllMemoryMaps();
  const globalIndex = buildMemoryIndex(allMemories);
  writeText(memoryMdPath(docId), renderMemoryMd(memoryMap, chunks, globalIndex));
  writeText(globalIndexPath(), renderGlobalMemoryIndex(globalIndex, allMemories));

  setPipelineFlag(docId, 'memory', true);

  return {
    chunkCount: chunks.length,
    crossLinks: chunks.filter((c) => (c.related_ids ?? []).length > 0).length,
    backfilled,
  };
}

// ─── Combined: clean → chunk → memory for one doc ─────────────────────────────

export interface DocResult extends MemoryResult {
  docId: string;
}

export function runDoc(docId: string): DocResult {
  runClean(docId);
  // Load prior docs' memory BEFORE chunking, so related_ids get populated
  // (this is the ordering server.js is careful about).
  const memoryIndex = loadLocalMemoryIndex();
  runChunk(docId, memoryIndex);
  const mem = runMemory(docId);
  return { docId, ...mem };
}
