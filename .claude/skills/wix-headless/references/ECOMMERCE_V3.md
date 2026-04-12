# Wix Stores Catalog V3

appId: `215238eb-22a5-4c36-9e7b-e7c08025e04e`

## SDK Packages

- `@wix/stores` → `productsV3` namespace: `queryProducts`, `getProduct`, `getProductBySlug`, `createProduct`, `updateProduct`, `deleteProduct`, `searchProducts`

### Categories SDK — use `@wix/categories`

The `@wix/stores` package does NOT export `categories` — only `collections` (V1). Install and use `@wix/categories`:

```bash
npm install @wix/categories
```

```typescript
import { categories } from '@wix/categories';
import type { categories as categoriesTypes } from '@wix/categories';

const catResult = await categories.queryCategories(
  { treeReference: { appNamespace: '@wix/stores' } }
).find();
const allCategories: categoriesTypes.Category[] = catResult.items || [];
// Each category has: _id, name, slug, visible, image, etc.
```

## V3 SDK Field Access Cheat Sheet

⛔ **Breaks at runtime — the V3 SDK field paths differ from V1. These are the CORRECT paths:**

| What you want | CORRECT V3 SDK path | WRONG (V1 or common mistake) |
|---|---|---|
| Main image | `product.media?.main?.image` (a `wix:image://` string) | ~~`product.media?.mainMedia?.image?.url`~~ |
| All media items | `product.media?.itemsInfo?.items` | ~~`product.media?.items`~~ |
| Price range min | `product.actualPriceRange?.minValue?.amount` | ~~`product.priceRange?.minValue`~~ |
| Price range max | `product.actualPriceRange?.maxValue?.amount` | ~~`product.priceRange?.maxValue`~~ |
| Ribbon text | `product.ribbon?.name` (ribbon is an object) | ~~`product.ribbon`~~ (renders as [object Object]) |
| Variants array | `product.variantsInfo?.variants` | ~~`product.variants`~~ |
| Variant ID | `v._id` | ~~`v.id`~~ (undefined at runtime!) |
| Option choices | `opt.choicesSettings?.choices` with `.name` | ~~`opt.choices`~~ with ~~`.value`~~ |
| Category IDs | `product.directCategoriesInfo?.categories` | ~~`product.categoryIds`~~ |
| Product ID | `product._id` | same |
| Product type | `"PHYSICAL"` / `"DIGITAL"` (UPPERCASE) | ~~`"physical"`~~ |

### `_id` on Variants and Options

V3 entities use `_id` (not `id`) as the identifier field. This applies to both variants and options:

```typescript
const variantId = variant._id || '';
const optionId = option._id || '';
```

Do NOT use `variant.id` or `option.id` — these are `undefined`.

## Query Patterns

### Query all products
V3 requires a `fields` parameter — without it, only minimal data is returned:
```typescript
import { productsV3 } from '@wix/stores';
const result = await productsV3.queryProducts({
  fields: ['MEDIA_ITEMS_INFO', 'CURRENCY']
}).limit(100).find();
const allProducts = result.items || [];
```

### Get product by slug (single call — includes variants)
```typescript
const result = await productsV3.getProductBySlug(slug, {
  fields: ['MEDIA_ITEMS_INFO', 'CURRENCY', 'DESCRIPTION',
    'PLAIN_DESCRIPTION',
    'INFO_SECTION', 'INFO_SECTION_DESCRIPTION', 'INFO_SECTION_PLAIN_DESCRIPTION',
    'DIRECT_CATEGORIES_INFO', 'VARIANT_OPTION_CHOICE_NAMES']
});
const product = result.product;
```
This returns full data including `variantsInfo.variants[]` in one call — no two-step like V1.

⚠️ **Common mistake:** Use `getProductBySlug` for product detail pages — NOT `queryProducts().eq('slug', slug)`. The query method may not return options/variants data even with field params. → Always use `productsV3.getProductBySlug(slug, { fields: [...] })` for detail pages.

### Query categories

```typescript
import { categories } from '@wix/categories';
import type { categories as categoriesTypes } from '@wix/categories';

const catResult = await categories.queryCategories(
  { treeReference: { appNamespace: '@wix/stores' } }
).find();
const allCategories: categoriesTypes.Category[] = catResult.items || [];
```

### Filter products by category

Fetch all products with the `DIRECT_CATEGORIES_INFO` field, then filter client-side using `directCategoriesInfo.categories`. This avoids the complexity of `searchProducts` and works well for stores with up to ~100 products:

```typescript
// Fetch all products with category info
const result = await productsV3.queryProducts({
  fields: ['MEDIA_ITEMS_INFO', 'CURRENCY', 'DIRECT_CATEGORIES_INFO']
}).limit(100).find();
const allProducts = result.items || [];

// Build a category lookup map
const categoryMap = new Map<string, string>();
for (const c of cats) categoryMap.set(c._id!, c.name!);

// Client-side filtering (e.g., in a script or component)
function filterByCategory(products, categoryId: string) {
  return products.filter(p =>
    p.directCategoriesInfo?.categories?.some(c => c._id === categoryId)
  );
}
```

Use data attributes on product cards for JS-based filtering without re-fetching:
```html
<a data-collections={product.directCategoriesInfo?.categories?.map(c => c._id).join(',')}>
```

### Common fields parameter values
- `MEDIA_ITEMS_INFO` — images/video
- `CURRENCY` — currency code + formatted amounts
- `DESCRIPTION` — RichContent description (render with RichContentViewer)
- `PLAIN_DESCRIPTION` — HTML description (plain text fallback)
- `INFO_SECTION` — info section titles and IDs
- `INFO_SECTION_DESCRIPTION` — info section RichContent body (combine with `INFO_SECTION`)
- `INFO_SECTION_PLAIN_DESCRIPTION` — info section HTML body as `plainDescription` string (combine with `INFO_SECTION`). **You must request this separately from `INFO_SECTION_DESCRIPTION`** — it is NOT included automatically.
- `DIRECT_CATEGORIES_INFO` — category IDs
- `VARIANT_OPTION_CHOICE_NAMES` — variant choice names (needed for cart)

## V3 Product Data Shape

- `_id`, `name`, `slug`, `visible` — same as V1
- `productType` — `"PHYSICAL"` or `"DIGITAL"` (UPPERCASE)
- `description` — RichContent object (opt-in via `DESCRIPTION`). Render with RichContentViewer component.
- `plainDescription` — HTML string (opt-in via `PLAIN_DESCRIPTION`, fallback)
- `media.main` / `media.itemsInfo.items[]` — `ProductMedia { mediaType, image (string), video (string), thumbnail: { url } }`
  - Use `extractMediaUrl(productMedia, w, h)` — returns `{ type, url, thumbnail? }` or null (see `references/MEDIA.md` for implementation)
  - `image` is a Wix media string (`wix:image://...`) — parsed by `getImageUrl()`
  - `video` is a Wix video string (`wix:video://...`) — parsed by `getVideoUrl()` → `{ url, thumbnail }`
- `actualPriceRange` — `{ minValue: { amount, formattedAmount }, maxValue: ... }`
- `compareAtPriceRange` — same shape (for sale pricing)
- `currency` — string (opt-in via `CURRENCY`)
- `options[]` — `ConnectedOption { _id, name, key, optionRenderType: "TEXT_CHOICES"|"SWATCH_CHOICES", choicesSettings: { choices: [{ choiceId, name, key, colorCode?, inStock }] } }`
  - Access choice names via `opt.choicesSettings?.choices?.map(c => c.name)` — NOT `opt.choices` or `c.value`
  - The `_id` and `choiceId` fields are used for variant matching (build ID-to-name lookup maps)
  - `SWATCH_CHOICES` options have `colorCode` on choices — render as color circles
- `variantsInfo.variants[]` — `{ _id, choices: [{ optionChoiceIds: { optionId, choiceId }, optionChoiceNames?: { optionName, choiceName } }], price: { actualPrice, compareAtPrice }, inventoryStatus: { inStock } }`. **The `optionChoiceNames` sub-field is only populated when `VARIANT_OPTION_CHOICE_NAMES` is requested.** Always build an ID-to-name lookup from the `options` array as fallback.
- `inventory` — `{ availabilityStatus: "IN_STOCK"|"OUT_OF_STOCK"|"PARTIALLY_OUT_OF_STOCK", preorderStatus: "ENABLED"|"DISABLED", preorderAvailability }`
  - Pre-order detection: `product.inventory?.preorderStatus === "ENABLED"`
  - Variant-level: `variant.inventoryStatus?.preorderEnabled`
  - When preorder is enabled, item is purchasable even if out of stock
- `directCategoriesInfo.categories[]` — `{ _id }` (opt-in)
- `ribbon` — `{ _id, name }` (object, not string)
- `infoSections[]` — `{ _id, uniqueName, title, description (RichContent), plainDescription }`. Use `INFO_SECTION` + `INFO_SECTION_DESCRIPTION` + `INFO_SECTION_PLAIN_DESCRIPTION` fields. All three must be requested to get the full shape.
- `modifiers[]` — `ConnectedModifier`:
  - `modifierRenderType`: `"FREE_TEXT"` | `"TEXT_CHOICES"` | `"SWATCH_CHOICES"`
  - `FREE_TEXT`: `freeTextSettings: { key, title, maxCharCount }` — renders as text input with char counter
  - `TEXT_CHOICES`: `choicesSettings: { choices: [{ key, name }] }` — renders as button group
  - `SWATCH_CHOICES`: `choicesSettings: { choices: [{ key, name, colorCode }] }` — renders as color circles
  - `mandatory`, `name`, `key` on all types

## catalogReference (for cart/checkout)

Use `cart.CatalogReference` type from `@wix/ecom`. The `options` field is `Record<string, any> | null`.

```typescript
import type { cart as cartTypes } from '@wix/ecom';
const STORES_APP_ID = '215238eb-22a5-4c36-9e7b-e7c08025e04e';

const ref: cartTypes.CatalogReference = { catalogItemId: product._id, appId: STORES_APP_ID };
const opts: Record<string, unknown> = {};
if (hasOptions && variantId) opts.variantId = variantId;
// V3 modifiers keyed by freeTextSettings.key
for (const mod of freeTextModifiers) {
  const key = mod.freeTextSettings?.key;
  if (key && customTexts[mod.name]?.trim()) {
    if (!opts.customTextFields) opts.customTextFields = {};
    opts.customTextFields[key] = customTexts[mod.name];
  }
}
// Pre-order: pass in catalogReference.options so cart allows quantity > 0
if (isPreOrder || variantPreorder) opts.preOrderRequested = true;
if (Object.keys(opts).length > 0) ref.options = opts;
```

## V3 REST API (for MCP data seeding)

### Products
- Create: `POST https://www.wixapis.com/stores/v3/products`
- **Create with inventory (preferred):** `POST https://www.wixapis.com/stores/v3/products-with-inventory`
- Get: `GET https://www.wixapis.com/stores/v3/products/{id}`

### Create Product With Inventory — COMPLETE working example

**Endpoint:** `POST https://www.wixapis.com/stores/v3/products-with-inventory`
**Docs:** https://dev.wix.com/docs/api-reference/business-solutions/stores/catalog-v3/products-v3/create-product-with-inventory

This is the **preferred** endpoint — it creates the product AND its inventory in a single call.

**Simple product (no options, single default variant):**
```json
{
  "product": {
    "name": "Coffee Mug",
    "slug": "coffee-mug",
    "productType": "PHYSICAL",
    "physicalProperties": {},
    "plainDescription": "A ceramic coffee mug. Dishwasher safe.",
    "visible": true,
    "variantsInfo": {
      "variants": [{
        "price": { "actualPrice": { "amount": "14.99" } },
        "inventoryItem": { "inStock": true }
      }]
    }
  }
}
```

**REQUIRED fields:**
- `productType`: `"PHYSICAL"` or `"DIGITAL"` (UPPERCASE)
- `physicalProperties`: `{}` — **required** when `productType` is `"PHYSICAL"`, even if empty. Omitting it causes: `productType and the corresponding physical_properties field must be passed together`
- `variantsInfo.variants`: at least one variant is **required**. Omitting causes: `variantsInfo must not be empty`
- `variants[].price.actualPrice.amount`: **required** on each variant. Note the nested structure — `price: { actualPrice: { amount: "29.99" } }`, NOT `price: { amount: "29.99" }`. Omitting `actualPrice` causes: `actualPrice must not be empty`
- `variants[].inventoryItem.inStock`: set to `true` for in-stock items. Without this, variants default to OUT_OF_STOCK.

## Product Seeding Workflow

The full 9-step product seeding workflow (images → categories → products → options → variants → inventory → info sections → category assignment) is documented in [PRODUCT_SEEDING.md](PRODUCT_SEEDING.md). Read that file when creating product data via API.

### Quick reference of the steps:

### Step 1-2: Generate and import images

See [MEDIA.md](MEDIA.md) for the full Runware generation workflow (`npx wix token` + curl) and Wix Media Import (`POST /site-media/v1/files/import`). Save the resulting `file.url` for the product `media` field in Step 4.

### Step 5: Create customizations (options)

```
POST https://www.wixapis.com/stores/v3/customizations
```
```json
{
  "customization": {
    "name": "Size",
    "customizationType": "PRODUCT_OPTION",
    "customizationRenderType": "TEXT_CHOICES",
    "choicesSettings": {
      "choices": [
        { "name": "S", "choiceType": "CHOICE_TEXT" },
        { "name": "M", "choiceType": "CHOICE_TEXT" },
        { "name": "L", "choiceType": "CHOICE_TEXT" },
        { "name": "XL", "choiceType": "CHOICE_TEXT" }
      ]
    }
  }
}
```

**REQUIRED fields:**
- `customizationType`: `"PRODUCT_OPTION"` or `"MODIFIER"` (NOT `"PRODUCT_MODIFIER"` — that value is rejected by the API)
- `customizationRenderType`: **REQUIRED** — `"TEXT_CHOICES"` or `"SWATCH_CHOICES"` or `"FREE_TEXT"`. Omitting causes: `customizationRenderType value is required`
- `choicesSettings.choices[].choiceType`: `"CHOICE_TEXT"`, `"ONE_COLOR"`, `"MULTIPLE_COLORS"`, or `"IMAGE"`
- For `FREE_TEXT` modifiers: use `freeTextInput` (NOT `freeTextSettings`) with required `title` field: `"freeTextInput": { "title": "Gift Message", "maxCharCount": 150 }`
```
Response: `customization.id` — save this for attaching to products.

For color swatches:
```json
{
  "customization": {
    "name": "Color",
    "customizationType": "PRODUCT_OPTION",
    "choicesSettings": {
      "choices": [
        { "name": "Black", "choiceType": "ONE_COLOR", "colorCode": "#000000" },
        { "name": "White", "choiceType": "ONE_COLOR", "colorCode": "#FFFFFF" }
      ]
    }
  }
}
```

### Step 6: Update product to attach options and create variants

**Endpoint:** `PATCH https://www.wixapis.com/stores/v3/products-with-inventory/{productId}`
**Docs:** https://dev.wix.com/docs/api-reference/business-solutions/stores/catalog-v3/products-v3/update-product-with-inventory

You must pass the FULL option definition (not just an ID reference) AND explicit variants with `optionChoiceIds`. The `options` and `variantsInfo` fields are mutually dependent — you must pass both together.

```json
{
  "product": {
    "revision": "1",
    "options": [{
      "id": "<customization-id>",
      "name": "Size",
      "optionRenderType": "TEXT_CHOICES",
      "choicesSettings": {
        "choices": [
          { "id": "<choice-id-S>", "name": "S", "choiceType": "CHOICE_TEXT" },
          { "id": "<choice-id-M>", "name": "M", "choiceType": "CHOICE_TEXT" },
          { "id": "<choice-id-L>", "name": "L", "choiceType": "CHOICE_TEXT" }
        ]
      }
    }],
    "variantsInfo": {
      "variants": [
        {
          "choices": [{ "optionChoiceIds": { "optionId": "<customization-id>", "choiceId": "<choice-id-S>" } }],
          "price": { "actualPrice": { "amount": "29.99" } },
          "inventoryItem": { "inStock": true }
        },
        {
          "choices": [{ "optionChoiceIds": { "optionId": "<customization-id>", "choiceId": "<choice-id-M>" } }],
          "price": { "actualPrice": { "amount": "29.99" } },
          "inventoryItem": { "inStock": true }
        },
        {
          "choices": [{ "optionChoiceIds": { "optionId": "<customization-id>", "choiceId": "<choice-id-L>" } }],
          "price": { "actualPrice": { "amount": "29.99" } },
          "inventoryItem": { "inStock": true }
        }
      ]
    }
  }
}
```

⚠️ **Common mistake:**
- Pass full option definition with `name`, `optionRenderType`, `choicesSettings` — not just `{ "id": "..." }`. Omitting `choicesSettings` causes: `choicesSettings must not be empty`
- Each choice needs `id`, `name`, and `choiceType` — get these from the customization query response
- Variants reference choices via `optionChoiceIds` (with `optionId` + `choiceId`), NOT via name strings
- `inventoryItem.inStock` on the update may NOT create inventory — you often need to follow up with `POST /stores/v3/bulk/inventory-items/create` separately (Step 6b below)
- The response includes new `variantsInfo.variants[].id` values

### Step 6b: Create inventory for new variants

After updating a product with options, the new variants may be OUT_OF_STOCK even if `inventoryItem.inStock` was passed. Create inventory explicitly:

```
POST https://www.wixapis.com/stores/v3/bulk/inventory-items/create
```
```json
{
  "inventoryItems": [
    { "variantId": "<variant-id-from-step-6>", "productId": "<product-id>", "inStock": true },
    { "variantId": "<variant-id-2>", "productId": "<product-id>", "inStock": true }
  ]
}
```

**Product with media (Step 4):**
```json
{
  "product": {
    "name": "Classic T-Shirt",
    "slug": "classic-t-shirt",
    "productType": "PHYSICAL",
    "physicalProperties": {},
    "plainDescription": "A comfortable classic t-shirt made from premium cotton.",
    "media": {
      "itemsInfo": {
        "items": [{ "url": "https://example.com/image.jpg" }]
      }
    },
    "ribbon": { "name": "NEW" },
    "variantsInfo": {
      "variants": [{
        "price": { "actualPrice": { "amount": "29.99" } },
        "inventoryItem": { "inStock": true }
      }]
    }
  }
}
```

**Response** includes `product` (with generated `id`, `variantsInfo.variants[].id`) and `inventoryResults` confirming inventory creation.

### Inventory (standalone — if not using create-product-with-inventory)
- Bulk create: `POST https://www.wixapis.com/stores/v3/bulk/inventory-items/create`
  ```json
  { "inventoryItems": [{ "variantId": "...", "productId": "...", "inStock": true }] }
  ```
  Must create inventory for each variant or products show as out of stock.
- Bulk update: `POST https://www.wixapis.com/stores/v3/bulk/inventory-items/update-by-filter`
- Query: `POST https://www.wixapis.com/stores/v3/inventory-items/query`

### Pre-order Inventory Setup
Pre-order **requires** quantity tracking (not in-stock tracking). Without it, cart caps quantity to 0.
```json
{ "inventoryItems": [{
    "variantId": "...", "productId": "...",
    "quantity": 0, "trackQuantity": true,
    "preorderInfo": { "enabled": true, "limit": 100, "message": "Expected to ship by..." }
}] }
```
- `trackQuantity: true` + `quantity: 0` → item shows as PREORDER
- `preorderInfo.limit` required for cart to accept quantity > 0
- `inStock: true` (without quantity tracking) does NOT support preorder limits

⛔ **Breaks at runtime — choiceType values for options (if creating options via REST):**
- `CHOICE_TEXT` — for `TEXT_CHOICES` options (sizes, materials, etc.)
- `ONE_COLOR` — for `SWATCH_CHOICES` options (colors). Do NOT use `CHOICE_COLOR` — it does not exist and will return 400.
- `MULTIPLE_COLORS` — for multi-color swatches
- `IMAGE` — for image-based choices

### Info Sections (separate entity — cannot be inlined in createProduct)

Info sections are **separate entities** in V3. You cannot pass them inline during `createProduct` — this will fail with `INFO_SECTION_CREATION_FAILED`.

**Step 1 — Create info sections:**
```
POST https://www.wixapis.com/stores/v3/info-sections
{ "infoSection": {
    "uniqueName": "care-instructions",
    "title": "Care Instructions",
    "description": {
      "nodes": [{ "type": "PARAGRAPH", "id": "p1", "nodes": [
        { "type": "TEXT", "textData": { "text": "Your description text here." } }
      ]}],
      "metadata": { "version": 1 }
    }
} }
```

**Step 2 — Assign to products:**
```
POST https://www.wixapis.com/stores/v3/bulk/products/add-info-sections
{ "infoSectionIds": ["info-section-id-1", "info-section-id-2"],
  "products": [{ "productId": "...", "revision": "1" }],
  "returnEntity": true }
```

### Categories REST API

⛔ **Breaks at runtime:** The categories endpoint is at `categories/v1/`, NOT `stores/v1/`. Using `stores/v1/categories` returns 404. → Use `https://www.wixapis.com/categories/v1/categories/...` for all category REST calls.

**Create:** `POST https://www.wixapis.com/categories/v1/categories`
- `treeReference` is **REQUIRED** — omitting it causes: `treeReference must not be empty`
- Category `image` requires `url` (full URL string), NOT `id`. Using `id` alone returns 400.
```json
{
  "category": {
    "name": "My Category",
    "description": "...",
    "image": { "url": "https://static.wixstatic.com/media/..." }
  },
  "treeReference": { "appNamespace": "@wix/stores" }
}
```

**Search:** `POST https://www.wixapis.com/categories/v1/categories/search`
- Also requires `treeReference`
```json
{ "treeReference": { "appNamespace": "@wix/stores" } }
```

**Add items to category:** `POST https://www.wixapis.com/categories/v1/bulk/categories/{categoryId}/add-items`
- Uses `catalogItemId` (NOT `itemId`) and requires `treeReference`
- `appId` must be the V3 stores appId
```json
{
  "items": [
    { "catalogItemId": "product-id", "appId": "215238eb-22a5-4c36-9e7b-e7c08025e04e" }
  ],
  "treeReference": { "appNamespace": "@wix/stores" }
}
```

**Product → Category workflow:**
1. Create categories first (save `category.id` from response)
2. Create products (save `product.id` from response)
3. Assign products to categories via bulk add-items endpoint
- Categories are NOT assigned inline during product creation — there is no `directCategoryIds` field on the create request

## V3 Gotchas

0. **Include media at creation time when possible**: Pass `media.itemsInfo.items` with image URLs when calling `createProduct`. Generate and import images first (see [MEDIA.md](MEDIA.md)), then include the `file.url` in the create call. If adding media later via PATCH to a product that HAS options, you MUST re-send the full `options` and `variantsInfo.variants` arrays (including all variant IDs) — the PATCH validates variants against options even if you only want to update media. Products WITHOUT options can be updated with just `media` in the PATCH body.
1. **Fields are opt-in**: Without `fields` param, queries return minimal data (no media, no prices, no categories).
2. **Media strings**: `m.image` and `m.video` are `wix:image://`/`wix:video://` strings — use `getImageUrl()`/`getVideoUrl()` to convert (see [MEDIA.md](MEDIA.md)). `mediaType` is uppercase: `'IMAGE'`, `'VIDEO'`.
3. **Variant matching via optionChoiceNames**: `variant.choices[].optionChoiceNames.optionName/choiceName` — match with `.some()`.
4. **Modifiers replace customTextFields**: V3 uses `modifiers` with three render types: `FREE_TEXT` (text input, keyed by `freeTextSettings.key` in `catalogReference.options.customTextFields`), `TEXT_CHOICES` (button selection, keyed by `mod.key` in `catalogReference.options.options`), `SWATCH_CHOICES` (color circles with `colorCode`, same as TEXT_CHOICES in catalogReference).
5. **Categories SDK import**: `@wix/stores` does NOT export `categories` (only `collections` which is V1-only). Install and use `@wix/categories` package — it provides `queryCategories` with proper types. The `collections` namespace is V1-only and fails on V3 with 428. Do NOT use `httpClient.fetchWithAuth` for categories — always prefer the SDK.
6. **Inventory — use create-product-with-inventory**: The `POST /stores/v3/products-with-inventory` endpoint creates both product AND inventory in one call. Pass `inventoryItem: { inStock: true }` inside each variant. If using `createProduct` alone, inventory must be created separately via `POST /stores/v3/bulk/inventory-items/create`.
7. **Ribbon is an object**: `product.ribbon.name`, not `product.ribbon` (string).
8. **Back-in-stock uses V1 appId**: The back-in-stock settings/notifications API only accepts `1380b703-...` even on V3 sites. Use V1 appId for back-in-stock, V3 appId for cart/checkout.
9. **RichContent rendering**: Use a RichContentViewer component for `description` and `infoSections[].description`. Request `DESCRIPTION` and `INFO_SECTION_DESCRIPTION` fields. For plain HTML fallback, also request `PLAIN_DESCRIPTION` and `INFO_SECTION_PLAIN_DESCRIPTION` — these are separate field values, not automatically included.
12. **Info sections are separate entities — create AFTER products**: You CANNOT create info sections inline during `createProduct` — this fails with `INFO_SECTION_CREATION_FAILED`. Create them first via `POST /stores/v3/info-sections`, then assign via `POST /stores/v3/bulk/products/add-info-sections`. See "Recommended Product Seeding Workflow" Steps 7-8.
13. **Swatch choice type is ONE_COLOR**: When creating product options with `SWATCH_CHOICES`, use `choiceType: "ONE_COLOR"` (not `"CHOICE_COLOR"` which doesn't exist). Valid values: `CHOICE_TEXT`, `ONE_COLOR`, `MULTIPLE_COLORS`, `IMAGE`.
14. **Category image needs url**: When creating categories via REST, the `image` field requires `{ "url": "https://..." }`, not `{ "id": "..." }`. Using `id` alone returns 400.
15. **Category add-items uses catalogItemId**: The bulk add-items endpoint uses `catalogItemId` (not `itemId`) and also requires `treeReference` in the body.
10. **Pre-order requires quantity tracking**: Inventory items must use `trackQuantity: true` with `quantity: 0` and `preorderInfo.limit` set. Using `inStock` tracking (no quantity) with preorder causes cart to cap quantity to 0.
11. **Pre-order in cart**: Pass `preOrderRequested: true` in `catalogReference.options` so the cart allows adding quantity > 0 for preorder items.
16. **Variant and Option `_id`**: Both `ConnectedOption` and variant types use `_id` (not `id`). Use `v._id` and `opt._id` directly — do NOT use `as any` casts. The `id` field does not exist on these types.
17. **Categories always need `treeReference`**: Whether using SDK (`queryCategories`) or REST (`POST /categories/v1/categories/search`, `POST /categories/v1/categories`), you MUST include `treeReference: { appNamespace: "@wix/stores" }`. Omitting it causes 400. REST search result is `data.categories`, SDK result is `catResult.categories` — neither uses `.items`.
18. **Category filtering — use client-side**: Fetch all products with `DIRECT_CATEGORIES_INFO` field, then filter client-side via `directCategoriesInfo.categories`. Use data attributes on product cards for JS-based filtering without re-fetching. Do NOT add a hardcoded "All" filter tab — only show real categories from the store. Show all products by default with no filter active; clicking an active tab deselects it.
27. **Category `_id` consistency**: When using `@wix/categories` SDK, categories use `cat._id` — consistent with product `directCategoriesInfo.categories[].\_id`.
19. **Use `getProductBySlug` for detail pages**: `queryProducts().eq('slug', slug)` may not return options/variants. Always use `getProductBySlug(slug, { fields: [...] })` for full product data.
20. **`media.main` not `media.mainMedia`**: V3 uses `product.media?.main?.image` (a string). NOT `product.media?.mainMedia?.image?.url` (V1 pattern).
21. **Price amounts need `.amount`**: `actualPriceRange.minValue` is a `FixedMonetaryAmount` object with `.amount`. Write `product.actualPriceRange?.minValue?.amount`, NOT `product.priceRange?.minValue`.
22. **Runware image generation needs curl, not MCP**: See [MEDIA.md](MEDIA.md) for the full Runware workflow. Key point: the Runware API requires an array body which MCP rejects — use `npx wix token -s <siteId>` + curl instead.
23. **`createCheckoutFromCurrentCart` is on `currentCart`, NOT `checkout`**: Import from `@wix/ecom`'s `currentCart` module. The `checkout` module does NOT export this method. Using `checkout.createCheckoutFromCurrentCart` fails at build time.
24. **Customization `customizationRenderType` is required**: When creating customizations via `POST /stores/v3/customizations`, you MUST include `customizationRenderType` (`"TEXT_CHOICES"`, `"SWATCH_CHOICES"`, or `"FREE_TEXT"`). Omitting causes: `customizationRenderType value is required`.
25. **Attaching options to existing products requires full definitions**: When PATCHing a product to add options, pass the full option definition (`id`, `name`, `optionRenderType`, `choicesSettings` with choice `id`, `name`, `choiceType`) — not just `{ "id": "customization-id" }`. Omitting `choicesSettings` causes: `choicesSettings must not be empty`. You must also pass `variantsInfo.variants` with explicit `optionChoiceIds` for each variant.
26. **Inventory after adding options**: When updating a product to add options (Step 6), new variants are created but may be OUT_OF_STOCK even if `inventoryItem.inStock` was passed. Always follow up with `POST /stores/v3/bulk/inventory-items/create` to explicitly set inventory for the new variant IDs.

## Complete V3 Code Examples

### Store Listing Page (Astro)

```astro
---
import { productsV3 } from '@wix/stores';
import type { productsV3 as productsV3Types } from '@wix/stores';
import { categories } from '@wix/categories';
import type { categories as categoriesTypes } from '@wix/categories';
import { extractMediaUrl } from '../../utils/image';

// Fetch all products with category info for client-side filtering
const productResult = await productsV3.queryProducts({
  fields: ['MEDIA_ITEMS_INFO', 'CURRENCY', 'DIRECT_CATEGORIES_INFO']
}).limit(100).find();
const allProducts = productResult.items || [];

// Fetch categories via SDK
let allCollections: categoriesTypes.Category[] = [];
try {
  const catResult = await categories.queryCategories(
    { treeReference: { appNamespace: '@wix/stores' } }
  ).find();
  allCollections = catResult.items || [];
} catch {}

// Build category lookup
const categoryMap = new Map<string, string>();
for (const c of allCollections) if (c._id && c.name) categoryMap.set(c._id, c.name);

function getCollections(product: productsV3Types.V3Product) {
  return (product.directCategoriesInfo?.categories || [])
    .filter(cat => cat._id && categoryMap.has(cat._id))
    .map(cat => ({ _id: cat._id!, name: categoryMap.get(cat._id!)! }));
}
---

<!-- Category filter tabs -->
<div class="filter-tabs" id="filter-tabs">
  {allCollections.map((c) => (
    <button class="filter-tab" data-collection={c._id}>{c.name}</button>
  ))}
</div>

<!-- Product grid with data attributes for JS filtering -->
{allProducts.map((product) => {
  const cover = extractMediaUrl(product.media?.itemsInfo?.items?.[0] || product.media?.main, 400, 400);
  const collIds = product.directCategoriesInfo?.categories?.map(c => c._id).filter(Boolean).join(',') || '';
  const ribbon = product.ribbon?.name;
  return (
    <a href={`/store/${product.slug}`} class="product-card" data-collections={collIds}>
      {cover && <img src={cover.url} alt={product.name || ''} />}
      {ribbon && <span class="product-ribbon">{ribbon}</span>}
      {getCollections(product).map((col) => (
        <span class="product-badge cat-link" data-cat-id={col._id}>{col.name}</span>
      ))}
      <h3>{product.name}</h3>
    </a>
  );
})}

<script is:inline>
function filterByCollection(collectionId) {
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  var activeTab = document.querySelector('.filter-tab[data-collection="' + collectionId + '"]');
  if (activeTab) activeTab.classList.add('active');
  document.querySelectorAll('.product-card').forEach(function(card) {
    var ids = card.dataset.collections || '';
    card.style.display = ids.indexOf(collectionId) !== -1 ? '' : 'none';
  });
  var url = new URL(window.location);
  url.searchParams.set('cat', collectionId);
  history.replaceState(null, '', url);
}
document.addEventListener('click', function(e) {
  var tab = e.target.closest('.filter-tab');
  if (tab) { filterByCollection(tab.dataset.collection); return; }
  var catLink = e.target.closest('.cat-link[data-cat-id]');
  if (catLink) { e.preventDefault(); e.stopPropagation(); filterByCollection(catLink.dataset.catId); return; }
});
// On load: apply ?cat= if present, otherwise first tab
(function() {
  var cat = new URLSearchParams(window.location.search).get('cat');
  var target = cat && document.querySelector('.filter-tab[data-collection="' + cat + '"]');
  if (target) filterByCollection(cat);
  else { var first = document.querySelector('.filter-tab'); if (first) filterByCollection(first.dataset.collection); }
})();
</script>
```

### Product Detail Page — Variant Extraction (Astro)

```astro
---
import { productsV3 } from '@wix/stores';
import { getImageUrl } from '../../lib/media';

const { slug } = Astro.params;
const result = await productsV3.getProductBySlug(slug!, {
  fields: ['MEDIA_ITEMS_INFO', 'CURRENCY', 'DESCRIPTION', 'PLAIN_DESCRIPTION', 'VARIANT_OPTION_CHOICE_NAMES']
});
const product = result.product;
if (!product) return Astro.redirect('/store');

// Image — use media.main.image (a wix:image:// string)
const imageUrl = getImageUrl(product.media?.main?.image, 600, 600);

// Price
const minPrice = product.actualPriceRange?.minValue?.amount;
const maxPrice = product.actualPriceRange?.maxValue?.amount;

// Options
const productOptions = product.options || [];
const sizeOption = productOptions.find((o) => o.name?.toLowerCase() === 'size') || productOptions[0];
const optionName = sizeOption?.name || 'Size';
const optionChoices = sizeOption?.choicesSettings?.choices?.map((c) => c.name || '') || [];

// Variants — build ID-to-name lookup using _id
const optionIdToName: Record<string, string> = {};
const choiceIdToName: Record<string, string> = {};
for (const opt of productOptions) {
  if (opt._id && opt.name) optionIdToName[opt._id] = opt.name;
  for (const ch of opt.choicesSettings?.choices || []) {
    if (ch.choiceId && ch.name) choiceIdToName[ch.choiceId] = ch.name;
  }
}

const variants = (product.variantsInfo?.variants || []).map((v) => {
  const choiceMap: Record<string, string> = {};
  for (const c of v.choices || []) {
    // Try optionChoiceNames first, fall back to ID lookup
    if (c.optionChoiceNames?.optionName && c.optionChoiceNames?.choiceName) {
      choiceMap[c.optionChoiceNames.optionName] = c.optionChoiceNames.choiceName;
    } else if (c.optionChoiceIds?.optionId && c.optionChoiceIds?.choiceId) {
      const optName = optionIdToName[c.optionChoiceIds.optionId];
      const chName = choiceIdToName[c.optionChoiceIds.choiceId];
      if (optName && chName) choiceMap[optName] = chName;
    }
  }
  return { _id: v._id || '', choices: choiceMap };
});

// Description — use plainDescription (HTML), not description (RichContent)
const description = product.plainDescription || '';
---
```

### Add-to-Cart Component (React)

```tsx
import { useState } from 'react';
import { currentCart } from '@wix/ecom';

const APP_ID = '215238eb-22a5-4c36-9e7b-e7c08025e04e';

interface Variant { _id: string; choices: Record<string, string>; }

export default function ProductOptions({
  productId, variants, optionName, optionChoices
}: { productId: string; variants: Variant[]; optionName: string; optionChoices: string[] }) {
  const [selected, setSelected] = useState(optionChoices[0] || '');
  const [adding, setAdding] = useState(false);

  const handleAddToCart = async () => {
    const variant = variants.find((v) => v.choices[optionName] === selected);
    if (!variant?._id) {
      console.error('No variant found for', selected, 'variants:', variants);
      return;
    }
    setAdding(true);
    try {
      await currentCart.addToCurrentCart({
        lineItems: [{
          catalogReference: {
            catalogItemId: productId,
            appId: APP_ID,
            options: { variantId: variant._id },
          },
          quantity: 1,
        }],
      });
      window.dispatchEvent(new CustomEvent('cart-updated'));
      window.dispatchEvent(new CustomEvent('toggle-cart'));
    } catch (err) {
      console.error('Add to cart error:', err);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div>
      <div>{optionName}</div>
      {optionChoices.map((choice) => (
        <button key={choice} onClick={() => setSelected(choice)}
          className={selected === choice ? 'selected' : ''}>
          {choice}
        </button>
      ))}
      <button onClick={handleAddToCart} disabled={adding}>
        {adding ? 'Adding...' : 'Add to Cart'}
      </button>
    </div>
  );
}
```
