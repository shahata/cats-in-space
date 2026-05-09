# Homepage, Navigation & Layout — Implementation Guidelines

## Layout (Layout.astro)

### Key Requirements

1. **RTL support** — set `dir` attribute dynamically on `<html>` based on language (`['he', 'ar'].includes(lang) ? 'rtl' : 'ltr'`)
2. **Locale on `<html>`** — use `i18n.getLocale()` for the `lang` attribute
3. **CartSidebar** — if the site has a cart-bearing flow, mount with `client:load`, but **scope to cart-bearing routes only** — don't render globally on every page. Compute a `showCart` boolean in `Layout.astro` from `Astro.url.pathname` and gate the component on it. Typical pattern: `const showCart = pathname.startsWith('/store') || pathname.startsWith('/restaurant/order')`. Mounting the sidebar on routes that have nothing to do with the cart (homepage, blog, member area) wastes a `client:load` hydration and clutters the DOM. The sidebar listens for global `"cart-updated"` events — see "Cart-Updated Event" below.
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

Use logical properties so layouts mirror correctly under RTL:

| Physical (breaks RTL) | Logical (correct) |
|---|---|
| `margin-left` | `margin-inline-start` |
| `margin-right` | `margin-inline-end` |
| `padding-left` | `padding-inline-start` |
| `text-align: left` | `text-align: start` |
| `right: 0` | `inset-inline-end: 0` |
| `border-left` | `border-inline-start` |

### Direction-aware glyphs (arrows, carets, chevrons)

Logical properties handle layout but NOT the glyph content itself. A `▸` caret on a flyout submenu points right on LTR (toward the child menu) — in RTL the child menu opens to the left, so the glyph should flip to `◂`.

Don't bake the character into the markup and reach for `transform: scaleX(-1)` to mirror it — the transform depends on `display: inline-block` and interacts awkwardly with text alignment. The cleaner pattern is to leave the span empty and use CSS `::before` with a direction-aware `content`:

```astro
<span class="submenu-caret" aria-hidden="true"></span>
```

```css
.submenu-caret::before { content: "\25B8"; }              /* ▸ LTR */
:global(html[dir="rtl"]) .submenu-caret::before {
  content: "\25C2";                                       /* ◂ RTL */
}
```

Inside a component's scoped styles, reach the root's `dir` attribute via `:global(html[dir="rtl"])`. `:dir(rtl)` as a pseudo-class works in most modern browsers but can interact unexpectedly with nested elements — the explicit `[dir="rtl"]` attribute selector is the reliable choice.

Same pattern applies to back/forward arrows, breadcrumb separators, nav carets — any glyph whose semantic direction should flip for RTL.

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

For active-link detection, compare `Astro.url.pathname` (which has no locale prefix) against the raw path, not the localized href:
```typescript
const isActive = currentPath === link.path || currentPath.startsWith(link.path + '/');
```

### Member Menu

See [AUTHENTICATION.md](AUTHENTICATION.md) for login/logout endpoints, `getCurrentMember` usage, and member profile fields.

Logout is POST — use `<form method="POST" action="/api/auth/logout">` with a submit button.

### Dropdown Behavior

Add a small delay (~150ms) before closing hover dropdowns to prevent flicker when the cursor moves between trigger and menu.

### Language Switcher

Mount the switcher with `client:only="react"`. The component is data-driven (`multilingual.listSupportedLanguages()` returns different data server- vs client-side) and purely client-interactive — skipping SSR avoids hydration mismatches.

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
const featured = (await items.query('MainCollection', {
  sort: [{ fieldName: 'score', order: 'DESC' }],
  paging: { limit: 3 },
})).items;
const team = (await items.query('TeamMembers', {
  paging: { limit: 6 },
})).items;
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

### Multi-Vertical Feature Directory

For a site with several Wix business features, the homepage should make those features discoverable in the first visit. Combine brand storytelling with real cards and metrics from the requested integrations, such as CMS, store, blog, events, bookings, donations, restaurant, and plans as applicable.

Avoid a homepage that only has a hero and generic marketing copy while the real functionality is hidden in navigation. The homepage should answer "what can I do here?" with direct, data-backed entry points:

- Featured CMS entities and stats.
- Featured products or categories.
- Upcoming events or bookable services.
- Recent blog posts with tags/metrics.
- Donation or membership CTA with real campaign/plan data.
- Restaurant ordering/reservation CTAs if those flows exist.

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
   - Each line item: image (`item.image` is a `wix:image://` string — pass it through `getImageUrl()`), name, selected options/variants, custom text, quantity controls (+/−, min 1), price, remove button
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
