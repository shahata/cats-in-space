# SEO Tags for Dynamic Pages

## SDK Package

```bash
npm install @wix/seo
```

```typescript
import { seoTags as seoTagsApi } from '@wix/seo';
```

## How It Works

Wix provides SEO tags (title, meta description, Open Graph, JSON-LD structured data, canonical URLs, etc.) for dynamic pages. There are two ways to get them depending on the page type:

### 1. `resolveItemSeoTags` — for supported item types

This generates the **complete** set of SEO tags for a page, including site-level defaults, Open Graph, and JSON-LD structured data. Use this whenever the item type is supported.

**Supported item types:** only three — `STORES_PRODUCT`, `BOOKINGS_SERVICE`, `STORES_CATEGORY`. Use `seoTagsApi.ItemType` enum members; the SDK type accepts other strings, but they return zero tags at runtime.

```typescript
import { seoTags as seoTagsApi } from '@wix/seo';

const pageUrl = new URL(`/store/${slug}`, Astro.url).href;
const seoResult = await seoTagsApi.resolveItemSeoTags({
  pageUrl,
  itemType: seoTagsApi.ItemType.STORES_PRODUCT,  // ✅ enum, not 'STORES_PRODUCT' string
  slug,
});
const seoTags = seoResult.seoTags?.tags ?? [];
```


### 2. `seoData` on the item object — for other types

Some SDK items (e.g., blog posts) carry a `seoData` property with per-item SEO overrides. These only contain tags the user explicitly set in Wix — not the full generated set.

```typescript
// Blog posts — requires the 'SEO' fieldset
const result = await posts.getPostBySlug(slug, {
  fieldsets: [
    posts.PostFieldField.RICH_CONTENT,
    posts.PostFieldField.URL,
    posts.PostFieldField.METRICS,
    posts.PostFieldField.CONTACT_ID,
    posts.PostFieldField.REFERENCE_ID,
    posts.PostFieldField.SEO,
  ],
});
const seoTags = result.post?.seoData?.tags ?? [];
```

**Important:** For blog posts, you must include `posts.PostFieldField.SEO` in the `fieldsets` array — `seoData` is not returned by default.

Blog `seoData.tags` currently emits only JSON-LD — no `og:*`, `twitter:*`, or canonical link. Render whatever Wix returns and let the platform fill in the rest centrally; hand-rolling OG tags will diverge once Wix adds `BLOG_POST` support to `resolveItemSeoTags`.

### Pages without SEO support

CMS collection pages (custom data collections), events, restaurants, and member pages do not have SDK SEO support. For these, rely on the `title` and `description` props passed to the Layout.

## Rendering SEO Tags in the Layout

The `Layout.astro` component accepts an optional `seoTags` prop. When provided, it renders all non-disabled tags into `<head>`, suppressing the default `<title>` and `<meta name="description">` to avoid duplicates.

### Passing seoTags to Layout

```astro
<Layout title={`${product.name} - ${t('home.title')}`} seoTags={seoTags}>
```

Always pass a fallback `title` — it's used when no SEO title tag exists.

### Layout implementation

The Layout uses the `Tag` type from `@wix/seo`:

```typescript
import type { seoTags as seoTagsNs } from '@wix/seo';
type Tag = seoTagsNs.Tag;
```

Render tags generically — use `tag.type` as the element name, `tag.props` as the attributes, `tag.children` as the inner content. Branching per tag type drops `<base>`, future types, and JSON-LD `type` attributes that live on `tag.props`:

```typescript
function renderSeoTag(tag: Tag): string {
  const attrs = Object.entries(tag.props || {})
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`)
    .join(' ');
  const attrStr = attrs ? ` ${attrs}` : '';
  if (tag.children !== undefined && tag.children !== null) {
    return `<${tag.type}${attrStr}>${tag.children}</${tag.type}>`;
  }
  return `<${tag.type}${attrStr} />`;
}
```

This handles every tag type (`title`, `meta`, `link`, `script` including JSON-LD, `base`, and anything Wix adds later) with zero branching. If Wix returns a tag, it gets rendered faithfully.

Default `<title>` and `<meta name="description">` are conditionally rendered only when no SEO tag provides them:

```astro
---
const activeSeoTags = (seoTags || []).filter((tag) => !tag.disabled);
const hasSeoTitle = activeSeoTags.some((tag) => tag.type === 'title');
const hasSeoDescription = activeSeoTags.some(
  (tag) => tag.type === 'meta' && (tag.props as Record<string, unknown> | undefined)?.name === 'description'
);
---
{!hasSeoTitle && <title>{title}</title>}
{!hasSeoDescription && <meta name="description" content={description} />}
{activeSeoTags.map((tag) => <Fragment set:html={renderSeoTag(tag)} />)}
```

## Quick Reference: Which pages get which SEO method

| Page | Item type | Method |
|------|-----------|--------|
| `/store/[slug]` | `STORES_PRODUCT` | `resolveItemSeoTags()` |
| `/bookings/[slug]` | `BOOKINGS_SERVICE` | `resolveItemSeoTags()` |
| `/blog/[slug]` | Blog post | `post.seoData.tags` (with `'SEO'` fieldset) |
| `/tickets/[slug]` | Event | No SDK SEO — use `title` prop only |
| `/restaurant/[slug]` | Menu item | No SDK SEO — use `title` prop only |
| `/cms-item/[slug]` | CMS item | No SDK SEO — use `title` prop only |
| `/member/[slug]` | Member | No SDK SEO — use `title` prop only |

## Quick reference

- Import the `Tag` type from `@wix/seo` (via the `seoTags` namespace) — don't define a local mirror.
- `resolveItemSeoTags` returns the full tag set (site defaults + OG + JSON-LD + canonical). `item.seoData` only carries per-item overrides.
- Blog posts need the `SEO` fieldset on the request for `seoData` to populate.
- Filter `disabled: true` tags before rendering.
