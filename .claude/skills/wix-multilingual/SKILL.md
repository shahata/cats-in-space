# Wix Multilingual in Managed Headless Projects

## Overview

Multilingual in managed headless uses two separate systems:

1. **Static translations** (`translations.json` + `wix translation push/pull`) for UI strings — navigation labels, button text, headings, etc.
2. **Translation Content API** for dynamic business content — products, services, staff members, blog posts, and any other data managed through Wix apps.

Both systems must be set up and used together for a fully translated site.

---

## Setup

### 1. Install the Wix Multilingual App

Install from the Wix dashboard manually. There is no known `appDefId` for API-based installation.

### 2. Enable Multilingual Mode

```http
POST https://www.wixapis.com/locale-settings/v2/settings/mode
Content-Type: application/json
Authorization: <site auth>

{
  "multilingualModeEnabled": true
}
```

### 3. Create a Secondary Locale

Example for Japanese:

```http
POST https://www.wixapis.com/locales/v2/locale
Content-Type: application/json
Authorization: <site auth>

{
  "locale": {
    "languageCode": "ja",
    "visibility": "VISIBLE",
    "flag": "JPN",
    "regionalFormat": "ja-JP"
  }
}
```

### 4. URL Structure

URL structure is **SUBDIRECTORY** by default. Japanese pages appear at `/ja/...`, French at `/fr/...`, etc. The primary language has no prefix.

---

## Static Translations (UI Strings)

### File Structure

- **English keys**: `src/translations.json` — flat or nested key-value pairs
- **Secondary language translations**: `.wix/multilingual/translations/ja.json` (same structure as `translations.json`)
- **Metadata**: `.wix/multilingual/metadata.json` with `{"primaryLanguageCode": "en"}`

Example `src/translations.json`:

```json
{
  "nav": {
    "home": "Home",
    "shop": "Shop",
    "missions": "Missions"
  },
  "common": {
    "addToCart": "Add to Cart",
    "bookNow": "Book Now"
  }
}
```

Example `.wix/multilingual/translations/ja.json`:

```json
{
  "nav": {
    "home": "ホーム",
    "shop": "ショップ",
    "missions": "ミッション"
  },
  "common": {
    "addToCart": "カートに追加",
    "bookNow": "今すぐ予約"
  }
}
```

### Astro Config

Update `astro.config.mjs` to enable translations:

```js
wix({ essentials: true, translations: true })
```

### Push & Pull

- **Push keys to dashboard**: `npm run wix translation push` (interactive terminal only — requires TTY)
- **Pull translations from dashboard**: `npm run wix translation pull`

### Using Translations in Code

`i18n.getTranslationFunction()` works in **both** Astro pages (server-side) and React components (client-side `client:load`).

**In Astro pages** (frontmatter):
```astro
---
import { i18n } from '@wix/essentials';
const t = i18n.getTranslationFunction();
---
<h1>{t('home.title')}</h1>
```

**In React components** (inside the component function):
```tsx
import { i18n } from "@wix/essentials";

export default function MyComponent() {
  const t = i18n.getTranslationFunction();
  return <h1>{t('home.title')}</h1>;
}
```

**CRITICAL**: Call `getTranslationFunction()` inside the component function, not at module level. It needs the request context.

**NOTE**: Requires `@wix/essentials` >= 1.0.6. Older 0.x versions don't have `getTranslationFunction()` at runtime. Make sure to restart the dev server after upgrading.

### Best Practice: Move ALL Static Text to Translations

Every user-visible string should go through `t()` — not just nav labels. This includes:
- Page titles, subtitles, section headings
- Button labels, link text
- Form labels, placeholders
- Error messages, success messages, loading states
- Empty state text, confirmation dialogs
- Status labels, meta information

Organize keys by page/component: `home.*`, `planets.*`, `crew.*`, `missions.*`, `blog.*`, `store.*`, `plans.*`, `bookings.*`, `member.*`, `cart.*`, `footer.*`, `profile.*`, `product.*`, `premium.*`, `payment.*`, `cancelSub.*`, `common.*`

### Language & Locale Helpers

- `i18n.getLanguage()` — returns 2-letter code: `"en"`, `"ja"`
- `i18n.getLocale()` — returns IETF tag: `"en-US"`, `"ja-JP"`

---

## Dynamic Content Translation (Business Data)

Dynamic content (products, services, staff, blog posts, CMS collections, etc.) is translated via the **Translation Content API**. The full workflow to translate everything:

### Step 1: List All Translation Schemas

```http
GET https://www.wixapis.com/translation-schema/v1/schemas/site
```

This returns all schemas grouped by source app. Each schema defines translatable fields for a content type. Key schemas:
- **Wix Stores**: product names, descriptions, care instructions, sizes, ribbons, collection names
- **Wix Bookings**: service names/descriptions/taglines, staff names/descriptions, category names, booking policy names
- **Wix Blog**: post titles, blog settings
- **Wix eCommerce**: checkout settings, shipping rules, payment methods
- **Wix Platform**: page titles, menus, UI components (buttons, text, etc.)
- **Wix Forms**: contact field names
- **CMS collections**: custom collection fields (must be enabled from dashboard first)

Filter by app: `?appId=<appId>` or scope: `?scope=SITE` (for CMS collections).

### Step 2: For Each Schema, Query EN and JA Content

**CRITICAL**: Do NOT query all content at once (`locale: "en"` without `schemaId`). This misses entries from some schemas. Always query per-schema:

```http
POST https://www.wixapis.com/translation-content/v1/contents/query
Body: { "query": { "filter": { "locale": "en", "schemaId": "<schema-id>" }, "paging": { "limit": 100 } } }
```

```http
POST https://www.wixapis.com/translation-content/v1/contents/query
Body: { "query": { "filter": { "locale": "ja", "schemaId": "<schema-id>" }, "paging": { "limit": 100 } } }
```

Per-schema queries return small responses that work well with MCP (no truncation). Compare EN vs JA entries by `entityId` to find missing entries. Also compare **field-by-field** within matching entries to find missing fields.

Each entry has: `schemaId`, `entityId`, `locale`, `fields` (map of field key → `{textValue, published, updatedBy}` or `{richContent, published, updatedBy}`)

### Step 3: Find Missing Translations (Two Levels)

1. **Missing entries**: EN entry exists but no JA entry with same `entityId` → create new JA entry
2. **Missing fields**: JA entry exists but some fields lack `textValue`/`richContent` → update JA entry to add missing fields

Both levels matter — the Translation Manager counts individual fields, not just entries.

### Step 4: Create Translations

```http
POST https://www.wixapis.com/translation-content/v1/bulk/contents/create
Body: {
  "contents": [
    {
      "schemaId": "same-as-english",
      "entityId": "same-as-english",
      "locale": "ja",
      "fields": {
        "fieldKey": { "textValue": "Japanese text", "published": true, "updatedBy": "USER" }
      }
    }
  ],
  "returnEntity": false
}
```

**Batch size**: Push up to 10 entries per API call to avoid timeouts.

### What to Translate

**CRITICAL**: Translate ALL fields that have `textValue` or `richContent` — even `_id`, `slug`, `distance`, `gravity`, `launchDate`. The Translation Manager counts every field. For non-translatable values (IDs, slugs, dates, numbers), copy the English value as-is to the JA entry.

**Text fields** (`textValue`):
- Product names, descriptions, additional info titles/descriptions
- Service names, descriptions, taglines
- Staff names, descriptions
- Page titles, menu labels
- Category/collection names, shipping rule names
- Form field labels (Email → メール, Phone → 電話)
- Product option names and choice values (Color → カラー)
- Product ribbons, preorder messages
- CMS fields: title, description, bio, tagline, gravity, atmosphere, status
- `_id`, `slug`, `distance`, `launchDate` → copy EN value as-is

**Rich content fields** (`richContent`):
- Product descriptions (in Products V3 schema)
- Info section descriptions (Specifications, How It Works, Pre-Order Info)
- Form display fields (e.g., "Client Details" heading)
- These use `richContent: { nodes: [...] }` format, NOT `textValue`
- Translate text inside `TEXT` nodes, preserve node structure (HEADING, PARAGRAPH, etc.)
- Set via update: `{"richContent": {"nodes": [...]}, "published": true, "updatedBy": "USER"}`

**Skip only**:
- Fields with empty `textValue` ("") AND no `richContent`
- `image`/`video` fields (media references, no text)

### Updating Existing Entries with Missing Fields

When a JA entry exists but is missing some fields, use the bulk update API:

```http
POST https://www.wixapis.com/translation-content/v1/bulk/contents/update
Body: {
  "contents": [{
    "content": {
      "id": "<ja-content-id>",
      "schemaId": "...",
      "entityId": "...",
      "locale": "ja",
      "fields": {
        "missingFieldKey": { "textValue": "value", "published": true, "updatedBy": "USER" }
      }
    }
  }],
  "returnEntity": false
}
```

The update requires the JA entry's `id` (content GUID), not just `entityId`.

### Translating CMS Collections

CMS collections need extra setup:
1. **Enable from dashboard**: Go to Multilingual > Translation Manager and enable each collection
2. **Schemas appear under a different appId** (not the standard CMS appId). Query with `?scope=SITE` to find them
3. **English content auto-populated** once schemas are created
4. **Translate via the same API** using the CMS schema IDs

Query CMS-only schemas:
```http
GET https://www.wixapis.com/translation-schema/v1/schemas/site?scope=SITE
```

Then query content for those schemas:
```http
POST https://www.wixapis.com/translation-content/v1/contents/query
Body: { "query": { "filter": { "locale": "en", "schemaId": { "$in": ["planet-schema-id", "crew-schema-id"] } } } }
```

---

## Language Switcher in Nav

### Getting Available Languages

```ts
import { multilingual } from '@wix/site';

const languages = await multilingual.listSupportedLanguages();
// Returns array of supported languages with fallback handling
```

### Building Locale-Aware URLs

```ts
import { getRelativeLocaleUrl } from 'wix:astro:i18n';

// Build URL for a specific locale
const jaUrl = getRelativeLocaleUrl('ja', '/shop');  // "/ja/shop"
const enUrl = getRelativeLocaleUrl('en', '/shop');  // "/shop" (primary, no prefix)
```

To switch languages from the current page:
1. Strip any existing locale prefix from the current path
2. For non-primary languages, prepend the new locale prefix
3. For the primary language, use the path without prefix

### UI Patterns

- **Logged-in users**: language sub-menu inside the member dropdown
- **Logged-out users**: standalone language button with dropdown

---

## Tips & Gotchas

- **Dashboard install only**: Wix Multilingual app must be installed from the dashboard — no known `appDefId` for API-based installation.
- **`wix translation push` needs TTY**: Requires an interactive terminal. It will not work in non-interactive scripts or CI pipelines.
- **`.wix/` is gitignored**: Translation files in `.wix/multilingual/translations/` will not be committed to version control. Use `wix translation pull` to restore them locally.
- **Paging may be ignored**: The Translation Content query API may return all entries regardless of the `limit` value. Use cursor-based paging for large datasets.
- **RICH_CONTENT fields**: Some fields (e.g., rich text product descriptions) expect `richContent` format, not plain `textValue`. Bulk create returns `INVALID_ARGUMENT` if you send plain text for these fields. Skip or format them appropriately.
- **`i18n.getTranslationFunction()`**: Works with the `src/translations.json` keys and the pulled translation files in `.wix/multilingual/translations/`.
- **Business content auto-populated**: When multilingual is enabled, English content entries are auto-created for products, services, etc. Translate them via the Translation Content API or the Translation Manager in the dashboard.
- **Translation schemas need app-level permissions**: Both `create` and `query` on schemas return 403 via site-level MCP auth. Schemas for Wix apps (Stores, Bookings, Blog) are auto-created when those apps detect multilingual is enabled. For custom CMS collections (e.g., Planets, CatExplorers, Missions), enable multilingual from the Wix dashboard: **Website Content > Multilingual > Translation Manager**. You can list existing schemas via `GET https://www.wixapis.com/translation-schema/v1/schemas/site` (read works, create doesn't).
- **CMS collections aren't translatable by default**: Custom CMS collections don't get translation schemas automatically. You must enable them from the dashboard. Once enabled, the CMS app creates schemas and auto-populates English content entries that can then be translated via the Translation Content API.
- **Use MCP with per-schema queries (preferred)**: Always iterate schemas individually — (1) list all schemas via MCP `GET /translation-schema/v1/schemas/site`, (2) for each schema, query EN and JA content via MCP with `schemaId` filter, (3) diff by `entityId` for missing entries, diff field-by-field for missing fields. Each per-schema response is small and won't hit MCP's ~54KB truncation limit. Do NOT query all content without a `schemaId` filter — it misses entries from some schemas.
- **Some entries need `parentEntityId`**: Schemas with `requireParentEntity: true` (like Rich Text components) need the `parentEntityId` field copied from the EN entry when creating the JA entry.
