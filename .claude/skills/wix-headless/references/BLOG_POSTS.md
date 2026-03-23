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

// CRITICAL: Use queryPosts, NOT listPosts — listPosts returns zero metrics in managed headless
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

**CRITICAL:** `getPostBySlug` throws `POST_NOT_FOUND` for invalid slugs (e.g. `.js.map` files hitting `[slug].astro`). Always wrap in try/catch and redirect.

**CRITICAL:** The SDK `Post` type does NOT include `metrics`. Extend it:
```typescript
type Post = posts.Post & { metrics?: posts.Metrics };
```

## Tags

**CRITICAL:** `queryTags` is a direct async function, NOT a query builder. Do NOT chain `.find()`.

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

**CRITICAL:** The action enum is `UPDATE_PUBLISH` (not `UPDATE_AND_PUBLISH`).

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

**CRITICAL:** The server-side `getPostBySlug` returns cached preview for everyone. Only the client-side re-fetch with the member's browser session can return the full content if they have a valid subscription.

**CRITICAL:** `post.preview` is a boolean. `post.pricingPlanIds` contains the plan IDs the post is gated behind.

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

**CRITICAL:** Ricos renders with light-theme (black text). On dark backgrounds, override:
```css
.post-content :global(span), .post-content :global(div), .post-content :global(p) {
  color: var(--text-secondary) !important;
}
.post-content :global(h2), .post-content :global(h2 *) { color: var(--accent) !important; }
.post-content :global(blockquote) { /* structural styles only on blockquote itself */ }
.post-content :global(blockquote *) { color: var(--text-primary) !important; /* color only on children — avoids duplicating border-left */ }
```

## Members / Writers

```typescript
import { members } from '@wix/members';
const res = await members.getMember(memberId, { fieldsets: ['FULL'] });
// member.profile.nickname, member.profile.title, member.contact.firstName
```

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

**CRITICAL Ricos rules:**
- ALL `TEXT` nodes MUST be wrapped in `PARAGRAPH` nodes
- `BLOCKQUOTE` → `PARAGRAPH` → `TEXT` (never `BLOCKQUOTE` → `TEXT`)
- `LIST_ITEM` → `PARAGRAPH` → `TEXT` (never `LIST_ITEM` → `TEXT`)
- Text decorations: `[{ "type": "BOLD" }]`, `[{ "type": "ITALIC" }]`
- IMAGE nodes use media ID only (no `wix:image://` prefix) in `image.src.id`
