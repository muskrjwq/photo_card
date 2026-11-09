import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import cvModule from "@techstark/opencv-js";

const projectRoot = process.cwd();
const csvPath = path.join(projectRoot, "data", "rescene", "rescene_photocards.csv");
const imageDirectory = path.join(projectRoot, "public", "rescene_poca");
const outputPath = path.join(projectRoot, "modules", "catalog", "rescene-catalog.generated.json");
const descriptorIndexPath = path.join(projectRoot, "public", "rescene-recognition-index.bin");
const DESCRIPTORS_PER_CARD = 192;
const DESCRIPTOR_BYTES = 32;
const INDEX_VERSION = 1;

function parseCsv(text) {
  const rows = []; let row = []; let value = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { row.push(value); value = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value); value = ""; if (row.some((cell) => cell.length)) rows.push(row); row = [];
    } else value += character;
  }
  if (value.length || row.length) { row.push(value); rows.push(row); }
  const headers = rows.shift().map((header) => header.replace(/^\uFEFF/, ""));
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
}

function makeHash(pixels) {
  let hash = 0n;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      hash = (hash << 1n) | BigInt(pixels[y * 9 + x] > pixels[y * 9 + x + 1] ? 1 : 0);
    }
  }
  return hash.toString(16).padStart(16, "0");
}

async function makeFeatures(filePath) {
  const hashPixels = await sharp(filePath).greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  const histogramPixels = await sharp(filePath).greyscale().resize(64, 96, { fit: "fill" }).raw().toBuffer();
  const histogram = Array(16).fill(0);
  for (const value of histogramPixels) histogram[Math.min(15, Math.floor(value / 16))] += 1;
  return { dHash: makeHash(hashPixels), histogram: histogram.map((count) => Number((count / histogramPixels.length).toFixed(6))) };
}

async function getOpenCv() {
  const candidate = cvModule;
  if (candidate && typeof candidate.then === "function") return await candidate;
  if (candidate?.Mat) return candidate;
  return await new Promise((resolve) => { candidate.onRuntimeInitialized = () => resolve(candidate); });
}

function makeDescriptorRecord(cv, id, pixels) {
  const rgba = cv.matFromArray(600, 400, cv.CV_8UC4, pixels);
  const gray = new cv.Mat();
  cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
  cv.equalizeHist(gray, gray);
  const keypoints = new cv.KeyPointVector();
  const descriptors = new cv.Mat();
  const mask = new cv.Mat(600, 400, cv.CV_8UC1, new cv.Scalar(0));
  cv.rectangle(mask, new cv.Point(24, 36), new cv.Point(375, 563), new cv.Scalar(255), -1);
  const orb = new cv.ORB(800, 1.2, 8, 24, 0, 2, cv.ORB_HARRIS_SCORE, 31, 12);
  orb.detectAndCompute(gray, mask, keypoints, descriptors);

  const ranked = Array.from({ length: descriptors.rows }, (_, index) => {
    const point = keypoints.get(index);
    return { index, x: point.pt.x, y: point.pt.y, response: point.response ?? 0 };
  }).sort((a, b) => b.response - a.response).slice(0, DESCRIPTORS_PER_CARD);
  const record = Buffer.alloc(12 + ranked.length * (4 + DESCRIPTOR_BYTES));
  record.write(id, 0, 8, "ascii");
  record.writeUInt16LE(ranked.length, 8);
  record.writeUInt16LE(DESCRIPTOR_BYTES, 10);
  let offset = 12;
  for (const point of ranked) {
    record.writeUInt16LE(Math.max(0, Math.min(399, Math.round(point.x))), offset);
    record.writeUInt16LE(Math.max(0, Math.min(599, Math.round(point.y))), offset + 2);
    offset += 4;
    const start = point.index * descriptors.cols;
    Buffer.from(descriptors.data.slice(start, start + DESCRIPTOR_BYTES)).copy(record, offset);
    offset += DESCRIPTOR_BYTES;
  }

  rgba.delete(); gray.delete(); keypoints.delete(); descriptors.delete(); mask.delete(); orb.delete();
  return record;
}

const csvText = await readFile(csvPath, "utf8");
const rows = parseCsv(csvText);
const imageNames = await readdir(imageDirectory);
const imageById = new Map(imageNames.map((name) => [path.parse(name).name, name]));
const duplicateIds = rows.filter((row, index) => rows.findIndex((candidate) => candidate.cardId === row.cardId) !== index);
if (duplicateIds.length) throw new Error(`Duplicate cardId: ${duplicateIds[0].cardId}`);

const albumCategories = new Set(["Re:Scene", "Glow Up", "Scenedrome", "Dearest"]);
const cards = [];
const features = {};
const descriptorRecords = [];
const cv = await getOpenCv();
for (let index = 0; index < rows.length; index += 1) {
  const row = rows[index]; const imageName = imageById.get(row.cardId);
  if (!imageName) throw new Error(`Missing image for ${row.cardId}`);
  const expectedPath = `/rescene_poca/${imageName}`;
  cards.push({
    id: row.cardId,
    code: row.cardId.toUpperCase(),
    member: row.memberName,
    kind: "member",
    name: row.name,
    collection: row.category,
    category: albumCategories.has(row.category) ? "album" : "event",
    source: `${row.memberName} #${row.idNumber}`,
    image: expectedPath,
    owners: 0,
    tags: [row.memberName, row.category, row.name],
    memberIndex: Number(row.memberIndex),
    idNumber: Number(row.idNumber),
  });
  const filePath = path.join(imageDirectory, imageName);
  features[row.cardId] = await makeFeatures(filePath);
  const pixels = await sharp(filePath).resize(400, 600, { fit: "fill" }).ensureAlpha().raw().toBuffer();
  descriptorRecords.push(makeDescriptorRecord(cv, row.cardId, pixels));
  if ((index + 1) % 250 === 0) process.stdout.write(`Indexed ${index + 1}/${rows.length}\n`);
}

const collections = [...new Set(cards.map((card) => card.collection))];
const members = [...new Set(cards.map((card) => card.member))];
const descriptorHeader = Buffer.alloc(12);
descriptorHeader.write("PCIX", 0, 4, "ascii");
descriptorHeader.writeUInt32LE(INDEX_VERSION, 4);
descriptorHeader.writeUInt32LE(descriptorRecords.length, 8);
await writeFile(descriptorIndexPath, Buffer.concat([descriptorHeader, ...descriptorRecords]));
await writeFile(outputPath, `${JSON.stringify({
  cards, collections, members, features,
  descriptorIndex: { url: "/rescene-recognition-index.bin", version: INDEX_VERSION, descriptorSize: DESCRIPTOR_BYTES },
})}\n`, "utf8");
process.stdout.write(`Generated ${cards.length} cards at ${path.relative(projectRoot, outputPath)}\n`);
process.stdout.write(`Generated ${descriptorRecords.length} descriptor records at ${path.relative(projectRoot, descriptorIndexPath)}\n`);
