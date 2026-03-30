# Translation Content API (Dynamic Business Data)

Translates products, services, staff, blog posts, CMS collections, and all other dynamic content managed through Wix apps.

For static UI strings (`t()` function, RTL, interpolation), see [TRANSLATIONS_STATIC.md](TRANSLATIONS_STATIC.md).

---

## Overview

The Translation Content API works with **schemas** (which define translatable fields per content type) and **content entries** (the actual translations per entity per locale). The workflow:

1. Discover all translation schemas
2. For each schema, query EN and target-language content
3. Diff to find missing translations (entries AND fields)
4. Create/update translations via bulk API

---

## Step 1: Discover All Translation Schemas

⛔ **Breaks at runtime** — The `GET /translation-schema/v1/schemas/site` endpoint returns 100KB+ responses that get truncated by MCP. Missing schemas = missing translations. → Always query per-appId, never rely on a single unfiltered call.

### Phase 1: Query by known appId

```http
GET https://www.wixapis.com/translation-schema/v1/schemas/site?appId=<appId>
```

Key Wix appIds:
| appId | App | Content types |
|-------|-----|--------------|
| `1380b703-ce81-ff05-f115-39571d94dfcd` | Wix Stores / eCommerce | Checkout emails, settings, delivery profiles |
| `215238eb-22a5-4c36-9e7b-e7c08025e04e` | Stores Catalog V3 | Products, Info Sections, Inventory/preorder, Options, Ribbons, Brands |
| `13d21c63-b5ec-5912-8397-c3a5ddb27a97` | Wix Bookings | Services, Staff, Categories, Policies, Pricing options |
| `14bcded7-0066-7c35-14d7-466cb3f09103` | Wix Blog | Posts, Blog settings |
| `1522827f-c56c-a5c9-2ac9-00f9e6ae12d3` | Wix Pricing Plans | Plan names, descriptions, benefits |
| `00000000-0000-0000-0000-000000000013` | Wix Platform | Site Pages, Menus, UI components |
| `14bca956-e09f-f4d6-14d7-466cb3f09103` | Wix Payments | Offline payment methods |
| `d80111c5-a0f4-47a8-b63a-65b54d774a27` | Wix Gift Cards (Rise) | NOTE: No schemas as of March 2026 — use dashboard Translation Manager |
| `14cc59bc-f0b7-15b8-e1c7-89ce41d0e0c9` | Wix Contacts/CRM | Custom Fields |
| `14ce1214-b278-a7e4-1373-00cebd1bef7c` | Wix Forms | Booking form, contact form labels |

For CMS collections:
```http
GET https://www.wixapis.com/translation-schema/v1/schemas/site?scope=SITE
```

⚠️ **Common mistake** — V1 vs V3 duplication: Wix Stores has BOTH V1 and V3 schemas under different appIds. V3 has product name + richContent description. V1 (under Platform appId) has product name, plain-text description, AND info sections, preorder messages, custom text field titles. → Translate BOTH.

### Schemas NOT discoverable by appId

These only appear via the `$nin` sweep or unfiltered listing:
- Shipping Rules, Product Options V1, Product Ribbons V1, Store Collections V1
- Bookings Staff/Resources, Business Locations

### Phase 2: The `$nin` sweep (mandatory final step)

After translating all known schemas, verify nothing was missed:

```http
POST https://www.wixapis.com/translation-content/v1/contents/query
Body: {
  "query": {
    "filter": { "locale": "en", "schemaId": { "$nin": ["<all-schema-ids-already-translated>"] } },
    "paging": { "limit": 100 }
  }
}
```

If this returns results, extract the new schemaIds, translate them, add to `$nin`, repeat until empty.

Schemas commonly caught only by the sweep:
- **Pricing Plans** (NOT under the expected Pricing Plans appId)
- **Blog Settings** ("All Posts" feed label)
- **Shipping Options** (e.g., "Free shipping")

⚠️ — When extracting schema IDs from truncated responses, IDs may be corrupted. → Verify by querying content; if empty for a schema you expect, re-discover via per-appId query.

---

## Step 2: Query EN and Target-Language Content

⛔ **Breaks silently** — Querying all content at once (`locale: "en"` without `schemaId`) silently misses entries from some schemas. → Always query one schema at a time:

```http
POST https://www.wixapis.com/translation-content/v1/contents/query
Body: { "query": { "filter": { "locale": "en", "schemaId": "<schema-id>" }, "paging": { "limit": 100 } } }
```

```http
POST https://www.wixapis.com/translation-content/v1/contents/query
Body: { "query": { "filter": { "locale": "ja", "schemaId": "<schema-id>" }, "paging": { "limit": 100 } } }
```

Each entry has: `schemaId`, `entityId`, `locale`, `fields` (map of field key → `{textValue, published, updatedBy}` or `{richContent, published, updatedBy}`)

---

## Step 3: Find Missing Translations

Two levels — both matter because the Translation Manager counts individual fields:

1. **Missing entries** — EN entry exists, no target-language entry with same `entityId` → create new
2. **Missing fields** — Target entry exists but some fields lack `textValue`/`richContent` → update to add fields

---

## Step 4: Create Translations

```http
POST https://www.wixapis.com/translation-content/v1/bulk/contents/create
Body: {
  "contents": [{
    "schemaId": "same-as-english",
    "entityId": "same-as-english",
    "locale": "ja",
    "fields": {
      "fieldKey": { "textValue": "Japanese text", "published": true, "updatedBy": "USER" }
    }
  }],
  "returnEntity": false
}
```

Batch size: up to 10 entries per call to avoid timeouts.

### What to Translate

⚠️ **Common mistake** — Skipping non-translatable fields (`_id`, `slug`, dates) leaves completion below 100%. → Copy English values as-is for these fields.

**Text fields** (`textValue`): product names, descriptions, service names, staff names, page titles, menu labels, category names, form labels, option names, ribbons, preorder messages, CMS fields. For IDs/slugs/dates, copy EN value as-is.

**Rich content fields** (`richContent`): product descriptions (V3), info section descriptions, form display fields. Use `richContent: { nodes: [...] }` format. Translate text inside `TEXT` nodes, preserve node structure.

**Skip only**: empty `textValue` fields with no `richContent`, and `image`/`video` fields.

### Updating Existing Entries

```http
POST https://www.wixapis.com/translation-content/v1/bulk/contents/update
Body: {
  "contents": [{
    "content": {
      "id": "<target-language-content-id>",
      "schemaId": "...", "entityId": "...", "locale": "ja",
      "fields": { "missingFieldKey": { "textValue": "value", "published": true, "updatedBy": "USER" } }
    }
  }],
  "returnEntity": false
}
```

The update requires the target entry's `id` (content GUID), not just `entityId`.

---

## CMS Collections

CMS collections need extra setup — they're not translatable by default:

1. **Enable from dashboard**: Multilingual > Translation Manager > enable each collection
2. **Schemas appear under a different appId** — query with `?scope=SITE` to find them
3. **English content auto-populated** once schemas are created
4. **Translate via the same API** using the CMS schema IDs

---

## Tips & Gotchas

- **Dashboard install only**: Wix Multilingual app requires dashboard installation — no known `appDefId`
- **`wix translation push` needs TTY**: Won't work in non-interactive scripts or CI
- **Paging may be ignored**: Query API may return all entries regardless of `limit`
- **RICH_CONTENT fields**: Sending `textValue` for rich content fields returns `INVALID_ARGUMENT`. → Use `richContent: { nodes: [...] }` format
- **Schema permissions**: `create` and `query` on schemas return 403 via site-level MCP auth. Schemas for Wix apps are auto-created when they detect multilingual. For CMS collections, enable from dashboard.
- **`parentEntityId`**: Schemas with `requireParentEntity: true` need `parentEntityId` copied from EN entry
- **Per-schema queries via MCP**: Each response is small and won't hit MCP's ~54KB truncation limit
