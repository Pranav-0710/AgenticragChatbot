/**
 * cli/lib/localMemory.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Local (file-based) equivalent of server.js's cross-doc memory loading.
 *
 * server.js loads every prior doc's memory map from Neon (kb_chunk_memory) and
 * feeds them to buildMemoryIndex(). Here we read every processed/*.memory.json
 * on disk instead — same buildMemoryIndex(), same output shape.
 */

import fs from 'node:fs';
import path from 'node:path';

import { PROCESSED_DIR, readJson } from './workspace.ts';
import { buildMemoryIndex } from './pipeline-imports.ts';

import type { MemoryMap, MemoryIndex } from '../types.ts';

const MEMORY_JSON_SUFFIX = '.memory.json';

/** Every processed/<docId>.memory.json on disk, parsed. */
export function loadAllMemoryMaps(): MemoryMap[] {
  if (!fs.existsSync(PROCESSED_DIR)) return [];
  return fs
    .readdirSync(PROCESSED_DIR)
    .filter((f) => f.endsWith(MEMORY_JSON_SUFFIX))
    .map((f) => readJson<MemoryMap>(path.join(PROCESSED_DIR, f)));
}

/** Cross-doc topic index built from all local memory maps. */
export function loadLocalMemoryIndex(): MemoryIndex {
  return buildMemoryIndex(loadAllMemoryMaps());
}
