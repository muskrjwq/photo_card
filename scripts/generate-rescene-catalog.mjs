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

const csvPriority = [
  "rescene_photocards.csv",
  "01 Woni_photocards.csv", "02 Liv_photocards.csv", "03 Minami_photocards.csv",
  "04 May_photocards.csv", "05 Zena_photocards.csv",
  "pulse_all.csv", "event_photocards.csv",
];
const lipBombFiles = new Set(csvPriority.slice(1, 6));
const memberAliases = new Map([
  ["원이", ["원이"]], ["리브", ["리브"]], ["미나미", ["미나미"]],
  ["메이", ["메이", "메갓"]], ["제나", ["제나"]],
]);
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function normalizedSeriesName(name, memberName) {
  let normalized = name.normalize("NFKC").toLocaleLowerCase().trim();
  for (const alias of memberAliases.get(memberName) ?? []) normalized = normalized.replace(new RegExp(`${escapeRegex(alias)}(?:의)?`, "g"), " ");
  const tokens = normalized.replace(/[^0-9a-z가-힣]+/g, " ").split(/\s+/).filter(Boolean)
    .map((token) => token === "모여" ? "모여라" : token).sort((a, b) => a.localeCompare(b, "ko"));
  return tokens.join(" ") || name.normalize("NFKC").toLocaleLowerCase().trim();
}
function seriesKey(row) {
  const name = row.sourceFile === "pulse_all.csv" ? row.name.normalize("NFKC").toLocaleLowerCase().trim() : normalizedSeriesName(row.name, row.memberName);
  return `${row.category.normalize("NFKC").trim()}\u0000${name}`;
}

const csvNames = (await readdir(dataDirectory)).filter((name) => name.toLowerCase().endsWith(".csv")).sort((a, b) => {
  const aRank = csvPriority.indexOf(a); const bRank = csvPriority.indexOf(b);
  return (aRank < 0 ? Number.MAX_SAFE_INTEGER : aRank) - (bRank < 0 ? Number.MAX_SAFE_INTEGER : bRank) || a.localeCompare(b);
});
const rows = (await Promise.all(csvNames.map(async (fileName) => parseCsv(await readFile(path.join(dataDirectory, fileName), "utf8")).map((row, sourceRowIndex) => ({ ...row, sourceFile: fileName, sourceRowIndex }))))).flat();
const baseRows = rows.filter((row) => row.sourceFile === "rescene_photocards.csv");
const baseMax = Math.max(...baseRows.map((row) => Number(row.idNumber)).filter(Number.isFinite));
const lipBombSeriesCount = Math.max(...[...lipBombFiles].map((fileName) => rows.filter((row) => row.sourceFile === fileName).length));
let nextSeriesId = baseMax + lipBombSeriesCount + 1;
const continuingSeries = new Map();
for (const row of rows) {
  if (row.sourceFile === "rescene_photocards.csv") continue;
  if (lipBombFiles.has(row.sourceFile)) { row.idNumber = String(baseMax + row.sourceRowIndex + 1); continue; }
  const key = seriesKey(row);
  if (!continuingSeries.has(key)) { continuingSeries.set(key, nextSeriesId); nextSeriesId += 1; }
  row.idNumber = String(continuingSeries.get(key));
}
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
  "CU 덕연이 딸 도시락", "기타",
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
    category: row.catalogType === "album" || row.catalogType === "event" ? row.catalogType : albumCategories.has(row.category) ? "album" : "event",
    source: row.category,
    image: expectedPath,
    owners: 0,
    tags: [row.memberName, row.category, row.name],
    memberIndex: Number(row.memberIndex),
    idNumber: Number(row.idNumber),
  });
}

if (missingImages.length) process.stderr.write(`Skipped ${missingImages.length} cards without images: ${missingImages.join(", ")}\n`);

cards.sort((a, b) => (collectionRank.get(a.collection) ?? Number.MAX_SAFE_INTEGER) - (collectionRank.get(b.collection) ?? Number.MAX_SAFE_INTEGER)
  || a.idNumber - b.idNumber || a.memberIndex - b.memberIndex || a.name.localeCompare(b.name));
const collections = [...new Set(cards.map((card) => card.collection))];
const members = [...new Set(cards.map((card) => card.member))];
await writeFile(outputPath, `${JSON.stringify({
  cards, collections, members,
})}\n`, "utf8");
process.stdout.write(`Generated ${cards.length} cards from ${csvNames.length} CSV files at ${path.relative(projectRoot, outputPath)}\n`);
