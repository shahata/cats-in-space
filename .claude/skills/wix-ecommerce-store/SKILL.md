# Wix eCommerce Store Skill

## Catalog V1 vs V3

Wix Stores has two catalog versions. **This site uses Catalog V1.** This skill documents V1 patterns.

### How to distinguish

Check programmatically:
```
GET https://www.wixapis.com/stores/v3/provision/version
→ { "catalogVersion": "V1_CATALOG" }  // or "V3_CATALOG" or "STORES_NOT_INSTALLED"
```

Via SDK:
```typescript
import { catalogVersioning } from '@wix/stores';
const { catalogVersion } = await catalogVersioning.getCatalogVersion();
```

### Key differences

| Aspect | V1 | V3 |
|--------|----|----|
| REST base path | `/stores/v1/...` | `/stores/v3/...` |
| SDK namespaces | `products`, `collections` | `productsV3`, `categories` |
| Product creation | `POST /stores/v1/products` | `POST /stores/v3/products` |
| Organization | Collections | Categories (with tree hierarchy) |
| Variant model | Auto-generated from `productOptions`, managed via `manageVariants` flag | Explicit `variantsInfo.variants` array with inline options |
| Product type field | `"physical"` (lowercase) | `"PHYSICAL"` (uppercase) |

**Calling V3 endpoints on a V1 site returns `428 Precondition Required`** with error code `CATALOG_V1_SITE_CALLING_CATALOG_V3_API`. There is no automatic fallback — you must use the correct version's endpoints.

### catalogReference.appId

The `appId` for Wix Stores in `catalogReference` (used in cart, checkout, orders) is **always**:
```
215238eb-22a5-4c36-9e7b-e7c08025e04e
```
This is the same for both V1 and V3. Do NOT use `1380b703-ce81-ff05-f115-39571d94dfcd` — that is a legacy ID that causes `CATALOG_ITEMS_RETRIEVAL_FAILURE` errors.

## SDK Packages

- `@wix/stores` — Product and collection queries
  - `products` namespace (V1): `getProduct`, `queryProducts`, `queryStoreVariants`, `createProduct`, `updateProduct`, `deleteProduct`, `addProductMedia`, `removeProductMedia`
  - `collections` namespace (V1): `queryCollections`, `getCollectionBySlug`, `createCollection`, `deleteCollection`
  - `catalogVersioning` namespace: `getCatalogVersion`
- `@wix/ecom` — Cart, checkout, orders, back-in-stock
  - `currentCart`: `getCurrentCart`, `addToCurrentCart`, `removeLineItemsFromCurrentCart`, `updateCurrentCartLineItemQuantity`, `estimateCurrentCartTotals`, `createCheckoutFromCurrentCart`
  - `orders`: `searchOrders`
  - `backInStockNotifications`: `createBackInStockNotificationRequest`
- `@wix/essentials` — Site context
  - `i18n`: `getLocale`, `getLanguage` (use for locale-aware formatting)
- `@wix/redirects` — Checkout redirect sessions

## V1 Product Query Patterns

### Query all products (server-side Astro)
```typescript
import { products } from '@wix/stores';
const result = await products.queryProducts().limit(100).find();
const allProducts = result.items || [];
```

### Query product by slug
```typescript
const result = await products.queryProducts().eq('slug', slug).limit(1).find();
const product = result.items?.[0];
```

### Get full product with variants (IMPORTANT)
`queryProducts` does NOT include variant data. For product detail pages where you need variant IDs (required for add-to-cart), use `getProduct`:
```typescript
const queryResult = await products.queryProducts().eq('slug', slug).limit(1).find();
const stub = queryResult.items?.[0];
const full = await products.getProduct(stub._id!);
const product = full.product;  // Includes product.variants[] with IDs
```
This is critical because `addToCurrentCart` requires `variantId` for managed-variant products.

### Query collections
```typescript
import { collections } from '@wix/stores';
const result = await collections.queryCollections().limit(100).find();
const allCollections = result.items || [];
```

### queryProducts does NOT return non-visible products
The API automatically excludes non-visible products — no need to filter by `visible` client-side.

## Price Formatting

Use `i18n.getLocale()` from `@wix/essentials` with `Intl.NumberFormat` for locale-aware currency formatting:
```typescript
import { i18n } from '@wix/essentials';
const locale = await i18n.getLocale();

function formatPrice(product: any): string {
  const { priceData, priceRange } = product;
  const currency = priceData?.currency || 'USD';
  const fmt = (n: number) => new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n);
  if (priceRange && priceRange.minValue !== priceRange.maxValue) {
    return `${fmt(priceRange.minValue)} – ${fmt(priceRange.maxValue)}`;
  }
  return fmt(priceData?.price || 0);
}
```
Don't use `priceData.formatted.price` or manual currency symbol logic — `Intl.NumberFormat` handles symbols, decimal separators, and grouping correctly for any locale/currency.

## V1 Product Data Shape

Key fields from `queryProducts().find().items`:
- `_id` — Product GUID
- `name` — Product name
- `slug` — URL-friendly name (auto-generated from name)
- `description` — HTML description
- `visible` — Whether product is published
- `productType` — `"physical"` or `"digital"` (lowercase in V1)
- `media.items[]` — Array of media items, each has: `{ id, image: { url, width, height }, thumbnail: { url } }`
- `priceData` — `{ price, discountedPrice, currency, formatted: { price, discountedPrice } }`
- `priceRange` — `{ minValue, maxValue }` (differs when variants have different prices)
- `productOptions[]` — Array of `{ name, optionType ("drop_down"), choices: [{ value, description, inStock, visible }] }`
- `variants[]` — Array of `{ id, choices: { OptionName: "ChoiceValue" }, variant: { priceData, weight, sku, visible }, stock: { inStock, trackQuantity } }`
- `collectionIds[]` — Array of collection GUIDs the product belongs to
- `stock` — `{ inStock, inventoryStatus ("IN_STOCK"|"OUT_OF_STOCK"|"PARTIALLY_OUT_OF_STOCK"), trackInventory }`
- `manageVariants` — Boolean. When `true`, variants have individual pricing/stock. When `false`, all variants share the product-level price.
- `ribbon` — Promotional ribbon text
- `discount` — `{ type: "NONE"|"AMOUNT"|"PERCENT", value }`

## Cart Operations (client-side React)

### catalogReference — buildCatalogRef pattern
```typescript
const STORES_APP_ID = '215238eb-22a5-4c36-9e7b-e7c08025e04e';

function buildCatalogRef(product, variantId, hasOptions) {
  const ref = { catalogItemId: product._id, appId: STORES_APP_ID };
  if (hasOptions && variantId) {
    ref.options = { variantId };
  }
  return ref;
}
```
- Products with options: include `variantId` from `getProduct().variants[].id`
- Products without options: omit `options` entirely

### Add to cart
```typescript
import { currentCart } from '@wix/ecom';
await currentCart.addToCurrentCart({
  lineItems: [{ quantity, catalogReference: catalogRef }],
});
// Dispatch custom event to update CartSidebar:
window.dispatchEvent(new CustomEvent('cart-updated'));
```

### Get current cart
```typescript
const cart = await currentCart.getCurrentCart();
// Returns Cart object directly (NOT { cart: ... })
// cart.lineItems, cart._id, etc.
// Throws 404 if no cart exists yet (cart is created on first addToCurrentCart)
```

### Update line item quantity
```typescript
await currentCart.updateCurrentCartLineItemQuantity([
  { _id: lineItemId, quantity: newQuantity },
]);
```

### Remove line items
```typescript
await currentCart.removeLineItemsFromCurrentCart([lineItemId]);
```

### Estimate totals
```typescript
const totals = await currentCart.estimateCurrentCartTotals({});
// totals.estimatedTotals.priceSummary.subtotal, .total, .discount
```

## Checkout Flow

```typescript
import { currentCart } from '@wix/ecom';
import { redirects } from '@wix/redirects';

// 1. Create checkout from current cart
const { checkoutId } = await currentCart.createCheckoutFromCurrentCart({
  channelType: 'WEB',
});

// 2. Create redirect session to Wix-hosted checkout
const { redirectSession } = await redirects.createRedirectSession({
  ecomCheckout: { checkoutId },
  callbacks: {
    postFlowUrl: window.location.origin + '/store?success=true',
  },
});

// 3. Redirect to checkout
window.location.href = redirectSession.fullUrl;
```

## Orders (server-side)

```typescript
import { orders as ecomOrders } from '@wix/ecom';
const result = await ecomOrders.searchOrders({ cursorPaging: { limit: 50 } });
const storeOrders = (result.orders || []).filter(o => o.status !== 'INITIALIZED');
// searchOrders takes OrderSearch directly (NOT { search: OrderSearch })
```

## Back-in-Stock Notifications

The SDK's `createBackInStockNotificationRequest` has type/serialization issues when called client-side. Use a server-side API endpoint instead:

**Server endpoint** (`src/pages/api/back-in-stock.ts`):
```typescript
import { backInStockNotifications } from '@wix/ecom';
await backInStockNotifications.createBackInStockNotificationRequest({
  catalogReference: { catalogItemId, appId: '215238eb-22a5-4c36-9e7b-e7c08025e04e', options: { variantId } },
  email: 'customer@email.com',
  itemDetails: { name: 'Product Name', price: '49.99' },  // both required
} as any);
```

**Client-side** — call the endpoint via fetch:
```typescript
await fetch('/api/back-in-stock', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, catalogItemId, variantId, productName, productPrice }),
});
```

## Working with Product Media

### The problem

The Wix Add Product Media API (`POST /stores/v1/products/{id}/media`) accepts two formats:
1. **External URL** — `{ "url": "https://..." }` — Wix downloads the image and hosts it permanently on `static.wixstatic.com`
2. **Existing Wix media ID** — `{ "mediaId": "4975b6_abc123~mv2.png" }` — references an image already in Wix Media

It does **NOT** accept base64 data, file uploads, or data URIs.

When using the Wix MCP tool (`CallWixSiteAPI`), you can only send JSON bodies — you cannot do binary PUT uploads. This means **you cannot upload raw image files to Wix Media via MCP**. You need hosted URLs.

### Recommended workflow: DALL-E images → Wix products

**Use `dall-e-3` (NOT `gpt-image-1`)** for generating product images:

- `dall-e-3` with `response_format: "url"` returns **temporary hosted URLs** (~2hr expiry) on `oaidalleapiprodscus.blob.core.windows.net`
- `gpt-image-1` **only returns base64** (`b64_json`) — no URL option. These can't be used with the Wix media API via MCP.

```javascript
// Generate image with dall-e-3 — returns a hosted URL
const res = await fetch("https://api.openai.com/v1/images/generations", {
  method: "POST",
  headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "dall-e-3",       // NOT gpt-image-1
    prompt: "...",
    n: 1,
    size: "1024x1024",
    response_format: "url"   // Returns hosted URL
  })
});
const { data } = await res.json();
const imageUrl = data[0].url;  // Temporary URL, valid ~2 hours
```

Then immediately add to product via MCP:
```
POST https://www.wixapis.com/stores/v1/products/{productId}/media
{ "media": [{ "url": "<dall-e-url>" }] }
```

**Important**: Call the Wix API promptly — DALL-E 3 URLs expire in ~2 hours. Wix downloads and permanently hosts the image once you call Add Product Media.

### Multiple images per product

**Add images one at a time** (or max 1 per call). Batching multiple URLs in a single Add Product Media call may silently drop all but the first. Make separate calls:
```
POST /stores/v1/products/{id}/media  →  { "media": [{ "url": "https://img1..." }] }
POST /stores/v1/products/{id}/media  →  { "media": [{ "url": "https://img2..." }] }
POST /stores/v1/products/{id}/media  →  { "media": [{ "url": "https://img3..." }] }
```
Each call appends to the product's existing media (does not replace).

### Assigning images to option choices (e.g., color swatches)

```json
{ "media": [{ "url": "https://blue-shirt.png", "choice": { "option": "Color", "choice": "Blue" } }] }
```

### Reading product images

From the V1 query response:
```typescript
const mainImage = product.media?.mainMedia?.image?.url;      // Primary image
const allImages = product.media?.items?.map(m => m.image?.url); // All images
const mediaIds = product.media?.items?.map(m => m.id);         // Wix media IDs
```

Image URLs from Wix are permanent and follow this pattern:
```
https://static.wixstatic.com/media/{mediaId}/v1/fit/w_{width},h_{height},q_90/file.png
```

### Downloading images for export

Wix-hosted images on `static.wixstatic.com` are publicly accessible — just `fetch(url)` and save the buffer. No auth needed.

## V1 REST API Endpoints (for MCP data seeding)

### Products
- Create: `POST https://www.wixapis.com/stores/v1/products`
  ```json
  { "product": { "name": "...", "productType": "physical", "priceData": { "price": 49.99 },
    "description": "...", "visible": true, "manageVariants": true,
    "productOptions": [{ "name": "Size", "choices": [{ "value": "S", "description": "S" }] }] } }
  ```
- Query: `POST https://www.wixapis.com/stores/v1/products/query`
  ```json
  { "query": { "paging": { "limit": 100 } }, "includeVariants": true }
  ```
- Add media: `POST https://www.wixapis.com/stores/v1/products/{id}/media`
  ```json
  { "media": [{ "url": "https://..." }, { "mediaId": "existing-wix-media-id" }] }
  ```
- Remove media: `POST https://www.wixapis.com/stores/v1/products/{id}/media/delete`
  ```json
  { "mediaIds": [] }  // empty array removes ALL media
  ```

### Collections
- Create: `POST https://www.wixapis.com/stores/v1/collections`
  ```json
  { "collection": { "name": "...", "description": "...", "visible": true } }
  ```
- Query: `POST https://www.wixapis.com/stores/v1/collections/query`
  ```json
  { "query": { "paging": { "limit": 100 } } }
  ```
- Delete: `DELETE https://www.wixapis.com/stores/v1/collections/{id}`
- Add products: `POST https://www.wixapis.com/stores/v1/collections/{id}/productIds`
  ```json
  { "productIds": ["product-id-1", "product-id-2"] }
  ```

### Catalog Version
- Check: `GET https://www.wixapis.com/stores/v3/provision/version`
  ```json
  { "catalogVersion": "V1_CATALOG" }  // or "V3_CATALOG" or "STORES_NOT_INSTALLED"
  ```

## Cart Event System

The `CartSidebar` component (rendered site-wide via `Layout.astro`) listens for a custom `cart-updated` event on `window`. After any cart modification in other components (like `ProductActions`), dispatch:
```typescript
window.dispatchEvent(new CustomEvent('cart-updated'));
```
This triggers CartSidebar to re-fetch the cart and update the badge count.

## Gotchas & Lessons Learned

1. **appId confusion**: The Stores appId `215238eb-22a5-4c36-9e7b-e7c08025e04e` is used everywhere in eCommerce (cart, checkout, back-in-stock). The old ID `1380b703-ce81-ff05-f115-39571d94dfcd` is wrong and causes `CATALOG_ITEMS_RETRIEVAL_FAILURE`.

2. **V1 site + V3 API = 428 error**: Always check catalog version before choosing endpoints. V3 calls on a V1 site fail with `428 Precondition Required`.

3. **getCurrentCart returns Cart directly**: Not `{ cart: Cart }` — destructuring `{ cart }` gives undefined.

4. **searchOrders takes OrderSearch directly**: Not `{ search: OrderSearch }` — pass `{ cursorPaging: { limit: 50 } }` at top level.

5. **backInStockNotifications SDK broken client-side**: The SDK's `createBackInStockNotificationRequest` doesn't serialize fields correctly when called from client-side React. All fields arrive empty at the server. Fix: call it server-side from an API endpoint (`/api/back-in-stock`), and have the client `fetch()` that endpoint. The SDK call needs `catalogReference`, `email`, and `itemDetails` (with `name` and `price`) at the top level (not nested under `request`).

6. **queryProducts doesn't include variants**: The V1 `queryProducts()` builder does NOT return variant data. You MUST use `products.getProduct(id)` to get variants with their IDs. Without variant IDs, `addToCurrentCart` fails with `CATALOG_ITEMS_RETRIEVAL_FAILURE` for managed-variant products. Pattern: `queryProducts().eq('slug', slug)` to find the product, then `getProduct(id)` for full data.

7. **Product images via URL only**: The Add Product Media API accepts external URLs or existing Wix media IDs — NOT base64/data URIs. When generating images with AI, use `dall-e-3` (returns URLs) not `gpt-image-1` (returns base64 only). The MCP tool can only send JSON, so you can't do binary uploads to Wix Media through it.

8. **DALL-E model choice matters**: `dall-e-3` supports `response_format: "url"` and returns temporary hosted URLs (~2hr). `gpt-image-1` only returns `b64_json` — there's no URL option. For the MCP workflow (JSON-only), you MUST use `dall-e-3`.

9. **Wix permanently hosts uploaded media**: Once you call Add Product Media with an external URL, Wix downloads it and hosts it on `static.wixstatic.com` forever. The original URL can expire after that — Wix has its own copy.
