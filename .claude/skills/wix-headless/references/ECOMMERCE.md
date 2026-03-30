# Wix eCommerce Store

## Store Building Guidelines

When building a headless store, follow these guidelines to create a complete, production-quality experience:

### Required pages for a complete store

A functional store MUST include ALL of the following pages. Do not skip any:

1. **Store listing page** (`/store`) — product grid with category filtering
2. **Product detail page** (`/store/[slug]`) — full product info, options, add-to-cart
3. **Cart sidebar** — slide-out cart with line items, quantities, checkout
4. **Thank you page** (`/store/thank-you`) — post-checkout confirmation
5. **Member area** (`/member`) — ⚠️ **Common mistake** — skipping the member area leaves customers with no way to review past purchases. A store without a member area is incomplete. Customers need to see their order history. Must include:
   - Authentication gate (redirect to login if not logged in)
   - **My Orders tab** — order history with line items (images via `getImageUrl()`!), quantities, prices, payment/fulfillment status badges, totals
   - **Profile tab** — member info display
   - Logout functionality (POST form, not a link)
6. **Navigation** — must show login/logout state and link to member area

See `references/MEMBER_AREA.md` for full member area implementation details.

### Media is mandatory — not optional

Every entity that supports media MUST have images. A store without images is not a store.

- **Products**: Include images per product at creation time (via `media.itemsInfo.items` with `url`). Aim for 1-3 images.
- **Categories**: Every category should have a cover image.
- **Variants**: Link variant-specific images where applicable (e.g., different colors show different photos).

**Image workflow:** Generate images via Wix Runware API (`POST /runwareschemaless/v1/request` through MCP), import to Wix Media (`POST /site-media/v1/files/import`), then include the `file.url` in the product's `media.itemsInfo.items` during creation. See `ECOMMERCE_V3.md` → "Recommended Product Seeding Workflow" for the full step-by-step.

### Use all available product fields

When seeding products via API, populate ALL rich fields — not just name and price:

- **`plainDescription`** — detailed HTML product description
- **`ribbon`** — badges like "BESTSELLER", "NEW", "SALE", "PRE-ORDER" (can be set inline during product creation)
- **`physicalProperties`** — weight, dimensions for shipping calculation (can be set inline)

**These must be added AFTER product creation (separate API calls):**

- **Options/Variants** — Create customizations first (`POST /stores/v3/customizations`), then update the product to attach them (`POST /stores/v3/products/{id}/update-with-inventory`). This auto-generates variants. See `ECOMMERCE_V3.md` → "Recommended Product Seeding Workflow" Steps 5-6.
- **`infoSections`** — Create info sections (`POST /stores/v3/info-sections`), then assign to products (`POST /stores/v3/bulk/products/add-info-sections`). They CANNOT be inlined in `createProduct`. See `ECOMMERCE_V3.md` → Steps 7-8.
- **`modifiers`** — customization options like engraving text (`FREE_TEXT`), gift wrapping (`TEXT_CHOICES`), or color accents (`SWATCH_CHOICES`). Create as customizations, then attach to products.
- **Categories** — Create categories, create products, then assign products to categories via `POST /categories/v1/bulk/categories/{id}/add-items`. See `ECOMMERCE_V3.md` → Step 9.

### Set up inventory properly

- Use `create-product-with-inventory` to create products with initial inventory in one call
- When adding options (Step 6), variants are auto-generated — update their inventory via `POST /stores/v3/bulk/inventory-items/create` with `inStock: true`
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

When creating categories, import a representative image and set it on the category. Categories without images look broken in grid layouts. Use the media import API first, then create the category with the media reference. ⛔ **Breaks at runtime** — The category `image` field requires `{ "url": "https://..." }`, not `{ "id": "..." }`. Using the wrong shape silently drops the image. → Always use `{ "url": "https://..." }` format for category images.

### Store listing page must support filtering and rich product cards

The store listing page should include:

1. **Category filter tabs** — show only real categories from the store (do NOT add a hardcoded "All" tab). All products are visible by default with no tab active. Clicking an active tab deselects it to show all products again. ⛔ **Breaks at runtime** — The categories REST API returns `cat.id` (not `cat._id`). Using `cat._id` yields `undefined`, breaking filtering. Always use `cat.id || cat._id`.
2. **Product grid** — responsive grid of product cards
3. **Each product card must show:**
   - Product image (or video poster), with fallback if no media
   - Category badge if product has categories
   - Ribbon badge if product has a ribbon (e.g., "SALE", "NEW")
   - Product name
   - Price display: single price or min-max range
   - Sale pricing: original price with strikethrough + discounted price
   - Out-of-stock indicator when `availabilityStatus === 'OUT_OF_STOCK'`
4. **Category filtering**: filter by `directCategoriesInfo.categories` with URL state preservation (`?cat=categoryId`)

### Store listing data fetching

⛔ **Breaks at runtime** — `@wix/stores` does NOT export `categories`. Importing it causes a build-time error. Use `httpClient` from `@wix/essentials` to fetch categories via REST. If `@wix/categories` is installed, you can use its SDK methods instead — see `ECOMMERCE_V3.md` for both approaches.

```typescript
import { productsV3 } from '@wix/stores';
import { httpClient } from '@wix/essentials';

// Fetch all products with category info for client-side filtering
const productResult = await productsV3.queryProducts({
  fields: ['MEDIA_ITEMS_INFO', 'CURRENCY', 'DIRECT_CATEGORIES_INFO']
}).limit(100).find();
const allProducts = productResult.items || [];

// Fetch categories via REST (preferred — always works)
let allCategories: Array<{ id: string; name: string }> = [];
try {
  const res = await httpClient.fetchWithAuth('https://www.wixapis.com/categories/v1/categories/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ treeReference: { appNamespace: '@wix/stores' } }),
  });
  const data = await res.json();
  allCategories = (data.categories ?? []).map((c: any) => ({ id: c.id, name: c.name }));
} catch {}

// Build category lookup for mapping product → collection names
const categoryMap = new Map<string, string>();
for (const c of allCategories) categoryMap.set(c.id, c.name);

// Client-side filtering: use data-collections attribute on product cards
// and filter via JS (see ECOMMERCE_V3.md for full example with filter tabs)
```

**Category filtering approach:** Fetch all products with `DIRECT_CATEGORIES_INFO`, then filter client-side using `data-collections` attributes on product cards and JavaScript. This avoids the complexity of server-side `searchProducts` calls and works well for stores with up to ~100 products.

### Price range display

```typescript
const min = product.actualPriceRange?.minValue;
const max = product.actualPriceRange?.maxValue;
const compareMin = product.compareAtPriceRange?.minValue;

const hasRange = min?.amount !== max?.amount;
const onSale = compareMin && parseFloat(compareMin.amount) > parseFloat(min.amount);

// Display: formatted price, or "min – max" range, or strikethrough original + sale price
```

### Product detail page (ProductActions component)

The ProductActions React component (`client:load`) must handle the full product model. See the "Product detail page must support the full product model" section above for the complete checklist.

Key UX patterns:
- **Option selection** recomputes available variant, updates price display, and checks stock status
- **Swatch options** render as colored circles (use `choice.colorCode`), text options as buttons
- **Free text modifiers** show character count and mandatory indicator
- **Quantity selector** respects min/max from inventory
- **Loading states** for each action (add to cart, buy now, back-in-stock)
- **Success/error messages** with auto-dismiss
- **Cart event dispatch** after adding: `window.dispatchEvent(new CustomEvent('cart-updated'))`

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

⛔ **Breaks at runtime** — Cart line item `image` fields are `wix:image://` strings — they will NOT render in `<img>` tags directly. Always use `getImageUrl(item.image)` to convert to a displayable URL. This applies to ALL Wix SDK media fields (see `references/MEDIA.md`).

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

⛔ **Breaks at runtime** — `createCheckoutFromCurrentCart` is on the `currentCart` module, NOT on `checkout`. Importing from `checkout` will fail at build time.

⛔ **Breaks at runtime** — `createCheckoutFromCurrentCart` returns `{ checkoutId }` — NOT a checkout object with `_id`. Use `const { checkoutId } = await currentCart.createCheckoutFromCurrentCart(...)`, NOT `c._id`. Using `_id` passes `undefined` to `createRedirectSession` which fails with `"is not a valid GUID"`.

```typescript
import { currentCart } from '@wix/ecom';
import { redirects } from '@wix/redirects';

// Create checkout from cart — NOTE: this is on currentCart, NOT checkout
const { checkoutId } = await currentCart.createCheckoutFromCurrentCart({ channelType: 'WEB' });

// Redirect to Wix-hosted checkout
const { redirectSession } = await redirects.createRedirectSession({
  ecomCheckout: { checkoutId },
  callbacks: {
    thankYouPageUrl: window.location.origin + '/store/thank-you',
    postFlowUrl: window.location.origin + '/store',
  },
  preferences: { checkIfPublish: true }, // use checkIfPublish ONLY for ecomCheckout, NOT for bookings/plans
});
if (redirectSession?.fullUrl) window.location.href = redirectSession.fullUrl;
```

### Thank You Page

After checkout, Wix redirects to `thankYouPageUrl` with `?orderId=<id>` query param. Fetch order details:
```typescript
import { orders as ecomOrders } from '@wix/ecom';
const order = await ecomOrders.getOrder(orderId);
```

### My Orders (Member Area) — REQUIRED

**Do NOT skip this.** Every store MUST have a member area where customers can view their order history. A store without order history is incomplete — customers have no way to review past purchases.

Build a `/member` page with authentication gating and an orders tab. See `references/MEMBER_AREA.md` → "Store Orders Tab" for the full implementation guidelines — including what to display per order (header, line items, totals, delivery info), status badge colors, and empty states. Remember: order line item images are `wix:image://` strings — always use `getImageUrl()` to render them.

### Back-in-Stock Notifications

```typescript
import { backInStockNotifications } from '@wix/ecom';

// SDK takes two separate args: (request, itemDetails)
await (backInStockNotifications.createBackInStockNotificationRequest as Function)(
  { catalogReference: catalogRef, email: userEmail },
  { name: productName, price: String(priceAmount) },
);
```

⚠️ **Common mistake** — Back-in-stock uses the V1 appId (`1380b703-ce81-ff05-f115-39571d94dfcd`) even on V3 sites. Using the V3 appId silently fails to register the notification request. → Always use V1 appId `1380b703-ce81-ff05-f115-39571d94dfcd` for back-in-stock.

### Media Generation

See [MEDIA.md](MEDIA.md) for the full image/video generation and upload workflow (Runware API, Wix Media Import, end-to-end steps). Always AI-generate product images, category images, and product videos.
