# Product Seeding Workflow (V3 Catalog)

A complete product catalog requires multiple sequential API calls. Do NOT try to do everything in one call — `create-product-with-inventory` handles basic product + inventory, but options, info sections, images, and categories must be added separately.

---

## Step-by-Step Overview

1. **Generate images** via Wix Runware API (see [MEDIA.md](MEDIA.md))
2. **Import images** to Wix Media (`POST /site-media/v1/files/import`)
3. **Create categories** with images (`POST /categories/v1/categories`)
4. **Create simple products** with media and inventory (`POST /stores/v3/products-with-inventory`) — single default variant, no options yet
5. **Create customizations** (options like Size, Color) (`POST /stores/v3/customizations`)
6. **Update products** to attach options → auto-generates variants (`POST /stores/v3/products/{id}/update-with-inventory`)
6b. **Create inventory** for new variants (`POST /stores/v3/bulk/inventory-items/create`)
7. **Create info sections** (`POST /stores/v3/info-sections`)
8. **Assign info sections** to products (`POST /stores/v3/bulk/products/add-info-sections`)
9. **Assign products to categories** (`POST /categories/v1/bulk/categories/{id}/add-items`)

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

⚠️ **Common mistakes:**
- Pass full option definition with `name`, `optionRenderType`, `choicesSettings` — not just `{ "id": "..." }`. → Omitting `choicesSettings` causes: `choicesSettings must not be empty`
- Each choice needs `id`, `name`, and `choiceType` — get these from the customization query response
- Variants reference choices via `optionChoiceIds` (`optionId` + `choiceId`), NOT via name strings

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
