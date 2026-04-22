import type { APIRoute } from 'astro';
import { wixEventsV2, ticketDefinitionsV2, categories as categoriesApi } from '@wix/events';
import { files } from '@wix/media';
import { auth } from '@wix/essentials';
import { getSiteCurrency } from '../../utils/site';

// Admin-only setup endpoint. GET /api/setup-cinema?run=yes wipes every existing
// cinema event, generates a fresh DALL-E poster for each movie, and creates a
// weekly recurring series per movie — one movie on each weekday (Sun-Fri),
// all showtimes at 20:00-22:00 local time, for 4 consecutive weeks.
// The seed is responsible for producing clean, canonical data: no orphan
// events, no duplicate-at-same-time siblings, every event carries its poster
// and ticket tiers. The UI trusts this data as-is and does not dedupe.

interface Movie {
	title: string;
	description: string;
	genres: string[];
	dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 5 = Friday
	posterPrompt: string;
}

const MOVIES: Movie[] = [
	{
		title: 'Star Paws: A New Hope',
		description: 'Four furry heroes must defeat the evil Pupperor and restore balance to the galaxy. Warning: laser-pointer scenes.',
		genres: ['Sci-Fi', 'Action'],
		dayOfWeek: 0,
		posterPrompt: 'Movie poster for a sci-fi space opera. A brave heroic orange tabby cat wearing ornate golden armor holds a glowing cyan lightsaber aloft, standing on a sand-dune planet with twin suns setting on the horizon. Stars and galaxies swirl in the sky behind him. Vintage 1977 epic cinema poster style, dramatic rim lighting, detailed painterly illustration, no text.',
	},
	{
		title: 'The Meowtrix',
		description: 'Is the litter box really there? Or is the red yarn controlling us all? Take the tuna pill and see.',
		genres: ['Sci-Fi', 'Action'],
		dayOfWeek: 1,
		posterPrompt: 'Movie poster for a cyberpunk thriller. A sleek black cat wearing a long leather trenchcoat and round mirrored sunglasses crouches in a digital-green rain of falling matrix code. Neon cityscape reflections behind. Dark teal and acid green palette, moody neo-noir lighting, glossy highly-detailed digital illustration, no text.',
	},
	{
		title: '2001: A Space Cat Odyssey',
		description: 'A mysterious laser pointer appears near Jupiter. Dave, don\'t chase it. Dave? Dave?!',
		genres: ['Sci-Fi', 'Drama'],
		dayOfWeek: 2,
		posterPrompt: 'Movie poster for a space odyssey. A solemn Russian Blue cat wearing a white space suit and bubble helmet floats in zero gravity before a towering mysterious black monolith. Jupiter with stripes and stars fills the background. Minimalist Kubrick aesthetic, symmetrical composition, deep blacks and cool blues with a single warm glint, no text.',
	},
	{
		title: 'Purr-assic Park',
		description: 'Scientists clone prehistoric tabbies from amber-trapped hairballs. What could possibly go wrong?',
		genres: ['Adventure', 'Family'],
		dayOfWeek: 3,
		posterPrompt: 'Movie poster for an adventure. A massive prehistoric saber-toothed tiger-cat with gleaming fangs roars mid-leap out of a dense lush jungle at dusk. Warm amber and emerald palette, dramatic volumetric lighting, torn electric-fence silhouette in foreground, vintage 1993 monster movie poster style, no text.',
	},
	{
		title: 'The Fluffather',
		description: 'An ageing Persian mob boss grants his son one last favour: never, ever move the food bowl. A family crime saga.',
		genres: ['Drama', 'Crime'],
		dayOfWeek: 4,
		posterPrompt: 'Vertical portrait movie poster, upright orientation, composition taller than wide. A stately long-haired Persian cat mob boss sits centered and facing forward in a tall leather armchair, head at top of frame, body filling the center, paws at bottom resting on the chair. He wears a dark pinstripe three-piece suit; one paw gently strokes a white dove. Warm tungsten lamplight, moody deep shadows, burgundy velvet curtains frame him vertically. Classic 1970s mob movie poster style, sepia-warm tones, no text.',
	},
	{
		title: 'Cat-ablanca',
		description: 'Of all the fish markets in all the towns in all the world, she walked into mine. A wartime romance.',
		genres: ['Drama', 'Romance'],
		dayOfWeek: 5,
		posterPrompt: 'Movie poster for a classic romance. Two elegant cats, one Siamese and one black-and-white tuxedo, in vintage 1940s trenchcoats and fedoras stand close together at a foggy North African airfield at dusk. Silhouette of a propeller plane behind. Monochrome sepia-noir palette, soft fog, dramatic backlight, classic Hollywood painted poster style, no text.',
	},
];

const TICKET_TYPES: Array<{ name: string; description: string; price: string }> = [
	{ name: 'Standard', price: '12.00', description: 'A seat. A screen. A cat. The basics.' },
	{ name: 'Cat Cuddle', price: '18.00', description: 'Includes one (1) emotional-support plush kitten for the duration of the film.' },
	{ name: 'VIP Purr-mium', price: '30.00', description: 'Front-row seat, unlimited tuna popcorn, and a signed 8×10 from the feline cast.' },
];

const SHOW_START_HOUR = 20;
const SHOW_DURATION_HOURS = 2;
const WEEKS_AHEAD = 52;

// DALL-E poster URIs expire ~1 hour after generation, so we generate each
// image and immediately hand the URL to files.importFile (which pulls the
// bytes server-side).
async function generatePoster(prompt: string): Promise<string | null> {
	const key = process.env.OPENAI_API_KEY;
	if (!key) return null;
	const res = await fetch('https://api.openai.com/v1/images/generations', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${key}`,
		},
		body: JSON.stringify({
			model: 'dall-e-3',
			prompt,
			size: '1024x1792',
			n: 1,
		}),
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`openai ${res.status}: ${body.slice(0, 200)}`);
	}
	const json = await res.json() as { data: { url?: string }[] };
	return json.data[0]?.url ?? null;
}

function buildWixImageUri(fileId: string, displayName: string, w = 1024, h = 1792): string {
	const safe = displayName.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/(^-|-$)/g, '');
	return `wix:image://v1/${fileId}/${safe}#originWidth=${w}&originHeight=${h}`;
}

async function waitForFileReady(fileId: string, maxAttempts = 30): Promise<boolean> {
	const getFile = auth.elevate(files.getFileDescriptor);
	for (let i = 0; i < maxAttempts; i++) {
		try {
			const res = await getFile(fileId);
			const f = (res as { file?: files.FileDescriptor }).file ?? (res as unknown as files.FileDescriptor);
			if (f?.operationStatus === files.OperationStatus.READY) return true;
		} catch { /* ignore transient */ }
		await new Promise(r => setTimeout(r, 500));
	}
	return false;
}

// queryEvents caps `.limit()` at 200. With 6 movies × 52 weekly showtimes
// we have ~312 events in the site, so we paginate via `.next()` until we've
// collected every page.
async function fetchAllEvents(fieldsets: wixEventsV2.RequestedFieldsWithLiterals[]): Promise<wixEventsV2.Event[]> {
	const query = auth.elevate(wixEventsV2.queryEvents);
	const all: wixEventsV2.Event[] = [];
	let page: { items?: wixEventsV2.Event[]; next: () => Promise<typeof page> } | undefined
		= await query({ fields: fieldsets }).limit(200).find();
	while (page) {
		all.push(...(page.items ?? []));
		if (!page.items || page.items.length < 200) break;
		page = await page.next();
	}
	return all;
}

// Compute the next Date (local time) that falls on `dayOfWeek`. Always
// moves forward to next week if today already matches but the show hour has
// passed.
function nextOccurrenceOfWeekday(dayOfWeek: number): Date {
	const now = new Date();
	const result = new Date(now);
	result.setHours(SHOW_START_HOUR, 0, 0, 0);
	const currentDay = result.getDay();
	let diff = (dayOfWeek - currentDay + 7) % 7;
	if (diff === 0 && now.getHours() >= SHOW_START_HOUR) diff = 7;
	result.setDate(result.getDate() + diff);
	return result;
}

export const GET: APIRoute = async ({ url }) => {
	if (url.searchParams.get('run') !== 'yes') {
		return new Response('Add ?run=yes to execute. This wipes existing cinema events.', { status: 400 });
	}

	const log: string[] = [];
	const ok = (s: string) => log.push('✓ ' + s);
	const warn = (s: string) => log.push('! ' + s);

	try {
		const siteCurrency = await getSiteCurrency();
		// 1. Wipe every existing event (cancel first, then delete). Loop across
		// several passes: recurring-series siblings are indexed asynchronously,
		// so a single pass can miss late arrivals. Paginate each pass via
		// fetchAllEvents so we don't cap at 200.
		const cancelEvent = auth.elevate(wixEventsV2.cancelEvent);
		const deleteEvent = auth.elevate(wixEventsV2.deleteEvent);
		let totalDeleted = 0;
		for (let pass = 0; pass < 10; pass++) {
			const items = await fetchAllEvents([]);
			if (items.length === 0) break;
			for (const ev of items) {
				if (!ev._id) continue;
				try { await cancelEvent(ev._id); } catch { /* ok if already cancelled */ }
				try {
					await deleteEvent(ev._id);
					totalDeleted += 1;
				} catch (e) {
					warn(`deleteEvent(${ev.title}): ${e instanceof Error ? e.message : e}`);
				}
			}
			await new Promise(r => setTimeout(r, 600));
		}
		ok(`Wiped ${totalDeleted} existing event(s)`);

		// 2. Delete leftover MANUAL categories. Hidden RECURRING_EVENT categories
		// are cleaned up automatically with their events.
		const existingCats = await auth.elevate(categoriesApi.queryCategories)().find();
		const deleteCategory = auth.elevate(categoriesApi.deleteCategory);
		for (const c of existingCats.items ?? []) {
			if (c.states?.includes(categoriesApi.State.MANUAL) && c._id) {
				try {
					await deleteCategory(c._id);
					ok(`Deleted old category ${c.name}`);
				} catch (e) {
					warn(`deleteCategory(${c.name}): ${e instanceof Error ? e.message : e}`);
				}
			}
		}

		// 3. Create fresh genre categories.
		const categoryIdByName = new Map<string, string>();
		const allGenres = [...new Set(MOVIES.flatMap(m => m.genres))];
		const createCategory = auth.elevate(categoriesApi.createCategory);
		for (const name of allGenres) {
			const created = await createCategory({ name });
			if (created._id) {
				categoryIdByName.set(name, created._id);
				ok(`Created category ${name}`);
			}
		}

		// 4. Generate posters. DALL-E takes ~20s per image, run sequentially so
		// we can log progress without overrunning OpenAI's concurrency limits.
		const posterUriByTitle = new Map<string, string>();
		const importFile = auth.elevate(files.importFile);
		for (const m of MOVIES) {
			try {
				const imageUrl = await generatePoster(m.posterPrompt);
				if (!imageUrl) {
					warn(`No image URL from OpenAI for ${m.title} (is OPENAI_API_KEY set?)`);
					continue;
				}
				ok(`Generated poster for ${m.title}`);
				const imported = await importFile(imageUrl, {
					mediaType: files.MediaType.IMAGE,
					displayName: `${m.title} poster`,
					mimeType: 'image/png',
				});
				const fileId = imported.file?._id;
				if (!fileId) {
					warn(`importFile returned no _id for ${m.title}`);
					continue;
				}
				await waitForFileReady(fileId);
				posterUriByTitle.set(m.title, buildWixImageUri(fileId, imported.file?.displayName || m.title));
				ok(`Imported poster for ${m.title} → ${fileId}`);
			} catch (e) {
				warn(`poster(${m.title}): ${e instanceof Error ? e.message : e}`);
			}
		}

		// 5. Create one event per movie with weekly individualEventDates.
		const createEvent = auth.elevate(wixEventsV2.createEvent) as (
			event: wixEventsV2.Event,
			options?: wixEventsV2.CreateEventOptions,
		) => Promise<wixEventsV2.Event>;

		interface CreatedMovie { title: string; seriesCategoryId: string; expected: number; posterUri: string | undefined; genres: string[]; }
		const createdMovies: CreatedMovie[] = [];

		for (const m of MOVIES) {
			const firstWeek = nextOccurrenceOfWeekday(m.dayOfWeek);
			const individualEventDates = Array.from({ length: WEEKS_AHEAD }, (_, i) => {
				const start = new Date(firstWeek);
				start.setDate(start.getDate() + i * 7);
				const end = new Date(start);
				end.setHours(start.getHours() + SHOW_DURATION_HOURS);
				return { startDate: start, endDate: end, timeZoneId: 'Asia/Jerusalem' };
			});
			const firstDate = individualEventDates[0]!;
			const posterUri = posterUriByTitle.get(m.title);

			// Event.mainImage is documented on createEvent's input type but the
			// server silently drops it during creation. We attach it via
			// updateEvent on every sibling below.
			const eventInput: wixEventsV2.Event = {
				title: m.title,
				shortDescription: m.description,
				dateAndTimeSettings: {
					startDate: firstDate.startDate,
					endDate: firstDate.endDate,
					timeZoneId: 'Asia/Jerusalem',
					recurringEvents: { individualEventDates },
				},
				location: { type: wixEventsV2.LocationType.VENUE, name: 'Cats In Space Cinema' },
				registration: { initialType: wixEventsV2.InitialRegistrationTypeType.TICKETING },
			};

			try {
				const created = await createEvent(eventInput, { draft: false });
				const seriesCategoryId = created.dateAndTimeSettings?.recurringEvents?.categoryId ?? '';
				if (!seriesCategoryId) {
					warn(`${m.title}: createEvent returned no seriesCategoryId`);
					continue;
				}
				createdMovies.push({ title: m.title, seriesCategoryId, expected: WEEKS_AHEAD, posterUri, genres: m.genres });
				ok(`Created ${m.title} — series=${seriesCategoryId}`);
			} catch (e) {
				warn(`createEvent(${m.title}): ${e instanceof Error ? e.message : e}`);
			}
		}

		// 6. Wait for all sibling events to appear, then for each movie:
		//    - delete any duplicate-at-same-time siblings
		//    - attach mainImage to every survivor
		//    - create 3 ticket tiers per event
		//    - assign genre categories
		const updateEvent = auth.elevate(wixEventsV2.updateEvent) as (
			id: string,
			options: { event: wixEventsV2.Event; fields?: wixEventsV2.RequestedFieldsWithLiterals[] },
		) => Promise<wixEventsV2.Event>;
		const createTicketDef = auth.elevate(ticketDefinitionsV2.createTicketDefinition) as (
			td: ticketDefinitionsV2.TicketDefinition,
		) => Promise<ticketDefinitionsV2.TicketDefinition>;
		const assignEvents = auth.elevate(categoriesApi.assignEvents);

		await new Promise(r => setTimeout(r, 1500));

		for (const movie of createdMovies) {
			// Poll until at least `expected` siblings show up, OR maxAttempts
			// elapse, whichever is first. With 52 weekly showtimes Wix can take
			// 30+s to finish indexing.
			let siblings: wixEventsV2.Event[] = [];
			for (let attempt = 0; attempt < 30; attempt++) {
				const allEvents = await fetchAllEvents([wixEventsV2.RequestedFields.DETAILS]);
				siblings = allEvents.filter(
					e => e.dateAndTimeSettings?.recurringEvents?.categoryId === movie.seriesCategoryId,
				);
				if (siblings.length >= movie.expected) break;
				await new Promise(r => setTimeout(r, 1500));
			}

			// Dedupe by startMs. Wix occasionally creates an extra sibling at
			// the first showtime; keep the first we see per slot and delete the
			// rest so the dashboard matches our spec.
			const byStart = new Map<number, wixEventsV2.Event>();
			const toDelete: wixEventsV2.Event[] = [];
			for (const sib of siblings) {
				const start = sib.dateAndTimeSettings?.startDate
					? new Date(sib.dateAndTimeSettings.startDate).getTime()
					: 0;
				if (byStart.has(start)) toDelete.push(sib);
				else byStart.set(start, sib);
			}
			for (const dup of toDelete) {
				if (!dup._id) continue;
				try { await cancelEvent(dup._id); } catch {}
				try {
					await deleteEvent(dup._id);
					ok(`  ${movie.title}: deleted duplicate at ${dup.dateAndTimeSettings?.startDate}`);
				} catch (e) {
					warn(`  ${movie.title}: delete dup failed: ${e instanceof Error ? e.message : e}`);
				}
			}
			const survivors = [...byStart.values()];
			ok(`  ${movie.title}: ${survivors.length}/${movie.expected} showtime(s) kept`);

			for (const ev of survivors) {
				if (!ev._id) continue;
				if (movie.posterUri) {
					try {
						await updateEvent(ev._id, { event: { mainImage: movie.posterUri }, fields: [wixEventsV2.RequestedFields.DETAILS] });
					} catch (e) {
						warn(`  ${movie.title} updateEvent mainImage: ${e instanceof Error ? e.message : e}`);
					}
				}
				for (const tt of TICKET_TYPES) {
					try {
						await createTicketDef({
							eventId: ev._id,
							name: tt.name,
							description: tt.description,
							feeType: ticketDefinitionsV2.FeeTypeEnumType.FEE_ADDED_AT_CHECKOUT,
							pricingMethod: { fixedPrice: { value: tt.price, currency: siteCurrency } },
							initialLimit: 200,
						});
					} catch (e) {
						warn(`  ticket ${tt.name} on ${ev._id}: ${e instanceof Error ? e.message : e}`);
					}
				}
				for (const genre of movie.genres) {
					const catId = categoryIdByName.get(genre);
					if (!catId) continue;
					try {
						await assignEvents(catId, [ev._id]);
					} catch (e) {
						warn(`  assign ${genre} → ${ev._id}: ${e instanceof Error ? e.message : e}`);
					}
				}
			}
		}

		// 7. Final sweep. Wix's async sibling indexing can produce new phantom
		// events even AFTER our per-series dedup ran. Wait, then pass over every
		// sibling-at-same-timestamp one more time — and delete any event that
		// doesn't belong to one of our series.
		await new Promise(r => setTimeout(r, 3000));
		const seriesIds = new Set(createdMovies.map(m => m.seriesCategoryId));
		const allItems = await fetchAllEvents([wixEventsV2.RequestedFields.DETAILS]);

		const byKey = new Map<string, wixEventsV2.Event>();
		const toWipe: wixEventsV2.Event[] = [];
		for (const ev of allItems) {
			const seriesCategoryId = ev.dateAndTimeSettings?.recurringEvents?.categoryId ?? '';
			if (!seriesIds.has(seriesCategoryId)) {
				toWipe.push(ev);
				continue;
			}
			const start = ev.dateAndTimeSettings?.startDate
				? new Date(ev.dateAndTimeSettings.startDate).getTime()
				: 0;
			const key = `${seriesCategoryId}@${start}`;
			if (byKey.has(key)) toWipe.push(ev);
			else byKey.set(key, ev);
		}
		for (const ev of toWipe) {
			if (!ev._id) continue;
			try { await cancelEvent(ev._id); } catch {}
			try {
				await deleteEvent(ev._id);
				ok(`Final sweep deleted ${ev.title} (${ev.dateAndTimeSettings?.startDate})`);
			} catch (e) {
				warn(`finalSweep(${ev.title}): ${e instanceof Error ? e.message : e}`);
			}
		}

		// 8. Fill mainImage on any survivor that's missing it (can happen if the
		// first update loop ran before the sibling was indexed).
		const surviving = await fetchAllEvents([wixEventsV2.RequestedFields.DETAILS]);
		for (const ev of surviving) {
			if (typeof ev.mainImage === 'string' && ev.mainImage.length > 0) continue;
			const series = ev.dateAndTimeSettings?.recurringEvents?.categoryId;
			const movie = createdMovies.find(m => m.seriesCategoryId === series);
			if (!movie?.posterUri || !ev._id) continue;
			try {
				await updateEvent(ev._id, { event: { mainImage: movie.posterUri }, fields: [wixEventsV2.RequestedFields.DETAILS] });
				ok(`Repaired mainImage on ${ev.title} (${ev.dateAndTimeSettings?.startDate})`);
			} catch (e) {
				warn(`repair mainImage ${ev._id}: ${e instanceof Error ? e.message : e}`);
			}
		}

		const final = await fetchAllEvents([wixEventsV2.RequestedFields.DETAILS]);
		const withImages = final.filter(e => typeof e.mainImage === 'string' && e.mainImage.length > 0).length;
		ok(`Verify: ${final.length} canonical event(s), ${withImages} with mainImage, ${toWipe.length} duplicate/orphan(s) removed in final sweep`);

		return new Response(log.join('\n'), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
	} catch (e) {
		log.push('FATAL: ' + (e instanceof Error ? e.message + '\n' + e.stack : String(e)));
		return new Response(log.join('\n'), { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } });
	}
};
