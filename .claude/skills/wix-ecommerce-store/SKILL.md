---
name: wix-ecommerce-store
description: Wix eCommerce Store Skill — cart, checkout, orders, back-in-stock, catalog version detection. Covers shared eCommerce patterns across Catalog V1 and V3. Trigger on Wix Stores, ecommerce, cart, checkout, add to cart, buy now, store products.
---

# Wix eCommerce Store

See the version-specific skills for catalog queries and product data:

- **[SKILL-V3.md](SKILL-V3.md)** — V3 catalog: `productsV3` namespace, categories, `215238eb-...` appId
- **[SKILL-V1.md](SKILL-V1.md)** — V1 catalog (legacy): `products` namespace, collections, `1380b703-...` appId

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
