# Wix Stores Catalog V1

appId: `1380b703-ce81-ff05-f115-39571d94dfcd`

## SDK

- `@wix/stores` → `products` namespace: `getProduct`, `queryProducts`, `queryStoreVariants`, `createProduct`, `updateProduct`, `deleteProduct`, `addProductMedia`
- `@wix/stores` → `collections` namespace: `queryCollections`, `getCollectionBySlug`, `createCollection`, `deleteCollection`

## Query Patterns

```typescript
import { products, collections } from '@wix/stores';

// Query all products
const result = await products.queryProducts({ paging: { limit: 100 } });
const allProducts = result.products || [];

// Get by slug (TWO calls required — queryProducts doesn't include variants)
const stub = (await products.queryProducts({
  filter: { slug },
  paging: { limit: 1 },
})).products?.[0];
const full = await products.getProduct(stub._id!);
const product = full.product;  // includes variants

// Query collections
const collResult = await collections.queryCollections({ paging: { limit: 100 } });
const allCollections = collResult.collections || [];
```

## V1 Product Data Shape

- `_id`, `name`, `slug`, `visible`
- `description` — HTML string
- `productType` — `"physical"` or `"digital"` (lowercase)
- `media.items[]` — `{ id, image: { url, width, height }, video: { files: [{ url }] }, thumbnail: { url } }`
- `priceData` — `{ price, discountedPrice, currency, formatted: { price, discountedPrice } }`
- `priceRange` — `{ minValue, maxValue }`
- `productOptions[]` — `{ name, optionType, choices: [{ value, description, inStock }] }`
- `variants[]` — `{ _id, choices: { OptionName: "Value" }, variant: { priceData }, stock: { inStock } }`
- `collectionIds[]` — collection GUIDs
- `stock` — `{ inStock, inventoryStatus, trackInventory }`
- `manageVariants` — boolean
- `ribbon` — plain string
- `customTextFields[]` — `{ title, mandatory, maxLength }`
- `additionalInfoSections[]` — `{ title, description (HTML) }`

## catalogReference

```typescript
const ref = {
  catalogItemId: product._id,
  appId: '1380b703-ce81-ff05-f115-39571d94dfcd',
  options: { variantId }  // for managed variants
};
// Non-managed: options: { options: { Size: 'M' } }
```

## V1 REST API (for MCP)

- Create product: `POST /stores/v1/products`
- Query: `POST /stores/v1/products/query` with `{ query: {...}, includeVariants: true }`
- Add media: `POST /stores/v1/products/{id}/media` with `{ media: [{ url }] }`
- Create collection: `POST /stores/v1/collections`
- Add to collection: `POST /stores/v1/collections/{id}/productIds`

## V1 Gotchas

- `queryProducts` does NOT include variants — must use `getProduct(id)` separately
- `collections` namespace fails on V3 sites with 428
- `customTextFields` are V1's equivalent of V3 `modifiers`
- Back-in-stock settings endpoint uses V1 appId: `POST .../start-collecting` with `appId: "1380b703-..."`
