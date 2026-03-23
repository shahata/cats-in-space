# Wix eCommerce Store

## Store Building Guidelines

When building a headless store, follow these guidelines to create a complete, production-quality experience:

### Media is mandatory — not optional

Every entity that supports media MUST have images. A store without images is not a store.

- **Products**: Include multiple images per product at creation time (via `media.itemsInfo.items` with `url` or `id`). Aim for 3-5 images showing different angles. Include video when possible.
- **Categories**: Every category should have a cover image. Import images and set them when creating categories.
- **Variants**: Link variant-specific images where applicable (e.g., different colors show different photos).

Always add media during product/category creation — not as a separate step. The V3 create API supports `"media": { "itemsInfo": { "items": [{ "url": "https://..." }] } }` inline.

### Use all available product fields

When seeding products via API, populate ALL rich fields — not just name and price:

- **`plainDescription`** — detailed HTML product description
- **`infoSections`** — additional tabs like "Specifications", "Size Guide", "Care Instructions", "Shipping Info". These appear as expandable sections on the product page.
- **`modifiers`** — customization options like engraving text (`FREE_TEXT`), gift wrapping (`TEXT_CHOICES`), or color accents (`SWATCH_CHOICES`). These are separate from options/variants.
- **`ribbon`** — badges like "BESTSELLER", "NEW", "SALE", "PRE-ORDER"
- **`options`** with multiple choices — sizes, colors (with `colorCode` for swatches), materials
- **`compareAtPriceRange`** — set original prices to show sale pricing
- **`physicalProperties`** — weight, dimensions for shipping calculation

### Set up inventory properly

- Create inventory for every variant immediately after product creation
- Set up pre-order for upcoming products: `trackQuantity: true`, `quantity: 0`, `preorderInfo: { enabled: true, limit: N, message: "..." }`
- Mark some variants as out-of-stock to exercise the back-in-stock flow

### Enable back-in-stock notifications

- The product detail page MUST show a "Notify Me" form when a product/variant is out of stock (and not pre-orderable)
- Collect email and call `backInStockNotifications.createBackInStockNotificationRequest`
- Uses V1 appId even on V3 sites

### Product detail page must support the full product model

The product detail component should render ALL of:
- Image gallery with thumbnails (images AND video)
- Variant options (text choices and color swatches)
- Modifiers (free text inputs, choice buttons, color swatches) with mandatory indicators
- Quantity selector
- Pre-order badge and button text when applicable
- Sale pricing (compare-at price with strikethrough)
- Ribbon badges
- Info sections as expandable/tabbed content
- Back-in-stock email form for out-of-stock items
- Related products

### Categories need images too

When creating categories, import a representative image and set it on the category. Categories without images look broken in grid layouts. Use the media import API first, then create the category with the media reference.

See the version-specific references for catalog queries and product data:

- **[ECOMMERCE_V3.md](ECOMMERCE_V3.md)** — V3 catalog: `productsV3` namespace, categories, `215238eb-...` appId
- **[ECOMMERCE_V1.md](ECOMMERCE_V1.md)** — V1 catalog (legacy): `products` namespace, collections, `1380b703-...` appId

## How to check catalog version

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

## eCommerce APIs (version-agnostic)

### Packages

```bash
npm install @wix/ecom       # currentCart, orders, backInStockNotifications
npm install @wix/redirects  # createRedirectSession for checkout
```

### Cart

```typescript
import { currentCart } from '@wix/ecom';
import type { cart as cartTypes } from '@wix/ecom';

// Add to cart
await currentCart.addToCurrentCart({
  lineItems: [{ quantity: 1, catalogReference: catalogRef }],
});

// Get current cart
const cart = await currentCart.getCurrentCart(); // returns Cart directly, NOT { cart }

// Estimate totals
const totals = await currentCart.estimateCurrentCartTotals({});
// totals.priceSummary (top level, NOT totals.estimatedTotals)

// Update line item quantity
await currentCart.updateCurrentCartLineItemQuantity([{ _id: lineItemId, quantity: newQty }]);

// Remove line items
await currentCart.removeLineItemsFromCurrentCart([lineItemId]);
```

### Cart Update Event Pattern

After any cart modification, notify other components:
```typescript
window.dispatchEvent(new CustomEvent('cart-updated'));
```
A site-wide cart sidebar can listen for this event to refresh.

### Checkout Flow

```typescript
import { currentCart } from '@wix/ecom';
import { redirects } from '@wix/redirects';

// Create checkout from cart
const { checkoutId } = await currentCart.createCheckoutFromCurrentCart({ channelType: 'WEB' });

// Redirect to Wix-hosted checkout
const { redirectSession } = await redirects.createRedirectSession({
  ecomCheckout: { checkoutId },
  callbacks: {
    thankYouPageUrl: window.location.origin + '/store/thank-you',
    postFlowUrl: window.location.origin + '/store',
  },
});
if (redirectSession?.fullUrl) window.location.href = redirectSession.fullUrl;
```

### Thank You Page

After checkout, Wix redirects to `thankYouPageUrl` with `?orderId=<id>` query param. Fetch order details:
```typescript
import { orders as ecomOrders } from '@wix/ecom';
const order = await ecomOrders.getOrder(orderId);
```

### Back-in-Stock Notifications

```typescript
import { backInStockNotifications } from '@wix/ecom';

// SDK takes two separate args: (request, itemDetails)
await (backInStockNotifications.createBackInStockNotificationRequest as Function)(
  { catalogReference: catalogRef, email: userEmail },
  { name: productName, price: String(priceAmount) },
);
```

**CRITICAL:** Back-in-stock uses the V1 appId (`1380b703-ce81-ff05-f115-39571d94dfcd`) even on V3 sites. Use the V1 appId for back-in-stock, V3 appId for cart/checkout.

### Media Generation for Products

- Images: `dall-e-3` with `response_format: "url"` (NOT `gpt-image-1` which only returns base64)
- Video: Sora API → temp host → Wix Import File API → Add Product Media by `id`
- Add images one at a time via MCP (batching may silently drop)
