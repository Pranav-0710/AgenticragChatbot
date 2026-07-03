/**
 * cli/lib/localBackfill.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * File-based port of server.js's backfillRelatedIds() (server.js:493-558).
 *
 * When a NEW doc is processed, older docs whose chunks share a topic title need
 * their related_ids updated to point at the new doc's matching chunks (the
 * reverse of the forward links wireCrossDocLinks() already set on the new doc).
 *
 * server.js does this against Neon (getAllChunkMemories → getChunkById →
 * updateChunkRelatedIds). Here we operate directly on the other docs'
 * processed/*.chunks.json files — those ARE the chunk records, so no separate
 * hydrate step is needed. The matching algorithm (normalizeTitle lookup, Set
 * merge, cap at 10) is identical to prod.
 *
 * Like prod, this updates only the chunk records (chunks.json), not the memory
 * maps — buildMemoryIndex keys off heading paths, not related_ids, so the older
 * memory.json files staying as-is is harmless (matches server.js behavior).
 */

import fs from 'node:fs';
import path from 'node:path';

import { PROCESSED_DIR, readJson, writeJson } from './workspace.ts';
import { normalizeTitle } from './pipeline-imports.ts';

import type { Chunk } from '../types.ts';

const CHUNKS_SUFFIX = '.chunks.json';
const MAX_RELATED = 10;

/**
 * @returns number of chunks (across all OTHER docs) whose related_ids grew.
 */
export function backfillRelatedIds(newChunks: Chunk[], newDocId: string): number {
  // normalizedTitle → [chunkId] for the new doc's chunks
  const newDocIndex: Record<string, string[]> = {};
  for (const c of newChunks) {
    for (const title of c.heading_path ?? []) {
      const key = normalizeTitle(title);
      if (!key) continue;
      (newDocIndex[key] ??= []).push(c.id);
    }
  }

  if (!fs.existsSync(PROCESSED_DIR)) return 0;

  const otherChunkFiles = fs
    .readdirSync(PROCESSED_DIR)
    .filter((f) => f.endsWith(CHUNKS_SUFFIX))
    .filter((f) => f.slice(0, -CHUNKS_SUFFIX.length) !== newDocId);

  let updated = 0;

  for (const file of otherChunkFiles) {
    const filePath = path.join(PROCESSED_DIR, file);
    const chunks = readJson<Chunk[]>(filePath);
    let dirty = false;

    for (const chunk of chunks) {
      const newRelated: string[] = [];
      for (const title of chunk.heading_path ?? []) {
        const key = normalizeTitle(title);
        for (const id of newDocIndex[key] ?? []) {
          if (!newRelated.includes(id)) newRelated.push(id);
        }
      }
      if (newRelated.length === 0) continue;

      const current = chunk.related_ids ?? [];
      const merged = [...new Set([...current, ...newRelated])].slice(0, MAX_RELATED);
      if (merged.length > current.length) {
        chunk.related_ids = merged;
        dirty = true;
        updated++;
      }
    }

    if (dirty) writeJson(filePath, chunks);
  }

  return updated;
}
