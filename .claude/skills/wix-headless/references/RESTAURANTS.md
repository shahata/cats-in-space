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
2. **Variants:** `item.priceVariants.variants` — array of `{ price: string }` (e.g., Small $5, Medium $7, Large $9)

```typescript
function getItemPrice(item: any, locale: string): string {
  const fmt = (n: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(n);
  if (item.priceVariants?.variants?.length) {
    const prices = item.priceVariants.variants.map((v: any) => parseFloat(v.price || '0'));
    return fmt(Math.min(...prices)) + (Math.min(...prices) !== Math.max(...prices) ? ` - ${fmt(Math.max(...prices))}` : '');
  }
  return item.priceInfo?.price ? fmt(parseFloat(item.priceInfo.price)) : '';
}
```

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

### Get reservation location

```typescript
const elevatedList = auth.elevate(reservationLocations.listReservationLocations);
const result = await elevatedList();
const locationId = result.reservationLocations?.[0]?._id;
```

### Create a reservation

```typescript
const elevatedCreate = auth.elevate(reservations.createReservation);
const reservation = await elevatedCreate({
  details: {
    reservationLocationId: locationId,
    startDate: new Date('2026-04-01T19:00:00Z'),
    partySize: 4,
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    phone: '+1234567890',
  },
});
```

### Query time slots

```typescript
const elevatedSlots = auth.elevate(timeSlots.getTimeSlots);
const slots = await elevatedSlots({
  reservationLocationId: locationId,
  date: { year: 2026, month: 4, day: 1 },
  partySize: 4,
});
```

## Online Ordering

Restaurant items are eCommerce catalog items. Use the same `currentCart.addToCurrentCart()` → `createCheckoutFromCurrentCart` → `redirects.createRedirectSession({ ecomCheckout })` flow as the store.

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

### catalogReference.options shape — CRITICAL

The cart rejects restaurant items with "no longer available" if `options` is missing required fields or uses a flat structure. The correct shape (per `@wix/headless-restaurants-olo`):

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
        sectionId,                 // the section the item belongs to
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
- **Free-text modifier** (FREE_TEXT) — e.g., "Special note"
- **Paid modifier** — any non-zero price modifier
- **Free modifier** — at least one `+₪0.00` modifier so the UI's zero-price branch is exercised
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
