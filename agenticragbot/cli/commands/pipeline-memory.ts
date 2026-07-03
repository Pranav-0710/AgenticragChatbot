/**
 * cli/commands/pipeline-memory.ts
 *   pipeline memory [--doc <id> | --all]
 *
 * Build <id>.memory.json + <id>.memory.md, backfill cross-doc related_ids into
 * other docs' chunks.json, and regenerate memory-index.md. Requires chunks.json.
 */

import { getStr, getBool, type ParsedArgs } from '../lib/parseArgs.ts';
import { ensureDirs, listRawDocIds, exists, chunksPath } from '../lib/workspace.ts';
import { runMemory } from '../lib/pipeline-run.ts';

export async function run(args: ParsedArgs): Promise<void> {
  ensureDirs();
  const all = getBool(args, 'all');
  const doc = getStr(args, 'doc');

  if (all) {
    const ids = listRawDocIds();
    if (ids.length === 0) throw new Error('No raw docs in cli/workspace/raw/. Run ingest first.');
    for (const id of ids) {
      if (!exists(chunksPath(id))) {
        console.warn(`  ⏭  memory ${id} — no chunks.json (run "pipeline chunk" first), skipping`);
        continue;
      }
      const r = runMemory(id);
      console.log(
        `  ✓ memory ${id} → ${r.chunkCount} chunk(s), ${r.crossLinks} cross-linked, ` +
          `backfilled ${r.backfilled} prior chunk(s)`,
      );
    }
    return;
  }

  if (!doc) throw new Error('pipeline memory requires --doc <id> or --all');

  // runMemory throws a clear error if chunks.json is missing.
  const r = runMemory(doc);
  console.log(
    `\n[memory] ${doc} → ${r.chunkCount} chunk(s), ${r.crossLinks} cross-linked, ` +
      `backfilled ${r.backfilled} prior chunk(s). Wrote ${doc}.memory.json + .memory.md + memory-index.md\n`,
  );
}
