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

💡 **Best practice** — Always use SDK methods over manual REST calls. SDK methods handle auth, types, and response shapes correctly. When one SDK method returns an object (e.g., `SlotAvailability`), pass it directly to the next method — don't reconstruct objects manually.

💡 **Best practice** — Use `httpClient.fetchWithAuth` from `@wix/essentials` only when no SDK method exists. Import from the main module, not a subpath.

💡 **Best practice** — Many SDK query methods support two calling styles: a **builder form** `queryFoo(options).eq(...).find()` and a **two-argument form** `queryFoo(query, options)` that returns a `Promise` directly. **Prefer the two-argument form** — it avoids builder bugs (e.g., the categories builder sends an empty filter that causes `INVALID_FILTER`) and returns proper types without chaining. The response field is typically plural (`.categories`, `.orders`) not `.items`.

## TypeScript Conventions

- Use `astro/tsconfigs/strictest` — use `?? null` (not `|| undefined`) for optional properties typed as `string | null`
- Always prefer SDK types (`cart.LineItem`, `productsV3.ProductMedia`, etc.) over `Record<string, unknown>`
- Import types: `import type { cart as cartTypes } from '@wix/ecom'`
- ⛔ **Never use `any`, `any[]`, `as any`, `as unknown as`, or `Record<string, any>`** — the ESLint `no-explicit-any` rule enforces this at build time. If a type error appears, fix the field access to match the SDK type — don't suppress the error. A type error means the code will crash at runtime.
- Use `as Function` (not `as any`) for SDK overload workarounds

### React Islands in Astro

⛔ **Breaks at runtime** — Don't use inline `<style>{...}` in React components — causes hydration mismatch due to HTML entity encoding. Put styles in Astro `<style>` with `:global()`.

⚠️ **Common mistake** — No generic types with angle brackets in Astro template expressions (e.g., `Record<string, any>` breaks the parser). Define types in frontmatter.

### Translations in Code

- Use `i18n.getTranslationFunction()` from `@wix/essentials` for ALL user-visible text
- Never hardcode English text — add keys to `src/translations.json` and use `t('group.key')`
- In React components, call `const t = i18n.getTranslationFunction()` **inside** the component function (not at module level — it needs the request context)
