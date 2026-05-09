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

Items from `items.query().find()` have fields directly on the object. The REST API nests them under `.data`, but the SDK unwraps that envelope:

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

### Install the CMS app

The CMS / Wix Data app needs to be installed on the site before any `/wix-data/v2/*` call works. Install via the Apps Installer API (appDefId `675bbcef-18d8-41f5-800e-131ec9e08762`):

```http
POST https://www.wixapis.com/apps-installer-service/v1/app-instance/install
Body: { "tenant": { "tenantType": "SITE", "id": "<siteId>" }, "appInstance": { "appDefId": "675bbcef-18d8-41f5-800e-131ec9e08762", "enabled": true } }
```

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

Bulk patch uses a `patches` array with `fieldModifications` — not `dataItems`.

`MULTI_REFERENCE` values are not written by insert/update/patch — they're silently dropped from the body. After the main write, call `items.replaceReferences(collectionId, fieldKey, referringItemId, ids[])` (empty array clears all). To load existing values when editing, use `items.queryReferenced(collectionId, rowId, fieldKey)`. See [EXTENSIONS.md](EXTENSIONS.md) for the full add/edit pattern.

## Price Formatting

Format prices with `Intl.NumberFormat`, using the visitor's current locale (from `i18n.getLocale()`) and the currency that's on the SDK price object:

```typescript
import { i18n } from '@wix/essentials';
const locale = i18n.getLocale();
const fmt = (n: number, currency: string) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n);
```

The SDK's pre-formatted strings (`formattedAmount`, `formattedValue`, `formattedConvertedAmount`) are produced server-side at write/cache time with whatever locale was active then — not the current visitor's. Different SDKs also format inconsistently (decimal separators, symbol position, fraction digits), so mixed pages get visibly different styles. Always go through one `Intl.NumberFormat` call.

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

The site's currency lives on Site Properties (`paymentCurrency`) — not on feature-specific entities. The SDK types suggest a restaurant's `Operation.paymentCurrency` exists, but at runtime that field is empty (same for `currentCart.currency` on an empty cart). Read it from Site Properties:

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

If `getSiteCurrency()` can't find a configured `paymentCurrency`, let the call throw — a missing site currency is a configuration gap that should surface as an error, not as a hardcoded `'USD'` fallback that silently ships the wrong symbol on every non-USD site.

Format from `amount + currency` at the page boundary:

```typescript
const priceFormatted = price.amount
  ? new Intl.NumberFormat(locale, { style: 'currency', currency: price.currency }).format(parseFloat(price.amount))
  : '';
```

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
| `categories.queryCategories(options).find()` → `INVALID_FILTER` | The builder form sends an empty condition the API rejects. Use the two-argument form: `queryCategories({}, options)` returns a Promise directly |
| `getCurrentCart()` returns `Cart` directly | SDK unwraps the response envelope |
| `searchOrders(searchObj)` — pass `OrderSearch` directly, not `{ search: OrderSearch }` | The SDK doesn't take an extra `search` wrapper |
| `createCheckoutFromCurrentCart` returns `{ checkoutId }`; lives on `currentCart`, not `checkout` | Creation shortcut, not a full GET. Different module entirely from `checkout.createCheckout` — both exported from `@wix/ecom` |
| Buy Now / Donate flows: use `checkout.createCheckout({ lineItems, channelType })` directly, destructure `_id` | `createCheckoutFromCurrentCart` reads the user's cart, so it pulls in unrelated items and leaves the new item in the cart afterwards |
| `estimateCurrentCartTotals` → `priceSummary` is at the top level, not under `estimatedTotals` | The REST docs nest it; the SDK hoists it |
| `getCurrentMember()` returns `{ member?: Member }`; `getMember(id)` returns `Member` directly | Inconsistent wrapping between the two |
| `getMyMemberAbout()` returns `{ memberAbout }`; `getMemberAbout(id)` returns `MemberAbout` directly | Inconsistent wrapping between the two |
| `getDonationCampaign` / `updateDonationCampaign` / `queryDonationCampaigns().find()` return the entity (or `items`) directly | SDK unwraps even though REST wraps |
| `updateDonationCampaign(id, partial)` — two positional args | Not a single `{ id, ... }` object |
| `DonationCampaign.coverImage` is typed as `string` but returns as `Image` object at runtime | SDK types and runtime disagree. Render with `string | { id, url, ... }`; write via REST with object form |
| REST PATCH on nested fields (e.g. `coverImage`) needs `fieldMask: { paths: ["coverImage"] }` in the body | Without it, the server returns `INVALID_PATCH: missing hierarchies`. The SDK sets this automatically — only matters for manual REST calls |
| `DONATIONS_APP_ID` not exported from `@wix/donations` | No SDK const — hardcode `"333b456e-dd48-4d6b-b32b-9fd48d74e163"` in `src/utils/appIds.ts` |
| `query*().limit(200)` is capped server-side regardless of the value | Paginate via `.next()` until `page.items.length < 200`; otherwise the tail of long series/collections is missing |
| `.eq('nested.path.field', value)` on a query builder fails typecheck | The builder's filter methods are typed to a shortlist of scalar top-level fields. For nested/deep filters, fetch without the clause and filter client-side |
| `updateX({ entity: {...original, foo: 'bar'} })` → `INVALID_FIELD_MASK: … UNKNOWN` listing read-only paths | Spreading the full response into an update tells the server to write every field, including read-only ones. Pass only the delta sub-tree (`{ entity: { subtree: { foo: 'bar' } } }`) |
| `client:load` component silently fails to hydrate after SDK edits in dev — `504 Outdated Optimize Dep` in console | Stale Vite optimize-dep cache. Fix: `rm -rf node_modules/.vite` and restart dev. Only affects dev; prod builds are fine |
| `await queryX({})` (without `.find()`) resolves to the query **builder**, not the result | Query methods return a builder; `.find()` (or the two-argument `queryX(query, options)`) executes it. The builder satisfies `.then()` so there's no TypeScript error — `result.items` is just `undefined` and the page renders empty |
| `orders.memberGetOrder(id)` returns the `Order` directly, not `{ order }` | Destructure: `const order = await orders.memberGetOrder(id);` |
| `orders.Order` (pricing-plans) has no `priceDetails` in the types | `priceDetails` was removed when Wix introduced `pricing` as the structured replacement. Use `order.pricing.prices[0].price.{subtotal,total,discount,currency,coupon}` and `order.pricing.subscription.cycleDuration`. See [PRICING_PLANS.md](PRICING_PLANS.md) → "Order Shape" |
| Comparing status/enum fields against string literals (`o.status !== 'DRAFT'`, `channelType: 'WEB'`) | Literal strings compile but break the day Wix renames an enum value. Use SDK enums: `orders.OrderStatus.DRAFT`, `currentCart.ChannelType.WEB`, `bookings.BookingStatus.CONFIRMED`, `posts.NodeType.PARAGRAPH`, `wixEventsV2.RequestedFields.DETAILS`, `seoTagsApi.ItemType.STORES_PRODUCT`, etc. If your IDE can't autocomplete the value, the namespace probably lives one level deeper |

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

`astro/tsconfigs/strictest` is on, so `?? null` for optional `string | null` fields, conditional assignment instead of `= specialRequests || undefined` (under `exactOptionalPropertyTypes`), `unknown` in catch — these are tsconfig-enforced; let the compiler tell you when you've broken them.

The project-specific rules:

- **Always import SDK types** (`cart.LineItem`, `productsV3.ProductMedia`, …) instead of restating shapes as `Record<string, unknown>` or local mirror interfaces. A custom mirror hides real type-drift signals — e.g. `startDate: Date | null` quietly becoming `startDate: string` in your shape.
- **`as any` and `as unknown as X` are both banned** (`no-explicit-any` + `no-restricted-syntax`). When the SDK type seems wrong, probe the actual runtime shape (see "Best practice — probe shapes" above) before reaching for a cast. Most "drift" turns out to be a payload field that the type already accepts (`memberId` on `MemberAbout` is the canonical example).
- **Real, verified type drift** is fieldset-conditional fields: `wixEventsV2.Event.categories` (with `CATEGORIES` fieldset), `posts.Post.metrics` (with `METRICS` fieldset). For these, intersect: `type Widened = X & { extraField?: X_ExtraType }`.
- **Custom DTOs are OK across the server/client boundary.** SDK types carry methods and `Date`s that don't survive the JSON hop into a React island; define narrow DTOs from SDK sub-types (`productsV3.PriceRange`, `productsV3.Variant`, …) for that hop, not restated primitives. Pure server code always uses the SDK type directly.

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

A `useState(new Date()...)` initializer runs during both renders and produces different values each time — initialise to a deterministic value (empty string, `null`) and populate in `useEffect`.

### Where mismatches usually crop up

- Language/locale switchers, theme toggles (read browser or site config)
- Date/time inputs defaulted to "today" or "tomorrow"
- Any client component that varies output by `window.location.pathname` / `window.matchMedia` / `userAgent`
- Cart or wishlist badges that initialize from `localStorage` synchronously in `useState`

### Never render SDK objects directly in Astro templates

Astro templates accept any expression in `{expr}` and call `.toString()` on it. Rendering an SDK object (e.g., `{product.ribbon}`, `{variant.price}`) produces `[object Object]`. `astro check`, `tsc`, and ESLint all pass — React JSX rejects objects as children at the type level, but Astro templates don't.

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

Put styles in Astro `<style>` with `:global()`, not inline `<style>{...}` inside React components — the React form HTML-entity-encodes the CSS and triggers a hydration mismatch.

`:global()` is build-time syntax processed by Astro's scoped-style pipeline. It works inside Astro `<style>` blocks (and `<style is:global>`); CSS injected via React (e.g., `dangerouslySetInnerHTML`) reaches the browser as plain CSS, where `:global()` is an unknown pseudo-class and the browser drops the rule. If the CSS comes from React, write plain selectors.

Astro named slots don't forward to React component children — framework integrations pass only the default slot as `children`, and named-slot content is concatenated into that list with the `slot=` attribute preserved as a DOM attribute. The pattern below (sibling `data-tab-panel` divs in Astro, React component toggles `style.display`) is the canonical workaround.

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
