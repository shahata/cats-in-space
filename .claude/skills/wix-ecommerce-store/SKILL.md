# Wix eCommerce Store Skill

## Overview

This skill covers patterns for working with the Wix eCommerce store in this Astro headless project. The site uses **Catalog V1** (not V3).

## SDK Packages

- `@wix/stores` — Product and collection queries
  - `products` namespace (V1): `queryProducts`, `queryStoreVariants`
  - `collections` namespace (V1): `queryCollections`
- `@wix/ecom` — Cart, checkout, orders, back-in-stock
  - `currentCart`: `getCurrentCart`, `addToCurrentCart`, `removeLineItemsFromCurrentCart`, `updateCurrentCartLineItemQuantity`, `estimateCurrentCartTotals`, `createCheckoutFromCurrentCart`
  - `orders`: `searchOrders`
  - `backInStockNotifications`: `createBackInStockNotificationRequest`
- `@wix/redirects` — Checkout redirect sessions

## Stores App ID (V1 Catalog)

For `catalogReference.appId` in cart/checkout operations:
```
215238eb-22a5-4c36-9e7b-e7c08025e04e
```

## Product Query Patterns

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

### Query product variants
```typescript
const vr = await (products as any).queryStoreVariants({
  filter: { productId: product._id },
  paging: { limit: 100 }
});
const variants = vr.variants || [];
```

### Query collections
```typescript
import { collections } from '@wix/stores';
const result = await collections.queryCollections().limit(100).find();
```

## Cart Operations (client-side React)

### catalogReference structure
```typescript
const catalogRef = {
  catalogItemId: product._id,
  appId: '215238eb-22a5-4c36-9e7b-e7c08025e04e',
  options: { variantId }  // include for products with variants
};
```

### Add to cart
```typescript
import { currentCart } from '@wix/ecom';
await currentCart.addToCurrentCart({
  lineItems: [{ quantity, catalogReference: catalogRef }],
});
// Dispatch custom event to update cart UI:
window.dispatchEvent(new CustomEvent('cart-updated'));
```

### Get current cart
```typescript
const cart = await currentCart.getCurrentCart();
// cart.lineItems, cart._id, etc.
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
```

## Back-in-Stock Notifications

```typescript
import { backInStockNotifications } from '@wix/ecom';
await backInStockNotifications.createBackInStockNotificationRequest({
  request: {
    catalogReference: {
      catalogItemId: productId,
      appId: '215238eb-22a5-4c36-9e7b-e7c08025e04e',
      options: { variantId },
    },
    email: 'customer@email.com',
  },
  itemDetails: {
    name: 'Product Name',
    price: '49.99',
  },
});
```

## V1 Product Data Shape

Key fields from `queryProducts().find().items`:
- `_id` — Product GUID
- `name` — Product name
- `slug` — URL-friendly name
- `description` — HTML description
- `visible` — Whether product is published
- `productType` — `"physical"` or `"digital"`
- `media.items[]` — Array of media items (each has `image.url`)
- `priceData` — `{ price, discountedPrice, currency, formatted: { price, discountedPrice } }`
- `priceRange` — `{ minValue, maxValue }`
- `productOptions[]` — Array of `{ name, optionType, choices: [{ value, description, inStock }] }`
- `variants[]` — Array of `{ id, choices: { OptionName: "ChoiceValue" }, variant: { priceData, ... }, stock: { inStock, trackQuantity } }`
- `collectionIds[]` — Array of collection GUIDs the product belongs to
- `stock` — `{ inStock, inventoryStatus, trackInventory }`

## REST API Endpoints (for MCP data seeding)

- Create V1 Product: `POST https://www.wixapis.com/stores/v1/products`
- Create V1 Collection: `POST https://www.wixapis.com/stores/v1/collections`
- Add Products to Collection: `POST https://www.wixapis.com/stores/v1/collections/{id}/productIds`

**Important:** This site uses Catalog V1. V3 API calls (`/stores/v3/...`) will return `428 Precondition Required`.

## Cart Event System

The `CartSidebar` component listens for a custom `cart-updated` event on `window`. After any cart modification in other components (like `ProductActions`), dispatch:
```typescript
window.dispatchEvent(new CustomEvent('cart-updated'));
```
