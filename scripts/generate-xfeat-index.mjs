import { createHash } from 'node:crypto';
import { readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import * as ort from 'onnxruntime-web';
import { extractXFeat, quantizeDescriptor, XFEAT_DESCRIPTOR_SIZE, XFEAT_GLOBAL_SIZE, XFEAT_SIZE } from '../modules/catalog/xfeat-core.mjs';

const root = process.cwd();
const imageDirectory = path.join(root, 'public', 'rescene_poca');
const modelPath = path.join(root, 'public', 'models', 'xfeat_512x512.onnx');
const publicDirectory = path.join(root, 'public');
const manifestPath = path.join(root, 'modules', 'catalog', 'xfeat-index.generated.json');
const FEATURES_PER_CARD = 144;
const VERSION = 2;
const ID_SIZE = 12;
const MAX_SHARD_BYTES = 20 * 1024 * 1024;

ort.env.wasm.numThreads = Math.max(1, Math.min(4, Number(process.env.XFEAT_THREADS || 2)));
const modelBytes = await readFile(modelPath);
const session = await ort.InferenceSession.create(modelBytes);
const imageNames = (await readdir(imageDirectory, { recursive: true })).filter(name => /^[a-f0-9]{8,12}\.(png|jpe?g|webp)$/i.test(path.basename(name))).sort();
if (!imageNames.length) throw new Error('No card images found in public/rescene_poca');

const records = [];
for (let index = 0; index < imageNames.length; index += 1) {
  const name = imageNames[index];
  const { data, info } = await sharp(path.join(imageDirectory, name)).rotate().resize(XFEAT_SIZE, XFEAT_SIZE, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const tensorData = new Float32Array(3 * XFEAT_SIZE * XFEAT_SIZE);
  for (let pixel = 0; pixel < XFEAT_SIZE * XFEAT_SIZE; pixel += 1) for (let channel = 0; channel < 3; channel += 1) tensorData[channel * XFEAT_SIZE * XFEAT_SIZE + pixel] = data[pixel * info.channels + channel] / 255;
  const features = extractXFeat(await session.run({ input: new ort.Tensor('float32', tensorData, [1, 3, XFEAT_SIZE, XFEAT_SIZE]) }), FEATURES_PER_CARD);
  const count = features.count;
  const record = Buffer.alloc(ID_SIZE + 4 + XFEAT_GLOBAL_SIZE + count * (4 + XFEAT_DESCRIPTOR_SIZE));
  record.write(path.parse(name).name.toLowerCase(), 0, ID_SIZE, 'ascii');
  record.writeUInt16LE(count, ID_SIZE); record.writeUInt16LE(0, ID_SIZE + 2);
  Buffer.from(quantizeDescriptor(features.global).buffer).copy(record, ID_SIZE + 4);
  let offset = ID_SIZE + 4 + XFEAT_GLOBAL_SIZE;
  const quantized = quantizeDescriptor(features.descriptors);
  for (let feature = 0; feature < count; feature += 1) {
    record.writeUInt16LE(features.points[feature * 2], offset); record.writeUInt16LE(features.points[feature * 2 + 1], offset + 2); offset += 4;
    Buffer.from(quantized.buffer, quantized.byteOffset + feature * XFEAT_DESCRIPTOR_SIZE, XFEAT_DESCRIPTOR_SIZE).copy(record, offset); offset += XFEAT_DESCRIPTOR_SIZE;
  }
  records.push(record);
  if ((index + 1) % 50 === 0 || index + 1 === imageNames.length) process.stdout.write(`XFeat ${index + 1}/${imageNames.length}\n`);
}

const shards = []; let current = []; let currentBytes = 20;
for (const record of records) {
  if (current.length && currentBytes + record.length > MAX_SHARD_BYTES) { shards.push(current); current = []; currentBytes = 20; }
  current.push(record); currentBytes += record.length;
}
if (current.length) shards.push(current);
for (const name of await readdir(publicDirectory)) if (/^rescene-xfeat-index(?:-\d+)?\.bin$/.test(name)) await unlink(path.join(publicDirectory, name));
const urls = [];
for (let index = 0; index < shards.length; index += 1) {
  const header = Buffer.alloc(20);
  header.write('XFIX', 0, 4, 'ascii'); header.writeUInt32LE(VERSION, 4); header.writeUInt32LE(shards[index].length, 8);
  header.writeUInt16LE(XFEAT_DESCRIPTOR_SIZE, 12); header.writeUInt16LE(FEATURES_PER_CARD, 14); header.writeUInt16LE(XFEAT_GLOBAL_SIZE, 16); header.writeUInt16LE(ID_SIZE, 18);
  const indexBytes = Buffer.concat([header, ...shards[index]]); const name = `rescene-xfeat-index-${index + 1}.bin`;
  await writeFile(path.join(publicDirectory, name), indexBytes);
  const hash = createHash('sha256').update(indexBytes).digest('hex').slice(0, 12); urls.push(`/${name}?v=${hash}`);
}
const modelHash = createHash('sha256').update(modelBytes).digest('hex').slice(0, 12);
await writeFile(manifestPath, `${JSON.stringify({ urls, modelUrl: `/models/xfeat_512x512.onnx?v=${modelHash}`, version: VERSION, idSize: ID_SIZE, descriptorSize: XFEAT_DESCRIPTOR_SIZE, globalSize: XFEAT_GLOBAL_SIZE, featuresPerCard: FEATURES_PER_CARD, cards: records.length })}\n`);
process.stdout.write(`Generated ${records.length} XFeat records in ${shards.length} shards.\n`);
