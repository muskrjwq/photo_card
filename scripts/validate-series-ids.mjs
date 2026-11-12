import { readFile } from "node:fs/promises";

const catalog = JSON.parse(await readFile("modules/catalog/rescene-catalog.generated.json", "utf8"));
const ids = [...new Set(catalog.cards.map((card) => card.idNumber))];
const pulseSeries = catalog.cards.filter((card) => card.collection === "Pulse" && card.name === "Standard version #1");
const pulseIds = [...new Set(pulseSeries.map((card) => card.idNumber))];
if (pulseSeries.length !== 5 || pulseIds.length !== 1) throw new Error(`Pulse series mismatch: ${pulseSeries.length} cards across ${pulseIds.length} IDs`);
if (pulseIds[0] !== 543) throw new Error(`Pulse series should continue at 543, received ${pulseIds[0]}`);
const lipTint = catalog.cards.filter((card) => card.collection === "Lip Bomb" && card.name === "tint version");
if (lipTint.length !== 10 || new Set(lipTint.map((card) => card.idNumber)).size !== 2) throw new Error("Lip Bomb row-aligned series were merged incorrectly");
const hyundai = catalog.cards.filter((card) => card.collection === "더현대 팝업 스토어");
if (hyundai.length !== 5 || new Set(hyundai.map((card) => card.idNumber)).size !== 1) throw new Error("Event member-name series normalization failed");
if (ids.some((id) => !Number.isInteger(id) || id < 1)) throw new Error("Every card must have a positive integer series ID");
process.stdout.write(`${JSON.stringify({ cards: catalog.cards.length, series: ids.length, min: Math.min(...ids), max: Math.max(...ids), pulseId: pulseIds[0], pulseMembers: pulseSeries.map((card) => card.member) })}\n`);
