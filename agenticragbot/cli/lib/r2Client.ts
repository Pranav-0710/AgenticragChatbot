/**
 * cli/lib/r2Client.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * HTTP client for the kb-storage Worker (workers/kb-storage) — the CLI's only
 * bridge to Cloudflare R2. Plain fetch, no SDK.
 *
 * The Worker holds the R2 bucket binding; this client just speaks its tiny
 * HTTP API (PUT/GET /kb/<key>, GET /list) with a bearer token. If
 * KB_STORAGE_URL / KB_STORAGE_TOKEN aren't configured, isConfigured() is false
 * and callers skip cloud operations — the CLI stays fully usable offline.
 *
 * Key scheme (from the original Layer-1 design):
 *   kb/<domain-with-dashes>/<url-slug>/<docId>.md
 */

import type { CliEnv } from './env.ts';

export interface R2ObjectInfo {
  key: string;
  size: number;
  uploaded: string;
}

export interface RemoteDoc {
  markdown: string;
  url: string;
  title: string;
}

export function isConfigured(env: CliEnv): boolean {
  return Boolean(env.KB_STORAGE_URL && env.KB_STORAGE_TOKEN);
}

/** kb/<domain>/<slug>/<docId>.md — mirrors the original README's R2 layout. */
export function docKey(pageUrl: string, docId: string): string {
  let domain = 'unknown';
  let slug = 'index';
  try {
    const u = new URL(pageUrl);
    domain = u.hostname.replace(/\./g, '-');
    const path = u.pathname.replace(/^\/|\/$/g, '');
    if (path) {
      slug = path.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'index';
    }
  } catch {
    // fall through with defaults — key stays valid
  }
  return `kb/${domain}/${slug}/${docId}.md`;
}

function headers(env: CliEnv, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${env.KB_STORAGE_TOKEN}`, ...extra };
}

async function expectOk(res: Response, action: string): Promise<void> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`kb-storage ${action} failed: HTTP ${res.status} ${body.slice(0, 200)}`);
  }
}

/** Upload one markdown doc. Returns the object key. */
export async function pushDoc(
  env: CliEnv,
  key: string,
  markdown: string,
  meta: { url?: string; title?: string } = {},
): Promise<string> {
  const res = await fetch(`${env.KB_STORAGE_URL}/${key}`, {
    method: 'PUT',
    headers: headers(env, {
      'Content-Type': 'text/markdown; charset=utf-8',
      'x-doc-url': meta.url ?? '',
      'x-doc-title': meta.title ?? '',
    }),
    body: markdown,
  });
  await expectOk(res, `PUT ${key}`);
  return key;
}

/** List every object under a prefix (follows pagination). */
export async function listRemote(env: CliEnv, prefix = 'kb/'): Promise<R2ObjectInfo[]> {
  const all: R2ObjectInfo[] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ prefix });
    if (cursor) params.set('cursor', cursor);
    const res = await fetch(`${env.KB_STORAGE_URL}/list?${params}`, { headers: headers(env) });
    await expectOk(res, `LIST ${prefix}`);
    const page = (await res.json()) as {
      objects: R2ObjectInfo[];
      truncated: boolean;
      cursor: string | null;
    };
    all.push(...page.objects);
    cursor = page.cursor;
  } while (cursor);
  return all;
}

/** Download one doc (markdown + the metadata the Worker echoes as headers). */
export async function fetchDoc(env: CliEnv, key: string): Promise<RemoteDoc> {
  const res = await fetch(`${env.KB_STORAGE_URL}/${key}`, { headers: headers(env) });
  await expectOk(res, `GET ${key}`);
  return {
    markdown: await res.text(),
    url: res.headers.get('x-doc-url') ?? '',
    title: res.headers.get('x-doc-title') ?? '',
  };
}
