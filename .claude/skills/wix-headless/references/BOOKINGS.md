# Wix Bookings - Managed Headless Guide

## Overview

Wix Bookings enables appointment-based services with staff management, availability scheduling, and booking flows. In managed headless (Astro + Wix SDK), authentication is automatic.

## Setup

### Install App & Package

```bash
npm install @wix/bookings
```

Install the Bookings app on the site:
```
POST https://www.wixapis.com/apps-installer-service/v1/app-instance/install
Body: { "tenant": { "tenantType": "SITE", "id": "<SITE_ID>" }, "appInstance": { "appDefId": "13d21c63-b5ec-5912-8397-c3a5ddb27a97" } }
```

### SDK Imports (Server-Side Astro)

```typescript
import { services, staffMembers } from '@wix/bookings';
```

### SDK Imports (Client-Side React)

```typescript
import { availabilityCalendar, extendedBookings, bookings } from "@wix/bookings";
import type { availabilityCalendar as availabilityTypes, extendedBookings as extendedBookingsTypes } from "@wix/bookings";
import { redirects } from "@wix/redirects";
```

## Architecture

The Wix Bookings architecture has these key components:
- **Staff Members** — people who provide services, each auto-creates a Resource
- **Resources** — staff or equipment needed for services
- **Services** — appointment, class, or course offerings
- **Booking Policies** — rules for booking, cancellation, rescheduling
- **Categories** — organize services for display
- **Time Slots** — available appointment windows based on staff schedules

## Service Setup Flow (REST API)

### 1. Create Booking Policy

```
POST https://www.wixapis.com/bookings/v1/booking-policies
Body: {
  "bookingPolicy": {
    "name": "My Policy",
    "cancellationPolicy": { "enabled": true, "limitLatestCancellation": true, "latestCancellationInMinutes": 120 },
    "reschedulePolicy": { "enabled": true, "limitLatestReschedule": true, "latestRescheduleInMinutes": 120 },
    "limitLateBookingPolicy": { "enabled": true, "latestBookingInMinutes": 60 }
  }
}
```

### 2. Create Service Category

```
POST https://www.wixapis.com/bookings/v2/categories
Body: { "category": { "name": "Medical Bay" } }
```

Query existing: `POST https://www.wixapis.com/bookings/v2/categories/query` with `{ "query": {} }`

### 3. Create Staff Members

```
POST https://www.wixapis.com/bookings/v1/staff-members
Body: {
  "staffMember": {
    "name": "Dr. Smith",
    "description": "...",
    "email": "...",
    "mainMedia": { "image": { "url": "https://static.wixstatic.com/media/<file-id>" } }
  },
  "fields": ["RESOURCE_DETAILS"]
}
```

⛔ **Breaks at runtime:** Save `resourceId` from the response — this is used as the staff member's identifier in services and time slots. Using `staffMember.id` instead silently fails. → Always use `staffMember.resourceId` when referencing staff in services and slots.

⛔ **Silently dropped:** the portrait field is `staffMember.mainMedia.image`, NOT `staffMember.image`. Setting `staffMember.image` (or any top-level image field) on create or update is silently dropped — the response shows no error and `name`/`description` save fine, but the portrait is missing. → Always nest under `mainMedia.image`.

⛔ **REST wire shape ≠ SDK type:** the SDK type says `mainMedia.image?: string` (a `wix:image://` URI), but at the REST wire level it must be an OBJECT `{ url: 'https://static.wixstatic.com/media/<file-id>' }`. Passing a string returns `400 Expected an object`; passing a `wix:image://...` URL returns `400 'url' must be a valid URL`. The endpoint re-imports the URL into Wix media on save (the file gets duplicated under a new id) — this is wasteful but currently the only working path. → For seed scripts that already imported a file via `/site-media/v1/files/import`, build the staff portrait URL as `https://static.wixstatic.com/media/${file.id}` and let the bookings API re-import it.

⛔ **Skip-on-exists makes images impossible to backfill:** the typical seed pattern (`if (staffByName.has(s.name)) continue;`) means re-running the script after generating images won't attach them. → If your seed is idempotent on staff name, write a separate `fix-staff-images.mjs` that PATCHes `mainMedia.image` on every existing staff record (requires the current `revision`).

The response includes:
- `staffMember.id` — staff member GUID
- `staffMember.resourceId` — resource GUID (same as `resource.id`)
- `staffMember.resource.eventsSchedule.id` — schedule GUID for custom working hours
- `staffMember.mainMedia.image` — portrait object `{ url, id, width, height, ... }`

### 4. Create Services

```
POST https://www.wixapis.com/bookings/v2/services
Body: {
  "service": {
    "type": "APPOINTMENT",
    "name": "My Service",
    "description": "...",
    "defaultCapacity": 1,
    "payment": { "rateType": "NO_FEE", "options": { "inPerson": true, "online": false } },
    "onlineBooking": { "enabled": true, "requireManualApproval": false },
    "staffMemberIds": ["<resource-id-1>", "<resource-id-2>"],
    "category": { "id": "<category-id>" },
    "bookingPolicy": { "id": "<policy-id>" },
    "schedule": { "availabilityConstraints": { "sessionDurations": [30] } }
  }
}
```

⛔ **Breaks at runtime:** `staffMemberIds` takes **resource IDs** (from `staffMember.resourceId`), NOT staff member IDs.

⛔ **Breaks at runtime:** `payment.options` must specify either `online: true` or `inPerson: true`. Omitting both causes a validation error even for NO_FEE services. → Always include `payment: { options: { online: true } }` (or `inPerson: true`) on every service.

⛔ **`payment.options.inPerson: true` skips the online checkout entirely.** The booking redirect (`bookingsCheckout`) lands the user on the **thank-you page** with no payment captured — the assumption is the studio collects cash/card on arrival. For a headless site that wants payment online, set `online: true` and `inPerson: false`. If you want both options, set both `true` and the checkout page exposes the choice. Symptom of getting this wrong: "the booking goes straight to thank-you, never through checkout." → For paid services on a headless site, default to `{ online: true, inPerson: false }`.

## Querying Services & Staff (Server-Side)

```typescript
import { services, staffMembers } from '@wix/bookings';

type Service = services.Service;
type StaffMember = staffMembers.StaffMember;

// queryServices() / queryStaffMembers() return a QueryBuilder — you must call
// `.find()` to execute it. `.items` is on QueryResult, not on the builder.
const servicesResult = await services.queryServices().find();
const allServices: Service[] = servicesResult.items ?? [];

const staffResult = await staffMembers.queryStaffMembers().find();
const allStaff: StaffMember[] = staffResult.items ?? [];

// Map resource IDs to staff members
const staffMap = new Map<string, StaffMember>(
  allStaff.flatMap(s => (s.resourceId ? [[s.resourceId, s] as const] : [])),
);
```

⛔ **Breaks silently:** `await services.queryServices({})` (without `.find()`) resolves to the query **builder**, not the result. `result.services` and `result.items` are both `undefined`, so `allServices` ends up as `[]` with no error — every booking page renders empty. Casting the builder to `any` hides this. Always call `.find()` and use `result.items`.

Service object key fields:
- `service._id` — service GUID
- `service.mainSlug?.name` — URL-friendly slug
- `service.staffMemberIds` — array of resource IDs
- `service.schedule?.availabilityConstraints?.sessionDurations` — durations in minutes
- `service.payment?.rateType === services.RateType.FIXED` — use the enum, not `"FIXED"`
- `service.media?.mainMedia?.image` — `wix:image://` string (see `references/MEDIA.md`)

## Booking Flow (Client-Side)

⚠️ **`availabilityCalendar.queryAvailability` returns one entry per `(time, resource)` pair, NOT per time.** With 8 staff who can each do an 11:00 AM slot, you get 8 entries all at "11:00 AM" — the slot grid renders 11:00 AM 8 times. This duplication is only a problem when "Any staff" is allowed; if the UX always pre-selects a specific staff member (one-staff-per-service or staff-picker-first flow), V1 is fine and is the simpler path. Otherwise migrate to TimeSlots V2 which aggregates resources under a single TimeSlot per time.

ℹ️ **`availabilityCalendar` is marked deprecated by Wix** in favor of TimeSlots V2 (`@wix/bookings` → `availabilityTimeSlots`), but V1 still works and is the only API that produces a `SlotAvailability` shape compatible with `bookingsCheckout`. V1 is also the simpler choice when staff is pre-selected (no duplication, no V2→V1 re-query). Pick based on the UX: **"any staff" listings → V2**, **specific-staff listings → V1 with `resourceId: [...]`**. New code can use either.

### Step 1: List slots (TimeSlots V2 — one slot per time)

```typescript
import { availabilityTimeSlots } from "@wix/bookings";

const result = await availabilityTimeSlots.listAvailabilityTimeSlots({
  serviceId,
  fromLocalDate: `${date}T00:00:00`,           // local-time string, no offset
  toLocalDate: `${date}T23:59:59`,
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  bookable: true,
});
// One TimeSlot per (service, time). Available staff are aggregated under
// `availableResources[].resources[]` (empty by default; pass
// `includeResourceTypeIds: [...]` to populate).
const slots = (result.timeSlots ?? []).filter((s) => s.bookable && s.localStartDate);
// Display: format `slot.localStartDate` ("YYYY-MM-DDThh:mm:ss" — local, no offset).
// Tag with 'Z' before constructing a Date if you need RFC 3339.
```

⛔ **V2 has no `resourceIds` filter.** If the user picks a specific staff member, V2 list won't filter slots to that staff. Two options: (a) keep V1 `queryAvailability` with `resourceId: [...]` for the specific-staff case (no duplicates since only one resource matches), or (b) include resources via `includeResourceTypeIds` and filter client-side. Option (a) is simpler.

⛔ **`includeResourceTypeIds` requires the resource type ID.** It's NOT a staff-specific ID — it's the type. The default Wix Bookings staff resource type ID is `1cd44cf8-756f-41c3-bd90-3e2ffcaf1155` per the official examples, but a robust implementation queries `resourceTypes` first instead of hardcoding.

### Step 1 (alternative): V1 query for a specific tutor

```typescript
// Only when the user picked a specific resourceId. V1 + resourceId filter
// returns one entry per time (since just that one resource matches), which
// avoids the duplication. The result is V1 SlotAvailability — pass directly
// to `bookingsCheckout` without re-querying.
import { availabilityCalendar } from "@wix/bookings";
const result = await availabilityCalendar.queryAvailability(
  { filter: { serviceId: [serviceId], resourceId: [staffResourceId], startDate, endDate } },
  { timezone },
);
const entries = (result.availabilityEntries ?? []).filter(e => e.bookable);
```

### Step 1.5: Re-query V1 for the picked time before checkout

Required when listing came from V2 (V2 TimeSlot ≠ V1 SlotAvailability shape). One-minute window around the chosen `localStartDate` returns a V1 entry with `slot.serviceId`, `slot.scheduleId`, `slot.resource` — everything the redirect needs. Filter by staff if the user picked one.

```typescript
const start = new Date(slot.localStartDate + 'Z');     // tag UTC, treat as local
const end = new Date(start.getTime() + 60_000);
const filter: Record<string, unknown> = {
  serviceId: [serviceId],
  startDate: start.toISOString(),
  endDate: end.toISOString(),
};
if (selectedStaff) filter.resourceId = [selectedStaff];
const result = await availabilityCalendar.queryAvailability({ filter }, { timezone });
const slotAvailability = (result.availabilityEntries ?? []).find(e => e.bookable);
```

### Step 2: Redirect to Booking Checkout

Pass the selected `SlotAvailability` directly — no manual object construction:

```typescript
import { redirects } from "@wix/redirects";

const redirect = await redirects.createRedirectSession({
  bookingsCheckout: {
    slotAvailability: selectedEntry,  // pass the SDK object directly
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
  callbacks: checkoutCallbacks({
    thankYouPagePath: "/member#bookings",
    postFlowPath: "/bookings",
  }),
});
// NOTE: do NOT use preferences.checkIfPublish for bookings — only for eCommerce checkout

window.location.href = redirect.redirectSession.fullUrl;
```

Always build `callbacks` via the shared `checkoutCallbacks()` helper — never inline a partial object. See `ECOMMERCE.md` → "Redirect callbacks: always pass all of them".

## Managing Bookings (Client-Side)

### Query My Bookings

Use `extendedBookings.queryExtendedBookings()` — a query builder with `.limit()` and `.find()`:

```typescript
import { extendedBookings } from "@wix/bookings";
import type { extendedBookings as extendedBookingsTypes } from "@wix/bookings";

const result = await extendedBookings.queryExtendedBookings({
  withBookingAllowedActions: true,
}).limit(50).find();

const items: extendedBookingsTypes.ExtendedBooking[] = result.items;
```

**ExtendedBooking structure** — the actual booking data is nested under `.booking`:
- `eb.booking?._id` — booking GUID
- `eb.booking?.status` — "CONFIRMED", "PENDING", "CANCELED", "DECLINED"
- `eb.booking?.revision` — required for cancel/reschedule
- `eb.booking?.bookedEntity?.title` — service name
- `eb.booking?.bookedEntity?.slot?.startDate` / `endDate` — ISO dates
- `eb.booking?.bookedEntity?.slot?.resource?.name` — staff member name
- `eb.allowedActions?.cancel` — boolean (NOT a string array)
- `eb.allowedActions?.reschedule` — boolean

### Cancel a Booking

```typescript
import { bookings } from "@wix/bookings";

await bookings.cancelBooking(bookingId, {
  revision: booking.revision,  // required
  participantNotification: { notifyParticipants: true },
});
```

## Bookings Page Implementation Guidelines

### Bookings Listing Page

A good bookings listing page has three sections:

1. **Staff section** — grid of medical/service staff with photos, names, roles, descriptions
2. **Services section** — grid of service cards with images, pricing, duration, assigned staff
3. **Policy note** — informational box about booking/cancellation policy

### Staff Section

Display all staff members in a grid. Each staff card shows:
- Photo (or role-based fallback icon)
- Name and description
- Role badge

### Service Cards

Each service card must show:

1. **Image** (from `service.media.mainMedia.image`) or emoji fallback icon
2. **Service name** and tagline
3. **Duration** with clock icon (e.g., "⏱ 30 min")
4. **Pricing** with visual distinction by type:
   - Fixed price: show amount with currency formatting
   - Plan-based: "Members only" with star badge (⭐)
   - Free: "Free" text
5. **Assigned staff** as small pills with emoji + name
6. **"Book Now" CTA** linking to detail page

### Price Display by Type

Visually distinguish the three pricing types:
- **Fixed price** — show formatted amount
- **Plan-based** — indicate "Members only" or similar
- **Free** — show "Free" text

### Service Image Extraction

Service media in SDK returns `wix:image://` strings. Handle both string and object formats:

```typescript
let imageUrl: string | null = null;
const img = service.media?.mainMedia?.image;
if (typeof img === 'string') {
  imageUrl = getImageUrl(img, 400, 300);
} else if (img?.url || img?.id) {
  imageUrl = getImageUrl(img.url || img.id, 400, 300);
}
```

### Staff-to-Service Mapping

Map staff by `resourceId` (NOT `staffMember.id`):

```typescript
const staffMap = new Map(allStaff.map(s => [s.resourceId, s]));
const serviceStaff = service.staffMemberIds?.map(id => staffMap.get(id)).filter(Boolean) || [];
```

### Booking Detail / Flow Page

The booking detail page should include:
1. Service info (name, description, image, duration, price)
2. **BookingFlow component** (`client:load`) — a multi-step wizard:
   - **Step 1: Staff selection** (skip if only 1 provider) — grid with "Any available" option
   - **Step 2: Date picker** — date input with min (tomorrow) and max (30 days) constraints
   - **Step 3: Time slots** — grid of available times from `queryAvailability`
   - **Step 4: Confirmation** — review card with all booking details, then redirect to checkout

### BookingFlow Progress Indicator

Show dots/steps so users know where they are in the process:

```tsx
const steps = staffCount > 1 ? ['staff', 'date', 'time', 'confirm'] : ['date', 'time', 'confirm'];
```

### "Find Available Date" Feature

When no slots are available for a selected date, offer a "Find next available" button that scans forward 30 days:

```typescript
async function findNextAvailable() {
  for (let d = 1; d <= 30; d++) {
    const date = addDays(new Date(), d);
    const result = await availabilityCalendar.queryAvailability({
      filter: { serviceId: [id], startDate: date.toISOString(), endDate: nextDay.toISOString() },
    }, { timezone, slotsPerDay: 1 });
    if (result.availabilityEntries?.some(e => e.bookable)) return date;
  }
  return null; // No availability in 30 days
}
```

### Booking Checkout

Pass the `SlotAvailability` object directly to `createRedirectSession` — do NOT manually construct slot objects:

```typescript
const redirect = await redirects.createRedirectSession({
  bookingsCheckout: {
    slotAvailability: selectedEntry, // pass SDK object directly
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
  callbacks: checkoutCallbacks({
    thankYouPagePath: "/member#bookings",
    postFlowPath: "/bookings",
  }),
});
// NOTE: do NOT use preferences.checkIfPublish for bookings — only for eCommerce checkout
```

## Tips & Gotchas

1. **staffMemberIds = resource IDs** — Services reference staff by their `resourceId`, not their `staffMember.id`
2. **payment.options required** — Even NO_FEE services must set `inPerson: true` or `online: true`
3. **Use SDK methods, not REST** — Use `availabilityCalendar.queryAvailability()` for slots, `extendedBookings.queryExtendedBookings()` for bookings, `bookings.cancelBooking()` for cancellation. Don't use `httpClient.fetchWithAuth` with manual REST URLs — the SDK handles auth, types, and response shapes correctly
4. **Pass SlotAvailability directly** — The object from `queryAvailability` passes directly to `createRedirectSession({ bookingsCheckout: { slotAvailability } })`. Don't construct slot objects manually — you'll get field names wrong (`_id` vs `id`, etc.)
5. **ExtendedBooking nesting** — The booking data is at `eb.booking?.bookedEntity`, not `eb.bookedEntity`. AllowedActions are booleans (`eb.allowedActions?.cancel`), not a string array
6. **cancelBooking requires revision** — Pass `booking.revision` in the options
7. **Staff default to business hours** — By default, staff work during business opening hours. Use Assign Working Hours Schedule for custom hours
8. **Category required for visibility** — Services without a `category.id` won't appear on the live site
9. **`queryServices().find()` returns the standard QueryResult shape** — read `result.items`, just like every other Wix SDK query. Same for `queryStaffMembers().find()`. (Earlier guidance about a `services`/`staffMembers` field was a misread — the example at "Step 1: Query services" is canonical.)
10. **Media fields are `wix:image://` strings in SDK** — See `references/MEDIA.md`
