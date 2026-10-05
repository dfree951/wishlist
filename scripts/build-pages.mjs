import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '/wishlist';
const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN || 'https://syd-and-dan-christmas.vercel.app';
if (basePath && !/^\/[a-zA-Z0-9_-]+$/.test(basePath)) throw new Error('Use a single repository path such as /wishlist.');
const backend = new URL(apiOrigin);
if (backend.origin !== apiOrigin || !['https:', 'http:'].includes(backend.protocol)) throw new Error('API origin must be an HTTP(S) origin without a trailing slash.');
await mkdir(path.join(root, '.tmp'), { recursive: true });
const project = await mkdtemp(path.join(root, '.tmp', 'pages-'));
// Build a separate project so exporting never moves or deletes the backend routes.
await cp(path.join(root, 'src'), path.join(project, 'src'), {
  recursive: true,
  filter: source => source !== path.join(root, 'src', 'app', 'api') && source !== path.join(root, 'src', 'proxy.ts'),
});
for (const file of ['package.json', 'tsconfig.json', 'next-env.d.ts']) {
  await cp(path.join(root, file), path.join(project, file));
}
await writeFile(path.join(project, 'next.config.mjs'), `export default ${JSON.stringify({
  output: 'export', basePath, trailingSlash: true, images: { unoptimized: true },
  turbopack: { root },
})};\n`);
const result = spawnSync(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'build', project], {
  cwd: root, stdio: 'inherit', env: { ...process.env, NEXT_PUBLIC_BASE_PATH: basePath, NEXT_PUBLIC_API_ORIGIN: apiOrigin },
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
const output = path.resolve(root, 'out');
if (path.dirname(output) !== path.resolve(root)) throw new Error('Unexpected output path.');
await rm(output, { recursive: true, force: true });
await cp(path.join(project, 'out'), output, { recursive: true });
await writeFile(path.join(output, '.nojekyll'), '');
// Basic export checks catch broken repository paths before uploading an artifact.
for (const page of ['index.html', 'gifts/index.html', 'manage/index.html']) {
  const html = await readFile(path.join(output, page), 'utf8');
  if (!html.includes(`${basePath}/_next/`)) throw new Error(`Missing base path in ${page}`);
}
console.log(`Static frontend ready in out; API: ${apiOrigin}; base path: ${basePath || '/'}`);
