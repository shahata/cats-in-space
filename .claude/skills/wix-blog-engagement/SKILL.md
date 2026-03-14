---
name: wix-blog-engagement
description: Wix Blog engagement features - likes, comments, replies, views, metrics. Covers client-side React components for interactive blog features. Trigger on blog likes, blog comments, blog views, blog metrics, comment replies, blog engagement, wix comments API, wix likes API.
---

# Wix Blog - Likes, Comments, Views & Metrics

## Likes (Client-Side React)

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

**CRITICAL:** `createLike` will throw `ALREADY_EXISTS` if already liked. Use `queryLikes()` on mount to pre-populate liked state, then track locally.

**CRITICAL:** `queryLikes()` only returns likes created via the API, NOT likes from the Wix Blog UI.

## Comments

```typescript
import { comments as commentsApi } from '@wix/comments';
const BLOG_APP_ID = "14bcded7-0066-7c35-14d7-466cb3f09103";
```

### Listing Comments

```typescript
const res = await commentsApi.listCommentsByResource(BLOG_APP_ID, {
  contextId: post.referenceId,   // CRITICAL: referenceId, not _id
  resourceId: post.referenceId,  // CRITICAL: referenceId, not _id
  commentSort: { order: "OLDEST_FIRST" },
  replySort: { order: "OLDEST_FIRST" },
  cursorPaging: { limit: 50, repliesLimit: 20 },
});
const topLevelComments = res.comments || [];
```

**CRITICAL:** `cursorPaging.repliesLimit` is **required** to get replies. Without it, only top-level comments are returned and `commentReplies` is empty.

**CRITICAL:** Use `referenceId` (NOT `_id`) for `contextId`/`resourceId`. Get it via `REFERENCE_ID` fieldset on `getPostBySlug`/`listPosts`.

### Reply Threading

The API groups ALL replies under the **top-level comment's ID** in `commentReplies`, not under their actual parent. To build a proper thread tree:

```typescript
// 1. Collect all replies from commentReplies + flat list
const allReplies = [];
for (const replyData of Object.values(res.commentReplies || {})) {
  allReplies.push(...(replyData.replies || []));
}
for (const c of allComments) {
  if (c.parentComment?._id) allReplies.push(c);
}

// 2. Deduplicate by ID
const seen = new Set();
const unique = allReplies.filter(r => {
  const id = r._id || r.id;
  return id && !seen.has(id) && seen.add(id);
});

// 3. Regroup by ACTUAL parentComment._id
const repliesMap = {};
for (const r of unique) {
  const parentId = r.parentComment?._id || r.parentComment?.id;
  if (!repliesMap[parentId]) repliesMap[parentId] = [];
  repliesMap[parentId].push(r);
}
// Render recursively: repliesMap[commentId] → direct replies
```

**CRITICAL:** `parentComment.author.authorName` has the actual parent author name for "replying to" labels.

### Creating Comments

```typescript
// Use REST via fetchWithAuth (SDK strips fields like authorName)
import { httpClient } from "@wix/essentials";

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
// REST returns 'id', SDK uses '_id' — normalize if needed
```

### Replies

```typescript
// Reply to a comment (SDK works for replies)
await commentsApi.createComment({
  appId: BLOG_APP_ID,
  contextId: post.referenceId,
  resourceId: post.referenceId,
  author: { authorName: "Visitor Name" },
  parentComment: { _id: parentCommentId },  // makes it a reply
  content: { richContent: { nodes: [...] } },
} as any);
```

### Edit & Delete

```typescript
await commentsApi.updateComment(commentId, {
  revision: comment.revision,
  content: { richContent: { nodes: [...] } },
} as any);

await commentsApi.deleteComment(commentId);
```

### Key Gotchas

**CRITICAL:** Guest display names use `author: { authorName: "Name" }`. SDK types don't include it — cast with `as any`.

**CRITICAL:** After creating, the API has **eventual consistency**. Load comments immediately but retry after 2 seconds if the new comment isn't in the response.

**CRITICAL:** The `rating` field on comments is **NOT controllable** through the public API. Always set to system default (3). Do NOT build rating input UI.

**Comment author info:** `comment.author.authorName`
**Comment text:** `comment.content.richContent.nodes` (extract TEXT from PARAGRAPH nodes)

### Member Comments

Comments by logged-in members have `comment.author.memberId`. Fetch their profile to show real name:

```typescript
import { members } from '@wix/members';

// Collect memberIds from comments, fetch profiles
const memberIds = new Set(comments.filter(c => c.author?.memberId).map(c => c.author!.memberId!));
const profiles = new Map();
for (const id of memberIds) {
  try {
    const m = await members.getMember(id, { fieldsets: ['FULL'] });
    profiles.set(id, { nickname: m.profile?.nickname, title: m.profile?.title });
  } catch {}
}

// Display: use member nickname if available, fall back to authorName
const memberId = comment.author?.memberId;
const profile = memberId ? profiles.get(memberId) : undefined;
const displayName = profile?.nickname || comment.author?.authorName || "Space Visitor";
```

### Visitor Identity for Own-Comment Detection

No reliable client-side API to get visitor ID before interaction. `auth.getTokenInfo()` is backend-only, `members.getCurrentMember()` is members-only.

Approach: capture `visitorId` from `createComment` response (`comment.author.visitorId`), match against comments to show Edit/Delete only on own comments. Use `myVisitorId` in element keys to force re-render when identity changes.

### Authentication (Login/Logout)

Wix Astro middleware provides auth endpoints:
- **Login:** `<a href="/api/auth/login">` — redirects to Wix login page
- **Logout:** `<form action="/api/auth/logout" method="POST">` — POST handler, use a form not a link
- **Detect login state server-side:** `members.getCurrentMember()` returns `{ member }` if logged in, throws if not

```astro
---
import { members } from '@wix/members';
let loggedIn = false;
try {
  const res = await members.getCurrentMember({ fieldsets: ['FULL'] });
  if (res.member) loggedIn = true;
} catch {}
---
```

**CRITICAL:** `getCurrentMember()` returns `{ member?: Member }` (wrapped), NOT `Member` directly. Check `res.member`.

## Post Metrics

```typescript
import { posts } from '@wix/blog';
const res = await posts.getPostMetrics(postId);
// res.metrics = { views: number, likes: number, comments: number }
```

**CRITICAL:** `METRICS` fieldset on `listPosts` returns **zeros** in managed headless. Use `queryPosts` instead — it returns real metrics including comments:

```typescript
// queryPosts returns real metrics (views, likes, comments), listPosts returns zeros
const result = await posts.queryPosts({ fieldsets: ['URL', 'RICH_CONTENT', 'METRICS', 'CONTACT_ID', 'REFERENCE_ID'] }).find();
const blogPosts = result.items || [];
// post.metrics.views, post.metrics.likes, post.metrics.comments — all populated correctly
// No need for per-post getPostMetrics or separate comment counting
```

## Reporting Post Views

Undocumented endpoint to increment views:

```typescript
import { httpClient } from "@wix/essentials";

await httpClient.fetchWithAuth(
  `https://www.wixapis.com/blog/v3/posts/${postId}/view`,
  { method: "POST" }
);
// Returns: { "views": <new_count> }
```

**CRITICAL:** Import `httpClient` from `"@wix/essentials"` (main module), NOT from `"@wix/essentials/http-client"` (subpath fails Vite build).

## Source Code References

- Comment service proto: https://github.com/wix-private/catalyst-server/blob/master/comments/comments-ng/proto/wix/comments/ng/v1/comments_ng.proto
- Comment entity proto: https://github.com/wix-private/catalyst-server/blob/master/comments/comments-ng/proto/wix/comments/ng/v1/comment.proto
- Comments middleware proto: https://github.com/wix-private/catalyst-server/blob/master/comments/comments-middleware/proto/wix/comments/middleware/v1/comments_middleware.proto

### Comment Reactions (Internal)

Reactions (like `:like:`) are managed by the comments middleware, NOT the public Comments API. The middleware endpoints (`/_api/comments-middleware/v1/comment/{id}/reactions/:like:`) are INTERNAL and not accessible in managed headless via `fetchWithAuth`. The `_api` path is a site-level proxy only available on the site's own domain, not on `wixapis.com`.

For comment likes in headless, use the blog Likes API (`likes.createLike` with `fqdn: "wix.blog.v3.post"`) as a workaround.

### Comment Rating (Internal)

The `rating` field on comments is `readOnly` in the public API. It's set through the middleware's `CreateCommentRequest.rating_action` (internal). Do NOT build rating input UI.
