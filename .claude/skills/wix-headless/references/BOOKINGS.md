# Wix Bookings - Managed Headless Guide

## Quickstart — copy the snippets

```bash
SKILL=~/.claude/skills/wix-headless/snippets
cp -R "$SKILL/bookings/." src/
```

That drops `src/components/{BookingFlow, MyBookings}.tsx` and `src/pages/bookings/{index,[slug]}.astro`. Pair with the universal member-area snippets — `MyBookings.tsx` mounts inside the member dashboard as a `data-tab-panel="bookings"` panel.

Customize per site: the staff fallback emoji (`🐱`) in `pages/bookings/*.astro` if your roles map doesn't cover everyone.

This reference is the *why* — `extendedBookings.queryExtendedBookings({ withBookingAllowedActions: true })`, availability fanout, slot timezone handling, the cancel/reschedule allowed-actions pattern, and the `bookings` checkout via `redirects.createRedirectSession({ bookingsCheckout })`.

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
Body: { "category": { "name": "Consultations" } }
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

Reference staff by `staffMember.resourceId` — that's the id services and time slots key off. `staffMember.id` exists but isn't the right handle here.

Portraits live at `staffMember.mainMedia.image`. Top-level `staffMember.image` is silently dropped on create/update.

The REST wire shape for `mainMedia.image` is an object `{ url: 'https://static.wixstatic.com/media/<file-id>' }`, even though the SDK types it as a `wix:image://` string. The endpoint re-imports the URL into Wix media on save (so the file is duplicated under a new id) — for seed scripts that already imported a file via `/site-media/v1/files/import`, build the URL as `https://static.wixstatic.com/media/${file.id}`.

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

`staffMemberIds` takes resource IDs (`staffMember.resourceId`), not staff member IDs.

`payment.options` must specify `online: true` or `inPerson: true` (or both) — omitting both fails validation even for NO_FEE services.

`payment.options.inPerson: true` skips the online checkout — the booking redirect lands on the thank-you page with no payment captured (the model is "studio collects on arrival"). For a headless site that wants payment online, default to `{ online: true, inPerson: false }`; setting both to `true` lets the checkout page expose the choice.

## Querying Services & Staff (Server-Side)

```typescript
import { services, staffMembers } from '@wix/bookings';

type Service = services.Service;
type StaffMember = staffMembers.StaffMember;

const servicesResult = await services.queryServices({});
const allServices: Service[] = servicesResult.services ?? [];

const staffResult = await staffMembers.queryStaffMembers({});
const allStaff: StaffMember[] = staffResult.staffMembers ?? [];

// Map resource IDs to staff members
const staffMap = new Map<string, StaffMember>(
  allStaff.flatMap(s => (s.resourceId ? [[s.resourceId, s] as const] : [])),
);
```

Prefer direct query calls for Bookings queries. `queryServices({})` returns a Promise and the response array is `services`; `queryStaffMembers({})` returns `staffMembers`.

Notable shape: `service.staffMemberIds` holds resource IDs (not staff IDs); `service.payment?.rateType` is an enum (`services.RateType.FIXED`); `service.media?.mainMedia?.image` is a `wix:image://` string. Use the exported `services.Service` type for everything else.

## Booking Flow (Client-Side)

**Canonical pattern: stay on V1 throughout.** `availabilityCalendar.queryAvailability` (V1) is marked `@deprecated` in favor of `availabilityTimeSlots.listAvailabilityTimeSlots` (V2), but `redirects.createRedirectSession({ bookingsCheckout })` still requires V1's `SlotAvailability` shape — there's no V2-aware checkout yet. A clean V1 flow is simpler than a V2-listing + V1-checkout hybrid (same V1 footprint, plus date-format conversion and an extra round-trip).

The TS6387 `@deprecated` hints at V1 call sites are expected. Astro check categorises them as hints (not errors or warnings), so the deploy gate still passes. When Wix ships a V2-aware `bookingsCheckout`, migrate the whole flow at once.

**V1's "any staff" duplication trap:** `availabilityCalendar.queryAvailability` returns one entry per `(time, resource)` pair, not per time. With 8 staff who can each do 11:00 AM, you get 8 entries at "11:00 AM". This only matters when "Any staff" is allowed — pass `resourceId: [selectedStaff]` and you get one entry per time. For a true "Any staff" UX, either dedupe client-side by `slot.startDate` or list with V2 for that screen and re-query V1 at checkout.

### Booking UX Parity

A complete bookings page should render the same information users expect from Wix Bookings:

- Service listing cards with image, category, duration, price/payment mode, staff/provider names, and short description.
- Detail page with service description, selected staff/provider, date picker, available time slots, and checkout button.
- Availability queries use the site's time zone and display slot labels with `i18n.getLocale()`.
- Logged-in member data can prefill buyer/contact fields when the flow collects them locally.
- After booking, the member dashboard Bookings tab lists upcoming and past bookings with locale-formatted date/time, status badge, cancel action, and reschedule link.

### Step 1: List slots (V1 — canonical for staff-pre-selected flows)

```typescript
import { availabilityCalendar } from "@wix/bookings";

const filter: Record<string, unknown> = {
  serviceId: [serviceId],
  startDate: `${date}T00:00:00.000Z`,
  endDate:   `${nextDateISO}`,
};
if (selectedStaff) filter.resourceId = [selectedStaff];

const result = await availabilityCalendar.queryAvailability(
  { filter },
  { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
);
const entries = (result.availabilityEntries ?? []).filter(e => e.bookable);
// `entries` is `SlotAvailability[]` — pass one directly to bookingsCheckout below.
```

The TS6387 `@deprecated` hint at this call site is expected — see the rationale at the top of this section.

### Step 1 alternative: V2 listing (only for "Any staff" UX)

If the UX needs to show one row per time across all staff (V1 produces one row per (time, resource) pair, which duplicates the same time N times), use V2 for listing AND re-query V1 for the picked slot at checkout time. The V2→V1 hybrid only pays off when V1's duplication would otherwise force client-side dedupe.

```typescript
import { availabilityTimeSlots } from "@wix/bookings";

const result = await availabilityTimeSlots.listAvailabilityTimeSlots({
  serviceId,
  fromLocalDate: `${date}T00:00:00`,           // local-time string, no offset
  toLocalDate:   `${date}T23:59:59`,
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  bookable: true,
  // Filter to specific staff via the `resourceTypes` option:
  // resourceTypes: [{ resourceTypeId: STAFF_TYPE_ID, resourceIds: [selectedStaff] }]
});
const slots = result.timeSlots ?? [];
// Display: format `slot.localStartDate` ("YYYY-MM-DDThh:mm:ss" — local, no offset).
// Tag with 'Z' before constructing a Date if you need RFC 3339.
```

Default Wix Bookings staff resource type ID: `1cd44cf8-756f-41c3-bd90-3e2ffcaf1155`. Robust implementations query `resourceTypes` first instead of hardcoding.

When the user picks a V2 slot, re-query V1 for that single time window to get `SlotAvailability` for the redirect:

```typescript
const start = new Date(slot.localStartDate + 'Z');     // tag UTC, treat as local
const end = new Date(slot.localEndDate + 'Z');
const filter: Record<string, unknown> = {
  serviceId: [serviceId],
  startDate: start.toISOString(),
  endDate: end.toISOString(),
};
if (selectedStaff) filter.resourceId = [selectedStaff];
const v1 = await availabilityCalendar.queryAvailability({ filter }, { timezone });
const slotAvailability = (v1.availabilityEntries ?? []).find(e => e.bookable);
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

Use `extendedBookings.queryExtendedBookings(query, options)`:

```typescript
import { extendedBookings } from "@wix/bookings";
import type { extendedBookings as extendedBookingsTypes } from "@wix/bookings";

const result = await extendedBookings.queryExtendedBookings(
  { cursorPaging: { limit: 50 } },
  { withBookingAllowedActions: true },
);

const items: extendedBookingsTypes.ExtendedBooking[] = result.extendedBookings ?? [];
```

The booking data is nested under `eb.booking` (not on `eb` directly), and `allowedActions.cancel` / `allowedActions.reschedule` are booleans. Use the exported `extendedBookings.ExtendedBooking` type for the rest.

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

1. **Staff section** — grid of providers or service staff with photos, names, roles, descriptions
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
9. **Bookings query responses use named arrays** — read `queryServices({}).services`, `queryStaffMembers({}).staffMembers`, and `queryExtendedBookings(query, options).extendedBookings`.
10. **Media fields are `wix:image://` strings in SDK** — See `references/MEDIA.md`
