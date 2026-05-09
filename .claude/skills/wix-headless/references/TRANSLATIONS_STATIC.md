# Static Translations (UI Strings)

Covers the `translations.json` + `t()` function system for translating navigation labels, button text, headings, form labels, and all other user-visible static text.

For translating dynamic business content (products, services, blog posts), see [TRANSLATIONS_CONTENT_API.md](TRANSLATIONS_CONTENT_API.md).

---

## Setup

### 1. Install the Wix Multilingual App

Install from the Wix dashboard manually. There is no known `appDefId` for API-based installation.

### 2. Enable Multilingual Mode

```http
POST https://www.wixapis.com/locale-settings/v2/settings/mode
Body: { "multilingualModeEnabled": true }
```

### 3. Create a Secondary Locale

```http
POST https://www.wixapis.com/locales/v2/locale
Body: { "locale": { "languageCode": "ja", "visibility": "VISIBLE", "flag": "JPN", "regionalFormat": "ja-JP" } }
```

### 4. URL Structure

SUBDIRECTORY by default: `/ja/...`, `/fr/...`. Primary language has no prefix.

---

## File Structure

- **English keys**: `src/translations.json` — flat dot-notation key-value pairs
- **Secondary translations**: `.wix/multilingual/translations/ja.json` (same structure)
- **Metadata**: `.wix/multilingual/metadata.json` — `{"primaryLanguageCode": "en"}`

⛔ **Breaks at runtime** — Translations MUST use flat dot-notation keys. Nested objects like `{ "nav": { "home": "Home" } }` silently fail — i18next treats top-level keys as namespaces instead of key groups, so `t('nav.home')` returns the raw key string with no error.

Example `src/translations.json`:
```json
{
  "nav.home": "Home",
  "nav.shop": "Shop",
  "nav.missions": "Missions",
  "common.addToCart": "Add to Cart",
  "common.bookNow": "Book Now"
}
```

Example `.wix/multilingual/translations/ja.json`:
```json
{
  "nav.home": "ホーム",
  "nav.shop": "ショップ",
  "nav.missions": "ミッション",
  "common.addToCart": "カートに追加",
  "common.bookNow": "今すぐ予約"
}
```

## Astro Config

```js
wix({ essentials: true, translations: true })
```

⛔ **Breaks at runtime** — Without these flags, `i18n.getTranslationFunction()` throws `"Host translation resources are not available"`. → Add both `essentials: true` and `translations: true`.

**Required files for build** (missing any = misleading build errors):
1. `src/translations.json`
2. `.wix/multilingual/metadata.json` — `{"primaryLanguageCode": "en"}`
3. `.wix/multilingual/translations/` — directory must exist (can be empty)

## Git: Commit `.wix/multilingual/`

The scaffold gitignores `.wix/` entirely. → Add `!.wix/multilingual/` to `.gitignore`:
```gitignore
.wix/
!.wix/multilingual/
```

Without this, collaborators and CI get build failures after a fresh clone.

## Push & Pull

- **Push keys to dashboard**: `npm run wix translation push` (requires interactive TTY)
- **Pull translations from dashboard**: `npm run wix translation pull`

---

## Adding a New Translation Key

When you add any new `t('foo.bar')` call, two things must happen or the site will render raw key paths to real visitors:

1. **Add the key to `src/translations.json`** (English / primary language source).
2. **Add the key to EVERY locale file** under `.wix/multilingual/translations/*.json`. Missing keys in a locale file render as the raw key path (e.g. `"research.pageTitle"`) to visitors browsing in that language — they do NOT fall back to the primary language.
3. **Restart the dev server.** Translations are loaded once during `astro:config:setup` and baked into a Vite `define` constant (`__WIX_ASTRO_I18N__`). The dev server does NOT hot-reload translation files. If a new key still renders as a raw key path after adding it, you forgot to restart.

After multi-file edits, validate JSON syntax with `node -e "JSON.parse(require('fs').readFileSync('<file>','utf8'))"` to catch mismatched braces before build.

---

## Using `t()` in Code

Works in both Astro pages (server-side) and React components (`client:load`).

**In Astro pages:**
```astro
---
import { i18n } from '@wix/essentials';
const t = i18n.getTranslationFunction();
---
<h1>{t('home.title')}</h1>
```

**In React components:**
```tsx
import { i18n } from "@wix/essentials";

export default function MyComponent() {
  const t = i18n.getTranslationFunction();
  return <h1>{t('home.title')}</h1>;
}
```

⛔ **Breaks at runtime** — Call `getTranslationFunction()` inside the component function, not at module level. It relies on per-request context. → Move the call inside the function body.

⛔ **Breaks at runtime** — Requires `@wix/essentials` >= 1.0.6. The scaffold ships 0.x which doesn't have this function. → Run `npm install @wix/essentials@latest` and restart dev server.

---

## Interpolation

Uses **i18next** under the hood. Placeholders use **double curly braces** `{{variable}}`.

```json
{ "greeting": "Hello {{name}}!", "trialDays": "{{days}}-day free trial" }
```
```ts
t('greeting', { name: 'Whiskers' })   // → "Hello Whiskers!"
t('trialDays', { days: '7' })         // → "7-day free trial"
```

⛔ **Breaks at runtime** — Do NOT use `.replace('{var}', value)`. → Use `t('key', { var: value })` instead. `.replace()` breaks when translation word order changes across languages.

Use `{{double braces}}` for interpolation — single `{braces}` render literally.

---

## Currency and Number Formatting

See [SDK_CORE.md → Price Formatting](SDK_CORE.md#price-formatting) for the canonical pattern (`Intl.NumberFormat(locale, { style: 'currency', currency })` with `locale = i18n.getLocale()`). Map billing-period enums (DAY, WEEK, MONTH, YEAR) to translation keys (`plans.perMonth`) instead of rendering them raw.

---

## What to Translate

Every user-visible string should go through `t()`:
- Page titles, subtitles, section headings, button labels, link text
- Form labels, placeholders, error/success messages, loading states
- Empty state text, confirmation dialogs, status labels
- **Directional arrows** (← →) — include in translation strings so translators can flip for RTL
- **Server enum values** (PAID, FULFILLED) — map to translation keys, don't display raw English

Organize keys by page/component using nested groups.

---

## Never use translatable SDK fields as identifiers

⛔ **Breaks at runtime under translation** — `name`, `title`, `displayName`, `description` and similar human-readable fields on Wix SDK objects (products, options, choices, modifiers, services, plans, restaurant items, CMS rows, …) are rewritten by the Multilingual API. If you key React state, lookup maps, React `key={}`, or `find(x => x.name === ...)` predicates by these fields, the feature silently breaks once a visitor switches locale.

→ Use the locale-invariant ID instead: `_id`, `key`, `choiceId`, or `slug`. Render `name`/`title` only in the JSX text content. See [ECOMMERCE_V3.md → "Translatable fields are display-only"](ECOMMERCE_V3.md#translatable-fields-are-display-only--never-use-them-as-identifiers) for the full audit checklist and the variant-matching trap (`optionChoiceIds` vs `optionChoiceNames`).

---

## RTL Support

```astro
const lang = i18n.getLanguage();
const dir = ['he', 'ar'].includes(lang) ? 'rtl' : 'ltr';
---
<html lang={i18n.getLocale()} dir={dir}>
```

Key guidelines:
- Use CSS logical properties (`margin-inline-start`, `text-align: start`, `inset-inline-end`) instead of physical (`margin-left`, `text-align: left`, `right`)
- Directional arrows in translations: EN `"text →"` → HE `"text ←"`
- `dir="rtl"` auto-reverses flexbox, text alignment, table layout — leverage this
- Use `i18n.getLocale()` for date formatting, not hardcoded `'en-US'`

## Language & Locale Helpers

- `i18n.getLanguage()` → 2-letter code: `"en"`, `"ja"`
- `i18n.getLocale()` → IETF tag: `"en-US"`, `"ja-JP"`

---

## Language Switcher

⚠️ **Common mistake** — `lang.url` is only populated client-side. In Astro server pages it's `undefined`. → Build as a React `client:load` component:

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

## Locale-Aware Links

Use `getRelativeLocaleUrl(path)` from `wix:astro:i18n` for internal links:
```ts
import { getRelativeLocaleUrl } from 'wix:astro:i18n';
const href = getRelativeLocaleUrl('/bookings'); // "/bookings" or "/ja/bookings"
```

⚠️ **Common mistake** — `Astro.url.pathname` does NOT include the locale prefix. → Compare against the raw path for active link detection, not the localized href.
