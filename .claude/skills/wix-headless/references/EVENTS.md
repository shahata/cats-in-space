# Wix Events (Headless)

## Overview

Wix Events in headless uses several modules from `@wix/events`:
- `wixEventsV2` — event CRUD and queries
- `ticketDefinitionsV2` — ticket tiers per event (price, limits, seating references)
- `ticketReservations` — short-lived ticket holds (PENDING → CONFIRMED)
- `orders` — the paid order created after payment
- `categories` — genre/series categorization of events
- `@wix/media` (`files`) — poster upload
- `@wix/redirects` (`redirects.createRedirectSession`) — hand off to Wix's hosted ticket-form + payment page

## Required Wix App

- **Wix Events** — install from the dashboard. Without it `auth.elevate(wixEventsV2.queryEvents)` throws `APP_NOT_INSTALLED`.

## Data model — events are NOT a single thing with recurrences

Every showtime is an **independent `Event` row**. Wix groups them into a "series" by generating a hidden category and stamping each sibling's `dateAndTimeSettings.recurringEvents.categoryId` with it. There is no parent event — the category IS the series key. Consequences:

- Listings have to group by `recurringEvents.categoryId` client-side.
- `event.categories.categories` contains both the **hidden `RECURRING_EVENT`** series category (whose `_id` equals `recurringEvents.categoryId` and whose `name` equals the movie title) AND any user-added `MANUAL` genre categories. Filter out the series category before rendering genre badges.
- Individual showtimes get their own slug (suffixed with date). Detail pages route by that specific slug.

## Build playbook — cinema from zero

**1. Import types — never `Record<string, any>`.**
```ts
import { wixEventsV2, ticketDefinitionsV2, ticketReservations, categories as categoriesApi } from '@wix/events';

type Event = wixEventsV2.Event & { categories?: wixEventsV2.EventCategories };
type TicketDefinition = ticketDefinitionsV2.TicketDefinition;
type EventCategory = wixEventsV2.EventCategory;
type AvailablePlace = ticketDefinitionsV2.AvailablePlace;
```
`Event.categories` is populated at runtime when the `CATEGORIES` fieldset is requested but is NOT on the typed `Event` shape, so extend it locally.

**2. Request the right fieldsets.** Many event fields are `undefined` unless you ask for them:
- `DETAILS` → `shortDescription`, `mainImage`, `calendarUrls`
- `CATEGORIES` → `categories.categories` (but see coupling note)
- `FORM` → `form.controls`
- `REGISTRATION` → `registration.ticketing`

Empirical bug: `CATEGORIES` alone often returns only the hidden RECURRING_EVENT series category. Adding `FORM` to the same query makes the real MANUAL genre categories come back. Always request `['DETAILS', 'CATEGORIES', 'FORM']` for listings/detail pages.

**3. Paginate. `limit()` caps at 200.** With weekly recurrences over a year you will easily clear 300 events. Use `.next()`:
```ts
let page: wixEventsV2.EventsQueryResult | undefined
  = await queryEvents({ fields }).ne('status', 'CANCELED').limit(200).find();
while (page) {
  events.push(...(page.items ?? []));
  if (!page.items || page.items.length < 200) break;
  page = await page.next();
}
```

**4. Use proper function casts on `auth.elevate()`.** The SDK overloads (one signature for real call, one for HttpClient variant) confuse TypeScript through `auth.elevate`. Cast explicitly:
```ts
const createEvent = auth.elevate(wixEventsV2.createEvent) as (
  event: wixEventsV2.Event,
  options?: wixEventsV2.CreateEventOptions,
) => Promise<wixEventsV2.Event>;
```

## Posters (mainImage) — gotchas that will waste half a day

`Event.mainImage` is a `wix:image://v1/<fileId>/<displayName>#originWidth=<w>&originHeight=<h>` URI. Getting this to actually persist requires ALL of:

1. **Import the file via `files.importFile` and WAIT for READY state.** `importFile` returns synchronously with `operationStatus: 'PENDING'`. If you build the URI before the file is READY and attach it to an event, Wix silently drops it. Poll `files.getFileDescriptor(fileId)` until `operationStatus === 'READY'` (up to ~15s).

2. **Include `#originWidth=W&originHeight=H`.** Without the dimension hash fragment the Events API silently drops `mainImage` (no error, no field in response, never surfaces in the dashboard). With it, the field persists.

3. **Use a URL-safe display name.** Encoded characters like `%3A` inside the path segment may also be silently dropped. Slug the name: `lowercase()`, replace non-`[a-z0-9.]+` with `-`, strip leading/trailing `-`.

4. **Set it via `updateEvent`, not `createEvent`.** `createEvent` accepts `mainImage` in its input type (it typechecks) but the server drops it during creation. Workflow: `createEvent` without image → list siblings → `updateEvent(id, { event: { mainImage }, fields: ['DETAILS'] })` per sibling.

Working URI builder:
```ts
function buildWixImageUri(fileId: string, displayName: string, w: number, h: number): string {
  const safe = displayName.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/(^-|-$)/g, '');
  return `wix:image://v1/${fileId}/${safe}#originWidth=${w}&originHeight=${h}`;
}
```

The `_id` returned by `importFile` already carries the `~mv2.png/jpg` suffix required by the URI format — don't strip it.

## Recurring series — how to create + the phantom-sibling bug

**Creating N weekly showtimes in one call:**
```ts
const individualEventDates = Array.from({ length: 52 }, (_, i) => {
  const start = new Date(firstWeekStart);
  start.setDate(start.getDate() + i * 7);
  const end = new Date(start);
  end.setHours(start.getHours() + 2);
  return { startDate: start, endDate: end, timeZoneId: 'Asia/Jerusalem' };
});

await createEvent({
  title, shortDescription,
  dateAndTimeSettings: {
    startDate: individualEventDates[0].startDate, // REQUIRED at top-level
    endDate:   individualEventDates[0].endDate,   // REQUIRED at top-level
    timeZoneId: 'Asia/Jerusalem',                  // REQUIRED
    recurringEvents: { individualEventDates },
  },
  location: { type: 'VENUE', name: '...' },
  registration: { initialType: 'TICKETING' },
}, { draft: false });
```

Gotchas:
- `timeZoneId`, `startDate`, and `endDate` are REQUIRED on `dateAndTimeSettings`. The validation error misleadingly says "getTimeZoneId is not supported" — it actually means one of those three is missing.
- Without top-level `startDate`/`endDate` you get `endDate.isDefined must be true, startDate.isDefined must be true`. You must set them (usually to the first occurrence), and this is what produces the phantom-sibling bug below.

**Phantom-sibling bug:** Wix sometimes creates an extra sibling at `individualEventDates[0]` — one from the top-level `startDate`, one from the list. You end up with N+1 events for a size-N list, duplicated at the first timestamp. **Fix in the seed, not the UI.** After creation, group siblings by `startMs`; if two share a timestamp, cancel+delete one.

**Sibling indexing is asynchronous.** After `createEvent` returns, siblings trickle in over several seconds. Poll `queryEvents` and filter by `recurringEvents.categoryId` until the expected count appears, up to 30 attempts × 1.5s for long series.

## Checkout: go through the hosted flow, not `orders.checkout`

There are TWO APIs that look like "checkout an order"; only one triggers payment.

- `orders.checkout(eventId, { reservationId, buyer, guests })` creates an Order row in PENDING state AND returns `orderPageUrl`. That URL is a **view-order page** for admins, not a payment page. The user never pays, the guest list in the dashboard stays empty. **Do not use this for self-serve bookings.**

- `redirects.createRedirectSession({ eventsCheckout: { reservationId, eventSlug }, callbacks, preferences })` returns `redirectSession.fullUrl` pointing at Wix's hosted `/event-details/<slug>/ticket-form` page. That page collects buyer info, handles coupons/gift cards, runs payment, then redirects to `callbacks.thankYouPageUrl`. **This is the correct flow.**

Minimal client-side booking flow:
```ts
import { ticketReservations } from '@wix/events';
import { redirects } from '@wix/redirects';

const reservation = await ticketReservations.createTicketReservation({
  tickets: [{ ticketDefinitionId, quantity }], // or { ..., ticketInfo: { seatId } } per seat
});
const { redirectSession } = await redirects.createRedirectSession({
  eventsCheckout: { reservationId: reservation._id!, eventSlug },
  callbacks: {
    thankYouPageUrl: window.location.origin + '/cinema/thank-you',
    postFlowUrl: window.location.origin + '/cinema',
  },
  preferences: { checkIfPublish: true }, // always include on Wix redirects from headless
});
window.location.href = redirectSession!.fullUrl!;
```

Because Wix's hosted ticket-form collects buyer details, **drop any local buyer form fields** — they don't carry over and duplicating them is bad UX.

## Ticket definitions

Required fields for `createTicketDefinition`:
```ts
{
  eventId,
  name, description,
  feeType: 'FEE_ADDED_AT_CHECKOUT',
  pricingMethod: { fixedPrice: { value: '12.00', currency: 'ILS' } },
  initialLimit: 200,
}
```

Fieldsets for `queryAvailableTicketDefinitions`:
- `SEATING_DETAILS` → `seatingDetails.places[]` (only populated if event has a seating plan)
- `SALES_DETAILS` → current availability, actualLimit
- `POLICY` → refund/transfer policy
- `EVENT_DETAILS` → denormalized event info

## Seating

Wix SDK reads seat data but cannot **create** a seating plan — that is dashboard-only. When a site owner attaches a plan to an event:
- `td.seatingDetails.places[]: AvailablePlace` lists `{ placeId, label, sectionLabel, elementLabel ("Row" | "Table" | "General Admission"), availableCapacity }`. `placeId` has the format `{sectionId}-{elementId}-{label}` (e.g. `0-1-A5`).
- `td.actualLimit` replaces `initialLimit` once a plan is attached.
- When reserving, pass `ticketInfo.seatId = place.placeId` on the `TicketLineItem`. `seatInfo` (readonly) is populated in the response with section/row/seat labels.

UI pattern: if `seatingDetails.places.length > 0`, render a seat grid (group by `elementLabel`) with multi-select; otherwise render a quantity stepper.

## Categories

`categoriesApi` has MANUAL (user-created genres) and RECURRING_EVENT (auto-generated series key) states.

- `createCategory({ name })` — creates a MANUAL category.
- `assignEvents(categoryId, [eventId])` — attaches categories to events. Assign to every sibling individually; there's no "assign to series".
- `queryCategories()` returns the full `Category` type with `.states` (NOT `.type`). Check `c.states?.includes('MANUAL')` to find user categories you can safely delete.

When cleaning up for a fresh seed, delete MANUAL categories after deleting their events — the RECURRING_EVENT categories clean up automatically.

## Modifying the checkout form (phone, custom fields)

Don't patch `event.form.controls` through `updateEvent`. Use the dedicated `@wix/events` → `forms` namespace:

```ts
import { forms as eventForms } from '@wix/events';
await auth.elevate(eventForms.addControl)(eventId, {
  phone: { label: 'Phone Number', mandatory: false },
});
// or: text, dropdown, checkbox, radioButton, address, date, additionalGuests
// Update existing: forms.updateControl({ eventId, _id }, { ... })
// Remove: forms.deleteControl({ eventId, _id })
```

One control per `addControl` call — the options type is a `oneOf` over control kinds. `addControl` appends to the end; there's no `orderIndex` argument.

## Flipping form-per-order → form-per-ticket

Setting `registration.tickets.guestsAssignedSeparately = true` makes Wix's hosted ticket-form collect attendee details once per ticket instead of once per order (you'll see a new "2. Tickets Details" step between "Add your details" and "Payment").

Update it through `updateEvent`, but pass ONLY the delta — do NOT spread the full `registration` object, or you'll trip `INVALID_FIELD_MASK`:

```ts
await updateEvent(ev._id, {
  event: { registration: { tickets: { guestsAssignedSeparately: true } } },
});
```

## Movie-level routing for recurring series

If every occurrence is its own Event with its own Wix-generated slug (e.g. `purr-assic-park-2026-04-22-20-00-2`), don't use that slug as the detail URL — link by a stable title-derived slug (`purr-assic-park`) and let the detail page resolve it to the earliest upcoming sibling. Ticket defs are per-event so your booking component needs to swap its `eventId` when the user changes date:

1. SSR renders with `current = earliest-upcoming sibling`. Tickets for that event are fetched server-side (names/prices match across siblings).
2. Client owns a `selectedEventId` state; a dropdown (or chips for few options) switches it without navigation.
3. On Book: if selection differs from SSR's event, client calls `ticketDefinitionsV2.queryAvailableTicketDefinitions({ filter: { eventId: selected } })`, maps the user's qty-by-tier-**name** to the fresh `_id`s, reserves, redirects.

Key state trick: key qty/seat state by `td.name`, not `td._id`, so state survives a date change.

## Seed pattern (idempotent re-run)

```
1. Loop up to N passes: fetch ALL events (paginated), cancelEvent + deleteEvent each.
   (Async sibling indexing means one pass misses newcomers.)
2. Delete MANUAL categories.
3. Create genre categories (MANUAL).
4. For each movie: generate/import poster, waitForFileReady.
5. For each movie: createEvent with N individualEventDates, record the returned
   seriesCategoryId.
6. Per movie, poll (with longer wait for longer series) until sibling count ≥
   expected. Dedupe by startMs; cancel+delete duplicates.
7. For each survivor: updateEvent mainImage, createTicketDefinition × N tiers,
   assignEvents(genreCategoryId, [eventId]) for each genre.
8. Final sweep: any event whose recurringEvents.categoryId isn't one of our
   series is an orphan — delete it.
9. Verify: every event has mainImage, matches a known series.
```

Always present data as-is in the UI; if something looks off, fix the seed.

## UI pitfalls

- **Do not dedupe showtimes or merge fields across siblings in the UI.** If the seed produces clean data, one representative sibling per series has everything you need. Merging hides seed bugs.
- **Clear Vite's optimize cache (`node_modules/.vite`) and restart dev if you see `504 Outdated Optimize Dep` on client components.** This bites client-hydrated booking components hard — hydration silently fails, +/- buttons don't work.
- **Locale-aware formatting.** Use `new Intl.DateTimeFormat(locale, ...)` and `new Intl.NumberFormat(locale, { style: 'currency', currency })` — never hardcode.

## Image generation (DALL-E) for seed posters

`OPENAI_API_KEY` must be in `.env.local` (the dev server loads it via dotenv — `process.env.OPENAI_API_KEY` works inside API routes).

```ts
const res = await fetch('https://api.openai.com/v1/images/generations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
  body: JSON.stringify({ model: 'dall-e-3', prompt, size: '1024x1792', n: 1 }),
});
const { data } = await res.json();
const imageUrl = data[0].url; // expires in ~1 hour — pipe straight to files.importFile
```

Portrait (1024×1792) for posters. Prompts must explicitly say "vertical portrait orientation, subject upright, head at top of frame, feet at bottom" — otherwise DALL-E sometimes renders the subject sideways inside the portrait canvas and you end up with a rotated-looking poster. Also add "no text" to avoid garbled typography.

## Known quirks / surprises, in one place

| Symptom | Cause | Fix |
|---|---|---|
| Empty `categories.categories` on list pages | `FORM` fieldset missing | Include `FORM` even when you only want categories |
| `mainImage` missing from events | URI lacks `#originWidth=...&originHeight=...` | Always append hash |
| `mainImage` set via `createEvent` drops silently | `createEvent` doesn't persist it | Use `updateEvent` after creation |
| `getTimeZoneId is not supported` | `dateAndTimeSettings.timeZoneId`, `startDate`, or `endDate` missing | Supply all three |
| Extra sibling at first showtime | Top-level startDate duplicates `individualEventDates[0]` | Post-create dedupe by `startMs` |
| Only 200 events returned from queryEvents | `.limit(200)` cap | Paginate via `.next()` |
| `Category.type` is undefined | It's actually `Category.states[]` | Use `states?.includes('MANUAL')` |
| Client component clicks do nothing after SDK edits | Stale `node_modules/.vite` optimize cache | `rm -rf node_modules/.vite` + restart |
| Ticket picker qty buttons disabled at 0 | `limitPerCheckout` undefined treated as 0 | Default to 10 or similar: `td.limitPerCheckout ?? 10` |
| User lands on thank-you without paying | Used `orders.checkout` instead of `redirects.createRedirectSession` | Switch to redirects + eventsCheckout |
| `updateEvent({ event: { form: { controls } } })` → `Invalid field mask: form.controls: UNKNOWN` | v3 REST API doesn't accept `form.controls` as an updatable path despite the SDK type including it | Use `forms.addControl(eventId, { phone: {...} })` etc. |
| `updateEvent({ event: { registration: {...ev.registration, ...} } })` → `INVALID_FIELD_MASK` with many read-only paths listed | Spreading the full `registration` response object sends read-only fields in the write mask | Pass ONLY the sub-tree you want to change: `{ event: { registration: { tickets: { guestsAssignedSeparately: true } } } }` |
