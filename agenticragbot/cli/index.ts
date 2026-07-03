/**
 * cli/index.ts — command router for the local dev harness.
 *
 * Run directly on Node 22.19+ (native TS type-stripping):
 *   node cli/index.ts <group> <subcommand> [options]
 *
 * Groups:
 *   ingest crawl --url <site> [--max-pages N] [--skip-existing]
 *   pipeline clean  [--doc <id> | --all]
 *   pipeline chunk  [--doc <id> | --all]
 *   pipeline memory [--doc <id> | --all]
 *   pipeline run    [--doc <id> | --all]
 *   inspect [--doc <id>] [--diff]
 */

import { parseArgs, type ParsedArgs } from './lib/parseArgs.ts';

import * as ingest from './commands/ingest.ts';
import * as pipelineClean from './commands/pipeline-clean.ts';
import * as pipelineChunk from './commands/pipeline-chunk.ts';
import * as pipelineMemory from './commands/pipeline-memory.ts';
import * as pipelineRun from './commands/pipeline-run.ts';
import * as inspect from './commands/inspect.ts';

const HELP = `
MergeX KB — Local Development CLI (database-free)

USAGE
  node cli/index.ts <group> <subcommand> [options]

INGEST
  ingest crawl --url <site> [--max-pages 50] [--skip-existing]
      Crawl a site (sitemap-first) and scrape each page via Jina to
      cli/workspace/raw/<docId>.md, recording each in manifest.json.

PIPELINE  (all file-based, writes to cli/workspace/processed/)
  pipeline clean  [--doc <id> | --all]   Clean → <id>.clean.md + <id>.topics.json
  pipeline chunk  [--doc <id> | --all]   Chunk topics.json → <id>.chunks.json
  pipeline memory [--doc <id> | --all]   Memory map + cross-doc backfill + index
  pipeline run    [--doc <id> | --all]   All three, serially (memory-aware)

INSPECT
  inspect [--doc <id>] [--diff]
      List docs + pipeline status, or detail one doc (chunk/cross-link/alert
      counts; --diff shows raw vs cleaned).

NOTES
  • Never touches Neon / Qdrant / R2. Only JINA_API_KEY is read (optional).
  • --all processes docs serially so each doc sees prior docs' topic memory.
`;

async function main(): Promise<void> {
  const args: ParsedArgs = parseArgs(process.argv.slice(2));
  const [group, sub] = args.positionals;

  if (!group || group === 'help' || args.options.help) {
    console.log(HELP);
    return;
  }

  switch (group) {
    case 'ingest':
      await ingest.run(args);
      return;

    case 'pipeline': {
      const table: Record<string, (a: ParsedArgs) => Promise<void>> = {
        clean: pipelineClean.run,
        chunk: pipelineChunk.run,
        memory: pipelineMemory.run,
        run: pipelineRun.run,
      };
      const handler = sub ? table[sub] : undefined;
      if (!handler) {
        console.error(`Unknown pipeline subcommand: ${sub ?? '(none)'}`);
        console.error('Expected one of: clean | chunk | memory | run');
        process.exitCode = 1;
        return;
      }
      await handler(args);
      return;
    }

    case 'inspect':
      await inspect.run(args);
      return;

    default:
      console.error(`Unknown command: ${group}`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n✗ ${message}`);
  process.exitCode = 1;
});
