# Astro + Wix SDK — Core Patterns

## Authentication is Automatic

In a Wix managed headless project, you do **not** need to create an SDK client or handle OAuth. The `@wix/astro` integration handles all authentication. Import SDK modules and use them directly:

```astro
---
import { items } from '@wix/data';

const result = await items.query('MyCollection').find();
const myItems = result.items;
---
```

## Data Item Shape

⛔ **Breaks at runtime** — Items from `items.query().find()` have fields **directly on the object**, not nested under `.data`. The REST API uses `.data`, but the SDK does not.

```typescript
result.items[0].title      // ✅ correct
result.items[0]._id        // ✅ correct
result.items[0].data.title // ❌ TypeError — .data does not exist in SDK
```

## Query API

```typescript
import { items } from '@wix/data';

const result = await items.query('CollectionId').find();
await items.query('Collection').descending('score').find();
await items.query('Collection').eq('status', 'Active').find();
await items.query('Collection').limit(4).find();
```

### Result Shape

```typescript
result.items        // Array of items
result.totalCount   // Total count (if requested)
result.hasNext()    // Whether there are more pages
```

## Dynamic Routes

Use Astro's `[slug].astro` pattern — no `getStaticPaths()` needed since `output: "server"`:

```astro
---
import { items } from '@wix/data';
const { slug } = Astro.params;
const result = await items.query('MyCollection').eq('slug', slug).find();
if (result.items.length === 0) return Astro.redirect('/');
const item = result.items[0];
---
```

## CMS Collections

### Creating via REST API / MCP

**Endpoint:** `POST https://www.wixapis.com/wix-data/v2/collections`

```json
{
  "collection": {
    "id": "MyCollection",
    "displayName": "My Collection",
    "displayField": "title",
    "fields": [
      { "key": "title", "displayName": "Title", "type": "TEXT", "required": true },
      { "key": "slug", "displayName": "Slug", "type": "TEXT", "required": true },
      { "key": "description", "displayName": "Description", "type": "TEXT" },
      { "key": "image", "displayName": "Image", "type": "IMAGE" },
      { "key": "score", "displayName": "Score", "type": "NUMBER" }
    ],
    "permissions": { "insert": "ADMIN", "update": "ADMIN", "remove": "ADMIN", "read": "ANYONE" }
  }
}
```

### Field Types

| Type | Description | Example Value |
|------|-------------|---------------|
| `TEXT` | String | `"Hello World"` |
| `NUMBER` | Numeric | `99.99` |
| `BOOLEAN` | True/false | `true` |
| `DATE` | Date only | `"2024-01-15"` |
| `DATETIME` | Date and time | `{ "$date": "2024-01-15T10:00:00.000Z" }` |
| `IMAGE` | Image reference | `"wix:image://v1/..."` |
| `URL` | Web URL | `"https://example.com"` |
| `RICH_TEXT` | HTML content | `"<p>Rich text</p>"` |
| `REFERENCE` | Single reference | Item ID string |
| `MULTI_REFERENCE` | Multiple references | Array of IDs |

### Inserting Data

**Single:** `POST https://www.wixapis.com/wix-data/v2/items`
```json
{ "dataCollectionId": "MyCollection", "dataItem": { "data": { "title": "Item", "slug": "item" } } }
```

**Bulk:** `POST https://www.wixapis.com/wix-data/v2/bulk/items/insert`
```json
{ "dataCollectionId": "MyCollection", "dataItems": [{ "data": { "title": "Item A" } }], "returnEntity": true }
```

⚠️ **Common mistake** — Bulk patch uses `patches` array with `fieldModifications`, not `dataItems`. Wrong shape produces `WDE0080` error.

⚠️ **Common mistake** — `MULTI_REFERENCE` cannot be set via insert/update/patch. Use dedicated reference endpoints.

## Price Formatting

Always use `Intl.NumberFormat` for locale-aware currency display — never manually construct currency strings like `'$' + price`:

```typescript
import { i18n } from '@wix/essentials';
const locale = await i18n.getLocale();
const fmt = (n: number) => new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n);
```

## SDK Gotchas — Quick Reference

These are the most common runtime failures. Each is explained because understanding *why* prevents similar mistakes on related APIs.

| Gotcha | Why it breaks |
|--------|---------------|
| `categories.queryCategories(options).find()` → `INVALID_FILTER` | The builder form sends an empty condition the API rejects. Use the two-argument form instead: `queryCategories({}, options)` which returns a Promise directly (no builder) |
| `getCurrentCart()` returns `Cart` directly, not `{ cart }` | SDK unwraps the response envelope |
| `searchOrders` takes `OrderSearch` directly, not `{ search: OrderSearch }` | Wrapping adds an extra nesting level the SDK doesn't expect |
| `createCheckoutFromCurrentCart` returns `{ checkoutId }`, not a checkout object with `_id` | It's a creation shortcut, not a full GET |
| `createCheckoutFromCurrentCart` is on `currentCart`, not `checkout` | Different module entirely — importing from `checkout` fails at build |
| `estimateCurrentCartTotals` → `priceSummary` is at top level | Not nested under `estimatedTotals` like the REST docs suggest |
| `getCurrentMember()` returns `{ member?: Member }` (wrapped) | This one IS wrapped, unlike most SDK responses |
| `getMember(id)` returns `Member` directly | Inconsistent with `getCurrentMember` — no wrapping |
| `getMyMemberAbout()` returns `{ memberAbout }` (wrapped) | Wrapped |
| `getMemberAbout(id)` returns `MemberAbout` directly | Not wrapped |
| `getDonationCampaign` / `updateDonationCampaign` / `queryDonationCampaigns().find()` return the entity (or `items`) directly, not `{ donationCampaign }` | SDK unwraps even though REST wraps |
| `updateDonationCampaign(id, partial)` — two positional args | Not a single `{ id, ... }` object like many other SDK updates |
| `coverImage` on a `DonationCampaign` is typed as `string` but returns as `Image` object `{ id, url, width, height, altText }` at runtime | SDK types and runtime disagree. Handle both shapes when rendering; write via REST with object form |
| REST PATCH fails with `INVALID_PATCH: missing hierarchies` when updating a nested field (e.g., `coverImage`) | The body MUST include `fieldMask: { paths: ["coverImage"] }` even though docs say "partial updates supported". The SDK sets this automatically; manual REST calls must include it |
| `DONATIONS_APP_ID` not exported from `@wix/donations` | No SDK const — hardcode `"333b456e-dd48-4d6b-b32b-9fd48d74e163"` in `src/utils/appIds.ts` |

💡 **Best practice** — Always use SDK methods over manual REST calls. SDK methods handle auth, types, and response shapes correctly. When one SDK method returns an object (e.g., `SlotAvailability`), pass it directly to the next method — don't reconstruct objects manually. Caveat: SDK types sometimes disagree with runtime shapes (see `coverImage` in the gotchas table) — if rendering breaks, log the actual shape and handle both.

💡 **Best practice** — Use `httpClient.fetchWithAuth` from `@wix/essentials` only when no SDK method exists. Import from the main module, not a subpath.

💡 **Best practice** — Many SDK query methods support two calling styles: a **builder form** `queryFoo(options).eq(...).find()` and a **two-argument form** `queryFoo(query, options)` that returns a `Promise` directly. **Prefer the two-argument form** — it avoids builder bugs (e.g., the categories builder sends an empty filter that causes `INVALID_FILTER`) and returns proper types without chaining. The response field is typically plural (`.categories`, `.orders`) not `.items`.

💡 **Best practice — centralize app IDs in one file.** Every business app (Stores, Donations, Restaurants, Bookings, Events, Gift Cards, Pricing Plans, Blog) has an `appId` used in `catalogReference.appId` for cart/checkout and to classify order line items. Only a few are exposed via SDK imports — most are either hardcoded `const`s in private subpaths or not defined at all. Put them all in `src/utils/appIds.ts`:

```ts
// Only one is currently re-exported cleanly
export { PRICING_PLANS_APP_ID } from '@wix/headless-pricing-plans/services';

// The rest are not exported or live behind subpaths blocked by package `exports` maps
export const DONATIONS_APP_ID = '333b456e-dd48-4d6b-b32b-9fd48d74e163';
export const STORES_APP_ID = '215238eb-22a5-4c36-9e7b-e7c08025e04e';
export const ECOM_PLATFORM_APP_ID = '1380b703-ce81-ff05-f115-39571d94dfcd';
export const RESTAURANTS_APP_ID = '9a5d83fd-8570-482e-81ab-cfa88942ee60';
export const RISE_GIFT_CARDS_APP_ID = 'd80111c5-a0f4-47a8-b63a-65b54d774a27';
export const EVENTS_APP_ID = '140603ad-af8d-84a5-2c80-a0f60cb47351';
export const BOOKING_APP_ID = '13d21c63-b5ec-5912-8397-c3a5ddb27a97';
export const BLOG_APP_ID = '14bcded7-0066-7c35-14d7-466cb3f09103';
```

This is also how the member Orders tab can badge each line item by type — classify `lineItem.catalogReference.appId` against this map.

## TypeScript Conventions

- Use `astro/tsconfigs/strictest` — use `?? null` (not `|| undefined`) for optional properties typed as `string | null`
- Always prefer SDK types (`cart.LineItem`, `productsV3.ProductMedia`, etc.) over `Record<string, unknown>`
- Import types: `import type { cart as cartTypes } from '@wix/ecom'`
- ⛔ **Never use `any`, `any[]`, `as any`, `as unknown as`, or `Record<string, any>`** — the ESLint `no-explicit-any` rule enforces this at build time. If a type error appears, fix the field access to match the SDK type — don't suppress the error. A type error means the code will crash at runtime.
- Use `as Function` (not `as any`) for SDK overload workarounds

### Never render SDK objects directly in Astro templates

⛔ **Breaks at runtime (silently)** — Astro templates accept any expression in `{expr}` and call `.toString()` at runtime. Rendering an SDK object (e.g., `{product.ribbon}`, `{variant.price}`) produces `[object Object]` instead of the expected text. **No compiler or linter catches this** — `astro check`, `tsc`, and ESLint all pass. React JSX rejects objects as children at the type level, but Astro templates do not.

**Rule:** Never pass an SDK object into `{}` — always access the specific primitive field first:
- `{product.ribbon.name}` not `{product.ribbon}`
- `{price.amount}` not `{price}`
- `{variant._id}` not `{variant}`

Common V3 fields that are objects, not strings:
- `product.ribbon` → `{ _id, name }` — use `.name`
- `product.actualPriceRange.minValue` → `FixedMonetaryAmount { amount, formattedAmount }` — use `.amount` or `.formattedAmount`
- `product.media.main` → `ProductMedia { image, video, mediaType }` — use helpers like `extractMediaUrl()`
- `order.priceSummary.total` → `Price { amount, formattedAmount }` — use `.amount`

### React Islands in Astro

⛔ **Breaks at runtime** — Don't use inline `<style>{...}` in React components — causes hydration mismatch due to HTML entity encoding. Put styles in Astro `<style>` with `:global()`.

⚠️ **Common mistake** — No generic types with angle brackets in Astro template expressions (e.g., `Record<string, any>` breaks the parser). Define types in frontmatter.

### Translations in Code

- Use `i18n.getTranslationFunction()` from `@wix/essentials` for ALL user-visible text
- Never hardcode English text — add keys to `src/translations.json` and use `t('group.key')`
- In React components, call `const t = i18n.getTranslationFunction()` **inside** the component function (not at module level — it needs the request context)
