import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * Dev-only proxy: POST /api/mistral/* -> https://api.mistral.ai/v1/*, adding the API key
 * from .env (MISTRAL_STUDIO_API_KEY) server-side so it never ends up in the browser bundle.
 * In production (GitHub Pages) the player pastes their own key in the Agent panel instead.
 */
function mistralDevProxy(key: string | undefined): Plugin {
  return {
    name: 'mistral-dev-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/mistral', async (req, res) => {
        if (!key) {
          res.statusCode = 501;
          res.end(JSON.stringify({ message: 'MISTRAL_STUDIO_API_KEY missing in .env' }));
          return;
        }
        if (req.method === 'GET' && req.url === '/status') {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        try {
          const r = await fetch('https://api.mistral.ai/v1' + req.url, {
            method: req.method,
            headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
            body: req.method === 'GET' ? undefined : Buffer.concat(chunks),
          });
          res.statusCode = r.status;
          res.setHeader('content-type', r.headers.get('content-type') ?? 'application/json');
          res.end(Buffer.from(await r.arrayBuffer()));
        } catch (e) {
          res.statusCode = 502;
          res.end(JSON.stringify({ message: String(e) }));
        }
      });
    },
  };
}

// Relative base so the build works on GitHub Pages under /<repo>/.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
    plugins: [mistralDevProxy(env.MISTRAL_STUDIO_API_KEY)],
  };
});
