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

`siteProperties.getSiteProperties()` returns `{ properties: { paymentCurrency, language, timeZone, ... } }`. Use this from any Astro page (server-side) to get an ISO-4217 currency code, then pass it to `Intl.NumberFormat` — or through a prop to React components that format computed totals.

REST equivalent: `GET https://www.wixapis.com/site-properties/v4/properties`. Prefer the SDK so auth, types, and response shapes are handled correctly.

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
| `query*().limit(200)` silently caps return set at 200 | `.limit()` is capped server-side regardless of the value you pass. Paginate via `.next()` until `page.items.length < 200` — otherwise the tail of long series/collections is missing |
| `.eq('nested.path.field', value)` on a query builder fails typecheck | The generated builder's filter methods are typed to a shortlist of scalar top-level fields. For nested/deep filters, fetch without that clause and filter client-side |
| `updateX({ entity: {...original, foo: 'bar'} })` → `INVALID_FIELD_MASK: … UNKNOWN` with many read-only paths listed | Spreading a full response object into an update call tells the server to write every field — including read-only/computed ones. Pass ONLY the delta sub-tree (`{ entity: { subtree: { foo: 'bar' } } }`) |
| `auth.elevate(sdkFn)` loses SDK type overloads and turns later calls into `(httpClient: HttpClient)` instead of the real signature | The elevate wrapper has a second overload for REST-module registration that TS sometimes picks. Cast to the real signature: `const createX = auth.elevate(mod.createX) as (input: X, opts?: CreateXOptions) => Promise<X>;` |
| Client-hydrated component (`client:load`) silently fails to hydrate after SDK edits — buttons dead, no visible error | Stale Vite optimize-dep cache (`504 Outdated Optimize Dep` in console). Fix: `rm -rf node_modules/.vite && restart dev`. Only bites dev — prod builds are fine |
| `await services.queryServices({})` (or any `queryX()`) without `.find()` resolves to the **query builder**, not the result. `result.items` / `result.services` / `result.orders` are all `undefined`, downstream list is empty | Query methods return a builder. `.find()` (or the two-argument form `queryX(query, options)`) is what actually executes. Missing it is a silent empty-render bug — no TypeScript error because builders accept `.then()` via the Promise interface |
| `orders.memberGetOrder(id)` returns the `Order` directly, not `{ order }` | `result?.order` is always `undefined`. Destructure: `const order = await orders.memberGetOrder(id);` |
| `orders.Order` (pricing-plans) has no `priceDetails` in the types, but runtime still returns it | SDK type renamed the field to `pricing`; backend wasn't updated. Widen via intersection: `type PlanOrder = orders.Order & { priceDetails?: orders.PriceDetails }` — do **not** reach for `any` |
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
- ⛔ **Never write custom interfaces that mirror SDK types** (e.g., a local `interface TimeSlotInfo { startDate: string; status: string }` when `timeSlots.TimeSlot` exists). Using SDK types directly keeps your code in sync with API changes and surfaces real bugs — a custom mirror hides the fact that, e.g., `startDate` is `Date | null` not `string`, and that misalignment eventually crashes.
- **Prefer type inference over explicit annotation where possible.** `const map = new Map(entries)` with well-typed `entries` infers the full `Map<K, V>` — no need for a local `interface Entry` or explicit generic. Same for `.map()` / `.filter()` chains: let TS infer the item type from the SDK-typed array.
- **SDK type drift is real.** When the runtime response disagrees with the SDK type (e.g., `orders.Order.priceDetails` is read as present but typed away), intersect rather than reach for `any`: `type Widened = X & { legacyField?: X_LegacyType }`. Casts stay narrow and you keep type coverage on the rest of the object.
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

⚠️ **Common mistake** — No generic types with angle brackets in Astro template expressions (e.g., `Record<string, any>` breaks the parser). Define types in frontmatter.

### Translations in Code

- Use `i18n.getTranslationFunction()` from `@wix/essentials` for ALL user-visible text
- Never hardcode English text — add keys to `src/translations.json` and use `t('group.key')`
- In React components, call `const t = i18n.getTranslationFunction()` **inside** the component function (not at module level — it needs the request context)
