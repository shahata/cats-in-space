# Wix Stores Catalog V3

**This site uses V3.** appId: `215238eb-22a5-4c36-9e7b-e7c08025e04e`

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
  fields: ['MEDIA_ITEMS_INFO', 'CURRENCY', 'PLAIN_DESCRIPTION',
    'INFO_SECTION', 'DIRECT_CATEGORIES_INFO', 'VARIANT_OPTION_CHOICE_NAMES']
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
- `PLAIN_DESCRIPTION` — HTML description
- `INFO_SECTION` — info sections with `plainDescription`
- `DIRECT_CATEGORIES_INFO` — category IDs
- `VARIANT_OPTION_CHOICE_NAMES` — variant choice names (needed for cart)

## V3 Product Data Shape

- `_id`, `name`, `slug`, `visible` — same as V1
- `productType` — `"PHYSICAL"` or `"DIGITAL"` (UPPERCASE)
- `plainDescription` — HTML string (opt-in via `PLAIN_DESCRIPTION`)
- `media.itemsInfo.items[]` — `{ mediaType: "IMAGE"|"VIDEO", image: string, video: string, thumbnail: { url } }`
  - **`image` and `video` are direct string URLs**, not nested objects
- `actualPriceRange` — `{ minValue: { amount, formattedAmount }, maxValue: ... }`
- `compareAtPriceRange` — same shape (for sale pricing)
- `currency` — string (opt-in via `CURRENCY`)
- `options[]` — `{ _id, name, key, choicesSettings: { choices: [{ choiceId, name, inStock }] } }`
- `variantsInfo.variants[]` — `{ _id, choices: [{ optionChoiceNames: { optionName, choiceName } }], price: { actualPrice, compareAtPrice }, inventoryStatus: { inStock } }`
- `inventory` — `{ availabilityStatus: "IN_STOCK"|"OUT_OF_STOCK"|"PARTIALLY_OUT_OF_STOCK" }`
- `directCategoriesInfo.categories[]` — `{ _id }` (opt-in)
- `ribbon` — `{ _id, name }` (object, not string)
- `infoSections[]` — `{ _id, title, plainDescription }`
- `modifiers[]` — `{ name, modifierRenderType: "FREE_TEXT"|"TEXT_CHOICES", mandatory, freeTextSettings: { key, title, maxCharCount } }`

## catalogReference (for cart/checkout)

```typescript
const STORES_APP_ID = '215238eb-22a5-4c36-9e7b-e7c08025e04e';

const ref = { catalogItemId: product._id, appId: STORES_APP_ID };
const opts = {};
if (hasOptions && variantId) opts.variantId = variantId;
// V3 modifiers keyed by freeTextSettings.key
for (const mod of freeTextModifiers) {
  const key = mod.freeTextSettings?.key;
  if (key && customTexts[mod.name]?.trim()) {
    if (!opts.customTextFields) opts.customTextFields = {};
    opts.customTextFields[key] = customTexts[mod.name];
  }
}
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

1. **Fields are opt-in**: Without `fields` param, queries return minimal data (no media, no prices, no categories).
2. **Media is direct URLs**: `m.image` and `m.video` are strings, not `{ url }` objects. `mediaType` is uppercase: `'IMAGE'`, `'VIDEO'`.
3. **Variant matching via optionChoiceNames**: `variant.choices[].optionChoiceNames.optionName/choiceName` — match with `.some()`.
4. **Modifiers replace customTextFields**: V3 uses `modifiers` with `modifierRenderType: "FREE_TEXT"`. In catalogReference, key by `mod.freeTextSettings.key`.
5. **Categories not collections**: Use `@wix/categories` with `queryCategories(query, { treeReference })`. `collections` namespace is V1-only and fails on V3 with 428.
6. **Inventory must be created separately**: V3 `createProduct` does NOT create inventory. Use `POST /stores/v3/bulk/inventory-items/create` with `inStock: true` for each variant.
7. **Ribbon is an object**: `product.ribbon.name`, not `product.ribbon` (string).
