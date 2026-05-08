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

⚠️ **Common mistake** — `MULTI_REFERENCE` cannot be set via insert/update/patch — values are silently dropped. After the main write, call `items.replaceReferences(collectionId, fieldKey, referringItemId, ids[])` (empty array clears all). To load existing values when editing, use `items.queryReferenced(collectionId, rowId, fieldKey)`. See [EXTENSIONS.md](EXTENSIONS.md) for the full add/edit pattern.

## Price Formatting

Always format prices ourselves with `Intl.NumberFormat`, using the visitor's current locale and the currency that's already on the SDK price object. **Never render the SDK's pre-formatted string** (`formattedAmount`, `formattedValue`, `formattedConvertedAmount`, etc.):

```typescript
import { i18n } from '@wix/essentials';
const locale = i18n.getLocale();
const fmt = (n: number, currency: string) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n);
```

⛔ **Never read `price.formattedAmount` / `price.formattedValue` / `price.formattedConvertedAmount`.** Those strings are produced server-side at write/cache time with whatever locale was active then, not the current visitor's. Different SDKs also format inconsistently (decimal separators, currency-symbol position, fraction digits) — rendering them mixed in one page produces visibly different price styles. The only way to get consistent, locale-correct output is to always go through one `Intl.NumberFormat` call.

⛔ **Never manually construct currency strings** like `` `$${price}` ``. The hardcoded symbol is wrong on every non-USD site.

### Where to get the currency

Priority — try in order:

1. **`price.currency` on the SDK Money/CommonMoney/Price object.** Most APIs return this (`@wix/donations`, `@wix/bookings`, `@wix/pricing-plans`, `@wix/events`, `@wix/ecom`, `@wix/stores`). Format `price.amount` (or `.value`) with `Intl.NumberFormat(locale, { style: 'currency', currency: price.currency })`. This is the right currency for that specific price — and for multi-currency carts where the buyer's display currency may differ from the listed currency, this is the only correct source.
2. **`getSiteCurrency()` (`src/utils/site.ts`)** — fall back here only when the price object has no currency field. Concrete cases: `@wix/restaurants` `PriceInfo` (just a decimal `price` string with no currency), or computed totals client-side before any line item with a currency exists. Don't reach for it when `price.currency` is present.

```typescript
// ✅ right — currency from the price object
const fmt = (n: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: price.currency }).format(n);
const display = fmt(parseFloat(price.amount));

// ✅ right — fallback for restaurants where PriceInfo has no currency
const currency = await getSiteCurrency();
const display = new Intl.NumberFormat(locale, { style: 'currency', currency }).format(parseFloat(item.priceInfo.price));

// ❌ wrong — using SDK's pre-formatted string
const display = price.formattedAmount;

// ❌ wrong — calling getSiteCurrency() when price.currency is right there
const currency = await getSiteCurrency();
```

### Getting the site's payment currency

⛔ **Do NOT hardcode `'USD'`** as the currency. Every Wix site has a configured `paymentCurrency` (e.g., `"ILS"`, `"EUR"`) and prices are priced in it. If you use USD-hardcoded formatting, an IL-based restaurant's menu renders as `$14.99` instead of `₪14.99` — same digits, wrong currency.

⛔ **Don't go looking for the currency in the feature-specific API.** Intuition says "the restaurant has a `paymentCurrency` on its Operation" — and SDK types confirm it — but at runtime that field is empty. Same for `currentCart.currency` when the cart is empty. The only reliable source is **Site Properties**:

```bash
npm install @wix/business-tools
```

```typescript
// src/utils/site.ts
import { siteProperties } from '@wix/business-tools';
import { auth } from '@wix/essentials';

export async function getSiteCurrency(): Promise<string> {
  const elevated = auth.elevate(siteProperties.getSiteProperties);
  const res = await elevated();
  const currency = res.properties?.paymentCurrency;
  if (!currency) {
    throw new Error('Site paymentCurrency is not configured in Wix Site Properties.');
  }
  return currency;
}
```

⛔ **Never fall back to a hardcoded currency string.** The try/catch-returns-`'USD'` pattern silently ships the wrong symbol for every site that isn't USD. Let the call throw — configuration gaps should surface as errors, not as incorrect prices.

⛔ **The `priceFormatted || \`$${price}\`` pattern is the exact same violation.** It looks like graceful degradation, but on any non-USD site it silently renders the wrong currency symbol any time the SDK's `formattedAmount`/`formattedValue` is missing. Same for `priceFormatted || \`${price}\`` (bare number — no currency at all). And the `priceFormatted` source itself is wrong (see "Never read `price.formattedAmount`" above) — both halves of the expression need replacing:

```typescript
// ❌ wrong — hardcoded $ on a non-USD site
{priceFormatted || `$${price}`}

// ❌ wrong — no currency on the fallback
{priceFormatted || `${price}`}

// ❌ still wrong — sdkFormatted uses server-side locale, not visitor's
const priceFormatted = sdkFormatted || (rawValue ? fmt(parseFloat(rawValue)) : '');

// ✅ right — always format from amount+currency at the page boundary
const priceFormatted = price.amount
  ? new Intl.NumberFormat(locale, { style: 'currency', currency: price.currency }).format(parseFloat(price.amount))
  : '';
```

Centralise the format call at the page boundary; never let a bare number slip through to JSX, and never let an SDK pre-formatted string be the "good" branch of an `||` either.

`siteProperties.getSiteProperties()` returns `{ properties: { paymentCurrency, language, timeZone, ... } }`. Use this from any Astro page (server-side) to get an ISO-4217 currency code, then pass it to `Intl.NumberFormat` — or through a prop to React components that format computed totals.

REST equivalent: `GET https://www.wixapis.com/site-properties/v4/properties`. Prefer the SDK so auth, types, and response shapes are handled correctly.

### Money/Price field-name drift across SDKs

The shape of "Money" is **not consistent across Wix SDKs** — same concept, different field names, and the currency is in different places (or missing entirely). Since we always format prices ourselves (see "Price Formatting" above), the practical question for each price is: **where is the amount, and where is the currency?** Use this table to find both, then pass them to `Intl.NumberFormat`:

| SDK | Type | Amount field | Currency source |
|---|---|---|---|
| `@wix/ecom` cart `MultiCurrencyPrice` | line items, priceSummary | `amount` (or `convertedAmount`) | `cart.conversionCurrency \|\| cart.currency` (currency is on the **Cart** object, not on the price) |
| `@wix/ecom` order `Price` | order line items, priceSummary | `amount` | `order.currency` |
| `@wix/donations` | `MultiCurrencyPrice` (amounts) | `amount` | **not on price** — site currency, except `currencyMetricsList[].currencyCode` for raised totals |
| `@wix/gift-vouchers` | `MultiCurrencyPrice` (variants) | `amount` | **not on price** — site currency (per SDK docs, gift cards always use site default) |
| `@wix/stores` v3 `FixedMonetaryAmount` | `actualPriceRange.minValue.amount` etc. | `amount` | **not on price** — `product.currency` (request `RequestedFields.CURRENCY`) |
| `@wix/bookings` `Money` (services payment) | `payment.fixed.price.value` | `value` | `value.currency` (on the price) |
| `@wix/pricing-plans` `Money` | `pricing.price.value` | `value` | `price.currency` (on the price) |
| `@wix/events` `CommonMoney` (ticket defs) | `pricingMethod.fixedPrice.value` | `value` | `fixedPrice.currency` (on the price) |
| `@wix/restaurants` `PriceInfo` (menu items) | `priceInfo.price` | `price` | **none anywhere** — site currency is the only option |

⚠️ **Three patterns of currency location:**
1. **On the price object itself** (bookings, plans, events) — read `price.currency` directly.
2. **On the parent entity** (cart on Cart, order on Order, product on Product) — read it from the parent and pass down.
3. **Implicit / not in the response** (donations, gift cards, restaurants) — fall back to `getSiteCurrency()` from `src/utils/site.ts`.

⚠️ **Never hand-roll types like `{ amount?, formattedAmount? }` to "make it work for any shape".** The `as unknown as { amount?: string; formattedAmount?: string }` cast invents fields that don't exist on the actual SDK type and silently reads `undefined`. Import the type the SDK exports and use the right field for that package.

💡 **One canonical helper.** Define a single `formatCurrency(amount, currency, locale)` in `src/utils/format.ts` (kept separate from `site.ts` so the formatter stays pure — `site.ts` does network I/O via `getSiteCurrency`). Route every price through it. Pages resolve the currency from the table above (price → parent entity → site fallback) and pass `currency` to React components that compute totals.

## SDK Gotchas — Quick Reference

These are the most common runtime failures. Each is explained because understanding *why* prevents similar mistakes on related APIs.

| Gotcha | Why it breaks |
|--------|---------------|
| `categories.queryCategories(options).find()` → `INVALID_FILTER` | The builder form sends an empty condition the API rejects. Use the two-argument form instead: `queryCategories({}, options)` which returns a Promise directly (no builder) |
| `getCurrentCart()` returns `Cart` directly, not `{ cart }` | SDK unwraps the response envelope |
| `searchOrders` takes `OrderSearch` directly, not `{ search: OrderSearch }` | Wrapping adds an extra nesting level the SDK doesn't expect |
| `createCheckoutFromCurrentCart` returns `{ checkoutId }`, not a checkout object with `_id` | It's a creation shortcut, not a full GET |
| `createCheckoutFromCurrentCart` is on `currentCart`, not `checkout` | Different module entirely — importing from `checkout` fails at build |
| Buy Now / Donate using `addToCurrentCart` + `createCheckoutFromCurrentCart` drags the user's existing cart items into the "single item" checkout and leaves the new item sitting in their cart | Those flows are one-off purchases, not cart purchases. Use `checkout.createCheckout({ lineItems, channelType })` instead — it creates a standalone checkout from explicit line items and never touches `currentCart`. Destructure `_id` (not `checkoutId`) from the returned `Checkout` |
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
| `query*().limit(200)` silently caps return set at 200 | `.limit()` is capped server-side regardless of the value you pass. Paginate via `.next()` until `page.items.length < 200` — otherwise the tail of long series/collections is missing |
| `.eq('nested.path.field', value)` on a query builder fails typecheck | The generated builder's filter methods are typed to a shortlist of scalar top-level fields. For nested/deep filters, fetch without that clause and filter client-side |
| `updateX({ entity: {...original, foo: 'bar'} })` → `INVALID_FIELD_MASK: … UNKNOWN` with many read-only paths listed | Spreading a full response object into an update call tells the server to write every field — including read-only/computed ones. Pass ONLY the delta sub-tree (`{ entity: { subtree: { foo: 'bar' } } }`) |
| `auth.elevate(sdkFn)` looks like it loses SDK type overloads | In practice it preserves the real signature for normal SDK functions (`auth.elevate(wixEventsV2.getEvent)`, `auth.elevate(items.insert)`, `auth.elevate(siteProperties.getSiteProperties)` all keep their typed signatures). If you see a `(httpClient: HttpClient)` signature on the elevated function, double-check the import — you may be importing the REST-registration form rather than the SDK function. Don't preemptively cast `as (input: X, ...) => Promise<X>` — the cast loses the response NonNullablePaths the SDK declares, and you'll re-introduce the type drift you thought you were fixing. |
| Client-hydrated component (`client:load`) silently fails to hydrate after SDK edits — buttons dead, no visible error | Stale Vite optimize-dep cache (`504 Outdated Optimize Dep` in console). Fix: `rm -rf node_modules/.vite && restart dev`. Only bites dev — prod builds are fine |
| `await services.queryServices({})` (or any `queryX()`) without `.find()` resolves to the **query builder**, not the result. `result.items` / `result.services` / `result.orders` are all `undefined`, downstream list is empty | Query methods return a builder. `.find()` (or the two-argument form `queryX(query, options)`) is what actually executes. Missing it is a silent empty-render bug — no TypeScript error because builders accept `.then()` via the Promise interface |
| `orders.memberGetOrder(id)` returns the `Order` directly, not `{ order }` | `result?.order` is always `undefined`. Destructure: `const order = await orders.memberGetOrder(id);` |
| `orders.Order` (pricing-plans) has no `priceDetails` in the types | The field was deliberately removed from the base `Order` type when Wix introduced `pricing` as the structured replacement. Don't widen the type to read the legacy field — use `order.pricing.prices[0].price.{subtotal,total,discount,currency,coupon}` and `order.pricing.subscription.cycleDuration` instead. See [PRICING_PLANS.md](PRICING_PLANS.md) → "Order Shape" |
| Comparing status/enum fields against string literals (`o.status !== 'DRAFT'`, `channelType: 'WEB'`) | Literal strings compile but silently break the day Wix renames an enum value. Use SDK enums: `orders.OrderStatus.DRAFT`, `currentCart.ChannelType.WEB`, `bookings.BookingStatus.CONFIRMED`, `posts.NodeType.PARAGRAPH`, `wixEventsV2.RequestedFields.DETAILS`, `seoTagsApi.ItemType.STORES_PRODUCT`, etc. If your IDE can't autocomplete the value, the namespace probably lives one level deeper — check the SDK source |
| `auth.elevate(fn)` strips the caller's locale | It does **not**. Both the elevated and non-elevated clients share the same `hostProxy` from `authAsyncLocalStorage`, which carries the request-level locale/language. `auth.elevate` only swaps the identity to app-level; `x-wix-linguist` stays intact. Don't re-attach the locale manually on elevated calls |

💡 **Best practice — probe shapes, don't guess.** SDK types, documented REST schemas, and what the server actually accepts for write calls can all drift. When a mutation fails with `INVALID_FIELD_MASK` / `UNKNOWN path` / "validation error for field I swear I didn't send", stop and drop a disposable read-only endpoint that dumps the raw entity with every relevant fieldset:

```ts
// src/pages/api/probe-<entity>.ts — delete before committing
export const GET: APIRoute = async ({ url }) => {
  const q = url.searchParams.get('q') ?? '';
  const all: Entity[] = [];
  let page = await auth.elevate(mod.queryX)({ fields: ['A','B','C'] }).limit(200).find();
  while (page) { all.push(...(page.items ?? [])); if (!page.items || page.items.length < 200) break; page = await page.next(); }
  const matches = all.filter(e => (e.title ?? '').toLowerCase().includes(q.toLowerCase())).slice(0, 3);
  return new Response(JSON.stringify(matches, null, 2), { headers: { 'content-type': 'application/json' } });
};
```

Pointing `jq` at the result reveals the exact runtime shape — including fields that only appear under certain fieldset combos, runtime-only keys not in the typed shape, and the REST-side path names the SDK maps to. Saves hours of trial-and-error against `updateX` mutations.

💡 **Best practice** — Always use SDK methods over manual REST calls. SDK methods handle auth, types, and response shapes correctly. When one SDK method returns an object (e.g., `SlotAvailability`), pass it directly to the next method — don't reconstruct objects manually. Caveat: SDK types sometimes disagree with runtime shapes (see `coverImage` in the gotchas table) — if rendering breaks, log the actual shape and handle both.

💡 **Best practice** — Use `httpClient.fetchWithAuth` from `@wix/essentials` only when no SDK method exists. Import from the main module, not a subpath.

💡 **Best practice** — Many SDK query methods support two calling styles: a **builder form** `queryFoo(options).eq(...).find()` and a **two-argument form** `queryFoo(query, options)` that returns a `Promise` directly. **Prefer the two-argument form** — it avoids builder bugs (e.g., the categories builder sends an empty filter that causes `INVALID_FILTER`) and returns proper types without chaining. The response field is typically plural (`.categories`, `.orders`) not `.items`.

💡 **Best practice — centralize app IDs in one file.** Every business app (Stores, Donations, Restaurants, Bookings, Events, Gift Cards, Pricing Plans, Blog) has an `appId` used in `catalogReference.appId` for cart/checkout and to classify order line items. None of these are cleanly re-exported from a public SDK entry point — they're either hardcoded `const`s inside private subpaths blocked by `exports` maps, or not defined at all. Put them all in `src/utils/appIds.ts`:

```ts
export const PRICING_PLANS_APP_ID = '1522827f-c56c-a5c9-2ac9-00f9e6ae12d3';
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
- Import types: `import type { cart as cartTypes } from '@wix/ecom'` or via namespace: `type TimeSlot = timeSlots.TimeSlot`
- ⛔ **Never use `any`, `any[]`, `as any`, `as unknown as`, or `Record<string, any>`** — the ESLint `no-explicit-any` rule enforces this at build time. If a type error appears, fix the field access to match the SDK type — don't suppress the error. A type error usually means the code will crash at runtime.
- ⛔ **`as unknown as X` is `as any` with a fig leaf — equally banned.** ESLint's `no-explicit-any` doesn't catch the double-cast, but the project also has a `no-restricted-syntax` rule that does. The same applies to laundering through ad-hoc shapes: `(sdk as unknown as { reservations?: { createReservation: (r: unknown) => Promise<unknown> } }).reservations` is the worst form of this — it (a) erases the real signature, (b) invents a "maybe" property that may not exist at runtime, and (c) makes every parameter and return `unknown`. Three lies in one expression. If `sdk.reservations` exists, the SDK exports its type; import it. If it doesn't exist, your code is broken — don't paper over with a fictional shape.
- ⛔ **`: unknown` parameters for SDK inputs are the same trick.** A function that calls `sdk.createX(opts: unknown)` has erased the input contract. Use `Parameters<typeof sdk.createX>[0]` if you must, or import the input type the SDK exports (`reservations.CreateReservationOptions`). `unknown` is appropriate for catch-block errors and for true external inputs (URL params, JSON.parse output) — never for SDK call inputs or outputs.
- ⛔ **Never write custom interfaces that mirror SDK types** (e.g., a local `interface TimeSlotInfo { startDate: string; status: string }` when `timeSlots.TimeSlot` exists). Using SDK types directly keeps your code in sync with API changes and surfaces real bugs — a custom mirror hides the fact that, e.g., `startDate` is `Date | null` not `string`, and that misalignment eventually crashes.
- ✅ **When the SDK type seems wrong, probe before casting.** Drop a temporary endpoint (see "probe shapes" above) to confirm the actual runtime shape, then either (a) use the SDK type as-is if it's right, (b) intersect with the missing field if there's drift, or (c) file a fix upstream. Going straight to `as unknown as` skips the step where you find out *why* the type is wrong — and that "why" is usually a real bug.
- **Prefer type inference over explicit annotation where possible.** `const map = new Map(entries)` with well-typed `entries` infers the full `Map<K, V>` — no need for a local `interface Entry` or explicit generic. Same for `.map()` / `.filter()` chains: let TS infer the item type from the SDK-typed array.
- **SDK type drift is rare and specific — usually fieldset-conditional fields.** Most "drift" claims are actually misreads of the type signature. Verified real cases (each requires intersecting with a `?` field): `wixEventsV2.Event` lacks `categories?: EventCategories` even with the `CATEGORIES` fieldset requested; `posts.Post` lacks `metrics?: Metrics` even with the `METRICS` fieldset requested. These are populated at runtime when the relevant fieldset is requested but the base entity type doesn't reflect that. For these, intersect: `type Widened = X & { extraField?: X_ExtraType }`. Casts stay narrow and you keep type coverage on the rest of the object. **Before reaching for an intersection, prove the SDK type is wrong:** open `node_modules/@wix/<pkg>/build/cjs/index.typings.d.ts` and read the interface — many "type drift" cases turn out to be a missing field on the *call payload* (e.g. `memberId` on `MemberAbout`) where the type is correct and the runtime simply requires the field. Pass the field; the type accepts it.
- **`unknown` in catch, not `any`.** `} catch (e) { ... e instanceof Error ? e.message : fallback }` covers the common case. Reserve a typed shape (e.g., `type WixSdkError = Error & { details?: { applicationError?: { code?: string } } }`) for deeper inspection.
- **Custom DTOs are OK at the server/client boundary.** React islands that mount from Astro pages only see what you pass as props — the full SDK type carries methods and non-serializable `Date`s that don't survive the JSON hop. Define a narrow `ProductData` / `BookingData` interface *built from SDK sub-types* (`productsV3.PriceRange`, `productsV3.Variant`, …) rather than restating primitives. In pure server code, always reach for the SDK type directly.

### `exactOptionalPropertyTypes` — don't pass explicit `undefined`

The strictest tsconfig enables `exactOptionalPropertyTypes: true`. Under this rule, a field typed as `string | null` (optional but NOT `| undefined`) rejects an explicit `undefined`:

```typescript
reservation.teamMessage = specialRequests || undefined;  // ❌ type error
```

Instead, conditionally assign only when you have a value:

```typescript
if (specialRequests) reservation.teamMessage = specialRequests;  // ✅
```

This is more correct semantically — an omitted field means "don't send / don't update", not "send the literal value `undefined`".

## SSR + React hydration (`client:load` vs `client:only`)

Any React component mounted with `client:load` is **rendered on the server** (as part of the Astro SSR pass) and then **re-rendered and hydrated on the client**. If the two renders produce different HTML, React 18 throws:

```
Warning: Expected server HTML to contain a matching <div> in <astro-island>.
Uncaught Error: Hydration failed because the initial UI does not match what was rendered on the server.
```

### Common sources of mismatch

1. **Non-deterministic values at render time** — `new Date()`, `Math.random()`, `Date.now()`, any read of `window`, `document`, `localStorage`, `navigator.language`. Server and client compute these independently; values diverge at midnight boundaries, across timezones, or because `window` is simply undefined during SSR.

2. **SDK calls that resolve differently on server vs client** — e.g., `multilingual.listSupportedLanguages()`, which returns client-side site config; `i18n.getLanguage()` in some contexts; anything that depends on runtime browser state.

3. **Conditional rendering gated by browser APIs** — `typeof window !== "undefined" && window.location.pathname.includes(...)` evaluates false during SSR and true on the client. Anything that affects the rendered output (className, role, attributes, children) based on this will mismatch.

### Two fixes, pick the right one

- **Pattern A — `client:only="react"`** — skip SSR entirely for this island. The component renders nothing on the server; React takes over on mount. Use when the component's entire purpose is client-side interaction and SEO doesn't need the content (dropdowns, modals, interactive widgets, anything reading `multilingual` / `window` / browser APIs). Example: `<LanguageSwitcher client:only="react" />`.
- **Pattern B — `useEffect` to populate non-deterministic state** — initialize state with a deterministic value (empty string, `null`), then set real values in `useEffect(() => {...}, [])`. Server and client both render the empty/null state initially; the client populates after mount. Use when the component *has* useful SSR content aside from the non-deterministic bit. Example: a date picker defaulting to tomorrow:

```typescript
const [selectedDate, setSelectedDate] = useState("");
const [minDate, setMinDate] = useState("");
useEffect(() => {
  const iso = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().split("T")[0]!;
  };
  const min = iso(1);
  setMinDate(min);
  setSelectedDate((prev) => prev || min);
}, []);
```

⛔ **Do NOT** default `useState(new Date()...)` — initializers run during both renders with different values, guaranteeing a mismatch.

### Where mismatches usually crop up

- Language/locale switchers, theme toggles (read browser or site config)
- Date/time inputs defaulted to "today" or "tomorrow"
- Any client component that varies output by `window.location.pathname` / `window.matchMedia` / `userAgent`
- Cart or wishlist badges that initialize from `localStorage` synchronously in `useState`

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

⛔ **`:global()` doesn't work in CSS injected from React.** It's a build-time syntax processed by CSS Modules / Astro's scoped-style pipeline — it only works inside Astro `<style>` blocks (and `<style is:global>`). Plain CSS in `<style>` tags rendered via React's `dangerouslySetInnerHTML` (or any other runtime-injected CSS) does NOT understand `:global()`. The browser sees an unknown pseudo-class and silently drops the entire rule. Symptom: tabs/panels that should be hidden are visible (or vice versa) and no error appears anywhere. **Rule:** if the CSS is reaching the browser via a React component, omit `:global()` and write plain selectors. If you need `:global()`, the styles belong in an Astro `<style>` block.

⛔ **Astro named slots do NOT forward to React component children.** Writing `<MyReactComponent client:load><div slot="profile">…</div><div slot="orders">…</div></MyReactComponent>` does not give the React component access to named slots — Astro framework integrations only pass the default slot through as `children`, and named-slot content is concatenated into that single `children` list with the `slot=` attribute preserved as a DOM attribute. Combined with `:global(div[slot="profile"])` selectors that don't run, this is a common silent-failure pattern: tab buttons render, but every panel shows empty.

✅ **Pattern for React-driven tabs over SSR'd content:** keep the React component lean — buttons + URL/hash sync only — and put the tab panels as **siblings** in the Astro page with `data-tab-panel` attributes. The React component toggles `style.display` on those siblings via `useEffect` when the active tab changes:

```astro
---
// Astro page
---
<MemberTabs client:load />

<div data-tab-panel="profile" class="tab-panel">
  <ProfileEditor client:load />
</div>
<div data-tab-panel="orders" class="tab-panel" style="display: none;">
  <h2>{t('member.tabOrders')}</h2>
  {orders.map(o => /* ... server-rendered */)}
</div>
```

```tsx
// MemberTabs.tsx — buttons only
useEffect(() => {
  document.querySelectorAll<HTMLElement>('[data-tab-panel]').forEach((el) => {
    el.style.display = el.dataset.tabPanel === active ? '' : 'none';
  });
}, [active]);
```

Why: orders/bookings panels keep their server-rendered data (no client refetch), each panel can mount its own `client:load` islands, and the React component stays small. Initial visibility is set via `style="display: none;"` on inactive panels in the Astro template so the SSR'd page shows the correct tab before hydration.

⚠️ **Common mistake** — No generic types with angle brackets in Astro template expressions (e.g., `Record<string, any>` breaks the parser). Define types in frontmatter.

### Translations in Code

- Use `i18n.getTranslationFunction()` from `@wix/essentials` for ALL user-visible text
- Never hardcode English text — add keys to `src/translations.json` and use `t('group.key')`
- In React components, call `const t = i18n.getTranslationFunction()` **inside** the component function (not at module level — it needs the request context)
