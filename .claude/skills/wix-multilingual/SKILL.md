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

Dynamic content (products, services, staff, blog posts, etc.) is translated via the **Translation Content API**.

### Query Existing Content (English)

```http
POST https://www.wixapis.com/translation-content/v1/contents/query
Content-Type: application/json
Authorization: <site auth>

{
  "query": {
    "filter": {
      "locale": "en"
    },
    "paging": {
      "limit": 50
    }
  }
}
```

### Content Structure

Each entry returned has:

```json
{
  "schemaId": "stores/product",
  "entityId": "abc123-...",
  "locale": "en",
  "fields": {
    "name": {
      "textValue": "Space Cat Helmet",
      "published": true,
      "updatedBy": "USER"
    },
    "description": {
      "textValue": "A helmet for cats in space.",
      "published": true,
      "updatedBy": "USER"
    }
  }
}
```

### Bulk Create Translations

```http
POST https://www.wixapis.com/translation-content/v1/bulk/contents/create
Content-Type: application/json
Authorization: <site auth>

{
  "contents": [
    {
      "schemaId": "stores/product",
      "entityId": "abc123-...",
      "locale": "ja",
      "fields": {
        "name": {
          "textValue": "宇宙猫ヘルメット",
          "published": true,
          "updatedBy": "USER"
        },
        "description": {
          "textValue": "宇宙の猫用ヘルメット。",
          "published": true,
          "updatedBy": "USER"
        }
      }
    }
  ],
  "returnEntity": false
}
```

Each translated entry must have:
- Same `schemaId` and `entityId` as the English original
- Target `locale` (e.g., `"ja"`)
- `fields` with translated `textValue`, `published: true`, `updatedBy: "USER"`

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
