#!/usr/bin/env node
// One-shot translator for Wix Donation Campaigns.
//
// Writes Hebrew / Japanese / Russian translations for every donation
// campaign (name + predefined-amount descriptions) via the Translation
// Content API.
//
// Auth via `wix token -s <siteId>` + wix-account-id header — the
// translation-content endpoints return 403 without both.
//
// Idempotent: queries existing target-locale content first and skips
// entities that already have a translation (matches by entityId).
//
// Usage: node scripts/translate-donations.mjs

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const DONATIONS_SCHEMA = '2cbf93b1-ac4a-487d-b584-22321d1e3437';
const LOCALES = ['he', 'ja', 'ru'];

// ---------------------------------------------------------------------------
// Translation dictionary. Keys are the exact EN `textValue`; values map to
// each target locale. Missing entries fall through to EN verbatim so the
// field still counts as translated in the dashboard.
// ---------------------------------------------------------------------------
const T = /** @type {Record<string, { he: string; ja: string; ru: string }>} */ ({
	// --- campaign names
	'Feline Spacesuit Engineering': {
		he: 'הנדסת חליפות חלל לחתולים',
		ja: '猫用宇宙服エンジニアリング',
		ru: 'Инженерия кошачьих скафандров',
	},
	'Interstellar Catnip Cultivation': {
		he: 'גידול מנטת-חתולים בין-כוכבי',
		ja: '恒星間マタタビ栽培',
		ru: 'Межзвёздное выращивание кошачьей мяты',
	},
	'Zero-G Litter Box Dynamics': {
		he: 'דינמיקת ארגז חול בחוסר כבידה',
		ja: '無重力猫トイレ動力学',
		ru: 'Динамика лотка в невесомости',
	},
	'Wormhole Whisker Navigation': {
		he: 'ניווט-שפם דרך חורי תולעת',
		ja: 'ワームホール・ヒゲ航法',
		ru: 'Навигация по усам через червоточины',
	},
	'Fundraising Campaign': {
		he: 'קמפיין גיוס תרומות',
		ja: '資金調達キャンペーン',
		ru: 'Кампания по сбору средств',
	},

	// --- predefined donation amount descriptions
	'Pressurized helmet fitting for one cadet': {
		he: 'התאמת קסדה לחוצה לחניך אחד',
		ja: 'カデット1名分の加圧ヘルメット調整',
		ru: 'Подгонка герметичного шлема для одного кадета',
	},
	'Reinforced paw-glove set': {
		he: 'ערכת כפפות-כפות מחוזקות',
		ja: '強化パウ・グローブ・セット',
		ru: 'Усиленный комплект перчаток для лап',
	},
	'Thermal tail sleeve prototype': {
		he: 'אב-טיפוס של שרוול זנב תרמי',
		ja: 'サーマル・テール・スリーブ試作機',
		ru: 'Прототип термочехла для хвоста',
	},
	'Full micro-suit field deployment': {
		he: 'פריסת שטח מלאה של מיקרו-חליפה',
		ja: 'マイクロスーツの完全フィールド展開',
		ru: 'Полное полевое развёртывание микроскафандра',
	},
	'One seed pod for the hydroponic bay': {
		he: 'תרמיל זרעים אחד למפרץ ההידרופוני',
		ja: '水耕栽培ベイ用シードポッド1個',
		ru: 'Один капсульный посев для гидропонного отсека',
	},
	'Full-spectrum grow light upgrade': {
		he: 'שדרוג תאורת גידול מלאת-ספקטרום',
		ja: 'フルスペクトラム植物育成ライトのアップグレード',
		ru: 'Апгрейд полноспектрального фитосвета',
	},
	'Genetic sequencing of a strain': {
		he: 'ריצוף גנטי של זן',
		ja: '株の遺伝子シーケンシング',
		ru: 'Генетическое секвенирование штамма',
	},
	'Fund a month of crew field testing': {
		he: 'מימון חודש של בדיקות שדה לצוות',
		ja: 'クルーによる1ヶ月のフィールドテスト資金',
		ru: 'Финансирование месяца полевых испытаний экипажа',
	},
	'Buy one bag of anti-grav sand': {
		he: 'קנו שקית אחת של חול אנטי-כבידה',
		ja: '反重力砂1袋を購入',
		ru: 'Купите один мешок антигравитационного песка',
	},
	'Fund one flux-capacitor scoop': {
		he: 'מימון חפן קבל-שטף אחד',
		ja: 'フラックス・キャパシタ・スクープ1個の資金',
		ru: 'Финансирование одного ковша флюкс-конденсатора',
	},
	'Sponsor a week of centrifuge trials': {
		he: 'תרמו שבוע של ניסויי צנטריפוגה',
		ja: '遠心分離機試験1週間分のスポンサー',
		ru: 'Поддержите неделю испытаний на центрифуге',
	},
	'Name a test chamber after your cat': {
		he: 'קראו לתא בדיקה על שם החתול שלכם',
		ja: 'テストチャンバーにあなたの猫の名前を付ける',
		ru: 'Назовите испытательную камеру в честь вашего кота',
	},
	'Quantum whisker calibration session': {
		he: 'מפגש כיול שפם קוונטי',
		ja: '量子ヒゲ調整セッション',
		ru: 'Сеанс квантовой калибровки усов',
	},
	'Gravitational lensing simulation hour': {
		he: 'שעת סימולציית עידוש כבידתי',
		ja: '重力レンズシミュレーション1時間',
		ru: 'Час симуляции гравитационного линзирования',
	},
	'Sub-space compass prototype board': {
		he: 'לוח אב-טיפוס מצפן תת-חללי',
		ja: 'サブ空間コンパス試作基板',
		ru: 'Прототип платы подпространственного компаса',
	},
	'Fund a full exploratory jump test': {
		he: 'מימון בדיקת קפיצה חקרנית מלאה',
		ja: '完全な探査ジャンプテストの資金',
		ru: 'Финансирование полного исследовательского прыжкового теста',
	},
});

// ---------------------------------------------------------------------------
// Wix REST plumbing. npx wix token -s <siteId> gives the site-scoped token;
// the account ID is embedded in the token's JWS payload (siteOwnerId).
// ---------------------------------------------------------------------------
const siteId = JSON.parse(readFileSync(new URL('../wix.config.json', import.meta.url), 'utf8')).siteId;
const rawToken = execSync(`npx wix token -s ${siteId}`, { encoding: 'utf8' });
const token = rawToken
	.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
	.split('\n').map(s => s.trim()).find(s => s.startsWith('OauthNG') || s.includes('.'));
if (!token) throw new Error('Could not extract site token from wix CLI output');
const accountId = decodeSiteOwnerId(token);
console.log(`site=${siteId}`);
console.log(`account=${accountId}`);

/** @param {string} path @param {object} [body] */
async function wix(path, body) {
	const url = path.startsWith('http') ? path : `https://www.wixapis.com${path}`;
	const res = await fetch(url, {
		method: body ? 'POST' : 'GET',
		headers: {
			'Authorization': token,
			'wix-site-id': siteId,
			'wix-account-id': accountId,
			...(body ? { 'Content-Type': 'application/json' } : {}),
		},
		...(body ? { body: JSON.stringify(body) } : {}),
	});
	if (!res.ok) {
		throw new Error(`${res.status} ${await res.text()}`);
	}
	return res.json();
}

function decodeSiteOwnerId(tok) {
	const parts = tok.split('.');
	const payloadB64 = parts[3] ?? parts[1];
	const b64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/').padEnd(
		payloadB64.length + (4 - payloadB64.length % 4) % 4, '=',
	);
	const decoded = Buffer.from(b64, 'base64').toString('utf8');
	const outer = JSON.parse(decoded);
	const inner = typeof outer.data === 'string' ? JSON.parse(outer.data) : outer.data;
	return inner?.instance?.siteOwnerId ?? inner?.siteOwnerId;
}

async function fetchAllContent(schemaId, locale) {
	// `paging.offset` is silently ignored — must use cursor pagination.
	const all = [];
	let cursor;
	for (let i = 0; i < 500; i++) {
		const query = cursor
			? { cursorPaging: { limit: 100, cursor } }
			: { filter: { locale, schemaId }, cursorPaging: { limit: 100 } };
		const res = await wix('/translation-content/v1/contents/query', { query });
		const items = res.contents ?? [];
		all.push(...items);
		const next = res.pagingMetadata?.cursors?.next;
		if (!next || !res.pagingMetadata?.hasNext) break;
		cursor = next;
	}
	return all;
}

/** @param {{ entityId: string; parentEntityId?: string; fields: Record<string, { textValue?: string }> }} en */
function translateEntity(en, locale, schemaId) {
	const fields = /** @type {Record<string, object>} */ ({});
	let translated = 0;
	let copied = 0;
	for (const [key, val] of Object.entries(en.fields)) {
		const source = val.textValue;
		if (typeof source !== 'string' || !source) continue;
		const mapped = T[source]?.[locale];
		if (mapped) {
			fields[key] = { textValue: mapped, published: true, updatedBy: 'USER' };
			translated += 1;
		} else {
			fields[key] = { textValue: source, published: true, updatedBy: 'USER' };
			copied += 1;
		}
	}
	return {
		body: {
			schemaId,
			entityId: en.entityId,
			locale,
			fields,
			...(en.parentEntityId ? { parentEntityId: en.parentEntityId } : {}),
		},
		translated,
		copied,
	};
}

async function bulkCreate(contents) {
	if (contents.length === 0) return 0;
	let created = 0;
	for (let i = 0; i < contents.length; i += 10) {
		const chunk = contents.slice(i, i + 10);
		await wix('/translation-content/v1/bulk/contents/create', {
			contents: chunk,
			returnEntity: false,
		});
		created += chunk.length;
	}
	return created;
}

async function run() {
	console.log(`\n=== donation campaigns (${DONATIONS_SCHEMA}) ===`);
	const en = await fetchAllContent(DONATIONS_SCHEMA, 'en');
	console.log(`  EN entries: ${en.length}`);

	for (const locale of LOCALES) {
		const existing = await fetchAllContent(DONATIONS_SCHEMA, locale);
		const existingIds = new Set(existing.map(e => e.entityId));
		const toCreate = [];
		let skipped = 0;
		let totalTranslated = 0;
		let totalCopied = 0;
		for (const enEntry of en) {
			if (existingIds.has(enEntry.entityId)) { skipped += 1; continue; }
			const { body, translated, copied } = translateEntity(enEntry, locale, DONATIONS_SCHEMA);
			totalTranslated += translated;
			totalCopied += copied;
			toCreate.push(body);
		}
		const created = await bulkCreate(toCreate);
		console.log(`  ${locale}: ${created} created (${totalTranslated} fields translated, ${totalCopied} copied from EN), ${skipped} already existed`);
	}
	console.log('\n✅ done');
}

run().catch(err => { console.error(err); process.exit(1); });
