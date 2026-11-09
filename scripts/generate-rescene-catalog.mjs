import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const projectRoot = process.cwd();
const csvPath = path.join(projectRoot, "data", "rescene", "rescene_photocards.csv");
const imageDirectory = path.join(projectRoot, "public", "rescene_poca");
const outputPath = path.join(projectRoot, "modules", "catalog", "rescene-catalog.generated.json");

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

const csvText = await readFile(csvPath, "utf8");
const rows = parseCsv(csvText);
const imageNames = await readdir(imageDirectory);
const imageById = new Map(imageNames.map((name) => [path.parse(name).name, name]));
const duplicateIds = rows.filter((row, index) => rows.findIndex((candidate) => candidate.cardId === row.cardId) !== index);
if (duplicateIds.length) throw new Error(`Duplicate cardId: ${duplicateIds[0].cardId}`);

const albumCategories = new Set(["Re:Scene", "Glow Up", "Scenedrome", "Dearest"]);
const cards = [];
const features = {};
for (let index = 0; index < rows.length; index += 1) {
  const row = rows[index]; const imageName = imageById.get(row.cardId);
  if (!imageName) throw new Error(`Missing image for ${row.cardId}`);
  const expectedPath = `/rescene_poca/${imageName}`;
  if (row.localPath !== expectedPath) throw new Error(`Invalid localPath for ${row.cardId}: ${row.localPath}`);
  cards.push({
    id: row.cardId,
    code: row.cardId.toUpperCase(),
    member: row.memberName,
    kind: "member",
    name: row.name,
    collection: row.category,
    category: albumCategories.has(row.category) ? "album" : "event",
    source: `${row.memberName} #${row.idNumber}`,
    image: row.localPath,
    owners: 0,
    tags: [row.memberName, row.category, row.name],
    memberIndex: Number(row.memberIndex),
    idNumber: Number(row.idNumber),
  });
  features[row.cardId] = await makeFeatures(path.join(imageDirectory, imageName));
  if ((index + 1) % 250 === 0) process.stdout.write(`Indexed ${index + 1}/${rows.length}\n`);
}

const collections = [...new Set(cards.map((card) => card.collection))];
const members = [...new Set(cards.map((card) => card.member))];
await writeFile(outputPath, `${JSON.stringify({ cards, collections, members, features })}\n`, "utf8");
process.stdout.write(`Generated ${cards.length} cards at ${path.relative(projectRoot, outputPath)}\n`);
