# Wix eCommerce Store Skill

**This site uses Catalog V3.** See the version-specific skills:

- **[SKILL-V3.md](SKILL-V3.md)** — Current site. V3 catalog, `productsV3` namespace, categories, `215238eb-...` appId.
- **[SKILL-V1.md](SKILL-V1.md)** — Legacy reference. V1 catalog, `products` namespace, collections, `1380b703-...` appId.

## How to check which version

```
GET https://www.wixapis.com/stores/v3/provision/version
→ { "catalogVersion": "V1_CATALOG" }  // or "V3_CATALOG" or "STORES_NOT_INSTALLED"
```

Via SDK:
```typescript
import { catalogVersioning } from '@wix/stores';
const { catalogVersion } = await catalogVersioning.getCatalogVersion();
```

**Calling the wrong version's endpoints returns `428 Precondition Required`.**

## Shared across both versions

### eCommerce (cart, checkout, orders) — version-agnostic
- `@wix/ecom`: `currentCart`, `orders`, `backInStockNotifications`
- `@wix/redirects`: `createRedirectSession`
- `@wix/essentials`: `i18n.getLocale()`
- Cart/checkout APIs work the same on both versions — only `catalogReference.appId` differs

### Price Formatting
```typescript
import { i18n } from '@wix/essentials';
const locale = await i18n.getLocale();
const fmt = (n: number) => new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n);
```

### Cart Event System
`CartSidebar` listens for `window.dispatchEvent(new CustomEvent('cart-updated'))` after cart modifications.

### Thank You Pages
- Store: `/store/thank-you` with `thankYouPageUrl` callback, fetches order via `ecomOrders.getOrder(orderId)`
- Plans: `/plans/thank-you` with `thankYouPageUrl` callback, fetches order via `orders.memberGetOrder(orderId)`

### Product Gallery (images + video)
Uses `height:0 + padding-bottom:100%` trick for fixed container. Grid items need `min-width: 0`. Gallery switching via innerHTML replacement.

### React Island Styling
Don't use inline `<style>{...}` in React — causes hydration mismatch. Put styles in Astro `<style>` with `:global()`.

### Astro JSX Template Gotcha
No generic types with angle brackets in template expressions (e.g., `Record<string, any>` breaks). Use `: any` or define types in frontmatter.

### Media Generation
- Images: `dall-e-3` with `response_format: "url"` (NOT `gpt-image-1` which only returns base64)
- Video: Sora API → temp host (uguu.se) → Wix Import File → Add Product Media by `id`
- Add images one at a time via MCP (batching may silently drop)

### Gotchas (version-agnostic)
- `getCurrentCart` returns Cart directly, not `{ cart }`
- `searchOrders` takes OrderSearch directly, not `{ search: OrderSearch }`
- `backInStockNotifications.createBackInStockNotificationRequest` takes two separate args: `(request, itemDetails)`
- `estimateCurrentCartTotals` response: `priceSummary` at top level, not under `estimatedTotals`
- Use `as Function` not `as any` for SDK overload workarounds
