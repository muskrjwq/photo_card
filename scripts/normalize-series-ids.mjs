import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const dataDirectory = path.join(process.cwd(), "data", "rescene");
const baseFileName = "rescene_photocards.csv";
const preferredOrder = [
  "01 Woni_photocards.csv",
  "02 Liv_photocards.csv",
  "03 Minami_photocards.csv",
  "04 May_photocards.csv",
  "05 Zena_photocards.csv",
  "pulse_all.csv",
  "event_photocards.csv",
];
const lipBombFiles = new Set(preferredOrder.slice(0, 5));
const fullyQuotedFiles = new Set(["event_photocards.csv"]);
const memberAliases = new Map([
  ["원이", ["원이"]],
  ["리브", ["리브"]],
  ["미나미", ["미나미"]],
  ["메이", ["메이", "메갓"]],
  ["제나", ["제나"]],
]);

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
  return { headers, rows: rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]))) };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function seriesName(name, memberName) {
  let normalized = name.normalize("NFKC").toLocaleLowerCase().trim();
  for (const alias of memberAliases.get(memberName) ?? []) {
    normalized = normalized.replace(new RegExp(`${escapeRegex(alias)}(?:의)?`, "g"), " ");
  }
  const tokens = normalized
    .replace(/[^0-9a-z가-힣]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token === "모여" ? "모여라" : token)
    .sort((a, b) => a.localeCompare(b, "ko"));
  return tokens.join(" ") || name.normalize("NFKC").toLocaleLowerCase().trim();
}

function seriesKey(row, fileName) {
  const name = fileName === "pulse_all.csv" ? row.name.normalize("NFKC").toLocaleLowerCase().trim() : seriesName(row.name, row.memberName);
  return `${row.category.normalize("NFKC").trim()}\u0000${name}`;
}

function encodeCsv(headers, rows, quoteAll) {
  const encode = (value) => {
    const text = String(value ?? "");
    return quoteAll || /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return `\uFEFF${headers.map(encode).join(",")}\n${rows.map((row) => headers.map((header) => encode(row[header])).join(",")).join("\n")}\n`;
}

const availableFiles = (await readdir(dataDirectory)).filter((name) => name.toLowerCase().endsWith(".csv"));
const base = parseCsv(await readFile(path.join(dataDirectory, baseFileName), "utf8"));
const baseMax = Math.max(...base.rows.map((row) => Number(row.idNumber)).filter(Number.isFinite));
const parsedFiles = new Map(await Promise.all(availableFiles.filter((name) => name !== baseFileName).map(async (fileName) => [fileName, parseCsv(await readFile(path.join(dataDirectory, fileName), "utf8"))])));
const lipBombSeriesCount = Math.max(...[...lipBombFiles].map((fileName) => parsedFiles.get(fileName)?.rows.length ?? 0));
let nextId = baseMax + lipBombSeriesCount + 1;
const seriesIds = new Map();
const orderedFiles = [
  ...preferredOrder.filter((name) => availableFiles.includes(name)),
  ...availableFiles.filter((name) => name !== baseFileName && !preferredOrder.includes(name)).sort(),
];

let updatedCards = 0;
for (const fileName of orderedFiles) {
  const filePath = path.join(dataDirectory, fileName);
  const parsed = parsedFiles.get(fileName);
  for (let rowIndex = 0; rowIndex < parsed.rows.length; rowIndex += 1) {
    const row = parsed.rows[rowIndex];
    if (lipBombFiles.has(fileName)) row.idNumber = String(baseMax + rowIndex + 1);
    else {
      const key = seriesKey(row, fileName);
      if (!seriesIds.has(key)) { seriesIds.set(key, nextId); nextId += 1; }
      row.idNumber = String(seriesIds.get(key));
    }
    updatedCards += 1;
  }
  await writeFile(filePath, encodeCsv(parsed.headers, parsed.rows, fullyQuotedFiles.has(fileName)), "utf8");
}

process.stdout.write(`Preserved ${base.rows.length} base cards through series ${baseMax}; normalized ${updatedCards} cards into ${lipBombSeriesCount + seriesIds.size} continuing series (${baseMax + 1}-${nextId - 1}).\n`);
