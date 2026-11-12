import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
for (const name of [".env.local", ".env"]) {
  const file = path.join(projectRoot, name);
  if (existsSync(file)) process.loadEnvFile(file);
}
const dataDirectory = path.join(projectRoot, "data", "rescene");
const imageDirectory = path.join(projectRoot, "public", "rescene_poca");
const localCsvName = "local_photocards.csv";
const editorPort = 4317;
const memberIndexes = new Map([["원이", 0], ["리브", 1], ["미나미", 2], ["메이", 3], ["제나", 4], ["단체", 5], ["유닛", 5]]);
const albumCategories = new Set(["Re:Scene", "Scenedrome", "Glow Up", "Dearest", "Lip Bomb - album photocards", "Pulse"]);
const collectionAliases = new Map([
  ["Lip Bomb - album photocards", "Lip Bomb"], ["Lip Bomb - benefits", "Lip Bomb"],
  ["펄스 앨범포토카드", "Pulse"], ["fanclub", "팬클럽"], ["merch", "응원봉"],
  ["fancon - Project 326", "팬콘"], ["KCON Japan", "KCON-Japan"], ["Casa Verdi", "카사베르디"],
  ["나랑드 콜라보", "나랑드"], ["Dominos", "도미노스"], ["한스킨 콜라보", "한스킨"],
  ["Epais", "에이페"], ["HOLLYS", "할리스커피"], ["CU 405빵 콜라보 시즌1", "CU리센느빵 시즌1"],
  ["CU 405빵 콜라보 시즌2", "CU리센느빵 시즌2"], ["와키윌리 콜라보", "와키윌리"],
  ["MLB 콜라보", "MLB"], ["misc", "기타"],
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

function encodeCsv(headers, rows) {
  const encode = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return `\uFEFF${headers.map(encode).join(",")}\n${rows.map((row) => headers.map((header) => encode(row[header])).join(",")).join("\n")}\n`;
}

function displayCollection(category) { return collectionAliases.get(category) ?? category; }
function cardType(row) { return row.catalogType === "album" || row.catalogType === "event" ? row.catalogType : albumCategories.has(row.category) ? "album" : "event"; }
function normalized(value) { return value.normalize("NFKC").trim().toLocaleLowerCase(); }

async function loadCsvFiles() {
  const names = (await readdir(dataDirectory)).filter((name) => name.toLocaleLowerCase().endsWith(".csv"));
  return Promise.all(names.map(async (name) => {
    const text = await readFile(path.join(dataDirectory, name), "utf8");
    return { name, ...parseCsv(text) };
  }));
}

async function verifyAdmin(request) {
  const token = request.headers.authorization?.startsWith("Bearer ") ? request.headers.authorization.slice(7) : null;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const adminEmail = process.env.ADMIN_EMAIL?.toLocaleLowerCase();
  if (!token || !supabaseUrl || !anonKey || !adminEmail) return false;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } });
  if (!response.ok) return false;
  const user = await response.json();
  return user.email?.toLocaleLowerCase() === adminEmail;
}

async function readJson(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 25 * 1024 * 1024) throw new Error("image_too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function findImage(cardId) {
  const names = (await readdir(imageDirectory, { recursive: true })).filter((name) => path.parse(name).name.toLocaleLowerCase() === cardId.toLocaleLowerCase());
  if (names.length > 1) throw new Error(`duplicate_image:${cardId}`);
  return names[0] ? path.join(imageDirectory, names[0]) : null;
}

async function saveImage(cardId, imageBase64) {
  const match = /^data:image\/(?:png|jpe?g|webp);base64,(.+)$/i.exec(imageBase64 ?? "");
  if (!match) throw new Error("invalid_image");
  const buffer = Buffer.from(match[1], "base64");
  if (!buffer.length || buffer.length > 15 * 1024 * 1024) throw new Error("invalid_image_size");
  const existing = await findImage(cardId);
  const outputDirectory = existing ? path.dirname(existing) : path.join(imageDirectory, "local");
  const outputPath = path.join(outputDirectory, `${cardId}.webp`);
  const temporaryPath = `${outputPath}.tmp.webp`;
  await mkdir(outputDirectory, { recursive: true });
  await sharp(buffer).rotate().resize({ width: 1200, height: 1800, fit: "inside", withoutEnlargement: true }).webp({ quality: 86, effort: 5 }).toFile(temporaryPath);
  await rename(temporaryPath, outputPath);
  if (existing && path.resolve(existing) !== path.resolve(outputPath)) await unlink(existing);
  return `/${path.relative(path.join(projectRoot, "public"), outputPath).split(path.sep).join("/")}`;
}

async function saveCard(payload) {
  const mode = payload.mode === "edit" ? "edit" : "create";
  const type = payload.type === "album" ? "album" : "event";
  const collection = String(payload.collection ?? "").trim();
  const member = String(payload.member ?? "").trim();
  const name = String(payload.name ?? "").trim();
  if (!collection || !memberIndexes.has(member) || !name) throw new Error("invalid_fields");

  const files = await loadCsvFiles();
  const entries = files.flatMap((file) => file.rows.map((row) => ({ file, row })));
  const target = mode === "edit" ? entries.find((entry) => entry.row.cardId === payload.cardId) : null;
  if (mode === "edit" && !target) throw new Error("card_not_found");
  const sameSeries = entries.find((entry) => entry.row.cardId !== payload.cardId && cardType(entry.row) === type && displayCollection(entry.row.category) === collection && normalized(entry.row.name) === normalized(name));
  const maxSeriesId = Math.max(0, ...entries.map((entry) => Number(entry.row.idNumber)).filter(Number.isFinite));
  const originalSeriesUnchanged = target && cardType(target.row) === type && displayCollection(target.row.category) === collection && normalized(target.row.name) === normalized(name);
  const idNumber = sameSeries?.row.idNumber ?? (originalSeriesUnchanged ? target.row.idNumber : String(maxSeriesId + 1));
  const rawCategory = originalSeriesUnchanged ? target.row.category : (sameSeries?.row.category ?? collection);
  const cardId = target?.row.cardId ?? randomBytes(6).toString("hex");
  if (!target && !payload.imageBase64) throw new Error("image_required");

  let localPath = target?.row.localPath ?? "";
  if (payload.imageBase64) localPath = await saveImage(cardId, payload.imageBase64);

  const row = target?.row ?? {};
  Object.assign(row, { cardId, memberIndex: String(memberIndexes.get(member)), memberName: member, idNumber: String(idNumber), category: rawCategory, name, localPath, catalogType: type });
  let destination = target?.file;
  if (!destination) {
    destination = files.find((file) => file.name === localCsvName);
    if (!destination) {
      destination = { name: localCsvName, headers: ["cardId", "memberIndex", "memberName", "idNumber", "category", "name", "localPath", "catalogType"], rows: [] };
      files.push(destination);
    }
    destination.rows.push(row);
  }
  if (!destination.headers.includes("catalogType")) destination.headers.push("catalogType");
  await writeFile(path.join(dataDirectory, destination.name), encodeCsv(destination.headers, destination.rows), "utf8");
  await execFileAsync(process.execPath, [path.join(projectRoot, "scripts", "generate-rescene-catalog.mjs")], { cwd: projectRoot, maxBuffer: 1024 * 1024 * 10 });
  return { cardId, idNumber: Number(idNumber), sameSeries: Boolean(sameSeries), recognitionIndexPending: Boolean(payload.imageBase64) };
}

function isAllowedOrigin(origin) { return /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin ?? ""); }
function send(response, status, body, origin) {
  if (isAllowedOrigin(origin)) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.writeHead(status);
  response.end(JSON.stringify(body));
}

http.createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (!isAllowedOrigin(origin)) return send(response, 403, { error: "local_origin_required" }, origin);
  if (request.method === "OPTIONS") {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.writeHead(204); response.end(); return;
  }
  if (request.method !== "POST" || request.url !== "/cards") return send(response, 404, { error: "not_found" }, origin);
  try {
    if (!await verifyAdmin(request)) return send(response, 401, { error: "admin_required" }, origin);
    const result = await saveCard(await readJson(request));
    return send(response, 200, result, origin);
  } catch (error) {
    console.error("[local catalog]", error);
    return send(response, 400, { error: error instanceof Error ? error.message : "save_failed" }, origin);
  }
}).listen(editorPort, "127.0.0.1", () => {
  console.log(`Local catalog editor: http://127.0.0.1:${editorPort}`);
});

