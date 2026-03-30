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

const result = await posts.queryPosts({
  fieldsets: ['URL', 'RICH_CONTENT', 'METRICS', 'CONTACT_ID', 'REFERENCE_ID']
}).eq('language', currentLanguage).find();
const blogPosts = result.items || [];  // Note: .items not .posts

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

⛔ **Breaks at runtime** — `getPostBySlug` throws `POST_NOT_FOUND` for invalid slugs (e.g. `.js.map` files hitting `[slug].astro`). Always wrap in try/catch and redirect.

⛔ **Breaks at runtime** — The SDK `Post` type does NOT include `metrics`, so accessing `post.metrics` without extending the type causes TypeErrors. Extend it:
```typescript
type Post = posts.Post & { metrics?: posts.Metrics };
```

## Tags

⛔ **Breaks at runtime** — `queryTags` is a direct async function, NOT a query builder. Chaining `.find()` throws a TypeError. → Call `await tagsApi.queryTags({})` directly without `.find()`.

```typescript
import { tags as tagsApi } from '@wix/blog';

// CORRECT
const tagsResult = await tagsApi.queryTags({});
const allTags = tagsResult.tags || [];  // Note: .tags, not .items

// WRONG — throws "queryTags(...).find is not a function"
await tagsApi.queryTags({}).find(); // ❌
```

**Create tags via REST:**
```
POST https://www.wixapis.com/blog/v3/tags
Body: { "label": "My Tag", "language": "en" }
```

## Creating/Updating Blog Posts (REST API)

**Create (bulk):** `POST https://www.wixapis.com/blog/v3/bulk/draft-posts/create`
```json
{
  "draftPosts": [{
    "title": "My Post",
    "memberId": "<member-guid>",
    "tagIds": ["<tag-guid>"],
    "richContent": { "nodes": [...] },
    "media": {
      "wixMedia": { "image": { "id": "<media-id>", "width": 1792, "height": 1024 } },
      "displayed": true, "custom": true
    }
  }],
  "publish": true,
  "fieldsets": ["URL"]
}
```

**Update (bulk):** `PATCH https://www.wixapis.com/blog/v3/draft-posts/update`
```json
{
  "draftPosts": [{ "draftPost": { "id": "<post-id>", "memberId": "<id>", "tagIds": [...], "richContent": {...} } }],
  "action": "UPDATE_PUBLISH"
}
```

⚠️ **Common mistake** — The action enum is `UPDATE_PUBLISH` (not `UPDATE_AND_PUBLISH`). Using the wrong value silently fails to publish. → Use `"action": "UPDATE_PUBLISH"` exactly.

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

⚠️ **Common mistake** — The server-side `getPostBySlug` returns cached preview for everyone. Only the client-side re-fetch with the member's browser session can return the full content if they have a valid subscription. → Re-fetch client-side with `PremiumContentResolver` for logged-in members.

💡 **Best practice** — `post.preview` is a boolean. `post.pricingPlanIds` contains the plan IDs the post is gated behind.

## Rich Content (Ricos) Rendering

```tsx
"use client";
import React from "react";
import { quickStartViewerPlugins, RicosViewer } from "@wix/ricos";
import "@wix/ricos/css/all-plugins-viewer.css";

const plugins = quickStartViewerPlugins();
const RichContentViewer = ({ content }: { content: any }) => {
  return <RicosViewer content={content} plugins={plugins} />;
};
export default RichContentViewer;
```

In Astro: `<RichContentViewer content={post.richContent} client:load />`

⚠️ **Common mistake** — Ricos renders with light-theme (black text), so text is invisible on dark backgrounds. → Override text colors on the Ricos container using `:global()` CSS selectors:
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

1. **Tag filter bar** — horizontal scrollable pill buttons showing only real tags from the blog (do NOT add a hardcoded "All" tab). All posts visible by default with no tag active. Clicking an active tag deselects it to show all posts.
2. **Featured post** — first visible card spans full width with image on one side, content on the other
3. **Post cards in grid** — `repeat(auto-fill, minmax(340px, 1fr))` responsive grid
4. **Each card must show:**
   - Cover image (from `post.coverMedia?.image` or `post.media`)
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

⛔ **Breaks at runtime** — Wrap `getPostBySlug` in try/catch because it throws `POST_NOT_FOUND` for invalid slugs (e.g., `.js.map` files hitting `[slug].astro`).

### Rich Content Color Override

Ricos renders with light-theme (black text) by default. If your site uses a dark background, override text colors on the Ricos container using `:global()` selectors targeting `span`, `div`, `p`, `h2`, and `blockquote` elements.

## Members / Writers

Resolve blog post writers by fetching member profiles with `members.getMember(memberId, { fieldsets: ['FULL'] })` — see [AUTHENTICATION.md](AUTHENTICATION.md) for full member API details (profile fields, update patterns, `getCurrentMember` vs `getMember` wrapping differences).

**Create members via REST:**
```
POST https://www.wixapis.com/members/v1/members
Body: { "member": { "loginEmail": "writer@example.com", "contact": { "firstName": "Captain", "lastName": "Whiskers" }, "profile": { "nickname": "Captain Whiskers", "title": "Ship Captain" } } }
```

## Ricos Rich Content JSON Structure

```json
{
  "nodes": [
    { "type": "PARAGRAPH", "nodes": [{ "type": "TEXT", "textData": { "text": "...", "decorations": [] } }], "paragraphData": {} },
    { "type": "HEADING", "nodes": [{ "type": "TEXT", "textData": { "text": "...", "decorations": [] } }], "headingData": { "level": 2 } },
    { "type": "BULLETED_LIST", "nodes": [{ "type": "LIST_ITEM", "nodes": [{ "type": "PARAGRAPH", "nodes": [{ "type": "TEXT", "textData": { "text": "...", "decorations": [] } }], "paragraphData": {} }] }], "bulletedListData": {} },
    { "type": "ORDERED_LIST", "nodes": [...same as bulleted...], "orderedListData": {} },
    { "type": "BLOCKQUOTE", "nodes": [{ "type": "PARAGRAPH", "nodes": [...], "paragraphData": {} }], "blockquoteData": { "indentation": 1 } },
    { "type": "IMAGE", "nodes": [], "imageData": { "containerData": { "width": { "size": "CONTENT" }, "alignment": "CENTER" }, "image": { "src": { "id": "<media-id>" }, "width": 1792, "height": 1024 }, "altText": "..." } }
  ]
}
```

⛔ **Breaks at runtime** — Ricos silently drops nodes with invalid nesting. → Always wrap `TEXT` nodes in `PARAGRAPH` nodes; follow the nesting rules below:
- ALL `TEXT` nodes MUST be wrapped in `PARAGRAPH` nodes
- `BLOCKQUOTE` → `PARAGRAPH` → `TEXT` (never `BLOCKQUOTE` → `TEXT`)
- `LIST_ITEM` → `PARAGRAPH` → `TEXT` (never `LIST_ITEM` → `TEXT`)
- Text decorations: `[{ "type": "BOLD" }]`, `[{ "type": "ITALIC" }]`
- IMAGE nodes use media ID only (no `wix:image://` prefix) in `image.src.id`
