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

```ts
import { i18n } from '@wix/essentials';

const t = i18n.getTranslationFunction();

// Use translation keys
t('nav.home');      // "Home" or "ホーム" depending on current language
t('common.bookNow'); // "Book Now" or "今すぐ予約"
```

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

### Step 2: Query English Content

```http
POST https://www.wixapis.com/translation-content/v1/contents/query
Body: { "query": { "filter": { "locale": "en" }, "paging": { "limit": 100 } } }
```

**CRITICAL**: The API response can be very large (50KB+) and may get truncated. To handle this:
- Filter by specific schema: `"filter": { "locale": "en", "schemaId": { "$in": ["schema-id-1", "schema-id-2"] } }`
- Use cursor paging for pagination
- Process in batches by schema group

Each entry has: `schemaId`, `entityId`, `locale`, `fields` (map of field key → `{textValue, published, updatedBy}`)

### Step 3: Query Existing Target Translations

```http
POST https://www.wixapis.com/translation-content/v1/contents/query
Body: { "query": { "filter": { "locale": "ja" }, "paging": { "limit": 100 } } }
```

Compare against English entries by `schemaId` + `entityId` to find what's missing.

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

### What to Translate vs Skip

**Translate** (text fields with `textValue`):
- Product names, descriptions, additional info titles/descriptions
- Service names, descriptions, taglines
- Staff names, descriptions
- Page titles, menu labels
- Category/collection names
- Shipping rule names, option titles
- Form field labels (Email → メール, Phone → 電話)
- Product option names and choice values (Color → カラー, Black → ブラック)
- Product ribbons (Bestseller → ベストセラー, New → 新着)
- CMS collection text fields (title, description, bio, tagline, etc.)

**Skip**:
- Fields with empty `textValue` ("")
- System keys (e.g., `"settings.offlineTitleOptionDefault"`)
- `_id`, `slug` fields (identifiers, not user-facing)
- `image`, `video` fields (media, not text)
- Numeric fields (distance, price)
- Date fields (launchDate)
- `RICH_CONTENT` type fields — these need `richContent` format, not plain `textValue`. The API returns `INVALID_ARGUMENT` for plain text. Handle separately or skip.

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
- **MCP truncates large responses at ~54KB**: The Wix MCP tool silently truncates responses larger than ~54KB. The Translation Content query doesn't support field projection, so responses with many entries will always be large. For targeted queries (single schema, few entries), MCP works fine. For **bulk operations** (querying all content, finding missing translations), use `WIX_API_KEY` with `curl` and cursor paging: `curl -H "Authorization: $WIX_API_KEY" -H "wix-site-id: <siteId>"`.
- **Use API key + cursor paging for full content**: To find the real translation gap, paginate through ALL EN and JA content via API key, build `schemaId::entityId` sets, and diff them. Filter by `schemaId` to keep individual MCP queries small enough when API key isn't available. The MCP tool will miss entries beyond the truncation point.
