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
  "staffMember": { "name": "Dr. Smith", "description": "...", "email": "..." },
  "fields": ["RESOURCE_DETAILS"]
}
```

⛔ **Breaks at runtime:** Save `resourceId` from the response — this is used as the staff member's identifier in services and time slots. Using `staffMember.id` instead silently fails. → Always use `staffMember.resourceId` when referencing staff in services and slots.

The response includes:
- `staffMember.id` — staff member GUID
- `staffMember.resourceId` — resource GUID (same as `resource.id`)
- `staffMember.resource.eventsSchedule.id` — schedule GUID for custom working hours

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

⛔ **Breaks at runtime:** `payment.options` must specify either `online: true` or `inPerson: true`. Omitting both causes a validation error even for NO_FEE services. → Always include `payment: { options: { inPerson: true } }` (or `online: true`) on every service.

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

**Use `availabilityCalendar.queryAvailability()` + `redirects.createRedirectSession()`.**

The key insight: `queryAvailability` returns `SlotAvailability` objects that pass **directly** to `createRedirectSession` — no manual slot/resource construction needed.

### Step 1: Query Available Slots

```typescript
import { availabilityCalendar } from "@wix/bookings";
import type { availabilityCalendar as availabilityTypes } from "@wix/bookings";

const result = await availabilityCalendar.queryAvailability(
  {
    filter: {
      serviceId: [serviceId],
      startDate: "2026-03-22T00:00:00.000Z",
      endDate: "2026-03-23T00:00:00.000Z",
      // Optional: filter by staff resource ID
      resourceId: [staffResourceId],
    },
  },
  { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
);

const entries: availabilityTypes.SlotAvailability[] = (result.availabilityEntries ?? []).filter(e => e.bookable);
// Each entry has: entry.slot?.startDate, entry.slot?.endDate, entry.bookable
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
  callbacks: {
    postFlowUrl: window.location.origin + "/bookings",
    thankYouPageUrl: window.location.origin + "/member#bookings",
  },
});
// NOTE: do NOT use preferences.checkIfPublish for bookings — only for eCommerce checkout

window.location.href = redirect.redirectSession.fullUrl;
```

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
  callbacks: {
    postFlowUrl: window.location.origin + "/bookings",
    thankYouPageUrl: window.location.origin + "/member#bookings",
  },
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
9. **queryServices returns `{ services: [...] }`** — NOT `{ items: [...] }`
10. **queryStaffMembers returns `{ staffMembers: [...] }`** — NOT `{ items: [...] }`
11. **Media fields are `wix:image://` strings in SDK** — See `references/MEDIA.md`
