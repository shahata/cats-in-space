---
name: wix-headless
description: Use when building or working on Wix managed headless projects. Covers scaffolding, Astro + Wix SDK patterns, CMS collections, image handling, dynamic routes, deployment, Wix Blog (posts, tags, likes, comments, rich content/ricos, writers/members, metrics). Trigger on Wix headless, headless site, Wix CMS, Wix Astro, wix managed, wix SDK data queries, Wix Blog, ricos, blog posts.
---

# Wix Managed Headless - Developer Guide

## Project Setup

### Scaffolding

**Non-interactive (preferred):**
```bash
npm create @wix/new@latest headless -- \
  --business-name "My Business" \
  --project-name myfolder \
  --site-template-id 212b41cb-0da6-4401-9c72-7c579e6477a2
```

| Flag | Description |
|------|-------------|
| `--business-name` | Name shown in your Wix sites list |
| `--project-name` | Local directory name (3-20 chars, lowercase letters and numbers only — rename after creation if needed) |
| `--site-template-id` | Template UUID |

**Interactive:**
```bash
npm create @wix/new@latest headless
```

The scaffold creates an **Astro** project with Wix integrations pre-configured.

### Key Files

| File | Purpose |
|------|---------|
| `wix.config.json` | Contains `appId` and `siteId` — links local project to Wix |
| `astro.config.mjs` | Astro config with `wix()`, `wixPages()`, `react()` integrations |
| `.env.local` | Client ID, secret, public key, cloud provider setting |
| `.wix/topology.json` | Production URLs |

### CLI Commands

```bash
npm run dev        # wix dev — local dev server with hot reload
npm run build      # wix build — production build
npm run preview    # wix preview — deploy a preview (unique URL each time)
npm run release    # wix release — deploy to production
npm run generate   # wix generate — code generation
```

## Astro + Wix SDK

### Authentication is Automatic

In a Wix managed headless project, you do **NOT** need to create an SDK client or handle OAuth. The `@wix/astro` integration handles all authentication. Just import SDK modules and use them directly:

```astro
---
import { items } from '@wix/data';

const result = await items.query('MyCollection').find();
const myItems = result.items;
---
```

### Data Item Shape

**CRITICAL:** Items returned from `items.query().find()` have fields **directly on the object**, NOT nested under `.data`.

```typescript
// CORRECT
const result = await items.query('Planets').find();
result.items[0].title      // ✅
result.items[0].slug       // ✅
result.items[0]._id        // ✅

// WRONG — .data does NOT exist in managed headless SDK
result.items[0].data.title  // ❌ TypeError
```

### Query API

```typescript
import { items } from '@wix/data';

// Basic query
const result = await items.query('CollectionId').find();

// With sorting
await items.query('Planets').descending('habitabilityScore').find();

// With filtering
await items.query('Planets').eq('status', 'Top Candidate').find();

// With limit
await items.query('CatExplorers').limit(4).find();

// Combined
await items.query('Missions')
  .eq('planet', 'Purrion-7')
  .descending('launchDate')
  .limit(10)
  .find();
```

### Result Shape

```typescript
result.items        // Array of items
result.totalCount   // Total count (if requested)
result.hasNext()    // Whether there are more pages
```

### Installing SDK Packages

```bash
npm install @wix/data       # CMS data operations
npm install @wix/members    # Members API
npm install @wix/stores     # Stores API
```

## CMS Collections

### Creating Collections (via REST API / MCP)

**Endpoint:** `POST https://www.wixapis.com/wix-data/v2/collections`

```json
{
  "collection": {
    "id": "Planets",
    "displayName": "Planets",
    "displayField": "title",
    "fields": [
      { "key": "title", "displayName": "Title", "type": "TEXT", "required": true },
      { "key": "slug", "displayName": "Slug", "type": "TEXT", "required": true },
      { "key": "description", "displayName": "Description", "type": "TEXT" },
      { "key": "image", "displayName": "Image", "type": "IMAGE" },
      { "key": "score", "displayName": "Score", "type": "NUMBER" }
    ],
    "permissions": {
      "insert": "ADMIN",
      "update": "ADMIN",
      "remove": "ADMIN",
      "read": "ANYONE"
    }
  }
}
```

### Field Types

| Type | Description | Example Value |
|------|-------------|---------------|
| `TEXT` | String | `"Hello World"` |
| `NUMBER` | Numeric | `99.99` |
| `BOOLEAN` | True/false | `true` |
| `DATE` | Date only | `"2024-01-15"` |
| `DATETIME` | Date and time | `{ "$date": "2024-01-15T10:00:00.000Z" }` |
| `IMAGE` | Image reference | `"wix:image://v1/..."` |
| `URL` | Web URL | `"https://example.com"` |
| `RICH_TEXT` | HTML content | `"<p>Rich text</p>"` |
| `ARRAY_STRING` | Array of strings | `["tag1", "tag2"]` |
| `OBJECT` | JSON object | `{"key": "value"}` |
| `REFERENCE` | Single reference | Item ID string |
| `MULTI_REFERENCE` | Multiple references | Array of IDs |

### Inserting Data

**Single:** `POST https://www.wixapis.com/wix-data/v2/items`
```json
{
  "dataCollectionId": "Planets",
  "dataItem": {
    "data": { "title": "Purrion-7", "slug": "purrion-7", "habitabilityScore": 92 }
  }
}
```

**Bulk:** `POST https://www.wixapis.com/wix-data/v2/bulk/items/insert`
```json
{
  "dataCollectionId": "Planets",
  "dataItems": [
    { "data": { "title": "Planet A", "slug": "planet-a" } },
    { "data": { "title": "Planet B", "slug": "planet-b" } }
  ],
  "returnEntity": true
}
```

### Partial Update (Patch)

`POST https://www.wixapis.com/wix-data/v2/bulk/items/patch`
```json
{
  "dataCollectionId": "Planets",
  "patches": [
    {
      "dataItemId": "item-guid",
      "fieldModifications": [
        { "fieldPath": "image", "action": "SET_FIELD", "setFieldOptions": { "value": "wix:image://v1/mediaId/file.png#originWidth=1024&originHeight=1024" } }
      ]
    }
  ]
}
```

**IMPORTANT:** Use `patches` array with `fieldModifications`, NOT `dataItems`. Wrong shape = `WDE0080` error.

## Images / Media

### Upload to Wix Media Manager

`POST https://www.wixapis.com/site-media/v1/files/import`
```json
{ "url": "https://example.com/image.png", "mimeType": "image/png", "displayName": "my-image.png" }
```

Returns `file.url` (wixstatic.com) — usable immediately even while `operationStatus` is `PENDING`.

### Wix Image Format in CMS

IMAGE fields store: `wix:image://v1/{mediaId}/{filename}#originWidth={w}&originHeight={h}`

### Converting for Display

```typescript
function getImageUrl(wixImage: string | undefined, width = 800, height = 800): string | null {
  if (!wixImage) return null;
  if (wixImage.startsWith('http')) return wixImage;
  const match = wixImage.match(/^wix:image:\/\/v1\/([^/]+)\//);
  if (!match) return null;
  const mediaId = match[1];
  return `https://static.wixstatic.com/media/${mediaId}/v1/fill/w_${width},h_${height},al_c,q_80/${mediaId}`;
}
```

```astro
{getImageUrl(planet.image) && (
  <img src={getImageUrl(planet.image, 600, 450)!} alt={planet.title} />
)}
```

## Dynamic Routes

Use Astro's `[slug].astro` pattern — no `getStaticPaths()` needed since `output: "server"`:

```astro
---
import { items } from '@wix/data';
const { slug } = Astro.params;
const result = await items.query('Planets').eq('slug', slug).find();
if (result.items.length === 0) return Astro.redirect('/planets');
const planet = result.items[0];
---
<h1>{planet.title}</h1>
```

## Deployment

| Command | Purpose |
|---------|---------|
| `npm run preview` | Deploy preview (unique URL each time) |
| `npm run release` | Deploy to production |

Hosted on Wix servers via Cloudflare. Production URL: `https://your-site-name.wix-host.com`.

## Wix Blog

### Setup

1. Install the Blog app on the site via REST API:
   ```
   POST https://www.wixapis.com/apps-installer-service/v1/app-instance/install
   Body: { "tenant": { "tenantType": "SITE", "id": "<SITE_ID>" }, "appInstance": { "appDefId": "14bcded7-0066-7c35-14d7-466cb3f09103" } }
   ```

2. Install SDK packages:
   ```bash
   npm install @wix/blog        # Posts, tags, likes, draft posts
   npm install @wix/comments     # Comments on blog posts
   npm install @wix/members      # Member/writer profiles
   npm install @wix/ricos        # Rich content viewer (React)
   ```

### Reading Blog Posts (Server-Side Astro)

```astro
---
import { posts, tags as tagsApi } from '@wix/blog';
import { members } from '@wix/members';

// List posts with all metadata
const result = await posts.listPosts({
  fieldsets: ['URL', 'RICH_CONTENT', 'METRICS', 'CONTACT_ID']
});
const blogPosts = result.posts || [];

// Available fieldsets: URL, CONTENT_TEXT, METRICS, SEO, CONTACT_ID, RICH_CONTENT, REFERENCE_ID
// CONTACT_ID gives: memberId (the writer)
// REFERENCE_ID gives: referenceId (needed for comments API)

// **CRITICAL:** METRICS fieldset on listPosts returns ZEROS in managed headless.
// Use getPostMetrics() per post instead:
const metricsMap = new Map();
await Promise.all(blogPosts.map(async (post) => {
  try {
    const m = await posts.getPostMetrics(post._id!);
    metricsMap.set(post._id!, m.metrics); // { views, likes, comments }
  } catch {}
}));

// Get single post by slug (include REFERENCE_ID for comments)
const res = await posts.getPostBySlug('my-slug', {
  fieldsets: ['RICH_CONTENT', 'URL', 'METRICS', 'CONTACT_ID', 'REFERENCE_ID']
});
const post = res.post;

// Post object has: _id, title, slug, firstPublishedDate, coverMedia, richContent,
//                  tagIds, memberId, metrics, excerpt, referenceId, etc.
---
```

### Tags

**CRITICAL:** `queryTags` is a direct async function, NOT a query builder. Do NOT chain `.find()`.

```typescript
import { tags as tagsApi } from '@wix/blog';

// CORRECT
const tagsResult = await tagsApi.queryTags({});
const allTags = tagsResult.tags || [];  // Note: .tags, not .items

// WRONG — will throw "queryTags(...).find is not a function"
const tagsResult = await tagsApi.queryTags({}).find(); // ❌
```

**Create tags via REST:**
```
POST https://www.wixapis.com/blog/v3/tags
Body: { "label": "My Tag", "language": "en" }
```

### Creating/Updating Blog Posts (REST API)

**Create (bulk):** `POST https://www.wixapis.com/blog/v3/bulk/draft-posts/create`
```json
{
  "draftPosts": [
    {
      "title": "My Post",
      "memberId": "<member-guid>",
      "tagIds": ["<tag-guid>"],
      "richContent": { "nodes": [...] },
      "media": {
        "wixMedia": { "image": { "id": "<media-id>", "width": 1792, "height": 1024 } },
        "displayed": true, "custom": true
      }
    }
  ],
  "publish": true,
  "fieldsets": ["URL"]
}
```

**Update (bulk):** `PATCH https://www.wixapis.com/blog/v3/draft-posts/update`
```json
{
  "draftPosts": [
    { "draftPost": { "id": "<post-id>", "memberId": "<member-id>", "tagIds": [...], "richContent": {...}, "media": {...} } }
  ],
  "action": "UPDATE_PUBLISH"
}
```

**CRITICAL:** The action enum is `UPDATE_PUBLISH` (not `UPDATE_AND_PUBLISH`).

### Rich Content (Ricos) Rendering

Use `@wix/ricos` for rendering blog post rich content in React:

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

In Astro, use with `client:load`:
```astro
<RichContentViewer content={post.richContent} client:load />
```

**CRITICAL:** Ricos renders with default light-theme (black text). On dark backgrounds, override with CSS:
```css
.post-content :global(span),
.post-content :global(div),
.post-content :global(p) {
  color: var(--text-secondary) !important;
}
.post-content :global(h2), .post-content :global(h2 *) {
  color: var(--accent) !important;
}
.post-content :global(blockquote) {
  /* structural styles only on blockquote itself */
}
.post-content :global(blockquote *) {
  /* color only on children — avoids duplicating border-left */
  color: var(--text-primary) !important;
}
```

### Likes (Client-Side React)

The same FQDN (`wix.blog.v3.post`) and Likes API works for both **posts** and **comments/replies**.

```typescript
import { likes } from '@wix/blog';

const FQDN = "wix.blog.v3.post";

// Load ALL likes by current visitor on mount (posts + comments in one call)
const res = await likes.queryLikes().limit(100).find();
const likedEntityIds = new Set(res.items.map(l => l.entityId).filter(Boolean));
const postIsLiked = likedEntityIds.has(postId);
// likedEntityIds also contains comment IDs the visitor liked

// Like a post or comment
await likes.createLike({ like: { fqdn: FQDN, entityId: entityId } });

// Unlike a post or comment
await likes.deleteLikeByFqdnAndEntityId({ fqdn: FQDN, entityId: entityId });

// Check single entity
const res = await likes.getLikeByFqdnAndEntityId({ fqdn: FQDN, entityId: entityId });
```

**CRITICAL:** `getLikeByFqdnAndEntityId` and `deleteLikeByFqdnAndEntityId` take a single **object** `{ fqdn, entityId }`, NOT positional arguments.

**CRITICAL:** `createLike` will throw `ALREADY_EXISTS` if the visitor already liked. Use `queryLikes()` on mount to pre-populate liked state, then track locally.

**CRITICAL:** `queryLikes()` only returns likes created via the API, NOT likes from the Wix Blog UI.

### Comments (Client-Side React)

```typescript
import { comments as commentsApi } from '@wix/comments';

const BLOG_APP_ID = "14bcded7-0066-7c35-14d7-466cb3f09103";

// List comments for a post — use referenceId, NOT post._id
const res = await commentsApi.listCommentsByResource(BLOG_APP_ID, {
  contextId: post.referenceId,   // CRITICAL: referenceId, not _id
  resourceId: post.referenceId,  // CRITICAL: referenceId, not _id
  commentSort: { order: "OLDEST_FIRST" },
  replySort: { order: "OLDEST_FIRST" },
  cursorPaging: { limit: 50, repliesLimit: 20 },  // CRITICAL: repliesLimit required to get replies
});
const topLevelComments = res.comments || [];
// Replies are in res.commentReplies (Map<parentId, { replies: Comment[] }>)
```

**CRITICAL: `cursorPaging.repliesLimit`** is required to get replies. Without it, only top-level comments are returned and `commentReplies` is empty.

#### Reply Threading

The API groups ALL replies under the **top-level comment's ID** in `commentReplies`, not under their actual parent. To build a proper thread tree:

```typescript
// 1. Collect all replies from commentReplies + flat list
const allReplies = [];
for (const replyData of Object.values(res.commentReplies || {})) {
  allReplies.push(...(replyData.replies || []));
}
// Also check flat list for replies mixed in
for (const c of allComments) {
  if (c.parentComment?._id) allReplies.push(c);
}

// 2. Deduplicate by ID
const seen = new Set();
const unique = allReplies.filter(r => {
  const id = r._id || r.id;
  if (seen.has(id)) return false;
  seen.add(id);
  return true;
});

// 3. Regroup by ACTUAL parentComment._id (not top-level comment)
const repliesMap = {};
for (const r of unique) {
  const parentId = r.parentComment?._id || r.parentComment?.id;
  if (!repliesMap[parentId]) repliesMap[parentId] = [];
  repliesMap[parentId].push(r);
}
// Now repliesMap[commentId] gives direct replies to that comment
// Render recursively for nested threading
```

**CRITICAL:** `parentComment.author.authorName` contains the actual parent author name for "replying to" labels.

#### Creating Comments

```typescript
// Top-level comment (use REST via fetchWithAuth — SDK strips some fields)
const res = await httpClient.fetchWithAuth(
  "https://www.wixapis.com/comments/v1/comments",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      comment: {
        appId: BLOG_APP_ID,
        contextId: post.referenceId,
        resourceId: post.referenceId,
        author: { authorName: "Visitor Name" },
        content: { richContent: { nodes: [{ type: "PARAGRAPH", nodes: [{ type: "TEXT", textData: { text: "Hello", decorations: [] } }], paragraphData: {} }] } },
      },
    }),
  }
);
const created = (await res.json()).comment;
// REST returns 'id', SDK uses '_id' — normalize: if (created.id && !created._id) created._id = created.id;

// Reply to a comment
await commentsApi.createComment({
  appId: BLOG_APP_ID,
  contextId: post.referenceId,
  resourceId: post.referenceId,
  author: { authorName: "Visitor Name" },
  parentComment: { _id: parentCommentId },  // makes it a reply
  content: { richContent: { nodes: [...] } },
} as any);

// Edit a comment
await commentsApi.updateComment(commentId, {
  revision: comment.revision,
  content: { richContent: { nodes: [...] } },
} as any);

// Delete a comment
await commentsApi.deleteComment(commentId);
```

**CRITICAL:** For Wix Blog comments, use the post's `referenceId` (NOT `_id`) for `contextId` and `resourceId`. Get it via `REFERENCE_ID` fieldset.

**CRITICAL:** Guest display names use `author: { authorName: "Name" }` on the Comment object. The `CommentAuthor` type in the SDK doesn't show it, so cast with `as any`.

**CRITICAL:** After creating a comment, the API has **eventual consistency**. Call `loadComments()` immediately but pass an expected count — if the new comment isn't returned yet, retry after 2 seconds.

**Comment author info is on:** `comment.author.authorName`
**Comment text is on:** `comment.content.richContent.nodes` (extract TEXT nodes from PARAGRAPH nodes)

**CRITICAL:** The `rating` field on comments is **NOT controllable** through the public API. Both `createComment` and `updateComment` ignore the `rating` parameter. The field is always set to a system default (3) by Wix internally. Do NOT build rating input UI for comments.

#### Visitor Identity for Own-Comment Detection

There is **no reliable client-side API** to get a visitor's ID before they interact. `auth.getTokenInfo()` is backend-only, `members.getCurrentMember()` is members-only.

Approach: capture `visitorId` from the `createComment` response (`comment.author.visitorId`), then match against `comment.author.visitorId` on other comments to show Edit/Delete buttons only on own comments. Buttons only appear after the visitor's first interaction in the session.

### Post Metrics

```typescript
import { posts } from '@wix/blog';

// Works both server-side and client-side
const res = await posts.getPostMetrics(postId);
// res.metrics = { views: number, likes: number, comments: number }
```

**CRITICAL:** The `METRICS` fieldset on `listPosts` returns **zeros** in managed headless context. Always use `getPostMetrics(postId)` per post to get real counts.

### Reporting Post Views (Client-Side)

There is an **undocumented** endpoint to increment blog post views:

```
POST https://www.wixapis.com/blog/v3/posts/{postId}/view
Returns: { "views": <new_count> }
```

Use `httpClient.fetchWithAuth` from `@wix/essentials` for authenticated calls:

```tsx
"use client";
import { httpClient } from "@wix/essentials";

// Call on component mount to report a view
async function reportView(postId: string) {
  try {
    await httpClient.fetchWithAuth(
      `https://www.wixapis.com/blog/v3/posts/${postId}/view`,
      { method: "POST" }
    );
  } catch {}
}
```

**CRITICAL:** Import `httpClient` from `"@wix/essentials"` (main module), NOT from `"@wix/essentials/http-client"` (subpath import fails Vite build).

**CRITICAL:** Use `httpClient.fetchWithAuth` (not `httpClient.request`) — it's a fetch wrapper that adds Wix auth headers automatically. Works in client-side React components in managed headless.

### Members / Writers

```typescript
import { members } from '@wix/members';

// Get member profile
const res = await members.getMember(memberId, { fieldsets: ['FULL'] });
const member = res.member;
// member.profile.nickname, member.profile.title, member.contact.firstName
```

**Create members via REST:**
```
POST https://www.wixapis.com/members/v1/members
Body: {
  "member": {
    "loginEmail": "writer@example.com",
    "contact": { "firstName": "Captain", "lastName": "Whiskers" },
    "profile": { "nickname": "Captain Whiskers", "title": "Ship Captain" }
  }
}
```

### Ricos Rich Content JSON Structure

Common node types for blog post content:

```json
{
  "nodes": [
    { "type": "PARAGRAPH", "nodes": [{ "type": "TEXT", "textData": { "text": "...", "decorations": [] } }], "paragraphData": {} },
    { "type": "HEADING", "nodes": [{ "type": "TEXT", "textData": { "text": "...", "decorations": [] } }], "headingData": { "level": 2 } },
    { "type": "BULLETED_LIST", "nodes": [{ "type": "LIST_ITEM", "nodes": [{ "type": "PARAGRAPH", "nodes": [{ "type": "TEXT", "textData": { "text": "...", "decorations": [] } }], "paragraphData": {} }] }], "bulletedListData": {} },
    { "type": "ORDERED_LIST", "nodes": [...same as bulleted...], "orderedListData": {} },
    { "type": "BLOCKQUOTE", "nodes": [{ "type": "PARAGRAPH", "nodes": [...] , "paragraphData": {} }], "blockquoteData": { "indentation": 1 } },
    { "type": "IMAGE", "nodes": [], "imageData": { "containerData": { "width": { "size": "CONTENT" }, "alignment": "CENTER" }, "image": { "src": { "id": "<media-id>" }, "width": 1792, "height": 1024 }, "altText": "..." } }
  ]
}
```

**CRITICAL Ricos rules:**
- ALL `TEXT` nodes MUST be wrapped in `PARAGRAPH` nodes inside their parent containers
- `BLOCKQUOTE` → `PARAGRAPH` → `TEXT` (never `BLOCKQUOTE` → `TEXT`)
- `LIST_ITEM` → `PARAGRAPH` → `TEXT` (never `LIST_ITEM` → `TEXT`)
- Text decorations: `[{ "type": "BOLD" }]`, `[{ "type": "ITALIC" }]`
- IMAGE nodes use media ID only (no `wix:image://` prefix) in `image.src.id`

## Tips & Gotchas

1. **No `.data` wrapper** — SDK query results have fields directly on items
2. **Server-rendered by default** — `output: "server"` means all pages are SSR
3. **Auth is automatic** — don't create SDK clients manually
4. **IMAGE fields need conversion** — `wix:image://` URLs must be parsed for `<img>` tags
5. **Bulk patch uses `patches`** — not `dataItems` (WDE0080 error)
6. **MULTI_REFERENCE** — cannot be set via insert/update/patch, use dedicated reference endpoints
7. **Dev server port** — defaults to 4321, auto-increments if busy
8. **`static.wixstatic.com`** — already in `astro.config.mjs` image domains
