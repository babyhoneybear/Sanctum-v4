import { gateway } from './gateway.js';
import { store } from './store.js';
import page from './connector.html';
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/mcp' || path.startsWith('/bridge/')) return gateway(store(env.DB))(request);
    if (path !== '/' || request.method !== 'GET') return new Response('Not found', { status: 404 });
    if (!request.headers.get('oai-authenticated-user-id')) return new Response('Sign in with ChatGPT to open your Sanctum connector.', { status: 401 });
    const nonce = crypto.randomUUID();
    return new Response(page.replaceAll('__NONCE__', nonce), { headers: {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; script-src 'nonce-" + nonce + "'; style-src 'unsafe-inline'; connect-src 'self' http://127.0.0.1:* http://localhost:*; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    } });
  },
};
