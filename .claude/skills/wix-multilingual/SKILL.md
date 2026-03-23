---
name: wix-multilingual
description: "Wix Multilingual in Managed Headless Projects. Covers static translations (translations.json, i18next interpolation), dynamic content translation via Translation Content API, schema discovery, RTL support, currency formatting, and language switcher. Trigger on multilingual, translation, i18n, locale, language, RTL, right-to-left, Hebrew, translate."
---

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

### Interpolation (Variables in Translations)

The `t()` function uses **i18next** under the hood. Placeholders use **double curly braces** `{{variable}}`, NOT single braces `{variable}`.

**In translation files:**
```json
{
  "greeting": "Hello {{name}}!",
  "trialDays": "{{days}}-day free trial",
  "copyright": "© {{year}} My Site"
}
```

**In code — pass an object as the second argument:**
```ts
t('greeting', { name: 'Whiskers' })        // → "Hello Whiskers!"
t('trialDays', { days: '7' })              // → "7-day free trial"
t('copyright', { year: '2026' })           // → "© 2026 My Site"
```

**CRITICAL**: Do NOT use `.replace('{var}', value)` — use `t('key', { var: value })` instead. The `.replace()` pattern breaks when the translation string changes word order across languages.

**CRITICAL**: Always use `{{double braces}}` in translation strings. Single `{braces}` will NOT be interpolated — they'll render literally as `{days}` in the UI.

### Currency and Number Formatting

**CRITICAL**: Never manually construct currency strings like `'$' + price` or `currency === 'USD' ? '$' : currency`. This breaks for:
- Non-USD currencies (no symbol mapping)
- Locale-specific symbol placement (Hebrew puts symbol after: `9.99 ₪`, not `₪9.99`)
- Decimal separators (comma vs period)

Use `Intl.NumberFormat` instead:
```ts
const locale = i18n.getLocale();
new Intl.NumberFormat(locale, {
  style: 'currency',
  currency: currencyCode,  // "USD", "ILS", "EUR", etc.
}).format(amount);
// → "$9.99" (en-US), "9.99 ₪" (he-IL), "9,99 €" (de-DE)
```

For billing period units (DAY, WEEK, MONTH, YEAR) — these are server enums and must be translated, not displayed raw or lowercased. Add translation keys like `plans.perMonth`, `plans.perYear` and map the enum to the key.

### Best Practice: Move ALL Static Text to Translations

Every user-visible string should go through `t()` — not just nav labels. This includes:
- Page titles, subtitles, section headings
- Button labels, link text
- Form labels, placeholders
- Error messages, success messages, loading states
- Empty state text, confirmation dialogs
- Status labels, meta information
- **Directional arrows** (← →) — include them in the translation string so translators can flip direction for RTL languages
- **Server enum values** (status codes like PAID, FULFILLED, Active, In Progress) — map to translation keys rather than displaying raw English enums

Organize keys by page or component using nested groups in `translations.json`.

### RTL Support

Set the `dir` attribute dynamically on `<html>` based on the current language:
```astro
const lang = i18n.getLanguage();
const dir = ['he', 'ar'].includes(lang) ? 'rtl' : 'ltr';
---
<html lang={i18n.getLocale()} dir={dir}>
```

Key RTL guidelines:
- Use CSS logical properties (`margin-inline-start`, `padding-inline-end`, `inset-inline-end`, `border-inline-start`, `text-align: start`) instead of physical (`margin-left`, `right`, `border-left`, `text-align: left`)
- **Directional arrows** in translation strings should flip character but keep position: EN `"text →"` becomes HE `"text ←"`, EN `"← text"` becomes HE `"→ text"`
- Dropdown menus positioned with `right: 0` should use `inset-inline-end: 0`
- Submenus opening to the right (`left: 100%`) should detect RTL and use `right: 100%` instead
- The `dir="rtl"` attribute automatically reverses flexbox order, text alignment, and table layout — leverage this rather than adding manual overrides
- Use `i18n.getLocale()` instead of hardcoded `'en-US'` for date formatting (`toLocaleDateString`)

### Language & Locale Helpers

- `i18n.getLanguage()` — returns 2-letter code: `"en"`, `"ja"`
- `i18n.getLocale()` — returns IETF tag: `"en-US"`, `"ja-JP"`

---

## Dynamic Content Translation (Business Data)

Dynamic content (products, services, staff, blog posts, CMS collections, etc.) is translated via the **Translation Content API**. The full workflow to translate everything:

### Step 1: List All Translation Schemas

**CRITICAL — RESPONSE TRUNCATION**: The `GET /translation-schema/v1/schemas/site` endpoint often returns very large responses (100KB+) that get truncated by MCP. You MUST NOT assume you have all schemas from a single call. Instead, use a two-phase approach:

**Phase 1: Discover all schema IDs (shallow list)**

Query schemas by known appId to get manageable responses. Key Wix appIds:
- `1380b703-ce81-ff05-f115-39571d94dfcd` — **Wix Stores / eCommerce** (checkout emails, checkout settings, delivery profiles)
- `215238eb-22a5-4c36-9e7b-e7c08025e04e` — **Wix Stores Catalog V3** (Products, Info Sections, Inventory/preorder, Customizations/options, Ribbons, Brands)
- `13d21c63-b5ec-5912-8397-c3a5ddb27a97` — **Wix Bookings** (Services, Staff/Resources, Categories, Booking policies, Pricing options)
- `14bcded7-0066-7c35-14d7-466cb3f09103` — **Wix Blog** (Posts, Blog settings)
- `1522827f-c56c-a5c9-2ac9-00f9e6ae12d3` — **Wix Pricing Plans** (Plan names, descriptions, benefits)
- `00000000-0000-0000-0000-000000000013` — **Wix Platform** (Site Pages, Menus, UI components: Text, Button, Image, etc.)
- `14bca956-e09f-f4d6-14d7-466cb3f09103` — **Wix Payments** (Offline payment methods)
- `14cc59bc-f0b7-15b8-e1c7-89ce41d0e0c9` — **Wix Contacts/CRM** (Custom Fields)
- `14ce1214-b278-a7e4-1373-00cebd1bef7c` — **Wix Forms** (Booking form, contact form field labels)

**IMPORTANT — V1 vs V3 duplication**: Wix Stores has BOTH V1 and V3 translation schemas under different appIds. V3 (`215238eb-...`) has product name + richContent description. V1 has a separate schema (under the Platform appId `00000000-...`) with product name, plain-text description, AND detailed additional info sections (Care Instructions, Specifications, Sizing, Ingredients, etc.), plus preorder messages and custom text field titles. **You MUST translate BOTH** — they serve different purposes in the Translation Manager.

Additionally, the following schemas are NOT discoverable by the known appIds above. They appear in the unfiltered schema list and MUST be found by querying EN content broadly or by extracting schema IDs from the full (potentially truncated) schema list:
- **Shipping Rules** — shipping rule names, option titles, delivery times
- **Product Options V1** — option titles (Size, Color, Potency) and choice descriptions
- **Product Ribbons V1** — ribbon titles (BEST SELLER, NEW, SALE, PRE-ORDER)
- **Store Collections V1** — collection names (All Products, Accessories, Apparel, Mission Gear)
- **Bookings Staff/Resources** — staff member names and descriptions (doctors, nurses)
- **Business Locations** — location names

**Strategy for finding ALL schemas — the `$nin` sweep (MANDATORY final step)**:

After translating all schemas discovered by appId, you MUST do a final verification sweep:

```http
POST https://www.wixapis.com/translation-content/v1/contents/query
Body: { "query": { "filter": { "locale": "en", "schemaId": { "$nin": ["<all-schema-ids-you-already-translated>"] } }, "paging": { "limit": 100 } } }
```

This catches schemas under unknown or unexpected appIds. In practice, several important schemas are NOT discoverable by known appIds:
- **Pricing Plans** — plan names, descriptions, pricing variant names (Monthly/Free), perks, terms & conditions. Schema is NOT under the expected Pricing Plans appId.
- **Blog Settings** — "All Posts" feed label
- **Shipping Options** — shipping option titles (e.g., "Free shipping")

These schemas only appear when querying content directly. If the `$nin` query returns ANY results, extract the new schemaIds, translate the content, add the new IDs to your `$nin` list, and repeat until the query returns empty. Only then is the translation complete.

**WARNING about schema ID accuracy**: When extracting schema IDs from truncated API responses (e.g., via an agent reading a saved file), IDs may be corrupted or incomplete. Always verify schema IDs by querying content for them — if a query returns empty for a schema you expect to have content, the ID may be wrong. Re-discover the correct ID by querying per-appId or via the `$nin` sweep.

```http
GET https://www.wixapis.com/translation-schema/v1/schemas/site?appId=<appId>
```

Also query CMS collections separately:
```http
GET https://www.wixapis.com/translation-schema/v1/schemas/site?scope=SITE
```

**Phase 2: For each schema, query content one schema at a time.**

This returns all schemas grouped by source app. Each schema defines translatable fields for a content type. Key schemas:
- **Wix Stores**: product names, descriptions, care instructions, sizes, ribbons, collection names
- **Wix Bookings**: service names/descriptions/taglines, staff names/descriptions, category names, booking policy names
- **Wix Blog**: post titles, blog settings
- **Wix eCommerce**: checkout settings, shipping rules, payment methods
- **Wix Platform**: page titles, menus, UI components (buttons, text, etc.)
- **Wix Forms**: contact field names
- **CMS collections**: custom collection fields (must be enabled from dashboard first)

**IMPORTANT — Do NOT skip any schema category.** All content types matter for a complete translation:
- Site Pages and Menus are just as important as CMS collections
- UI component text (buttons, labels, rich text) on the master page needs translation
- Contact custom fields, form labels, delivery region names, and payment method descriptions all need translation
- Even schemas that seem "system-level" (checkout emails, booking forms) contain user-visible text

### Step 2: For Each Schema, Query EN and Target-Language Content

**CRITICAL**: Do NOT query all content at once (`locale: "en"` without `schemaId`). This misses entries from some schemas. Always query per-schema, **one schema at a time**:

```http
POST https://www.wixapis.com/translation-content/v1/contents/query
Body: { "query": { "filter": { "locale": "en", "schemaId": "<schema-id>" }, "paging": { "limit": 100 } } }
```

```http
POST https://www.wixapis.com/translation-content/v1/contents/query
Body: { "query": { "filter": { "locale": "ja", "schemaId": "<schema-id>" }, "paging": { "limit": 100 } } }
```

Per-schema queries return small responses that work well with MCP (no truncation). Compare EN vs target-language entries by `entityId` to find missing entries. Also compare **field-by-field** within matching entries to find missing fields.

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

const languages = multilingual.listSupportedLanguages();
// Returns: [{ id, displayName, url, primary, resolutionMethod }, ...]
```

Each language object has `id`, `displayName`, `primary`, and `url`.

**IMPORTANT**: `url` is only populated **client-side** (in React components with `client:load`). In server-side Astro pages, `url` is `undefined`.

**Best practice**: Build the language switcher as a **React component** (`client:load`) so it can use `lang.url` directly — no manual URL building needed:

```tsx
import { multilingual } from "@wix/site";
import { i18n } from "@wix/essentials";

function LanguageSwitcher() {
  const currentLanguage = i18n.getLanguage();
  const languages = multilingual.listSupportedLanguages();

  return languages.map(lang => (
    <a key={lang.id} href={lang.url}>{lang.displayName}</a>
  ));
}
```

This eliminates all manual URL parsing (stripping locale prefixes, building subdirectory paths). The SDK handles it correctly for all URL structures (subdirectory, subdomain, query param).

### Locale-Aware Links in Astro Pages

Use `getRelativeLocaleUrl(path)` from `wix:astro:i18n` to build links that include the current locale prefix:
```ts
import { getRelativeLocaleUrl } from 'wix:astro:i18n';

const href = getRelativeLocaleUrl('/bookings'); // "/bookings" or "/ja/bookings"
```

**IMPORTANT**: `Astro.url.pathname` does NOT include the locale prefix — it's always the base path (e.g., `/bookings`, never `/ja/bookings`). When matching active nav links, compare `Astro.url.pathname` against the raw path, not the localized href:
```ts
const links = [
  { href: getRelativeLocaleUrl('/bookings'), path: '/bookings', label: '...' },
];
// Active check: currentPath === link.path (NOT link.href)
```

`getRelativeLocaleUrl` only works for the **current** locale — it doesn't accept a target locale parameter, so it can't be used for switching to a different language. Use the React `LanguageSwitcher` component for that.

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
- **Use MCP with per-schema queries (preferred)**: Always iterate schemas individually — (1) list schemas per-appId via MCP `GET /translation-schema/v1/schemas/site?appId=<appId>` for each known appId, plus `?scope=SITE` for CMS collections, (2) for each schema, query EN and target-language content via MCP with `schemaId` filter, (3) diff by `entityId` for missing entries, diff field-by-field for missing fields. Each per-schema response is small and won't hit MCP's ~54KB truncation limit. Do NOT query all content without a `schemaId` filter — it misses entries from some schemas.
- **Schema list truncation**: The full `GET /translation-schema/v1/schemas/site` response can be 100KB+ and WILL be truncated by MCP. Never rely on a single unfiltered call to discover all schemas. Always query by appId to get complete, manageable responses. If you only translate schemas you found in a truncated response, you WILL miss critical content (typically products, bookings staff, and other large schemas that appear later in the response).
- **Some entries need `parentEntityId`**: Schemas with `requireParentEntity: true` (like Rich Text components) need the `parentEntityId` field copied from the EN entry when creating the JA entry.
