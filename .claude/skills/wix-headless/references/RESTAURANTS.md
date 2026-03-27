# Wix Restaurants (Headless)

## Overview

Wix Restaurants in headless uses three separate systems:
- **Menus** (`@wix/restaurants`) — menu items, sections, labels, modifiers, variants
- **Table Reservations** (`@wix/table-reservations`) — reservations, time slots, locations
- **Online Orders** (`@wix/restaurants`) — operations, fulfillment methods (uses eCommerce cart for checkout)

## Required Wix Apps

These must be installed on the site before the APIs work:
- **Wix Restaurants Menus (New)** — appDefId: `b278a256-2757-4f19-9313-c05c783bec92`
- **Wix Table Reservations** — appDefId: `1380b703-ce81-ff05-f115-39571d94dfcd`
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

The catalog reference uses the Wix Restaurants Menus app ID:
```typescript
const RESTAURANTS_APP_ID = "b278a256-2757-4f19-9313-c05c783bec92";

await currentCart.addToCurrentCart({
  lineItems: [{
    quantity: 1,
    catalogReference: {
      appId: RESTAURANTS_APP_ID,
      catalogItemId: itemId,
      options: {
        // modifier selections, variant ID, etc.
      },
    },
  }],
});
```

## Gotchas

1. **Menu queries require `auth.elevate()`** — but ONLY in server-side code (Astro frontmatter/API routes). **Never use `auth.elevate()` in React client components** — it throws "An elevated client is required to use elevated modules"
2. **Labels are IDs only** — `item.labels` contains `{ id }` objects; fetch names separately via `itemLabels.listLabels()`
3. **Images are objects** — `item.image` is `{ id, url, height, width }`, not a URL string; pass `image.url` to `getImageUrl()`
4. **Prices are strings** — `priceInfo.price` is `"14.99"`, not a number; parse with `parseFloat()`
5. **Sections can duplicate** — `querySections()` returns from all menus/locations; deduplicate by name
6. **Apps must be installed** — calling any restaurant API without the app installed gives `APP_NOT_INSTALLED` error
7. **Reservation location required** — table reservations need at least one reservation location configured
8. **`reservations.createReservation()` works client-side without elevation** — visitor-level access is sufficient for creating reservations
