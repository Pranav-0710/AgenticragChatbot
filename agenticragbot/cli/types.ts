/**
 * cli/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The typed shapes the CLI passes around. These mirror the objects that live
 * implicitly in the untyped JS pipeline today:
 *   - Topic / Alert / CleanStats  → src/pipeline/clean.js (cleanMarkdown return)
 *   - Chunk                       → src/pipeline/chunk.js  (buildChunk)
 *   - MemoryMap / MemoryChunk     → server.js buildMemoryMap()
 *   - MemoryIndex                 → src/pipeline/memory.js (buildMemoryIndex)
 *
 * This file is compile-time only — every import of it uses `import type`, so
 * native type-stripping elides it entirely at runtime (Node never loads it).
 */

// ─── Clean phase (src/pipeline/clean.js) ──────────────────────────────────────

export interface FrontMatter {
  title?: string;
  source_url?: string;
  scraped_at?: string;
  word_count?: number | string;
  description?: string;
  [key: string]: unknown;
}

export interface TopicImage {
  alt: string;
  shortUrl: string;
}

export interface Topic {
  level: number;
  title: string;
  path: string[];
  paragraphs: string[];
  images: TopicImage[];
  children: Topic[];
}

export interface Alert {
  type: string;
  line?: number;
  url?: string;
  alt?: string;
  text?: string;
  reason?: string;
  message?: string;
}

export interface CleanStats {
  rawLines: number;
  cleanedParagraphs: number;
  topicCount: number;
  droppedImages: number;
  keptImages: number;
}

/** Return shape of cleanMarkdown(). */
export interface CleanResult {
  frontMatter: FrontMatter;
  topics: Topic[];
  alerts: Alert[];
  stats: CleanStats;
}

/** Persisted intermediate: processed/<docId>.topics.json */
export interface TopicsArtifact extends CleanResult {
  docId: string;
}

// ─── Chunk phase (src/pipeline/chunk.js buildChunk) ───────────────────────────

export type GraphRole = 'root' | 'branch' | 'leaf';

export interface Chunk {
  id: string;
  doc_id: string;
  index: number;
  source_url: string;
  heading_path: string[];
  slug: string;
  text: string;
  token_count: number;
  images: TopicImage[];
  has_images: boolean;
  prev_id: string | null;
  next_id: string | null;
  parent_id: string | null;
  children_ids: string[];
  related_ids: string[];
  graph_role: GraphRole | null;
}

// ─── Memory map (server.js buildMemoryMap output → *.memory.json) ─────────────

export interface MemoryChunkConnections {
  prev: string | null;
  next: string | null;
  parent: string | null;
  children: string[];
}

export interface MemoryChunk {
  id: string;
  index: number;
  slug: string;
  headingPath: string[];
  tokenCount: number;
  graphRole: GraphRole | null;
  hasImages: boolean;
  relatedIds: string[];
  connections: MemoryChunkConnections;
}

export interface GraphStats {
  total: number;
  roots: number;
  branches: number;
  leaves: number;
}

export interface MemoryMap {
  version: string;
  docId: string;
  sourceUrl: string;
  title: string;
  timestamp: string;
  chunks: MemoryChunk[];
  graphStats: GraphStats;
}

/** buildMemoryIndex output: normalizedTitle → refs across docs. */
export type MemoryIndex = Record<string, Array<{ docId: string; chunkId: string }>>;

// ─── Ingest services (src/services/crawler.js, jina.js) ──────────────────────

/** One page discovered by crawlSite(). */
export interface CrawledPage {
  url: string;
  title: string;
  source: string;
}

/** Return shape of scrapeWithJina(). */
export interface JinaResult {
  markdown: string;
  title: string;
  wordCount: number;
  description: string;
  sourceUrl: string;
}

// ─── Manifest (workspace/manifest.json) ───────────────────────────────────────

export interface PipelineFlags {
  cleaned: boolean;
  chunked: boolean;
  memory: boolean;
}

export type PipelineStep = keyof PipelineFlags;

export interface ManifestEntry {
  docId: string;
  url: string;
  title: string;
  source: string;
  scrapedAt: string;
  rawPath: string;
  charCount: number;
  wordCount: number;
  pipeline: PipelineFlags;
  /** R2 object key (kb/<domain>/<slug>/<docId>.md) once pushed/synced; absent for local-only docs. */
  r2Key?: string;
}

export interface Manifest {
  version: string;
  updatedAt: string;
  docs: ManifestEntry[];
}
