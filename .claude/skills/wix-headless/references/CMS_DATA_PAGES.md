# CMS Data Pages — Listing & Detail Implementation Guidelines

## Overview

CMS data pages display content from Wix CMS collections. A good implementation follows a consistent pattern: listing page with cards + detail page with full content. This applies to any custom collection (team members, locations, events, projects, etc.).

## Listing Page Guidelines

### Data Fetching

Fetch all items server-side in Astro frontmatter with sorting:

```astro
---
import { items } from '@wix/data';
import { i18n } from '@wix/essentials';
import { getImageUrl } from '../../utils/image';

const t = i18n.getTranslationFunction();
const result = await items.query('MyCollection').descending('score').find();
const allItems = result.items;
---
```

- **Sort server-side** using `.descending()` or `.ascending()` — avoid client-side sorting when possible
- **Use `.include()`** for referenced collections (e.g., `.include('locationRef', 'teamMembers')` to fetch related items in one query)
- **No pagination needed** for small datasets — for large datasets, implement cursor-based paging

### Card Layout

Use a responsive auto-fill grid:

```css
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
}

@media (max-width: 768px) {
  .grid { grid-template-columns: 1fr; }
}
```

### What Every Listing Card Must Include

1. **Visual element** — image from CMS or a styled fallback (gradient, icon, or placeholder)
2. **Title** — item name, linked to detail page
3. **Status badge** — color-coded indicator when items have status/state
4. **Key metadata** — 2-3 important fields displayed compactly
5. **Brief description** — truncated to ~120 characters
6. **Distinguishing detail** — tag, role label, rank number — something that differentiates each card

### Status Badge Pattern

Map status values to color classes:

```typescript
function getStatusBadge(status: string): string {
  const map: Record<string, string> = {
    'Active': 'badge-green',
    'In Progress': 'badge-blue',
    'Completed': 'badge-gold',
    'Pending': 'badge-purple',
  };
  return map[status] || 'badge-default';
}
```

### Image Fallback Pattern

Always handle missing images — never show broken image icons:

```astro
{imageUrl ? (
  <img src={imageUrl} alt={item.title} />
) : (
  <div class="placeholder">{fallbackIcon}</div>
)}
```

For items with categories/roles, map to contextual fallback icons or initials.

### Ranking Display

When items have a score/ranking, show rank badges:

```astro
{allItems.map((item, i) => (
  <div class="card">
    <span class="rank">#{i + 1}</span>
    <!-- card content -->
  </div>
))}
```

### Score/Progress Bars

For numeric scores (ratings, completion %, etc.), display as a visual progress bar:

```html
<div class="score-bar">
  <div class="score-fill" style={`width: ${score}%`}></div>
  <span class="score-label">{score}%</span>
</div>
```

### Links

Every card must link to its detail page using the item's slug:

```astro
<a href={`/collection-name/${item.slug}`} class="card">
```

Use `getRelativeLocaleUrl()` for multilingual sites:
```typescript
import { getRelativeLocaleUrl } from 'wix:astro:i18n';
const href = getRelativeLocaleUrl(`/collection-name/${item.slug}`);
```

## Detail Page Guidelines

### Data Fetching

Query by slug, redirect on 404, and fetch related data:

```astro
---
const { slug } = Astro.params;
const result = await items.query('MyCollection').eq('slug', slug).find();
if (result.items.length === 0) return Astro.redirect('/collection-name');
const item = result.items[0];

// Fetch related items from other collections
const related = await items.query('RelatedCollection').eq('parentField', item.title).find();
---
```

### Page Structure

Use a two-column layout (main content + sidebar):

```css
.detail-grid {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 2rem;
  align-items: start;
}

@media (max-width: 768px) {
  .detail-grid { grid-template-columns: 1fr; }
}
```

### What Every Detail Page Must Include

1. **Back link** — navigation back to listing page
2. **Hero section** — large image/visual, title, status badge
3. **Full description** — untruncated content
4. **Metadata card** — sidebar with structured key-value pairs (stats, dates, attributes)
5. **Related items** — links to connected entities from other collections

### Back Navigation

```astro
<a href={getRelativeLocaleUrl('/collection-name')} class="back-link">
  {t('collection.backToAll')}
</a>
```

### Metadata/Stats Card

Display structured data in labeled rows:

```html
<div class="stats-card">
  <h3>{t('item.details')}</h3>
  <div class="stat-row">
    <span class="stat-label">{t('item.field1')}</span>
    <span class="stat-value">{item.field1}</span>
  </div>
  <!-- more rows -->
</div>
```

### Related Items Section

Show related entities as clickable mini-cards:

```astro
{relatedItems.length > 0 && (
  <section>
    <h3>{t('item.related')}</h3>
    {relatedItems.map(r => (
      <a href={getRelativeLocaleUrl(`/related/${r.slug}`)} class="related-card">
        <span class={getStatusBadge(r.status)}>{r.status}</span>
        <span>{r.title}</span>
      </a>
    ))}
  </section>
)}
```

### Cross-Entity Linking

When entities reference each other, create bidirectional links. For example:
- **Event detail** links to venue detail AND speaker profiles
- **Venue detail** links to upcoming events at that venue
- **Speaker detail** links to events they're presenting at

Display referenced entities with visual previews (small circular images, fallback icons).

### Avatar Stack Pattern (Overlapping Avatars)

For showing multiple people compactly (e.g., team members assigned to a project):

```css
.avatar-stack { display: flex; }
.avatar-stack a {
  width: 30px; height: 30px;
  border-radius: 50%;
  margin-inline-end: -6px;
  border: 2px solid var(--bg-card);
  transition: transform 0.2s;
}
.avatar-stack a:hover { transform: scale(1.3); z-index: 1; }
```

## Translations

- **All user-visible text** must use `t()` — page titles, subtitles, labels, metadata labels, empty states
- **Status values** from CMS are English strings — map them to translation keys rather than displaying raw values
- **Units and abbreviations** must be translation keys, not hardcoded
- **Back links** should use translated text with directional arrows in the translation string (flips for RTL)

## Common Patterns

### Client-Side Filtering

For listing pages with categories/tags, implement client-side filtering:

```html
<script>
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;
      document.querySelectorAll('.card').forEach(card => {
        card.style.display = (!filter || card.dataset.category === filter) ? '' : 'none';
      });
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
</script>
```

Preserve filter state in URL query params so it survives page reload.

### Custom Sort Order

When items have status/priority that doesn't sort alphabetically, define a custom order:

```typescript
const statusOrder = ['In Progress', 'Upcoming', 'Planned', 'Completed'];
items.sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));
```

### Timeline Layout

For chronological items (events, milestones), use a vertical timeline:

```css
.timeline { position: relative; padding-inline-start: 2rem; }
.timeline::before {
  content: '';
  position: absolute;
  inset-inline-start: 0;
  top: 0; bottom: 0;
  width: 2px;
  background: var(--accent);
}
.timeline-item::before {
  content: '';
  position: absolute;
  inset-inline-start: -2rem;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: var(--accent);
}
```
