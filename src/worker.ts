/**
 * Cloudflare Workers entry point for Saudi BidPilot.
 * Compatible with Cloudflare Workers runtime (Fetch API, D1Database, Assets).
 */
import type { Env } from './types.js';
import {
  getSession,
  getCompany,
  saveCompany,
  saveTracking,
  getSources,
  getSummary,
  getOpportunities,
  getOpportunityById,
  refreshOpportunities,
  importOpportunities,
  exportCsv,
} from './repository.js';
import { SECTORS, engines } from './intelligence.js';

function parseCookies(cookieHeader: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(';')) {
    const [name, ...val] = part.trim().split('=');
    if (name) {
      cookies[name] = decodeURIComponent(val.join('='));
    }
  }
  return cookies;
}

function jsonResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      ...extraHeaders,
    },
  });
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  // If path is not /api/*, serve via Cloudflare Workers Assets if available
  if (!path.startsWith('/api/')) {
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response('Not found', { status: 404 });
  }

  // Session identification via cookie
  const cookies = parseCookies(request.headers.get('Cookie'));
  const cookieSid = cookies['bidpilot_session'];
  const { session, isNew } = await getSession(env.DB, cookieSid);

  const responseHeaders: Record<string, string> = {};
  if (isNew) {
    responseHeaders['Set-Cookie'] = `bidpilot_session=${session.id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=7776000`;
  }

  try {
    // GET /api/session
    if (path === '/api/session' && method === 'GET') {
      const company = await getCompany(env.DB, session.id);
      return jsonResponse(
        {
          csrf: session.csrf,
          company,
          privacy: 'Device-specific private workspace; persistent Cloudflare D1 storage.',
        },
        200,
        responseHeaders
      );
    }

    // GET /api/meta
    if (path === '/api/meta' && method === 'GET') {
      const sectorsFormatted: Record<string, { ar: string; en: string }> = {};
      for (const [k, v] of Object.entries(SECTORS)) {
        sectorsFormatted[k] = { ar: v[0], en: v[1] };
      }
      return jsonResponse(
        {
          sectors: sectorsFormatted,
          engines: engines(),
        },
        200,
        responseHeaders
      );
    }

    // GET /api/summary
    if (path === '/api/summary' && method === 'GET') {
      const summary = await getSummary(env.DB);
      return jsonResponse(summary, 200, responseHeaders);
    }

    // GET /api/sources
    if (path === '/api/sources' && method === 'GET') {
      const items = await getSources(env.DB);
      return jsonResponse(
        {
          items,
          scheduler: {
            configured: false,
            active: false,
            mode: 'manual_only',
            message: 'تحديث يدوي للمشرف فقط — لا توجد مهام cron آلية',
          },
        },
        200,
        responseHeaders
      );
    }

    // GET /api/opportunities
    if (path === '/api/opportunities' && method === 'GET') {
      const params = Object.fromEntries(url.searchParams.entries());
      const data = await getOpportunities(env.DB, params, session.id);
      return jsonResponse(data, 200, responseHeaders);
    }

    // GET /api/opportunities/:id
    if (path.startsWith('/api/opportunities/') && method === 'GET') {
      const id = decodeURIComponent(path.replace('/api/opportunities/', ''));
      const record = await getOpportunityById(env.DB, id, session.id);
      if (!record) {
        return jsonResponse({ error: 'Opportunity not found' }, 404, responseHeaders);
      }
      return jsonResponse(record, 200, responseHeaders);
    }

    // GET /api/company
    if (path === '/api/company' && method === 'GET') {
      const company = await getCompany(env.DB, session.id);
      return jsonResponse(company, 200, responseHeaders);
    }

    // POST /api/company
    if (path === '/api/company' && method === 'POST') {
      const body = await request.json();
      const updated = await saveCompany(env.DB, session.id, body);
      return jsonResponse(updated, 200, responseHeaders);
    }

    // POST /api/saved/:id
    if (path.startsWith('/api/saved/') && method === 'POST') {
      const id = decodeURIComponent(path.replace('/api/saved/', ''));
      const body = await request.json().catch(() => ({}));
      await saveTracking(env.DB, session.id, id, body);
      return jsonResponse({ ok: true }, 200, responseHeaders);
    }

    // POST /api/admin/refresh
    if (path === '/api/admin/refresh' && method === 'POST') {
      const authHeader = request.headers.get('Authorization') || '';
      const configuredToken = env.BIDPILOT_ADMIN_TOKEN || '';
      const result = await refreshOpportunities(env.DB, authHeader, configuredToken);
      return jsonResponse(result, result.status, responseHeaders);
    }

    // POST /api/admin/import
    if (path === '/api/admin/import' && method === 'POST') {
      const authHeader = request.headers.get('Authorization') || '';
      const configuredToken = env.BIDPILOT_ADMIN_TOKEN || '';
      const body = await request.json().catch(() => ({}));
      const result = await importOpportunities(env.DB, authHeader, configuredToken, body);
      return jsonResponse(result, result.status, responseHeaders);
    }

    // GET /api/export.csv & GET /api/export.xlsx
    if ((path === '/api/export.csv' || path === '/api/export.xlsx') && method === 'GET') {
      const params = Object.fromEntries(url.searchParams.entries());
      const ext = path.endsWith('.xlsx') ? 'xlsx' : 'csv';
      const csvData = await exportCsv(env.DB, params, session.id);
      return new Response(csvData, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="saudi-bidpilot.${ext}"`,
          'X-Content-Type-Options': 'nosniff',
          ...responseHeaders,
        },
      });
    }

    return jsonResponse({ error: 'Endpoint not found' }, 404, responseHeaders);
  } catch (err: any) {
    console.error('API Error:', err);
    return jsonResponse({ error: 'Server error: ' + (err.message || String(err)) }, 500, responseHeaders);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};
