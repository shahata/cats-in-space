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

Query per `appId` rather than the unfiltered site endpoint — the unfiltered response can exceed MCP's truncation limit, and missing schemas mean missing translations.

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

Wix Stores ships both V1 and V3 schemas under different appIds. V3 covers product name + rich-content description; V1 (under the Platform appId) covers product name, plain-text description, info sections, preorder messages, and custom text-field titles. Translate both.

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

If a schema id pulled from a (possibly truncated) response returns no content, re-discover via the per-appId query.

---

## Step 2: Query EN and Target-Language Content

Query one schema at a time. Filtering only by `locale` (without `schemaId`) misses entries from some schemas:

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

Copy English values as-is for non-translatable fields (`_id`, `slug`, dates) — Translation Manager counts completion per field, so skipping them leaves the entry below 100%.

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

CMS collections aren't translatable by default. Create the translation schema for each via the Translation Schema API (`POST /translation-schema/v1/schemas`) — once a schema exists, English content auto-populates and the same `/translation-content/v1/bulk/contents/create` API handles translations. Find existing CMS schemas with `GET /translation-schema/v1/schemas/site?scope=SITE`.

(The Translation Manager UI's "Enable for translation" toggle does the same thing programmatically — there's no need to use the dashboard for headless setups.)

---

## Tips & Gotchas

- **Wix Multilingual app install**: no public `appDefId` for the Apps Installer API — install via the dashboard. (Track upstream.)
- **`wix translation push` needs TTY**: Won't work in non-interactive scripts or CI
- **Use cursor pagination, not `paging.offset`**: `POST /translation-content/v1/contents/query` ignores the `offset` field — it always returns the first `limit` items. Use `cursorPaging` and feed back `pagingMetadata.cursors.next` until `hasNext` is false:
  ```js
  let cursor;
  while (true) {
    const q = cursor
      ? { cursorPaging: { limit: 100, cursor } }
      : { filter: { locale, schemaId }, cursorPaging: { limit: 100 } };
    const res = await wix('/translation-content/v1/contents/query', { query: q });
    all.push(...(res.contents ?? []));
    if (!res.pagingMetadata?.hasNext) break;
    cursor = res.pagingMetadata.cursors.next;
  }
  ```
- **RICH_CONTENT fields**: Sending `textValue` for rich content fields returns `INVALID_ARGUMENT`. → Use `richContent: { nodes: [...] }` format
- **Schema permissions**: `create` and `query` on schemas return 403 via site-level MCP auth AND via the headless runtime's own `httpClient.fetchWithAuth` from `@wix/essentials`. To call these endpoints from a standalone Node script, use the Wix CLI site token plus explicit headers:
  ```js
  const token = execSync(`npx wix token -s ${siteId}`).toString().split('\n').find(l => l.includes('.'));
  // site-owner is the 4th dot-segment of the "OauthNG.JWS.<hdr>.<payload>.<sig>" token
  const payloadB64 = token.split('.')[3];
  const { instance } = JSON.parse(JSON.parse(Buffer.from(payloadB64, 'base64').toString()).data);
  const accountId = instance.siteOwnerId;
  await fetch(url, { headers: { Authorization: token, 'wix-site-id': siteId, 'wix-account-id': accountId } });
  ```
  Without the `wix-account-id` header the API returns `{ "message": "", "details": {} }` with status 403.
- **Auto-created schemas**: for Wix apps (Events, Stores, Blog, etc.), schemas appear automatically once the Multilingual app detects content. For CMS collections, create the schema via the Translation Schema API (see "CMS Collections" above).
- **Content entry counts are per-entity, not per-field**: one translation-content row covers ALL translatable fields for a single entity (a single event, product, campaign, etc.). If your count looks inflated by Nx, the offset-paging bug above is the cause — not a field-explosion.
- **`parentEntityId`**: Schemas with `requireParentEntity: true` need `parentEntityId` copied from EN entry
- **Per-schema queries via MCP**: Each response is small and won't hit MCP's ~54KB truncation limit
- **Recurring events translate per occurrence**: each occurrence in a recurring series has its own `Event._id` and its own translation-content row. Iterate `queryEvents().find()` and create an entry per event id — translations don't propagate across siblings.
- **Event/product/post slugs are locale-invariant**: the SDK does not return a different `slug` per locale, even when title/description are translated. Build locale-agnostic URL paths from `entity.slug` (plus locale prefix if your site uses path-based multilingual) — never re-slugify the translated title, which produces a new slug per language and breaks deep-linking.
- **Donation Campaigns backend ignores `x-wix-linguist`**: the `donationCampaigns` API will always return the primary-language field values regardless of the elevated or locale-scoped client you call it from. Seeding translations via this API works and surfaces them in Translation Manager, but public read calls still come back in the primary language. There is no client-side workaround — track upstream fix.
