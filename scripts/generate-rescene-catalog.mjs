import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

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

const csvText = await readFile(csvPath, "utf8");
const rows = parseCsv(csvText);
const imageNames = await readdir(imageDirectory);
const imageById = new Map(imageNames.map((name) => [path.parse(name).name, name]));
const duplicateIds = rows.filter((row, index) => rows.findIndex((candidate) => candidate.cardId === row.cardId) !== index);
if (duplicateIds.length) throw new Error(`Duplicate cardId: ${duplicateIds[0].cardId}`);

const albumCategories = new Set(["Re:Scene", "Glow Up", "Scenedrome", "Dearest"]);
const cards = [];
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
}

const collections = [...new Set(cards.map((card) => card.collection))];
const members = [...new Set(cards.map((card) => card.member))];
await writeFile(outputPath, `${JSON.stringify({
  cards, collections, members,
})}\n`, "utf8");
process.stdout.write(`Generated ${cards.length} cards at ${path.relative(projectRoot, outputPath)}\n`);
