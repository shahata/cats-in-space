# Wix Events / Cinema (Headless)

## Overview

Wix Events provides ticketed and RSVP event management. In this project, it powers the cinema ("The Nebula Theater") with movie screenings as events and seat categories as ticket definitions.

## Required Wix App

**Wix Events & Tickets** — appDefId: `140603ad-af8d-84a5-2c80-a0f60cb47351`

Install via: `POST https://www.wixapis.com/apps-installer-service/v1/app-instance/install`

## SDK Package: `@wix/events`

```typescript
import { wixEventsV2, ticketDefinitions, ticketDefinitionsV2, ticketReservations, orders, tickets } from '@wix/events';
```

### Exported namespaces:
- `wixEventsV2` — create/query/update/publish events
- `ticketDefinitions` / `ticketDefinitionsV2` — manage ticket types (VIP, Standard, etc.)
- `ticketReservations` — hold tickets during checkout
- `orders` — checkout and order management
- `tickets` — individual ticket management (check-in, etc.)
- `categories` — event categories
- `schedule` — event schedules

## Querying Events

```typescript
import { wixEventsV2 } from '@wix/events';
import { auth } from '@wix/essentials';

const elevatedQuery = auth.elevate(wixEventsV2.queryEvents);
const result = await elevatedQuery({
  fields: [wixEventsV2.RequestedFields.DETAILS, wixEventsV2.RequestedFields.URLS],
})
  .ne('status', wixEventsV2.Status.CANCELED)
  .limit(20)
  .find();
const events: wixEventsV2.V3Event[] = result.items ?? [];
```

⚠️ **Use SDK enums, not literals.** `wixEventsV2.RequestedFields.DETAILS`, `wixEventsV2.Status.CANCELED`, etc. Literal strings still compile but silently break if the enum value is ever renamed.

⚠️ **`.find()` is mandatory.** `await wixEventsV2.queryEvents({})` (without `.find()`) resolves to the query **builder**, not a result — `result.items` is `undefined` and the page renders empty with no error.

**Event fields:**
- `_id` — event ID
- `title` — event title
- `slug` — URL-friendly slug
- `shortDescription` — brief description
- `detailedDescription` — full HTML description
- `status` — `DRAFT`, `UPCOMING`, `STARTED`, `ENDED`, `CANCELED`
- `dateAndTimeSettings.startDate` / `endDate` — ISO date strings
- `dateAndTimeSettings.timeZoneId` — timezone
- `location.name` — venue name
- `registration.initialType` — `RSVP` or `TICKETING`
- `eventPageUrl.base` / `.path` — Wix-hosted event page URL

## Creating Events

⛔ **Breaks at runtime: SDK `createEvent()` fails with "System error" in Astro API routes.** → Use the REST API via MCP instead:

```
POST https://www.wixapis.com/events/v3/events
{
  "event": {
    "title": "Movie Title",
    "shortDescription": "Genre | Duration — Description",
    "location": { "name": "Theater Name", "type": "VENUE" },
    "dateAndTimeSettings": {
      "startDate": "2026-04-01T19:30:00Z",
      "endDate": "2026-04-01T22:00:00Z",
      "timeZoneId": "America/Los_Angeles"
    },
    "registration": {
      "initialType": "TICKETING",
      "tickets": { "currency": "USD", "ticketLimitPerOrder": 10 }
    }
  },
  "draft": false
}
```

Setting `draft: false` publishes immediately. Set `draft: true` then call `publishDraftEvent()` for two-step flow.

## Ticket Definitions

Create ticket tiers for each event:

```
POST https://www.wixapis.com/events-ticket-definitions/v3/ticket-definitions
{
  "ticketDefinition": {
    "eventId": "<event-id>",
    "name": "VIP Front Row",
    "description": "Premium seating",
    "pricingMethod": { "fixedPrice": { "value": "25.00", "currency": "USD" } },
    "feeType": "FEE_INCLUDED",
    "policyText": "No refunds."
  }
}
```

**SDK alternative (for querying):**
```typescript
const elevatedQuery = auth.elevate(ticketDefinitionsV2.queryTicketDefinitions);
const defs = await elevatedQuery({ eventId }).find();
```

## Ticket Purchase Flow (Headless)

### 1. Create Ticket Reservation

```typescript
import { ticketReservations } from '@wix/events';

const elevatedReserve = auth.elevate(ticketReservations.createTicketReservation);
const reservation = await elevatedReserve({
  tickets: [
    { ticketDefinitionId: 'vip-def-id', quantity: 2 },
    { ticketDefinitionId: 'standard-def-id', quantity: 3 },
  ],
});

const reservationId = reservation._id; // NOT reservationId — it's _id
```

**GOTCHA:** The `TicketReservation` payload uses `tickets` (array of `TicketLineItem`), NOT `ticketQuantities`. The returned reservation uses `_id`, not `reservationId`. If TypeScript complains about the payload shape, check the installed `@wix/events` types against the runtime — don't paper over mismatches with `as any`.

### 2. Redirect to Wix-Hosted Checkout

```typescript
import { redirects } from '@wix/redirects';

const { redirectSession } = await redirects.createRedirectSession({
  eventsCheckout: {
    reservationId: reservation._id!,
    eventSlug: eventSlug,
  },
  callbacks: {
    thankYouPageUrl: window.location.origin + '/cinema/thank-you',
    postFlowUrl: window.location.origin + '/cinema',
  },
  preferences: { checkIfPublish: true },
});

if (redirectSession?.fullUrl) window.location.href = redirectSession.fullUrl;
```

💡 **Best practice:** Use `redirects.createRedirectSession({ eventsCheckout })` instead of calling `orders.checkout` directly — the Wix-hosted checkout page handles guest forms, login, and payment in one flow. Always include `preferences: { checkIfPublish: true }` so the redirect targets the published site.

## Seating (Custom Implementation)

Wix Events does NOT have built-in seating charts. Implement seating as:
1. **Ticket definitions = seat categories** (VIP, Standard, Balcony)
2. **Custom React component** renders a visual seat grid
3. Selected seats map to ticket definition quantities
4. The reservation tracks total tickets per category, not individual seats

### Seat Map Pattern

```tsx
// Rows A-B = VIP, C-G = Standard, H-J = Balcony
const ROWS = ['A','B','C','D','E','F','G','H','J'];
const SEATS_PER_ROW = 15;

function getCategory(row: string): 'VIP' | 'Standard' | 'Balcony' {
  if (row <= 'B') return 'VIP';
  if (row <= 'G') return 'Standard';
  return 'Balcony';
}
```

Use `window.dispatchEvent(new CustomEvent('cinema-seats-changed'))` with `window.__cinemaSelectedSeats` for cross-component communication between SeatMap and TicketCheckout.

## Gotchas

1. **SDK `createEvent()` may fail in Astro context** — use REST API via MCP for seeding events; SDK works for querying
2. **Ticket reservation uses `_id` not `reservationId`** — the returned `TicketReservation` has `_id`
3. **`createTicketReservation` takes `{ tickets: [...] }`** — not `ticketQuantities`. Use real types, not `as any`.
4. **App must be installed** — Events API returns generic "System error" without the Wix Events app installed
5. **No built-in seating** — implement custom seat selection UI; map to ticket definition categories
6. **Event images** — the Events API supports images but they're set via the REST API `mainImage` field, not easily via SDK
7. **Recurring sibling events need their own translations** — for cinema-style recurring screenings, each `Event._id` is a separate translatable entity. Translating one sibling does not carry over to its siblings; seed translations per-event via the Translation Content API.
8. **Series slug = event slug with date suffix stripped** — recurring event slugs look like `movie-title-2026-04-22-19-30`. Derive the series slug with `slug.replace(/-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}(-\d+)?$/, '')` — don't slugify from `title`, which re-translates per locale. Event slugs are locale-invariant.
