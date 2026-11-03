import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const file = resolve('.env');
let contents = '';
try { contents = await readFile(file, 'utf8'); } catch { /* First launch. */ }
const match = contents.match(/^AI_ACCESS_TOKEN=(.{16,})$/m);
if (!match) {
  const token = randomBytes(32).toString('hex');
  const newline = contents && !contents.endsWith('\n') ? '\n' : '';
  contents += newline + 'AI_ACCESS_TOKEN=' + token + '\n';
  await writeFile(file, contents, { flag: 'w', mode: 0o600 });
  console.log('New local AI access token (enter in Settings): ' + token);
} else {
  console.log('Local AI access token (enter in Settings): ' + match[1]);
}
console.log('Provider keys are configured in the app, not in this terminal.');
