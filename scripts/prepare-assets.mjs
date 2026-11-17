import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';

const release = '04e93fd92fb490b0';
const assetOrigin = `https://fabric-tear.vercel.app/releases/${release}/`;
const targetDirectory = new URL(`../public/releases/${release}/`, import.meta.url);
const assets = [
  {
    path: 'models/rio/Rio_Uniform_Free_v1.0.pmx',
    remotePath: 'models/rio/Rio_Uniform_Free_v1.0.pmx.gz',
    sha256: '0d9fd7d7d1c5fe605ab8e3e0b8bf382875a6bc1ce70410fa826a07962c87c5d2',
  },
  {
    path: 'models/rio/stockings.json',
    sha256: 'd6aee1bc1fa0374d21453847d28283c37ca83781832b93b18b82efa78550d2f6',
  },
  {
    path: 'models/rio/sph/mc3.png.webp',
    sha256: 'f46dd25d24270188cd592e39643a7033fc09f7e5dfff9b57ced8fa0fa0cc1de9',
  },
  {
    path: 'models/rio/textures/ClothUV_Base_color.png.webp',
    sha256: '688122a70ef96aaaa6195b888d9b0154bfa3c1f06c9904a2277ac117a1e41a5a',
  },
  {
    path: 'audio/fabric/tear-1.wav',
    sha256: '113c0a7ca9ea347db7920947bf062a6a7b0b8701e2f1a24b0597f65dd51c466f',
  },
  {
    path: 'audio/fabric/tear-2.wav',
    sha256: 'fcc460c16713fabb6cf9c977c078b00ced0ae3bc7ff5994b06aaacd3ba1a653c',
  },
];

const sha256 = (content) => createHash('sha256').update(content).digest('hex');
const run = promisify(execFile);
const verifyOnly = process.argv.includes('--verify-only');

async function hasValidAsset(destination, expectedHash) {
  try {
    return sha256(await readFile(destination)) === expectedHash;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function download(url) {
  let response;
  try {
    response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(120_000),
    });
  } catch (fetchError) {
    // Some network setups expose HTTPS through a proxy that only curl picks up.
    try {
      const { stdout } = await run('curl', [
        '--fail', '--silent', '--show-error', '--compressed', '--no-location',
        '--proto', '=https', '--connect-timeout', '10', '--max-time', '120', url.href,
      ], { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 });
      return stdout;
    } catch (curlError) {
      throw new Error(`无法下载 (${fetchError.cause?.code ?? fetchError.message}, curl ${curlError.code})`);
    }
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} (${url.pathname})`);
  return Buffer.from(await response.arrayBuffer());
}

async function prepareAsset(asset) {
  const destination = fileURLToPath(new URL(asset.path, targetDirectory));
  if (await hasValidAsset(destination, asset.sha256)) {
    console.log(`已存在 ${asset.path}`);
    return;
  }
  if (verifyOnly) throw new Error('本地文件缺失或校验未通过');

  const url = new URL(asset.remotePath ?? asset.path, assetOrigin);
  let content = await download(url);
  // Fetch removes HTTP content encoding. The PMX download is also a gzip file.
  if (content[0] === 0x1f && content[1] === 0x8b) {
    content = gunzipSync(content, { maxOutputLength: 64 * 1024 * 1024 });
  }
  if (sha256(content) !== asset.sha256) throw new Error('文件校验失败');

  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.part`;
  try {
    await writeFile(temporary, content, { flag: 'wx' });
    if (!(await hasValidAsset(destination, asset.sha256))) {
      await rename(temporary, destination);
    }
  } finally {
    await rm(temporary, { force: true });
  }
  console.log(`已准备 ${asset.path}`);
}

const results = await Promise.allSettled(assets.map(prepareAsset));
for (const [index, result] of results.entries()) {
  if (result.status === 'rejected') {
    console.error(`${assets[index].path} — ${result.reason.message}`);
    process.exitCode = 1;
  }
}
