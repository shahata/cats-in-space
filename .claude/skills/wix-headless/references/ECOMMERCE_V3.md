# Wix Stores Catalog V3

appId: `215238eb-22a5-4c36-9e7b-e7c08025e04e`

## SDK Packages

- `@wix/stores` → `productsV3` namespace: `queryProducts`, `getProduct`, `getProductBySlug`, `createProduct`, `updateProduct`, `deleteProduct`, `searchProducts`
- `@wix/categories` → `categories` namespace: `queryCategories`, `searchCategories`, `getCategory`, `createCategory`

## Query Patterns

### Query all products
V3 requires a `fields` parameter — without it, only minimal data is returned:
```typescript
import { productsV3 } from '@wix/stores';
const result = await productsV3.queryProducts({
  fields: ['MEDIA_ITEMS_INFO', 'CURRENCY', 'DIRECT_CATEGORIES_INFO']
}).limit(100).find();
const allProducts = result.items || [];
```

### Get product by slug (single call — includes variants)
```typescript
const result = await productsV3.getProductBySlug(slug, {
  fields: ['MEDIA_ITEMS_INFO', 'CURRENCY', 'DESCRIPTION',
    'INFO_SECTION', 'INFO_SECTION_DESCRIPTION',
    'DIRECT_CATEGORIES_INFO', 'VARIANT_OPTION_CHOICE_NAMES']
});
const product = result.product;
```
This returns full data including `variantsInfo.variants[]` in one call — no two-step like V1.

### Query categories
```typescript
import { categories } from '@wix/categories';
const catResult = await categories.queryCategories(
  { cursorPaging: { limit: 100 } },
  { treeReference: { appNamespace: '@wix/stores' } }
);
const cats = catResult.categories || [];  // NOT .items
```
Two-arg overload: first is `CategoryQuery` (paging/filter), second is `QueryCategoriesOptions` (treeReference).

### Common fields parameter values
- `MEDIA_ITEMS_INFO` — images/video
- `CURRENCY` — currency code + formatted amounts
- `DESCRIPTION` — RichContent description (render with RichContentViewer)
- `PLAIN_DESCRIPTION` — HTML description (plain text fallback)
- `INFO_SECTION` — info section titles
- `INFO_SECTION_DESCRIPTION` — info section RichContent body (combine with `INFO_SECTION`)
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
  - `SWATCH_CHOICES` options have `colorCode` on choices — render as color circles
- `variantsInfo.variants[]` — `{ _id, choices: [{ optionChoiceNames: { optionName, choiceName } }], price: { actualPrice, compareAtPrice }, inventoryStatus: { inStock } }`
- `inventory` — `{ availabilityStatus: "IN_STOCK"|"OUT_OF_STOCK"|"PARTIALLY_OUT_OF_STOCK", preorderStatus: "ENABLED"|"DISABLED", preorderAvailability }`
  - Pre-order detection: `product.inventory?.preorderStatus === "ENABLED"`
  - Variant-level: `variant.inventoryStatus?.preorderEnabled`
  - When preorder is enabled, item is purchasable even if out of stock
- `directCategoriesInfo.categories[]` — `{ _id }` (opt-in)
- `ribbon` — `{ _id, name }` (object, not string)
- `infoSections[]` — `{ _id, title, description (RichContent), plainDescription }`. Use `INFO_SECTION` + `INFO_SECTION_DESCRIPTION` fields.
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
- Get: `GET https://www.wixapis.com/stores/v3/products/{id}`

### Categories
- Create: `POST https://www.wixapis.com/categories/v1/categories` with `treeReference: { appNamespace: "@wix/stores" }`
- Add items: `POST https://www.wixapis.com/categories/v1/bulk/categories/{categoryId}/add-items` with `appId: "215238eb-22a5-4c36-9e7b-e7c08025e04e"`

### Inventory (V3 products start as OUT_OF_STOCK)
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

### Create Product body
```json
{ "product": {
    "name": "...", "productType": "PHYSICAL", "visible": true,
    "plainDescription": "<p>...</p>",
    "physicalProperties": {},
    "media": { "itemsInfo": { "items": [{ "url": "https://..." }, { "id": "wix-media-id" }] } },
    "options": [{ "name": "Size", "optionRenderType": "TEXT_CHOICES",
      "choicesSettings": { "choices": [{ "choiceType": "CHOICE_TEXT", "name": "S" }] } }],
    "modifiers": [{ "name": "Engraving", "modifierRenderType": "FREE_TEXT", "mandatory": false,
      "freeTextSettings": { "title": "...", "maxCharCount": 20 } }],
    "ribbon": { "name": "SALE" },
    "variantsInfo": { "variants": [{ "visible": true,
      "choices": [{ "optionChoiceNames": { "optionName": "Size", "choiceName": "S", "renderType": "TEXT_CHOICES" } }],
      "price": { "actualPrice": { "amount": "49.99" } }, "physicalProperties": {} }] }
} }
```

## V3 Gotchas

0. **Always include media at creation time**: Pass `media.itemsInfo.items` with image URLs when calling `createProduct`. Adding media later via PATCH requires sending the full `options` and `variantsInfo.variants` arrays (the PATCH validates variants against options even if you only want to update media). Avoid this pain by including images upfront.
1. **Fields are opt-in**: Without `fields` param, queries return minimal data (no media, no prices, no categories).
2. **Media strings**: `m.image` and `m.video` are Wix media strings (`wix:image://...`, `wix:video://...`). Use `getImageUrl()`/`getVideoUrl()` helpers to convert. `mediaType` is uppercase: `'IMAGE'`, `'VIDEO'`.
3. **Variant matching via optionChoiceNames**: `variant.choices[].optionChoiceNames.optionName/choiceName` — match with `.some()`.
4. **Modifiers replace customTextFields**: V3 uses `modifiers` with three render types: `FREE_TEXT` (text input, keyed by `freeTextSettings.key` in `catalogReference.options.customTextFields`), `TEXT_CHOICES` (button selection, keyed by `mod.key` in `catalogReference.options.options`), `SWATCH_CHOICES` (color circles with `colorCode`, same as TEXT_CHOICES in catalogReference).
5. **Categories not collections**: Use `@wix/categories` with `queryCategories(query, { treeReference })`. `collections` namespace is V1-only and fails on V3 with 428.
6. **Inventory must be created separately**: V3 `createProduct` does NOT create inventory. Use `POST /stores/v3/bulk/inventory-items/create` with `inStock: true` for each variant.
7. **Ribbon is an object**: `product.ribbon.name`, not `product.ribbon` (string).
8. **Back-in-stock uses V1 appId**: The back-in-stock settings/notifications API only accepts `1380b703-...` even on V3 sites. Use V1 appId for back-in-stock, V3 appId for cart/checkout.
9. **RichContent rendering**: Use a RichContentViewer component for `description` and `infoSections[].description`. Request `DESCRIPTION` and `INFO_SECTION_DESCRIPTION` fields.
10. **Pre-order requires quantity tracking**: Inventory items must use `trackQuantity: true` with `quantity: 0` and `preorderInfo.limit` set. Using `inStock` tracking (no quantity) with preorder causes cart to cap quantity to 0.
11. **Pre-order in cart**: Pass `preOrderRequested: true` in `catalogReference.options` so the cart allows adding quantity > 0 for preorder items.
