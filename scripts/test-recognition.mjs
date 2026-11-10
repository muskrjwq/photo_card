// Runs the production matcher with OpenCV and decoded image pixels (no browser/server).
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import ts from 'typescript';
import cvModule from '@techstark/opencv-js';

const cv = await cvModule;
globalThis.__recognitionCv = cv;
const nativeFetch = globalThis.fetch;
globalThis.fetch = (url, options) => String(url).startsWith('/')
  ? fs.readFile(path.join('public', String(url).split('?')[0])).then(bytes => new Response(bytes))
  : nativeFetch(url, options);
globalThis.window = { location: { search: process.env.DEBUG_RECOGNITION ? '?recognitionDebug' : '' }, setTimeout,
  Image: class {
    set src(url) {
      nativeFetch(url).then(r => r.arrayBuffer()).then(bytes => sharp(Buffer.from(bytes)).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true }))
        .then(({ data, info }) => { this.pixels = data; this.width = info.width; this.height = info.height; this.onload(); }).catch(error => this.onerror(error));
    }
  }
};
let source = await fs.readFile('modules/catalog/opencv-matcher.ts', 'utf8');
source = source.replace('import("./opencv-runtime").then((module) => module.getOpenCvRuntime())', 'Promise.resolve(globalThis.__recognitionCv)')
  .replace('cv.imread(image)', 'cv.matFromArray(image.height, image.width, cv.CV_8UC4, image.pixels)');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { matchPhotoCard } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const catalog = JSON.parse(await fs.readFile('modules/catalog/rescene-catalog.generated.json', 'utf8'));
const folder = process.env.TEST_FOLDER || 'public/poca_test';
const records = [];
const failures = [];
for (const name of (await fs.readdir(folder)).sort()) {
  const id = path.parse(name).name.toUpperCase();
  if (!/\.(jpe?g|png|webp)$/i.test(name) || (process.env.TEST_ID && id !== process.env.TEST_ID)) continue;
  const labelled = /^[A-F0-9]{8}$/.test(id);
  const input = await fs.readFile(path.join(folder, name));
  for (const variant of process.env.STRESS ? ['original', 'degraded'] : ['original']) {
    const bytes = variant === 'original' ? input : await sharp(input).rotate().resize(360, 540, { fit: 'fill' })
      .modulate({ brightness: 0.55, saturation: 0.7 }).blur(0.8).affine([[1, 0.10], [0.04, 1]], { background: '#888888' })
      .rotate(14, { background: '#888888' }).jpeg({ quality: 35 }).toBuffer();
    const start = performance.now();
    const result = await matchPhotoCard(new File([bytes], name), catalog.cards, catalog.features, catalog.descriptorIndex);
    const candidates = result?.candidates.map(c => c.card.id.toUpperCase()) ?? [];
    const row = { id: labelled ? id : null, file: name, variant, top: candidates[0] ?? null, rank: labelled ? candidates.indexOf(id) + 1 : null, confident: result?.confident ?? false, ms: Math.round(performance.now() - start) };
    records.push(row); console.log(JSON.stringify(row));
    if (labelled && row.rank !== 1) failures.push(row);
  }
}
if (!process.env.TEST_ID) {
  for (const [name, bytes] of [
    ['blank', await sharp({ create: { width: 400, height: 600, channels: 3, background: '#999999' } }).png().toBuffer()],
    ['unrelated-illustration', await fs.readFile('public/cards/card-01.svg')],
  ]) {
    const result = await matchPhotoCard(new File([bytes], name), catalog.cards, catalog.features, catalog.descriptorIndex);
    const row = { negative: name, rejected: result === null, top: result?.candidates[0]?.card.id ?? null };
    console.log(JSON.stringify(row)); records.push(row);
    if (!row.rejected) failures.push(row);
  }
}
await fs.mkdir('outputs', { recursive: true });
await fs.writeFile(process.env.REPORT || 'outputs/recognition-test.json', JSON.stringify(records, null, 2));
console.log(JSON.stringify({ photos: records.filter(r => r.id).length, top1: records.filter(r => r.rank === 1).length, top4: records.filter(r => r.rank > 0).length, failures: failures.length }));
if (!records.length) throw new Error('No labelled test photos found');
if (failures.length) process.exitCode = 1;
