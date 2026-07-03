/**
 * cli/lib/parseArgs.ts
 * Minimal argv parser — no external dependency.
 *
 * Supports:
 *   positional args        →  ingest crawl
 *   --flag value           →  --url https://x  |  --max-pages 5
 *   --flag=value           →  --url=https://x
 *   --boolean-flag         →  --skip-existing  |  --all  |  --diff
 */

export interface ParsedArgs {
  positionals: string[];
  options: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (token.startsWith('--')) {
      const body = token.slice(2);

      if (body.includes('=')) {
        const eq = body.indexOf('=');
        options[body.slice(0, eq)] = body.slice(eq + 1);
        continue;
      }

      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        options[body] = next;
        i++; // consume the value
      } else {
        options[body] = true;
      }
      continue;
    }

    positionals.push(token);
  }

  return { positionals, options };
}

/** Read a string option, or undefined if absent / boolean. */
export function getStr(args: ParsedArgs, name: string): string | undefined {
  const v = args.options[name];
  return typeof v === 'string' ? v : undefined;
}

/** Read a numeric option, or undefined if absent / not a number. */
export function getNum(args: ParsedArgs, name: string): number | undefined {
  const v = args.options[name];
  if (typeof v !== 'string') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** True if the flag is present (as a boolean or any value). */
export function getBool(args: ParsedArgs, name: string): boolean {
  return name in args.options;
}
