import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const dataDirectory = path.join(projectRoot, "data", "rescene");
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

const csvNames = (await readdir(dataDirectory)).filter((name) => name.toLowerCase().endsWith(".csv")).sort();
const rows = (await Promise.all(csvNames.map(async (name) => parseCsv(await readFile(path.join(dataDirectory, name), "utf8"))))).flat();
const imageNames = (await readdir(imageDirectory, { recursive: true })).filter((name) => /\.(png|jpe?g|webp)$/i.test(name));
const imageById = new Map();
for (const name of imageNames) {
  const id = path.parse(name).name;
  if (imageById.has(id)) throw new Error(`Duplicate image ID: ${id}`);
  imageById.set(id, name.split(path.sep).join("/"));
}
const duplicateIds = rows.filter((row, index) => rows.findIndex((candidate) => candidate.cardId === row.cardId) !== index);
if (duplicateIds.length) throw new Error(`Duplicate cardId: ${duplicateIds[0].cardId}`);

const albumCategories = new Set(["Re:Scene", "Scenedrome", "Glow Up", "Dearest", "Lip Bomb - album photocards", "Pulse"]);
const collectionAliases = new Map([
  ["Lip Bomb - album photocards", "Lip Bomb"],
  ["Lip Bomb - benefits", "Lip Bomb"],
  ["펄스 럭키드로우", "Pulse"],
  ["fanclub", "팬클럽"],
  ["merch", "응원봉"],
  ["fancon - Project 326", "팬콘"],
  ["KCON Japan", "KCON-Japan"],
  ["Casa Verdi", "카사베르디"],
  ["나랑드 콜라보", "나랑드"],
  ["Dominos", "도미노스"],
  ["한스킨 콜라보", "한스킨"],
  ["Epais", "에이페"],
  ["HOLLYS", "할리스커피"],
  ["CU 405빵 콜라보 시즌1", "CU리센느빵 시즌1"],
  ["CU 405빵 콜라보 시즌2", "CU리센느빵 시즌2"],
  ["와키윌리 콜라보", "와키윌리"],
  ["MLB 콜라보", "MLB"],
  ["misc", "기타"],
]);
const collectionOrder = [
  "Re:Scene", "Scenedrome", "Glow Up", "Dearest", "Lip Bomb", "Pulse",
  "팬클럽", "응원봉", "팬콘", "KCON-Japan", "Pretty Girl", "카사베르디",
  "나랑드", "도미노스", "한스킨", "에이페", "할리스커피",
  "CU리센느빵 시즌1", "CU리센느빵 시즌2", "와키윌리", "MLB",
  "CU 덕연이 딸 도시락", "더현대 팝업 스토어", "기타",
];
const collectionRank = new Map(collectionOrder.map((collection, index) => [collection, index]));
const cards = [];
const missingImages = [];
for (let index = 0; index < rows.length; index += 1) {
  const row = rows[index]; const imageName = imageById.get(row.cardId);
  if (!imageName) { missingImages.push(row.cardId); continue; }
  const expectedPath = `/rescene_poca/${imageName}`; const collection = collectionAliases.get(row.category) ?? row.category;
  cards.push({
    id: row.cardId,
    code: row.cardId.toUpperCase(),
    member: row.memberName,
    kind: row.memberName === "유닛" ? "unit" : row.memberName === "단체" ? "group" : "member",
    name: row.name,
    collection,
    category: albumCategories.has(row.category) ? "album" : "event",
    source: row.category,
    image: expectedPath,
    owners: 0,
    tags: [row.memberName, row.category, row.name],
    memberIndex: Number(row.memberIndex),
    sourceOrder: Number(row.idNumber),
  });
}

if (missingImages.length) process.stderr.write(`Skipped ${missingImages.length} cards without images: ${missingImages.join(", ")}\n`);

cards.sort((a, b) => (collectionRank.get(a.collection) ?? Number.MAX_SAFE_INTEGER) - (collectionRank.get(b.collection) ?? Number.MAX_SAFE_INTEGER)
  || a.sourceOrder - b.sourceOrder || a.memberIndex - b.memberIndex || a.name.localeCompare(b.name));
cards.forEach((card, index) => { card.idNumber = index + 1; delete card.sourceOrder; });
const collections = [...new Set(cards.map((card) => card.collection))];
const members = [...new Set(cards.map((card) => card.member))];
await writeFile(outputPath, `${JSON.stringify({
  cards, collections, members,
})}\n`, "utf8");
process.stdout.write(`Generated ${cards.length} cards from ${csvNames.length} CSV files at ${path.relative(projectRoot, outputPath)}\n`);
