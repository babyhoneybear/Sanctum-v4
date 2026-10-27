import { build } from 'esbuild';
import { mkdir, copyFile, readdir } from 'node:fs/promises';
await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
await mkdir('dist/drizzle', { recursive: true });
await build({ entryPoints: ['worker/index.js'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', loader: { '.html': 'text' }, outfile: 'dist/server/index.js' });
await copyFile('.openai/hosting.json', 'dist/.openai/hosting.json');
for (const file of await readdir('drizzle')) if (file.endsWith('.sql')) await copyFile('drizzle/' + file, 'dist/drizzle/' + file);
console.log('Built the private Sanctum connector.');
