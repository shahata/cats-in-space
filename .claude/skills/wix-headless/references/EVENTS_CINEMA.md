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
const result = await elevatedQuery({}).ne('status', 'CANCELED').limit(20).find();
const events = result.items || [];
```

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
} as any);

const reservationId = reservation._id; // NOT reservationId — it's _id
```

**GOTCHA:** The `TicketReservation` type uses `tickets` (array of `TicketLineItem`), NOT `ticketQuantities`. The returned reservation uses `_id`, not `reservationId`.

### 2. Checkout

```typescript
import { orders } from '@wix/events';

const elevatedCheckout = auth.elevate(orders.checkout);
const result = await elevatedCheckout(eventId, {
  reservationId: reservation._id,
  guests: [
    {
      form: {
        inputValues: [
          { inputName: 'firstName', value: 'Jane' },
          { inputName: 'lastName', value: 'Doe' },
          { inputName: 'email', value: 'jane@example.com' },
        ],
      },
    },
  ],
} as any);
```

**Signature:** `checkout(eventId: string, options?: CheckoutOptions)` — eventId is the FIRST argument, not inside options.

### 3. Redirect

The checkout result may contain a payment URL. If the event is free, it completes immediately. For paid events, redirect to the payment page or use the Wix-hosted checkout form:

```
https://<site-url>/event-details/<slug>/ticket-form?reservationId=<id>
```

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
3. **`checkout()` signature is `(eventId, options)`** — eventId is a separate first argument, not part of the options object
4. **`createTicketReservation` takes `{ tickets: [...] }`** — not `ticketQuantities`; cast as `any` if TypeScript complains
5. **App must be installed** — Events API returns generic "System error" without the Wix Events app installed
6. **No built-in seating** — implement custom seat selection UI; map to ticket definition categories
7. **Event images** — the Events API supports images but they're set via the REST API `mainImage` field, not easily via SDK
