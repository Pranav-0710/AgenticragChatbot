/**
 * cli/lib/env.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * SAFETY BOUNDARY: the CLI is database-free. This module loads ONLY
 * JINA_API_KEY plus the kb-storage Worker's URL/token (Phase 2 — R2 dual-write).
 * It deliberately does not read or expose DATABASE_URL / QDRANT_* / GROQ_* /
 * COHERE_* — the local CLI never talks to Neon, Qdrant, or Groq. If a future
 * command needs one of those, that's a red flag it belongs in server.js, not here.
 *
 * ALL keys are optional: with none set, the CLI still works fully offline
 * (local-only ingest + pipeline). KB_STORAGE_* only enables the cloud copy.
 *
 * Load order: repo-root .env first, then cli/config/.env (overrides), if present.
 * Missing files are a no-op (dotenv just returns an error we ignore).
 */

import path from 'node:path';
import dotenv from 'dotenv';

const HERE = import.meta.dirname; // cli/lib
const CLI_ROOT = path.join(HERE, '..'); // cli/
const REPO_ROOT = path.join(CLI_ROOT, '..'); // repo root

export interface CliEnv {
  /** Optional — Jina falls back to the 20 req/min free tier without it. */
  JINA_API_KEY?: string;
  /** Optional — base URL of the kb-storage Worker (e.g. https://kb-storage.<acct>.workers.dev). */
  KB_STORAGE_URL?: string;
  /** Optional — bearer token the kb-storage Worker expects. */
  KB_STORAGE_TOKEN?: string;
}

let loaded = false;

export function loadEnv(): CliEnv {
  if (!loaded) {
    dotenv.config({ path: path.join(REPO_ROOT, '.env'), quiet: true });
    dotenv.config({ path: path.join(CLI_ROOT, 'config', '.env'), override: true, quiet: true });
    loaded = true;
  }
  return {
    JINA_API_KEY: process.env.JINA_API_KEY,
    KB_STORAGE_URL: process.env.KB_STORAGE_URL,
    KB_STORAGE_TOKEN: process.env.KB_STORAGE_TOKEN,
  };
}
