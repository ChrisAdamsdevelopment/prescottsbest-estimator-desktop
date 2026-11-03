import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
// Load the operator's local private settings for MCP, including optional Render portal access.
// Never place this file in GitHub; existing process environment settings take precedence.
try { if (typeof process.loadEnvFile === 'function') process.loadEnvFile(join(root, '.env')); }
catch (error) { if (error.code !== 'ENOENT') console.error('Local MCP settings could not be loaded:', error.message); }
try {
  await build({ entryPoints: [join(root, 'scripts/engine.entry.ts')],
    outfile: join(root, 'server/.engine.mjs'), platform: 'node', format: 'esm',
    bundle: true, target: 'node20', logLevel: 'silent' });
  await import('../server/mcp.mjs');
} catch (err) {
  console.error('Unable to start PBC MCP server:', err.message);
  process.exit(1);
}
