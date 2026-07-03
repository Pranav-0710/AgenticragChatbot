/**
 * cli/commands/pipeline-run.ts
 * ─────────────────────────────────────────────────────────────────────────────
 *   pipeline run [--doc <id> | --all]
 *
 * Runs clean → chunk → memory for one doc, or for every doc in raw/ serially
 * (so each doc's chunking sees the accumulated memory of all prior docs — the
 * same reason server.js's /process/batch is serial, not parallel).
 */

import { getStr, getBool, type ParsedArgs } from '../lib/parseArgs.ts';
import { ensureDirs, listRawDocIds } from '../lib/workspace.ts';
import { runDoc } from '../lib/pipeline-run.ts';

export async function run(args: ParsedArgs): Promise<void> {
  ensureDirs();

  const all = getBool(args, 'all');
  const doc = getStr(args, 'doc');

  if (all) {
    const ids = listRawDocIds();
    if (ids.length === 0) {
      throw new Error('No raw docs found in cli/workspace/raw/. Run ingest first.');
    }
    console.log(`\n[pipeline run] Processing ${ids.length} doc(s) serially…\n`);
    for (const [i, id] of ids.entries()) {
      const r = runDoc(id);
      console.log(
        `  (${i + 1}/${ids.length}) ${id} → ${r.chunkCount} chunks, ` +
          `${r.crossLinks} cross-linked, backfilled ${r.backfilled} prior chunk(s)`,
      );
    }
    console.log(`\n[pipeline run] Done. Output in cli/workspace/processed/.\n`);
    return;
  }

  if (doc) {
    const r = runDoc(doc);
    console.log(
      `\n[pipeline run] ${doc} → ${r.chunkCount} chunks, ${r.crossLinks} cross-linked, ` +
        `backfilled ${r.backfilled} prior chunk(s). Output in cli/workspace/processed/.\n`,
    );
    return;
  }

  throw new Error('pipeline run requires --doc <id> or --all');
}
