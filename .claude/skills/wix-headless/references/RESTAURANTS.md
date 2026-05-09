# Wix Restaurants (Headless)

## Overview

Wix Restaurants in headless uses three separate systems:
- **Menus** (`@wix/restaurants`) — menu items, sections, labels, modifiers, variants
- **Table Reservations** (`@wix/table-reservations`) — reservations, time slots, locations
- **Online Orders** (`@wix/restaurants`) — operations, fulfillment methods (uses eCommerce cart for checkout)

## Required Wix Apps

These must be installed on the site before the APIs work:
- **Wix Restaurants Menus (New)** — appDefId: `b278a256-2757-4f19-9313-c05c783bec92`
- **Wix Table Reservations** — appDefId: `f9c07de2-5341-40c6-b096-8eb39de391fb`
- **Wix Restaurants Orders (New)** — appDefId: `9a5d83fd-8570-482e-81ab-cfa88942ee60`

Install via: `POST https://www.wixapis.com/apps-installer-service/v1/app-instance/install` with `{ tenant: { tenantType: "SITE", id: "<siteId>" }, appInstance: { appDefId: "<id>", enabled: true } }`

## Build playbook — from zero to a fully-featured restaurant

Skipping any step here leaves the site broken in ways that show up deep in the checkout flow (missing address, "item no longer available", empty Day dropdown). Do these in order; each one is cheap if you have the previous ones.

**1. Install the three apps** and confirm from the dashboard that Menus, Reservations, and Orders panels exist. `APP_NOT_INSTALLED` is the error surface if one is missing.

**2. Configure the restaurant in the Wix dashboard.** The headless frontend only reads what's configured here — it can't make up missing data:
   - **Business Info → Business Location**: full street address. Pickup orders send this as the cart's `contactInfo.address`; skip it and cart-v2 rejects every pickup with `DELIVERY_METHOD_MISSING_ADDRESS`.
   - **Menus**: at least one menu, with sections and items. Label Library populated (prefer the built-in icon-bearing labels — Vegan, Gluten-free, Pork, Hot, etc.).
   - **Online Ordering → Operations**: at least one Operation. This one record drives the entire ordering UX — see "Operation fields the frontend reads" below.
   - **Online Ordering → Fulfillment Methods**: enable Pickup and/or Delivery as your restaurant supports. (DINE_IN exists but our OLO flow filters it out.)
   - **Menu Ordering Settings** (auto-wired when operations are created): links menus → operations and sets `onlineOrderingEnabled` per menu. The menu page shows everything; the ordering page filters to `onlineOrderingEnabled` only.
   - **Reservations → Reservation Location**: at least one, with weekly hours. Without it `reservations.createReservation()` throws.
   - **Scheduling** on the Operation: if you want users to schedule future orders, set `asapFutureHandlingType: BUSINESS_DAYS_AHEAD_HANDLING` with `businessDaysAheadHandlingOptions.daysCount > 0` (a value of `0` means "today-only", which hides future days from the Day dropdown).

**3. Seed menu data** if you're doing it programmatically — bottom-up: variants → labels → modifiers → modifier groups → items → sections → menus. See "Seeding Menu Data" below for the exact call order and "Seeding: exercise every modifier type" for the coverage matrix.

**4. Scaffold the pages.** Four routes, plus the global cart sidebar from the store integration:

| Route | Purpose |
|---|---|
| `/restaurant` | Read-only printed-menu display (all menus, including non-orderable) |
| `/restaurant/order` | Online ordering (filtered to `onlineOrderingEnabled` menus). Heavy page — see "Data to load on the ordering page" below |
| `/restaurant/reserve` | Table reservation flow (date → party size → time → contact → confirm) |
| `/restaurant/thank-you` | Post-reservation confirmation |

The **cart sidebar** (`src/components/CartSidebar.tsx`) is shared with the store integration — it lists line items, totals, and kicks off checkout via `createCheckoutFromCurrentCart` + `redirects.createRedirectSession` with `preferences: { checkIfPublish: true }` (required for site-specific checkout redirects). Restaurant lines render alongside store lines; render line modifiers from the native `lineItem.modifierGroups` field, not `descriptionLines`.

**5. Wire i18n + RTL.** Every user-visible string goes through `i18n.getTranslationFunction()`. Keys live in `src/translations.json` (source of truth, English defaults) **and** every locale file under `.wix/multilingual/translations/{locale}.json` — the Wix platform loads the per-locale file at request time; forgetting any locale shows raw translation keys. In React components call `i18n.getLocale()` and pass it to every `Intl.NumberFormat` / `toLocaleDateString` / `toLocaleTimeString` — they default to the browser locale, not the site locale. For RTL, the `<html dir>` is set in `Layout.astro` from `i18n.getLocale()`; flip directional glyphs (the Schedule popup's back arrow) with `[dir="rtl"] .cls { transform: scaleX(-1); }`.

**6. Verify the happy path end-to-end** with a realistic seed: add an item with a required modifier + an optional one, open the schedule popup, pick a future slot, checkout. Check both PICKUP and DELIVERY — they differ in what we write to the cart. If anything fails, grep the server's `x-wix-request-id` header against `spiViolations` / `violations` in the cart calculate response — the Restaurants SPI is the source of truth for "is this line item orderable".

### Operation fields the frontend reads

Load via `operations.getOperation(operationId)` in the ordering page's frontmatter. These are the fields that actually drive the UI:

| Path | Purpose |
|---|---|
| `defaultFulfillmentType` | Initial selection for the Pickup / Delivery toggle (`"PICKUP"` or `"DELIVERY"`). Fall back to the first configured fulfillment method if empty. |
| `orderScheduling.type` | `"ASAP"` or `"PREORDER"`. `"PREORDER"` alone means scheduling is always enabled. |
| `orderScheduling.asapOptions.asapFutureHandlingType` | On an ASAP operation, `"BUSINESS_DAYS_AHEAD_HANDLING"` means future orders are allowed, `"NO_FUTURE_HANDLING"` means ASAP-only (hide the Schedule button entirely). |
| `orderScheduling.asapOptions.businessDaysAheadHandlingOptions.daysCount` | How many days ahead preorder reaches. `0` means "today only"; the Day dropdown then renders just today. |
| `orderScheduling.preorderOptions` | For PREORDER operations: the time window configuration (TIME_BOUNDED or WEEKLY_SCHEDULE). |

Pass the two booleans the UI needs as props to the React component: `defaultDispatchType: string` and `schedulingEnabled: boolean`. Derive:

```typescript
const asapFuture = String(op.orderScheduling?.asapOptions?.asapFutureHandlingType || '');
const schedulingEnabled =
  String(op.orderScheduling?.type) === 'PREORDER' ||
  asapFuture === 'BUSINESS_DAYS_AHEAD_HANDLING';
```

When `schedulingEnabled` is false, don't render the Schedule button at all — the cart stays on ASAP and there's no setting to change.

### Data to load on the ordering page

The `/restaurant/order` Astro page runs a lot of SDK calls in frontmatter. This is the actual list, in order — each is cheap and runs elevated:

1. `menus.queryMenus()` — all menus.
2. `menuOrderingSettings.queryMenuOrderingSettings({})` — determine which menus are `onlineOrderingEnabled`, and their operation IDs. Build `Map<menuId, operationId>`; pick a `businessLocationId` from the first settings entry.
3. `locations.getLocation(businessLocationId)` (from `@wix/business-tools`) — fetch the restaurant's street address for pickup dispatch.
4. `fulfillmentMethods.listFulfillmentMethods()` — filter to `enabled !== false` and drop `DINE_IN`.
5. `operations.getOperation(firstOperationId)` — read `defaultFulfillmentType` + scheduling config (see above).
6. `sections.querySections()` — all sections (dedupe by `_id`; the API returns duplicates across menus).
7. `items.queryItems().limit(200)` — all items. Restaurants typically fit under 200; if you're bigger, paginate.
8. `itemLabels.listLabels()` — label name + icon lookup.
9. `itemModifiers.queryModifiers().limit(200)` — individual modifier names + prices.
10. `itemModifierGroups.queryModifierGroups().limit(100)` — groups with `rule` + ordered modifier list.
11. `itemVariants.listVariants()` — variant name lookup (items only reference variants by ID).

Pre-build a plain-object `menuData` (array of `{ _id, name, items: [...] }` per section, ordered per menu) and hand it to the React component — don't re-query on the client. Labels, icons, modifier group rules, variant names: all resolved server-side and flattened into the item DTO.

## SDK Package: `@wix/restaurants`

```typescript
import { menus, sections, items, itemLabels, itemModifiers, itemModifierGroups, itemVariants } from '@wix/restaurants';
```

All queries require `auth.elevate()`.

## Menu Data Model

```
Menu
└── Sections (e.g., Starters, Mains, Desserts)
    └── Items
        ├── Labels (dietary tags: Vegan, Spicy, etc.)
        ├── Modifier Groups (Extra Toppings, Sides, etc.)
        │   └── Modifiers (individual options with prices)
        └── Price Variants (sizes: Small/Medium/Large)
```

## Querying Menu Data

### Items

```typescript
const elevatedQuery = auth.elevate(items.queryItems);
const result = await elevatedQuery().limit(100).find();
const allItems = result.items; // Item[]
```

**Item fields:**
- `_id` — item ID
- `name` — item name
- `description` — item description
- `image` — `{ id, url, height, width }` (NOT a URL string — see Images below)
- `priceInfo.price` — price as decimal string (e.g., `"14.99"`)
- `priceVariants.variants` — array of `{ price: string }` for size variants
- `labels` — array of `{ id: string }` (label IDs, NOT names — see Labels below)
- `visible` — boolean

### Sections

```typescript
const elevatedQuery = auth.elevate(sections.querySections);
const result = await elevatedQuery().find();
const allSections = result.items; // Section[]
```

**Section fields:**
- `_id`, `name`, `description`
- `itemIds` — array of item IDs in this section

**GOTCHA: Duplicate sections.** `querySections` returns sections from ALL menus/locations. Deduplicate by name:
```typescript
const seen = new Set<string>();
const uniqueSections = allSections.filter(s => {
  if (!s.name || seen.has(s.name)) return false;
  seen.add(s.name);
  return true;
});
```

### Labels (resolve IDs to names)

Item labels are stored as `{ id: string }` — just IDs. To get names, fetch the full label list:

```typescript
const elevatedList = auth.elevate(itemLabels.listLabels);
const labelsResult = await elevatedList();
const labelMap = new Map<string, string>();
for (const label of (labelsResult as any)?.labels || []) {
  if (label._id && label.name) labelMap.set(label._id, label.name);
}

// Then resolve per item:
const itemLabelNames = (item.labels || [])
  .map(l => labelMap.get(l.id) || '')
  .filter(Boolean);
```

### Images

Item `image` can be EITHER a plain URL string OR an object `{ id, url, height, width }`. Handle both:

```typescript
function getItemImage(item: any): string | null {
  const img = item.image;
  if (!img) return null;
  if (typeof img === 'string') return getImageUrl(img, 400, 400);
  return getImageUrl(img.url || img.id, 400, 400);
}
```

### Prices

Two pricing modes:
1. **Simple price:** `item.priceInfo.price` — decimal string (e.g., `"14.99"`)
2. **Variants:** `item.priceVariants.variants` — array of `{ priceInfo?: { price: string } }`. The variant's top-level `price` is `@deprecated`; read `v.priceInfo?.price`.

`PriceInfo` has no currency field — fall back to `getSiteCurrency()` (see [SDK_CORE.md → Price Formatting](SDK_CORE.md#price-formatting)). For ranged variant prices, format min and max separately and join with `–`.

## Seeding Menu Data (bottom-up order)

When creating menu data programmatically, build bottom-up per Wix docs:
1. `itemVariants.bulkCreateVariants()` — size variants
2. `itemLabels.createLabel()` — dietary labels
3. `itemModifiers.bulkCreateModifiers()` — individual modifier options
4. `itemModifierGroups.bulkCreateModifierGroups()` — groups linking modifiers
5. `items.bulkCreateItems()` — menu items with labels, modifiers, variants attached
6. `sections.bulkCreateSections()` — sections linking item IDs
7. `menus.createMenu()` — menu linking section IDs

All create methods require `auth.elevate()`.

## Table Reservations

### SDK Package: `@wix/table-reservations`

```typescript
import { reservations, reservationLocations, timeSlots } from '@wix/table-reservations';
```

`@wix/table-reservations` needs the Wix Table Reservations app installed on the site as well as the npm package. Without the app, REST calls return a generic Wix 404 HTML page and SDK calls silently return `undefined`. The CLI starter doesn't install it — add a `scripts/install-apps.mjs` that calls `POST /apps-installer-service/v1/app-instance/install` for `appDefId f9c07de2-5341-40c6-b096-8eb39de391fb` so a fresh clone can reproduce the setup.

⛔ **The reservation-locations REST path is double-segmented:** `/table-reservations/reservation-locations/v1/reservation-locations` (NOT `/table-reservations/v1/reservation-locations` — that path 404s). Same pattern applies to other resources under this app. Use the SDK from Astro pages where possible; in scripts, use the right REST path.

⛔ **The default location is wrong for headless sites.** Installing the app creates a default location named "Location 1" in `Asia/Jerusalem` with country `IL` and an empty street. Reservation slot times will be wrong until you fix the timezone. The reservations API itself can't change the underlying location object (it errors); use the **Locations API** instead: `PUT /locations/v1/locations/{id}` with the full location object (revision required) — set `name`, `timeZone`, `address`. Reservation hours/party size are configured separately on `reservationLocations.configuration.onlineReservations`.

### Get reservation location

```typescript
const elevatedList = auth.elevate(reservationLocations.listReservationLocations);
const result = await elevatedList();
const locationId = result.reservationLocations?.[0]?._id;
const onlineRes = result.reservationLocations?.[0]?.configuration?.onlineReservations;
const businessSchedule = onlineRes?.businessSchedule?.periods || [];
const timeSlotInterval = onlineRes?.timeSlotInterval || 15;
```

### Create a reservation

The reservee fields go under `reservation.reservee`, NOT `reservation.details` (the SDK uses `reservee`, not `contact`):

```typescript
const elevatedCreate = auth.elevate(reservations.createReservation);
const created = await elevatedCreate({
  details: {
    reservationLocationId: locationId,
    startDate: new Date('2026-04-01T19:00:00Z'),
    partySize: 4,
  },
  reservee: { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: '+1234567890' },
  teamMessage: 'Window seat please',  // optional, free-text "special requests"
});
// If `created.paymentStatus === "NOT_PAID"`, the reservation requires a deposit/charge
// — kick off `redirects.createRedirectSession({ ecomCheckout: { checkoutId: created._id } })`.
```

### Reservation flow UX (multi-step)

The single-form pattern (date + dropdown of fixed times → confirm) is broken: it always submits even when the time is unavailable, then errors at create. Instead, use a 3-step wizard that calls `timeSlots.getTimeSlots` for real availability:

1. **Search** — party size + date + an "around" hour. Auto-fetch slots (debounced 250ms) and render a clickable grid; the selected slot is highlighted. The "around" dropdown should be derived from the location's `businessSchedule.periods` for that day-of-week — never hardcode a list of times like `['12:00','12:30',...]`, because closed hours appear and the user gets empty results.
2. **Details** — name (full string, split into first/last on submit), email, phone, optional special requests. Prefill from `members.getCurrentMember` for logged-in users.
3. **Confirm** — read-only summary of date / time / party / contact, then `createReservation`.

```typescript
// Slot fetch: debounced, with cancel-on-rerun, in step "search":
useEffect(() => {
  if (step !== 'search') return;
  if (!locationId || !date || !aroundHour) return;
  let cancelled = false;
  const timer = setTimeout(async () => {
    const result = await timeSlots.getTimeSlots(
      locationId,
      new Date(`${date}T${aroundHour}:00`),
      partySize,
      { slotsBefore: 3, slotsAfter: 6 },
    );
    if (!cancelled) setAvailableSlots(result.timeSlots || []);
  }, 250);
  return () => { cancelled = true; clearTimeout(timer); };
}, [locationId, partySize, date, aroundHour, step]);
```

⛔ **The hour picker derived from `businessSchedule` must handle cross-day periods.** A period with `closeDay !== openDay` (e.g. open Friday → close Saturday at 02:00) means the close time is in the *next* day. If you treat it as same-day you'll generate hours past midnight for the wrong date. Cap end at `24*60 - 1` for cross-day periods. Step at `Math.max(60, timeSlotInterval)` so the dropdown isn't 96 entries long when the location uses 15-min slots.

⛔ **Localized slot labels wrap on two lines in narrow grid cells.** `Date.toLocaleTimeString('en-US')` returns `"08:00 PM"` (or with U+202F NNBSP between time and AM/PM in modern Intl). At cell widths below ~95px proportional-font character widths cause some times to wrap (e.g. "08:00 PM" wraps but "07:15 PM" doesn't). Add `white-space: nowrap` on the slot button and use `repeat(auto-fill, minmax(86px, 1fr))` for the grid.

### Query time slots (one-shot)

```typescript
const elevatedSlots = auth.elevate(timeSlots.getTimeSlots);
const result = await elevatedSlots(
  locationId,
  new Date('2026-04-01T19:00:00'),
  4,
  { slotsBefore: 3, slotsAfter: 6 },
);
// result.timeSlots[].status === 'AVAILABLE' | 'TABLE_COMBINATION_NOT_AVAILABLE' | ...
// result.timeSlots[].startDate is the actual time to feed into createReservation
```

## Online Ordering

Restaurant items are eCommerce catalog items. Use the same `currentCart.addToCurrentCart()` → `createCheckoutFromCurrentCart` → `redirects.createRedirectSession({ ecomCheckout })` flow as the store. See "Data to load on the ordering page" in the Build playbook above for the exact list of SDK calls to make in frontmatter.

The `MenuOrderView` component receives (at minimum):

| Prop | Source |
|---|---|
| `sections` | Pre-built `{ _id, name, items }[]` flattened from menus → sections → items (with label names, variant names, modifier groups all resolved server-side) |
| `currency` | `getSiteCurrency()` — the site's configured payment currency |
| `operationId` | First value of `Map<menuId, operationId>` built from `menuOrderingSettings` |
| `businessLocationId` | From `menuOrderingSettings` |
| `pickupAddress` | `{ addressLine1, city, country, postalCode, subdivision }` from `locations.getLocation()` — required by cart-v2 for pickup |
| `defaultDispatchType` | `operation.defaultFulfillmentType` (`"PICKUP"` / `"DELIVERY"`) |
| `schedulingEnabled` | Derived from `operation.orderScheduling` (see playbook) — hides the Schedule button when false |
| `fulfillmentMethods` | `enabled !== false` + `type !== "DINE_IN"`, mapped to a minimal DTO |

### Restaurants app ID

```typescript
const RESTAURANTS_APP_ID = "9a5d83fd-8570-482e-81ab-cfa88942ee60";
```

This is documented in the SDK's own examples (`@wix/auto_sdk_ecom_cart/.../meta.d.mts`) and is used by the official `@wix/headless-restaurants-olo` service for cart integration.

### Filter to online-orderable menus only

The API distinguishes between **menu display** (what customers see on the printed/browseable menu) and **online-orderable items** (what can actually be ordered through the cart). Menus marked not-orderable must not be added to cart — the cart will reject them at checkout with "no longer available" errors.

```typescript
import { menus, menuOrderingSettings, sections, items, operations } from '@wix/restaurants';

// 1. Query which (menu, operation) pairs are online-orderable
const mosResult = await auth.elevate(menuOrderingSettings.queryMenuOrderingSettings)({});
const operationByMenuId = new Map<string, string>();
for (const s of mosResult.menuOrderingSettings || []) {
  if (s.onlineOrderingEnabled && s.menuId && s.operationId) {
    operationByMenuId.set(s.menuId, s.operationId);
  }
}

// 2. Only render menus present in the map. Track the operationId per item.
```

### Checkout handoff — shared with the store

Restaurant lines live in the same cart as any store products the user has. The same global `CartSidebar` that the store uses renders them side-by-side; `lineItem.modifierGroups` populates for restaurant lines while stores uses `descriptionLines`, so check both in the render loop.

Kicking off checkout from the sidebar:

```typescript
import { currentCart } from "@wix/ecom";
import { redirects } from "@wix/redirects";

const { checkoutId } = await currentCart.createCheckoutFromCurrentCart({ channelType: "WEB" });
// Shared cart spans store + restaurant — switch thankYou/postFlow on current path
const inRestaurant = window.location.pathname.includes("/restaurant/order");
const { redirectSession } = await redirects.createRedirectSession({
  ecomCheckout: { checkoutId: checkoutId! },
  callbacks: checkoutCallbacks({
    thankYouPagePath: inRestaurant ? "/restaurant/thank-you" : "/store/thank-you",
    postFlowPath:     inRestaurant ? "/restaurant/order"     : "/store",
  }),
  preferences: { checkIfPublish: true }, // required for site-specific checkout redirects
});
if (redirectSession?.fullUrl) window.location.href = redirectSession.fullUrl;
```

`preferences.checkIfPublish: true` is not cosmetic — without it the redirect defaults to a generic host and the restaurant-specific checkout configuration doesn't load. Double-check this if you get an error on checkout.

The cart sidebar is the only place where the checkout's `thankYouPageUrl`/`postFlowUrl` are picked based on *where the user is now*, rather than which component initiated the flow. Everywhere else the component knows its own context. The rest of the `callbacks` object comes from the shared `checkoutCallbacks()` helper — see `ECOMMERCE.md` → "Redirect callbacks: always pass all of them".

### catalogReference.options shape — CRITICAL

`catalogReference.options` is typed in the ecom SDK as an opaque `google.protobuf.Struct`, so TypeScript can't catch mistakes here — the wire contract is enforced only by the Restaurants SPI on the server. The correct shape:

```typescript
await currentCart.addToCurrentCart({
  lineItems: [{
    quantity: 1,
    catalogReference: {
      appId: RESTAURANTS_APP_ID,
      catalogItemId: item._id,
      options: {
        operationId,               // the operation from menuOrderingSettings
        menuId,                    // the menu the item belongs to
        menuSectionId,             // ⚠️ NOT sectionId — see note below
        priceVariant: {            // only if a variant is selected
          id: variantId,
          formattedPrice: "$12.99",
        },
        modifierGroups: [          // only if any modifiers are selected
          {
            id: groupId,
            modifiers: [
              { id: modifierId, price: "2.00", formattedPrice: "$2.00" },
            ],
          },
        ],
        specialRequests: "no olives",  // optional
      },
    },
  }],
});
```

⛔ **Don't** pass flat keys like `{ variantId: "...", [groupId]: [...] }` — the cart accepts them but the catalog can't resolve the item on refresh, producing "is no longer available" errors.

Fulfillment lives on the **Cart**, not on the line-item catalog reference — set `selectedShippingOption.code` on the cart (see "Dispatch / fulfillment info must be on the cart" below). `ProtoStructMapper` silently drops unknown keys, so the only fields the catalog reference accepts are `operationId`, `menuId`, `menuSectionId`, optional `priceVariant`, and optional `modifierGroups`.

Wire every "+" / "−" / modal confirm directly to `addToCurrentCart` / `updateCurrentCartLineItemQuantity` / `removeLineItemsFromCurrentCart`, and read line summaries by re-fetching on `cart-updated`. The cart-v2 / restaurants SPI flow needs `selectedShippingOption.code` attached to a populated cart — `updateCurrentCart` calls before the first add silently 404, and the global cart sidebar should reflect what the menu page is doing in real time.

The section field is `menuSectionId` (camelCase of the proto's `menu_section_id`). `ProtoStructMapper` silently drops unknown keys, so a misnamed `sectionId` leaves `menuSectionId` empty and `ItemInSectionValidator` reports "`<item>` is no longer available" at checkout (violation key `restaurants-validations.item-not-in-section-violation`).

### Dispatch / fulfillment info must be on the cart before checkout

The `estimate-totals` / `calculate` step during checkout runs the Restaurants validations SPI, which requires the cart to carry fulfillment details:

- `selectedShippingOption.code` — Wix OLO format: `"{PICKUP|DELIVERY}|ASAP"` (two parts) or `"{TYPE}|{startMs}|{endMs}"` (three parts for a scheduled slot).
- `businessLocationId` — the restaurant's business location (required even for pickup).
- `contactInfo.address` — required for **PICKUP**. Cart-v2 raises `DELIVERY_METHOD_MISSING_ADDRESS` and surfaces "There was an issue updating your fulfillment details." on the checkout page whenever `selectedShippingOption.code` starts with `PICKUP` but no address is set. Send the restaurant's own business location address (fetch via `locations.getLocation()`) — the customer isn't going anywhere for pickup.
- For **DELIVERY**, `contactInfo.address` is optional at this point. Write the code only; the Wix checkout page collects the delivery address from the customer and recalculates. Don't prompt for it on the ordering page — it's redundant with the checkout form.

```typescript
const address = type === "PICKUP" && pickupAddress
  ? { addressLine1: pickupAddress.addressLine1, /* …city, country, etc. */ }
  : null;
await currentCart.updateCurrentCart({
  cartInfo: {
    selectedShippingOption: { code },
    businessLocationId,
    ...(address ? { contactInfo: { address } } : {}),
  },
});
```

**Timing gotcha 1 (empty cart):** calling `updateCurrentCart` before a cart exists returns **404** and the SDK swallows it in a catch, so a mount-time `useEffect` that writes dispatch onto the cart silently no-ops for the empty-cart case. The first `addToCurrentCart` then creates the cart *without* dispatch info, and checkout fails. Solution: re-apply dispatch right after `addToCurrentCart` succeeds — it's idempotent.

**Timing gotcha 2 (hydration race):** if the component hydrates dispatch state from the cart on mount (to restore the user's previous selection on reload), a parallel mount-time `applyDispatchToCart(..., "ASAP")` will resolve first and clobber the scheduled slot back to ASAP before the read finishes. Put the default-write *inside* the hydration branch, only when the cart is missing a code:

```typescript
const cart = await currentCart.getCurrentCart();
const code = cart.selectedShippingOption?.code;
if (code) {
  // parse code, setState
} else if ((cart.lineItems || []).length > 0) {
  // cart exists but has no dispatch — seed PICKUP|ASAP
  await applyDispatchToCart(defaultType, "ASAP");
}
```

### Single-select modifier groups are implicitly required

The Restaurants SPI treats any modifier group with `rule.maxSelections === 1` as **required**, even when `rule.required === false` and no modifier has `preSelected: true`. Submitting a line without a choice for such a group triggers the same `item-not-in-section-violation` wrapper error "`<item>` is no longer available" (misleading, but that's the surface message).

In the modifier-group mapping, promote `maxSelections === 1` to `minChoices ≥ 1` so the UI shows a `*` indicator and disables Add-to-Cart until selected:

```typescript
const rawRequired = !!g.rule?.required;
// Treat radio groups as required regardless of rule.required.
const required = rawRequired || maxSel === 1;
const minChoices = required ? Math.max(1, minSel) : minSel;
```

### Slot times are UTC — bucket by local day

The `/api/restaurant-slots` response (and Wix OLO in general) returns `slot.start` / `slot.end` as **UTC ISO strings**. A slot served in Tel Aviv (GMT+3) at 23:45 local comes back as `"2026-04-21T20:45:00.000Z"`, but to the user it's Today at 11:45 PM — and bucketing by `slot.start.split("T")[0]` puts it on `"2026-04-21"` UTC, which may be a different calendar day than the user sees.

Always bucket by **local** day. Use a helper:

```typescript
const toLocalDayKey = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
```

Apply it everywhere a day-level key is computed: the "Today / Tomorrow / …" dropdown options, the "which day does this slot belong to" filter in the API response, and the button label that maps back to a day name. The scheduled `slot.start` itself stays as a UTC ISO (that's what goes into the cart code) — only the *grouping* uses local day keys.

### "Schedule order" popup — Wolt/DoorDash-style

The expected UX for a restaurant ordering page with scheduling:

- **Hide the button entirely when the restaurant doesn't support preorder.** Don't render a Schedule button that opens to an empty dropdown. Derive `schedulingEnabled` from `operation.orderScheduling` on the server (see playbook) and pass it as a prop; render the button only when true.
- **One button** on the dispatch bar that doubles as the current selection: "Schedule order" (ASAP) or "Tomorrow, Apr 22 · 11:45 PM" (scheduled). Day labels include the localized date (`Intl.DateTimeFormat(locale, { month: "short", day: "numeric" })`) so users can distinguish e.g. two Thursdays in a long preorder window.
- Click → popover step 1: **When?** with two radios (Standard / Schedule) and a Done button that only confirms Standard (ASAP).
- Click the Schedule radio → skip Done, jump **directly** to step 2 (that's how Wolt does it — the Done button is meaningless when you've picked Schedule because you still need to pick a slot).
- Step 2: **Day** dropdown + **Time** dropdown + Confirm. Nothing commits to `selectedSlot` until Confirm — bind the dropdowns to local `draftDay` / `draftSlot` state so closing without confirming leaves the outer UI untouched.
- Don't hard-code a fixed day horizon (e.g. "next 7 days"). Probe up to ~14 days **in parallel** and render only days that came back with slots, so the Day dropdown reflects the restaurant's configured preorder window (`operation.orderScheduling.preorderOptions`) — whether that's 3 days, 7 days, or 30. Selecting "5 days from now" should not be possible if the API returns no slots for it.
- Cache the probe result as `availableDays: { iso; label; slots }[]` and look up `draftSlots` from that cache on day change, instead of re-fetching. It keeps the Time dropdown snappy.
- On reopen when already scheduled, hydrate `draftDay` / `draftSlot` from the current `selectedSlot`, then pass the slot as a `preferSlot` parameter to the probe call — `setState` is async, so the "if not in list, fall back to first" check reads stale closure state and can reset the draft unless you pass the value explicitly.

```typescript
const loadAvailableDays = async (preferSlot?: string) => {
  const candidates = buildScheduleDayOptions(14);
  const results = await Promise.all(candidates.map(async (opt) => {
    const slots = await fetchPreorderSlots(opt.iso);
    return { ...opt, slots };
  }));
  const available = results.filter(d => d.slots.length > 0);
  setAvailableDays(available);
  // Prefer the user's previous slot if still in the list; otherwise first.
  const prefer = preferSlot && available
    .find(d => d.iso === toLocalDayKey(new Date(preferSlot)))
    ?.slots.find(s => s.start === preferSlot);
  const pick = prefer ?? available[0]?.slots[0];
  setDraftDay(pick ? toLocalDayKey(new Date(pick.start)) : "");
  setDraftSlot(pick?.start ?? "");
  setDraftSlots(available.find(d => d.iso === toLocalDayKey(new Date(pick?.start ?? "")))?.slots ?? []);
};
```

**Re-probe when dispatch type changes while the popup is open.** Pickup and delivery can have different preorder windows and different slot lists; keep a `useEffect([dispatchType])` that clears `availableDays` and — if `scheduleOpen && scheduleStep === "schedule"` — calls `loadAvailableDays()` again. Use an initial-mount ref so it doesn't fire on first render.

**Slot API doesn't guarantee order.** `/api/restaurant-slots` returns preorder slots in arbitrary order; sort earliest → latest before rendering the Time dropdown (`slots.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())`).

**Loading state: never flash "No available time slots".** The empty-array default for `slotsByType[dispatchType]` is indistinguishable from "fetched and confirmed empty" — which makes the Standard radio briefly say "No slots" before it settles on "As soon as possible". Track a separate `slotsLoaded` boolean (flip to true in the first fetch's `finally`) and gate the UI three ways: `!loaded ? "Loading…" : hasAsap ? "ASAP" : "No slots"`. Do the same for the Time dropdown via a `draftLoading` flag. Disable Done / Confirm while loading so the user can't commit a stale "no slots" state.

**RTL-aware back arrow.** A literal `←` glyph doesn't mirror under `dir="rtl"`. Flip it with CSS: `[dir="rtl"] .mov-schedule-back { transform: scaleX(-1); }`. Same principle applies to any directional glyph you hand-code — prefer CSS transforms over picking a different Unicode character per direction.

**Locale for Intl calls in React components.** `toLocaleDateString(undefined, …)`, `toLocaleTimeString(undefined, …)`, and `new Intl.NumberFormat(undefined, …)` resolve to the *browser* locale, not the site's active locale. Import `i18n` from `@wix/essentials` and pass `i18n.getLocale()` — it works client-side too (not just in Astro frontmatter). Otherwise a Hebrew site served to an English browser renders weekday names, time formats, and currency symbols in English.

Don't ask for the delivery address on the ordering page — the Wix checkout page collects it, and duplicating the field only introduces divergence. If DELIVERY is selected, write `"DELIVERY|ASAP"` (or the scheduled code) to the cart without `contactInfo.address`; the checkout form handles address + re-calculation.

## UX Patterns for Menu + Online Ordering

A restaurant site has two distinct jobs — showing a menu (read / browse) and taking orders (transactional). Conflating them produces a confusing hybrid that does neither well. Build them as two separate pages.

### Two pages, two purposes

| Page | Route (suggested) | Purpose |
|------|-------------------|---------|
| **Menu** | `/restaurant` | Traditional, read-only presentation — like a printed menu. No add-to-cart, no modals. Sections, dish name ... dotted-leader ... price, description below. Includes non-orderable items (drinks-only menus, printed specials). |
| **Online ordering** | `/restaurant/order` | Transactional, app-like experience for actually placing an order. Filtered to menus with `onlineOrderingEnabled = true` only. Interactive cards, customization modal, cart integration. |

Link from the menu page to the ordering page with a clear CTA ("Order online"). Do NOT hide the read-only menu — some visitors want to browse before committing.

### Online ordering: Wolt/DoorDash-style layout

The pattern visitors expect from modern food-ordering UIs:

- **Sticky left sidebar** — list of section names; clicking scrolls to that section; the currently-visible section is highlighted as the user scrolls. Collapses to a horizontal scrolling row on mobile.
- **Main area** — items grouped by section, rendered as a responsive grid of horizontal cards (image on one side, text on the other).
- **Customization modal** opens on card click — NOT an inline expand. Centered with scale-in animation (do NOT bottom-align it; that's a mobile-only pattern and feels wrong on desktop).

**ESC closes overlays.** Any modal (customization modal) or side panel (cart sidebar) opened over the page content must close when the user hits Escape. Standard web convention — without it, dismissing feels like it needs extra clicks. Pattern:

```typescript
useEffect(() => {
  if (!open) return;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [open]);
```

Hook gated on `open` so the listener is only attached while the overlay is visible. Works for `MenuOrderView`'s customization modal and the global `CartSidebar`.

**Do NOT add a floating "View cart" bar at the bottom of the screen.** The global cart icon (from `Layout.astro`) already shows the live count and opens the cart sidebar. A second cart affordance on the ordering page is redundant, competes for visual attention with the content, and makes the page feel like a dedicated checkout flow rather than a menu. One cart entry point, globally placed.

### Item card anatomy

Each card shows:
- Image (square thumbnail, with placeholder if none)
- Name
- Short description (1–2 lines, truncated)
- Price — see **Card price rules** below
- Dietary labels as small colored badges (Vegan, Spicy, GF, etc.)
- **Quantity badge** in a corner if the item is currently in the cart (e.g., circled `2`)
- **Modifier summary** (optional, only if item is in cart and has selections) — a compact one-line summary like `Medium · Galaxy Gravy, Plasma Pesto` so the user sees what variation this card represents at a glance. Never render an empty string or placeholder text like "Add to cart" as a summary — only render the summary block when it has real content.

### Card price rules

The price a card shows depends on whether it represents a not-yet-ordered item or a specific cart line:

- **Not in cart** → show the base price, or the **minimum** price across `priceVariants` (or `min–max` range if you have room). This is the "starting from" price a new buyer sees.
- **Represents a specific cart line** (the one-card-per-variation rule above) → show the **configured unit price** for that line: `(variant price or base price) + Σ(selected modifiers' additionalPrice)`. NOT the base/min price, and NOT multiplied by quantity (the qty badge already communicates quantity).

Without this rule the grid lies to the user: a line with a large variant and three paid add-ons still shows the base "starting from" price, so the math between card price, qty badge, and cart total doesn't reconcile.

Implement as a helper that takes `(item, line)` and computes base + modifier extras. Fall back to the "not in cart" label when `line` is null.

### Always open the modal — even for no-customization items

It's tempting to short-circuit: "if the item has no variants and no modifiers, skip the modal and add directly to cart." Don't. The modal is valuable for every item because it gives the user:

- A larger view of the image and full description (cards truncate both)
- A quantity stepper (tapping a card five times to add five is awful UX)
- A visible confirmation step (accidental card taps shouldn't silently change the cart)
- Somewhere to type a special request note
- A consistent mental model — every item works the same way

For items with no variants or modifiers, the modal simply hides those sections and shows: image, title, description, quantity stepper, and the primary "Add to cart $X" button. That's still a valid, useful modal.

### Customization modal

When a card is clicked, open a modal with:
- **Variant selector** (if `priceVariants` exist) — radio-style list, one selected by default
- **Modifier groups** — each group is a titled block. Rendering depends on selection rules:
  - `maxSelections === 1` (or required single-choice) → **radio buttons**
  - `maxSelections > 1` or multi-select → **checkboxes**
  - Show "Required" badge on required groups; pre-select the group's default modifier so the user can just hit "Add" for a happy path
  - Show each modifier's price next to its label (e.g., `Galaxy Gravy  +₪1.50`). `+₪0.00` can be hidden for free modifiers.
- **Quantity stepper** (minus / number / plus) — default to 1
- **Special requests textarea** (optional; maps to `options.specialRequests`)
- **Live total** on the primary button — recomputes as user changes selections/quantity: `base + Σ(modifier prices × qty)`
- **Close button** (×) in the header; overlay click also closes

Computing the live total requires resolving the selected variant's price (not the base item price) and summing the prices of all selected modifiers multiplied by the item's quantity.

### Edit-existing-line flow (Wolt-style)

When a card is clicked and the item already exists in the cart with the **same** customization, the modal opens in **edit mode** pre-filled with that line's selections. This is a second distinct interaction — do not silently add another identical line.

Edit-mode modal differs from add-mode:
- Pre-fills all variant/modifier/quantity/note selections from the existing cart line
- Primary button says **"Update order ₪X"** instead of "Add to cart"
- Shows a **banner** ("Editing your order") near the top
- Shows an **"Add another with different options"** link that switches the modal to add-mode (clears the line reference but keeps the current selections as a starting point — the user was about to duplicate, help them)
- Adds a **trash button** (remove-from-cart) in the modal footer

Use distinct busy labels on the primary action based on what operation is in-flight:
- Adding → `t("restaurant.adding")` ("Adding...")
- Updating → `t("restaurant.updating")` ("Updating...")
- Removing → `t("restaurant.removing")` ("Removing...")

Always close the modal after a successful remove — don't rely on React state like `cartLinesByItem` to determine whether to close; it's stale at that moment.

### One card per variation (not per product)

A subtle but important rule: if the same product is in the cart twice with different customizations (e.g., one "Spicy + Large", one "Mild + Small"), show **two separate cards** in the grid — one for each cart line — so the user can edit each variation directly. Don't show a single card that represents both lines ambiguously.

Maintain a `cartLinesByCatalogItemId` lookup (a `Map<catalogItemId, CartLine[]>`) built from `cart.lineItems` with `appId === RESTAURANTS_APP_ID`. For items that appear in the cart, render `Math.max(lines.length, 1)` cards; each card that corresponds to a specific line carries the line reference and opens edit-mode for that exact line when clicked.

Important edge case: **non-customizable items that are already in the cart also open in edit mode**. Wix eCom merges identical non-custom lines into one, so there's still exactly one card — but that card must carry the cart line reference too, not null. Otherwise the modal opens in add-mode (no trash button, no "Update order $X"), and the user loses the ability to remove or adjust the item from the menu. Rule of thumb: if `cartLinesByCatalogItemId[item._id]` has any entries, the card passes one of those lines into `openItem(item, line)` — customizable or not.

### Parsing `catalogReference.options` back out of the cart

To enter edit mode, you need to reverse-map the cart line's `catalogReference.options` back into form state (selected variant id, selected modifier ids per group, special requests text, quantity). Write a defensive extractor because the runtime shapes vary between SDK responses:

- `priceVariant.id` may come as `id` or `_id` or `variantId`
- `modifierGroups[].id` may come as `id` or `_id` or `modifierGroupId`
- `modifiers[].id` may come as `id` or `_id` or `modifierId`
- `options` itself is typed loosely — don't trust field names without fallbacks

If the extractor misses, the user sees an "empty" edit modal and loses their customization. Test editing every modifier shape you build in seed data.

### Cart sidebar ↔ menu page integration

The cart sidebar (global component) and the menu page need to stay in sync via events on `window`:

- **Cart sidebar fires** `cart-updated` after any cart mutation (add/update/remove/qty). Menu page listens and re-fetches cart, which recomputes quantity badges, modifier summaries, and edit-mode routing.
- **Cart sidebar fires** `restaurant-edit-line` when a user clicks a restaurant line in the cart — but ONLY when `window.location.pathname` includes the ordering page route. On other pages, cart items should behave normally (no edit intent). The event carries `{ lineId, catalogItemId }` so the ordering page can find the right line and open edit mode.
- **Menu page fires** `cart-updated` after its own add/update/remove so the cart icon count refreshes.

This event-bus pattern avoids prop-drilling and keeps components decoupled — both can live in the same `Layout` without knowing about each other.

### Rendering modifiers in the cart sidebar

The cart line's native `modifierGroups` field is populated by the Wix Restaurants catalog provider — no extra API call needed. Shape:

```typescript
lineItem.modifierGroups?: Array<{
  name?: { translated?: string; original?: string };
  modifiers?: Array<{
    quantity?: number;
    label?: { translated?: string; original?: string };
    price?: { formattedAmount?: string; amount?: string };
  }>;
}>;
```

Render with group headers + indented rows (NOT flat `Group: A, B, C` tags — the user can't distinguish quantities or per-modifier prices that way):

```
Spice Level:
  1x Mild - Lunar Glow (₪0.00)
Sauce:
  1x Galaxy Gravy (₪1.50)
  1x Plasma Pesto (₪1.50)
```

`descriptionLines` is a separate field used by `@wix/stores` V3 products — it's empty for restaurant lines, so check `modifierGroups` first for restaurant items. Both can coexist in the same render loop.

### Seeding: exercise every modifier type

When seeding menu data, the sample catalog must hit every UI branch so the ordering page can be verified:
- **Required single-choice** (radio, maxSelections=1) with a preselected default — e.g., "Cooking Preference: Medium"
- **Optional multi-choice** (checkbox, maxSelections > 1) — e.g., "Sauces: pick any"
- **Paid modifier** — any non-zero `additionalChargeInfo.additionalCharge` so the `+₪X` price-uplift branch is exercised
- **Free modifier** — at least one zero-price modifier so the no-uplift branch is exercised

For per-item special instructions ("Allergies", "Cooking instructions"), use line-item metadata or a checkout-level `buyerNote`. Wix Restaurants modifier groups are always selectable (radio / checkbox) — there's no free-text option, unlike Wix Stores customizations.
- **Variant-priced items** — at least one item with 2+ price variants
- **Plain item** — at least one item with no variants and no modifiers (to prove the modal works without them too)

Without this coverage you ship UI that looks fine on the items you tested and breaks on the rest.

## Label icons (dietary/allergen tags)

Menu item labels can carry an **icon** (SVG shape) — the only visually distinguishable way to present allergen/dietary info at a glance on a dense menu. Labels are created from the Wix dashboard "Menus → Label Library", or via `itemLabels.createLabel()`. Wix ships a standard set of icon labels (Vegan, Gluten-free, Fish, Pork, Hot, Mild, etc.) — prefer these over label names that duplicate them without icons (e.g., a "Vegan" label with no icon vs. the canonical icon-bearing one).

### Resolving the icon URL — use the SDK helper, not string surgery

`label.icon` comes back from the SDK as a string (often a full URL with an appended hash fragment like `#originWidth=24&originHeight=24`). Do NOT regex-extract shape IDs or build `https://static.wixstatic.com/shapes/...` paths by hand. Use `media.getShapeUrl()` from `@wix/sdk`:

```typescript
import { media } from '@wix/sdk';

// In utils/image.ts
export function getShapeUrl(icon: unknown): string | null {
  if (!icon) return null;
  if (typeof icon === 'string') {
    if (icon.startsWith('http')) return icon;
    return media.getShapeUrl(icon)?.url || null;
  }
  // Defensive: REST response has { id, url } object shape
  if (typeof icon === 'object') {
    const o = icon as { url?: string; id?: string };
    if (o.url?.startsWith('http')) return o.url;
    if (o.id) return getShapeUrl(o.id);
  }
  return null;
}
```

This mirrors the sibling helpers `media.getImageUrl()`, `media.getVideoUrl()`, `media.getAudioUrl()`, `media.getDocumentUrl()`. Whenever the SDK returns a media identifier (image / video / shape / audio / doc), there's a dedicated helper — use it instead of reconstructing URLs.

### Rendering icons on a dark theme

Label SVGs often have no `fill` attribute on their paths — they render black by default. On a dark-themed page that's invisible. Don't fight it with a multi-step `filter: brightness(0) invert(56%) sepia(...) hue-rotate(...)` chain — those are brittle and hard to read. Use CSS `mask-image` instead:

```css
.label-icon {
  display: inline-block;
  width: 14px;
  height: 14px;
  background-color: var(--accent);         /* the color you want */
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-size: contain;
  mask-size: contain;
  -webkit-mask-position: center;
  mask-position: center;
}
```

```jsx
<span
  className="label-icon"
  style={{ WebkitMaskImage: `url(${icon})`, maskImage: `url(${icon})` }}
/>
```

The mask uses the SVG's *shape* (opaque pixels = visible, transparent = hidden) and the surrounding element's `background-color` provides the color. Works regardless of the SVG's internal fills and gives crisp, theme-aware icons.

### Label IDs: SDK uses `_id`, REST uses `id` — be defensive

When iterating an item's `labels` array, the field name varies:

- **Items fetched via SDK** (`items.queryItems()`): each label entry is `{ _id: string }`
- **Items fetched via REST** (direct `POST /items/query`): each label entry is `{ id: string }`

Same for the `modifierGroups` references and similar join-table fields. If your code only reads `l.id` and the data came via SDK, the lookup silently returns `undefined` and labels render as empty — a hard-to-spot bug. Always read both:

```typescript
const labelId = l.id || l._id;
```

This rule applies broadly to Wix SDK responses: favor defensive `_id || id` access on any nested ID field, not just labels.

## Bulk-update gotchas

### Pricing ONE-OF validates even with `fieldMask`

When updating items via `POST /restaurants/menus-item/v1/bulk/items/update` (or the single `PATCH /items/{id}`), a `fieldMask: { paths: ["labels"] }` still requires the request body to pass the item's ONE-OF validation — meaning each item *must* include either `priceInfo` or `priceVariants`, even though you're only updating labels. Omitting price produces:

```
428 Precondition Required — MISSING_ITEM_PRICING: Item must have either price or price variants
```

Echo the existing pricing back in every update, then rely on the `fieldMask` to keep it from being overwritten:

```typescript
{
  item: {
    id: itemId,
    revision: currentRevision,
    priceInfo: { price: existingPrice },       // required even if not changing
    labels: [{ id: newLabelId }],
  },
  mask: { paths: ["labels"] }
}
```

Same pattern likely applies to other Restaurants entities with ONE-OF fields — re-send the existing value to satisfy validation, fieldMask handles scope.

### Revision conflicts in bulk updates are per-item

Bulk update returns `results: BulkItemResult[]` — each item has its own `itemMetadata.success`. One item with a stale revision will fail with `INVALID_REVISION` but the rest succeed. Fetch the fresh revision for the failed item(s) and retry individually via `PATCH /items/{id}` rather than re-running the whole bulk.

## Reservations API shape

`reservations.createReservation()` takes a single `Reservation` object (not `{ reservation: ... }` wrapping). The fields `details`, `reservee`, `teamMessage` live directly on `Reservation`:

```typescript
import type { reservations } from '@wix/table-reservations';

type Reservation = reservations.Reservation;

const reservation: Reservation = {
  details: { reservationLocationId, startDate, partySize },
  reservee: { firstName, lastName, email, phone },
};
if (specialRequests) reservation.teamMessage = specialRequests;  // see exactOptionalPropertyTypes note below

const created = await reservations.createReservation(reservation);
// created._id, created.paymentStatus, etc. — Reservation shape directly, not wrapped
```

The response is also a `Reservation`, not `{ reservation: Reservation }` — read `created._id` and `created.paymentStatus` directly.

### `exactOptionalPropertyTypes` — use conditional assignment, not `|| undefined`

The default Astro/TS strict config sets `exactOptionalPropertyTypes: true`. Under that rule, a field typed as `string | null` (no `| undefined`) cannot accept an explicit `undefined` value even when it's optional. Patterns like:

```typescript
teamMessage: specialRequests || undefined,  // ❌ type error
```

fail type-check. Instead, conditionally assign only when there's a value:

```typescript
if (specialRequests) reservation.teamMessage = specialRequests;  // ✅
```

This is more correct anyway — omitted means "don't send", not "send `undefined`".

## Gotchas

1. **Menu queries require `auth.elevate()`** — but ONLY in server-side code (Astro frontmatter/API routes). **Never use `auth.elevate()` in React client components** — it throws "An elevated client is required to use elevated modules"
2. **Labels are IDs only** — `item.labels` contains `{ id }` objects; fetch names separately via `itemLabels.listLabels()`
3. **Images are objects** — `item.image` is `{ id, url, height, width }`, not a URL string; pass `image.url` to `getImageUrl()`
4. **Prices are strings** — `priceInfo.price` is `"14.99"`, not a number; parse with `parseFloat()`
5. **Variant names are separate** — `item.priceVariants.variants` only has `variantId` and `price`, NOT `name`. Names live in variant definitions fetched via `itemVariants.listVariants()`. Build a `variantId → name` lookup map.
6. **Sections can duplicate** — `querySections()` returns from all menus/locations; deduplicate by name
6. **Apps must be installed** — calling any restaurant API without the app installed gives `APP_NOT_INSTALLED` error
7. **Reservation location required** — table reservations need at least one reservation location configured
8. **`reservations.createReservation()` works client-side without elevation** — visitor-level access is sufficient for creating reservations
