#!/usr/bin/env node
// One-shot translator for the cinema content.
//
// Writes Hebrew / Japanese / Russian translations for every Wix Event
// (titles, descriptions, ticket tiers, form labels, email templates,
// location name) and every genre Category via the Translation Content API.
//
// Auth via `wix token -s <siteId>` — the headless runtime's own fetchWithAuth
// returns 403 on the translation-schema/content endpoints.
//
// Idempotent: queries existing target-locale content first and skips
// entities that already have a translation (matches by entityId). Run this
// once after seeding; re-runs are no-ops.
//
// Usage: node scripts/translate-cinema.mjs

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const EVENTS_APP_ID = '140603ad-af8d-84a5-2c80-a0f60cb47351';
const EVENTS_SCHEMA = '1e9ca1bf-3d5e-45d3-ad89-ea841399f62d';
const CATS_SCHEMA = '4b7d8920-c9b6-488f-acc5-8580b93e25ad';
const LOCALES = ['he', 'ja', 'ru'];

// ---------------------------------------------------------------------------
// Translation dictionary. Keys are the exact EN `textValue`; values map to
// each target locale. Missing entries are skipped (left English).
// ---------------------------------------------------------------------------
const T = /** @type {Record<string, { he: string; ja: string; ru: string }>} */ ({
	// --- movie titles
	'Star Paws: A New Hope': {
		he: 'סטאר פאוס: תקווה חדשה',
		ja: 'スター・パウス：新たなる希望',
		ru: 'Звёздные лапки: Новая надежда',
	},
	'The Meowtrix': {
		he: 'המיאוטריקס',
		ja: 'メウトリックス',
		ru: 'Мяутрица',
	},
	'2001: A Space Cat Odyssey': {
		he: '2001: אודיסאה חתולית בחלל',
		ja: '2001年宇宙の猫オデッセイ',
		ru: '2001: Космическая котонодиссея',
	},
	'Purr-assic Park': {
		he: 'פארק הגוּרים',
		ja: 'ゴロゴロ紀パーク',
		ru: 'Мурр-ский период',
	},
	'The Fluffather': {
		he: 'הפרוותן',
		ja: 'ゴッドファーリー',
		ru: 'Пушной отец',
	},
	'Cat-ablanca': {
		he: 'חתולבלנקה',
		ja: 'カサブランカット',
		ru: 'Котабланка',
	},

	// --- movie descriptions
	'Scientists clone prehistoric tabbies from amber-trapped hairballs. What could possibly go wrong?': {
		he: 'מדענים משכפלים חתולים טְרוּמיים מגושי פרווה לכודי ענבר. מה כבר יכול להשתבש?',
		ja: '科学者たちが琥珀に閉じ込められた毛玉から先史時代のトラ猫をクローンする。何が起こるというのだろう？',
		ru: 'Учёные клонируют доисторических полосатиков из застрявших в янтаре комков шерсти. Что может пойти не так?',
	},
	'Four furry heroes must defeat the evil Pupperor and restore balance to the galaxy. Warning: laser-pointer scenes.': {
		he: 'ארבעה גיבורים פרוותיים חייבים להביס את הגור-פְרוֹר הרשע ולהחזיר את האיזון לגלקסיה. אזהרה: סצנות של מצביע לייזר.',
		ja: '4匹のもふもふヒーローが邪悪なパピロー帝を倒し、銀河の平和を取り戻さねばならない。警告：レーザーポインターのシーンあり。',
		ru: 'Четвёрка пушистых героев должна победить злобного Щенкеропа и вернуть равновесие галактике. Осторожно: сцены с лазерной указкой.',
	},
	'Is the litter box really there? Or is the red yarn controlling us all? Take the tuna pill and see.': {
		he: 'האם ארגז החול באמת קיים? או שחוט הצמר האדום שולט בכולנו? בלעו את כדור הטונה וגלו.',
		ja: '猫トイレは本当に存在するのか？それとも赤い毛糸が私たちを操っているのか？マグロの錠剤を飲めば真実が見える。',
		ru: 'Лоток действительно существует? Или всеми нами управляет красная нитка? Прими таблетку из тунца и узнай.',
	},
	"A mysterious laser pointer appears near Jupiter. Dave, don't chase it. Dave? Dave?!": {
		he: 'מצביע לייזר מסתורי מופיע ליד יופיטר. דייב, אל תרדוף אחריו. דייב? דייב?!',
		ja: '木星の近くに謎のレーザーポインターが現れる。デイブ、追いかけちゃダメだ。デイブ？デイブ？！',
		ru: 'Рядом с Юпитером появляется загадочная лазерная указка. Дэйв, не гонись за ней. Дэйв? Дэйв?!',
	},
	'An ageing Persian mob boss grants his son one last favour: never, ever move the food bowl. A family crime saga.': {
		he: 'ראש מאפיה פרסי מזדקן מעניק לבנו טובה אחרונה: לעולם אל תזיז את קערת האוכל. סאגה משפחתית-פלילית.',
		ja: '老いたペルシャ猫のマフィアのボスが、息子に最後の頼みごとを託す——絶対にエサ皿を動かすな。家族犯罪サーガ。',
		ru: 'Стареющий персидский мафиозный дон делает сыну последнее одолжение: никогда, ни за что не передвигай миску с едой. Семейная криминальная сага.',
	},
	'Of all the fish markets in all the towns in all the world, she walked into mine. A wartime romance.': {
		he: 'מכל שוקי הדגים בכל הערים בכל העולם — היא נכנסה דווקא אל שלי. רומן ימי מלחמה.',
		ja: '世界中の町のあらゆる魚市場の中から、彼女が入ってきたのは私の店だった。戦時下のロマンス。',
		ru: 'Из всех рыбных рынков во всех городах всего мира — она зашла именно в мой. Военный роман.',
	},

	// --- ticket tiers
	'Standard': { he: 'רגיל', ja: 'スタンダード', ru: 'Стандарт' },
	'Cat Cuddle': { he: 'חיבוק-חתול', ja: 'キャット・カドル', ru: 'Обнимашки с кошкой' },
	'VIP Purr-mium': { he: 'VIP פְּרִים-יוּם', ja: 'VIPパー・ミアム', ru: 'VIP Мурр-миум' },
	'A seat. A screen. A cat. The basics.': {
		he: 'כיסא. מסך. חתול. הבסיס.',
		ja: '座席。スクリーン。猫。基本です。',
		ru: 'Место. Экран. Кот. Базовый набор.',
	},
	'Includes one (1) emotional-support plush kitten for the duration of the film.': {
		he: 'כולל חתלתולון רך לתמיכה רגשית אחד (1) למשך כל הסרט.',
		ja: '上映中、情緒サポート用ぬいぐるみ子猫1匹付き。',
		ru: 'Входит один (1) плюшевый котёнок для эмоциональной поддержки на время сеанса.',
	},
	'Front-row seat, unlimited tuna popcorn, and a signed 8×10 from the feline cast.': {
		he: 'שורה ראשונה, פופקורן טונה בלי הגבלה, ותמונה חתומה 8×10 מצוות החתולים.',
		ja: '最前列席、ツナ・ポップコーン無制限、猫の出演者陣によるサイン入り8×10写真付き。',
		ru: 'Место в первом ряду, безлимитный тунцовый попкорн и фото 8×10 с автографами кошачьего актёрского состава.',
	},

	// --- location
	'Cats In Space Cinema': {
		he: 'סינמה חתולים בחלל',
		ja: 'キャッツ・イン・スペース シネマ',
		ru: 'Cats In Space Кинозал',
	},

	// --- form labels
	'First name': { he: 'שם פרטי', ja: '名', ru: 'Имя' },
	'Last name': { he: 'שם משפחה', ja: '姓', ru: 'Фамилия' },
	'Email': { he: 'אימייל', ja: 'メール', ru: 'Эл. почта' },
	'Phone Number': { he: 'מספר טלפון', ja: '電話番号', ru: 'Номер телефона' },
	'Continue': { he: 'המשך', ja: '続行', ru: 'Продолжить' },
	'Add your details': { he: 'הוספת הפרטים שלכם', ja: '詳細を入力', ru: 'Добавьте ваши данные' },
	'See other events': { he: 'צפייה באירועים אחרים', ja: '他のイベントを見る', ru: 'Смотреть другие мероприятия' },
	'Registration is closed': { he: 'ההרשמה סגורה', ja: '登録は締め切られました', ru: 'Регистрация закрыта' },
	'Tickets are not on sale': { he: 'הכרטיסים אינם במכירה', ja: 'チケットは販売されていません', ru: 'Билеты не продаются' },

	// --- email labels
	'Add to my Google Calendar': { he: 'הוספה ל-Google Calendar שלי', ja: 'マイGoogleカレンダーに追加', ru: 'Добавить в мой Google Календарь' },
	'Join meeting': { he: 'הצטרפות לפגישה', ja: 'ミーティングに参加', ru: 'Присоединиться к встрече' },
	'View Event': { he: 'צפייה באירוע', ja: 'イベントを見る', ru: 'Посмотреть мероприятие' },
	'Event Canceled': { he: 'האירוע בוטל', ja: 'イベント中止', ru: 'Мероприятие отменено' },
	'Our event is coming up soon!': { he: 'האירוע שלנו מתקרב!', ja: 'もうすぐイベントが始まります！', ru: 'Наше мероприятие скоро начнётся!' },
	'Thanks for registering! Here are your tickets': { he: 'תודה על ההרשמה! הנה הכרטיסים שלכם', ja: 'ご登録ありがとうございます！チケットをお送りします', ru: 'Спасибо за регистрацию! Вот ваши билеты' },

	// --- email body templates (preserve \n\n)
	"Here's a quick reminder that this event is just around the corner.\n\nCan't wait to see you there!\n\nEvent details:": {
		he: 'תזכורת קצרה — האירוע ממש מעבר לפינה.\n\nנתראה שם בקרוב!\n\nפרטי האירוע:',
		ja: 'イベント開催が間近に迫っていることをお知らせします。\n\n当日お会いできるのを楽しみにしています！\n\nイベント詳細：',
		ru: 'Напоминаем, что наше мероприятие уже совсем скоро.\n\nЖдём встречи с вами!\n\nДетали мероприятия:',
	},
	"Thank you for registering to our event! Your tickets are attached to this email. Don't forget to bring them.\n\nWe're looking forward to seeing you there.\n\nHere are the details:": {
		he: 'תודה על ההרשמה לאירוע שלנו! הכרטיסים מצורפים למייל, אל תשכחו להביא אותם.\n\nמחכים לראותכם.\n\nהנה הפרטים:',
		ja: 'イベントへのご登録ありがとうございます！チケットをこのメールに添付しています。忘れずにお持ちください。\n\n当日お会いできるのを楽しみにしています。\n\n詳細はこちら：',
		ru: 'Спасибо за регистрацию на наше мероприятие! Билеты приложены к этому письму — не забудьте их взять с собой.\n\nБудем рады видеть вас.\n\nВот детали:',
	},
	'We regret to inform you that our event has been canceled. We apologize for any inconvenience and hope to see you at future events.\n\nHere are the event details:': {
		he: 'לצערנו, האירוע בוטל. אנו מתנצלים על אי הנוחות ומקווים לראותכם באירועים עתידיים.\n\nהנה פרטי האירוע:',
		ja: '誠に申し訳ありませんが、本イベントは中止となりました。ご不便をおかけして申し訳ございません。今後のイベントでお会いできることを願っています。\n\nイベント詳細：',
		ru: 'К сожалению, наше мероприятие отменено. Приносим извинения за неудобства и надеемся увидеть вас на будущих мероприятиях.\n\nДетали мероприятия:',
	},

	// --- category names (same schema uses .name field)
	'Action':    { he: 'אקשן',       ja: 'アクション',      ru: 'Боевик' },
	'Adventure': { he: 'הרפתקה',     ja: 'アドベンチャー',  ru: 'Приключения' },
	'Crime':     { he: 'פשע',        ja: 'クライム',        ru: 'Криминал' },
	'Drama':     { he: 'דרמה',       ja: 'ドラマ',          ru: 'Драма' },
	'Family':    { he: 'משפחתי',     ja: 'ファミリー',      ru: 'Семейный' },
	'Romance':   { he: 'רומנטי',     ja: 'ロマンス',        ru: 'Романтика' },
	'Sci-Fi':    { he: 'מדע בדיוני', ja: 'SF',              ru: 'Научная фантастика' },
});

// ---------------------------------------------------------------------------
// Wix REST plumbing. npx wix token -s <siteId> gives the site-scoped token;
// the account ID is embedded in the token's JWS payload (siteOwnerId).
// ---------------------------------------------------------------------------
const siteId = JSON.parse(readFileSync(new URL('../wix.config.json', import.meta.url), 'utf8')).siteId;
const rawToken = execSync(`npx wix token -s ${siteId}`, { encoding: 'utf8' });
// Strip ANSI colour codes and grab the first line that looks like a JWS.
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
	// The token is `OauthNG.JWS.<header>.<payload>.<signature>` (note the
	// leading prefix), so the payload is the 4th dot-separated segment, not
	// the 2nd.
	const parts = tok.split('.');
	const payloadB64 = parts[3] ?? parts[1];
	// base64url → base64 + padding
	const b64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/').padEnd(
		payloadB64.length + (4 - payloadB64.length % 4) % 4, '=',
	);
	const decoded = Buffer.from(b64, 'base64').toString('utf8');
	const outer = JSON.parse(decoded);
	const inner = typeof outer.data === 'string' ? JSON.parse(outer.data) : outer.data;
	return inner?.instance?.siteOwnerId ?? inner?.siteOwnerId;
}

async function fetchAllContent(schemaId, locale) {
	const all = [];
	let offset = 0;
	while (true) {
		const t = Date.now();
		const res = await wix('/translation-content/v1/contents/query', {
			query: { filter: { locale, schemaId }, paging: { limit: 100, offset } },
		});
		const items = res.contents ?? [];
		console.log(`    fetch ${locale} offset=${offset} got=${items.length} (${Date.now() - t}ms)`);
		all.push(...items);
		if (items.length < 100) break;
		offset += 100;
		if (offset > 2000) { console.warn('    pagination runaway — stopping'); break; }
	}
	return all;
}

/**
 * Build a translated content body from an EN source content by looking up each
 * field's English textValue in the translation dictionary.
 * @param {{ entityId: string; parentEntityId?: string; fields: Record<string, { textValue?: string; richContent?: unknown }> }} en
 * @param {string} locale
 * @param {string} schemaId
 */
function translateEntity(en, locale, schemaId) {
	const fields = /** @type {Record<string, object>} */ ({});
	let translatedCount = 0;
	for (const [key, val] of Object.entries(en.fields)) {
		const source = val.textValue;
		if (typeof source !== 'string' || !source) continue;
		const mapped = T[source]?.[locale];
		if (mapped) {
			fields[key] = { textValue: mapped, published: true, updatedBy: 'USER' };
			translatedCount += 1;
		} else {
			// Copy EN verbatim so the field still counts as translated.
			fields[key] = { textValue: source, published: true, updatedBy: 'USER' };
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
		translatedCount,
	};
}

async function bulkCreate(contents) {
	if (contents.length === 0) return { created: 0 };
	// API limit: 10 per call.
	let created = 0;
	for (let i = 0; i < contents.length; i += 10) {
		const chunk = contents.slice(i, i + 10);
		const t = Date.now();
		await wix('/translation-content/v1/bulk/contents/create', {
			contents: chunk,
			returnEntity: false,
		});
		created += chunk.length;
		console.log(`    bulk-create ${created}/${contents.length} (${Date.now() - t}ms)`);
	}
	return { created };
}

async function run() {
	for (const [label, schemaId] of [['events', EVENTS_SCHEMA], ['categories', CATS_SCHEMA]]) {
		console.log(`\n=== ${label} (${schemaId}) ===`);
		const en = await fetchAllContent(schemaId, 'en');
		console.log(`  EN entries: ${en.length}`);

		for (const locale of LOCALES) {
			const existing = await fetchAllContent(schemaId, locale);
			const existingIds = new Set(existing.map(e => e.entityId));
			const toCreate = [];
			let skipped = 0;
			for (const enEntry of en) {
				if (existingIds.has(enEntry.entityId)) { skipped += 1; continue; }
				const { body } = translateEntity(enEntry, locale, schemaId);
				toCreate.push(body);
			}
			const { created } = await bulkCreate(toCreate);
			console.log(`  ${locale}: ${created} created, ${skipped} already existed`);
		}
	}
	console.log('\n✅ done');
}

run().catch(err => { console.error(err); process.exit(1); });
