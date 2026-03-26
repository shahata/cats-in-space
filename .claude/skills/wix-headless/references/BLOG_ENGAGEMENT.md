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

### Creating Comments & Replies

```typescript
// Top-level comment
const created = await commentsApi.createComment({
  appId: BLOG_APP_ID,
  contextId: post.referenceId,
  resourceId: post.referenceId,
  author: (isLoggedIn ? {} : { authorName: "Visitor Name" }) as commentsApi.CommentAuthor,
  content: { richContent: { nodes: [{ type: "PARAGRAPH", nodes: [{ type: "TEXT", textData: { text: "Hello", decorations: [] } }], paragraphData: {} }] } },
});

// Reply to a comment (same API, add parentComment)
const reply = await commentsApi.createComment({
  appId: BLOG_APP_ID,
  contextId: post.referenceId,
  resourceId: post.referenceId,
  author: (isLoggedIn ? {} : { authorName: "Visitor Name" }) as commentsApi.CommentAuthor,
  parentComment: { _id: parentCommentId },
  content: { richContent: { nodes: [...] } },
});
```

**CRITICAL:** Guest display names use `author: { authorName: "Name" }`. SDK types don't include it — cast with `as commentsApi.CommentAuthor`.

**CRITICAL:** When logged in, send empty `author: {}` — the server uses the member identity automatically.

### Permission Denied (403) Handling

The comments API may return `PERMISSION_DENIED` if the site requires members to be logged in to comment. Handle this gracefully:

```typescript
function isPermissionDenied(e: any): boolean {
  return e?.details?.applicationError?.code === 'PERMISSION_DENIED' ||
    e?.message?.includes('Permission denied');
}

try {
  await commentsApi.createComment({ ... });
} catch (e: any) {
  if (isPermissionDenied(e)) {
    // Show login prompt instead of comment form
    setLoginRequired(true);
  }
}
```

**CRITICAL:** The SDK error has `details.applicationError.code === 'PERMISSION_DENIED'`, NOT an HTTP status code. The error message is `"Permission denied: UNKNOWN"`.

**Background:** Comment permissions are controlled by the Comments Category service (`wix.comments.v1.category`) which has `permissionsSettings.createComment.role` set to `ALL`, `MEMBER`, or `ADMIN`. The blog implements a `CommentsContextHost` SPI that resolves these into per-user boolean permissions. This SPI is internal and not accessible from headless — so the best approach is to handle the error at the point of failure rather than pre-checking permissions.

### Edit & Delete

```typescript
await commentsApi.updateComment(commentId, {
  revision: comment.revision,
  content: { richContent: { nodes: [...] } },
} as any);

await commentsApi.deleteComment(commentId);
```

### Key Gotchas

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

// Display: use member nickname + photo if available, fall back to authorName
const memberId = comment.author?.memberId;
const profile = memberId ? profiles.get(memberId) : undefined;
const displayName = profile?.nickname || comment.author?.authorName || "Space Visitor";
const photo = profile?.photo; // member.profile.photo.url
```

### Comment Form for Logged-in Members

When the user is logged in, hide the name input and show their identity instead. Pass member info from the Astro page:

```astro
---
// In [slug].astro — detect current member
let currentMemberName: string | undefined;
let currentMemberPhoto: string | undefined;
try {
  const res = await members.getCurrentMember({ fieldsets: ['FULL'] });
  if (res.member) {
    currentMemberName = res.member.profile?.nickname || res.member.contact?.firstName || 'Member';
    currentMemberPhoto = res.member.profile?.photo?.url || undefined;
  }
} catch {}
---
<BlogEngagement postId={post._id!} referenceId={post.referenceId!}
  memberName={currentMemberName} memberPhoto={currentMemberPhoto} client:load />
```

In the React component:
- If `memberName` prop is set → show "Commenting as **Name**" (or "Replying as **Name**") with avatar, hide name input
- If not → show the name text input for visitors
- When logged in, send empty `author: {}` — the server uses the member identity automatically

**CRITICAL:** Apply the same logged-in/visitor pattern consistently to BOTH the top-level comment form AND all reply forms. Every reply form (including replies on top-level comments, not just nested replies) must check `isLoggedIn` and show the member indicator instead of the name input when true.

### Blog Post Commenting & Preview Flags

```astro
---
// post.commentingEnabled — controls whether comments are allowed
// post.preview — true if content is a premium preview (truncated)
---
<BlogEngagement commentingEnabled={post.commentingEnabled !== false} client:load />
```

- `commentingEnabled === false`: hide comment form and reply buttons, show "Comments are disabled"
- `post.preview === true`: show paywall after truncated content linking to plans page

### Edited Comments

`comment.contentEdited` (boolean) indicates if a comment was edited. Show "(edited)" next to author name.

### Visitor Identity for Own-Comment Detection

No reliable client-side API to get visitor ID before interaction. `auth.getTokenInfo()` is backend-only, `members.getCurrentMember()` is members-only.

Approach: capture `visitorId` from `createComment` response (`comment.author.visitorId`), match against comments to show Edit/Delete only on own comments. Use `myVisitorId` in element keys to force re-render when identity changes.


## Blog Engagement UI Guidelines

### Engagement Component Architecture

Build a single `BlogEngagement` React component (`client:load`) that handles all engagement features. Pass these props from the Astro page:

```tsx
<BlogEngagement
  postId={post._id!}
  referenceId={post.referenceId!}
  commentingEnabled={post.commentingEnabled !== false}
  memberName={currentMemberName}
  memberPhoto={currentMemberPhoto}
  client:load
/>
```

### What the Engagement Component Must Include

1. **Stats bar** — views, likes, comments counts displayed prominently
2. **Like button** — toggles between liked/not-liked state, changes color (accent when liked)
3. **Comment section** with:
   - Comment form (name input for visitors, member identity display for logged-in users)
   - Top-level comment list with author names, timestamps, content
   - Nested reply threads (indent by depth, max ~72px indentation)
   - Reply button on each comment
   - Edit/delete for own comments
   - Like button per comment
   - "Commenting as [Name]" display for logged-in members
   - Login prompt when `PERMISSION_DENIED`

### Likes State Management

- On mount, call `likes.queryLikes().limit(100).find()` to get ALL liked entity IDs (posts + comments)
- Store in a `Set<string>` for O(1) lookup
- Track post like and comment likes separately
- `createLike` throws `ALREADY_EXISTS` — pre-populate state from query, don't just catch

### Comment Threading

The API groups replies under top-level comment ID. Build a proper thread tree:

1. Collect all replies from `commentReplies` + flat list
2. Deduplicate by ID
3. Regroup by actual `parentComment._id`
4. Render recursively with indentation

### Member Profile Resolution

For comments by members, fetch profiles to show real names:

```typescript
const memberIds = new Set(comments.filter(c => c.author?.memberId).map(c => c.author!.memberId!));
const profiles = new Map();
for (const id of memberIds) {
  const m = await members.getMember(id, { fieldsets: ['FULL'] });
  profiles.set(id, { nickname: m.profile?.nickname, photo: m.profile?.photo?.url, slug: m.profile?.slug });
}
```

Link member names to their profile page (`/member/{slug}`).

### Own-Comment Detection

No reliable client-side API for visitor ID before interaction. Capture `visitorId` from `createComment` response and match against existing comments for edit/delete buttons.

### Eventual Consistency

After creating a comment, the API has eventual consistency. Load immediately but retry after 2 seconds if the new comment isn't in the response:

```typescript
const result = await listComments();
if (result.comments.length < expectedCount) {
  setTimeout(async () => {
    const retry = await listComments();
    setComments(retry.comments);
  }, 2000);
}
```

### Translation Keys

All engagement text must be translated:
- `blog.views`, `blog.likes`, `blog.comments` — metric labels
- `blog.likePost`, `blog.liked` — like button states
- `blog.leaveComment`, `blog.sendComment` — comment form
- `blog.reply`, `blog.edit`, `blog.delete`, `blog.cancel` — comment actions
- `blog.commentsDisabled`, `blog.loginRequired` — state messages
- `blog.member`, `blog.visitor` — user type badges
- `blog.edited` — edited comment indicator

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

## Comment Permissions Architecture

The Wix Comments system uses a layered permission model:

1. **Comments Category** (`@wix/comments` → `categories`): Stores role-based settings (`permissionsSettings.createComment.role`: `ALL`/`MEMBER`/`ADMIN`) per app. However, in managed headless, querying categories may not return the actual blog-configured setting.

2. **CommentsContextHost SPI** (internal): The blog implements `GetCommentContext` which resolves per-user boolean permissions (`create_comment: true/false`) based on the caller's identity. This is an internal service not accessible from headless SDK.

3. **Best approach for headless**: Don't pre-check permissions. Let the user attempt the action and handle `PERMISSION_DENIED` errors gracefully by showing a login prompt.
