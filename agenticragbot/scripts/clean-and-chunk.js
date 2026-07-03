/**
 * scripts/clean-and-chunk.js  — DEPRECATED THIN WRAPPER
 * ─────────────────────────────────────────────────────────────────────────────
 * This file previously held a standalone (and drifted) copy of the clean+chunk
 * pipeline. It now delegates to the canonical CLI (cli/index.ts), which uses
 * src/pipeline/ as the single implementation. See cli/plan.md.
 *
 * USAGE (unchanged):
 *   node scripts/clean-and-chunk.js <input.md> [output-dir]
 *
 * The input file is copied to cli/workspace/raw/<docId>.md (docId = basename)
 * and processed via `cli pipeline run --doc <docId>`. Output always goes to
 * cli/workspace/processed/ — the optional [output-dir] argument is ignored.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const HERE = import.meta.dirname; // scripts/
const REPO_ROOT = path.join(HERE, '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'cli', 'index.ts');
const RAW_DIR = path.join(REPO_ROOT, 'cli', 'workspace', 'raw');

const [inputArg, outputArg] = process.argv.slice(2);

if (!inputArg) {
  console.error('Usage: node scripts/clean-and-chunk.js <input.md> [output-dir]');
  process.exit(1);
}
if (!fs.existsSync(inputArg)) {
  console.error(`Input file not found: ${inputArg}`);
  process.exit(1);
}
if (outputArg) {
  console.warn(`[deprecated] output-dir "${outputArg}" is ignored — output goes to cli/workspace/processed/`);
}

const docId = path.basename(inputArg).replace(/\.md$/i, '');
fs.mkdirSync(RAW_DIR, { recursive: true });
fs.copyFileSync(inputArg, path.join(RAW_DIR, `${docId}.md`));

console.log(`[wrapper] Copied ${inputArg} → cli/workspace/raw/${docId}.md`);
console.log(`[wrapper] Delegating to: cli pipeline run --doc ${docId}\n`);

try {
  execSync(`node "${CLI_ENTRY}" pipeline run --doc "${docId}"`, { stdio: 'inherit' });
} catch (err) {
  process.exit(err.status || 1);
}
