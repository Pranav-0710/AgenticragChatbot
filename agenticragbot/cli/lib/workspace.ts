/**
 * cli/lib/workspace.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * All filesystem paths + manifest CRUD for the local dev workspace.
 *
 * Paths are resolved relative to THIS module's location (cli/lib), NOT the
 * process cwd — so `node cli/index.ts` works the same from any directory.
 *
 * Layout (all gitignored under cli/workspace/):
 *   workspace/manifest.json
 *   workspace/raw/<docId>.md
 *   workspace/processed/<docId>.clean.md
 *   workspace/processed/<docId>.topics.json
 *   workspace/processed/<docId>.chunks.json
 *   workspace/processed/<docId>.memory.json
 *   workspace/processed/<docId>.memory.md
 *   workspace/processed/memory-index.md
 */

import fs from 'node:fs';
import path from 'node:path';

import type {
  Manifest,
  ManifestEntry,
  PipelineStep,
} from '../types.ts';

const HERE = import.meta.dirname; // cli/lib
export const CLI_ROOT = path.join(HERE, '..'); // cli/
export const WORKSPACE_DIR = path.join(CLI_ROOT, 'workspace');
export const RAW_DIR = path.join(WORKSPACE_DIR, 'raw');
export const PROCESSED_DIR = path.join(WORKSPACE_DIR, 'processed');
export const MANIFEST_PATH = path.join(WORKSPACE_DIR, 'manifest.json');

// ─── Directory setup ──────────────────────────────────────────────────────────

export function ensureDirs(): void {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.mkdirSync(PROCESSED_DIR, { recursive: true });
}

// ─── Per-doc path helpers ─────────────────────────────────────────────────────

export const rawPath = (docId: string): string => path.join(RAW_DIR, `${docId}.md`);
export const cleanMdPath = (docId: string): string => path.join(PROCESSED_DIR, `${docId}.clean.md`);
export const topicsPath = (docId: string): string => path.join(PROCESSED_DIR, `${docId}.topics.json`);
export const chunksPath = (docId: string): string => path.join(PROCESSED_DIR, `${docId}.chunks.json`);
export const memoryJsonPath = (docId: string): string => path.join(PROCESSED_DIR, `${docId}.memory.json`);
export const memoryMdPath = (docId: string): string => path.join(PROCESSED_DIR, `${docId}.memory.md`);
export const globalIndexPath = (): string => path.join(PROCESSED_DIR, 'memory-index.md');

// ─── Generic JSON / text IO ───────────────────────────────────────────────────

export function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

export function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export function writeText(filePath: string, text: string): void {
  fs.writeFileSync(filePath, text, 'utf8');
}

export function readText(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

export const exists = (filePath: string): boolean => fs.existsSync(filePath);

/** docIds for every raw/<docId>.md on disk, sorted for deterministic --all order. */
export function listRawDocIds(): string[] {
  if (!fs.existsSync(RAW_DIR)) return [];
  return fs
    .readdirSync(RAW_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.slice(0, -'.md'.length))
    .sort();
}

// ─── Manifest CRUD ────────────────────────────────────────────────────────────

const EMPTY_MANIFEST: Manifest = {
  version: '1.0.0',
  updatedAt: new Date(0).toISOString(),
  docs: [],
};

export function readManifest(): Manifest {
  if (!fs.existsSync(MANIFEST_PATH)) return { ...EMPTY_MANIFEST, docs: [] };
  try {
    return readJson<Manifest>(MANIFEST_PATH);
  } catch {
    return { ...EMPTY_MANIFEST, docs: [] };
  }
}

export function writeManifest(manifest: Manifest): void {
  ensureDirs();
  manifest.updatedAt = new Date().toISOString();
  writeJson(MANIFEST_PATH, manifest);
}

export function findEntryByUrl(url: string): ManifestEntry | undefined {
  return readManifest().docs.find((d) => d.url === url);
}

export function findEntryByDocId(docId: string): ManifestEntry | undefined {
  return readManifest().docs.find((d) => d.docId === docId);
}

/**
 * Insert or update a manifest entry by docId. Preserves existing pipeline flags
 * unless the incoming entry supplies its own.
 */
export function upsertEntry(entry: ManifestEntry): void {
  const manifest = readManifest();
  const idx = manifest.docs.findIndex((d) => d.docId === entry.docId);
  if (idx >= 0) {
    manifest.docs[idx] = { ...manifest.docs[idx], ...entry };
  } else {
    manifest.docs.push(entry);
  }
  writeManifest(manifest);
}

/**
 * Ensure a manifest entry exists for a docId that may have arrived as a bare
 * raw/<docId>.md (e.g. a fixture copied in by hand, or a wrapper script) with
 * no prior `ingest` run. Creates a minimal stub if missing; returns the entry.
 */
export function ensureEntry(docId: string): ManifestEntry {
  const existing = findEntryByDocId(docId);
  if (existing) return existing;

  const stub: ManifestEntry = {
    docId,
    url: '',
    title: docId,
    source: 'local',
    scrapedAt: new Date().toISOString(),
    rawPath: `raw/${docId}.md`,
    charCount: exists(rawPath(docId)) ? readText(rawPath(docId)).length : 0,
    wordCount: 0,
    pipeline: { cleaned: false, chunked: false, memory: false },
  };
  upsertEntry(stub);
  return stub;
}

/** Flip a single pipeline stage flag for a doc (creating the entry if needed). */
export function setPipelineFlag(docId: string, step: PipelineStep, value: boolean): void {
  ensureEntry(docId);
  const manifest = readManifest();
  const entry = manifest.docs.find((d) => d.docId === docId);
  if (!entry) return;
  entry.pipeline[step] = value;
  writeManifest(manifest);
}
