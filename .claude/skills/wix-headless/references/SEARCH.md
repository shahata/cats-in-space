# Wix Site Search — Managed Headless Guide

This reference covers building a site-wide search page that hits products, posts, services, events, etc. through a single Wix API.

## Overview

`@wix/search` exposes two namespaces — pick the right one or you'll spend an hour debugging permissions:

| Namespace | FQN | When it works | When it 403s |
|---|---|---|---|
| `siteSearch` | `wix.search.v1.SiteSearchService` | **Use this in headless.** Public visitor-facing search. `federatedSearch()` returns all document types in one call. | When the Wix Site Search app isn't installed on the site (returns `results: []` rather than 403, see below). |
| `wixSiteSearch` | `wix.search.platformized.v1.SiteSearchPlatformizedService` | Per-document-type call (`search({ ... }, { documentType: ... })`). | Returns **403 with empty body** for headless OAuth clients — requires `SEARCH.SITE_DOCUMENT_READ` scope with `applicableIdentity: APP`, which the standard headless OAuth client does not have. `auth.elevate(...)` does NOT fix this. |

**Bottom line:** import `{ siteSearch }` from `@wix/search` and call `siteSearch.federatedSearch(...)`. Don't reach for `wixSiteSearch.search` even though the public Wix docs centre on it — it's the wrong API for managed headless.

## Prerequisite — install the Wix Site Search app

Without the app installed, `federatedSearch` resolves successfully but returns `{ results: [] }` for every query — silent empty index. Symptom: search UI never renders results, no errors anywhere.

The app is NOT installed by default on new headless sites. Install it once via the apps installer:

```bash
TOKEN=$(npx wix token | head -1)
SITE_ID=$(node -e "console.log(require('./wix.config.json').siteId)")
curl -X POST 'https://www.wixapis.com/apps-installer-service/v1/app-instance/install' \
  -H "Authorization: $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{
    \"tenant\": { \"tenantType\": \"SITE\", \"id\": \"$SITE_ID\" },
    \"appInstance\": { \"appDefId\": \"1484cb44-49cd-5b39-9681-75188ab429de\" }
  }"
```

`1484cb44-49cd-5b39-9681-75188ab429de` is the Wix Site Search `appDefId` — confirmed via the App Market Listings search endpoint (`POST /devcenter/app-market-listing/v1/market-listings/search` with `{"searchTerm":"Site Search"}`). The basicInfo.name is "Wix Site Search".

After install, the index starts populating across all the supported content types. No code change needed in the search page — it already works the moment the index is ready.

## The federatedSearch call

```ts
import { siteSearch } from "@wix/search";
import { i18n } from "@wix/essentials";

const res = await siteSearch.federatedSearch({
  query: q,              // user's search expression
  language: i18n.getLanguage(),
  limit: 20,             // per documentType
  fuzzy: true,           // forgives typos
});
// res.results: { documentType, documents, total }[]
```

No `auth.elevate(...)` wrapper needed — this is a public-visitor API and elevation just adds latency.

## Document types come back as path strings

This is the single biggest gotcha. The Wix docs and the `wixSiteSearch.DocumentType` enum advertise `STORES_PRODUCTS`, `BLOG_POSTS`, `BOOKING_SERVICES`, `EVENTS`. The `siteSearch.federatedSearch` response uses **path-style identifiers** instead:

| Enum (docs) | Actual `bucket.documentType` string |
|---|---|
| `STORES_PRODUCTS` | `public/stores/products` |
| `BLOG_POSTS` | `public/blog/posts` |
| `BOOKING_SERVICES` | `public/bookings/services` |
| `EVENTS` | `public/events/events` |
| `FORUM_CONTENT` | `public/forum/content` |
| `PROGALLERY_ITEM` | `public/pro-gallery/items` |
| (site pages) | `public/site/pages` |

Map by the string, not the enum. A typeMeta table keyed by the wrong values silently classifies everything as "unknown" and falls through to a generic badge — code passes type checks, page renders, results have no category.

## Document payload shape

`bucket.documents[]` items are `Record<string, any>`. Common fields by type:

```ts
// public/stores/products
{
  _id, _score, _updated, _createdDate,
  title,                  // product name
  description,            // plain-text description
  url,                    // "/product-page/<slug>" — Wix-rendered route
  documentImage: { name, height, width },  // name = wix media id like "4975b6_abc~mv2.png"
  inStock, onSale, ribbon, brand, sku, skus,
  collections: string[],  // category names
  currency, discountedPrice, discountedPriceNumeric,
  textOptionsFacets: [{ name, value }, ...],
  colorOptionsFacets: [...],
  optionChoicesSearchData,
  infoSections: [...]
}

// public/blog/posts
{
  _id, _score, _updated, _highlights,  // _highlights wraps matches in <mark>
  title, description,
  url,                    // "/post-1/<slug>"
  documentImage: { name, ... }  // name is a FULL https URL for blog posts
}

// public/events/events
{
  _id, _score, _updated, _highlights,
  title, description,
  url,                    // "/event-details/<slug>-YYYY-MM-DD-HH-MM" (per-showtime)
  documentImage: { name, ... },
  eventType, location, startDate,
  minPrice, maxPrice, currency
}

// public/site/pages
{
  _id, _score, _updated, _highlights,
  title, description,
  url,                    // page route as Wix would render it
  documentImage: null
}
```

The `documentImage.name` field is **either** a Wix media id (`4975b6_xxx~mv2.png`) OR a full https URL. Blog posts ship the URL form; products and events ship the media id. Handle both:

```ts
function docImage(doc: Record<string, unknown>): string | null {
  const di = doc.documentImage as { name?: string } | undefined;
  if (!di?.name) return null;
  if (di.name.startsWith("http")) return di.name;
  return getImageUrl(`wix:image://v1/${di.name}/file.jpg`, 200, 200);
}
```

## URL rewriting — the index returns Wix routes, not Astro routes

The `url` field is whatever URL the equivalent Wix-rendered site would serve. In a managed-headless Astro project those routes don't exist — you have your own `/store/<slug>`, `/blog/<slug>`, etc. **Every documentType needs a `rewriteUrl` step** that extracts the slug and rebuilds the Astro route:

```ts
const lastSlug = (url: string) =>
  url.split("/").filter(Boolean).pop() ?? "";

const typeMeta: Record<string, {
  label: string;
  badgeClass: string;
  rewriteUrl: (url: string) => string | null;
}> = {
  "public/stores/products": {
    label: t("nav.store"),
    badgeClass: "badge-green",
    rewriteUrl: (u) => `/store/${lastSlug(u)}`,
  },
  "public/blog/posts": {
    label: t("nav.blog"),
    badgeClass: "badge-pink",
    rewriteUrl: (u) => `/blog/${lastSlug(u)}`,
  },
  "public/bookings/services": {
    label: t("nav.bookings"),
    badgeClass: "badge-blue",
    rewriteUrl: (u) => `/bookings/${lastSlug(u)}`,
  },
  "public/events/events": {
    label: t("nav.cinema"),
    badgeClass: "badge-gold",
    // Strip Wix's recurring-showtime datetime suffix
    // (cat-ablanca-2026-05-22-20-00 → cat-ablanca) so all showtimes for a
    // movie collapse to a single Astro /cinema/<series-slug>.
    rewriteUrl: (u) =>
      `/cinema/${lastSlug(u).replace(/-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}(-\d+)?$/, "")}`,
  },
};
```

**Drop document types that don't have an Astro route.** Most headless projects should skip `public/site/pages` entirely — those URLs (e.g. `/experience-details`, `/menus`) are Wix-rendered pages that 404 in the Astro project. Skipping unknown types is one line:

```ts
for (const bucket of res.results ?? []) {
  const meta = typeMeta[bucket.documentType ?? ""];
  if (!meta) continue;  // skip unmapped types entirely
  // ...
}
```

## Event recurrence dedup

The Events index stores one document per recurring showtime, so a movie with 12 weekly screenings shows up as 12 cards with near-identical titles. The Wix-side slug carries a `-YYYY-MM-DD-HH-MM` suffix per occurrence; strip it (see the `rewriteUrl` above) and then dedupe by the rewritten Astro URL:

```ts
const seenHrefs = new Set<string>();
for (const d of docs) {
  const href = meta.rewriteUrl(pickStr(d, "url"));
  if (!href || seenHrefs.has(href)) continue;
  seenHrefs.add(href);
  out.push({ /* ... */ });
}
```

## What's NOT covered by federatedSearch

Site Search indexes the Wix-managed content types listed above. It does **not** cover:

- **CMS data items** (custom collections via `@wix/data`) — federatedSearch returns nothing for `Planets`, `CatExplorers`, etc.
- **Wix Restaurants menu items** (`@wix/restaurants` items) — separate service, not indexed.
- **Pricing plans, donations** — not in the federated index.

For these, query the per-app SDK in parallel with the federatedSearch call. CMS data items support `$contains` on text fields:

```ts
await items.query("Planets", {
  filter: { title: { $contains: q } },
  paging: { limit: 20 },
});
```

`$contains` is per-field, so to search multiple fields fan out one query per field and merge results by `_id`. Restaurant items have no contains operator; fetch up to ~200 with `cursorPaging` and filter in memory.

## Diagnosing empty results / 403s

Symptom-to-cause map:

| Symptom | Cause |
|---|---|
| `wixSiteSearch.search` returns 403 with empty `applicationError.description` | Wrong API for headless — switch to `siteSearch.federatedSearch` |
| `siteSearch.federatedSearch` returns `{ results: [] }` for every query | Wix Site Search app not installed on the site — see "Prerequisite" |
| federatedSearch returns results but URLs 404 in the Astro app | Missing `rewriteUrl` mapping — search index ships Wix-rendered URLs |
| All results render with the same generic badge / "Other" label | `typeMeta` keyed by enum names (`STORES_PRODUCTS`) instead of path strings (`public/stores/products`) |
| Cinema/events show duplicate cards per movie | Missing dedup by rewritten URL after stripping the datetime suffix |
| Image broken on blog post results | `documentImage.name` is a full URL for blog posts but a media id elsewhere — handle both |

To inspect what's actually coming back without polluting the log with spinner output, dump to a tmp file from inside the page and inspect with `node -e`:

```ts
const fs = await import("node:fs/promises");
await fs.writeFile("/tmp/search-debug.json", JSON.stringify(res, null, 2));
```

```bash
node -e "const r=require('/tmp/search-debug.json'); console.log(r.results.map(b=>({type:b.documentType,total:b.total,sample:Object.keys(b.documents[0]||{})})))"
```

## Putting it together

A complete search page (server-rendered Astro):

1. Read `?q=` from `Astro.url.searchParams`.
2. Call `siteSearch.federatedSearch({ query: q, language: i18n.getLanguage(), limit: 20, fuzzy: true })`.
3. For each `bucket` in `res.results`, look up `typeMeta[bucket.documentType]`. Skip unmapped types.
4. For each `doc` in `bucket.documents`: build href via `meta.rewriteUrl(doc.url)`, dedup by href, extract title/description/image.
5. (Optional) In parallel, run `items.query("<CMS collection>", { filter: { <field>: { $contains: q } } })` for any custom collections not in the federated index.
6. Render groups with the type's label and badge class.

The whole search page is ~120 lines of frontmatter + Promise.all. The infrastructure work — installing the app, fighting the 403, discovering the path-style doc types, rewriting URLs — is what eats the day, and is what this doc exists to skip.
