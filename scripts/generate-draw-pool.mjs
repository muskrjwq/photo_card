import { readFile, writeFile } from 'node:fs/promises';
const catalog = JSON.parse(await readFile(new URL('../modules/catalog/rescene-catalog.generated.json', import.meta.url), 'utf8'));
const cards = Array.isArray(catalog) ? catalog : catalog.cards;
if (!Array.isArray(cards)) throw new Error('Unknown catalog format');
const ids = [...new Set(cards.filter(c => !c.sensitive).map(c => c.id))];
if (!ids.length || ids.some(id => !/^[a-f0-9]+$/i.test(id))) throw new Error('Invalid pool IDs');
await writeFile(new URL('../supabase/migrations/202611150002_draw_pool.sql', import.meta.url), `begin;\ndelete from public.draw_pool;\ninsert into public.draw_pool(card_id) values\n${ids.map(id => `('${id}')`).join(',\n')};\ncommit;\n`);
console.log(`Generated draw pool: ${ids.length} cards`);
