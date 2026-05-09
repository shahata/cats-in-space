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

- **Products**: Every product MUST have **3 images** (not just 1). Include at creation time via `media.itemsInfo.items` with `url`. Add extra images via PATCH after creation if needed.
- **Categories**: Every category should have a cover image.
- **Variants**: Link variant-specific images where applicable (e.g., different colors show different photos).

**Image workflow:** Generate images via Wix Runware API (`POST /runwareschemaless/v1/request` through MCP), import to Wix Media (`POST /site-media/v1/files/import`), then include the `file.url` in the product's `media.itemsInfo.items` during creation. See `ECOMMERCE_V3.md` → "Recommended Product Seeding Workflow" for the full step-by-step.

### Use all available product fields

When seeding products via API, populate ALL rich fields — not just name and price:

- **`plainDescription`** — detailed HTML product description
- **`ribbon`** — badges like "BESTSELLER", "NEW", "SALE", "PRE-ORDER" (can be set inline during product creation)
- **`physicalProperties`** — weight, dimensions for shipping calculation (can be set inline)

**These must be added AFTER product creation (separate API calls):**

- **Options/Variants** — Create customizations first (`POST /stores/v3/customizations`), then update the product to attach them (`PATCH /stores/v3/products-with-inventory/{id}`). This auto-generates variants. At least one product should have **multiple option types combined** (e.g., Color swatch + Size text → many variants at different prices). See `ECOMMERCE_V3.md` → "Recommended Product Seeding Workflow" Steps 5-6.
- **`infoSections`** — Create info sections (`POST /stores/v3/info-sections`), then assign to products (`POST /stores/v3/bulk/products/add-info-sections`). They CANNOT be inlined in `createProduct`. See `ECOMMERCE_V3.md` → Steps 7-8.
- **`modifiers`** — customization options like engraving text (`FREE_TEXT`), gift wrapping (`TEXT_CHOICES`), or color accents (`SWATCH_CHOICES`). Create as customizations, then attach to products.
- **Categories** — Create categories, create products, then assign products to categories via `POST /categories/v1/bulk/categories/{id}/add-items`. See `ECOMMERCE_V3.md` → Step 9.

### Set up inventory properly

- Use `create-product-with-inventory` to create products with initial inventory in one call
- When adding options (Step 6), variants are auto-generated — update their inventory via `POST /stores/v3/bulk/inventory-items/create` with `inStock: true`
- Set up pre-order for upcoming products: `trackQuantity: true`, `quantity: 0`, `preorderInfo: { enabled: true, limit: N, message: "..." }`
- Mark at least one **entire product** as fully out-of-stock (not just a variant) to exercise the back-in-stock notification form on the product detail page

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

When creating categories, import a representative image and set it on the category. Categories without images look broken in grid layouts. Use the media import API first, then create the category with the media reference. The category `image` field is `{ "url": "https://..." }` — unlike most Wix entities, it does not accept `{ "id": "..." }`.

### Store listing page must support filtering and rich product cards

The store listing page should include:

1. **Category filter tabs** — show only real categories from the store (do NOT add a hardcoded "All" tab). All products are visible by default with no tab active. Clicking an active tab deselects it to show all products again. Read the category identifier as `cat.id || cat._id` — the categories REST response uses `id`, while the rest of the SDK uses `_id`.
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

Categories live in their own package — `@wix/categories`, not `@wix/stores`. Prefer the SDK over `httpClient.fetchWithAuth` so auth, types, and response shapes are handled.

```typescript
import { productsV3 } from '@wix/stores';
import { categories } from '@wix/categories';

const productResult = await productsV3.queryProducts({
  fields: ['MEDIA_ITEMS_INFO', 'CURRENCY', 'DIRECT_CATEGORIES_INFO'],
}).limit(100).find();
const allProducts = productResult.items || [];

const catResult = await categories.queryCategories(
  {},
  { treeReference: { appNamespace: '@wix/stores' } },
);
const allCategories = catResult.categories || [];
```

`queryCategories` uses the two-argument form (the builder form 400s on empty filter) — see [SDK_CORE.md gotchas](SDK_CORE.md#sdk-gotchas--quick-reference). For category filtering, fetch all products with `DIRECT_CATEGORIES_INFO` and filter client-side via `data-collections` attributes on the cards — works well up to ~100 products without server-side `searchProducts`.

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

Cart line item `image` fields are `wix:image://` strings — pass them through `getImageUrl(item.image)` before rendering, like every other Wix SDK media field (see `references/MEDIA.md`).

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

Two different APIs depending on whether the user is checking out *the cart* or *a single thing* (Buy Now, Donate, any one-off flow):

| Scenario | API | Cart impact | Returns |
|----------|-----|-------------|---------|
| Cart sidebar → "Checkout" button | `currentCart.createCheckoutFromCurrentCart({ channelType })` | Reads everything in the current cart | `{ checkoutId }` |
| "Buy Now" / "Donate" / ticket / anything that bypasses the cart | `checkout.createCheckout({ lineItems, channelType })` | Does **not** touch the cart | `Checkout` object — use `_id` |

For Buy Now / Donate, call `checkout.createCheckout` directly with the line items — don't add to the cart first. `createCheckoutFromCurrentCart` reads everything currently in the user's cart, so using it for a one-off purchase pulls their existing items into the checkout and leaves the new item in their cart afterwards.

The two APIs return different shapes:
- `currentCart.createCheckoutFromCurrentCart` → `{ checkoutId }`
- `checkout.createCheckout` → full `Checkout` object — destructure `_id`

Both are exported from `@wix/ecom`, but on different modules (`currentCart` vs `checkout`).

```typescript
// --- Cart checkout ---
import { currentCart } from '@wix/ecom';
import { redirects } from '@wix/redirects';

const { checkoutId } = await currentCart.createCheckoutFromCurrentCart({
  channelType: currentCart.ChannelType.WEB,
});
```

```typescript
// --- Buy Now / Donate / one-off checkout ---
import { checkout } from '@wix/ecom';
import { redirects } from '@wix/redirects';

const { _id: checkoutId } = await checkout.createCheckout({
  lineItems: [{ quantity, catalogReference: buildCatalogRef() }],
  channelType: checkout.ChannelType.WEB,
});
```

Either way, the redirect is the same:

```typescript
const { redirectSession } = await redirects.createRedirectSession({
  ecomCheckout: { checkoutId: checkoutId! },
  callbacks: checkoutCallbacks({
    thankYouPagePath: '/store/thank-you',
    postFlowPath: '/store',
  }),
  preferences: { checkIfPublish: true }, // use checkIfPublish ONLY for ecomCheckout, NOT for bookings/plans
});
if (redirectSession?.fullUrl) window.location.href = redirectSession.fullUrl;
```

`checkoutCallbacks` is the shared helper in `src/utils/redirects.ts` — see "Redirect callbacks: always pass all of them" below.

### Redirect callbacks: always pass all of them

Wix's hosted checkout may redirect back to any of the callback URLs depending on what the user does (clicking "Back to cart" jumps to `cartPageUrl`; an abandoned checkout falls to `postFlowUrl`). Any callback you don't pass falls through to a Wix-hosted page, and the user drops off your custom site mid-flow.

**Rule:** every `createRedirectSession` call — eCommerce, bookings, plans, donations, events, gift cards, restaurants — must pass every callback URL this site has a custom page for. Only `thankYouPageUrl` and `postFlowUrl` are context-aware; everything else is a site-wide constant.

The centralised helper is `checkoutCallbacks()` in `src/utils/redirects.ts` — every caller passes its `thankYouPagePath` + `postFlowPath` and the helper fills in the site-wide constants (`cartPageUrl`, `bookingsServiceListUrl`, `planListUrl`, …). Usage:

```typescript
callbacks: checkoutCallbacks({
  thankYouPagePath: '/tickets/thank-you',
  postFlowPath: '/tickets',
}),
```

Two things to know when extending it:
- Don't pass `loginUrl` unless there's a genuine custom login *page*. `/api/auth/login` is a route handler, not a page — passing it creates a redirect loop.
- The shared cart sidebar lives in both `/store/*` and `/restaurant/order`; switch on `window.location.pathname` to pick the right `thankYouPagePath` / `postFlowPath` in each context. Add new site-wide callbacks to the helper, not to individual callers.

### Custom cart page at /store/cart

Every storefront needs a dedicated cart page at `/store/cart`, not just the slide-out sidebar. Wix's checkout has a "Back to cart" link that goes to `cartPageUrl` — without a custom page it dumps users onto Wix's hosted cart and they leave the headless site.

Build it as the full-page sibling of the sidebar:

1. Extract shared state into a `useCart` hook (fetch, update quantity, remove line, checkout) in `src/utils/useCart.ts`. Both the sidebar and the page import it — no duplicated cart logic.
2. `CartSidebar` is the compact slide-out. `CartPage` is the full-page layout (two-column: items list + sticky order summary). Line-item rendering can diverge — they have different chrome — but mutations go through the same hook.
3. Mount the page at `src/pages/store/cart.astro` with `<CartPage client:load />`.
4. The "Checkout" button on *both* sidebar and page passes `cartPageUrl: /store/cart` via `checkoutCallbacks()` (above). The sidebar also gets a "View Cart" link into the page.
5. Empty state → link to `/store`. Full state → "Continue Shopping" link next to checkout.

The dedicated page is addressable (users can bookmark/share it), accessible (real heading, not a slide-out), and completes the `cartPageUrl` contract.

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

Back-in-stock requires two one-time setup steps before the API works:

1. **Install the back-in-stock app** via REST:
   ```
   POST https://www.wixapis.com/apps-installer-service/v1/app-instance/install
   Body: { "tenant": { "id": "<siteId>", "tenantType": "SITE" }, "appInstance": { "appDefId": "16be6c71-d061-4f56-8cda-c6aa911d1832" } }
   ```
   This is an account-level API — use the ManageWixSite MCP tool, not CallWixSiteAPI.

2. **Enable notification collection**:
   ```
   POST https://www.wixapis.com/back-in-stock-service/v1/back-in-stock-notification-requests/settings/start-collecting
   Body: { "appId": "1380b703-ce81-ff05-f115-39571d94dfcd" }
   ```

Once enabled, use the SDK:

```typescript
import { backInStockNotifications } from '@wix/ecom';
import { ECOM_PLATFORM_APP_ID } from '../utils/appIds';

const catalogReference: backInStockNotifications.CatalogReference = {
  catalogItemId: productId,
  appId: ECOM_PLATFORM_APP_ID,
  ...(variantId ? { options: { variantId } } : {}),
};

// SDK takes two separate args: (request, itemDetails)
await backInStockNotifications.createBackInStockNotificationRequest(
  { catalogReference, email: userEmail },
  { name: productName, price: String(priceAmount) },
);
```

Back-in-stock uses `ECOM_PLATFORM_APP_ID` (`1380b703-ce81-ff05-f115-39571d94dfcd`) even on V3 sites — the SDK's JSDoc points at `STORES_APP_ID`, but the runtime only registers the notification under the V1 platform id.

`createBackInStockNotificationRequest` takes two positional arguments — `(request, itemDetails)` — not a single options object. Type `catalogReference` as `backInStockNotifications.CatalogReference` and the SDK's `NonNullablePaths` generics resolve cleanly with no casts:

```ts
const catalogReference: backInStockNotifications.CatalogReference = {
  catalogItemId: product._id!,
  appId: ECOM_PLATFORM_APP_ID,
  ...(variantId ? { options: { variantId } } : {}),
};
await backInStockNotifications.createBackInStockNotificationRequest(
  { catalogReference, email: userEmail },
  { name: productName, price: String(priceAmount) },
);
```

### Media Generation

See [MEDIA.md](MEDIA.md) for the full image/video generation and upload workflow (Runware API, Wix Media Import, end-to-end steps). Always AI-generate product images, category images, and product videos.
