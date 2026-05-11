# Wix Blog - Likes, Comments, Views & Metrics

## Quickstart

The engagement UI is in `snippets/blog/components/BlogEngagement.tsx` (copied via the [BLOG_POSTS.md Quickstart](BLOG_POSTS.md#quickstart--copy-the-snippets)). It already wires up like/unlike on posts AND comments, pre-populates likes via `queryLikes()` on mount, handles visitor-name fallback for non-members, nested replies, edit/delete own, and like-per-comment.

⚠️ **One-time setup before comments work** — disable Wix's default `SMART/NEEDS_MANUAL_APPROVAL` moderation rule. See "One-time setup: disable the default AI spam moderation rule" below.

This reference is the *why* — the moderation gotcha, view-tracking via `httpClient.fetchWithAuth` to `/blog/v3/posts/{postId}/view`, metrics shape, and the like-toggle SDK.

## Likes (Client-Side React)

The same FQDN (`wix.blog.v3.post`) and Likes API works for both **posts** and **comments/replies**.

```typescript
import { likes } from '@wix/blog';
const FQDN = "wix.blog.v3.post";

// Load ALL likes by current visitor on mount (posts + comments in one call)
const res = await likes.queryLikes({ cursorPaging: { limit: 100 } });
const likedEntityIds = new Set((res.likes ?? []).map(l => l.entityId).filter(Boolean));
const postIsLiked = likedEntityIds.has(postId);
// likedEntityIds also contains comment IDs the visitor liked

// Like a post or comment
await likes.createLike({ like: { fqdn: FQDN, entityId: entityId } });

// Unlike a post or comment
await likes.deleteLikeByFqdnAndEntityId({ fqdn: FQDN, entityId: entityId });

// Check single entity
const res = await likes.getLikeByFqdnAndEntityId({ fqdn: FQDN, entityId: entityId });
```

Pre-populate liked state from `queryLikes()` on mount and track locally — `createLike` throws `ALREADY_EXISTS` for already-liked entities.

`queryLikes()` only returns likes created via the API, not likes set through the Wix Blog dashboard UI.

## Comments

```typescript
import { comments as commentsApi } from '@wix/comments';
const BLOG_APP_ID = "14bcded7-0066-7c35-14d7-466cb3f09103";
```

### One-time setup: disable the default "AI spam moderation" rule

New Wix sites ship with an `AI spam moderation` Moderation Rule (`namespace: "comments/14bcded7-...", audience.type: "MEMBERS_AND_VISITORS", trigger.type: "SMART", action.type: "NEEDS_MANUAL_APPROVAL"`) that holds every submitted comment in the moderation queue. Disable it as part of comments setup so visitors don't have to wait on an admin approval that may never come.

**Disable via Moderation Rules API** ([docs](https://dev.wix.com/docs/api-reference/crm/community/feedback-moderation/moderation-rules/introduction)):

```http
# 1. List rules in the blog-comments namespace to find the AI rule.
POST https://www.wixapis.com/moderation/v1/rules/query
Body: { "query": { "filter": { "namespace": "comments/14bcded7-0066-7c35-14d7-466cb3f09103" } } }

# Response includes rule.id + rule.revision. The default is named "AI spam moderation".

# 2. PATCH the rule to disable it. The `enabled: false` payload is enough; revision is required.
PATCH https://www.wixapis.com/moderation/v1/rules/{rule.id}
Body: { "rule": { "id": "{rule.id}", "revision": "{rule.revision}", "enabled": false } }
```

The Moderation Rules API also covers Wix Reviews — same shape, namespace `reviews/{APP_NAME}`. If the site has a Wix Reviews integration, the equivalent rule should be disabled too.

Disabling the rule applies to new comments only — already-pending comments stay in the queue until approved in the dashboard or published per-id via `commentsApi.publishComment`.

### Listing Comments

```typescript
const res = await commentsApi.listCommentsByResource(BLOG_APP_ID, {
  contextId: post.referenceId,   // ⛔ must be referenceId, not _id
  resourceId: post.referenceId,  // ⛔ must be referenceId, not _id
  commentSort: { order: "OLDEST_FIRST" },
  replySort: { order: "OLDEST_FIRST" },
  cursorPaging: { limit: 50, repliesLimit: 20 },
});
const topLevelComments = res.comments || [];
```

Include `repliesLimit` in `cursorPaging` to fetch nested replies — without it, `commentReplies` returns empty.

Pass `post.referenceId` (from the `REFERENCE_ID` fieldset on `getPostBySlug`) as both `contextId` and `resourceId`. The Comments API keys off `referenceId`, not the post `_id`.

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

💡 **Best practice:** For "replying to" labels, resolve `parentComment.author.memberId` against your fetched member-profile map (see "Member Comments" below). Visitor parents have only `visitorId` and no display name — fall back to a generic "Visitor" label.

### Creating Comments & Replies

```typescript
import { posts } from '@wix/blog';

const helloNodes: posts.Node[] = [{
  type: posts.NodeType.PARAGRAPH,
  nodes: [{ type: posts.NodeType.TEXT, textData: { text: "Hello", decorations: [] } }],
  paragraphData: {},
}];

// Top-level comment
const created = await commentsApi.createComment({
  appId: BLOG_APP_ID,
  contextId: post.referenceId,
  resourceId: post.referenceId,
  content: { richContent: { nodes: helloNodes } },
});

// Reply to a comment (same API, add parentComment)
const reply = await commentsApi.createComment({
  appId: BLOG_APP_ID,
  contextId: post.referenceId,
  resourceId: post.referenceId,
  parentComment: { _id: parentCommentId },
  content: { richContent: { nodes: helloNodes } },
});
```

`Comment.author` is `@immutable` and populated server-side from the calling identity (`memberId` or `visitorId`). The `CommentAuthor` type carries identity fields only — no `authorName` and no field for a visitor-supplied display name.

If the site needs named comments from everyone, set the comments-app permission to `MEMBER` and route anonymous visitors through the `PERMISSION_DENIED` handler below to log in.

💡 **Sort orders are SDK enums.** Use `commentsApi.Order.OLDEST_FIRST` and `commentsApi.ReplySortOrder.OLDEST_FIRST` for `commentSort` / `replySort` — not the literal strings. `'OLDEST_FIRST'` compiles via `OrderWithLiterals` but breaks the day Wix renames an enum value.

### Permission Denied (403) Handling

The comments API may return `PERMISSION_DENIED` if the site requires members to be logged in to comment. Handle this gracefully:

```typescript
type WixSdkError = Error & {
  details?: { applicationError?: { code?: string } };
};

function isPermissionDenied(e: unknown): boolean {
  const err = e as WixSdkError | undefined;
  return err?.details?.applicationError?.code === 'PERMISSION_DENIED' ||
    (err instanceof Error && err.message.includes('Permission denied'));
}

try {
  await commentsApi.createComment({ /* ... */ });
} catch (e) {
  if (isPermissionDenied(e)) {
    // Show login prompt instead of comment form
    setLoginRequired(true);
  }
}
```

Check `e?.details?.applicationError?.code === 'PERMISSION_DENIED'` — the SDK error doesn't carry an HTTP status code.

**Background:** Comment permissions are controlled by the Comments Category service (`wix.comments.v1.category`) which has `permissionsSettings.createComment.role` set to `ALL`, `MEMBER`, or `ADMIN`. The blog implements a `CommentsContextHost` SPI that resolves these into per-user boolean permissions. This SPI is internal and not accessible from headless — so the best approach is to handle the error at the point of failure rather than pre-checking permissions.

### Edit & Delete

```typescript
await commentsApi.updateComment(commentId, {
  revision: comment.revision,
  content: { richContent: { nodes: helloNodes } },
});

await commentsApi.deleteComment(commentId);
```

### Key Gotchas

Comments are eventually consistent. After creating, load comments immediately and retry after 2 seconds if the new comment isn't in the response.

The `rating` field on comments is fixed at the system default (3) — the public API doesn't let consumers set it, so a rating input has no effect.

**Comment author info:** `comment.author` has only `memberId | visitorId | userId`. Resolve member display names by fetching profiles (see "Member Comments" below). For visitor comments, render "Visitor" — the SDK has no field for a visitor's chosen display name.
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

// Display: use member nickname + photo if available, generic label for visitors.
// Note: comment.author has only memberId | visitorId | userId — there is no
// authorName. Visitor names cannot be passed in via createComment (see "Don't pass
// author" rule above). For visitor comments, render a generic placeholder.
const memberId = comment.author?.memberId;
const profile = memberId ? profiles.get(memberId) : undefined;
const displayName = profile?.nickname || "Visitor";
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

💡 **Best practice:** Apply the same logged-in/visitor pattern consistently to BOTH the top-level comment form AND all reply forms. Every reply form must check `isLoggedIn` and show the member indicator instead of the name input when true.

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

Use `auth.getTokenInfo()` with elevation in the Astro frontmatter to get the current visitor/member `subjectId`. Pass it to the engagement component so own comments are recognized on page load (not just after creating a new comment).

```astro
---
import { auth } from '@wix/essentials';

let currentIdentityId: string | undefined;
try {
  const elevatedGetTokenInfo = auth.elevate(auth.getTokenInfo);
  const tokenInfo = await elevatedGetTokenInfo();
  currentIdentityId = tokenInfo.subjectId;
} catch {}
---

<BlogEngagement identityId={currentIdentityId} ... client:load />
```

In the component, initialize the identity state with the prop:

```typescript
const [myVisitorId, setMyVisitorId] = useState<string | null>(identityId || null);
```

The `subjectId` from `getTokenInfo` matches `comment.author.visitorId` or `comment.author.memberId`, so `isOwnComment()` works immediately on page load. Still capture identity from `createComment` responses as a fallback for visitors who haven't been identified yet.

`auth.getTokenInfo` needs `auth.elevate` to return the visitor/member identity — calling it unelevated returns the app-level identity instead.


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
  identityId={currentIdentityId}
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

- On mount, call `likes.queryLikes({ cursorPaging: { limit: 100 } })` to get ALL liked entity IDs (posts + comments)
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

For metrics, use `queryPosts` — `listPosts` returns zeros for the `METRICS` fieldset in managed headless:

```typescript
const result = await posts.queryPosts(
  {},
  { fieldsets: ['URL', 'RICH_CONTENT', 'METRICS', 'CONTACT_ID', 'REFERENCE_ID'] },
);
const blogPosts = result.posts || [];
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

Import `httpClient` from `"@wix/essentials"` — the `/http-client` subpath isn't a valid entry point.

## Comment Permissions Architecture

The Wix Comments system uses a layered permission model:

1. **Comments Category** (`@wix/comments` → `categories`): Stores role-based settings (`permissionsSettings.createComment.role`: `ALL`/`MEMBER`/`ADMIN`) per app. However, in managed headless, querying categories may not return the actual blog-configured setting.

2. **CommentsContextHost SPI** (internal): The blog implements `GetCommentContext` which resolves per-user boolean permissions (`create_comment: true/false`) based on the caller's identity. This is an internal service not accessible from headless SDK.

3. **Best approach for headless**: Don't pre-check permissions. Let the user attempt the action and handle `PERMISSION_DENIED` errors gracefully by showing a login prompt.
