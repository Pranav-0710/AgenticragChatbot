/**
 * inspect-kb.js  — DEPRECATED THIN WRAPPER
 * ─────────────────────────────────────────────────────────────────────────────
 * The offline inspector now lives in the CLI. This delegates to `cli inspect`,
 * which reads the local cli/workspace/ files (no database). See cli/plan.md.
 *
 * The original tool ALSO read live Neon tables (kb_documents / kb_chunks) — that
 * database-backed inspection is intentionally not part of the offline CLI. Pass
 * --neon to be reminded where it lives now.
 *
 * USAGE:
 *   node inspect-kb.js [--docId <id>] [--diff]     → cli inspect [--doc <id>] [--diff]
 *   node inspect-kb.js --neon                       → pointer to server.js endpoints
 */

import path from 'path';
import { execSync } from 'child_process';

const HERE = import.meta.dirname; // repo root
const CLI_ENTRY = path.join(HERE, 'cli', 'index.ts');

const args = process.argv.slice(2);

if (args.includes('--neon')) {
  console.log('Neon-backed inspection (live kb_documents / kb_chunks) is not part of the');
  console.log('offline CLI. Use the running server.js for that:');
  console.log('  GET /chunks?docId=<id>     GET /memory/:docId     GET /memory-index');
  process.exit(0);
}

const passthrough = [];
const docIdIdx = args.indexOf('--docId');
if (docIdIdx !== -1 && args[docIdIdx + 1]) passthrough.push('--doc', args[docIdIdx + 1]);
if (args.includes('--diff')) passthrough.push('--diff');

for (const legacy of ['--raw', '--chunks', '--export']) {
  if (args.includes(legacy)) {
    console.warn(`[deprecated] ${legacy} is not supported by the offline CLI inspect — showing the standard summary instead.`);
  }
}

const quoted = passthrough.map((a) => (a.startsWith('--') ? a : `"${a}"`)).join(' ');

try {
  execSync(`node "${CLI_ENTRY}" inspect ${quoted}`.trim(), { stdio: 'inherit' });
} catch (err) {
  process.exit(err.status || 1);
}
