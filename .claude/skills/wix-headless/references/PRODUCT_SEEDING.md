# Product Seeding Workflow (V3 Catalog)

A complete product catalog requires multiple sequential API calls. Do NOT try to do everything in one call — `create-product-with-inventory` handles basic product + inventory, but options, info sections, images, and categories must be added separately.

---

## Step 0 — Install Wix Stores

A freshly scaffolded headless project doesn't have Wix Stores installed; `/stores/v3/*` and `/categories/v1/*` return `428 REQUIRED_APP_NOT_INSTALLED`. Install via the account-level MCP tool `ManageWixSite`:

```http
POST https://www.wixapis.com/apps-installer-service/v1/app-instance/install
Body: {
  "tenant": { "id": "<siteId>", "tenantType": "SITE" },
  "appInstance": { "appDefId": "215238eb-22a5-4c36-9e7b-e7c08025e04e" }
}
```

The Wix Stores app id is `215238eb-22a5-4c36-9e7b-e7c08025e04e`. The app ids for back-in-stock notifications, the V1 `catalogReference`, gift cards, and the rest are centralised in `src/utils/appIds.ts` — see [SDK_CORE.md](SDK_CORE.md#sdk-gotchas--quick-reference).

---

## Validate the shape on one product before looping

Catalog seed scripts almost always fail the first run on some shape mismatch. Create **one** product end-to-end (images → category → product → options → variants → inventory → info section → category assignment), verify it on the store, then extend to the full list. This turns "8 partial entities per failed run" into a single iteration target.

---

## Idempotency: find-or-create, persist state

Catalog APIs are pure POSTs with no built-in dedupe. Every seed script must (a) query before creating, and (b) persist a `seed/out/state.json` of local-key → Wix id so re-runs reuse existing entities. Without this, each retry produces a fresh orphan set in the dashboard.

```js
// ✅ find-or-create pattern
async function findOrCreateCategory(name, desc, imageUrl) {
  const existing = await api('POST', '/categories/v1/categories/query', {
    query: { filter: { name } },
    treeReference: { appNamespace: '@wix/stores' },
  });
  const found = (existing.categories || []).find(c => c.name === name);
  if (found) return found;
  const r = await api('POST', '/categories/v1/categories', {
    category: { name, description: desc, image: { url: imageUrl } },
    treeReference: { appNamespace: '@wix/stores' },
  });
  return r.category;
}
```

Same pattern applies to **customizations** (query by `name + customizationType + customizationRenderType`), **products** (query by `slug`), **info sections** (query by `uniqueName`), and **media imports** (re-use the wixstatic URL).

### Persist state across runs

Write `seed/out/state.json` after every successful step so re-runs can short-circuit:

```js
import fs from 'node:fs';
const statePath = 'seed/out/state.json';
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : { categories: {}, products: {}, customizations: {}, infoSections: {} };

if (!state.categories.apparel) {
  state.categories.apparel = (await findOrCreateCategory(...))._id;
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}
```

This lets you iterate on the seed script (fix a bug, re-run) without accumulating duplicates. **Assume every seed script WILL be re-run at least twice** — the first run will fail on some API shape issue, and the second run must not duplicate the first run's successful work.

## Long seeds and curl timeouts

For seeds that take 15+ minutes, hit the endpoint with `curl --max-time 1800` and emit progress to the response body inside the handler (`log.push(...)`) so partial output is visible on disconnect. Astro handlers keep running after curl drops — re-query via a probe page to check actual state before re-running, since restarting an in-flight seed produces duplicates.

---

## Two-pass seeding: data first, images last

Run the catalog in two passes:

1. Create every category, product, customization, variant, and info section with no images.
2. In a second pass, generate and attach images via PATCH.

Image generation is the slow step (Runware: seconds × dozens of products = minutes), and retries on the data pass shouldn't re-do that work. The two-pass split also keeps create failures and image failures independent.

Take the exception (inline image at create) only when the API genuinely requires it — note in the script why.

The step-by-step below lists image generation first because that's the order most records expect image URLs at creation. In practice, run steps 3-9 with `image: undefined` and then a final step 10 that loops through each entity type and PATCHes in the generated image.

## Seeding: exercise every catalog feature

The seed must collectively exercise every UI branch on `/store/[slug]`, the listing page, the cart sidebar, and member orders. A catalog of 8 plain `name + price` products leaves option pickers, swatch chips, modifier inputs, info sections, ribbons, sale prices, preorder messaging, the back-in-stock form, and multi-image galleries untested.

Aim for ~10–15 products that collectively hit every row in the matrix below. A single product can satisfy several rows.

| Coverage row | Why the UI needs it | At least one product with… |
|---|---|---|
| **Text option** | Renders the chip-style option group (S/M/L) | A `PRODUCT_OPTION` customization, `TEXT_CHOICES` render type, attached as `options[]` |
| **Swatch (color) option** | Renders the color-circle picker | A `PRODUCT_OPTION` customization, `SWATCH_CHOICES` render type, choices with `colorCode` |
| **Multi-option product** | Renders the variant grid with multiple choosers, exercises variant matching | A product with **2+ option types** combined (Size + Color → many variants at different prices) |
| **Free-text modifier** | Renders the text input with char counter | A `MODIFIER` customization, `FREE_TEXT` render type, attached via product `modifiers[]` |
| **Text-choices modifier** | Renders modifier as button group | A `MODIFIER` customization, `TEXT_CHOICES` render type |
| **Swatch-choices modifier** | Renders modifier as color circles | A `MODIFIER` customization, `SWATCH_CHOICES` render type |
| **Info sections** | Renders the accordion below the description | A product attached to 2+ info sections (e.g. Care Instructions, Materials, Shipping) |
| **Ribbon** | Renders the corner badge ("NEW", "SALE", "BESTSELLER") | A product with a `ribbon: { name }` |
| **Sale price** | Renders the strikethrough "before" price | A product with `compareAtPrice` > `actualPrice` |
| **Preorder** | Renders the preorder badge + message | A product with `inventoryItem: { trackQuantity: true, quantity: 0, preorderInfo: { enabled: true, limit: N, message } }` |
| **Out-of-stock** | Renders the "Notify me when back" form | A product with all variants out of stock — drives the back-in-stock app installation step |
| **Multi-image gallery** | Renders the image carousel/thumbnail strip | A product with **3+ media items** |
| **Plain product** | Verifies the simplest detail-page render with no chooser UI | A product with **no options, no modifiers**, single price |
| **Categorized** | Renders the category filter bar on the listing | Categories assigned via `bulk/categories/{id}/add-items` to every product (and at least 3 distinct categories) |

If a row doesn't fit a real product idea, invent one (a "Gift wrap" free-text modifier, a "Limited edition" ribbon, a "Pre-order: ships next quarter" book). The catalog exists to verify the storefront end-to-end, not to be commercially realistic.

The seed is the catalog's spec — `options`, `modifiers`, `infoSections`, `ribbon`, `compareAt`, `preorder`, `outOfStock`, `category`, `images` all live in the data. A script that consumes only `name + price + image` produces a half-finished catalog.

## Step-by-Step Overview

1. **Generate images** via Wix Runware API (see [MEDIA.md](MEDIA.md))
2. **Import images** to Wix Media (`POST /site-media/v1/files/import`)
3. **Create categories** with images (`POST /categories/v1/categories`)
4. **Create simple products** with media and inventory (`POST /stores/v3/products-with-inventory`) — single default variant, no options yet
5. **Create customizations** (options like Size, Color) (`POST /stores/v3/customizations`)
6. **Update products** to attach options → auto-generates variants (`PATCH /stores/v3/products-with-inventory/{id}`)
6b. **Create inventory** for new variants (`POST /stores/v3/bulk/inventory-items/create`)
7. **Create info sections** (`POST /stores/v3/info-sections`)
8. **Assign info sections** to products (`POST /stores/v3/bulk/products/add-info-sections`)
9. **Assign products to categories** (`POST /categories/v1/bulk/categories/{id}/add-items`)
10. **Enable back-in-stock notifications** (if catalog has out-of-stock products) — install app + enable collection

---

## Steps 1-2: Generate and Import Images

Generate via Runware using `npx wix token` + curl (see [MEDIA.md](MEDIA.md) for full details), then import:

```http
POST https://www.wixapis.com/site-media/v1/files/import
Body: { "url": "<imageURL from Runware>", "mimeType": "image/jpeg", "displayName": "classic-tshirt.jpg" }
```

Response: `file.url` (wixstatic.com URL) — usable immediately. Save for the product `media` field.

---

## Step 3: Create Categories

⛔ **Breaks at runtime** — The endpoint is `categories/v1/`, NOT `stores/v1/`. → Use `POST https://www.wixapis.com/categories/v1/categories`.

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

⛔ — `treeReference` is required. Omitting → `treeReference must not be empty`.
⛔ — Category `image` requires `{ "url": "..." }`, not `{ "id": "..." }`. → Use the full URL.

---

## Step 4: Create Products with Media and Inventory

```http
POST https://www.wixapis.com/stores/v3/products-with-inventory
```
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

Response includes `product.id` and `variantsInfo.variants[].id`.

---

## Step 5: Create Customizations (Options/Modifiers)

```http
POST https://www.wixapis.com/stores/v3/customizations
```

**Text option (e.g., Size):**
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
        { "name": "L", "choiceType": "CHOICE_TEXT" }
      ]
    }
  }
}
```

**Color swatch option:**
```json
{
  "customization": {
    "name": "Color",
    "customizationType": "PRODUCT_OPTION",
    "customizationRenderType": "SWATCH_CHOICES",
    "choicesSettings": {
      "choices": [
        { "name": "Black", "choiceType": "ONE_COLOR", "colorCode": "#000000" },
        { "name": "White", "choiceType": "ONE_COLOR", "colorCode": "#FFFFFF" }
      ]
    }
  }
}
```

**Free text modifier (e.g., gift message):**
```json
{
  "customization": {
    "name": "Gift Message",
    "customizationType": "MODIFIER",
    "customizationRenderType": "FREE_TEXT",
    "freeTextInput": { "title": "Gift Message", "maxCharCount": 150 }
  }
}
```

Required fields:
- `customizationType`: `"PRODUCT_OPTION"` or `"MODIFIER"` (NOT `"PRODUCT_MODIFIER"`)
- `customizationRenderType`: required — `"TEXT_CHOICES"`, `"SWATCH_CHOICES"`, or `"FREE_TEXT"`. → Omitting causes: `customizationRenderType value is required`
- `choiceType` valid values: `"CHOICE_TEXT"`, `"ONE_COLOR"`, `"MULTIPLE_COLORS"`, `"IMAGE"`. → `"CHOICE_COLOR"` does not exist (returns 400)
- For `FREE_TEXT`: use `freeTextInput` (NOT `freeTextSettings`) with required `title`

Response: `customization.id` — save for attaching to products.

---

## Step 6: Attach Options and Create Variants

```http
PATCH https://www.wixapis.com/stores/v3/products-with-inventory/{productId}
```

You must pass the FULL option definition AND explicit variants with `optionChoiceIds`. The `options` and `variantsInfo` fields are mutually dependent — pass both together.

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
        }
      ]
    }
  }
}
```

### Attaching modifiers (not just options)

To attach a `FREE_TEXT` modifier to a product in the same PATCH call, add a `modifiers` array alongside `options`:

```json
{
  "product": {
    "revision": "1",
    "options": [...],
    "modifiers": [{
      "id": "<modifier-customization-id>",
      "name": "Gift Note",
      "modifierRenderType": "FREE_TEXT",
      "freeTextSettings": { "title": "Gift Note", "maxCharCount": 140 }
    }],
    "variantsInfo": { "variants": [...] }
  }
}
```

⛔ **`freeTextInput` vs `freeTextSettings` — these are NOT the same field.** The create-customization endpoint (Step 5) uses `freeTextInput`. When you later attach the same customization to a product as a modifier (Step 6), the field is renamed to `freeTextSettings`. Using `freeTextInput` on the product PATCH returns:

```
400: product.modifiers[0] — freeTextSettings or choicesSettings must not be empty
```

| Context | Field name |
|---------|-----------|
| `POST /customizations` (Step 5, standalone customization) | `freeTextInput` |
| `PATCH /products-with-inventory/{id}` in `modifiers[]` (Step 6, attach to product) | `freeTextSettings` |

⚠️ **Common mistakes:**
- Pass full option definition with `name`, `optionRenderType`, `choicesSettings` — not just `{ "id": "..." }`. → Omitting `choicesSettings` causes: `choicesSettings must not be empty`
- Each choice needs `id`, `name`, and `choiceType` — get these from the customization query response
- Variants reference choices via `optionChoiceIds` (`optionId` + `choiceId`), NOT via name strings
- Use `PATCH https://www.wixapis.com/stores/v3/products-with-inventory/{id}` — NOT `POST /products/{id}/update-with-inventory`. The wrong URL returns 404 with no error body.

---

## Step 6b: Create Inventory for New Variants

⚠️ — `inventoryItem.inStock` on the update may NOT create inventory. Variants can end up OUT_OF_STOCK even with `inStock: true`. → Always follow up with explicit inventory creation:

```http
POST https://www.wixapis.com/stores/v3/bulk/inventory-items/create
Body: {
  "inventoryItems": [
    { "variantId": "<variant-id>", "productId": "<product-id>", "inStock": true }
  ]
}
```

### Pre-order Setup

```json
{
  "inventoryItems": [{
    "variantId": "...", "productId": "...",
    "quantity": 0, "trackQuantity": true,
    "preorderInfo": { "enabled": true, "limit": 100, "message": "Expected to ship by..." }
  }]
}
```

⛔ — Pre-order requires `trackQuantity: true` + `quantity: 0`. Using `inStock: true` without quantity tracking causes cart to cap quantity to 0. → Set `preorderInfo.limit` for cart to accept items.

---

## Steps 7-8: Info Sections

Info sections are separate entities — you CANNOT inline them during `createProduct` (fails with `INFO_SECTION_CREATION_FAILED`).

**Create:**
```http
POST https://www.wixapis.com/stores/v3/info-sections
Body: {
  "infoSection": {
    "uniqueName": "care-instructions",
    "title": "Care Instructions",
    "description": {
      "nodes": [{ "type": "PARAGRAPH", "id": "p1", "nodes": [
        { "type": "TEXT", "textData": { "text": "Your description text here." } }
      ]}],
      "metadata": { "version": 1 }
    }
  }
}
```

**Assign to products:**
```http
POST https://www.wixapis.com/stores/v3/bulk/products/add-info-sections
Body: {
  "infoSectionIds": ["info-section-id-1", "info-section-id-2"],
  "products": [{ "productId": "...", "revision": "1" }],
  "returnEntity": true
}
```

---

## Step 9: Assign Products to Categories

```http
POST https://www.wixapis.com/categories/v1/bulk/categories/{categoryId}/add-items
Body: {
  "items": [
    { "catalogItemId": "product-id", "appId": "215238eb-22a5-4c36-9e7b-e7c08025e04e" }
  ],
  "treeReference": { "appNamespace": "@wix/stores" }
}
```

⚠️ — Uses `catalogItemId` (NOT `itemId`) and requires `treeReference`.
⚠️ — Categories are NOT assigned inline during product creation — there is no `directCategoryIds` field on the create request.

---

## Step 10: Enable Back-in-Stock Notifications

If your catalog includes out-of-stock products for the back-in-stock flow, you MUST complete these two setup steps or `createBackInStockNotificationRequest` will fail at runtime:

1. **Install the back-in-stock app** (account-level API — use ManageWixSite MCP tool):
   ```http
   POST https://www.wixapis.com/apps-installer-service/v1/app-instance/install
   Body: { "tenant": { "id": "<siteId>", "tenantType": "SITE" }, "appInstance": { "appDefId": "16be6c71-d061-4f56-8cda-c6aa911d1832" } }
   ```

2. **Enable notification collection** (site-level API):
   ```http
   POST https://www.wixapis.com/back-in-stock-service/v1/back-in-stock-notification-requests/settings/start-collecting
   Body: { "appId": "1380b703-ce81-ff05-f115-39571d94dfcd" }
   ```
