# Homepage, Navigation & Layout — Implementation Guidelines

## Layout (Layout.astro)

### Key Requirements

1. **RTL support** — set `dir` attribute dynamically on `<html>` based on language (`['he', 'ar'].includes(lang) ? 'rtl' : 'ltr'`)
2. **Locale on `<html>`** — use `i18n.getLocale()` for the `lang` attribute
3. **CartSidebar** — if the site has a store, render with `client:load` on every page; listens for global `"cart-updated"` events
4. **Translated title** — page `<title>` must come from translations

```astro
---
import { i18n } from '@wix/essentials';
const t = i18n.getTranslationFunction();
const lang = i18n.getLanguage();
const locale = i18n.getLocale();
const dir = ['he', 'ar'].includes(lang) ? 'rtl' : 'ltr';
---
<html lang={locale} dir={dir}>
```

### CSS Logical Properties

⛔ **Breaks at runtime** — Physical CSS properties produce mirrored/broken layouts in RTL locales. Always use logical properties:

| Physical (breaks RTL) | Logical (correct) |
|---|---|
| `margin-left` | `margin-inline-start` |
| `margin-right` | `margin-inline-end` |
| `padding-left` | `padding-inline-start` |
| `text-align: left` | `text-align: start` |
| `right: 0` | `inset-inline-end: 0` |
| `border-left` | `border-inline-start` |

### Design Tokens

Define colors, fonts, and spacing as CSS variables so the theme is easy to change site-wide. Use semantic names (`--bg-primary`, `--accent`, `--text-muted`) rather than literal values.

## Navigation

### Required Functionality

1. **Sticky positioning** with backdrop blur
2. **Main links** — all pages the site offers (home, blog, store, bookings, plans, etc.)
3. **Dropdown grouping** — group related pages under a single dropdown when you have many nav items
4. **Member menu** — detect login state server-side (`getCurrentMember`), show profile link + logout form when logged in, login link when not
5. **Language switcher** — if multilingual is enabled
6. **Mobile hamburger menu** — collapses nav links behind a toggle at smaller viewports

### Locale-Aware Links

Use `getRelativeLocaleUrl()` for ALL internal navigation links:

```typescript
import { getRelativeLocaleUrl } from 'wix:astro:i18n';
const links = [
  { href: getRelativeLocaleUrl('/'), path: '/', label: t('nav.home') },
  { href: getRelativeLocaleUrl('/blog'), path: '/blog', label: t('nav.blog') },
];
```

⚠️ **Common mistake** — `Astro.url.pathname` does NOT include the locale prefix, so comparing it to localized hrefs will never match. → Compare against the raw path for active link detection:
```typescript
const isActive = currentPath === link.path || currentPath.startsWith(link.path + '/');
```

### Member Menu

See [AUTHENTICATION.md](AUTHENTICATION.md) for login/logout endpoints, `getCurrentMember` usage, and member profile fields.

⚠️ **Common mistake** — Logout is a POST endpoint; using an `<a>` link sends a GET which silently does nothing. → Use `<form method="POST" action="/api/auth/logout">` with a submit button.

### Dropdown Behavior

Add a small delay (~150ms) before closing hover dropdowns to prevent flicker when the cursor moves between trigger and menu.

### Language Switcher

Build as a React component and mount it with **`client:only="react"`** (NOT `client:load`). The switcher calls `multilingual.listSupportedLanguages()` which returns different data on the server (empty or partial) than on the client (the site's full language list). If Astro SSRs the component with `client:load`, the server-rendered HTML will mismatch what React builds at hydration, and React 18 throws:

```
Warning: Expected server HTML to contain a matching <div> in <astro-island>.
Uncaught Error: Hydration failed because the initial UI does not match what was rendered on the server.
```

`client:only` skips SSR for this island entirely — the switcher renders blank on the server and React takes over on mount. That's the right trade-off here because the component is purely client-interactive (dropdown open/close) and its data isn't available at SSR time anyway.

```astro
<LanguageSwitcher variant="dropdown" client:only="react" />
```

The component itself:

```tsx
import { multilingual } from "@wix/site";
import { i18n } from "@wix/essentials";

function LanguageSwitcher() {
  const currentLanguage = i18n.getLanguage();
  const languages = multilingual.listSupportedLanguages();
  return languages.map(lang => (
    <a key={lang.id} href={lang.url}
       className={lang.id === currentLanguage ? 'active' : ''}>
      {flagEmoji(lang.id)} {lang.displayName}
    </a>
  ));
}
```

Provide two variants: one for desktop nav (dropdown) and one for mobile nav (inline list).

## Homepage

### Data Fetching

Pull featured content from multiple sources (CMS collections, blog posts, products, etc.):

```astro
---
const featured = (await items.query('MainCollection').descending('score').limit(3).find()).items;
const team = (await items.query('TeamMembers').limit(6).find()).items;
---
```

### Recommended Sections

A good homepage combines sections that showcase the site's key content areas:

1. **Hero** — background image, headline, subtitle, CTA buttons linking to key pages
2. **Stats** — key numbers at a glance (entity counts, metrics)
3. **Featured content** — top items from a primary collection
4. **Secondary content** — grid of items from another collection
5. **Recent activity** — timeline or list of recent/upcoming items
6. **Social proof** — quote, testimonial, or trust indicator

Optional: **Scrolling ticker/banner** for announcements.

Each section should link to its full listing page ("View all products", "See all team members", etc.).

## Cart Sidebar

Only needed when the site has a store. Renders globally in the layout.

### Global Event Pattern

Any component that modifies the cart must dispatch:
```typescript
window.dispatchEvent(new CustomEvent('cart-updated'));
```

The CartSidebar listens for this event to refresh its data.

### Required Functionality

1. **Badge/trigger** — fixed button showing cart item count, always visible
2. **Slide-out panel** with:
   - Each line item: image (⛔ **Breaks at runtime** — `item.image` is a `wix:image://` string, not a URL; use `getImageUrl(item.image)` to get a renderable src), name, selected options/variants, custom text, quantity controls (+/−, min 1), price, remove button
   - Totals: subtotal, discount (if any), estimated total via `estimateCurrentCartTotals()`
   - Checkout button → creates checkout session and redirects to Wix-hosted checkout
3. **Empty state** — message + link to store when cart is empty

### Cart Totals

```typescript
const totals = await currentCart.estimateCurrentCartTotals({});
// totals.priceSummary.subtotal, totals.priceSummary.discount, totals.priceSummary.total
```

## Footer

- Copyright with dynamic year via translation interpolation: `t('footer.copyright', { year: new Date().getFullYear().toString() })`
- Tagline or site description
- All text translated
