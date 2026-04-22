#!/usr/bin/env node
// Universal translator for every Wix translation schema on the site.
//
// Strategy:
//   1. Scan every schema (discovered from EN content pagination).
//   2. For each (schema × locale), identify:
//        a. missing entries (EN exists, target doesn't) → bulk CREATE
//        b. field gaps (target entry exists but some fields lack textValue) → bulk UPDATE
//   3. Translations come from a merged dictionary (cinema + donations hand-crafted)
//      with OpenAI (gpt-4o-mini) fallback for anything else. Translations are
//      cached to ./scripts/.translation-cache.json so re-runs are cheap.
//   4. Untranslatable fields (IDs, slugs, dates, XML/HTML, empty) → EN verbatim.
//
// Auth: wix token -s <siteId> + wix-account-id header.
// OpenAI: reads OPENAI_API_KEY from env or .env.local.
//
// Usage:
//   node scripts/translate-all.mjs                   # all schemas
//   node scripts/translate-all.mjs <schemaId>        # single schema
//   LOCALES=he node scripts/translate-all.mjs        # one locale

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const LOCALES = (process.env.LOCALES ?? 'he,ja,ru').split(',').map(s => s.trim()).filter(Boolean);
const FILTER_SCHEMA = process.argv[2];
const CACHE_PATH = new URL('./.translation-cache.json', import.meta.url);

// ---------------------------------------------------------------------------
// Hand-crafted dictionary — parsed from the existing cinema + donations
// translators (they define `const T = { ... }`) so corrections there flow
// here automatically, without actually running those scripts.
// ---------------------------------------------------------------------------
const DICT = { ...parseDictFromSource('./translate-cinema.mjs'), ...parseDictFromSource('./translate-donations.mjs') };

function parseDictFromSource(file) {
	try {
		const src = readFileSync(new URL(file, import.meta.url), 'utf8');
		const start = src.indexOf('const T =');
		if (start === -1) return {};
		const openBrace = src.indexOf('({', start);
		if (openBrace === -1) return {};
		// Balanced-brace scan (respects string literals) to find matching close.
		let depth = 1, i = openBrace + 2;
		while (i < src.length && depth > 0) {
			const c = src[i];
			if (c === '{') depth++;
			else if (c === '}') depth--;
			else if (c === '"' || c === "'" || c === '`') {
				i++;
				while (i < src.length && src[i] !== c) { if (src[i] === '\\') i++; i++; }
			}
			i++;
		}
		const body = src.slice(openBrace + 2, i - 1);
		// eslint-disable-next-line no-new-func
		return new Function(`return ({${body}});`)();
	} catch {
		return {};
	}
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------
const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf8')) : {};
function saveCache() {
	writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n');
}
function cacheKey(locale, text) { return `${locale}::${text}`; }

// ---------------------------------------------------------------------------
// Wix plumbing
// ---------------------------------------------------------------------------
const siteId = JSON.parse(readFileSync(new URL('../wix.config.json', import.meta.url), 'utf8')).siteId;
const rawToken = execSync(`npx wix token -s ${siteId}`, { encoding: 'utf8' });
const token = rawToken.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '').split('\n').map(s => s.trim()).find(s => s.startsWith('OauthNG') || s.includes('.'));
if (!token) throw new Error('No token from wix CLI');
const accountId = decodeSiteOwnerId(token);

function decodeSiteOwnerId(tok) {
	const parts = tok.split('.');
	const payloadB64 = parts[3] ?? parts[1];
	const b64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/').padEnd(payloadB64.length + (4 - payloadB64.length % 4) % 4, '=');
	const outer = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
	const inner = typeof outer.data === 'string' ? JSON.parse(outer.data) : outer.data;
	return inner?.instance?.siteOwnerId ?? inner?.siteOwnerId;
}

async function wix(path, body) {
	const res = await fetch(`https://www.wixapis.com${path}`, {
		method: 'POST',
		headers: { Authorization: token, 'wix-site-id': siteId, 'wix-account-id': accountId, 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 500)}`);
	return res.json();
}

function log(msg) { process.stdout.write(msg + '\n'); }

async function fetchAll(locale, schemaId) {
	// The API ignores offset-based paging; must use cursor from pagingMetadata.cursors.next.
	const all = [];
	let cursor;
	process.stdout.write(`  fetch ${locale}${schemaId ? ' ' + schemaId.slice(0, 8) : ''}: `);
	for (let i = 0; i < 500; i++) {
		const query = cursor
			? { cursorPaging: { limit: 100, cursor } }
			: { filter: { locale, ...(schemaId ? { schemaId } : {}) }, cursorPaging: { limit: 100 } };
		const res = await wix('/translation-content/v1/contents/query', { query });
		const items = res.contents ?? [];
		all.push(...items);
		process.stdout.write(`${all.length}..`);
		const next = res.pagingMetadata?.cursors?.next;
		if (!next || !res.pagingMetadata?.hasNext) break;
		cursor = next;
	}
	process.stdout.write('\n');
	return all;
}

// ---------------------------------------------------------------------------
// Translation policy
// ---------------------------------------------------------------------------
function isTranslatable(text) {
	if (typeof text !== 'string' || !text) return false;
	// XML / HTML blob — skip (e.g. menus XML)
	if (/^<\?xml|^<[a-zA-Z][^>]*>/.test(text)) return false;
	// UUIDs and id-looking strings — copy verbatim
	if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return false;
	// ISO date
	if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/.test(text)) return false;
	// Only-numeric / only-punct
	if (/^[\d.,\s%$€₪+-]+$/.test(text)) return false;
	// Dotted key-like strings used in Wix settings ("settings.offlineTitleOptionDefault")
	if (/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/.test(text)) return false;
	return true;
}

// ---------------------------------------------------------------------------
// OpenAI batch translator
// ---------------------------------------------------------------------------
if (!process.env.OPENAI_API_KEY) {
	try {
		const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
		const m = env.match(/^OPENAI_API_KEY=(?:"([^"\n]+)"|([^\n]+))$/m);
		const val = m?.[1] ?? m?.[2];
		if (val) process.env.OPENAI_API_KEY = val.trim();
	} catch {}
}

async function openaiTranslate(texts, locale) {
	if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required for LLM fallback');
	const languageName = { he: 'Hebrew', ja: 'Japanese', ru: 'Russian' }[locale];
	const system = `You translate short UI and content strings for a Wix site called "Cats in Space" — a fictional cat space-colony theme. The site uses playful cat-space-themed names and phrases (e.g. "Star Paws", "Nebula Nachos", "Whisker Navigation"). Preserve playful tone. Keep proper nouns recognisable where possible. Never return explanations, markdown, or the original string. Return only the translation. For each input produce a ${languageName} translation. Preserve any \\n newlines and punctuation.`;
	const numbered = texts.map((t, i) => `[${i + 1}] ${t}`).join('\n\n===\n\n');
	const user = `Translate each of the following to ${languageName}. Return them in the same numbered format, one per line starting with [N]. Strings:\n\n${numbered}`;
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), 60000); // 60s per batch
	try {
		const res = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
			body: JSON.stringify({
				model: 'gpt-4o-mini',
				messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
				temperature: 0.2,
			}),
			signal: ctrl.signal,
		});
		if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`);
		const json = await res.json();
		const content = json.choices?.[0]?.message?.content ?? '';
		const results = new Array(texts.length).fill(null);
		const lines = content.split(/\n(?=\[\d+\])/);
		for (const line of lines) {
			const m = line.match(/^\[(\d+)\]\s*([\s\S]*)$/);
			if (!m) continue;
			const idx = parseInt(m[1], 10) - 1;
			if (idx >= 0 && idx < texts.length) results[idx] = m[2].trim();
		}
		return results;
	} finally {
		clearTimeout(timer);
	}
}

async function translateBatch(texts, locale) {
	// Use cache + dict first
	const out = new Array(texts.length);
	const misses = [];
	const missIndex = [];
	for (let i = 0; i < texts.length; i++) {
		const t = texts[i];
		const dictEntry = DICT[t]?.[locale];
		if (dictEntry) { out[i] = dictEntry; continue; }
		const cached = cache[cacheKey(locale, t)];
		if (cached) { out[i] = cached; continue; }
		misses.push(t);
		missIndex.push(i);
	}
	if (misses.length > 0) {
		// batch in chunks of 20
		for (let i = 0; i < misses.length; i += 20) {
			const chunk = misses.slice(i, i + 20);
			const chunkIdx = missIndex.slice(i, i + 20);
			try {
				const translated = await openaiTranslate(chunk, locale);
				for (let j = 0; j < chunk.length; j++) {
					const v = translated[j] ?? chunk[j];
					out[chunkIdx[j]] = v;
					cache[cacheKey(locale, chunk[j])] = v;
				}
			} catch (e) {
				log(`    openai error: ${e.message} — falling back to EN verbatim`);
				for (let j = 0; j < chunk.length; j++) {
					out[chunkIdx[j]] = chunk[j];
				}
			}
		}
		saveCache();
	}
	return out;
}

// ---------------------------------------------------------------------------
// Per-schema translation
// ---------------------------------------------------------------------------
async function translateSchema(schemaId, enEntries) {
	log(`\n═══ ${schemaId} — ${enEntries.length} EN entries`);
	for (const locale of LOCALES) {
		log(`\n  -- ${locale} --`);
		const existing = await fetchAll(locale, schemaId);
		const existingById = new Map(existing.map(e => [e.entityId, e]));

		const toCreate = [];
		const toUpdate = [];
		// First pass: find entries that need work (missing target OR missing fields).
		// Only collect strings for those — no point calling OpenAI on entries already full.
		const textsNeeded = new Set();
		const workItems = []; // { en, target | null }
		for (const en of enEntries) {
			const target = existingById.get(en.entityId);
			if (!target) {
				workItems.push({ en, target: null });
				for (const v of Object.values(en.fields ?? {})) {
					if (isTranslatable(v.textValue)) textsNeeded.add(v.textValue);
				}
				continue;
			}
			// Check for missing fields
			let hasGap = false;
			for (const [k, v] of Object.entries(en.fields ?? {})) {
				if (typeof v.textValue !== 'string' || !v.textValue) continue;
				const tv = target.fields?.[k]?.textValue;
				if (typeof tv !== 'string' || !tv) {
					hasGap = true;
					if (isTranslatable(v.textValue)) textsNeeded.add(v.textValue);
				}
			}
			if (hasGap) workItems.push({ en, target });
		}
		if (workItems.length === 0) { log(`  nothing to do`); continue; }
		const textList = [...textsNeeded];
		log(`  ${workItems.length} entries need work, ${textList.length} distinct strings to translate`);
		const resolved = textList.length > 0 ? await translateBatch(textList, locale) : [];
		const translation = new Map();
		for (let i = 0; i < textList.length; i++) translation.set(textList[i], resolved[i]);

		// Build create/update lists (only for the entries we flagged as needing work)
		for (const { en, target } of workItems) {
			if (!target) {
				// Create
				const fields = {};
				for (const [k, v] of Object.entries(en.fields ?? {})) {
					const src = v.textValue;
					if (typeof src !== 'string' || !src) continue;
					const mapped = isTranslatable(src) ? (translation.get(src) ?? src) : src;
					fields[k] = { textValue: mapped, published: true, updatedBy: 'USER' };
				}
				if (Object.keys(fields).length === 0) continue; // nothing to translate
				toCreate.push({
					schemaId,
					entityId: en.entityId,
					locale,
					fields,
					...(en.parentEntityId ? { parentEntityId: en.parentEntityId } : {}),
				});
			} else {
				// Update — fill field gaps only
				const fields = {};
				for (const [k, v] of Object.entries(en.fields ?? {})) {
					const src = v.textValue;
					if (typeof src !== 'string' || !src) continue;
					const tv = target.fields?.[k]?.textValue;
					if (typeof tv === 'string' && tv) continue; // already filled
					const mapped = isTranslatable(src) ? (translation.get(src) ?? src) : src;
					fields[k] = { textValue: mapped, published: true, updatedBy: 'USER' };
				}
				if (Object.keys(fields).length > 0) {
					toUpdate.push({
						content: {
							id: target.id,
							schemaId,
							entityId: en.entityId,
							locale,
							fields,
							...(target.parentEntityId ? { parentEntityId: target.parentEntityId } : {}),
						},
					});
				}
			}
		}
		log(`  plan: create=${toCreate.length} update=${toUpdate.length}`);
		let created = 0;
		for (let i = 0; i < toCreate.length; i += 10) {
			const chunk = toCreate.slice(i, i + 10);
			await wix('/translation-content/v1/bulk/contents/create', { contents: chunk, returnEntity: false });
			created += chunk.length;
			log(`  bulk-create ${created}/${toCreate.length}`);
		}
		let updated = 0;
		for (let i = 0; i < toUpdate.length; i += 10) {
			const chunk = toUpdate.slice(i, i + 10);
			await wix('/translation-content/v1/bulk/contents/update', { contents: chunk, returnEntity: false });
			updated += chunk.length;
			log(`  bulk-update ${updated}/${toUpdate.length}`);
		}
	}
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
	log(`site=${siteId} account=${accountId}`);
	log(`locales=${LOCALES.join(',')}`);
	log(`dict entries: ${Object.keys(DICT).length}`);
	log('fetching EN content for all schemas...');
	const t0 = Date.now();
	const allEn = await fetchAll('en', FILTER_SCHEMA);
	log(`  ${allEn.length} EN entries in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
	const bySchema = {};
	for (const c of allEn) {
		if (!bySchema[c.schemaId]) bySchema[c.schemaId] = [];
		bySchema[c.schemaId].push(c);
	}
	log(`schemas: ${Object.keys(bySchema).length}`);

	const order = Object.keys(bySchema).sort((a, b) => bySchema[a].length - bySchema[b].length);
	for (const schemaId of order) {
		try {
			await translateSchema(schemaId, bySchema[schemaId]);
		} catch (e) {
			log(`ERROR on schema ${schemaId}: ${e.message}`);
		}
	}
	log('\n✅ done');
}

main().catch(err => { log('FATAL: ' + err.message); process.exit(1); });
