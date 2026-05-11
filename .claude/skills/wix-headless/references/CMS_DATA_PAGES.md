# CMS Data Pages — Listing & Detail Implementation Guidelines

## Quickstart — copy the templates

```bash
SKILL=~/.claude/skills/wix-headless/snippets
cp -R "$SKILL/cms/." src/
```

That drops `src/pages/items/{index,[slug]}.astro` as a starting template. **Rename `items` to your collection's domain** (e.g. `planets`, `recipes`, `team`) and swap the SDK collection ID accordingly. The templates already wire up:
- `items.query(collectionId, ...)` with sort + paging
- Image fields via the universal `getImageUrl` helper
- REFERENCE / MULTI_REFERENCE expansion via `items.queryReferenced`
- Locale-aware links via `getRelativeLocaleUrl`

⚠️ **MULTI_REFERENCE values are silently dropped from insert/update/patch** — call `items.replaceReferences(collectionId, fieldKey, referringItemId, ids[])` separately after the main write.

⚠️ **Install the CMS app first** — `apps-installer-service` with `appDefId: "675bbcef-18d8-41f5-800e-131ec9e08762"`.

This reference is the *why* — field types, query/sort/paging, MULTI_REFERENCE write pattern, the difference between SDK and REST item shapes.

## Overview

CMS data pages display content from Wix CMS collections. A good implementation follows a consistent pattern: listing page with cards + detail page with full content. This applies to any custom collection (team members, locations, events, projects, etc.).

The CMS / Wix Data app must be installed before any `/wix-data/v2/*` call works — see [SDK_CORE.md → CMS Collections](SDK_CORE.md#install-the-cms-app) for the install instructions and collection-creation REST API.

## Listing Page

### Feature-Rich CMS Modeling Pattern

CMS pages should model the requested domain with enough structure to feel like an application, not a flat gallery. A good implementation usually has:

- **Primary entities** — the main things visitors browse, with images, summaries, status, ranking/priority, numeric metrics, and detail pages.
- **Supporting entities** — people, places, teams, departments, categories, resources, or organizations connected by references.
- **Activity or relationship entities** — projects, appointments, case studies, assignments, locations, schedules, portfolio items, inventory records, or other records that connect the primary and supporting entities.

For example, a real estate site might use Properties, Agents, and Neighborhoods; a school might use Courses, Teachers, and Programs; a studio might use Classes, Instructors, and Locations. The exact collections should come from the user's requested site, but the UX target is the same: listings show useful metadata, details explain the full record, and references become visible navigation between entities.

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

When the API provides numeric or stateful fields, render them. Do not hide fields like `status`, `rank`, `progress`, `score`, `capacity`, `difficulty`, or `startDate` just because the card already has a title and image. These fields are what make generated sites feel like applications rather than static galleries.

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

### Optional CMS Management Dashboard

If the site includes a custom dashboard page for CMS management, it should manage the same collections that power the public pages. The admin UI should support add, edit, delete, image picking, single references, multi-references, status badges, and refresh.

Dashboard extensions are general backoffice surfaces, not only CMS editors. Use [EXTENSIONS.md](EXTENSIONS.md) for the `@wix/dashboard`, WDS, media picker, side panel, and admin-auth patterns; use `items.replaceReferences()` when that dashboard edits CMS multi-reference fields.

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
