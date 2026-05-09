# CMS Data Pages — Listing & Detail Implementation Guidelines

## Overview

CMS data pages display content from Wix CMS collections. A good implementation follows a consistent pattern: listing page with cards + detail page with full content. This applies to any custom collection (team members, locations, events, projects, etc.).

The CMS / Wix Data app must be installed before any `/wix-data/v2/*` call works — see [SDK_CORE.md → CMS Collections](SDK_CORE.md#install-the-cms-app) for the install instructions and collection-creation REST API.

## Listing Page

### Data Fetching

Fetch all items server-side in Astro frontmatter:

```astro
---
import { items } from '@wix/data';
import { i18n } from '@wix/essentials';
import { getImageUrl } from '../../utils/image';

const t = i18n.getTranslationFunction();
const result = await items.query('MyCollection', {
  sort: [{ fieldName: 'score', order: 'DESC' }],
});
const allItems = result.items;
---
```

- **Sort server-side** using `sort: [{ fieldName, order: 'ASC' | 'DESC' }]` — avoid client-side sorting when possible
- **Use `includeReferences`** for referenced collections (e.g., `{ includeReferences: [{ field: 'locationRef' }, { field: 'teamMembers' }] }` as the direct query options)
- **No pagination needed** for small datasets — for large datasets, implement cursor-based paging

### What Every Listing Card Must Show

1. **Image** — from CMS, or a styled fallback. Never show broken image icons — always handle missing images
2. **Title** — linked to detail page via slug
3. **Status badge** — color-coded when items have a status field. Map CMS status strings to badge classes
4. **Key metadata** — 2-3 important fields (dates, numbers, categories)
5. **Brief description** — truncated to ~120 characters
6. **Distinguishing detail** — tag, role label, rank number — something that differentiates each card

### Image Fallbacks

For items with categories or roles, map to contextual fallback icons or initials when no image is available.

### Ranking

When items have a score, show their rank number (index + 1). For numeric scores (ratings, completion %), show a visual progress indicator.

### Links

Every card must link to its detail page using the item's slug. Use `getRelativeLocaleUrl()` for multilingual sites:

```typescript
import { getRelativeLocaleUrl } from 'wix:astro:i18n';
const href = getRelativeLocaleUrl(`/collection-name/${item.slug}`);
```

### Client-Side Filtering

For listing pages with categories or tags:
- Show filter buttons (one per category, plus "All")
- Filter cards by toggling visibility based on `data-*` attributes
- Preserve filter state in URL query params (`?category=xyz`) so it survives page reload
- Track which filter button is active

### Custom Sort Order

When items have status/priority that doesn't sort alphabetically, define a custom order:

```typescript
const statusOrder = ['In Progress', 'Upcoming', 'Planned', 'Completed'];
items.sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));
```

## Detail Page

### Data Fetching

Query by slug, redirect on 404, and fetch related data:

```astro
---
const { slug } = Astro.params;
if (!slug) return Astro.redirect('/collection-name');
const result = await items.query('MyCollection', {
  filter: { slug },
  paging: { limit: 1 },
});
if (result.items.length === 0) return Astro.redirect('/collection-name');
const item = result.items[0];

// Fetch related items from other collections
const related = await items.query('RelatedCollection', {
  filter: { parentField: item.title },
});
---
```

### What Every Detail Page Must Include

1. **Back link** — navigation back to listing page (use translated text with directional arrow)
2. **Hero area** — image, title, status badge
3. **Full description** — untruncated content
4. **Metadata card** — structured key-value pairs (stats, dates, attributes) in labeled rows
5. **Related items** — links to connected entities from other collections, shown only when present

### Cross-Entity Linking

When entities reference each other, create bidirectional links. For example:
- **Event detail** links to venue detail AND speaker profiles
- **Venue detail** links to upcoming events at that venue
- **Speaker detail** links to events they're presenting at

Display referenced entities with small image previews and names. For multiple people (e.g., team members assigned to a project), use an avatar stack — overlapping circular thumbnails.

### Conditional Sections

Only render related-items sections when there are items to show. Don't show empty headers or containers.

## Translations

- **All user-visible text** must use `t()` — page titles, subtitles, labels, metadata labels, empty states
- **Status values** from CMS are English strings — map them to translation keys rather than displaying raw values
- **Units and abbreviations** must be translation keys, not hardcoded
- **Back links** should use translated text with directional arrows in the translation string (flips for RTL)

## Updating items via REST (seed scripts)

To PATCH a single CMS item (e.g. backfill a missing image after a fresh generation), use `wix-data v2 PUT`:

```javascript
// 1. Fetch the item by slug (filter inside the query)
const r = await wixFetch('/wix-data/v2/items/query', {
  method: 'POST',
  body: JSON.stringify({
    dataCollectionId: 'Artworks',
    query: { filter: { slug: 'lacemaker' }, cursorPaging: { limit: 1 } },
  }),
});
const item = r.dataItems[0];
// item shape: { id, dataCollectionId, data: { _id, slug, ... } }
// `item.id` and `item.data._id` are both present and equal.

// 2. PUT the merged data back
await wixFetch(`/wix-data/v2/items/${item.id}`, {
  method: 'PUT',
  body: JSON.stringify({
    dataCollectionId: 'Artworks',
    dataItem: {
      id: item.id,
      dataCollectionId: 'Artworks',
      data: { ...item.data, image: newWixImageUri },
    },
  }),
});
```

The wrapper `id` and nested `data._id` must match. Pass `dataItem: { id, dataCollectionId, data: { ...existing, _id: id, ...changes } }`. Identifiers on the query response: `item.id` at the wrapper level, `item.data._id` nested.
