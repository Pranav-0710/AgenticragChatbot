/**
 * cli/commands/pipeline-clean.ts
 *   pipeline clean [--doc <id> | --all]
 *
 * Clean raw markdown → <id>.clean.md + <id>.topics.json (no chunking).
 */

import { getStr, getBool, type ParsedArgs } from '../lib/parseArgs.ts';
import { ensureDirs, listRawDocIds } from '../lib/workspace.ts';
import { runClean } from '../lib/pipeline-run.ts';

export async function run(args: ParsedArgs): Promise<void> {
  ensureDirs();
  const all = getBool(args, 'all');
  const doc = getStr(args, 'doc');

  if (all) {
    const ids = listRawDocIds();
    if (ids.length === 0) throw new Error('No raw docs in cli/workspace/raw/. Run ingest first.');
    for (const id of ids) {
      const r = runClean(id);
      console.log(`  ✓ clean ${id} → ${r.topics.length} topic(s), ${r.alerts.length} alert(s)`);
    }
    return;
  }

  if (!doc) throw new Error('pipeline clean requires --doc <id> or --all');

  const r = runClean(doc);
  console.log(
    `\n[clean] ${doc} → ${r.topics.length} topic(s), ${r.alerts.length} alert(s). ` +
      `Wrote ${doc}.clean.md + ${doc}.topics.json\n`,
  );
}
