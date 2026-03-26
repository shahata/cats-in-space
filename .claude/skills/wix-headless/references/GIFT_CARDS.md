# Wix Gift Cards (Headless)

## Overview

Gift cards in Wix are managed through the `@wix/gift-vouchers` package. There are two main namespaces:

- **`giftVoucherProducts`** — gift card product templates (preset amounts, custom amounts, images, descriptions)
- **`giftVouchers.giftVouchers`** — gift card instances (create, query, redeem, void, send email)

Gift card products are eCommerce catalog items under the **Rise app** (`d80111c5-a0f4-47a8-b63a-65b54d774a27`). They go through standard Wix eCommerce checkout — not a custom creation flow.

## Package

```
npm install @wix/gift-vouchers
```

Imports:
```typescript
import { giftVoucherProducts } from '@wix/gift-vouchers';
import { giftVouchers } from '@wix/gift-vouchers';  // for gift card instances
```

> **Note:** `@wix/ecom` also exports a `giftVouchers` namespace, but it only has consumer APIs (`getGiftCard`, `redeemGiftCard`, `voidTransaction`). The management/product APIs require the standalone `@wix/gift-vouchers` package.

## Gift Card Product Model

```typescript
interface GiftCardProduct {
  _id?: string;
  name?: string;               // max 55 chars
  description?: string;        // max 3000 chars
  image?: string;              // Wix media string — use getImageUrl() to resolve
  expirationType?: 'NONE' | 'FIXED' | 'RELATIVE';
  presetVariants?: PresetVariant[];
  customVariant?: CustomVariant;
}

interface PresetVariant {
  _id?: string;
  price?: MultiCurrencyPrice;  // what the customer pays
  value?: MultiCurrencyPrice;  // what the card is worth (can differ from price!)
  image?: string;              // Wix media string — variant-specific image
}

interface CustomVariant {
  minValue?: MultiCurrencyPrice;
  maxValue?: MultiCurrencyPrice;
  image?: string;
}

interface MultiCurrencyPrice {
  amount?: string;             // decimal string e.g. "50.00"
  formattedAmount?: string;    // e.g. "$50.00" (read-only from API)
  convertedAmount?: string;
  formattedConvertedAmount?: string;
}
```

### Important: Price vs Value

Each preset variant has both `price` and `value`:
- **`value`** = the face value of the gift card (what the recipient gets)
- **`price`** = the purchase cost (what the buyer pays)

These can differ (e.g., buy a $50 card for $40). Always display both when they differ.

### Important: Images

- Product-level `image` and variant-level `image` are **Wix media strings** (e.g. `wix:image://...` or media IDs)
- **Always resolve via `getImageUrl()`** before rendering — do NOT pass raw media strings to `<img src>`
- Each variant can have its own image; fall back to the product image when a variant has none
- Resolve images server-side (Astro frontmatter) since `getImageUrl` uses `@wix/sdk` media helpers

## Fetching Gift Card Products

`queryGiftCardProducts` requires elevated permissions:

```typescript
import { giftVoucherProducts } from '@wix/gift-vouchers';
import { auth } from '@wix/essentials';

const elevatedQuery = auth.elevate(giftVoucherProducts.queryGiftCardProducts);
const result = await elevatedQuery().limit(10).find();
const products = result.items; // GiftCardProduct[]
```

## Adding to Cart & Checkout (eCommerce Flow)

Gift cards are catalog items under the Rise app. Use `currentCart` exactly like regular products — **do NOT use `checkout.createCheckout` with custom line items**.

### App ID & Constants

```typescript
const RISE_APP_ID = "d80111c5-a0f4-47a8-b63a-65b54d774a27";
const CUSTOM_VARIANT_ID = "custom";
```

### Catalog Reference Format

The `options` object in the catalog reference carries gift-card-specific data:

```typescript
import { currentCart } from "@wix/ecom";
import { redirects } from "@wix/redirects";

const options: Record<string, unknown> = {
  quantity: 1,
  currency: "USD",
  wixGiftCardsAppNewCatalog: true,  // required flag
};

// For preset variant:
options.variantId = selectedVariantId;

// For custom amount:
options.customAmount = 75.00;  // number

// For gifting (sending to someone else):
options.giftingInfo = {
  recipientInfo: {
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@example.com",
  },
  greetingMessage: "Happy birthday!",  // optional
  deliverAt: "2025-12-25T00:00:00Z",   // optional scheduled delivery
};

// Add to cart
await currentCart.addToCurrentCart({
  lineItems: [{
    quantity: 1,
    catalogReference: {
      appId: RISE_APP_ID,
      catalogItemId: giftCardProduct._id,
      options,
    },
  }],
});

// Checkout (same pattern as regular products)
const { checkoutId } = await currentCart.createCheckoutFromCurrentCart({
  channelType: "WEB",
});

const { redirectSession } = await redirects.createRedirectSession({
  ecomCheckout: { checkoutId: checkoutId! },
  callbacks: {
    thankYouPageUrl: window.location.origin + "/store/thank-you",
    postFlowUrl: window.location.origin + "/store",
  },
  preferences: { checkIfPublish: true },
});

window.location.href = redirectSession.fullUrl;
```

### Key Differences from Regular Products

| Aspect | Regular Product | Gift Card |
|--------|----------------|-----------|
| App ID | `215238eb-22a5-4c36-9e7b-e7c08025e04e` (Stores) | `d80111c5-a0f4-47a8-b63a-65b54d774a27` (Rise) |
| Variant selection | `options.variantId` | `options.variantId` OR `options.customAmount` |
| Required flag | — | `options.wixGiftCardsAppNewCatalog: true` |
| Gifting info | — | `options.giftingInfo` with recipient details |
| Product query | `productsV3.queryProducts()` | `giftVoucherProducts.queryGiftCardProducts()` (elevated) |

## UI Implementation Pattern

### Recommended Component Structure

Use a **React client component** (`client:load` in Astro) for the interactive gift card purchase flow. The server-side Astro page fetches products and resolves images; the React component handles state and checkout.

```astro
<!-- Server: fetch products, resolve images -->
---
const elevatedQuery = auth.elevate(giftVoucherProducts.queryGiftCardProducts);
const result = await elevatedQuery().limit(10).find();
const products = result.items.map(p => ({
  _id: p._id,
  name: p.name,
  image: getImageUrl(p.image, 600, 340),
  presetVariants: p.presetVariants.map(v => ({
    _id: v._id,
    price: v.price,
    value: v.value,
    image: getImageUrl(v.image, 600, 340),
  })),
  customVariant: p.customVariant,
}));
---

<!-- Client: interactive purchase -->
<GiftCardActions client:load productId={product._id} ... />
```

### UI Elements

1. **Amount selector** — buttons for each preset variant showing the card value
2. **Custom amount input** — shown when `customVariant` exists, with min/max validation
3. **Price display** — always show the cost; when discounted, show strikethrough value + actual price
4. **Variant image** — update image when user selects a variant; fall back to product image
5. **Recipient form** — email, name, optional message for gifting
6. **Buy Now button** — triggers `addToCurrentCart` → `createCheckoutFromCurrentCart` → redirect

## Gift Card Instance APIs (Management)

For admin/backend use — creating, querying, and managing gift card instances:

```typescript
import { giftVouchers } from '@wix/gift-vouchers';
import { auth } from '@wix/essentials';

// Create a gift card (requires elevation)
const elevated = auth.elevate(giftVouchers.giftVouchers.createGiftCard);
const card = await elevated({
  initialValue: { amount: "50" },
  currency: "USD",
  source: "MANUAL",  // or "ORDER"
  notificationInfo: {
    recipient: { email: "jane@example.com", name: "Jane" },
    sender: { name: "John" },
    personalizedMessage: "Enjoy!",
  },
});
// card.code is the full unobfuscated code (only available on creation)

// Send email notification
await giftVouchers.giftVouchers.sendGiftCardEmail(card._id!);

// Query gift cards
const result = await giftVouchers.giftVouchers.queryGiftCards().find();

// Other methods:
// giftVouchers.giftVouchers.getGiftCard(id)
// giftVouchers.giftVouchers.searchGiftCards(search)
// giftVouchers.giftVouchers.disableGiftCard(id)
// giftVouchers.giftVouchers.listGiftCardsByContactDetails(searchField)
// giftVouchers.giftVouchers.countGiftCards(options)
```

## Translations

### Static UI Strings

Gift card UI strings (labels, placeholders, buttons) must be added to:
- `src/translations.json` — English keys under the `store` namespace (e.g. `store.giftCards`, `store.gcSelectAmount`, `store.gcBuyNow`)
- `.wix/multilingual/translations/{lang}.json` — same keys translated for each secondary language

These work at runtime because the Astro integration reads the JSON files directly.

### Dynamic Content (Gift Card Product Names/Descriptions)

The Wix Gift Cards (Rise) app **does NOT register a translation schema** in the Translation Content API. Querying `GET /translation-schema/v1/schemas/site?appId=d80111c5-a0f4-47a8-b63a-65b54d774a27` returns zero schemas.

This means gift card product names and descriptions **cannot be translated via the Translation Content API**. They must be translated through the Wix dashboard Translation Manager if/when the app adds schema support.

### `wix translation push`

The `wix translation push` CLI command requires an interactive TTY terminal. It cannot be run programmatically. If it fails with "Invalid input", the user must run it manually via `! wix translation push` in their terminal.

## Gotchas

1. **`queryGiftCardProducts` requires elevated permissions** — use `auth.elevate()` on the server
2. **Images are Wix media strings** — always resolve with `getImageUrl()` before rendering
3. **`@wix/ecom`'s `giftVouchers` is the consumer API only** — for product management and gift card creation, install `@wix/gift-vouchers`
4. **`wixGiftCardsAppNewCatalog: true`** must be set in the cart options or the catalog lookup will fail
5. **Price ≠ Value** — a gift card can cost less than its face value; always handle both fields
6. **The full gift card code is only returned on creation** — subsequent `getGiftCard` calls return an obfuscated code
7. **Gift card products may not exist** — wrap the query in try/catch; only show the gift cards tab when products are available
8. **No translation schema for gift card products** — the Rise app doesn't register schemas in the Translation Content API; product names/descriptions can't be translated via API
9. **Do NOT use `checkout.createCheckout` with `customLineItems`** — gift cards are catalog items under the Rise app; use `currentCart.addToCurrentCart` with the proper `catalogReference` and `RISE_APP_ID`
