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

**Supported item types:** `STORES_PRODUCT`, `BOOKINGS_SERVICE`, `STORES_CATEGORY`

```typescript
import { seoTags as seoTagsApi } from '@wix/seo';

const pageUrl = new URL(`/store/${slug}`, Astro.url).href;
const seoResult = await seoTagsApi.resolveItemSeoTags({
  pageUrl,
  itemType: 'STORES_PRODUCT',
  slug,
});
const seoTags = seoResult.seoTags?.tags || [];
```

### 2. `seoData` on the item object — for other types

Some SDK items (e.g., blog posts) carry a `seoData` property with per-item SEO overrides. These only contain tags the user explicitly set in Wix — not the full generated set.

```typescript
// Blog posts — requires the 'SEO' fieldset
const result = await posts.getPostBySlug(slug, {
  fieldsets: ['RICH_CONTENT', 'URL', 'METRICS', 'CONTACT_ID', 'REFERENCE_ID', 'SEO'],
});
const seoTags = result.post?.seoData?.tags || [];
```

**Important:** For blog posts, you must include `'SEO'` in the `fieldsets` array — `seoData` is not returned by default.

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

Tags are rendered generically using the tag's `type` field as the element name:

```typescript
function renderSeoTag(tag: Tag): string {
  const attrs = Object.entries(tag.props || {})
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`)
    .join(' ');
  const attrStr = attrs ? ` ${attrs}` : '';
  if (tag.children) return `<${tag.type}${attrStr}>${tag.children}</${tag.type}>`;
  return `<${tag.type}${attrStr} />`;
}
```

This handles all tag types (`title`, `meta`, `link`, `script` including JSON-LD) without type-specific branching.

Default `<title>` and `<meta name="description">` are conditionally rendered only when no SEO tag provides them:

```astro
{!hasSeoDescription && <meta name="description" content={description} />}
{!hasSeoTitle && <title>{title}</title>}
{activeSeoTags.map(tag => <Fragment set:html={renderSeoTag(tag)} />)}
```

## Quick Reference: Which pages get which SEO method

| Page | Item type | Method |
|------|-----------|--------|
| `/store/[slug]` | `STORES_PRODUCT` | `resolveItemSeoTags()` |
| `/bookings/[slug]` | `BOOKINGS_SERVICE` | `resolveItemSeoTags()` |
| `/blog/[slug]` | Blog post | `post.seoData.tags` (with `'SEO'` fieldset) |
| `/cinema/[slug]` | Event | No SDK SEO — use `title` prop only |
| `/restaurant/[slug]` | Menu item | No SDK SEO — use `title` prop only |
| `/crew/[slug]` | CMS item | No SDK SEO — use `title` prop only |
| `/missions/[slug]` | CMS item | No SDK SEO — use `title` prop only |
| `/planets/[slug]` | CMS item | No SDK SEO — use `title` prop only |
| `/member/[slug]` | Member | No SDK SEO — use `title` prop only |

## Gotchas

1. **Do NOT define custom `Tag` interfaces** — import the type from `@wix/seo` via `seoTags` namespace.
2. **`resolveItemSeoTags` returns the full tag set** including site-level defaults (OG, JSON-LD, canonical). The `seoData` property on items only contains per-item overrides.
3. **Blog `seoData` requires the `'SEO'` fieldset** — without it the field is not populated.
4. **Filter out disabled tags** — tags with `disabled: true` should not be rendered.
5. **Render tags generically** — use the `type` field as the HTML element name. Do not branch on specific tag types.
