/**
 * cli/commands/pipeline-chunk.ts
 *   pipeline chunk [--doc <id> | --all]
 *
 * Chunk <id>.topics.json → <id>.chunks.json, wiring related_ids from whatever
 * cross-doc memory maps currently exist. Requires the clean step to have run.
 */

import { getStr, getBool, type ParsedArgs } from '../lib/parseArgs.ts';
import { ensureDirs, listRawDocIds, exists, topicsPath } from '../lib/workspace.ts';
import { loadLocalMemoryIndex } from '../lib/localMemory.ts';
import { runChunk } from '../lib/pipeline-run.ts';

export async function run(args: ParsedArgs): Promise<void> {
  ensureDirs();
  const all = getBool(args, 'all');
  const doc = getStr(args, 'doc');

  if (all) {
    const ids = listRawDocIds();
    if (ids.length === 0) throw new Error('No raw docs in cli/workspace/raw/. Run ingest first.');
    for (const id of ids) {
      if (!exists(topicsPath(id))) {
        console.warn(`  ⏭  chunk ${id} — no topics.json (run "pipeline clean" first), skipping`);
        continue;
      }
      const chunks = runChunk(id, loadLocalMemoryIndex());
      console.log(`  ✓ chunk ${id} → ${chunks.length} chunk(s)`);
    }
    return;
  }

  if (!doc) throw new Error('pipeline chunk requires --doc <id> or --all');

  // runChunk throws a clear error if topics.json is missing.
  const chunks = runChunk(doc, loadLocalMemoryIndex());
  console.log(`\n[chunk] ${doc} → ${chunks.length} chunk(s). Wrote ${doc}.chunks.json\n`);
}
