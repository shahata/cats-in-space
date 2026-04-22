import type { APIRoute } from 'astro';
import { wixEventsV2, forms as eventForms } from '@wix/events';
import { auth } from '@wix/essentials';

// Admin-only: GET /api/update-event-forms?run=yes
//
// 1. Adds an optional `phone` input to every event's checkout form (if missing).
// 2. Flips `registration.tickets.guestsAssignedSeparately` → `true` (so Wix
//    collects attendee info once per ticket instead of once per order).
//
// Two APIs, two gotchas to know about:
//   * `@wix/events/forms.addControl(eventId, { phone: {...} })` is the correct
//     way to append a form field. Trying to patch the full event via
//     `wixEventsV2.updateEvent({ event: { form: { controls: ... } } })` fails
//     with `Invalid field mask: form.controls: UNKNOWN` — the SDK types list
//     `form` as updatable but the v3 REST API doesn't accept it.
//   * Flipping `guestsAssignedSeparately` via `updateEvent` WORKS if you pass
//     ONLY that subtree in the payload. Spreading the full `event.registration`
//     object triggers `INVALID_FIELD_MASK` because the response includes
//     read-only paths the server won't let you write.

export const GET: APIRoute = async ({ url }) => {
	if (url.searchParams.get('run') !== 'yes') {
		return new Response('Add ?run=yes to execute.', { status: 400 });
	}

	const log: string[] = [];
	const ok = (s: string) => log.push('✓ ' + s);
	const warn = (s: string) => log.push('! ' + s);

	try {
		const queryEvents = auth.elevate(wixEventsV2.queryEvents);
		const all: wixEventsV2.Event[] = [];
		let page: wixEventsV2.EventsQueryResult | undefined = await queryEvents({
			fields: ['FORM', 'REGISTRATION'],
		}).limit(200).find();
		while (page) {
			all.push(...(page.items ?? []));
			if (!page.items || page.items.length < 200) break;
			page = await page.next();
		}
		ok(`Fetched ${all.length} event(s)`);

		const addControl = auth.elevate(eventForms.addControl);
		const updateEvent = auth.elevate(wixEventsV2.updateEvent) as (
			id: string,
			options: {
				event: wixEventsV2.Event;
				fields?: wixEventsV2.RequestedFieldsWithLiterals[];
			},
		) => Promise<wixEventsV2.Event>;

		let phoneAdded = 0, phoneSkipped = 0, phoneFailed = 0;
		let guestsFlipped = 0, guestsSkipped = 0, guestsFailed = 0;

		for (const ev of all) {
			if (!ev._id) continue;

			const hasPhone = (ev.form?.controls ?? []).some(c => c.name === 'phone');
			if (hasPhone) {
				phoneSkipped += 1;
			} else {
				try {
					await addControl(ev._id, { phone: { label: 'Phone Number', mandatory: false } });
					phoneAdded += 1;
				} catch (e) {
					phoneFailed += 1;
					warn(`addControl phone on ${ev.title} @ ${ev.dateAndTimeSettings?.startDate}: ${e instanceof Error ? e.message : e}`);
				}
			}

			const guestsSeparate = ev.registration?.tickets?.guestsAssignedSeparately === true;
			if (guestsSeparate) {
				guestsSkipped += 1;
			} else {
				try {
					await updateEvent(ev._id, {
						event: { registration: { tickets: { guestsAssignedSeparately: true } } },
					});
					guestsFlipped += 1;
				} catch (e) {
					guestsFailed += 1;
					warn(`updateEvent guestsAssignedSeparately on ${ev.title} @ ${ev.dateAndTimeSettings?.startDate}: ${e instanceof Error ? e.message : e}`);
				}
			}

			if ((phoneAdded + guestsFlipped) > 0 && (phoneAdded + guestsFlipped) % 50 === 0) {
				ok(`  ...progress: phone=${phoneAdded}+${phoneSkipped}skip guests=${guestsFlipped}+${guestsSkipped}skip`);
			}
		}

		ok(`Phone: ${phoneAdded} added, ${phoneSkipped} already present, ${phoneFailed} failed`);
		ok(`Guests-separate: ${guestsFlipped} flipped, ${guestsSkipped} already on, ${guestsFailed} failed`);

		return new Response(log.join('\n'), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
	} catch (e) {
		log.push('FATAL: ' + (e instanceof Error ? e.message + '\n' + e.stack : String(e)));
		return new Response(log.join('\n'), { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } });
	}
};
