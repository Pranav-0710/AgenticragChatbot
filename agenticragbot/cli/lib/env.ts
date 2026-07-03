/**
 * cli/lib/env.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * SAFETY BOUNDARY: the CLI is database-free. This module loads ONLY JINA_API_KEY.
 * It deliberately does not read or expose DATABASE_URL / QDRANT_* / GROQ_* /
 * COHERE_* — the local CLI never talks to Neon, Qdrant, or Groq. If a future
 * command needs one of those, that's a red flag it belongs in server.js, not here.
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
}

let loaded = false;

export function loadEnv(): CliEnv {
  if (!loaded) {
    dotenv.config({ path: path.join(REPO_ROOT, '.env'), quiet: true });
    dotenv.config({ path: path.join(CLI_ROOT, 'config', '.env'), override: true, quiet: true });
    loaded = true;
  }
  return { JINA_API_KEY: process.env.JINA_API_KEY };
}
