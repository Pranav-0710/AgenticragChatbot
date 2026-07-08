/**
 * kb-storage Worker
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin authenticated HTTP facade over the kb-storage R2 bucket. Stores the
 * markdown files the ingestion CLI produces; nothing else. Neon is untouched —
 * this is the dual-write target for Phase 2 (see cli/plan.md).
 *
 * Routes (all except /health require `Authorization: Bearer <KB_STORAGE_TOKEN>`):
 *   PUT    /kb/<key>            body = markdown; optional x-doc-url / x-doc-title
 *   GET    /kb/<key>            returns markdown; echoes x-doc-url / x-doc-title
 *   DELETE /kb/<key>
 *   GET    /list?prefix=kb/&cursor=<c>   JSON page of {key,size,uploaded}
 *   GET    /health              unauthenticated liveness check
 *
 * Keys follow the original design's scheme: kb/<domain>/<slug>/<docId>.md
 * (the CLI computes them; this Worker treats keys as opaque paths under kb/).
 */

interface Env {
  KB_BUCKET: R2Bucket;
  KB_STORAGE_TOKEN: string;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function authorized(request: Request, env: Env): boolean {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!env.KB_STORAGE_TOKEN || !token) return false;
  // Constant-time-ish compare; lengths differ → early false is fine here.
  if (token.length !== env.KB_STORAGE_TOKEN.length) return false;
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ env.KB_STORAGE_TOKEN.charCodeAt(i);
  }
  return mismatch === 0;
}

/** Only allow sane object keys under kb/ — no traversal, no absolute paths. */
function validKey(key: string): boolean {
  return (
    key.startsWith('kb/') &&
    key.length <= 1024 &&
    !key.includes('..') &&
    !key.includes('//') &&
    !key.endsWith('/')
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === '/health') {
      return json(200, { status: 'ok', service: 'kb-storage' });
    }

    if (!authorized(request, env)) {
      return json(401, { error: 'missing or invalid bearer token' });
    }

    // ── GET /list?prefix=&cursor= ─────────────────────────────────────────
    if (pathname === '/list' && request.method === 'GET') {
      const prefix = url.searchParams.get('prefix') ?? 'kb/';
      const cursor = url.searchParams.get('cursor') ?? undefined;
      const listed = await env.KB_BUCKET.list({ prefix, cursor, limit: 500 });
      return json(200, {
        objects: listed.objects.map((o) => ({
          key: o.key,
          size: o.size,
          uploaded: o.uploaded.toISOString(),
        })),
        truncated: listed.truncated,
        cursor: listed.truncated ? listed.cursor : null,
      });
    }

    // ── /kb/<key> object routes ───────────────────────────────────────────
    if (pathname.startsWith('/kb/')) {
      const key = decodeURIComponent(pathname.slice(1)); // strip leading '/'
      if (!validKey(key)) {
        return json(400, { error: `invalid key: ${key}` });
      }

      if (request.method === 'PUT') {
        const markdown = await request.text();
        if (markdown.length === 0) {
          return json(400, { error: 'empty body' });
        }
        await env.KB_BUCKET.put(key, markdown, {
          httpMetadata: { contentType: 'text/markdown; charset=utf-8' },
          customMetadata: {
            url: request.headers.get('x-doc-url') ?? '',
            title: request.headers.get('x-doc-title') ?? '',
            uploadedAt: new Date().toISOString(),
          },
        });
        return json(200, { status: 'saved', key, chars: markdown.length });
      }

      if (request.method === 'GET') {
        const obj = await env.KB_BUCKET.get(key);
        if (!obj) return json(404, { error: 'not found', key });
        return new Response(obj.body, {
          status: 200,
          headers: {
            'Content-Type': 'text/markdown; charset=utf-8',
            'x-doc-url': obj.customMetadata?.url ?? '',
            'x-doc-title': obj.customMetadata?.title ?? '',
          },
        });
      }

      if (request.method === 'DELETE') {
        await env.KB_BUCKET.delete(key);
        return json(200, { status: 'deleted', key });
      }

      return json(405, { error: `method ${request.method} not allowed` });
    }

    return json(404, { error: 'unknown route', routes: ['PUT/GET/DELETE /kb/<key>', 'GET /list', 'GET /health'] });
  },
} satisfies ExportedHandler<Env>;
