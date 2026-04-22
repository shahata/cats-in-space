# Product Seeding Workflow (V3 Catalog)

A complete product catalog requires multiple sequential API calls. Do NOT try to do everything in one call — `create-product-with-inventory` handles basic product + inventory, but options, info sections, images, and categories must be added separately.

---

## ⛔ Prerequisites: install required apps BEFORE seeding

A freshly scaffolded Wix headless project does NOT have the Wix Stores app installed. Any call to `/stores/v3/*` or `/categories/v1/*` on a fresh site returns:

```
428 Precondition Required
{"message":"Wix Stores app is not installed for site","details":{"applicationError":{"code":"REQUIRED_APP_NOT_INSTALLED"}}}
```

→ **Install the Wix Stores app as step 0 of every seed script**, before creating categories, customizations, or products. Use the account-level MCP tool `ManageWixSite` (not `CallWixSiteAPI` — app install is account-scoped):

```http
POST https://www.wixapis.com/apps-installer-service/v1/app-instance/install
Body: {
  "tenant": { "id": "<siteId>", "tenantType": "SITE" },
  "appInstance": { "appDefId": "215238eb-22a5-4c36-9e7b-e7c08025e04e" }
}
```

**Wix app IDs — do NOT confuse them:**

| App | `appDefId` | Used for |
|-----|------------|----------|
| Wix Stores (V3 catalog) | `215238eb-22a5-4c36-9e7b-e7c08025e04e` | Categories, customizations, products-with-inventory endpoints |
| Back-in-stock notifications | `16be6c71-d061-4f56-8cda-c6aa911d1832` | `createBackInStockNotificationRequest` + start-collecting |
| Back-in-stock (V1 catalogReference) | `1380b703-ce81-ff05-f115-39571d94dfcd` | The `appId` field in the catalogReference passed to `createBackInStockNotificationRequest` (NOT for app install) |
| Rise (gift cards) | `d80111c5-a0f4-47a8-b63a-65b54d774a27` | Gift card catalog items |

⚠️ **Common mistake I have made:** passing the back-in-stock V1 catalogReference ID (`1380b703-...`) to the app-installer endpoint to "install Wix Stores". That installs the wrong thing. Always use `215238eb-...` for the Wix Stores app install.

---

## ⛔ Validate the API shape on ONE product before looping

A seed script that creates 8 products in a loop will fail the same way 8 times if the request shape is wrong — and each call pollutes the catalog with a partial entity. Before looping:

1. Create **one** product end-to-end (images → category → product → options → variants → inventory → info section → category assignment).
2. Verify it appears correctly on the store listing and detail page.
3. Only then extend the script to the full product list.

This turns "my script failed 4 times and each run orphaned 8 products" into "my script failed 4 times and I had to fix 4 bugs on one product."

---

## ⛔ Seed scripts MUST be idempotent (single most common failure mode)

The catalog APIs are all pure POSTs with no built-in deduping. A script that retries or re-runs **WILL** create fresh duplicates of every category, customization, and product on each attempt. A single failed seed run followed by a retry leaves behind an orphan set — two failed runs leave three sets, and so on. The damage is invisible at first because only the last run's entities are wired to the store listing — the orphans just pile up in the dashboard (empty "Apparel" / "Apparel" / "Apparel" categories, `Color-abc123` / `Color-def456` / `Color-ghi789` customizations).

The anti-pattern that causes this:

```js
// ⛔ BAD — every run creates a new category, even if one exists
const r = await api('POST', '/categories/v1/categories', {
  category: { name: 'Apparel', /* ... */ },
  treeReference: { appNamespace: '@wix/stores' },
});
```

### Fix: find-or-create, cache to disk

Every seed script must (a) query existing entities before creating, and (b) persist a `seed/out/state.json` mapping of local-key → Wix ID so subsequent runs reuse IDs instead of creating new ones.

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

The same pattern applies to **customizations** (query by `name + customizationType + customizationRenderType` — that's the unique constraint), **products** (query by `slug`), **info sections** (query by `uniqueName`), and **media imports** (re-use wixstatic URL if already uploaded).

⛔ **Do NOT "fix" duplicates by appending a random UUID suffix to names/slugs** (`'Color-' + uuid()`, `'my-slug-' + uuid()`). This silences the duplicate error but guarantees a fresh orphan set on every retry and leaves the dashboard full of `Color-abc123` / `Color-def456` / `Color-ghi789`. Always find-or-create instead. If you already used the suffix trick during a run, after the catalog works you still need to clean up orphans (delete duplicate categories/products/customizations) and rename the live ones to drop the suffix — the dashboard shows raw customization names to the site owner.

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

## ⛔ Long seeds outlive curl's default timeout

A seed that creates a year of recurring event showtimes + tickets + categories (hundreds of API calls) easily runs 15–25 minutes, which exceeds `curl --max-time 900` (15 min). Two things to know:

1. **Use `--max-time 1800` (or higher)** when hitting a seed endpoint from curl. Otherwise curl drops and you never see the server's final log.
2. **The Astro handler keeps running after curl disconnects.** If the endpoint is server-side-heavy and curl times out, the seed may still finish on the server — re-query via a lightweight probe/listing page to check actual state before assuming failure and re-running (re-running a still-in-progress seed causes duplicates and partial state).

Print progress to the response body from inside the handler as you go (`log.push(...)` then return the joined string at the end) so partial output is visible on disconnect.

---

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
