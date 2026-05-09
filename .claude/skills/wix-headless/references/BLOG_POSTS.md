# Wix Blog - Posts, Tags, Writers & Rich Content

## Setup

1. Install the Blog app on the site:
   ```
   POST https://www.wixapis.com/apps-installer-service/v1/app-instance/install
   Body: { "tenant": { "tenantType": "SITE", "id": "<SITE_ID>" }, "appInstance": { "appDefId": "14bcded7-0066-7c35-14d7-466cb3f09103" } }
   ```

2. Install packages:
   ```bash
   npm install @wix/blog @wix/members @wix/ricos
   ```

## Reading Blog Posts (Server-Side Astro)

```astro
---
import { posts, tags as tagsApi } from '@wix/blog';

// ⚠️ Common mistake: Use queryPosts, NOT listPosts — listPosts returns zero metrics in managed headless
// Filter by current language for multilingual sites
import { i18n } from '@wix/essentials';
const currentLanguage = i18n.getLanguage();

const result = await posts.queryPosts(
  { filter: { language: currentLanguage } },
  { fieldsets: ['URL', 'RICH_CONTENT', 'METRICS', 'CONTACT_ID', 'REFERENCE_ID'] },
);
const blogPosts = result.posts || [];

// Available fieldsets: URL, CONTENT_TEXT, METRICS, SEO, CONTACT_ID, RICH_CONTENT, REFERENCE_ID
// CONTACT_ID gives: memberId (the writer)
// REFERENCE_ID gives: referenceId (needed for comments API)

// Get single post by slug
const res = await posts.getPostBySlug('my-slug', {
  fieldsets: ['RICH_CONTENT', 'URL', 'METRICS', 'CONTACT_ID', 'REFERENCE_ID']
});
const post = res.post;
// Post has: _id, title, slug, firstPublishedDate, heroImage, richContent,
//           tagIds, memberId, excerpt, referenceId, media, etc.
// METRICS fieldset adds: metrics.views, metrics.likes, metrics.comments (not in SDK Post type!)
---
```

Wrap `getPostBySlug` in try/catch and redirect on the catch — it throws `POST_NOT_FOUND` for invalid slugs (e.g. `.js.map` files hitting `[slug].astro`).

When requesting the `METRICS` fieldset, extend the `Post` type — the base SDK type doesn't include `metrics`:
```typescript
type Post = posts.Post & { metrics?: posts.Metrics };
```

## Tags

`queryTags` is a direct async — `await` it without `.find()`, and read `.tags` (not `.items`):

```typescript
import { tags as tagsApi } from '@wix/blog';

const tagsResult = await tagsApi.queryTags({});
const allTags = tagsResult.tags || [];
```

For seeding, use the bulk REST endpoints (`POST /blog/v3/tags` for tags; `POST /blog/v3/bulk/draft-posts/create` and `PATCH /blog/v3/draft-posts/update` for posts). The action value on bulk update is `UPDATE_PUBLISH` — anything else is silently treated as a draft-only update.

## Premium/Paid Content (Preview Posts)

Blog posts linked to pricing plans return `preview: true` with truncated content for non-subscribers. The SSR response is cached and returns the preview for everyone.

**Pattern:** For logged-in members, re-fetch client-side to check if they have access:

```tsx
// PremiumContentResolver.tsx — client component
"use client";
import { useEffect, useState } from "react";
import { posts } from "@wix/blog";
import RichContentViewer from "./RichContentViewer";

export default function PremiumContentResolver({ slug, previewContent }) {
  const [content, setContent] = useState(previewContent);
  const [isPreview, setIsPreview] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const result = await posts.getPostBySlug(slug, { fieldsets: ["RICH_CONTENT"] });
        if (result.post && !result.post.preview) {
          setContent(result.post.richContent);
          setIsPreview(false);
        }
      } catch {}
    })();
  }, [slug]);

  return (
    <>
      <div className={isPreview ? "post-preview" : undefined}>
        <RichContentViewer content={content} />
      </div>
      {isPreview && (
        <div className="paywall">/* paywall UI */</div>
      )}
    </>
  );
}
```

In the Astro page:
```astro
{post.preview && currentMemberName ? (
  <!-- Logged in + preview: re-fetch client-side with member session -->
  <PremiumContentResolver slug={slug} previewContent={post.richContent} client:load />
) : (
  <!-- Not logged in or not preview: render server content -->
  <RichContentViewer content={post.richContent} client:load />
  {post.preview && <Paywall />}
)}
```

The server-side `getPostBySlug` response is cached and returns the preview for everyone. Re-fetch client-side via `PremiumContentResolver` for logged-in members — that's the only call that has the member session and can return the full content if they have a valid subscription.

💡 **Best practice** — `post.preview` is a boolean. `post.pricingPlanIds` contains the plan IDs the post is gated behind.

## Rich Content (Ricos) Rendering

```tsx
"use client";
import React from "react";
import { quickStartViewerPlugins, RicosViewer } from "@wix/ricos";
import type { posts } from "@wix/blog";
import "@wix/ricos/css/all-plugins-viewer.css";

const plugins = quickStartViewerPlugins();
const RichContentViewer = ({ content }: { content: posts.RichContent | undefined }) => {
  return <RicosViewer content={content} plugins={plugins} />;
};
export default RichContentViewer;
```

In Astro: `<RichContentViewer content={post.richContent} client:load />`

Ricos renders text with the light-theme black palette. On dark backgrounds, override text colors on the Ricos container with `:global()`:
```css
.post-content :global(span), .post-content :global(div), .post-content :global(p) {
  color: var(--text-secondary) !important;
}
.post-content :global(h2), .post-content :global(h2 *) { color: var(--accent) !important; }
.post-content :global(blockquote) { /* structural styles only on blockquote itself */ }
.post-content :global(blockquote *) { color: var(--text-primary) !important; /* color only on children — avoids duplicating border-left */ }
```

## Blog Page Implementation Guidelines

### Required features for a complete blog

A functional blog MUST include ALL of the following. Do not skip any:

1. **Blog listing page** (`/blog`) — post grid with tag filtering, metrics, writer info
2. **Blog detail page** (`/blog/[slug]`) — rich content, writer profile, metadata
3. **Comments & replies** — full comment system with nested replies, member identity, visitor names, edit/delete own comments. See `references/BLOG_ENGAGEMENT.md` for implementation. Comments are NOT optional — a blog without comments is incomplete.
4. **Likes** — like/unlike on posts and comments, pre-populated from `queryLikes()` on mount
5. **View tracking** — report views on post load via `/blog/v3/posts/{postId}/view`
6. **Premium/paid content** — if the site has pricing plans, support gating blog posts behind subscriptions. Posts with `post.preview === true` show truncated content for non-subscribers. Use a `PremiumContentResolver` component to re-fetch client-side for logged-in members. Show a paywall overlay with a link to the plans page for non-subscribers. See the "Premium/Paid Content" section above for the full pattern.

### Blog Listing Page

A good blog listing page includes:

1. **Tag filter bar** — horizontal scrollable pill buttons. Either pattern works: (a) start with no tag active and let the user toggle a tag on/off, or (b) include a leading "All" pill that's selected by default. Pick one and stick to it; both UX patterns are common and neither is wrong.
2. **Featured post** — first visible card spans full width with image on one side, content on the other
3. **Post cards in grid** — `repeat(auto-fill, minmax(340px, 1fr))` responsive grid
4. **Each card must show:**
   - Cover image (from `post.media?.wixMedia?.image` — the V3 path)
   - Writer name (yellow accent, linked to member profile) + date + read time
   - Post title
   - Tag badges (clickable, filter in-page)
   - Excerpt (extracted from rich content or `post.excerpt`)
   - Stats row: views, likes, comments (from `post.metrics`)
   - "Read more" CTA
   - Pinned indicator for `post.pinned` posts

5. **Writer resolution** — batch-fetch member profiles for all unique `post.memberId` values to show names/photos instead of IDs

### Tag Filtering

Client-side filtering with URL state preservation:
- Store active tag in URL query param (`?tag=tagId`)
- Filter cards by `data-tags` attribute containing comma-separated tag IDs
- After filtering, dynamically assign "featured" class to first visible card
- Show empty state when no posts match

### Metrics Display

Use `queryPosts` (NOT `listPosts`) with `METRICS` fieldset — `listPosts` returns zeros in managed headless.

```typescript
type Post = posts.Post & { metrics?: posts.Metrics };
// post.metrics.views, post.metrics.likes, post.metrics.comments
```

### Blog Detail Page

A good blog detail page includes:

1. **Back link** to blog listing
2. **Hero image** from cover media
3. **Post metadata** — writer (linked), date, read time, tags
4. **Rich content** via `<RichContentViewer content={post.richContent} client:load />`
5. **Premium content handling** — if `post.preview`, use `<PremiumContentResolver>` for logged-in re-fetch
6. **Engagement section** — `<BlogEngagement>` component with likes, comments, replies
7. **Stats** — views/likes/comments displayed prominently
8. **Report view event** — when the page loads, fire a view event so the post's view count increments. See `references/BLOG_ENGAGEMENT.md` → "Reporting Post Views" for the `httpClient.fetchWithAuth` call to `/blog/v3/posts/{postId}/view`. Do this client-side (e.g., in the engagement component's `useEffect`) so each visitor counts

## Members / Writers

Resolve blog post writers by fetching member profiles with `members.getMember(memberId, { fieldsets: ['FULL'] })` — see [AUTHENTICATION.md](AUTHENTICATION.md) for full member API details (profile fields, update patterns, `getCurrentMember` vs `getMember` wrapping differences).

**Create members via REST:**
```
POST https://www.wixapis.com/members/v1/members
Body: { "member": { "loginEmail": "writer@example.com", "contact": { "firstName": "Captain", "lastName": "Whiskers" }, "profile": { "nickname": "Captain Whiskers", "title": "Ship Captain" } } }
```

## Ricos Rich Content

Construct content with `posts.RichContent` and the `posts.NodeType` enum from `@wix/blog`. Nesting rules Ricos enforces (it silently drops nodes that violate them):

- `TEXT` always wraps in `PARAGRAPH` (never `BLOCKQUOTE` → `TEXT` or `LIST_ITEM` → `TEXT`)
- `BLOCKQUOTE` → `PARAGRAPH` → `TEXT`
- `LIST_ITEM` → `PARAGRAPH` → `TEXT`
- `IMAGE` nodes take a bare media id in `image.src.id` (no `wix:image://` prefix)
