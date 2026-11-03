import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
await build({ entryPoints: [join(root, 'scripts/engine.entry.ts')],
  outfile: join(root, 'server/.engine.mjs'), platform: 'node', format: 'esm',
  bundle: true, target: 'node20', logLevel: 'silent' });
console.log('Shared deterministic estimator engine prepared for MCP.');
