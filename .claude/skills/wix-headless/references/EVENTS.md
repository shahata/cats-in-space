# Wix Events (Headless)

## Overview

Wix Events powers ticketed and RSVP-based gatherings of any kind — conferences, workshops, classes, festivals, performances, screenings, lectures, meetups, multi-session courses, retreats. Anywhere people register or buy tickets to attend something at a time and place, this is the right tool. Cinema/movie listings are one specific use case (recurring weekly screenings with seat tiers); the same APIs are the backbone for a single-day conference, a 12-week course, a film festival, a concert series, or a one-off charity gala.

Wix Events in headless uses several modules from `@wix/events`:
- `wixEventsV2` — event CRUD and queries
- `ticketDefinitionsV2` — ticket tiers per event (price, limits, seating references)
- `ticketReservations` — short-lived ticket holds (PENDING → CONFIRMED)
- `orders` — the paid order created after payment
- `categories` — genre/track/series categorization of events
- `@wix/media` (`files`) — cover image upload
- `@wix/redirects` (`redirects.createRedirectSession`) — hand off to Wix's hosted ticket-form + payment page

## Required Wix App

- **Wix Events** — install from the dashboard. Without it `auth.elevate(wixEventsV2.queryEvents)` throws `APP_NOT_INSTALLED`. AppDefId: `140603ad-af8d-84a5-2c80-a0f60cb47351`.

## Querying events

```ts
import { wixEventsV2 } from '@wix/events';
import { auth } from '@wix/essentials';

const elevatedQuery = auth.elevate(wixEventsV2.queryEvents);
const result = await elevatedQuery({
  fields: [wixEventsV2.RequestedFields.DETAILS, wixEventsV2.RequestedFields.URLS],
})
  .ne('status', wixEventsV2.Status.CANCELED)
  .limit(20)
  .find();
const events = result.items ?? [];
```

⚠️ **Use SDK enums, not literals.** `wixEventsV2.RequestedFields.DETAILS`, `wixEventsV2.Status.CANCELED`, etc. Literal strings still compile but silently break if the enum value is ever renamed.

⚠️ **`.find()` is mandatory.** `await wixEventsV2.queryEvents({})` (without `.find()`) resolves to the query **builder**, not a result — `result.items` is `undefined` and the page renders empty with no error.

⚠️ **Paginate beyond the 200-item cap.** `queryEvents` enforces a hard `.limit(200)` cap. Without explicit pagination, a 52-week recurring series (one event per occurrence) silently truncates: late siblings just don't appear in the listing. Always loop until exhausted:

```ts
const all: wixEventsV2.Event[] = [];
let page: Awaited<ReturnType<typeof elevatedQuery['find']>> | null =
  await elevatedQuery({ fields: [...] }).limit(200).find();
while (page) {
  all.push(...(page.items ?? []));
  page = await page.next();
}
```

This applies to ticket-definition queries too — series with many tiers across many siblings hit the same cap.

## Data model — recurring series are NOT a single thing with recurrences

Every occurrence is an **independent `Event` row**. Wix groups them into a "series" by generating a hidden category and stamping each sibling's `dateAndTimeSettings.recurringEvents.categoryId` with it. There is no parent event — the category IS the series key. This applies to any recurring pattern: weekly classes, daily workshop sessions, recurring screenings, a multi-day conference where each day is its own event, etc. Consequences:

- Listings have to group by `recurringEvents.categoryId` client-side.
- `event.categories.categories` contains both the **hidden `RECURRING_EVENT`** series category (whose `_id` equals `recurringEvents.categoryId` and whose `name` equals the series title) AND any user-added `MANUAL` track/genre categories. Filter out the series category before rendering badges.
- Individual occurrences get their own slug (suffixed with date). Detail pages route by that specific slug.

## Build playbook — recurring event series from zero

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

**Empirical bug: `CATEGORIES` alone often returns only the hidden `RECURRING_EVENT` series category.** Adding `FORM` to the same query makes the real `MANUAL` track/genre categories come back. Always request `['DETAILS', 'CATEGORIES', 'FORM']` for listings/detail pages.

**Sibling lookup: filter client-side.** `queryEvents`' filter builder doesn't allow nested paths like `.eq('dateAndTimeSettings.recurringEvents.categoryId', id)` — so to find every sibling in a series, paginate the whole event set and filter in memory. Pagination, elevate, and the `auth.elevate(sdkFn) as <signature>` TypeScript cast are all general Wix SDK patterns — see [SDK_CORE.md](SDK_CORE.md).

## `Event.mainImage` — must go through `updateEvent`, not `createEvent`

`Event.mainImage` is a `wix:image://v1/<fileId>/<name>#originWidth=W&originHeight=H` URI. The general URI-shape rules + `files.importFile` READY-polling are in [MEDIA.md](MEDIA.md). The Events-specific trap: **`createEvent` accepts `mainImage` in its input type (it typechecks) but the server drops it during creation.** Workflow:

1. `createEvent` without image → record `seriesCategoryId` from the response.
2. Wait for sibling events to index (async; see "phantom-sibling bug" below).
3. For each sibling: `updateEvent(id, { event: { mainImage }, fields: ['DETAILS'] })`.

## Recurring series — how to create + the phantom-sibling bug

**Creating N recurring occurrences in one call** (example: 52 weekly sessions):
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
  location: { type: 'VENUE', name: '...' }, // or { type: 'ONLINE' } for virtual
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
  callbacks: checkoutCallbacks({
    thankYouPagePath: '/tickets/thank-you',
    postFlowPath: '/tickets',
  }),
  preferences: { checkIfPublish: true }, // always include on Wix redirects from headless
});
window.location.href = redirectSession!.fullUrl!;
```

The reserved `TicketReservation` is keyed by `_id` (NOT `reservationId`). The payload uses `tickets` (array of `TicketLineItem`), NOT `ticketQuantities`. If TypeScript complains about the payload shape, check the installed `@wix/events` types — don't paper over with `as any`.

Because Wix's hosted ticket-form collects buyer details, **drop any local buyer form fields** — they don't carry over and duplicating them is bad UX.

## Thank-you page

The hosted checkout redirects to `thankYouPageUrl` with `?orderNumber=…&eventId=…` appended. A useful thank-you page reads both, fetches the event (for calendar URLs) and the order (for tickets), and surfaces concrete next-step actions. A bare-bones "Thanks!" page wastes the most engaged moment of the flow — users want to download their tickets and add the event to their calendar right now.

Required fetches:

```ts
import { wixEventsV2, orders } from '@wix/events';
import { auth } from '@wix/essentials';

const orderNumber = Astro.url.searchParams.get('orderNumber');
const eventId     = Astro.url.searchParams.get('eventId');

let event: wixEventsV2.Event | null = null;
let order: orders.Order | null = null;

if (eventId) {
  const getEvent = auth.elevate(wixEventsV2.getEvent);
  event = await getEvent(eventId, {
    fields: [wixEventsV2.RequestedFields.DETAILS],
  });
}

if (eventId && orderNumber) {
  const getOrder = auth.elevate(orders.getOrder);
  order = await getOrder(
    { eventId, orderNumber },
    // CRITICAL: without DETAILS+TICKETS the response omits ticketsPdf and tickets[].
    // The option is `fieldset` (singular) — NOT `fields` like other queries.
    { fieldset: [orders.OrderFieldset.DETAILS, orders.OrderFieldset.TICKETS] },
  );
}
```

Surface these on the page (each is conditional — render only when present):
- `order.ticketsPdf` — single PDF with every ticket; primary CTA "Download tickets"
- `event.calendarUrls?.google` — "Add to Google Calendar"
- `event.calendarUrls?.ics` — "Download .ics" (for Apple Calendar / Outlook)
- `event.title` and `event.dateAndTimeSettings?.startDate` — echo back what they bought
- `order.tickets?.length ?? order.ticketsQuantity` — "N tickets"
- A back-link to the events listing

Wrap each fetch in `try/catch` so a missing query param or stale ID falls back to a generic thank-you state instead of erroring the page.

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

Use ticket definitions to model whatever pricing tiers the event has — Early Bird vs Regular vs Student for a conference, VIP vs Standard vs Balcony for a concert, Member vs Non-Member for a workshop, Adult vs Child for a screening.

Fieldsets for `queryAvailableTicketDefinitions`:
- `SEATING_DETAILS` → `seatingDetails.places[]` (only populated if event has a seating plan)
- `SALES_DETAILS` → current availability, actualLimit
- `POLICY` → refund/transfer policy
- `EVENT_DETAILS` → denormalized event info

## Seating

There are two valid patterns depending on whether you use the Wix dashboard's seating plan feature.

### Pattern A — Wix-native seating plan

Wix SDK reads seat data but cannot **create** a seating plan — that is dashboard-only. When a site owner attaches a plan to an event:
- `td.seatingDetails.places[]: AvailablePlace` lists `{ placeId, label, sectionLabel, elementLabel ("Row" | "Table" | "General Admission"), availableCapacity }`. `placeId` has the format `{sectionId}-{elementId}-{label}` (e.g. `0-1-A5`).
- `td.actualLimit` replaces `initialLimit` once a plan is attached.
- When reserving, pass `ticketInfo.seatId = place.placeId` on the `TicketLineItem`. `seatInfo` (readonly) is populated in the response with section/row/seat labels.

UI pattern: if `seatingDetails.places.length > 0`, render a seat grid (group by `elementLabel`) with multi-select; otherwise render a quantity stepper.

### Pattern B — Custom seat UI mapped to ticket-definition tiers

If the event has no Wix seating plan but the site needs a visual seat picker (typical for cinema-style fixed layouts where every showing has the same room), implement seat selection as a custom React component:

1. **Ticket definitions = seat categories** (e.g. VIP / Standard / Balcony, or Front / Mid / Rear). Each definition is one tier.
2. The custom component renders a visual grid; rows are mapped to tiers.
3. Selected seats roll up to ticket-definition quantities — the reservation tracks total tickets per tier, not individual seat IDs.

```tsx
// Example: rows A-B = VIP, C-G = Standard, H-J = Balcony
const ROWS = ['A','B','C','D','E','F','G','H','J'];
const SEATS_PER_ROW = 15;

function getCategory(row: string): 'VIP' | 'Standard' | 'Balcony' {
  if (row <= 'B') return 'VIP';
  if (row <= 'G') return 'Standard';
  return 'Balcony';
}
```

Use `window.dispatchEvent(new CustomEvent('seats-changed'))` with a `window.__selectedSeats` mailbox for cross-component communication between the seat map and the checkout button.

This pattern doesn't reserve specific seats with Wix — it just gates the quantity per tier. Suitable when the venue layout is fixed and the same per occurrence; not suitable when seats need to be marked unavailable across orders.

## Categories

`categoriesApi` has MANUAL (user-created tracks/genres/themes) and RECURRING_EVENT (auto-generated series key) states.

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

Setting `registration.tickets.guestsAssignedSeparately = true` makes Wix's hosted ticket-form collect attendee details once per ticket instead of once per order (you'll see a new "2. Tickets Details" step between "Add your details" and "Payment"). Use this for conferences/workshops where each attendee needs their own name/dietary/accessibility info, not just the buyer.

Update it through `updateEvent`, but pass ONLY the delta — do NOT spread the full `registration` object, or you'll trip `INVALID_FIELD_MASK`:

```ts
await updateEvent(ev._id, {
  event: { registration: { tickets: { guestsAssignedSeparately: true } } },
});
```

## Series-level routing for recurring events

If every occurrence is its own Event with its own Wix-generated slug (e.g. `intro-to-rust-2026-04-22-19-30-2`), don't use that slug as the detail URL — link by a stable title-derived slug (`intro-to-rust`) and let the detail page resolve it to the earliest upcoming sibling. Ticket defs are per-event so your booking component needs to swap its `eventId` when the user changes date:

1. SSR renders with `current = earliest-upcoming sibling`. Tickets for that event are fetched server-side (names/prices match across siblings).
2. Client owns a `selectedEventId` state; a dropdown (or chips for few options) switches it without navigation.
3. On Book: if selection differs from SSR's event, client calls `ticketDefinitionsV2.queryAvailableTicketDefinitions({ filter: { eventId: selected } })`, maps the user's qty-by-tier-**name** to the fresh `_id`s, reserves, redirects.

Key state trick: key qty/seat state by `td.name`, not `td._id`, so state survives a date change.

**Deriving the stable slug from a sibling slug:**
```ts
const seriesSlug = eventSlug.replace(/-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}(-\d+)?$/, '');
```
Don't slugify from `title` instead — `title` re-translates per locale, while event slugs are locale-invariant.

## Online events — `onlineConferencing.session.guestLink`

For events created with `location.type: 'ONLINE'`, Wix populates `event.onlineConferencing.session.guestLink` (and a corresponding `enabled` flag) once the conferencing platform integration is set up. Show the link on the detail page and the thank-you page only when `onlineConferencing?.enabled` is true:

```ts
const guestLink = event?.onlineConferencing?.session?.guestLink;
const onlineEnabled = event?.onlineConferencing?.enabled === true;
```

Don't fall back to `event.location.address` for online events — there is none. Also don't show the link before the user has paid; the page rendering buyer-side detail should gate it on a confirmed order.

## Translations for recurring siblings

Each `Event._id` is a separate translatable entity. Translating one sibling does NOT carry over to its siblings. Seed translations per-event via the Translation Content API — see [TRANSLATIONS_CONTENT_API.md](TRANSLATIONS_CONTENT_API.md). For a 52-week recurring class, that's 52 translation rows per locale, not 1.

## Seed pattern (idempotent re-run)

```
1. Loop up to N passes: fetch ALL events (paginated), cancelEvent + deleteEvent each.
   (Async sibling indexing means one pass misses newcomers.)
2. Delete MANUAL categories.
3. Create track/genre categories (MANUAL).
4. For each series: generate/import cover image, waitForFileReady.
5. For each series: createEvent with N individualEventDates, record the returned
   seriesCategoryId.
6. Per series, poll (with longer wait for longer series) until sibling count ≥
   expected. Dedupe by startMs; cancel+delete duplicates.
7. For each survivor: updateEvent mainImage, createTicketDefinition × N tiers,
   assignEvents(categoryId, [eventId]) for each track/genre.
8. Final sweep: any event whose recurringEvents.categoryId isn't one of our
   series is an orphan — delete it.
9. Verify: every event has mainImage, matches a known series.
```

Always present data as-is in the UI; if something looks off, fix the seed.

## UI pitfall specific to recurring series

Do NOT dedupe occurrences or merge fields across siblings in the UI. If the seed produces clean data, one representative sibling per series has everything you need. Merging hides seed bugs — fix bad data at source, not in the rendering layer. (General UI gotchas like locale formatting and the dev-server Vite cache apply too — see [SDK_CORE.md](SDK_CORE.md).)

## Events-specific quirks

| Symptom | Cause | Fix |
|---|---|---|
| Empty `categories.categories` on list pages | `FORM` fieldset missing | Include `FORM` even when you only want categories |
| `mainImage` set via `createEvent` drops silently | `createEvent` doesn't persist it | Use `updateEvent` after creation |
| `getTimeZoneId is not supported` | `dateAndTimeSettings.timeZoneId`, `startDate`, or `endDate` missing | Supply all three |
| Extra sibling at first occurrence | Top-level `startDate` duplicates `individualEventDates[0]` | Post-create dedupe by `startMs` in seed |
| `Category.type` is undefined | It's `Category.states[]` | Use `states?.includes('MANUAL')` |
| Ticket picker qty buttons disabled at 0 | `limitPerCheckout` undefined treated as 0 | Default to 10 or similar: `td.limitPerCheckout ?? 10` |
| User lands on thank-you without paying | Used `orders.checkout` instead of `redirects.createRedirectSession` | Switch to redirects + eventsCheckout |
| `updateEvent({ event: { form: { controls } } })` → `Invalid field mask: form.controls: UNKNOWN` | v3 REST API doesn't accept `form.controls` as an updatable path despite the SDK type including it | Use `forms.addControl(eventId, { phone: {...} })` etc. |
| `orders.getOrder({ eventId, orderNumber })` returns an order object but `ticketsPdf` / `tickets[]` are missing | The default response only includes a tiny id-ish subset; the option key is `fieldset` (singular) — NOT `fields` as on other queries | Pass `{ fieldset: ['DETAILS', 'TICKETS'] }` to get `ticketsPdf`, `tickets[].ticketPdfUrl`, `walletPassUrl`, `checkInUrl`, `ticketsQuantity`, totals, etc. |
| Translations on one occurrence don't appear on its siblings | Each sibling `Event._id` is its own translatable entity | Seed translations per-event via the Translation Content API |
| `queryEvents({})` returns `{items: undefined}` with no error | Missing `.find()` — the call resolved to a query builder, not a result | Always end with `.find()` |

See [SDK_CORE.md](SDK_CORE.md) and [MEDIA.md](MEDIA.md) for the generic Wix SDK gotchas (pagination cap, `INVALID_FIELD_MASK` from spread, `.vite` optimize cache, `wix:image://` hash-fragment requirement, `importFile` READY polling).
