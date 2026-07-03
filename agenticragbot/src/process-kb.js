/**
 * src/process-kb.js  — DEPRECATED THIN WRAPPER
 * ─────────────────────────────────────────────────────────────────────────────
 * Byte-for-byte duplicate of scripts/prod/process-kb.js historically. Both now
 * delegate to the canonical CLI (cli/index.ts). Prefer scripts/prod/process-kb.js
 * or `npm run cli:run`. See cli/plan.md.
 *
 * USAGE:
 *   node src/process-kb.js [--input kb/raw] [--output <ignored>] [--dry-run]
 *
 * Output always goes to cli/workspace/processed/ — the legacy --output dir is
 * ignored. Input files are copied into cli/workspace/raw/ preserving filenames.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const HERE = import.meta.dirname; // src/
const REPO_ROOT = path.join(HERE, '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'cli', 'index.ts');
const RAW_DIR = path.join(REPO_ROOT, 'cli', 'workspace', 'raw');

const args = process.argv.slice(2);
const argVal = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
};
const inputDir = argVal('--input') || 'kb/raw';
const outputArg = argVal('--output');
const dryRun = args.includes('--dry-run');

if (outputArg) {
  console.warn(`[deprecated] --output "${outputArg}" is ignored — output goes to cli/workspace/processed/`);
}

if (!fs.existsSync(inputDir)) {
  console.error(`Input directory not found: ${inputDir}`);
  console.error('   Place raw Jina markdown files there, or pass --input <dir>.');
  process.exit(1);
}

const mdFiles = fs.readdirSync(inputDir).filter((f) => f.endsWith('.md')).sort();
if (mdFiles.length === 0) {
  console.error(`No .md files found in ${inputDir}`);
  process.exit(0);
}

if (dryRun) {
  console.log(`[dry-run] Would copy ${mdFiles.length} file(s) from ${inputDir} → cli/workspace/raw/, then run: cli pipeline run --all`);
  for (const f of mdFiles) console.log(`  - ${f}`);
  process.exit(0);
}

fs.mkdirSync(RAW_DIR, { recursive: true });
for (const f of mdFiles) {
  fs.copyFileSync(path.join(inputDir, f), path.join(RAW_DIR, f));
}
console.log(`[wrapper] Copied ${mdFiles.length} file(s) from ${inputDir} → cli/workspace/raw/`);
console.log(`[wrapper] Delegating to: cli pipeline run --all\n`);

try {
  execSync(`node "${CLI_ENTRY}" pipeline run --all`, { stdio: 'inherit' });
} catch (err) {
  process.exit(err.status || 1);
}
