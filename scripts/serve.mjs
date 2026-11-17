import { createReadStream, existsSync } from 'node:fs';
import { readdir, realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createGzip } from 'node:zlib';

const { values } = parseArgs({ options: {
  host: { type: 'string', default: '127.0.0.1' },
  port: { type: 'string', default: '4173' },
} });
const { host } = values;
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('--port must be an integer between 1 and 65535');
}

const project = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const built = resolve(project, 'dist/client');
const isBuilt = existsSync(resolve(built, 'index.html'));
const publicDirectory = resolve(project, 'public');
const sourceDirectories = ['src/', 'releases/', 'vendor/'];
const releaseDirectory = 'releases/04e93fd92fb490b0/';
const modelDirectory = releaseDirectory + 'models/rio/';
const sourceFilesToCompress = ['src/main.js', 'src/runtime.js', 'src/styles.css'];
const modelFilesToCompress = [
  modelDirectory + 'Rio_Uniform_Free_v1.0.pmx',
  modelDirectory + 'stockings.json',
];
const precompressedFiles = new Map();
const isHashedBuildAsset = (name) => /^assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css)$/.test(name);
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.glb', 'model/gltf-binary'],
  ['.gltf', 'model/gltf+json'],
  ['.html', 'text/html; charset=utf-8'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.ogg', 'audio/ogg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.wasm', 'application/wasm'],
  ['.wav', 'audio/wav'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
]);

function isInside(directory, file) {
  const fromDirectory = relative(directory, file);
  return fromDirectory !== '..' && !fromDirectory.startsWith(`..${sep}`)
    && !isAbsolute(fromDirectory);
}

async function findFile(directory, name) {
  const candidate = resolve(directory, name);
  if (!isInside(directory, candidate)) return null;
  try {
    const [file, root] = await Promise.all([realpath(candidate), realpath(directory)]);
    if (!isInside(root, file) || !isInside(project, root)) return null;
    const info = await stat(file);
    return info.isFile() ? { file, info } : null;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
}

async function findServedAsset(name) {
  let asset;
  if (isBuilt || name === 'index.html' || name.startsWith(sourceDirectories[0])) {
    asset = await findFile(isBuilt ? built : project, name);
  }
  if (!asset && sourceDirectories.slice(1).some((prefix) => name.startsWith(prefix))) {
    asset = await findFile(publicDirectory, name);
  }
  return asset;
}

async function prepareGzip(name) {
  const asset = await findServedAsset(name);
  if (!asset) return;

  const { file, info } = asset;
  const input = createReadStream(file);
  const compressor = createGzip({ level: 4 });
  input.once('error', (error) => compressor.destroy(error));
  input.pipe(compressor);
  try {
    const chunks = [];
    for await (const chunk of compressor) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    if (body.length < info.size) precompressedFiles.set(file, { info, body });
  } finally {
    input.destroy();
  }
}

async function warmCompressionCache() {
  let files = sourceFilesToCompress;
  if (isBuilt) {
    const names = await readdir(resolve(built, 'assets')).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return [];
    });
    files = names.map((name) => `assets/${name}`).filter(isHashedBuildAsset);
  }
  await Promise.allSettled([...files, ...modelFilesToCompress].map(prepareGzip));
}

function acceptsGzip(header = '') {
  let wildcardQuality = 0;
  for (const entry of header.split(',')) {
    const [coding, ...parameters] = entry.toLowerCase().split(';').map((part) => part.trim());
    const weight = parameters.find((part) => /^q\s*=/.test(part));
    const quality = weight ? Number(weight.split('=')[1]) : 1;
    if (coding === 'gzip') return quality > 0 && quality <= 1;
    if (coding === '*') wildcardQuality = quality;
  }
  return wildcardQuality > 0 && wildcardQuality <= 1;
}

function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  const start = match[1] ? Number(match[1]) : Math.max(size - Number(match[2]), 0);
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || start >= size || start > end) return null;
  return { start, end };
}

async function serve(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  let name;
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname.includes('\\') || pathname.includes('\0')
      || pathname.split('/').some((segment) => segment.startsWith('.'))) {
      throw new Error('Invalid path');
    }
    name = pathname.slice(1) || 'index.html';
  } catch {
    response.writeHead(400).end();
    return;
  }

  const asset = await findServedAsset(name);
  if (!asset) {
    response.writeHead(404).end();
    return;
  }

  const { file, info } = asset;
  const cached = precompressedFiles.get(file);
  const matchesCurrentFile =
    cached && cached.info.size === info.size && cached.info.mtimeMs === info.mtimeMs
    && cached.info.ctimeMs === info.ctimeMs && cached.info.ino === info.ino;
  const useGzip = matchesCurrentFile && !request.headers.range
    && acceptsGzip(request.headers['accept-encoding']);
  const immutable = name.startsWith(releaseDirectory) || (isBuilt && isHashedBuildAsset(name));
  const headers = {
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'Content-Type': contentTypes.get(extname(file)) ?? 'application/octet-stream',
    'Content-Length': info.size,
    'X-Content-Type-Options': 'nosniff',
  };

  if (cached) headers.Vary = 'Accept-Encoding';
  if (useGzip) {
    headers['Content-Encoding'] = 'gzip';
    headers['Content-Length'] = cached.body.length;
    response.writeHead(200, headers).end(request.method === 'HEAD' ? undefined : cached.body);
    return;
  }
  headers['Accept-Ranges'] = 'bytes';

  let range;
  if (request.headers.range) {
    range = parseRange(request.headers.range, info.size);
    if (!range) {
      response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end();
      return;
    }
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${info.size}`;
    headers['Content-Length'] = range.end - range.start + 1;
  }
  response.writeHead(range ? 206 : 200, headers);
  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  const stream = createReadStream(file, range);
  stream.on('error', () => response.destroy());
  response.on('close', () => stream.destroy());
  stream.pipe(response);
}

const server = createServer((request, response) => {
  serve(request, response).catch((error) => {
    console.error(error.message);
    if (response.headersSent) response.destroy();
    else response.writeHead(500).end();
  });
});
server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
await warmCompressionCache();
server.listen(port, host, () => {
  const urlHost = host.includes(':') ? `[${host}]` : host;
  console.log(`http://${urlHost}:${port}/`);
});
