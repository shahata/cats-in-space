#!/usr/bin/env node
// Audits translation coverage across every schema on the site.
// For each schema × locale, reports:
//   - EN entries total
//   - target entries total
//   - missing entries (EN entity with no target entry)
//   - field gaps (target entry exists but some fields have no textValue)
//   - EN-equal fields (target textValue === EN textValue — not translated, just copied)
//
// Usage: node scripts/audit-translations.mjs [schemaId]
//        (optional filter — audits one schema)

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const LOCALES = ['he', 'ja', 'ru'];
const filterSchemaId = process.argv[2];

const siteId = JSON.parse(readFileSync(new URL('../wix.config.json', import.meta.url), 'utf8')).siteId;
const rawToken = execSync(`npx wix token -s ${siteId}`, { encoding: 'utf8' });
const token = rawToken.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '').split('\n').map(s => s.trim()).find(s => s.startsWith('OauthNG') || s.includes('.'));
const parts = token.split('.');
const payloadB64 = parts[3] ?? parts[1];
const b64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/').padEnd(payloadB64.length + (4 - payloadB64.length % 4) % 4, '=');
const outer = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
const inner = typeof outer.data === 'string' ? JSON.parse(outer.data) : outer.data;
const accountId = inner?.instance?.siteOwnerId ?? inner?.siteOwnerId;

async function wix(path, body) {
	const res = await fetch(`https://www.wixapis.com${path}`, {
		method: 'POST',
		headers: { 'Authorization': token, 'wix-site-id': siteId, 'wix-account-id': accountId, 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
	return res.json();
}

function log(msg) {
	process.stdout.write(msg + '\n');
}

async function fetchAll(locale, schemaId) {
	const all = [];
	let offset = 0;
	while (true) {
		const res = await wix('/translation-content/v1/contents/query', {
			query: { filter: { locale, ...(schemaId ? { schemaId } : {}) }, paging: { limit: 100, offset } },
		});
		const items = res.contents ?? [];
		all.push(...items);
		if (items.length < 100) break;
		offset += 100;
		if (offset > 20000) break;
	}
	return all;
}

log(`site=${siteId} account=${accountId}`);
log('fetching all EN content...');
const t0 = Date.now();
const allEn = await fetchAll('en');
log(`  ${allEn.length} EN entries in ${((Date.now()-t0)/1000).toFixed(1)}s`);
const bySchema = {};
for (const c of allEn) {
	if (!bySchema[c.schemaId]) bySchema[c.schemaId] = [];
	bySchema[c.schemaId].push(c);
}

const schemas = filterSchemaId ? [filterSchemaId] : Object.keys(bySchema);

log(`schemas found: ${Object.keys(bySchema).length}`);

for (const schemaId of schemas) {
	const enEntries = bySchema[schemaId] ?? [];
	const enById = new Map(enEntries.map(e => [e.entityId, e]));
	const sample = enEntries[0];
	const sampleText = sample ? Object.values(sample.fields ?? {}).map(f => f.textValue).filter(Boolean)[0] : '';
	log(`\n═══ ${schemaId} — ${enEntries.length} EN entries (sample: ${JSON.stringify(sampleText).slice(0, 60)})`);
	for (const locale of LOCALES) {
		const tgt = await fetchAll(locale, schemaId);
		const tgtById = new Map(tgt.map(t => [t.entityId, t]));
		let missingEntries = 0, fieldGaps = 0, enEqual = 0, totalFields = 0;
		for (const en of enEntries) {
			const t = tgtById.get(en.entityId);
			if (!t) { missingEntries += 1; continue; }
			for (const [k, ev] of Object.entries(en.fields ?? {})) {
				if (typeof ev.textValue !== 'string' || !ev.textValue) continue;
				totalFields += 1;
				const tv = t.fields?.[k]?.textValue;
				if (typeof tv !== 'string' || !tv) fieldGaps += 1;
				else if (tv === ev.textValue) enEqual += 1;
			}
		}
		const status = missingEntries + fieldGaps > 0 ? '❌' : '✓';
		log(`  ${status} ${locale}: ${tgt.length}/${enEntries.length} entries, ${totalFields - fieldGaps - enEqual}/${totalFields} fields translated, ${missingEntries} missing entries, ${fieldGaps} field gaps, ${enEqual} EN-equal (untranslated)`);
	}
}
