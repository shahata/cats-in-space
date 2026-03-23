# Homepage, Navigation & Layout — Implementation Guidelines

## Layout (Layout.astro)

### Document Structure

```astro
---
import { i18n } from '@wix/essentials';
const t = i18n.getTranslationFunction();
const lang = i18n.getLanguage();
const locale = i18n.getLocale();
const dir = ['he', 'ar'].includes(lang) ? 'rtl' : 'ltr';
---
<html lang={locale} dir={dir}>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{t('site.title')}</title>
  <!-- Font preloads -->
</head>
<body>
  <Nav />
  <slot />
  <Footer />
  <CartSidebar client:load />
</body>
</html>
```

### Key Requirements

1. **RTL support** — set `dir` attribute dynamically based on language
2. **Locale on `<html>`** — use `i18n.getLocale()` for the `lang` attribute
3. **CartSidebar** — if the site has a store, render with `client:load` on every page; listens for global `"cart-updated"` events
4. **Font loading** — preload custom fonts

### CSS Variables

Define a consistent design token system. Use CSS variables for colors, fonts, and spacing so the theme is easy to change:

```css
:root {
  --bg-primary: /* site background */;
  --bg-card: /* card/surface background */;
  --border-card: /* card border color */;
  --text-primary: /* main text color */;
  --text-secondary: /* secondary text */;
  --text-muted: /* muted/hint text */;
  --accent: /* primary accent color */;
  --accent-secondary: /* secondary accent */;
  --font-title: /* display font */;
  --font-heading: /* heading font */;
  --font-body: /* body text font */;
}
```

### CSS Logical Properties

**CRITICAL for RTL:** Always use logical properties instead of physical:

| Physical (wrong for RTL) | Logical (correct) |
|---|---|
| `margin-left` | `margin-inline-start` |
| `margin-right` | `margin-inline-end` |
| `padding-left` | `padding-inline-start` |
| `text-align: left` | `text-align: start` |
| `right: 0` | `inset-inline-end: 0` |
| `border-left` | `border-inline-start` |

### Container Pattern

```css
.container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 1.5rem;
}
```

### Badge Classes

Define reusable badge styles for statuses used across pages:

```css
.badge { font-size: 0.7rem; padding: 0.2rem 0.6rem; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; }
.badge-green { background: rgba(76, 175, 80, 0.2); color: #4caf50; }
.badge-blue { background: rgba(33, 150, 243, 0.2); color: #2196f3; }
.badge-gold { background: rgba(255, 193, 7, 0.2); color: #ffc107; }
.badge-purple { background: rgba(156, 39, 176, 0.2); color: #ce93d8; }
.badge-pink { background: rgba(233, 30, 99, 0.15); color: #f48fb1; }
```

## Navigation (Nav.astro)

### Structure

Sticky top nav with: logo, main links, optional dropdown for grouped pages, member menu, language switcher.

```css
nav {
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(12px);
  background: rgba(var(--bg-primary-rgb), 0.85);
  border-bottom: 1px solid var(--border-card);
}
```

### Locale-Aware Links

Use `getRelativeLocaleUrl()` for ALL internal navigation links:

```typescript
import { getRelativeLocaleUrl } from 'wix:astro:i18n';

const links = [
  { href: getRelativeLocaleUrl('/'), path: '/', label: t('nav.home') },
  { href: getRelativeLocaleUrl('/blog'), path: '/blog', label: t('nav.blog') },
  { href: getRelativeLocaleUrl('/store'), path: '/store', label: t('nav.store') },
];
```

**CRITICAL:** `Astro.url.pathname` does NOT include the locale prefix. For active link detection, compare against the raw path, not the localized href:
```typescript
const currentPath = Astro.url.pathname;
const isActive = currentPath === link.path || currentPath.startsWith(link.path + '/');
```

### Dropdown for Grouped Pages

Group related pages under a dropdown menu when you have many nav items:

```html
<div class="dropdown">
  <button class="nav-link">{t('nav.explore')} ▾</button>
  <div class="dropdown-menu">
    <a href={getRelativeLocaleUrl('/page-a')}>{t('nav.pageA')}</a>
    <a href={getRelativeLocaleUrl('/page-b')}>{t('nav.pageB')}</a>
  </div>
</div>
```

### Member Menu

Detect login state server-side and show appropriate UI:

```astro
{memberName ? (
  <div class="member-menu">
    <img src={memberPhoto} alt="" class="avatar" />
    <span>{memberName}</span>
    <div class="member-dropdown">
      <a href="/member">{t('nav.myProfile')}</a>
      <form action="/api/auth/logout" method="POST">
        <button type="submit">{t('nav.logout')}</button>
      </form>
    </div>
  </div>
) : (
  <a href="/api/auth/login">{t('nav.login')}</a>
)}
```

**CRITICAL:** Logout is a POST endpoint — always use a `<form>` with `method="POST"`, never an `<a>` link.

### Mobile Hamburger Menu

Show at a breakpoint (e.g., ≤960px) with smooth animation:

```css
.hamburger { display: none; }
@media (max-width: 960px) {
  .hamburger { display: flex; }
  .nav-links { display: none; }
  .nav-links.open { display: flex; flex-direction: column; }
}
```

### Dropdown Timeout

Add a small delay before closing dropdowns to prevent flicker:

```javascript
let closeTimeout;
dropdown.addEventListener('mouseleave', () => {
  closeTimeout = setTimeout(() => menu.style.display = 'none', 150);
});
dropdown.addEventListener('mouseenter', () => clearTimeout(closeTimeout));
```

### Language Switcher

Build as a React `client:load` component (not Astro) because `lang.url` is only populated client-side:

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

Include two variants: dropdown (desktop nav) and standalone (mobile nav).

## Homepage

### Data Fetching

Pull featured content from multiple sources (CMS collections, blog, products, etc.):

```astro
---
const featured = (await items.query('MainCollection').descending('score').limit(3).find()).items;
const team = (await items.query('TeamMembers').limit(6).find()).items;
const events = (await items.query('Events').limit(4).find()).items;
---
```

### Section Structure

A good homepage combines sections that showcase the site's key content areas:

1. **Hero section** — large background image, headline, subtitle, CTA buttons
2. **Stats grid** — key numbers at a glance (counts, metrics)
3. **Featured content** — top items from a primary collection (alternating image/text layout works well)
4. **Secondary collection** — grid of items from another collection
5. **Timeline/activity** — recent or upcoming events, milestones
6. **Social proof** — quote, testimonial, or trust badges

Optional: **Scrolling ticker/banner** for announcements (CSS animation, not JS).

### Hero Section

```css
.hero {
  min-height: 80vh;
  background-size: cover;
  background-position: center;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  position: relative;
}
.hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
}
```

### Stats Grid

```css
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 1rem;
}
.stat-card { text-align: center; }
.stat-number { font-size: clamp(2rem, 5vw, 3.5rem); font-family: var(--font-heading); }
```

### Alternating Feature Cards

For featured items, alternate image left/right:

```css
.feature-card { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; align-items: center; }
.feature-card:nth-child(even) .feature-image { order: 2; }
```

### Responsive Typography

Use `clamp()` for fluid sizing:

```css
.hero-title { font-size: clamp(2.5rem, 7vw, 5rem); }
.section-title { font-size: clamp(1.5rem, 4vw, 2.5rem); }
```

## Cart Sidebar

Only needed when the site has a store. Renders globally in the layout.

### Global Event Pattern

Any component that modifies the cart must dispatch:
```typescript
window.dispatchEvent(new CustomEvent('cart-updated'));
```

The CartSidebar listens for this event to refresh:
```typescript
useEffect(() => {
  const handler = () => loadCart();
  window.addEventListener('cart-updated', handler);
  return () => window.removeEventListener('cart-updated', handler);
}, []);
```

### Cart Badge

Fixed button showing item count:

```css
.cart-badge {
  position: fixed;
  inset-block-end: 1.5rem;
  inset-inline-end: 1.5rem;
  z-index: 999;
  border-radius: 50%;
  width: 56px; height: 56px;
}
```

### Sidebar Panel

Slides in from the inline-end side (right in LTR, left in RTL):

```css
.cart-panel {
  position: fixed;
  inset-block-start: 0;
  inset-inline-end: 0;
  width: 380px;
  height: 100vh;
  z-index: 1000;
  transition: transform 0.3s;
}
```

### Cart Item Display

Each line item shows:
- Product image (with fallback if none)
- Product name
- Selected options (variant choices, custom text)
- Quantity controls (+/− buttons, min 1)
- Line item price
- Remove button

### Cart Totals

Display subtotal, discount (if any), and estimated total:

```typescript
const totals = await currentCart.estimateCurrentCartTotals({});
// totals.priceSummary.subtotal, totals.priceSummary.discount, totals.priceSummary.total
```

## Footer

Keep it simple:
- Copyright with dynamic year: `t('footer.copyright', { year: new Date().getFullYear().toString() })`
- Tagline or site description
- Centered layout, top border

## General CSS Patterns

### Hover Effects

Consistent across the site:
```css
.card { transition: transform 0.2s, box-shadow 0.2s; }
.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}
```

### Card Base Style

```css
.card {
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  border-radius: 12px;
  padding: 1.5rem;
  transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
}
.card:hover { border-color: var(--accent); }
```

### Responsive Breakpoints

- `960px` — nav switches to hamburger
- `768px` — grids collapse to single column, 2-column layouts stack
- `640px` — smaller grids collapse
