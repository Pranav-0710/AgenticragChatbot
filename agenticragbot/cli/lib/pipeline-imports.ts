/**
 * cli/lib/pipeline-imports.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SINGLE TYPED BOUNDARY.
 *
 * The production pipeline (src/pipeline/*.js) is untyped JavaScript. Rather than
 * scatter `as` casts across every command, this one facade imports the JS
 * functions and re-exports them with typed signatures derived from cli/types.ts.
 * Every other CLI file imports the pipeline from HERE and sees fully typed APIs.
 *
 * These signatures were verified against the actual JS source:
 *   - cleanMarkdown / renderTopicTree   → src/pipeline/clean.js
 *   - chunkTopicTree / normalizeTitle   → src/pipeline/chunk.js
 *   - buildMemoryIndex / renderMemoryMd / renderGlobalMemoryIndex → src/pipeline/memory.js
 *
 * NOTE: this file intentionally does NOT re-export saveMemoryMdFiles /
 * saveGlobalMemoryIndex from memory.js — those write to the hardcoded kb/memory/
 * (production) directory. The CLI uses the pure renderers below and writes into
 * cli/workspace/processed/ itself (plan fix #1 / refinement D).
 */

import {
  cleanMarkdown as _cleanMarkdown,
  renderTopicTree as _renderTopicTree,
} from '../../src/pipeline/clean.js';
import {
  chunkTopicTree as _chunkTopicTree,
  normalizeTitle as _normalizeTitle,
} from '../../src/pipeline/chunk.js';
import {
  buildMemoryIndex as _buildMemoryIndex,
  renderMemoryMd as _renderMemoryMd,
  renderGlobalMemoryIndex as _renderGlobalMemoryIndex,
} from '../../src/pipeline/memory.js';

import type {
  CleanResult,
  FrontMatter,
  Topic,
  Chunk,
  MemoryIndex,
  MemoryMap,
} from '../types.ts';

export const cleanMarkdown = _cleanMarkdown as (
  rawMarkdown: string,
  docId: string,
) => CleanResult;

export const renderTopicTree = _renderTopicTree as (
  frontMatter: FrontMatter,
  topics: Topic[],
) => string;

export const chunkTopicTree = _chunkTopicTree as (
  topics: Topic[],
  frontMatter: FrontMatter,
  docId: string,
  memoryIndex?: MemoryIndex,
) => Chunk[];

export const normalizeTitle = _normalizeTitle as (title: string) => string;

export const buildMemoryIndex = _buildMemoryIndex as (
  allDocMemories: MemoryMap[],
) => MemoryIndex;

export const renderMemoryMd = _renderMemoryMd as (
  memoryMap: MemoryMap,
  chunks: Chunk[],
  globalMemoryIndex?: MemoryIndex,
) => string;

export const renderGlobalMemoryIndex = _renderGlobalMemoryIndex as (
  memoryIndex: MemoryIndex,
  allMemories: MemoryMap[],
) => string;
